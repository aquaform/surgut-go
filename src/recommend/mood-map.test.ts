/**
 * Structural tests for MOOD_MAPPINGS (MOOD-01).
 * Asserts that the static table is complete, well-formed, and lowercase-consistent.
 */

import { describe, it, expect } from 'vitest';
import { MOOD_MAPPINGS } from './mood-map';
import type { Mood } from '../types/events';

const EXPECTED_MOODS: Mood[] = ['drink', 'dance', 'learn', 'music'];

describe('MOOD_MAPPINGS', () => {
  it('has exactly 4 mood entries', () => {
    expect(Object.keys(MOOD_MAPPINGS)).toHaveLength(4);
  });

  it('has an entry for each mood', () => {
    for (const mood of EXPECTED_MOODS) {
      expect(MOOD_MAPPINGS).toHaveProperty(mood);
    }
  });

  for (const mood of EXPECTED_MOODS) {
    describe(`mood: ${mood}`, () => {
      it('has non-empty categories', () => {
        expect(MOOD_MAPPINGS[mood].categories.length).toBeGreaterThan(0);
      });

      it('has non-empty titleKeywords', () => {
        expect(MOOD_MAPPINGS[mood].titleKeywords.length).toBeGreaterThan(0);
      });

      it('has non-empty venueKeywords', () => {
        expect(MOOD_MAPPINGS[mood].venueKeywords.length).toBeGreaterThan(0);
      });

      it('has non-empty label', () => {
        expect(MOOD_MAPPINGS[mood].label.length).toBeGreaterThan(0);
      });

      it('has non-empty emoji', () => {
        expect(MOOD_MAPPINGS[mood].emoji.length).toBeGreaterThan(0);
      });

      it('all titleKeywords are lowercase', () => {
        for (const kw of MOOD_MAPPINGS[mood].titleKeywords) {
          expect(kw).toBe(kw.toLowerCase());
        }
      });

      it('all venueKeywords are lowercase', () => {
        for (const kw of MOOD_MAPPINGS[mood].venueKeywords) {
          expect(kw).toBe(kw.toLowerCase());
        }
      });
    });
  }
});
