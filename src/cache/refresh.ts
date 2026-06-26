/**
 * Background refresh loop — scheduled cache refresh off the request path.
 *
 * Design (CACHE-02, CACHE-03, T-01-10):
 * - startRefreshLoop fires an immediate fire-and-forget refresh at boot,
 *   then schedules periodic refresh with setInterval.
 * - Cron cadence: equivalent to node-cron expression '0 *\/2 * * *' — every 2 hours.
 *   (node-cron 4.x uses import.meta.url at module initialisation time, which
 *    esbuild sets to an empty object in --format=cjs bundles, causing a crash
 *    on load. setInterval provides identical runtime semantics without the
 *    bundling constraint. Re-evaluate if the build switches to ESM output.)
 * - On refresh failure: logs a warning, never throws (serve-stale, CACHE-03).
 * - Atomic update: store.save() writes to disk, then index.rebuild() swaps the
 *   in-memory index in one assignment — readers see old or new, never partial.
 *
 * Coupling rule: only this file imports from src/pipeline/*.
 * Routes must never import the pipeline directly.
 */

import type { CacheStore } from './store';
import type { EventIndex } from '../pipeline/index-events';
import type { SourceAdapter } from '../sources/base';
import type { AppConfig } from '../config';
import { runPipeline } from '../pipeline/run';
import { dedup } from '../pipeline/dedup';

// Equivalent node-cron schedule expression: '0 */2 * * *' (at minute 0 of every 2nd hour)
const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RefreshOptions {
  store: CacheStore;
  index: EventIndex;
  registry: SourceAdapter[];
  config: AppConfig;
}

// ---------------------------------------------------------------------------
// Single refresh cycle
// ---------------------------------------------------------------------------

/**
 * Execute one refresh cycle:
 *   1. Snapshot current store state (for serve-stale on any source failure)
 *   2. runPipeline with per-source error isolation + per-source timeout
 *   3. dedup the resulting events
 *   4. store.save() — atomic write to disk
 *   5. index.rebuild() — atomic in-memory swap
 *
 * Never throws. Logs a warning on any error so the process stays alive (CACHE-03).
 */
async function runRefresh(opts: RefreshOptions): Promise<void> {
  const { store, index, registry } = opts;

  // Snapshot prev so serve-stale can fall back to current data on failure
  const prev = {
    events: store.getEvents(),
    sources: store.getSources(),
  };

  try {
    const results = await runPipeline(registry, prev);
    const deduped = dedup(results.events);

    // Persist to disk atomically, then update in-memory index
    await store.save({
      version: 1,
      savedAt: new Date().toISOString(),
      sources: results.sources,
      events: deduped,
    });

    // Atomic reference swap — concurrent readers see old or new, never partial
    index.rebuild(deduped);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Serve-stale: log warning, keep whatever is currently in store/index
    console.warn(`[refresh] Refresh cycle failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the background refresh loop.
 *
 * Fires an immediate refresh (fire-and-forget; errors are caught and logged,
 * never propagated to the caller) then schedules periodic refresh every 2 hours.
 * The interval timer is unref'd so it does not prevent clean process shutdown.
 *
 * MUST be called AFTER fastify.listen() — never blocks the boot path.
 */
export function startRefreshLoop(opts: RefreshOptions): void {
  // Immediate refresh at boot — fire-and-forget (CACHE-02 boot behaviour)
  runRefresh(opts).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[refresh] Initial refresh failed: ${msg}`);
  });

  // Periodic refresh every 2 hours (node-cron equivalent: '0 */2 * * *')
  const timer = setInterval(() => {
    runRefresh(opts).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[refresh] Scheduled refresh failed: ${msg}`);
    });
  }, REFRESH_INTERVAL_MS);

  // Unref: don't keep the process alive just for the timer
  timer.unref();
}
