import { describe, it, expect } from 'vitest';
import { parseRussianDate } from './date';

describe('parseRussianDate', () => {
  it('parses kassa-ugra abbreviated format "6 сен 20:00 Вс" (UTC+5 → 15:00 UTC)', () => {
    const d = parseRussianDate('6 сен 20:00 Вс', 2026);
    expect(d).not.toBeNull();
    expect(d?.getUTCHours()).toBe(15); // 20:00 UTC+5 = 15:00 UTC
    expect(d?.getUTCDate()).toBe(6);
  });

  it('parses afisha.surguta genitive format "15 апреля 2026"', () => {
    const d = parseRussianDate('15 апреля 2026');
    expect(d).not.toBeNull();
    expect(d?.getUTCFullYear()).toBe(2026);
    expect(d?.getUTCMonth()).toBe(3); // April = month index 3 (0-based)
    expect(d?.getUTCDate()).toBe(15);
  });

  it('parses kassa-ugra section header "22 октября, 2026" (genitive + comma + year)', () => {
    const d = parseRussianDate('22 октября, 2026');
    expect(d).not.toBeNull();
    expect(d?.getUTCMonth()).toBe(9); // October = month index 9 (0-based)
    expect(d?.getUTCFullYear()).toBe(2026);
  });

  it('infers next year for past month "15 янв 19:00" (January < current June)', () => {
    const d = parseRussianDate('15 янв 19:00', 2026);
    expect(d).not.toBeNull();
    expect(d?.getUTCFullYear()).toBe(2027); // January < June → next year
  });

  it('parses "сегодня" as today (non-null)', () => {
    const d = parseRussianDate('сегодня');
    expect(d).not.toBeNull();
  });

  it('parses "завтра" as tomorrow (non-null)', () => {
    const d = parseRussianDate('завтра');
    expect(d).not.toBeNull();
  });

  it('parses range "18 сентября - 29 декабря 2026" → start date from first date', () => {
    const d = parseRussianDate('18 сентября - 29 декабря 2026');
    expect(d).not.toBeNull();
    expect(d?.getUTCMonth()).toBe(8); // September = month index 8 (0-based)
    expect(d?.getUTCDate()).toBe(18);
  });

  it('returns null for unrecognized format', () => {
    expect(parseRussianDate('unknown text')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseRussianDate('')).toBeNull();
  });

  it('never throws on garbage input', () => {
    expect(() => parseRussianDate('!!!@@###')).not.toThrow();
    expect(() => parseRussianDate('12345678901234567890')).not.toThrow();
  });
});
