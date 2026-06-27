/**
 * Tests for src/pipeline/index-events.ts — EventIndex coverage.
 *
 * Covers:
 *  - all() returns events sorted by startDate ASC regardless of input order
 *  - byCategory(cat) returns only events of that category, sorted ASC
 *  - byCategory(cat) returns [] for a category with no events
 *  - rebuild(newEvents) atomically replaces contents; all() reflects only new events
 *  - buildEventIndex([]) edge case — all() === [] and byCategory(anything) === []
 *
 * src/pipeline/index-events.ts is NOT modified — test-only plan.
 */

import { describe, it, expect } from 'vitest';
import { buildEventIndex } from './index-events';
import type { NormalizedEvent, EventCategory } from '../types/events';

// ---------------------------------------------------------------------------
// makeEvent helper
// ---------------------------------------------------------------------------

const FIXED_FETCHED_AT = new Date('2026-06-27T00:00:00.000Z');

function makeEvent(
  overrides: Partial<NormalizedEvent> & Pick<NormalizedEvent, 'title' | 'startDate' | 'category'>,
): NormalizedEvent {
  return {
    id:         `id-${overrides.title}`,
    title:      overrides.title,
    startDate:  overrides.startDate,
    venue:      overrides.venue ?? 'Test Venue',
    priceText:  'Бесплатно',
    isFree:     true,
    sourceName: overrides.sourceName ?? 'seed',
    sourceUrl:  `https://example.com/${encodeURIComponent(overrides.title)}`,
    category:   overrides.category,
    tags:       overrides.tags ?? [],
    fetchedAt:  FIXED_FETCHED_AT,
    isSeed:     overrides.isSeed ?? true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONCERT_LATE = makeEvent({
  title:     'Вечерний концерт',
  startDate: new Date('2026-09-10T18:00:00Z'), // later
  category:  'concert',
});

const CONCERT_EARLY = makeEvent({
  title:     'Утренний концерт',
  startDate: new Date('2026-09-10T06:00:00Z'), // earlier
  category:  'concert',
});

const EXHIBITION_MID = makeEvent({
  title:     'Выставка картин',
  startDate: new Date('2026-09-10T10:00:00Z'),
  category:  'exhibition',
});

// ---------------------------------------------------------------------------
// describe block
// ---------------------------------------------------------------------------

describe('EventIndex', () => {

  describe('all()', () => {
    it('returns events sorted by startDate ASC regardless of input order', () => {
      // Feed deliberately in wrong order: late, exhibition, early
      const index = buildEventIndex([CONCERT_LATE, EXHIBITION_MID, CONCERT_EARLY]);
      const all = index.all();

      expect(all).toHaveLength(3);
      expect(all[0]!.title).toBe(CONCERT_EARLY.title);   // 06:00
      expect(all[1]!.title).toBe(EXHIBITION_MID.title);  // 10:00
      expect(all[2]!.title).toBe(CONCERT_LATE.title);    // 18:00
    });

    it('returns [] for empty index', () => {
      const index = buildEventIndex([]);
      expect(index.all()).toHaveLength(0);
    });
  });

  describe('byCategory()', () => {
    it('returns only events of the requested category, sorted ASC', () => {
      const index = buildEventIndex([CONCERT_LATE, EXHIBITION_MID, CONCERT_EARLY]);
      const concerts = index.byCategory('concert' as EventCategory);

      expect(concerts).toHaveLength(2);
      // sorted by startDate ASC within category
      expect(concerts[0]!.title).toBe(CONCERT_EARLY.title);
      expect(concerts[1]!.title).toBe(CONCERT_LATE.title);
    });

    it('returns [] for a category with no events', () => {
      const index = buildEventIndex([CONCERT_EARLY, EXHIBITION_MID]);
      const sports = index.byCategory('sport' as EventCategory);

      expect(sports).toHaveLength(0);
      expect(Array.isArray(sports)).toBe(true);
    });

    it('returns [] on an empty index for any category', () => {
      const index = buildEventIndex([]);
      expect(index.byCategory('concert' as EventCategory)).toHaveLength(0);
      expect(index.byCategory('theater' as EventCategory)).toHaveLength(0);
    });
  });

  describe('rebuild()', () => {
    it('atomically replaces contents — all() reflects new array and excludes prior events', () => {
      const oldEvents = [CONCERT_LATE, CONCERT_EARLY];
      const index = buildEventIndex(oldEvents);

      // Verify initial state
      expect(index.all()).toHaveLength(2);

      // Rebuild with a completely different set
      const newEvent = makeEvent({
        title:     'Новое событие после rebuild',
        startDate: new Date('2026-10-01T12:00:00Z'),
        category:  'lecture',
      });
      index.rebuild([newEvent]);

      const afterRebuild = index.all();
      expect(afterRebuild).toHaveLength(1);
      expect(afterRebuild[0]!.title).toBe(newEvent.title);

      // Old events must be gone
      const titlesAfter = afterRebuild.map(e => e.title);
      expect(titlesAfter).not.toContain(CONCERT_LATE.title);
      expect(titlesAfter).not.toContain(CONCERT_EARLY.title);
    });

    it('rebuild to empty clears the index', () => {
      const index = buildEventIndex([CONCERT_EARLY, EXHIBITION_MID]);
      index.rebuild([]);

      expect(index.all()).toHaveLength(0);
      expect(index.byCategory('concert' as EventCategory)).toHaveLength(0);
    });

    it('byCategory reflects the new set after rebuild', () => {
      const index = buildEventIndex([CONCERT_EARLY]);

      // Before rebuild: concert category has 1 event
      expect(index.byCategory('concert' as EventCategory)).toHaveLength(1);

      // Rebuild with only an exhibition
      index.rebuild([EXHIBITION_MID]);

      // After rebuild: concert gone, exhibition present
      expect(index.byCategory('concert' as EventCategory)).toHaveLength(0);
      expect(index.byCategory('exhibition' as EventCategory)).toHaveLength(1);
    });
  });

});
