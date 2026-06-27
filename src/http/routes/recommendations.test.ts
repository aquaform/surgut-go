/**
 * Route tests for GET /api/recommendations
 *
 * Uses Fastify's inject() — no real HTTP socket, no port binding.
 * The event index is seeded from seedAdapter.scrape() to get a realistic fixture set.
 *
 * Test cases:
 * 1. mood=music → 200 with correct response shape
 * 2. Every returned item has a non-empty reason string
 * 3. Missing mood → 400 (Ajv required)
 * 4. Invalid mood=sleep → 400 (Ajv enum)
 * 5. isSeed is preserved in serialized event items (AGG-02 / T-02-06)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { CacheStore } from '../../cache/store';
import { buildEventIndex } from '../../pipeline/index-events';
import { seedAdapter } from '../../sources/seed';
import recommendationsRoute from './recommendations';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('GET /api/recommendations', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = Fastify({ logger: false });

    // Build index from seed events — realistic fixture, no I/O in tests
    const events = await seedAdapter.scrape();
    const index = buildEventIndex(events);

    // Minimal store mock — route only needs index
    fastify.decorate('store', { getSources: () => [] } as unknown as CacheStore);
    fastify.decorate('index', index);

    await fastify.register(recommendationsRoute);
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  // ── Happy path: mood=music ────────────────────────────────────────────────

  it('returns 200 with correct response shape for mood=music', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/recommendations?mood=music',
    });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body) as {
      mood: string;
      label: string;
      emoji: string;
      items: { event: Record<string, unknown>; reason: string }[];
      meta: { count: number; generatedAt: string };
    };

    expect(body.mood).toBe('music');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.label.length).toBeGreaterThan(0);
    expect(body.emoji.length).toBeGreaterThan(0);
    // meta.count must match the actual items array length
    expect(body.meta.count).toBe(body.items.length);
    expect(typeof body.meta.generatedAt).toBe('string');
  });

  it('every returned item has a non-empty reason string', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/recommendations?mood=music',
    });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body) as {
      items: { event: Record<string, unknown>; reason: string }[];
    };
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(typeof item.reason).toBe('string');
      expect(item.reason.length).toBeGreaterThan(0);
    }
  });

  // ── Validation: missing and invalid mood ─────────────────────────────────

  it('returns 400 for missing mood (Ajv required)', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/recommendations',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid mood=sleep (Ajv enum)', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/recommendations?mood=sleep',
    });
    expect(res.statusCode).toBe(400);
  });

  // ── Honesty: isSeed preserved (T-02-06) ──────────────────────────────────

  it('isSeed is preserved verbatim in every serialized event item', async () => {
    // Seed events all have isSeed: true — the route must not strip or alter it
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/recommendations?mood=music',
    });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body) as {
      items: { event: { isSeed: boolean }; reason: string }[];
    };
    expect(body.items.length).toBeGreaterThan(0);
    // All items in the seed-only index must carry isSeed: true
    const allHaveIsSeed = body.items.every(item => item.event.isSeed === true);
    expect(allHaveIsSeed).toBe(true);
  });
});
