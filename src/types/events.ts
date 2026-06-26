/**
 * Domain type definitions — single source of truth for the entire pipeline.
 * All downstream plans import from this module.
 */

export type SourceStatus = 'live' | 'cached' | 'blocked' | 'error' | 'seed';

export type EventCategory =
  | 'concert'
  | 'club'
  | 'theater'
  | 'exhibition'
  | 'lecture'
  | 'sport'
  | 'standup'
  | 'other';

export type Mood = 'drink' | 'dance' | 'learn' | 'music';

/**
 * Normalised event model. Produced by every source adapter.
 * `isSeed: true` events are honest demo data — never presented as live.
 */
export interface NormalizedEvent {
  /** Deterministic id: sha1(sourceName + sourceUrl + startDate.toISOString().slice(0,10)) */
  id: string;
  title: string;
  /** UTC timestamp; Surgut is UTC+5 — subtract 5 h when converting from local */
  startDate: Date;
  /** Set for exhibitions with an explicit end date */
  endDate?: Date;
  venue: string;
  address?: string;
  /** Normalised display: "Бесплатно" | "от 500 ₽" | "5500–8800 ₽" | "Цена не указана" */
  priceText: string;
  priceMin?: number;
  priceMax?: number;
  isFree: boolean;
  /** Machine name: 'kassa-ugra' | 'afisha-surguta' | 'seed' */
  sourceName: string;
  /** Direct URL to this event */
  sourceUrl: string;
  category: EventCategory;
  tags: string[];
  /** e.g. "18+" | "6+" | "0+" */
  ageLimit?: string;
  imageUrl?: string;
  /** UTC timestamp of when this event was scraped */
  fetchedAt: Date;
  /**
   * Required (non-optional per AGG-02): true → demo/seed data; shown with "Демо" badge.
   * Never expose seed events as live.
   */
  isSeed: boolean;
}

/** Per-source status as returned by GET /api/sources/status */
export interface SourceResult {
  /** Machine name: 'kassa-ugra' | 'afisha-surguta' | 'seed' */
  name: string;
  displayName: string;
  homeUrl: string;
  status: SourceStatus;
  eventCount: number;
  fetchedAt: Date | null;
  /** Human-readable only — no stack traces */
  error?: string;
}

/** Schema of the JSON cache file written to disk */
export interface CacheFile {
  version: 1;
  /** ISO 8601 UTC timestamp of when the cache was written */
  savedAt: string;
  sources: SourceResult[];
  events: NormalizedEvent[];
}
