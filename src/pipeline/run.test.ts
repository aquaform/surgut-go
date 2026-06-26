/**
 * Tests for runPipeline — error isolation, serve-stale, per-source SourceResult.
 *
 * Covers:
 *  - AGG-05: adapter throwing => no overwrite of prev events
 *  - CACHE-03: serve-stale retains previous events on failure
 *  - SRC-08: SourceResult carries name/status/eventCount/fetchedAt
 *  - T-01-10: per-source timeout treated as error, not process crash
 *  - T-01-12: error strings are human-readable only, no stack traces
 */

import { describe, it, expect } from 'vitest';
import { runPipeline } from './run';
import type { SourceAdapter } from '../sources/base';
import type { NormalizedEvent, SourceResult } from '../types/events';

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
});
