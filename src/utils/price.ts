/**
 * Russian price parsing utilities for Surgut event sources.
 *
 * Handles all price formats observed live in kassa-ugra.ru and afisha.surguta.ru:
 *   "5500 - 8800"     → range with spaces around dash
 *   "3500-7500"       → range without spaces
 *   "900"             → single price
 *   "300 руб."        → with Russian currency suffix
 *   "33 000 ₽"        → thousands with space (stripped before parsing)
 *   "бесплатно"       → free entry
 *   "Вход свободный"  → free entry (alternative phrasing)
 *   ""                → unknown price
 *
 * Never throws; returns a displayText fallback for all edge cases.
 */

export interface ParsedPrice {
  /** Minimum price in rubles, or null if unknown */
  minRub: number | null;
  /** Maximum price in rubles (for ranges), or null for single price / unknown */
  maxRub: number | null;
  /** True when the event is free to attend */
  isFree: boolean;
  /**
   * Human-readable display string.
   * "Бесплатно" | "от N ₽" | "min–max ₽" | "Цена не указана"
   */
  displayText: string;
}

const FREE_PATTERNS = /бесплатно|вход свободный|free/i;

/**
 * Parse a raw price string extracted from event source HTML.
 *
 * @param raw - Raw price text from source (may be empty)
 * @returns Normalized ParsedPrice; never throws.
 */
export function parseRussianPrice(raw: string): ParsedPrice {
  try {
    const text = raw.trim();

    // Free-entry detection: check before any numeric extraction
    if (FREE_PATTERNS.test(text)) {
      return { minRub: 0, maxRub: 0, isFree: true, displayText: 'Бесплатно' };
    }

    // Strip all whitespace from the entire string before extracting numbers.
    // This handles "33 000 ₽" → "33000₽" → [33000] and
    // "5500 - 8800" → "5500-8800" → [5500, 8800].
    const nums = text.replace(/\s/g, '').match(/\d+/g)?.map(Number) ?? [];

    if (nums.length === 0) {
      return {
        minRub: null,
        maxRub: null,
        isFree: false,
        displayText: 'Цена не указана',
      };
    }

    if (nums.length === 1) {
      return {
        minRub: nums[0],
        maxRub: null,
        isFree: false,
        displayText: `от ${nums[0]} ₽`,
      };
    }

    // Two or more numbers → treat as range
    const minRub = Math.min(...nums);
    const maxRub = Math.max(...nums);
    return {
      minRub,
      maxRub,
      isFree: false,
      displayText: `${minRub}–${maxRub} ₽`,
    };
  } catch {
    return { minRub: null, maxRub: null, isFree: false, displayText: 'Цена не указана' };
  }
}
