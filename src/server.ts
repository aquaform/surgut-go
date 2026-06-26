/**
 * Application entrypoint — boot-first sequence (DEPLOY-02).
 *
 * Boot order guarantees the Docker healthcheck passes before any live scrape:
 *   1. Load config from env
 *   2. Load CacheStore from disk, or fall back to seed (always succeeds)
 *   3. Build in-memory EventIndex
 *   4. Start Fastify on 0.0.0.0:PORT  ← /health is live from this point
 *   5. Background refresh loop starts  ← NEVER blocks step 4
 *
 * host: '0.0.0.0' is mandatory — Traefik/Dokploy cannot reach 127.0.0.1.
 * (See CLAUDE.md, AGENTS.md, and DEPLOY-01 requirement.)
 */

import { loadConfig } from './config';
import { CacheStore } from './cache/store';
import { buildEventIndex } from './pipeline/index-events';
import { createServer } from './http/server';
import { seedAdapter } from './sources/seed/index';
import { sourceRegistry } from './sources/registry';
import { startRefreshLoop } from './cache/refresh';

async function main(): Promise<void> {
  // Step 1: Load typed config from environment variables
  const config = loadConfig();

  // Step 2: Initialize CacheStore.
  // loadOrSeed() loads the disk cache if present and valid; otherwise populates
  // from the seed adapter (sync-equivalent: seed JSON is in-process, no network).
  // This always succeeds — worst case is 12 seed events.
  const store = new CacheStore(config.cacheDir);
  await store.loadOrSeed(seedAdapter);

  // Step 3: Build in-memory EventIndex from whatever we have (seed or cached data)
  const index = buildEventIndex(store.getEvents());

  // Step 4: Start Fastify — /health is live immediately after listen() resolves.
  // The Docker HEALTHCHECK fires at --start-period=15s, giving us ample time here.
  // host MUST be '0.0.0.0' so Traefik can route (not 127.0.0.1).
  const fastify = createServer({ store, index });
  await fastify.listen({ port: config.port, host: '0.0.0.0' });
  fastify.log.info(`Server ready on port ${config.port}`);

  // Step 5: Background refresh loop (CACHE-02).
  // Called AFTER listen() — never blocks boot. startRefreshLoop is fire-and-forget:
  // it fires an immediate refresh and schedules periodic refresh via node-cron.
  // A refresh failure logs a warning and never crashes the process (serve-stale).
  startRefreshLoop({ store, index, registry: sourceRegistry, config });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
