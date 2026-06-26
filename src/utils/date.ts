/**
 * Russian date parsing utilities for Surgut-based event sources.
 *
 * Handles all date formats observed in live kassa-ugra.ru and afisha.surguta.ru sources:
 *   Format 1 (kassa-ugra listing): "DD ммм HH:MM [Ч]" e.g. "6 сен 20:00 Вс"
 *   Format 2 (afisha.surguta + kassa-ugra headers): "DD месяца [,] [YYYY]" e.g. "15 апреля 2026"
 *   Range (afisha.surguta exhibitions): "DD месяца - DD месяца YYYY" → start date extracted
 *   Relative labels: "сегодня", "завтра"
 *
 * All dates with known local time are converted from Surgut local (UTC+5) to UTC.
 * Dates without a known time are stored as UTC midnight on the same calendar date.
 */

/** Full months, genitives and abbreviations observed in both GREEN sources */
export const RU_MONTHS: Record<string, number> = {
  // Full nominative (kassa-ugra section headers)
  'январь': 1, 'февраль': 2, 'март': 3, 'апрель': 4,
  'май': 5, 'июнь': 6, 'июль': 7, 'август': 8,
  'сентябрь': 9, 'октябрь': 10, 'ноябрь': 11, 'декабрь': 12,
  // Genitive (afisha.surguta.ru dates; kassa-ugra detail pages)
  'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4,
  'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8,
  'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12,
  // Abbreviations (kassa-ugra listing page)
  'янв': 1, 'фев': 2, 'мар': 3, 'апр': 4,
  // 'май'/'мая' already covered above — no abbreviation needed
  'июн': 6, 'июл': 7, 'авг': 8,
  'сен': 9, 'окт': 10, 'ноя': 11, 'дек': 12,
};

/** Surgut is Asia/Yekaterinburg = UTC+5, no DST since 2014 */
export const SURGUT_UTC_OFFSET = 5;

/**
 * Parse a Russian-language date string and return a UTC Date.
 *
 * @param text  - Raw date string from source HTML (any observed format)
 * @param refYear - Reference year for date strings without an explicit year.
 *                  Defaults to the current UTC year.
 * @returns UTC Date on success, null on any unrecognized / unparseable input.
 *          Never throws.
 */
export function parseRussianDate(text: string, refYear?: number): Date | null {
  if (!text) return null;

  try {
    const now = new Date();
    const year = refYear ?? now.getUTCFullYear();

    // Handle date ranges "DD месяца - DD месяца [YYYY]" → use only the start date
    const rangeMatch = text.match(/^(.+?)\s+-\s+.+$/);
    const startText = rangeMatch ? rangeMatch[1].trim() : text.trim();

    // Format 1 (kassa-ugra listing): "DD ммм HH:MM [weekday]"
    // e.g. "6 сен 20:00 Вс", "15 янв 19:00"
    const m1 = startText.match(/^(\d{1,2})\s+([а-яёА-ЯЁ]+)\s+(\d{2}):(\d{2})/i);
    if (m1) {
      const [, d, mon, hh, mm] = m1;
      const month = RU_MONTHS[mon.toLowerCase()];
      if (!month) return null;
      const resolvedYear = inferYear(+d, month, year);
      return toUTC(resolvedYear, month, +d, +hh, +mm);
    }

    // Format 2 (afisha.surguta listing + kassa-ugra section headers):
    // "DD месяца [,] [YYYY]" — optional comma before year
    // e.g. "15 апреля 2026", "22 октября, 2026"
    const m2 = startText.match(/^(\d{1,2})\s+([а-яёА-ЯЁ]+)\s*,?\s*(\d{4})?/i);
    if (m2) {
      const [, d, mon, yr] = m2;
      const month = RU_MONTHS[mon.toLowerCase()];
      if (!month) return null;
      const resolvedYear = yr ? +yr : inferYear(+d, month, year);
      // For date-only (no time specified), store as UTC midnight on the same calendar date.
      // We do NOT apply the UTC+5 offset here because the exact start time is unknown.
      return new Date(Date.UTC(resolvedYear, month - 1, +d, 0, 0, 0));
    }

    // Relative labels
    const lower = startText.toLowerCase().trim();
    if (lower === 'сегодня') {
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    }
    if (lower === 'завтра') {
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      return tomorrow;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Convert a Surgut local time (UTC+5) to UTC.
 * Handles hour underflow (midnight local → previous day 19:00 UTC).
 */
function toUTC(year: number, month: number, day: number, localHour: number, minute: number): Date {
  let utcHour = localHour - SURGUT_UTC_OFFSET;
  let utcDay = day;
  if (utcHour < 0) {
    utcHour += 24;
    utcDay -= 1;
  }
  return new Date(Date.UTC(year, month - 1, utcDay, utcHour, minute));
}

/**
 * Infer the year for a date string that omits the year.
 * If the parsed month is earlier than the current calendar month,
 * the event must be next year (prevents showing stale past dates).
 */
function inferYear(day: number, month: number, refYear: number): number {
  const refMonth = new Date().getUTCMonth() + 1; // 1-based current month
  return month < refMonth ? refYear + 1 : refYear;
}
