/**
 * Fixture-based tests for the afisha.ru/surgut adapter.
 *
 * All tests run against the saved HTML fixture — deterministic + offline.
 * The fixture (src/sources/afisha-ru/__fixtures__/afisha-ru-2026-06-27.html)
 * is the /surgut/concerts/ listing page (525 KB, captured live 2026-06-27).
 * It contains 49 event listitem containers with real date strings "DD месяца в HH:MM".
 *
 * Covers:
 *  - SRC-04: afisha.ru parser normalises real Next.js SSR HTML to NormalizedEvent
 *  - AGG-01: NormalizedEvent model shape
 *  - AGG-02: isSeed:false on live events
 *  - AGG-05: min-results guard throws ParseError on HTTP-200-but-<2-events
 *  - hasTime: true for timed cards ("DD месяца в HH:MM" format)
 *  - Pitfall 4: anchors without event content (nav/editorial listitems) are skipped
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseAfishaRu } from './index';

const fixture = readFileSync(
  join(__dirname, '__fixtures__/afisha-ru-2026-06-27.html'),
  'utf-8',
);

describe('parseAfishaRu', () => {
  it('extracts at least 2 events from the fixture', () => {
    const events = parseAfishaRu(fixture);
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it('every event has isSeed:false and sourceName "afisha-ru" (AGG-02)', () => {
    const events = parseAfishaRu(fixture);
    expect(events.every((e) => e.isSeed === false)).toBe(true);
    expect(events.every((e) => e.sourceName === 'afisha-ru')).toBe(true);
  });

  it('every event has a non-empty title', () => {
    const events = parseAfishaRu(fixture);
    expect(events.every((e) => typeof e.title === 'string' && e.title.length > 0)).toBe(true);
  });

  it('every event has a valid startDate', () => {
    const events = parseAfishaRu(fixture);
    expect(
      events.every((e) => e.startDate instanceof Date && !isNaN(e.startDate.getTime())),
    ).toBe(true);
  });

  it('timed cards (DD месяца в HH:MM) yield hasTime:true', () => {
    const events = parseAfishaRu(fixture);
    // Concerts page fixture: all events have explicit times
    const timedEvent = events.find((e) => e.hasTime === true);
    expect(timedEvent).toBeDefined();
  });

  it('known event "Виктория Складчикова" has correct UTC date and hasTime:true', () => {
    const events = parseAfishaRu(fixture);
    const vika = events.find((e) => e.title.includes('Виктория Складчикова'));
    expect(vika).toBeDefined();
    expect(vika!.hasTime).toBe(true);
    // "7 октября в 19:00" = Surgut local → UTC 14:00 (Surgut is UTC+5)
    expect(vika!.startDate.getUTCMonth()).toBe(9); // October = 0-indexed 9
    expect(vika!.startDate.getUTCHours()).toBe(14);
  });

  it('every event id is a non-empty string (deterministic SHA-1)', () => {
    const events = parseAfishaRu(fixture);
    expect(events.every((e) => typeof e.id === 'string' && e.id.length > 0)).toBe(true);
  });

  it('sourceUrl starts with https://www.afisha.ru (no duplicate base URL)', () => {
    const events = parseAfishaRu(fixture);
    expect(events.every((e) => e.sourceUrl.startsWith('https://www.afisha.ru'))).toBe(true);
  });

  it('sourceUrl points to a specific event (not the listing page)', () => {
    const events = parseAfishaRu(fixture);
    // Event URLs look like /concert/slug/ or /performance/slug/
    expect(
      events.every((e) =>
        e.sourceUrl.includes('/concert/') || e.sourceUrl.includes('/performance/') || e.sourceUrl.includes('/event/'),
      ),
    ).toBe(true);
  });

  it('throws ParseError when HTML yields fewer than 2 events (min-results guard, AGG-05)', () => {
    expect(() => parseAfishaRu('<html><body></body></html>')).toThrow(/ParseError/);
  });

  it('nav/editorial listitems without concert links are skipped (Pitfall 4 equivalent)', () => {
    // Minimal HTML: a listitem with a /selection/ link (editorial) — should yield 0 events → ParseError
    const editorialHtml = `<html><body>
      <div role="listitem" aria-label="Лучшие концерты">
        <a href="/selection/luchshie-koncerty/">See all</a>
      </div>
    </body></html>`;
    expect(() => parseAfishaRu(editorialHtml)).toThrow(/ParseError/);
  });
});
