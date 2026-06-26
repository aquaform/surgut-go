/**
 * Phase-1 event deduplication — minimal exact-key approach.
 *
 * SCOPE BOUNDARY: This is the MINIMAL Phase-1 dedup using a SHA-1 composite key.
 * The full fuzzy dedup (±30 min window + venue edit-distance) is Phase-2 scope (AGG-03).
 * Do NOT extend this module to handle fuzzy matching — that belongs in a new Phase-2 file.
 *
 * Dedup key: sha1(titleSlug | startDate-day | venueSlug)
 *
 * Collision policy (prefer live over seed):
 *   - If existing is seed (isSeed:true) and incoming is live (isSeed:false): replace with live.
 *   - Otherwise: first-seen wins (stable order preserved).
 *
 * This is a pure function — no I/O, no side effects, input array is not mutated.
 */

import { createHash } from 'node:crypto';
import type { NormalizedEvent } from '../types/events';

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

/**
 * Normalise a text string to a URL-safe slug.
 * Handles Cyrillic and Latin letters, digits; collapses punctuation/spaces to hyphen.
 */
function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-') // non-letter/digit runs → single hyphen
    .replace(/^-+|-+$/g, '');          // strip leading/trailing hyphens
}

// ---------------------------------------------------------------------------
// Event key
// ---------------------------------------------------------------------------

/**
 * Compute the Phase-1 dedup key for an event.
 * Key components:
 *   titleSlug  — lowercased, punctuation-normalised title
 *   dateDay    — YYYY-MM-DD (UTC) — strips time to allow same-day collisions
 *   venueSlug  — lowercased, punctuation-normalised venue name
 */
function eventKey(event: NormalizedEvent): string {
  const titleSlug = toSlug(event.title);
  const dateDay = event.startDate.toISOString().slice(0, 10); // YYYY-MM-DD
  const venueSlug = toSlug(event.venue);
  const raw = `${titleSlug}|${dateDay}|${venueSlug}`;
  return createHash('sha1').update(raw).digest('hex');
}

// ---------------------------------------------------------------------------
// dedup
// ---------------------------------------------------------------------------

/**
 * Deduplicate a flat event array using the Phase-1 composite key.
 *
 * On key collision:
 *   - Existing is seed (isSeed:true) + incoming is live (isSeed:false) → replace with live.
 *   - All other collisions: keep first-seen (stable).
 *
 * @param events - Flat array of events (may contain duplicates; not mutated)
 * @returns New deduplicated array in insertion order
 */
export function dedup(events: NormalizedEvent[]): NormalizedEvent[] {
  const seen = new Map<string, NormalizedEvent>();

  for (const event of events) {
    const key = eventKey(event);
    const existing = seen.get(key);

    if (existing === undefined) {
      seen.set(key, event);
    } else if (existing.isSeed && !event.isSeed) {
      // Incoming live record wins over existing seed record
      seen.set(key, event);
    }
    // Otherwise: keep first-seen (existing stays)
  }

  return Array.from(seen.values());
}
