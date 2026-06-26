/**
 * Seed adapter — honest fallback with real Surgut event examples.
 *
 * Every event returned has isSeed:true (AGG-02 invariant).
 * The seed adapter never throws and never returns an empty array.
 * Events are drawn from real sources (kassa-ugra.ru, afisha.surguta.ru)
 * but served as clearly-labelled demo/cached data, not live.
 */

import { createHash } from 'node:crypto';
import type { SourceAdapter } from '../base';
import type { NormalizedEvent, EventCategory } from '../../types/events';
import seedDataRaw from './events.json';

/**
 * Shape of entries in events.json.
 * startDate/endDate are stored as ISO strings; the adapter revives them to Date.
 * fetchedAt and id are computed at runtime.
 */
interface SeedEventRaw {
  title: string;
  startDate: string;
  endDate?: string;
  venue: string;
  address?: string;
  priceText: string;
  priceMin?: number;
  priceMax?: number;
  isFree: boolean;
  sourceName: string;
  sourceUrl: string;
  category: EventCategory;
  tags: string[];
  ageLimit?: string;
  imageUrl?: string;
  isSeed: true;
}

const seedData = seedDataRaw as SeedEventRaw[];

/**
 * Compute deterministic SHA-1 event ID.
 * Formula: sha1(sourceName + sourceUrl + startDate.slice(0,10))
 */
function makeSeedId(sourceUrl: string, startDateIso: string): string {
  return createHash('sha1')
    .update('seed' + sourceUrl + startDateIso.slice(0, 10))
    .digest('hex');
}

export const seedAdapter: SourceAdapter = {
  name: 'seed',
  displayName: 'Демо-данные',
  homeUrl: '',
  timeoutMs: 0,

  async scrape(): Promise<NormalizedEvent[]> {
    const fetchedAt = new Date();
    return seedData.map((raw): NormalizedEvent => {
      const startDate = new Date(raw.startDate);
      const id = makeSeedId(raw.sourceUrl, raw.startDate);
      return {
        id,
        title: raw.title,
        startDate,
        endDate: raw.endDate !== undefined ? new Date(raw.endDate) : undefined,
        venue: raw.venue,
        address: raw.address,
        priceText: raw.priceText,
        priceMin: raw.priceMin,
        priceMax: raw.priceMax,
        isFree: raw.isFree,
        sourceName: 'seed',
        sourceUrl: raw.sourceUrl,
        category: raw.category,
        tags: raw.tags,
        ageLimit: raw.ageLimit,
        imageUrl: raw.imageUrl,
        fetchedAt,
        isSeed: true, // defensive stamp — AGG-02
      };
    });
  },
};
