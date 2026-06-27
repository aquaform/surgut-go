/**
 * sur.kassir.ru source adapter — DISABLED in Phase 3 (honest stub).
 *
 * Live-probe evidence (2026-06-27): all category pages tested:
 *   /bilety-na-koncert     → 0 event cards, "Найдено 30 событий" (AJAX-only)
 *   /bilety-v-teatr        → 0 event cards, "Найдено 11 событий" (AJAX-only)
 *   /detskaya-afisha       → 0 event cards, "Найдено 6 событий" (AJAX-only)
 *   /bilety-na-koncert/segodnya → 0 event cards (AJAX-only)
 *
 * Verdict: sur.kassir.ru is fully client-rendered. Events are loaded
 * asynchronously by JavaScript after page load. No public API endpoint
 * was discovered (guessed path /api/event/list?... returned HTTP 404).
 *
 * Fetching with a headless browser violates the node:20-slim single-container
 * constraint mandated by AGENTS.md. This adapter CANNOT return real event data
 * without a headless sidecar strategy.
 *
 * This module ships as a transparent disabled stub so that:
 *   - The honesty mandate (AGENTS.md / CLAUDE.md) is upheld — events are never invented.
 *   - The status panel (/api/sources/status) shows kassir-sur as "blocked" (not "error"),
 *     communicating an intentional constraint, not a transient failure (Pitfall 5).
 *   - scrape() throws unconditionally as a safety net in case the adapter is ever
 *     accidentally wired without checking enabled:false first (T-03-07 mitigation).
 *
 * To enable in v2: replace scrape() with a headless sidecar strategy
 * or kassir.ru public API (if one becomes available).
 */

import type { NormalizedEvent } from '../../types/events';
import type { SourceAdapter } from '../base';

/**
 * Disabled adapter for sur.kassir.ru.
 *
 * Callers MUST check `enabled` before invoking `scrape()`.
 * The 03-4 registry wiring reads `enabled:false` and sets status `'blocked'`
 * without calling `scrape()`. The `scrape()` throw is a belt-and-suspenders
 * safety net for accidental invocation (T-03-07).
 */
export const kassirSurAdapter: SourceAdapter & { enabled: false; reason: string } = {
  name: 'kassir-sur',
  displayName: 'Кассир Сургут',
  homeUrl: 'https://sur.kassir.ru',
  timeoutMs: 0,

  /**
   * Disabled: sur.kassir.ru is fully client-rendered — no static HTML events.
   * Requires a headless browser, which violates the single-container constraint.
   * Deferred to v2.
   */
  enabled: false as const,

  /**
   * Machine-readable reason for the disabled state.
   * Exposed in /api/sources/status as the error field so the UI can distinguish
   * "intentionally blocked" from "transient scrape failure".
   */
  reason: 'Требует браузера; источник полностью клиентский — отключён в MVP',

  /**
   * Safety net: always throws — never returns invented event data.
   * This method MUST NOT be called in normal operation (kassirSurAdapter.enabled === false).
   * The registry checks enabled before calling scrape() — this throw exists for the
   * case where something bypasses that check (T-03-07 mitigation).
   */
  async scrape(): Promise<NormalizedEvent[]> {
    throw new Error('kassir-sur: adapter disabled — fully client-rendered source');
  },
};
