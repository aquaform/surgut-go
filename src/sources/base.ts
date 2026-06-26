import type { NormalizedEvent } from '../types/events';

/**
 * Contract every source adapter must satisfy.
 * The pipeline never imports concrete adapters — only this interface.
 *
 * Contract: scrape() either returns a non-empty NormalizedEvent[] or throws.
 * Returning an empty array is a bug; throw a descriptive Error instead.
 */
export interface SourceAdapter {
  /** Machine name used in NormalizedEvent.sourceName, e.g. 'kassa-ugra' */
  readonly name: string;
  /** Human-friendly label for UI, e.g. 'Касса Угра' */
  readonly displayName: string;
  /** Canonical home URL, e.g. 'https://kassa-ugra.ru' */
  readonly homeUrl: string;
  /** Per-request HTTP timeout in milliseconds */
  readonly timeoutMs: number;
  /**
   * Fetch and parse events from the source.
   * @returns Non-empty array of NormalizedEvent objects.
   * @throws Error with a descriptive message if scraping or parsing fails,
   *         or if fewer than 2 events are found (min-results guard per AGG-05).
   */
  scrape(): Promise<NormalizedEvent[]>;
}
