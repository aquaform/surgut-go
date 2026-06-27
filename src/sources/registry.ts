/**
 * Source registry — active adapters + disabled-source list assembly.
 *
 * Wave-3 integration (03-4, SRC-04/05/06):
 *   - afishaRuAdapter added to the active sourceRegistry (SRC-04)
 *   - kassirSurAdapter: always disabled — AJAX-only, no static HTML (SRC-05)
 *   - yandexAfishaAdapter: disabled by default; enabled via ENABLE_YANDEX_AFISHA (SRC-06, T-03-15)
 *
 * Disabled adapters live in a separate DisabledSource list (not in sourceRegistry)
 * so they appear in /api/sources/status as 'blocked' without ever being scraped
 * (Pitfall 5 from 03-RESEARCH.md: disabled adapter must not pollute the active pipeline).
 *
 * Use `buildSources(config)` (not the raw exports below) in server.ts to
 * assemble the runtime active + disabled lists — the function applies the
 * ENABLE_YANDEX_AFISHA toggle correctly.
 *
 * Pipeline order: live adapters first (kassa-ugra, afisha-surguta, afisha-ru),
 * yandex-afisha optionally last (when enabled), seed always last as fallback.
 */

import type { SourceAdapter } from './base';
import type { AppConfig } from '../config';
import { kassaUgraAdapter } from './kassa-ugra/index';
import { afishaSurgutaAdapter } from './afisha-surguta/index';
import { afishaRuAdapter } from './afisha-ru/index';
import { kassirSurAdapter } from './kassir-sur/index';
import { yandexAfishaAdapter } from './yandex-afisha/index';
import { seedAdapter } from './seed/index';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A source that is not scraped (disabled/blocked) but must still appear in
 * /api/sources/status to maintain honesty (T-03-13).
 *
 * Distinct from SourceAdapter: no scrape() method, carries a human-readable
 * `reason` for why it is disabled.
 */
export interface DisabledSource {
  name: string;
  displayName: string;
  homeUrl: string;
  /** Human-readable explanation shown in /api/sources/status as the error field */
  reason: string;
}

// ---------------------------------------------------------------------------
// Static active registry
// ---------------------------------------------------------------------------

/**
 * Active source adapters in priority order.
 * Pipeline (runPipeline) runs all adapters in parallel via Promise.allSettled.
 * Live adapters report status 'live' on success; seed reports 'seed'.
 *
 * NOTE: Do NOT add kassirSurAdapter or yandexAfishaAdapter here directly.
 * Use buildSources(config) to assemble the correct active + disabled lists.
 */
export const sourceRegistry: SourceAdapter[] = [
  kassaUgraAdapter,
  afishaSurgutaAdapter,
  afishaRuAdapter,
  seedAdapter,
];

// ---------------------------------------------------------------------------
// Dynamic assembly (env-gated)
// ---------------------------------------------------------------------------

/**
 * Build the runtime active adapter list and disabled-source list from config.
 *
 * - kassir-sur is always in the disabled list (SRC-05: fully client-rendered)
 * - yandex-afisha is disabled by default (SRC-06: ToS §3.1 risk);
 *   set ENABLE_YANDEX_AFISHA=true to move it into the active list
 *
 * The disabled list is passed to runPipeline so disabled sources appear in
 * /api/sources/status with status 'blocked' and their reason (T-03-13).
 *
 * @param config - Application config loaded by loadConfig()
 * @returns { active, disabled } — pass active as `registry` and disabled as
 *   `disabledSources` to startRefreshLoop / RefreshOptions
 */
export function buildSources(config: AppConfig): {
  active: SourceAdapter[];
  disabled: DisabledSource[];
} {
  const active: SourceAdapter[] = [
    kassaUgraAdapter,
    afishaSurgutaAdapter,
    afishaRuAdapter,
    // Yandex Afisha: only in active list when operator explicitly opts in (T-03-15)
    ...(config.enableYandexAfisha ? [yandexAfishaAdapter] : []),
    seedAdapter,
  ];

  const disabled: DisabledSource[] = [
    // kassir-sur: always blocked — AJAX-only source (SRC-05)
    {
      name: kassirSurAdapter.name,
      displayName: kassirSurAdapter.displayName,
      homeUrl: kassirSurAdapter.homeUrl,
      reason: kassirSurAdapter.reason,
    },
    // yandex-afisha: blocked when not enabled (SRC-06 default-off, T-03-15)
    ...(config.enableYandexAfisha
      ? []
      : [
          {
            name: yandexAfishaAdapter.name,
            displayName: yandexAfishaAdapter.displayName,
            homeUrl: yandexAfishaAdapter.homeUrl,
            reason:
              'Отключён по умолчанию — риск ToS; включается ENABLE_YANDEX_AFISHA',
          },
        ]),
  ];

  return { active, disabled };
}
