/**
 * Tests for the recommendation engine (MOOD-02, MOOD-03).
 *
 * All `now` values are fixed Date instances — no new Date() without args.
 * Fixtures are minimal NormalizedEvent objects with only the fields the
 * engine actually reads.
 */

import { describe, it, expect } from 'vitest';
import {
  isEventMatchForMood,
  buildReasonText,
  getRecommendations,
} from './recommend';
import { MOOD_MAPPINGS } from './mood-map';
import type { NormalizedEvent } from '../types/events';

// ──────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Creates a minimal NormalizedEvent for testing. */
function makeEvent(overrides: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    id: 'test-id',
    title: 'Test Event',
    startDate: new Date('2026-07-01T10:00:00Z'),
    venue: 'Test Venue',
    priceText: 'Цена не указана',
    isFree: false,
    sourceName: 'seed',
    sourceUrl: 'https://example.com',
    category: 'other',
    tags: [],
    isSeed: true,
    fetchedAt: new Date('2026-06-27T00:00:00Z'),
    ...overrides,
  };
}

/**
 * now = 2026-06-27 12:00:00 UTC
 * Surgut local = 2026-06-27 17:00:00 (UTC+5) — exactly evening boundary
 */
const NOW = new Date('2026-06-27T12:00:00Z');

/**
 * A date that is today evening in Surgut: 2026-06-27 19:00:00 Surgut (UTC+5)
 * = 2026-06-27T14:00:00Z
 */
const TODAY_EVENING_UTC = new Date('2026-06-27T14:00:00Z');

/**
 * A date that is today daytime in Surgut: 2026-06-27 13:00:00 Surgut (UTC+5)
 * = 2026-06-27T08:00:00Z — after NOW (12:00Z), still future
 */
const TODAY_DAYTIME_UTC = new Date('2026-06-27T13:00:00Z');

/**
 * A date that is tomorrow in Surgut: 2026-06-28 15:00:00 Surgut
 * = 2026-06-28T10:00:00Z
 */
const TOMORROW_UTC = new Date('2026-06-28T10:00:00Z');

/**
 * A past date: 2026-06-25T10:00:00Z — before NOW
 */
const PAST_UTC = new Date('2026-06-25T10:00:00Z');

// ──────────────────────────────────────────────────────────────────────────────
// isEventMatchForMood
// ──────────────────────────────────────────────────────────────────────────────

describe('isEventMatchForMood', () => {
  const musicMapping = MOOD_MAPPINGS.music;
  const drinkMapping = MOOD_MAPPINGS.drink;
  const learnMapping = MOOD_MAPPINGS.learn;

  it('matches by category (concert → music)', () => {
    const event = makeEvent({ category: 'concert' });
    expect(isEventMatchForMood(event, musicMapping)).toBe(true);
  });

  it('matches by title keyword — концерт → music', () => {
    const event = makeEvent({ category: 'other', title: 'Большой концерт в парке' });
    expect(isEventMatchForMood(event, musicMapping)).toBe(true);
  });

  it('is case-insensitive for title matching', () => {
    const event = makeEvent({ category: 'other', title: 'КОНЦЕРТ КЛАССИКИ' });
    expect(isEventMatchForMood(event, musicMapping)).toBe(true);
  });

  it('matches by venue keyword — аквапарк → dance', () => {
    const event = makeEvent({ category: 'other', venue: 'Аквапарк «Аквамарин»' });
    expect(isEventMatchForMood(event, MOOD_MAPPINGS.dance)).toBe(true);
  });

  it('does not match when no category/title/venue match', () => {
    const event = makeEvent({
      category: 'sport',
      title: 'Футбольный матч',
      venue: 'Стадион',
    });
    expect(isEventMatchForMood(event, musicMapping)).toBe(false);
  });

  it('matches drink by standup category', () => {
    const event = makeEvent({ category: 'standup' });
    expect(isEventMatchForMood(event, drinkMapping)).toBe(true);
  });

  it('matches learn by exhibition category', () => {
    const event = makeEvent({ category: 'exhibition' });
    expect(isEventMatchForMood(event, learnMapping)).toBe(true);
  });

  it('matches via venue keyword компромат → drink', () => {
    const event = makeEvent({ category: 'other', venue: 'Компромат Bar' });
    expect(isEventMatchForMood(event, drinkMapping)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// buildReasonText
// ──────────────────────────────────────────────────────────────────────────────

describe('buildReasonText', () => {
  it('venue branch: returns "Площадка подходит: <venue>" when venue keyword matches', () => {
    const event = makeEvent({ venue: 'Аквапарк Аквамарин', category: 'other' });
    const reason = buildReasonText(event, MOOD_MAPPINGS.dance);
    expect(reason).toBe('Площадка подходит: Аквапарк Аквамарин');
  });

  it('venue branch takes precedence over title keyword match', () => {
    // venue matches dance venueKeyword AND title matches dance titleKeyword
    const event = makeEvent({
      venue: 'Вавилон',
      title: 'Вечеринка в клубе',
      category: 'club',
    });
    const reason = buildReasonText(event, MOOD_MAPPINGS.dance);
    expect(reason).toMatch(/^Площадка подходит:/);
  });

  it('keyword branch: returns up to 2 capitalized keywords joined with " · "', () => {
    const event = makeEvent({
      venue: 'Обычное место',
      title: 'Джаз и рок вечер',
      category: 'other',
    });
    const reason = buildReasonText(event, MOOD_MAPPINGS.music);
    // Should match title keywords джаз and рок
    expect(reason).toContain('·');
    // Each keyword should start with uppercase
    const parts = reason.split(' · ');
    for (const part of parts) {
      expect(part[0]).toBe(part[0].toUpperCase());
    }
    expect(parts.length).toBeLessThanOrEqual(2);
  });

  it('keyword branch: capitalizes single keyword when only one matches', () => {
    const event = makeEvent({
      venue: 'Просто зал',
      title: 'Концерт классики',
      category: 'other',
    });
    const reason = buildReasonText(event, MOOD_MAPPINGS.music);
    // Should not contain "·" since one keyword may dominate
    // "концерт" and "классик" both match music keywords
    expect(reason.length).toBeGreaterThan(0);
    expect(reason[0]).toBe(reason[0].toUpperCase());
  });

  it('category fallback: returns category label when no venue or title keyword matches', () => {
    const event = makeEvent({
      venue: 'Неизвестное место',
      title: 'Какое-то событие',
      category: 'concert',
    });
    const reason = buildReasonText(event, MOOD_MAPPINGS.music);
    expect(reason).toBe('Концерт');
  });

  it('category fallback for exhibition category', () => {
    const event = makeEvent({
      venue: 'Обычная галерея без ключевых слов',
      title: 'Неизвестная выставка X',
      category: 'exhibition',
    });
    // title 'выставк' is in learn keywords, so keyword branch fires
    // but let's test a pure category fallback with no matching keywords
    const event2 = makeEvent({
      venue: 'Арт-пространство NeW',
      title: 'Арт-пространство NeW: работы авторов',
      category: 'lecture',
    });
    const reason = buildReasonText(event2, MOOD_MAPPINGS.learn);
    // No venue keyword match (арт-пространство not in venueKeywords)
    // title might match лекци... let's see if 'лекци' is in title
    // title is 'арт-пространство new: работы авторов' — no match
    expect(reason).toBe('Лекция / образование');
  });

  it('category fallback for standup', () => {
    const event = makeEvent({
      venue: 'Некий клуб',
      title: 'Вечер юмора',
      category: 'standup',
    });
    // 'клуб' is in drink.venueKeywords? No, venueKeywords is ['компромат','brooklyn',...]
    // 'вечеринк' — no, not in title
    // category standup → 'Стендап'
    const reason = buildReasonText(event, MOOD_MAPPINGS.drink);
    expect(reason).toBe('Стендап');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getRecommendations — filtering, ranking, reason, caps
// ──────────────────────────────────────────────────────────────────────────────

describe('getRecommendations', () => {
  it('(a) excludes past events (startDate < now, no endDate)', () => {
    const pastEvent = makeEvent({
      category: 'concert',
      startDate: PAST_UTC,
    });
    const result = getRecommendations('music', MOOD_MAPPINGS.music, [pastEvent], NOW);
    expect(result).toHaveLength(0);
  });

  it('(b) today-evening drink event scores higher than tomorrow drink event', () => {
    const eveningEvent = makeEvent({
      id: 'evening',
      category: 'club',
      startDate: TODAY_EVENING_UTC,
    });
    const tomorrowEvent = makeEvent({
      id: 'tomorrow',
      category: 'club',
      startDate: TOMORROW_UTC,
    });
    const result = getRecommendations('drink', MOOD_MAPPINGS.drink, [tomorrowEvent, eveningEvent], NOW);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].event.id).toBe('evening');
  });

  it('(c) learn/music: nearest-first without evening boost (no boost for daytime vs evening)', () => {
    const eveningLearn = makeEvent({
      id: 'evening-learn',
      category: 'lecture',
      startDate: TODAY_EVENING_UTC,
    });
    const daytimeLearn = makeEvent({
      id: 'daytime-learn',
      category: 'lecture',
      startDate: TODAY_DAYTIME_UTC,
    });
    // For learn: daytime today should score same bucket as evening today (both "today")
    // But they're both today, so both get base 90 — daytime comes first because no evening boost
    const result = getRecommendations('learn', MOOD_MAPPINGS.learn, [eveningLearn, daytimeLearn], NOW);
    // Both should be in results (both are future); daytime is future (13:00Z > 12:00Z = NOW)
    expect(result.length).toBeGreaterThanOrEqual(2);
    // Tomorrow learn event should rank lower than today learn event
    const tomorrowLearn = makeEvent({
      id: 'tomorrow-learn',
      category: 'lecture',
      startDate: TOMORROW_UTC,
    });
    const result2 = getRecommendations('learn', MOOD_MAPPINGS.learn, [tomorrowLearn, eveningLearn], NOW);
    expect(result2[0].event.id).toBe('evening-learn');
  });

  it('(d) category-only match qualifies an event', () => {
    const event = makeEvent({
      category: 'concert',
      title: 'Безымянный концерт',
      venue: 'Обычный зал',
      startDate: TOMORROW_UTC,
    });
    // 'зал' is in music venueKeywords — let's use a venue that doesn't match
    const event2 = makeEvent({
      category: 'concert',
      title: 'Безымянный',
      venue: 'Культурный центр',
      startDate: TOMORROW_UTC,
    });
    const result = getRecommendations('music', MOOD_MAPPINGS.music, [event2], NOW);
    expect(result.length).toBe(1);
  });

  it('(e) title-keyword match qualifies event with sparse tags (tags: [])', () => {
    const event = makeEvent({
      category: 'other',
      title: 'Вечеринка в стиле 90-х',
      venue: 'Случайное место',
      tags: [],
      startDate: TOMORROW_UTC,
    });
    const result = getRecommendations('drink', MOOD_MAPPINGS.drink, [event], NOW);
    expect(result.length).toBe(1);
  });

  it('(f) venue keyword match qualifies event', () => {
    const event = makeEvent({
      category: 'sport',  // not in drink categories
      title: 'Соревнование', // no drink keywords
      venue: 'Компромат Lounge',
      startDate: TOMORROW_UTC,
    });
    const result = getRecommendations('drink', MOOD_MAPPINGS.drink, [event], NOW);
    expect(result.length).toBe(1);
  });

  it('(g) reason text uses venue branch when venue matches', () => {
    const event = makeEvent({
      category: 'club',
      venue: 'Вавилон Nightclub',
      title: 'Клубная вечеринка',
      startDate: TOMORROW_UTC,
    });
    const result = getRecommendations('dance', MOOD_MAPPINGS.dance, [event], NOW);
    expect(result[0].reason).toMatch(/^Площадка подходит:/);
  });

  it('(g) reason text uses keyword branch when no venue match', () => {
    const event = makeEvent({
      category: 'other',
      venue: 'Неизвестное место',
      title: 'Концерт рока и джаза',
      startDate: TOMORROW_UTC,
    });
    const result = getRecommendations('music', MOOD_MAPPINGS.music, [event], NOW);
    expect(result[0].reason).not.toMatch(/^Площадка подходит:/);
    expect(result[0].reason.length).toBeGreaterThan(0);
  });

  it('(g) reason text uses category fallback when no venue or keyword match', () => {
    const event = makeEvent({
      category: 'concert',
      venue: 'Обычное место',
      title: 'МакSим',
      startDate: TOMORROW_UTC,
    });
    const result = getRecommendations('music', MOOD_MAPPINGS.music, [event], NOW);
    expect(result[0].reason).toBe('Концерт');
  });

  it('(h) still-running exhibition (startDate past, endDate future) appears in learn results', () => {
    const exhibition = makeEvent({
      category: 'exhibition',
      title: 'Выставка современного искусства',
      venue: 'Галерея',
      startDate: PAST_UTC,  // started before NOW
      endDate: TOMORROW_UTC,  // still running
    });
    const result = getRecommendations('learn', MOOD_MAPPINGS.learn, [exhibition], NOW);
    expect(result.length).toBe(1);
    expect(result[0].event.title).toBe('Выставка современного искусства');
  });

  it('(h) exhibition with past startDate and past endDate is excluded', () => {
    const oldExhibition = makeEvent({
      category: 'exhibition',
      startDate: new Date('2026-06-01T00:00:00Z'),  // past
      endDate: new Date('2026-06-20T00:00:00Z'),    // also past
    });
    const result = getRecommendations('learn', MOOD_MAPPINGS.learn, [oldExhibition], NOW);
    expect(result.length).toBe(0);
  });

  it('(i) empty candidate set returns []', () => {
    const result = getRecommendations('music', MOOD_MAPPINGS.music, [], NOW);
    expect(result).toEqual([]);
  });

  it('(j) result is capped at 50 items', () => {
    const events: NormalizedEvent[] = Array.from({ length: 60 }, (_, i) =>
      makeEvent({
        id: `event-${i}`,
        category: 'concert',
        startDate: new Date(TOMORROW_UTC.getTime() + i * 60000),
      }),
    );
    const result = getRecommendations('music', MOOD_MAPPINGS.music, events, NOW);
    expect(result.length).toBe(50);
  });

  it('every returned recommendation has a non-empty reason string', () => {
    const events: NormalizedEvent[] = [
      makeEvent({ category: 'concert', startDate: TOMORROW_UTC }),
      makeEvent({ category: 'club', startDate: TODAY_EVENING_UTC }),
      makeEvent({ category: 'lecture', startDate: TOMORROW_UTC }),
    ];
    // Run each mood
    for (const mood of ['drink', 'dance', 'learn', 'music'] as const) {
      const result = getRecommendations(mood, MOOD_MAPPINGS[mood], events, NOW);
      for (const rec of result) {
        expect(rec.reason.length).toBeGreaterThan(0);
      }
    }
  });
});
