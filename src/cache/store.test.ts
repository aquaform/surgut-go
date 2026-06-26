/**
 * CacheStore unit tests — covers CACHE-01 and AGG-02 honesty invariant.
 *
 * Tests:
 * 1. load() returns false when no cache file exists
 * 2. save() → load() roundtrip preserves events + sources with Date revival
 * 3. save() writes atomically: .tmp file is removed after rename
 * 4. isStale() true when no data loaded
 * 5. isStale() false when savedAt is fresh
 * 6. isStale() true when savedAt age exceeds TTL
 * 7. load() returns false (does not crash) on corrupt JSON
 * 8. loadOrSeed() populates store from seedAdapter on missing cache file
 * 9. loadOrSeed() marks data as stale (so refresh loop picks it up)
 * 10. getEvents() returns [] before any load
 * 11. getSources() returns [] before any load
 * 12. AGG-02 honesty: every event in events.json has isSeed === true
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CacheStore } from './store';
import type { CacheFile, NormalizedEvent } from '../types/events';
import type { SourceAdapter } from '../sources/base';
import seedEventsJson from '../sources/seed/events.json';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'test-id-1',
    title: 'Тестовое событие',
    startDate: new Date('2026-09-06T15:00:00.000Z'),
    venue: 'Вавилон',
    priceText: 'от 1000 ₽',
    priceMin: 1000,
    isFree: false,
    sourceName: 'seed',
    sourceUrl: 'https://kassa-ugra.ru/event/test',
    category: 'concert',
    tags: ['концерт'],
    fetchedAt: new Date('2026-06-27T00:00:00.000Z'),
    isSeed: true,
    ...overrides,
  };
}

function makeCacheFile(overrides: Partial<CacheFile> = {}): CacheFile {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    sources: [],
    events: [],
    ...overrides,
  };
}

function makeFakeSeedAdapter(events: NormalizedEvent[] = []): SourceAdapter {
  return {
    name: 'seed',
    displayName: 'Демо-данные',
    homeUrl: '',
    timeoutMs: 0,
    async scrape() {
      return events;
    },
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('CacheStore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cache-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // 1. load() on missing file
  it('load() returns false when cache file does not exist', async () => {
    const store = new CacheStore(tmpDir);
    const result = await store.load();
    expect(result).toBe(false);
  });

  // 2. save → load roundtrip
  it('save() then load() roundtrips events and sources; Date fields survive', async () => {
    const store = new CacheStore(tmpDir);
    const startDate = new Date('2026-09-06T15:00:00.000Z');
    const fetchedAt = new Date('2026-06-27T12:00:00.000Z');
    const event = makeEvent({ startDate, fetchedAt });

    await store.save(makeCacheFile({ events: [event] }));

    // Load into a fresh store instance (simulates restart)
    const store2 = new CacheStore(tmpDir);
    const loaded = await store2.load();

    expect(loaded).toBe(true);
    const events = store2.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.title).toBe('Тестовое событие');
    // Date revival: ISO strings in JSON must become Date instances
    expect(events[0]!.startDate).toBeInstanceOf(Date);
    expect(events[0]!.fetchedAt).toBeInstanceOf(Date);
    expect(events[0]!.startDate.getTime()).toBe(startDate.getTime());
    expect(events[0]!.fetchedAt.getTime()).toBe(fetchedAt.getTime());
  });

  // 3. Atomic write: no lingering .tmp file
  it('save() removes the .tmp file after atomic rename', async () => {
    const store = new CacheStore(tmpDir);
    await store.save(makeCacheFile());

    expect(existsSync(join(tmpDir, 'events.json.tmp'))).toBe(false);
    expect(existsSync(join(tmpDir, 'events.json'))).toBe(true);
  });

  // 4. isStale when no data
  it('isStale() returns true when no data has been loaded', () => {
    const store = new CacheStore(tmpDir);
    expect(store.isStale(3_600_000)).toBe(true);
  });

  // 5. isStale fresh
  it('isStale() returns false when savedAt is within TTL', async () => {
    const store = new CacheStore(tmpDir);
    await store.save(makeCacheFile({ savedAt: new Date().toISOString() }));
    await store.load();
    expect(store.isStale(3_600_000)).toBe(false);
  });

  // 6. isStale expired
  it('isStale() returns true when savedAt is older than TTL', async () => {
    const store = new CacheStore(tmpDir);
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000);
    await store.save(makeCacheFile({ savedAt: twoHoursAgo.toISOString() }));
    await store.load();
    // TTL = 1 hour, data is 2 hours old
    expect(store.isStale(3_600_000)).toBe(true);
  });

  // 7. Corrupt JSON
  it('load() returns false and does not throw on corrupt JSON', async () => {
    writeFileSync(join(tmpDir, 'events.json'), '{ not valid json !!!', 'utf-8');
    const store = new CacheStore(tmpDir);
    const result = await store.load();
    expect(result).toBe(false);
    expect(store.getEvents()).toEqual([]);
  });

  // 8. loadOrSeed populates from seed
  it('loadOrSeed() populates events from seedAdapter when no cache file exists', async () => {
    const seedEvent = makeEvent({ id: 'seed-1', isSeed: true });
    const store = new CacheStore(tmpDir);
    await store.loadOrSeed(makeFakeSeedAdapter([seedEvent]));

    const events = store.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.title).toBe('Тестовое событие');
    expect(events[0]!.isSeed).toBe(true);
  });

  // 9. loadOrSeed marks data as stale
  it('loadOrSeed() marks data as stale so refresh loop picks it up', async () => {
    const store = new CacheStore(tmpDir);
    await store.loadOrSeed(makeFakeSeedAdapter([makeEvent({ isSeed: true })]));
    expect(store.isStale(3_600_000)).toBe(true);
  });

  // 10. getEvents before any load
  it('getEvents() returns [] before any load', () => {
    const store = new CacheStore(tmpDir);
    expect(store.getEvents()).toEqual([]);
  });

  // 11. getSources before any load
  it('getSources() returns [] before any load', () => {
    const store = new CacheStore(tmpDir);
    expect(store.getSources()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AGG-02 honesty invariant — must be in its own describe block
// ---------------------------------------------------------------------------

describe('Seed honesty invariant (AGG-02)', () => {
  it('every entry in events.json has isSeed === true', () => {
    const events = seedEventsJson as Array<{ isSeed: unknown; title: string }>;
    expect(events.length).toBeGreaterThanOrEqual(10);
    for (const event of events) {
      expect(
        event.isSeed,
        `Event "${event.title}" must have isSeed:true — seed events must never be presented as live (AGG-02)`,
      ).toBe(true);
    }
  });
});
