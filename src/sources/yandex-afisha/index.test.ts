/**
 * Fixture-based tests for the afisha.yandex.ru/surgut adapter.
 *
 * All tests run against the saved HTML fixture — deterministic + offline.
 * The fixture (src/sources/yandex-afisha/__fixtures__/yandex-2026-06-27.html)
 * is the /surgut main page (220 KB, captured live 2026-06-27).
 * It contains 2 unique concert events in the featured carousel
 * ("Пикник", "КняZz"), each repeated 2–3× as carousel clones.
 *
 * Covers:
 *  - SRC-06: yandex-afisha parser normalises SSR HTML to NormalizedEvent
 *  - AGG-01: NormalizedEvent model shape
 *  - AGG-02: isSeed:false on live events
 *  - AGG-05: min-results guard throws ParseError on HTTP-200-but-<2-events
 *  - UX-01: hasTime:true for Format 4 "DD месяца, HH:MM" timed cards
 *  - T-03-06: enabled:false + tosRisk:true declared on adapter
 *  - T-03-08: 403 rethrow format verified via top-level module mock
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { parseYandexAfisha, yandexAfishaAdapter } from './index';
import { fetchHtml } from '../../utils/http';
import { isAllowed } from '../../utils/robots';

// Top-level mocks — hoisted before any test runs.
// parseYandexAfisha does NOT call fetchHtml/isAllowed (those live in scrape()),
// so mocking them here does not affect the fixture tests below.
vi.mock('../../utils/http', () => ({
  fetchHtml: vi.fn(),
}));
vi.mock('../../utils/robots', () => ({
  isAllowed: vi.fn().mockResolvedValue(true),
}));

const fixture = readFileSync(
  join(__dirname, '__fixtures__/yandex-2026-06-27.html'),
  'utf-8',
);

// ---------------------------------------------------------------------------
// parseYandexAfisha — fixture tests
// ---------------------------------------------------------------------------

describe('parseYandexAfisha', () => {
  it('extracts at least 2 unique events from the fixture (AGG-05 min-results)', () => {
    const events = parseYandexAfisha(fixture);
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it('every event has isSeed:false and sourceName "yandex-afisha" (AGG-02)', () => {
    const events = parseYandexAfisha(fixture);
    expect(events.every((e) => e.isSeed === false)).toBe(true);
    expect(events.every((e) => e.sourceName === 'yandex-afisha')).toBe(true);
  });

  it('every event has a non-empty title', () => {
    const events = parseYandexAfisha(fixture);
    expect(events.every((e) => typeof e.title === 'string' && e.title.length > 0)).toBe(true);
  });

  it('every event has a valid startDate', () => {
    const events = parseYandexAfisha(fixture);
    expect(
      events.every((e) => e.startDate instanceof Date && !isNaN(e.startDate.getTime())),
    ).toBe(true);
  });

  it('timed cards (DD месяца, HH:MM — Format 4) yield hasTime:true (UX-01)', () => {
    const events = parseYandexAfisha(fixture);
    // All fixture events have explicit times — Format 4 always sets hasTime:true
    const timedEvent = events.find((e) => e.hasTime === true);
    expect(timedEvent).toBeDefined();
  });

  it('known event "Пикник" has correct UTC date and hasTime:true', () => {
    const events = parseYandexAfisha(fixture);
    const piknik = events.find((e) => e.title.includes('Пикник'));
    expect(piknik).toBeDefined();
    expect(piknik!.hasTime).toBe(true);
    // "15 сентября, 19:00" Surgut local (UTC+5) → UTC 14:00
    expect(piknik!.startDate.getUTCMonth()).toBe(8); // September = index 8
    expect(piknik!.startDate.getUTCDate()).toBe(15);
    expect(piknik!.startDate.getUTCHours()).toBe(14);
  });

  it('known event "КняZz" has correct UTC date', () => {
    const events = parseYandexAfisha(fixture);
    const knyazz = events.find((e) => e.title.includes('КняZz') || e.title.includes('КняZZ'));
    expect(knyazz).toBeDefined();
    expect(knyazz!.hasTime).toBe(true);
    // "12 декабря, 19:00" Surgut local → UTC 14:00
    expect(knyazz!.startDate.getUTCMonth()).toBe(11); // December = index 11
    expect(knyazz!.startDate.getUTCDate()).toBe(12);
    expect(knyazz!.startDate.getUTCHours()).toBe(14);
  });

  it('carousel deduplication: each unique event appears exactly once', () => {
    const events = parseYandexAfisha(fixture);
    const ids = events.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('every event id is a non-empty string (deterministic SHA-1)', () => {
    const events = parseYandexAfisha(fixture);
    expect(events.every((e) => typeof e.id === 'string' && e.id.length > 0)).toBe(true);
  });

  it('sourceUrl starts with https://afisha.yandex.ru/surgut/concert/', () => {
    const events = parseYandexAfisha(fixture);
    expect(
      events.every(
        (e) =>
          e.sourceUrl.startsWith('https://afisha.yandex.ru/surgut/concert/') ||
          e.sourceUrl.startsWith('https://afisha.yandex.ru/surgut/performance/'),
      ),
    ).toBe(true);
  });

  it('throws ParseError when HTML yields fewer than 2 events (min-results guard, AGG-05)', () => {
    expect(() => parseYandexAfisha('<html><body></body></html>')).toThrow(/ParseError/);
  });
});

// ---------------------------------------------------------------------------
// yandexAfishaAdapter — adapter config tests (T-03-06)
// ---------------------------------------------------------------------------

describe('yandexAfishaAdapter', () => {
  it('enabled is false (adapter is OFF by default — ToS §3.1 risk)', () => {
    expect(yandexAfishaAdapter.enabled).toBe(false);
  });

  it('tosRisk is true (documented Yandex ToS §3.1 risk)', () => {
    expect(yandexAfishaAdapter.tosRisk).toBe(true);
  });

  it('name is "yandex-afisha"', () => {
    expect(yandexAfishaAdapter.name).toBe('yandex-afisha');
  });

  it('homeUrl points to afisha.yandex.ru', () => {
    expect(yandexAfishaAdapter.homeUrl).toBe('https://afisha.yandex.ru');
  });

  it('timeoutMs is 10000', () => {
    expect(yandexAfishaAdapter.timeoutMs).toBe(10_000);
  });

  // ---------------------------------------------------------------------------
  // 403 tagged rethrow test (T-03-08)
  // ---------------------------------------------------------------------------

  it('scrape() rethrows HTTP 403 as tagged "HTTP 403 — source blocked" error (T-03-08)', async () => {
    // isAllowed is mocked to return true at top-level (robots gate passes)
    vi.mocked(isAllowed).mockResolvedValueOnce(true);
    // fetchHtml is mocked to simulate a 403 response from Yandex
    vi.mocked(fetchHtml).mockRejectedValueOnce(
      new Error('HTTP 403 Forbidden for https://afisha.yandex.ru/surgut'),
    );

    await expect(yandexAfishaAdapter.scrape()).rejects.toThrow('HTTP 403 — source blocked');
  });
});
