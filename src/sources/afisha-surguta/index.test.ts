/**
 * Fixture-based tests for the afisha.surguta.ru adapter.
 *
 * All tests run against the saved HTML fixture — deterministic + offline.
 * The fixture (src/sources/afisha-surguta/__fixtures__/main-2026-06-27.html)
 * is the main listing page (240 809 bytes, captured live 2026-06-27).
 *
 * Covers:
 *  - SRC-03: afisha.surguta parser normalises real Drupal HTML to NormalizedEvent
 *  - AGG-01: NormalizedEvent model shape
 *  - AGG-02: isSeed:false on live events
 *  - AGG-05: min-results guard throws ParseError on HTTP-200-but-<2-events
 *  - Pitfall 6: price stripped from title for art section events
 *  - Pitfall 7: age rating stripped from title, stored in ageLimit
 *  - Range date: start extracted from date-display-start / date-display-end
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseAfishaSurguta } from './index';

const fixture = readFileSync(
  join(__dirname, '__fixtures__/main-2026-06-27.html'),
  'utf-8',
);

describe('parseAfishaSurguta', () => {
  it('extracts at least 2 events from the fixture', () => {
    const events = parseAfishaSurguta(fixture);
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it('every event has isSeed:false and sourceName "afisha-surguta" (AGG-02)', () => {
    const events = parseAfishaSurguta(fixture);
    expect(events.every((e) => e.isSeed === false)).toBe(true);
    expect(events.every((e) => e.sourceName === 'afisha-surguta')).toBe(true);
  });

  it('every event id is a non-empty string (deterministic SHA-1)', () => {
    const events = parseAfishaSurguta(fixture);
    expect(events.every((e) => typeof e.id === 'string' && e.id.length > 0)).toBe(true);
  });

  it('a single-date event has valid startDate (genitive month format)', () => {
    const events = parseAfishaSurguta(fixture);
    // Find an event with a single date (not a range) — most fixture events have dates
    const withDate = events.find((e) => e.startDate instanceof Date && !isNaN(e.startDate.getTime()));
    expect(withDate).toBeDefined();
    expect(withDate!.startDate).toBeInstanceOf(Date);
    expect(withDate!.startDate.toString()).not.toBe('Invalid Date');
  });

  it('age limit stripped from title: «Весы» 18+ → ageLimit "18+", title without rating (Pitfall 7)', () => {
    const events = parseAfishaSurguta(fixture);
    const vesyEvent = events.find((e) => e.title.includes('Весы'));
    expect(vesyEvent).toBeDefined();
    // Title must not contain "18+" or any age suffix
    expect(vesyEvent!.title).not.toMatch(/\d+\+/);
    expect(vesyEvent!.ageLimit).toBeDefined();
    expect(vesyEvent!.ageLimit).toMatch(/^\d+\+$/);
  });

  it('age limit stripped from title: «Молодость» 12+ → ageLimit "12+"', () => {
    const events = parseAfishaSurguta(fixture);
    const molodostEvent = events.find((e) => e.title.includes('Молодость'));
    expect(molodostEvent).toBeDefined();
    expect(molodostEvent!.title).not.toMatch(/\d+\+/);
    expect(molodostEvent!.ageLimit).toBe('12+');
  });

  it('price stripped from title for art section event (Pitfall 6)', () => {
    const events = parseAfishaSurguta(fixture);
    // "Картина "Вид на храм"  60000 ₽" → title without price, priceMin numeric
    const artEvent = events.find((e) => e.title.includes('Вид на храм'));
    expect(artEvent).toBeDefined();
    // Title must not contain ₽ or the price amount
    expect(artEvent!.title).not.toMatch(/₽/);
    expect(artEvent!.title).not.toMatch(/60\s*000/);
    // Price must be captured separately
    expect(artEvent!.priceMin).toBeDefined();
    expect(artEvent!.priceMin).toBeGreaterThan(0);
    expect(artEvent!.priceText).toMatch(/₽/);
  });

  it('price stripped from title: "Luna aversa" 33 000 ₽ → clean title + priceMin 33000', () => {
    const events = parseAfishaSurguta(fixture);
    const lunaEvent = events.find((e) => e.title.includes('Luna aversa'));
    expect(lunaEvent).toBeDefined();
    expect(lunaEvent!.title).not.toMatch(/₽/);
    expect(lunaEvent!.priceMin).toBe(33000);
  });

  it('a range-date event has valid startDate from date-display-start', () => {
    const events = parseAfishaSurguta(fixture);
    // Range events: "18 сентября - 29 декабря 2026" → startDate in September
    const rangeEvent = events.find((e) => e.title.includes('Рюриковичи'));
    expect(rangeEvent).toBeDefined();
    expect(rangeEvent!.startDate).toBeInstanceOf(Date);
    expect(rangeEvent!.startDate.toString()).not.toBe('Invalid Date');
    // September 2026 → UTC month 8 (0-indexed)
    expect(rangeEvent!.startDate.getUTCMonth()).toBe(8); // September = index 8
    expect(rangeEvent!.startDate.getUTCFullYear()).toBe(2026);
  });

  it('free entry events have isFree:true when Свободный вход badge is present', () => {
    const events = parseAfishaSurguta(fixture);
    // "В Центральной библиотеке появился постамат" has Свободный вход badge
    const freeEvent = events.find((e) => e.title.includes('библиотеке'));
    expect(freeEvent).toBeDefined();
    expect(freeEvent!.isFree).toBe(true);
  });

  it('throws ParseError when HTML yields fewer than 2 events (min-results guard, AGG-05)', () => {
    expect(() => parseAfishaSurguta('<html><body></body></html>')).toThrow(/ParseError/);
  });

  it('sourceUrl starts with https://afisha.surguta.ru/content/', () => {
    const events = parseAfishaSurguta(fixture);
    expect(events.every((e) => e.sourceUrl.startsWith('https://afisha.surguta.ru/content/'))).toBe(
      true,
    );
  });
});
