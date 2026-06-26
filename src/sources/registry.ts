/**
 * Ordered list of active source adapters.
 *
 * The pipeline iterates this array in order using Promise.allSettled,
 * so the order does not affect correctness — only display order in /api/sources/status.
 *
 * Order: live adapters first (kassa-ugra, afisha-surguta), seed last as honest fallback.
 * If all live adapters fail, seed events are still served with status "seed".
 */

import type { SourceAdapter } from './base';
import { kassaUgraAdapter } from './kassa-ugra/index';
import { afishaSurgutaAdapter } from './afisha-surguta/index';
import { seedAdapter } from './seed/index';

/**
 * Active source adapters in priority order.
 * Pipeline (runPipeline) runs all adapters in parallel via Promise.allSettled.
 * Live adapters report status 'live' on success; seed reports 'seed'.
 */
export const sourceRegistry: SourceAdapter[] = [
  kassaUgraAdapter,
  afishaSurgutaAdapter,
  seedAdapter,
];
