/**
 * Ordered list of active source adapters.
 *
 * The pipeline iterates this array in order.
 * seedAdapter is always present as the honest fallback.
 * Live source adapters (kassa-ugra, afisha-surguta) will be appended in plan 01-7.
 */

import type { SourceAdapter } from './base';
import { seedAdapter } from './seed/index';

/**
 * Active source adapters in priority order.
 * Currently contains only the seed adapter; live adapters added in plan 01-7.
 */
export const sourceRegistry: SourceAdapter[] = [seedAdapter];
