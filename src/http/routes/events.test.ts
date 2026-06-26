/**
 * Route tests for GET /api/events
 *
 * Uses Fastify's inject() — no real HTTP socket, no port binding.
 * Mock store/index are decorated on each test Fastify instance.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { CacheStore } from '../../cache/store';
import type { EventIndex } from '../../pipeline/index-events';
import type { NormalizedEvent, EventCategory } from '../../types/events';
import eventsRoute from './events';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const BASE: Omit<NormalizedEvent, 'id' | 'title' | 'category' | 'isFree' | 'priceText' | 'sourceUrl' | 'startDate'> = {
  venue:      'Test Venue',
  priceMin:   undefined,
  priceMax:   undefined,
  isSeed:     true,
  sourceName: 'seed',
  tags:       [],
  fetchedAt:  new Date('2026-06-27T00:00:00.000Z'),
};

/** September 6, 2026 = Sunday.  UTC+5 local time: 20:00 → still Sunday. */
const CONCERT_EVENT: NormalizedEvent = {
  ...BASE,
  id:         'c1',
  title:      'Big Concert',
  startDate:  new Date('2026-09-06T15:00:00.000Z'), // 20:00 UTC+5, Sunday
  isFree:     false,
  priceText:  '1000 ₽',
  priceMin:   1000,
  sourceUrl:  'https://example.com/c1',
  category:   'concert',
};

/** Same day (Sunday), but free */
const FREE_EVENT: NormalizedEvent = {
  ...BASE,
  id:         'c2',
  title:      'Free Show',
  startDate:  new Date('2026-09-06T10:00:00.000Z'), // 15:00 UTC+5, Sunday
  isFree:     true,
  priceText:  'Бесплатно',
  sourceUrl:  'https://example.com/c2',
  category:   'concert',
};

/** September 10, 2026 = Thursday — NOT a weekend day */
const THEATER_EVENT: NormalizedEvent = {
  ...BASE,
  id:         'c3',
  title:      'Theater Play',
  startDate:  new Date('2026-09-10T14:00:00.000Z'), // 19:00 UTC+5, Thursday
  isFree:     false,
  priceText:  '500 ₽',
  priceMin:   500,
  sourceUrl:  'https://example.com/c3',
  category:   'theater',
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function buildApp(events: NormalizedEvent[] = []): FastifyInstance {
  const app = Fastify({ logger: false });

  app.decorate('store', {
    getEvents: () => events,
    getSources: () => [],
  } as unknown as CacheStore);

  app.decorate('index', {
    all:       () => events,
    byCategory: (cat: EventCategory) => events.filter(e => e.category === cat),
    rebuild:   () => {},
  } as unknown as EventIndex);

  void app.register(eventsRoute);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/events', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with empty events array and meta when no events', async () => {
    app = buildApp([]);
    const res = await app.inject({ method: 'GET', url: '/api/events' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { events: unknown[]; meta: { count: number; generatedAt: string } };
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events).toHaveLength(0);
    expect(body.meta.count).toBe(0);
    expect(typeof body.meta.generatedAt).toBe('string');
  });

  it('returns all events without filters, meta.count matches', async () => {
    app = buildApp([CONCERT_EVENT, THEATER_EVENT]);
    const res = await app.inject({ method: 'GET', url: '/api/events' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { events: unknown[]; meta: { count: number } };
    expect(body.events).toHaveLength(2);
    expect(body.meta.count).toBe(2);
  });

  it('returns 400 for invalid date enum value', async () => {
    app = buildApp([]);
    const res = await app.inject({ method: 'GET', url: '/api/events?date=bogus' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid category enum value', async () => {
    app = buildApp([]);
    const res = await app.inject({ method: 'GET', url: '/api/events?category=bogus' });
    expect(res.statusCode).toBe(400);
  });

  it('filters events by category', async () => {
    app = buildApp([CONCERT_EVENT, THEATER_EVENT]);
    const res = await app.inject({ method: 'GET', url: '/api/events?category=concert' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { events: { id: string; category: string }[] };
    expect(body.events).toHaveLength(1);
    expect(body.events[0]!.category).toBe('concert');
    expect(body.events[0]!.id).toBe('c1');
  });

  it('filters to free events when free=true', async () => {
    app = buildApp([CONCERT_EVENT, FREE_EVENT, THEATER_EVENT]);
    const res = await app.inject({ method: 'GET', url: '/api/events?free=true' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { events: { id: string; isFree: boolean }[] };
    expect(body.events).toHaveLength(1);
    expect(body.events[0]!.id).toBe('c2');
    expect(body.events[0]!.isFree).toBe(true);
  });

  it('serializes startDate as ISO string', async () => {
    app = buildApp([CONCERT_EVENT]);
    const res = await app.inject({ method: 'GET', url: '/api/events' });
    const body = JSON.parse(res.body) as { events: { startDate: string }[] };
    expect(body.events[0]!.startDate).toBe('2026-09-06T15:00:00.000Z');
  });

  it('serializes fetchedAt as ISO string', async () => {
    app = buildApp([CONCERT_EVENT]);
    const res = await app.inject({ method: 'GET', url: '/api/events' });
    const body = JSON.parse(res.body) as { events: { fetchedAt: string }[] };
    expect(body.events[0]!.fetchedAt).toBe('2026-06-27T00:00:00.000Z');
  });

  it('preserves isSeed honestly (seed events labelled true)', async () => {
    app = buildApp([CONCERT_EVENT]);
    const res = await app.inject({ method: 'GET', url: '/api/events' });
    const body = JSON.parse(res.body) as { events: { isSeed: boolean }[] };
    expect(body.events[0]!.isSeed).toBe(true);
  });

  it('date=today returns 200 (may be empty)', async () => {
    app = buildApp([CONCERT_EVENT, THEATER_EVENT]);
    const res = await app.inject({ method: 'GET', url: '/api/events?date=today' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { events: unknown[] };
    expect(Array.isArray(body.events)).toBe(true);
  });

  it('date=weekend includes Sunday events, excludes Thursday events', async () => {
    // CONCERT_EVENT: Sep 6, 2026 = Sunday ✓
    // THEATER_EVENT: Sep 10, 2026 = Thursday ✗
    app = buildApp([CONCERT_EVENT, THEATER_EVENT]);
    const res = await app.inject({ method: 'GET', url: '/api/events?date=weekend' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { events: { id: string }[] };
    const ids = body.events.map(e => e.id);
    expect(ids).toContain('c1');
    expect(ids).not.toContain('c3');
  });

  it('combines category and free filters', async () => {
    app = buildApp([CONCERT_EVENT, FREE_EVENT, THEATER_EVENT]);
    const res = await app.inject({
      method: 'GET',
      url: '/api/events?category=concert&free=true',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { events: { id: string }[] };
    expect(body.events).toHaveLength(1);
    expect(body.events[0]!.id).toBe('c2');
  });
});
