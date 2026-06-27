/**
 * Shared event serializer — single source of truth for JSON output shape.
 *
 * Used by both /api/events and /api/recommendations so that
 * Date-field formatting never drifts between routes (Pitfall 5).
 *
 * `isSeed` is preserved as-is — never mislabelled (AGG-02).
 */

import type { NormalizedEvent } from '../types/events';

/**
 * Plain-object representation of a NormalizedEvent ready for JSON serialization.
 * All Date fields are serialized as ISO 8601 UTC strings.
 * 17 fields — identical shape to the previous inline serializeEvent() in events.ts.
 */
export interface SerializedEvent {
  id:         string;
  title:      string;
  startDate:  string;
  endDate:    string | undefined;
  venue:      string;
  address:    string | undefined;
  priceText:  string;
  priceMin:   number | undefined;
  priceMax:   number | undefined;
  isFree:     boolean;
  sourceName: string;
  sourceUrl:  string;
  category:   string;
  tags:       string[];
  ageLimit:   string | undefined;
  imageUrl:   string | undefined;
  fetchedAt:  string;
  isSeed:     boolean;
}

/**
 * Convert a NormalizedEvent to a plain object with ISO strings for all Date
 * fields, ready for JSON serialization.
 *
 * `isSeed` is preserved as-is — never mislabelled (AGG-02).
 */
export function serializeEvent(e: NormalizedEvent): SerializedEvent {
  return {
    id:         e.id,
    title:      e.title,
    startDate:  e.startDate.toISOString(),
    endDate:    e.endDate?.toISOString(),
    venue:      e.venue,
    address:    e.address,
    priceText:  e.priceText,
    priceMin:   e.priceMin,
    priceMax:   e.priceMax,
    isFree:     e.isFree,
    sourceName: e.sourceName,
    sourceUrl:  e.sourceUrl,
    category:   e.category,
    tags:       e.tags,
    ageLimit:   e.ageLimit,
    imageUrl:   e.imageUrl,
    fetchedAt:  e.fetchedAt.toISOString(),
    isSeed:     e.isSeed,
  };
}
