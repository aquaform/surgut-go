/**
 * In-memory EventIndex — provides O(1) reads with atomic rebuild capability.
 *
 * Design:
 * - all(): events sorted by startDate ASC (ready for "what's on today" queries)
 * - byCategory(): events for a specific category, sorted by startDate ASC
 * - rebuild(): atomically swaps internal arrays/maps — concurrent reads never
 *   see a half-built index because references are replaced in one assignment
 *
 * This module is pure (no I/O). Routes read from here; the refresh loop calls
 * rebuild() after each successful scrape cycle.
 */

import type { NormalizedEvent, EventCategory } from '../types/events';

// ---------------------------------------------------------------------------
// EventIndex interface
// ---------------------------------------------------------------------------

export interface EventIndex {
  /** All events sorted by startDate ASC */
  all(): NormalizedEvent[];
  /** Events for the given category, sorted by startDate ASC; empty [] if none */
  byCategory(category: EventCategory): NormalizedEvent[];
  /**
   * Atomically replace the internal index with a new event array.
   * Builds new sorted arrays/maps, then swaps references in a single step.
   * No in-place mutation — concurrent reads see either the old or the new
   * index, never an intermediate state.
   */
  rebuild(newEvents: NormalizedEvent[]): void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface IndexData {
  sorted: NormalizedEvent[];
  byCategory: Map<EventCategory, NormalizedEvent[]>;
}

/**
 * Build sorted array and category map from a flat event array.
 * Creates new data structures — does not mutate the input array.
 */
function buildIndexData(events: NormalizedEvent[]): IndexData {
  // Sort by startDate ASC (earliest first)
  const sorted = [...events].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );

  // Group by category
  const byCategory = new Map<EventCategory, NormalizedEvent[]>();
  for (const event of sorted) {
    const bucket = byCategory.get(event.category);
    if (bucket !== undefined) {
      bucket.push(event);
    } else {
      byCategory.set(event.category, [event]);
    }
  }

  return { sorted, byCategory };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Build an in-memory EventIndex from a flat NormalizedEvent array.
 *
 * @param events - Initial event array (may be empty for boot-before-seed edge case)
 * @returns EventIndex with all(), byCategory(), and rebuild() methods
 */
export function buildEventIndex(events: NormalizedEvent[]): EventIndex {
  // Mutable via closures — never exposed directly
  let current: IndexData = buildIndexData(events);

  return {
    all(): NormalizedEvent[] {
      return current.sorted;
    },

    byCategory(category: EventCategory): NormalizedEvent[] {
      return current.byCategory.get(category) ?? [];
    },

    rebuild(newEvents: NormalizedEvent[]): void {
      // Build entirely new data structures first
      const next = buildIndexData(newEvents);
      // Atomic reference swap — single assignment, no in-place mutation
      current = next;
    },
  };
}
