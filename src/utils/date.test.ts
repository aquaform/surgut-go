import { describe, it, expect } from 'vitest';
import { parseRussianDate, parseDateFull } from './date';

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

describe('parseDateFull — Format 3 (afisha.ru "DD месяца в HH:MM")', () => {
  it('parses "7 октября в 19:00" → hasTime:true, 14:00 UTC (19−5)', () => {
    const r = parseDateFull('7 октября в 19:00', 2026);
    expect(r).not.toBeNull();
    expect(r?.hasTime).toBe(true);
    expect(r?.date.getUTCHours()).toBe(14);
    expect(r?.date.getUTCDate()).toBe(7);
    expect(r?.date.getUTCMonth()).toBe(9); // October = index 9
  });

  it('parses "23 октября в 19:00" → hasTime:true, 14:00 UTC, day 23', () => {
    const r = parseDateFull('23 октября в 19:00', 2026);
    expect(r).not.toBeNull();
    expect(r?.hasTime).toBe(true);
    expect(r?.date.getUTCHours()).toBe(14);
    expect(r?.date.getUTCDate()).toBe(23);
    expect(r?.date.getUTCMonth()).toBe(9); // October
  });
});

describe('parseDateFull — Format 4 (yandex "DD месяца, HH:MM")', () => {
  it('parses "15 сентября, 19:00" → hasTime:true, 14:00 UTC (NOT UTC midnight)', () => {
    const r = parseDateFull('15 сентября, 19:00', 2026);
    expect(r).not.toBeNull();
    expect(r?.hasTime).toBe(true);
    expect(r?.date.getUTCHours()).toBe(14);
    expect(r?.date.getUTCDate()).toBe(15);
    expect(r?.date.getUTCMonth()).toBe(8); // September = index 8
  });

  it('parses "12 декабря, 19:00" → hasTime:true, 14:00 UTC, month index 11', () => {
    const r = parseDateFull('12 декабря, 19:00', 2026);
    expect(r).not.toBeNull();
    expect(r?.hasTime).toBe(true);
    expect(r?.date.getUTCHours()).toBe(14);
    expect(r?.date.getUTCMonth()).toBe(11); // December = index 11
  });
});

describe('parseDateFull — hasTime flag across all formats', () => {
  it('returns hasTime:false for date-only Format 2 "15 апреля 2026"', () => {
    const r = parseDateFull('15 апреля 2026');
    expect(r).not.toBeNull();
    expect(r?.hasTime).toBe(false);
  });

  it('returns hasTime:true for Format 1 kassa-ugra "6 сен 20:00 Вс"', () => {
    const r = parseDateFull('6 сен 20:00 Вс', 2026);
    expect(r).not.toBeNull();
    expect(r?.hasTime).toBe(true);
    expect(r?.date.getUTCHours()).toBe(15); // 20:00 UTC+5 = 15:00 UTC
  });

  it('returns hasTime:false for relative label "сегодня"', () => {
    const r = parseDateFull('сегодня');
    expect(r).not.toBeNull();
    expect(r?.hasTime).toBe(false);
  });

  it('returns null for unrecognized input "garbage"', () => {
    expect(parseDateFull('garbage')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseDateFull('')).toBeNull();
  });

  it('never throws on adversarial input', () => {
    expect(() => parseDateFull('!!!@@###')).not.toThrow();
    expect(() => parseDateFull('12345678901234567890')).not.toThrow();
  });
});

describe('parseRussianDate backward compat via parseDateFull delegation', () => {
  it('"7 октября в 19:00" → 14:00 UTC (Format 3, not UTC midnight)', () => {
    const d = parseRussianDate('7 октября в 19:00', 2026);
    expect(d).not.toBeNull();
    expect(d?.getUTCHours()).toBe(14);
    expect(d?.getUTCDate()).toBe(7);
  });

  it('"15 сентября, 19:00" → 14:00 UTC (Format 4 wins over Format 2)', () => {
    const d = parseRussianDate('15 сентября, 19:00', 2026);
    expect(d).not.toBeNull();
    expect(d?.getUTCHours()).toBe(14); // NOT 0 (not UTC midnight)
  });
});
