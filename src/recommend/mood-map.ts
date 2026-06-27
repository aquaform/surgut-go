/**
 * Static mood→category/keyword/venue mapping table (MOOD-01).
 *
 * Used by the recommendation engine (recommend.ts) to match events to moods
 * and to generate "Почему рекомендовано" reason text (MOOD-03).
 *
 * Rules:
 * - All keyword/venue strings are lowercase (matched with String.includes on
 *   the lowercased event field — never uppercase a keyword here).
 * - categories must be valid EventCategory values.
 */

import type { EventCategory, Mood } from '../types/events';

export interface MoodMapping {
  /** EventCategory values that belong to this mood (primary match) */
  categories: EventCategory[];
  /**
   * Keywords to look for in event.title.toLowerCase() or event.tags.
   * Title scan is the primary path because Phase 1 data has sparse tags.
   * Keywords are checked with String.includes() (substring match).
   */
  titleKeywords: string[];
  /**
   * Venue substrings (case-insensitive includes).
   * A venue match boosts an event that might not match by category/keyword alone.
   */
  venueKeywords: string[];
  /** Human-readable label for the mood (used in API response and UI heading) */
  label: string;
  emoji: string;
}

export const MOOD_MAPPINGS: Record<Mood, MoodMapping> = {
  drink: {
    categories: ['club', 'standup', 'other'],
    titleKeywords: [
      'бар', 'стендап', 'stand-up', 'stand up', 'open mic',
      'вечеринк', 'коктейл', 'lounge', 'клуб', 'ночной',
    ],
    venueKeywords: [
      'компромат', 'brooklyn', 'forte', 'piano', 'карасёвня',
      'karas', 'бар', 'паб',
    ],
    label: 'Хочу выпить',
    emoji: '🍸',
  },
  dance: {
    categories: ['club'],
    titleKeywords: [
      'вечеринк', 'дискотек', 'хип-хоп', 'электроник', 'dancehall',
      'dance', 'клуб', 'dj', 'диджей',
    ],
    venueKeywords: [
      'вавилон', 'utopia', 'утопия', 'аквапарк', 'аквамарин',
    ],
    label: 'Хочу потанцевать',
    emoji: '💃',
  },
  learn: {
    categories: ['lecture', 'exhibition', 'theater'],
    titleKeywords: [
      'лекци', 'квиз', 'выставк', 'музей', 'образован',
      'история', 'мастер-класс', 'воркшоп', 'семинар',
      'театр', 'спектакл', 'мюзикл', 'опер', 'балет',
    ],
    venueKeywords: [
      // NB: do NOT use bare 'парк' — "аквапарк".includes("парк") is true and would
      // pull pool-party events into "learn". Use the specific 'исторический парк'.
      'музей', 'библиотек', 'театр', 'галере',
      'исторический парк', 'краеведческ',
    ],
    label: 'Хочу понимать',
    emoji: '🧠',
  },
  music: {
    categories: ['concert'],
    titleKeywords: [
      'концерт', 'филармони', 'джаз', 'рок', 'оркестр',
      'живой звук', 'cagmo', 'акустик', 'классик',
      'саундтрек', 'фестивал',
    ],
    venueKeywords: [
      'филармония', 'cagmo', 'дкид', 'нефтяник', 'зал',
    ],
    label: 'Хочу музыки',
    emoji: '🎶',
  },
};
