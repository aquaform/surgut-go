/**
 * CacheStore — durable JSON cache with atomic write, TTL, and seed fallback.
 *
 * Design guarantees (CACHE-01, CACHE-04, T-01-05, T-01-06):
 * - Atomic write: events.json.tmp → rename ensures no partial reads on crash
 * - TTL staleness: isStale(ttlMs) returns true when data is older than ttlMs
 * - Seed fallback: loadOrSeed() populates from seedAdapter when cache is missing/corrupt
 * - Corrupt/missing cache never crashes boot — load() returns false and falls back to seed
 * - Date fields (startDate, endDate, fetchedAt) are revived from ISO strings on load
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CacheFile, NormalizedEvent, SourceResult } from '../types/events';
import type { SourceAdapter } from '../sources/base';

// ---------------------------------------------------------------------------
// Date revival
// ---------------------------------------------------------------------------

/**
 * JSON.parse reviver that converts ISO 8601 date strings to Date instances.
 * Matches any string that starts with "YYYY-MM-DDTHH" to avoid false positives.
 */
function dateReviver(_key: string, value: unknown): unknown {
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
  ) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return value;
}

// ---------------------------------------------------------------------------
// CacheStore
// ---------------------------------------------------------------------------

export class CacheStore {
  private readonly cachePath: string;
  private data: CacheFile | null = null;

  constructor(cacheDir: string) {
    this.cachePath = path.join(cacheDir, 'events.json');
  }

  /**
   * Load cache from disk.
   * @returns true if loaded successfully, false if file is missing or corrupt.
   * On false, getEvents() and getSources() return [].
   */
  async load(): Promise<boolean> {
    try {
      const raw = await fs.readFile(this.cachePath, 'utf-8');
      this.data = JSON.parse(raw, dateReviver) as CacheFile;
      return true;
    } catch {
      // File missing, unreadable, or JSON is corrupt — degrade gracefully
      this.data = null;
      return false;
    }
  }

  /**
   * Save CacheFile to disk atomically.
   * Writes to a .tmp file first, then renames to events.json (atomic on POSIX).
   * In-memory data is updated to match.
   */
  async save(data: CacheFile): Promise<void> {
    const dir = path.dirname(this.cachePath);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = this.cachePath + '.tmp';
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    // fs.rename is atomic on POSIX — no partial file can be observed
    await fs.rename(tmpPath, this.cachePath);

    // Update in-memory state
    this.data = data;
  }

  /**
   * Returns true if no data is loaded or data is older than ttlMs.
   */
  isStale(ttlMs: number): boolean {
    if (!this.data) return true;
    const age = Date.now() - new Date(this.data.savedAt).getTime();
    return age > ttlMs;
  }

  /** Returns the in-memory event list (empty array if not loaded). */
  getEvents(): NormalizedEvent[] {
    return this.data?.events ?? [];
  }

  /** Returns the in-memory source-status list (empty array if not loaded). */
  getSources(): SourceResult[] {
    return this.data?.sources ?? [];
  }

  /**
   * Try to load from disk; if missing or corrupt, populate from seedAdapter.
   *
   * Seed data is considered stale by design (savedAt = epoch), so the background
   * refresh loop will immediately replace it with live data on first run.
   *
   * This method guarantees the store always has events after the call — it
   * never leaves the store empty.
   */
  async loadOrSeed(seedAdapter: SourceAdapter): Promise<void> {
    const loaded = await this.load();
    if (!loaded) {
      const events = await seedAdapter.scrape();
      const seedSource: SourceResult = {
        name: seedAdapter.name,
        displayName: seedAdapter.displayName,
        homeUrl: seedAdapter.homeUrl,
        status: 'seed',
        eventCount: events.length,
        fetchedAt: new Date(),
      };
      // Set in-memory data with epoch savedAt so isStale() always returns true
      this.data = {
        version: 1,
        savedAt: new Date(0).toISOString(), // epoch → always stale
        sources: [seedSource],
        events,
      };
    }
  }
}
