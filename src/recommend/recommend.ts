/**
 * Pure recommendation engine: matching, scoring, and reason generation.
 *
 * Rules:
 * - No I/O, no network, no Fastify — pure functions only.
 * - `now` is always an injected parameter; never calls new Date() internally.
 *   This makes tests deterministic (T-02-01).
 * - Events with effectiveDate < now receive score -1 and are excluded.
 * - Still-running exhibitions (startDate < now, endDate > now) are treated
 *   as "today" events to avoid hiding ongoing exhibitions from learn mood.
 */

import type { NormalizedEvent, Mood, EventCategory } from '../types/events';
import type { MoodMapping } from './mood-map';

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

/** Surgut is permanently UTC+5 (Asia/Yekaterinburg, no DST). */
const SURGUT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Human-readable Russian labels for each EventCategory (reason fallback). */
const CATEGORY_LABELS: Record<EventCategory, string> = {
  concert:    'Концерт',
  club:       'Клубное мероприятие',
  theater:    'Театр',
  exhibition: 'Выставка',
  lecture:    'Лекция / образование',
  sport:      'Спорт',
  standup:    'Стендап',
  other:      'Мероприятие',
};

// ──────────────────────────────────────────────────────────────────────────────
// Matching
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when the event is a candidate for the given mood mapping.
 *
 * Match order (any one is sufficient):
 * 1. event.category is in mapping.categories
 * 2. Any mapping.titleKeywords keyword is a substring of event.title.toLowerCase()
 * 3. Any mapping.venueKeywords keyword is a substring of event.venue.toLowerCase()
 *
 * Tags are NOT checked — live data confirms they are sparse (most events have []).
 */
export function isEventMatchForMood(
  event: NormalizedEvent,
  mapping: MoodMapping,
): boolean {
  // 1. Category match (primary)
  if (mapping.categories.includes(event.category)) return true;

  // 2. Title keyword match (compensates for sparse tags)
  const titleLower = event.title.toLowerCase();
  if (mapping.titleKeywords.some(kw => titleLower.includes(kw))) return true;

  // 3. Venue keyword match
  const venueLower = event.venue.toLowerCase();
  if (mapping.venueKeywords.some(kw => venueLower.includes(kw))) return true;

  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// Reason text
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Derives a "Почему рекомендовано" reason string for one event + mood pair.
 *
 * Precedence (MOOD-03):
 * 1. Venue match   → "Площадка подходит: <venue>"
 * 2. Title keyword → up to 2 matched keywords, capitalized, joined with " · "
 * 3. Category      → CATEGORY_LABELS fallback
 */
export function buildReasonText(
  event: NormalizedEvent,
  mapping: MoodMapping,
): string {
  // 1. Venue match (highest confidence)
  const venueLower = event.venue.toLowerCase();
  if (mapping.venueKeywords.some(kw => venueLower.includes(kw))) {
    return `Площадка подходит: ${event.venue}`;
  }

  // 2. Title keyword match
  const titleLower = event.title.toLowerCase();
  const matched = mapping.titleKeywords.filter(kw => titleLower.includes(kw));
  if (matched.length > 0) {
    const labels = matched
      .slice(0, 2)
      .map(kw => kw.charAt(0).toUpperCase() + kw.slice(1));
    return labels.join(' · ');
  }

  // 3. Category fallback
  return CATEGORY_LABELS[event.category] ?? 'Мероприятие';
}

// ──────────────────────────────────────────────────────────────────────────────
// Scoring
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Computes a descending sort score for one event.
 *
 * Returns -1 when the event's effective date is in the past (exclude it).
 *
 * Effective date rule:
 * - Normally effectiveDate = event.startDate
 * - Exception: still-running exhibitions (startDate < now AND endDate exists
 *   AND endDate > now) → effectiveDate = now, so the event counts as "today"
 *
 * Score buckets (Surgut local time, UTC+5):
 * | Bucket          | drink/dance | learn/music |
 * |-----------------|-------------|-------------|
 * | today + evening | 110–113     | 100–103     |
 * | today daytime   | 90–93       | 90–93       |
 * | tomorrow        | 80–83       | 80–83       |
 * | future          | 1–70        | 1–70        |
 *
 * Completeness bonus (0–3): imageUrl present (+1), priceText known (+1),
 * venue non-empty (+1).
 */
function scoreEvent(event: NormalizedEvent, mood: Mood, now: Date): number {
  // Determine the effective date (still-running exhibition pinning)
  let effectiveDate: Date;
  if (
    event.startDate.getTime() < now.getTime() &&
    event.endDate !== undefined &&
    event.endDate.getTime() > now.getTime()
  ) {
    // Still running — treat as "today" for ranking
    effectiveDate = now;
  } else {
    effectiveDate = event.startDate;
  }

  // Exclude events in the past
  if (effectiveDate.getTime() < now.getTime()) return -1;

  // Convert effective date to Surgut local time for day/hour comparison
  const localMs = effectiveDate.getTime() + SURGUT_OFFSET_MS;
  const local = new Date(localMs);
  const nowLocalMs = now.getTime() + SURGUT_OFFSET_MS;
  const nowLocal = new Date(nowLocalMs);

  const isToday =
    local.getUTCFullYear() === nowLocal.getUTCFullYear() &&
    local.getUTCMonth() === nowLocal.getUTCMonth() &&
    local.getUTCDate() === nowLocal.getUTCDate();

  const isTomorrow =
    local.getUTCFullYear() === nowLocal.getUTCFullYear() &&
    local.getUTCMonth() === nowLocal.getUTCMonth() &&
    local.getUTCDate() === nowLocal.getUTCDate() + 1;

  const localHour = local.getUTCHours(); // hour in Surgut local time
  const isEvening = localHour >= 17;

  // Evening boost only for drink and dance moods
  const eveningBoost = mood === 'drink' || mood === 'dance' ? 10 : 0;

  // Completeness bonus (0–3)
  const completeness =
    (event.imageUrl ? 1 : 0) +
    (event.priceText !== 'Цена не указана' ? 1 : 0) +
    (event.venue.length > 0 ? 1 : 0);

  // Base score by temporal bucket
  let base: number;
  if (isToday && isEvening) {
    base = 100 + eveningBoost;
  } else if (isToday) {
    base = 90;
  } else if (isTomorrow) {
    base = 80;
  } else {
    // Future: decay by days away (max 70, min 1)
    const daysAway =
      (effectiveDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    base = Math.max(1, 70 - Math.floor(daysAway));
  }

  return base + completeness;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

export interface Recommendation {
  event: NormalizedEvent;
  reason: string;
}

/**
 * Returns ranked recommendations for a mood.
 *
 * Steps:
 * 1. Filter: isEventMatchForMood AND scoreEvent >= 0 (future/ongoing only)
 * 2. Sort: descending by score
 * 3. Cap: top 50
 * 4. Attach: buildReasonText for each item
 *
 * @param mood     - One of the 4 supported moods
 * @param mapping  - The MoodMapping for this mood (from MOOD_MAPPINGS)
 * @param events   - Full event list (from EventIndex.all())
 * @param now      - Reference time (injected for determinism; never call new Date() here)
 */
export function getRecommendations(
  mood: Mood,
  mapping: MoodMapping,
  events: NormalizedEvent[],
  now: Date,
): Recommendation[] {
  // Score each event that matches the mood
  type Scored = { event: NormalizedEvent; score: number };
  const scored: Scored[] = [];

  for (const event of events) {
    if (!isEventMatchForMood(event, mapping)) continue;
    const score = scoreEvent(event, mood, now);
    if (score < 0) continue; // past event
    scored.push({ event, score });
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Cap and attach reasons
  return scored.slice(0, 50).map(({ event }) => ({
    event,
    reason: buildReasonText(event, mapping),
  }));
}
