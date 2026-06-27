/**
 * Tests for runPipeline — error isolation, serve-stale, per-source SourceResult.
 *
 * Covers:
 *  - AGG-05: adapter throwing => no overwrite of prev events
 *  - CACHE-03: serve-stale retains previous events on failure
 *  - SRC-08: SourceResult carries name/status/eventCount/fetchedAt
 *  - T-01-10: per-source timeout treated as error, not process crash
 *  - T-01-12: error strings are human-readable only, no stack traces
 *  - T-03-12: HTTP 403 / 'blocked' error maps to status 'blocked', not 'error'
 *  - T-03-13: disabled sources appear as 'blocked' entries, never scraped
 */

import { describe, it, expect } from 'vitest';
import { runPipeline } from './run';
import type { SourceAdapter } from '../sources/base';
import type { NormalizedEvent, SourceResult } from '../types/events';
import type { DisabledSource } from '../sources/registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(sourceName: string, id: string): NormalizedEvent {
  return {
    id,
    title: `Event ${id}`,
    startDate: new Date('2026-07-01T18:00:00Z'),
    venue: 'Test Venue',
    priceText: 'Бесплатно',
    isFree: true,
    sourceName,
    sourceUrl: `https://example.com/${id}`,
    category: 'concert',
    tags: [],
    fetchedAt: new Date(),
    isSeed: false,
  };
}

function makeAdapter(
  name: string,
  timeoutMs: number,
  scrape: () => Promise<NormalizedEvent[]>,
): SourceAdapter {
  return { name, displayName: name, homeUrl: `https://${name}.ru`, timeoutMs, scrape };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runPipeline', () => {
  it('successful adapter: status live, correct eventCount, fetchedAt is Date', async () => {
    const events = [makeEvent('src-a', 'e1'), makeEvent('src-a', 'e2')];
    const adapter = makeAdapter('src-a', 5000, async () => events);

    const result = await runPipeline([adapter]);

    expect(result.events).toHaveLength(2);
    expect(result.sources).toHaveLength(1);

    const src = result.sources[0];
    expect(src.name).toBe('src-a');
    expect(src.status).toBe('live');
    expect(src.eventCount).toBe(2);
    expect(src.fetchedAt).toBeInstanceOf(Date);
  });

  it('isolates failure: healthy source live, failing source error; pipeline does not throw', async () => {
    const goodEvents = [makeEvent('good', 'g1'), makeEvent('good', 'g2')];
    const good = makeAdapter('good', 5000, async () => goodEvents);
    const bad = makeAdapter('bad', 5000, async () => {
      throw new Error('network error');
    });

    const result = await runPipeline([good, bad]);

    const goodResult = result.sources.find((s) => s.name === 'good');
    const badResult = result.sources.find((s) => s.name === 'bad');

    expect(goodResult?.status).toBe('live');
    expect(goodResult?.eventCount).toBe(2);
    expect(badResult?.status).toBe('error');

    // Good events present; bad source contributes nothing (no prev)
    expect(result.events.filter((e) => e.sourceName === 'good')).toHaveLength(2);
    expect(result.events.filter((e) => e.sourceName === 'bad')).toHaveLength(0);
  });

  it('serve-stale: failed source retains its previous events from prev (CACHE-03)', async () => {
    const prevEvents: NormalizedEvent[] = [
      makeEvent('failing', 'p1'),
      makeEvent('failing', 'p2'),
      makeEvent('other', 'o1'), // belongs to a different source — must NOT appear
    ];
    const prev = { events: prevEvents, sources: [] as SourceResult[] };

    const failing = makeAdapter('failing', 5000, async () => {
      throw new Error('downstream error');
    });

    const result = await runPipeline([failing], prev);

    // Only the 'failing' source's previous events are retained (not 'other')
    const retained = result.events.filter((e) => e.sourceName === 'failing');
    expect(retained).toHaveLength(2);
    const notRetained = result.events.filter((e) => e.sourceName === 'other');
    expect(notRetained).toHaveLength(0);

    const src = result.sources.find((s) => s.name === 'failing');
    expect(src?.status).toBe('error');
  });

  it('no prev for failed source: contributes nothing to events', async () => {
    const failing = makeAdapter('failing', 5000, async () => {
      throw new Error('fail');
    });

    const result = await runPipeline([failing]);

    expect(result.events).toHaveLength(0);
    const src = result.sources.find((s) => s.name === 'failing');
    expect(src?.status).toBe('error');
  });

  it('error strings are human-readable only — no stack trace lines (T-01-12)', async () => {
    const failing = makeAdapter('failing', 5000, async () => {
      throw new Error('network timeout');
    });

    const result = await runPipeline([failing]);
    const src = result.sources.find((s) => s.name === 'failing');

    expect(src?.error).toBeDefined();
    // Stack frames look like "    at Object.<anonymous> ..."
    expect(src?.error).not.toMatch(/^\s+at /m);
    expect(src?.error).not.toContain('.ts:');
    expect(src?.error).not.toContain('.js:');
  });

  it('seed adapter reports status "seed" not "live" (honest source status, AGG-02)', async () => {
    const seedEvents = [makeEvent('seed', 's1'), makeEvent('seed', 's2')].map((e) => ({
      ...e,
      isSeed: true,
    }));
    const adapter = makeAdapter('seed', 5000, async () => seedEvents);

    const result = await runPipeline([adapter]);
    const src = result.sources.find((s) => s.name === 'seed');
    expect(src?.status).toBe('seed');
    expect(src?.status).not.toBe('live');
  });

  it('withTimeout: slow adapter (exceeds timeoutMs) is treated as error', async () => {
    const slowAdapter: SourceAdapter = {
      name: 'slow',
      displayName: 'Slow',
      homeUrl: 'https://slow.ru',
      timeoutMs: 50, // 50 ms — much less than the 300 ms delay below
      scrape: async () => {
        await new Promise((r) => setTimeout(r, 300));
        return [makeEvent('slow', 's1')];
      },
    };

    const result = await runPipeline([slowAdapter]);

    const src = result.sources.find((s) => s.name === 'slow');
    expect(src?.status).toBe('error');
    expect(result.events).toHaveLength(0);
  }, 1000);

  // ---------------------------------------------------------------------------
  // 403 → blocked mapping (T-03-12, SRC-06)
  // ---------------------------------------------------------------------------

  it('HTTP 403 error maps to status "blocked", not "error" (T-03-12)', async () => {
    const blockedAdapter = makeAdapter('yandex-afisha', 5000, async () => {
      throw new Error('HTTP 403 — source blocked');
    });
    const good = makeAdapter('good', 5000, async () => [makeEvent('good', 'g1')]);

    const result = await runPipeline([good, blockedAdapter]);

    const blockedResult = result.sources.find((s) => s.name === 'yandex-afisha');
    const goodResult = result.sources.find((s) => s.name === 'good');

    expect(blockedResult?.status).toBe('blocked');
    expect(goodResult?.status).toBe('live');
    // Pipeline still produces results for other sources (loop isolation)
    expect(result.events.filter((e) => e.sourceName === 'good')).toHaveLength(1);
  });

  it('error containing "blocked" (lowercase) also maps to status "blocked" (T-03-12)', async () => {
    const adapter = makeAdapter('some-source', 5000, async () => {
      throw new Error('scraping disallowed by robots.txt for all listing URLs — source blocked');
    });

    const result = await runPipeline([adapter]);
    const src = result.sources.find((s) => s.name === 'some-source');
    expect(src?.status).toBe('blocked');
  });

  it('generic (non-403, non-blocked) error still yields status "error" (unchanged, T-03-12)', async () => {
    const adapter = makeAdapter('src-err', 5000, async () => {
      throw new Error('ParseError: connection refused');
    });

    const result = await runPipeline([adapter]);
    const src = result.sources.find((s) => s.name === 'src-err');
    expect(src?.status).toBe('error');
  });

  it('blocked source: serve-stale events still retained (CACHE-03 + T-03-12)', async () => {
    const prevEvents: NormalizedEvent[] = [makeEvent('blocked-src', 'p1')];
    const prev = { events: prevEvents, sources: [] as SourceResult[] };

    const adapter = makeAdapter('blocked-src', 5000, async () => {
      throw new Error('HTTP 403 — source blocked');
    });

    const result = await runPipeline([adapter], prev);
    const src = result.sources.find((s) => s.name === 'blocked-src');
    expect(src?.status).toBe('blocked');
    // Stale events are retained even for blocked sources
    expect(result.events.filter((e) => e.sourceName === 'blocked-src')).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Disabled sources → merged blocked entries (T-03-13, SRC-05/06)
  // ---------------------------------------------------------------------------

  it('disabled list: each entry appears in sources as "blocked" with reason, never scraped (T-03-13)', async () => {
    const good = makeAdapter('good', 5000, async () => [makeEvent('good', 'g1')]);
    const scrapeCalledFor: string[] = [];
    // Spy adapter that records if scrape() is accidentally called
    const spyAdapter = makeAdapter('spy', 5000, async () => {
      scrapeCalledFor.push('spy');
      return [];
    });

    const disabled: DisabledSource[] = [
      {
        name: 'kassir-sur',
        displayName: 'Кассир Сургут',
        homeUrl: 'https://sur.kassir.ru',
        reason: 'Требует браузера; источник полностью клиентский — отключён в MVP',
      },
    ];

    // Only [good] in active registry; spy is not in registry at all — simulates
    // kassir-sur NOT being in the active registry and instead in disabled list
    const result = await runPipeline([good], undefined, disabled);

    // kassir-sur appears as blocked
    const kassirResult = result.sources.find((s) => s.name === 'kassir-sur');
    expect(kassirResult).toBeDefined();
    expect(kassirResult?.status).toBe('blocked');
    expect(kassirResult?.eventCount).toBe(0);
    expect(kassirResult?.fetchedAt).toBeNull();
    expect(kassirResult?.error).toBe('Требует браузера; источник полностью клиентский — отключён в MVP');

    // scrape() was never called for disabled sources
    expect(scrapeCalledFor).toHaveLength(0);

    // Good source still active
    expect(result.sources.find((s) => s.name === 'good')?.status).toBe('live');
  });

  it('disabled list: multiple disabled entries all appear as blocked (T-03-13)', async () => {
    const disabled: DisabledSource[] = [
      { name: 'kassir-sur', displayName: 'Кассир', homeUrl: 'https://kassir.ru', reason: 'Client-rendered' },
      { name: 'yandex-afisha', displayName: 'Яндекс', homeUrl: 'https://ya.ru', reason: 'ToS risk' },
    ];

    const result = await runPipeline([], undefined, disabled);

    expect(result.sources).toHaveLength(2);
    for (const src of result.sources) {
      expect(src.status).toBe('blocked');
      expect(src.eventCount).toBe(0);
      expect(src.fetchedAt).toBeNull();
    }
    // No events from disabled sources (T-03-13)
    expect(result.events).toHaveLength(0);
  });

  it('no disabled list passed: pipeline works as before (backward compat)', async () => {
    const events = [makeEvent('src-a', 'e1')];
    const adapter = makeAdapter('src-a', 5000, async () => events);

    const result = await runPipeline([adapter]);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.status).toBe('live');
  });
});
