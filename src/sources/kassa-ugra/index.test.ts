/**
 * Fixture-based tests for the kassa-ugra.ru adapter.
 *
 * All tests run against the saved HTML fixture — deterministic + offline.
 * The fixture (src/sources/kassa-ugra/__fixtures__/afisha-2026-06-27.html)
 * is 3 pages of /afisha concatenated (captured live 2026-06-27).
 *
 * Covers:
 *  - SRC-02: kassa-ugra parser normalises real HTML to NormalizedEvent
 *  - AGG-01: NormalizedEvent model shape
 *  - AGG-02: isSeed:false on live events
 *  - AGG-05: min-results guard throws ParseError on HTTP-200-but-<2-events
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseKassaUgra } from './index';

const fixture = readFileSync(
  join(__dirname, '__fixtures__/afisha-2026-06-27.html'),
  'utf-8',
);

describe('parseKassaUgra', () => {
  it('extracts at least 2 events from the fixture', () => {
    const events = parseKassaUgra(fixture);
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it('first event has all required fields with correct types and values', () => {
    const [first] = parseKassaUgra(fixture);
    expect(first).toBeDefined();
    expect(typeof first!.title).toBe('string');
    expect(first!.title.length).toBeGreaterThan(0);
    expect(first!.startDate).toBeInstanceOf(Date);
    expect(first!.startDate.toString()).not.toBe('Invalid Date');
    expect(first!.sourceName).toBe('kassa-ugra');
    expect(first!.isSeed).toBe(false);
    expect(typeof first!.sourceUrl).toBe('string');
    expect(first!.sourceUrl).toContain('https://kassa-ugra.ru/event/');
  });

  it('a paid event has priceText containing ₽ and a numeric priceMin', () => {
    const events = parseKassaUgra(fixture);
    const paid = events.find((e) => e.priceMin !== undefined && e.priceMin > 0);
    expect(paid).toBeDefined();
    expect(paid!.priceText).toMatch(/₽/);
    expect(typeof paid!.priceMin).toBe('number');
  });

  it('every event has isSeed:false (AGG-02 invariant)', () => {
    const events = parseKassaUgra(fixture);
    expect(events.every((e) => e.isSeed === false)).toBe(true);
  });

  it('every event id is a non-empty string (deterministic SHA-1)', () => {
    const events = parseKassaUgra(fixture);
    expect(events.every((e) => typeof e.id === 'string' && e.id.length > 0)).toBe(true);
  });

  it('throws ParseError when HTML yields fewer than 2 events (min-results guard, AGG-05)', () => {
    expect(() => parseKassaUgra('<html><body></body></html>')).toThrow(/ParseError/);
  });

  it('throws ParseError on a page with only one event container', () => {
    // Minimal HTML with a single div.event but no price
    const singleEventHtml = `
      <html><body>
        <div class="event">
          <div class="title"><a href="/event/99999">Одно событие</a></div>
          <div class="details">
            <ul class="info-list">
              <li><i class="icon-location"></i><span>Тестовый зал</span></li>
              <li><i class="icon-calendar"></i><span>27 июн 20:00 Сб</span></li>
            </ul>
          </div>
        </div>
      </body></html>
    `;
    expect(() => parseKassaUgra(singleEventHtml)).toThrow(/ParseError/);
  });
});
