/**
 * Route tests for GET /api/sources/status
 *
 * Uses Fastify's inject() — no real HTTP socket, no port binding.
 * Mock store decorated on each test Fastify instance.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { CacheStore } from '../../cache/store';
import type { EventIndex } from '../../pipeline/index-events';
import type { SourceResult } from '../../types/events';
import sourcesRoute from './sources';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function buildApp(sources: SourceResult[] = []): FastifyInstance {
  const app = Fastify({ logger: false });

  app.decorate('store', {
    getEvents: () => [],
    getSources: () => sources,
  } as unknown as CacheStore);

  app.decorate('index', {
    all:        () => [],
    byCategory: () => [],
    rebuild:    () => {},
  } as unknown as EventIndex);

  void app.register(sourcesRoute);
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SEED_SOURCE: SourceResult = {
  name:        'seed',
  displayName: 'Демо-данные',
  homeUrl:     '',
  status:      'seed',
  eventCount:  12,
  fetchedAt:   new Date('2026-06-27T10:00:00.000Z'),
};

const LIVE_SOURCE: SourceResult = {
  name:        'kassa-ugra',
  displayName: 'Касса Угра',
  homeUrl:     'https://kassa-ugra.ru',
  status:      'live',
  eventCount:  38,
  fetchedAt:   new Date('2026-06-27T08:00:00.000Z'),
};

const ERROR_SOURCE: SourceResult = {
  name:        'afisha-surguta',
  displayName: 'Афиша Сургута',
  homeUrl:     'https://afisha.surguta.ru',
  status:      'error',
  eventCount:  0,
  fetchedAt:   null,
  error:       'HTTP 503 for https://afisha.surguta.ru/',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/sources/status', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with empty array when no sources loaded', async () => {
    app = buildApp([]);
    const res = await app.inject({ method: 'GET', url: '/api/sources/status' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('returns status and eventCount for each source', async () => {
    app = buildApp([SEED_SOURCE]);
    const res = await app.inject({ method: 'GET', url: '/api/sources/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { status: string; eventCount: number }[];
    expect(body[0]!.status).toBe('seed');
    expect(body[0]!.eventCount).toBe(12);
  });

  it('serializes fetchedAt as ISO string when present', async () => {
    app = buildApp([SEED_SOURCE]);
    const res = await app.inject({ method: 'GET', url: '/api/sources/status' });
    const body = JSON.parse(res.body) as { fetchedAt: string }[];
    expect(body[0]!.fetchedAt).toBe('2026-06-27T10:00:00.000Z');
  });

  it('serializes null fetchedAt as null', async () => {
    app = buildApp([ERROR_SOURCE]);
    const res = await app.inject({ method: 'GET', url: '/api/sources/status' });
    const body = JSON.parse(res.body) as { fetchedAt: null }[];
    expect(body[0]!.fetchedAt).toBeNull();
  });

  it('includes human-readable error message when source has error', async () => {
    app = buildApp([ERROR_SOURCE]);
    const res = await app.inject({ method: 'GET', url: '/api/sources/status' });
    const body = JSON.parse(res.body) as { error: string }[];
    expect(body[0]!.error).toBe('HTTP 503 for https://afisha.surguta.ru/');
    // Must not contain stack frame lines (e.g., "  at SomeClass.method (file.ts:N)")
    expect(body[0]!.error).not.toMatch(/^\s+at\s+\S+\s+\(/m);
  });

  it('omits error field when source has no error', async () => {
    app = buildApp([SEED_SOURCE]);
    const res = await app.inject({ method: 'GET', url: '/api/sources/status' });
    const body = JSON.parse(res.body) as Record<string, unknown>[];
    expect('error' in (body[0] ?? {})).toBe(false);
  });

  it('returns all required fields for each source', async () => {
    app = buildApp([LIVE_SOURCE]);
    const res = await app.inject({ method: 'GET', url: '/api/sources/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>[];
    const src = body[0]!;
    expect(src).toHaveProperty('name');
    expect(src).toHaveProperty('displayName');
    expect(src).toHaveProperty('homeUrl');
    expect(src).toHaveProperty('status');
    expect(src).toHaveProperty('eventCount');
    expect(src).toHaveProperty('fetchedAt');
  });

  it('returns multiple sources in the same order as the store', async () => {
    app = buildApp([SEED_SOURCE, LIVE_SOURCE, ERROR_SOURCE]);
    const res = await app.inject({ method: 'GET', url: '/api/sources/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { name: string }[];
    expect(body).toHaveLength(3);
    expect(body[0]!.name).toBe('seed');
    expect(body[1]!.name).toBe('kassa-ugra');
    expect(body[2]!.name).toBe('afisha-surguta');
  });

  it('does not expose internal URL details in non-error source', async () => {
    // homeUrl is user-visible and OK; internal retry state must not leak
    app = buildApp([LIVE_SOURCE]);
    const res = await app.inject({ method: 'GET', url: '/api/sources/status' });
    const body = JSON.parse(res.body) as Record<string, unknown>[];
    // No 'retries', 'attempt', 'config', 'headers' keys in response
    const internalKeys = ['retries', 'attempt', 'config', 'headers', 'stack'];
    for (const key of internalKeys) {
      expect(key in (body[0] ?? {})).toBe(false);
    }
  });
});
