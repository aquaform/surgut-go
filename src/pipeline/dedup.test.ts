/**
 * Tests for src/pipeline/dedup.ts — AGG-03 cross-source dedup proof.
 *
 * Covers:
 *  - Cross-source collapse to 1 record on composite key collision
 *  - Prefer-live policy: seed replaced by live on key collision (T-02-03 mitigated)
 *  - First-seen-wins stability when both records are live
 *  - Distinct events on different dates are NOT merged (length 2)
 *  - Same-day time difference (31 min) still produces a single merged record
 *  - Cyrillic titles produce distinct slugs — two different Cyrillic titles are NOT collapsed
 *
 * SCOPE BOUNDARY: this file only imports dedup from ./dedup.
 * src/pipeline/dedup.ts is NOT modified — see git diff --quiet assertion in acceptance.
 */

import { describe, it, expect } from 'vitest';
import { dedup } from './dedup';
import type { NormalizedEvent } from '../types/events';

// ---------------------------------------------------------------------------
// makeEvent helper
// ---------------------------------------------------------------------------

const FIXED_FETCHED_AT = new Date('2026-06-27T00:00:00.000Z');

function makeEvent(overrides: Partial<NormalizedEvent> & Pick<NormalizedEvent, 'title' | 'startDate' | 'venue'>): NormalizedEvent {
  return {
    id:          `id-${overrides.title}-${overrides.startDate.toISOString()}`,
    priceText:   'Бесплатно',
    isFree:      true,
    sourceName:  'source-a',
    sourceUrl:   `https://example.com/${encodeURIComponent(overrides.title)}`,
    category:    'concert' as const,
    tags:        [],
    fetchedAt:   FIXED_FETCHED_AT,
    isSeed:      false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// describe block
// ---------------------------------------------------------------------------

describe('dedup (AGG-03)', () => {

  it('cross-source: same title + date day + venue from two different sources collapses to 1', () => {
    const eventA = makeEvent({
      title:      'Рок-концерт',
      startDate:  new Date('2026-09-01T15:00:00Z'),
      venue:      'Клуб Восток',
      sourceName: 'source-a',
      isSeed:     false,
    });
    const eventB = makeEvent({
      title:      'Рок-концерт',
      startDate:  new Date('2026-09-01T15:00:00Z'),
      venue:      'Клуб Восток',
      sourceName: 'source-b',  // different source!
      isSeed:     false,
    });

    const result = dedup([eventA, eventB]);

    expect(result).toHaveLength(1);
  });

  it('prefer-live: seed first, then live — survivor is the live record (isSeed:false, sourceName:live)', () => {
    const seedRecord = makeEvent({
      title:      'Джазовый вечер',
      startDate:  new Date('2026-09-05T18:00:00Z'),
      venue:      'Филармония',
      sourceName: 'seed',
      isSeed:     true,
    });
    const liveRecord = makeEvent({
      title:      'Джазовый вечер',
      startDate:  new Date('2026-09-05T18:00:00Z'),
      venue:      'Филармония',
      sourceName: 'kassa-ugra',
      isSeed:     false,
    });

    const result = dedup([seedRecord, liveRecord]);

    expect(result).toHaveLength(1);
    expect(result[0]!.isSeed).toBe(false);
    expect(result[0]!.sourceName).toBe('kassa-ugra');
  });

  it('first-seen-wins stability: both live, first source record survives', () => {
    const first = makeEvent({
      title:      'Ночная дискотека',
      startDate:  new Date('2026-09-10T21:00:00Z'),
      venue:      'Disco Club',
      sourceName: 'source-a',
      isSeed:     false,
    });
    const second = makeEvent({
      title:      'Ночная дискотека',
      startDate:  new Date('2026-09-10T21:00:00Z'),
      venue:      'Disco Club',
      sourceName: 'source-b',
      isSeed:     false,
    });

    const result = dedup([first, second]);

    expect(result).toHaveLength(1);
    expect(result[0]!.sourceName).toBe('source-a');
    expect(result[0]!.isSeed).toBe(false);
  });

  it('distinct events on different dates are NOT merged (returns length 2)', () => {
    const eventSep1 = makeEvent({
      title:      'Выставка кошек',
      startDate:  new Date('2026-09-01T10:00:00Z'),
      venue:      'Выставочный центр',
      sourceName: 'source-a',
      isSeed:     false,
    });
    const eventSep2 = makeEvent({
      title:      'Выставка кошек',
      startDate:  new Date('2026-09-02T10:00:00Z'), // different date
      venue:      'Выставочный центр',
      sourceName: 'source-b',
      isSeed:     false,
    });

    const result = dedup([eventSep1, eventSep2]);

    expect(result).toHaveLength(2);
  });

  it('same calendar day 31 minutes apart — still collapses to 1 (key is date-day only, not time)', () => {
    const event900 = makeEvent({
      title:      'Утренний йога-класс',
      startDate:  new Date('2026-08-15T04:00:00Z'), // 09:00 UTC+5
      venue:      'Спортзал Олимп',
      sourceName: 'source-a',
      isSeed:     false,
    });
    const event931 = makeEvent({
      title:      'Утренний йога-класс',
      startDate:  new Date('2026-08-15T04:31:00Z'), // 09:31 UTC+5, still same calendar day
      venue:      'Спортзал Олимп',
      sourceName: 'source-b',
      isSeed:     false,
    });

    const result = dedup([event900, event931]);

    expect(result).toHaveLength(1);
  });

  it('two distinct Cyrillic titles produce different slugs — are NOT merged', () => {
    const event1 = makeEvent({
      title:      'Концерт группы Ария',
      startDate:  new Date('2026-09-20T19:00:00Z'),
      venue:      'Арена Сургут',
      sourceName: 'source-a',
      isSeed:     false,
    });
    const event2 = makeEvent({
      title:      'Концерт группы Кино',
      startDate:  new Date('2026-09-20T19:00:00Z'), // same date + venue
      venue:      'Арена Сургут',
      sourceName: 'source-a',
      isSeed:     false,
    });

    const result = dedup([event1, event2]);

    expect(result).toHaveLength(2);
    // Each Cyrillic title produces a unique slug — no collision
    const titles = result.map(e => e.title);
    expect(titles).toContain('Концерт группы Ария');
    expect(titles).toContain('Концерт группы Кино');
  });

});
