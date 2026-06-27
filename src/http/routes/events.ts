/**
 * GET /api/events — filtered, normalized event list.
 *
 * Reads exclusively from the in-memory EventIndex (no I/O in the request path).
 * Query parameters are validated by Fastify's built-in Ajv; invalid values
 * return 400 with a predictable error shape (API-05, T-01-13).
 *
 * Date filtering uses Surgut local time (UTC+5, Asia/Yekaterinburg).
 * The `isSeed` flag is preserved honestly — seed events are never mislabelled.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { NormalizedEvent, EventCategory } from '../../types/events';
import { serializeEvent } from '../serialize';

// ---------------------------------------------------------------------------
// Date helpers (UTC+5)
// ---------------------------------------------------------------------------

const SURGUT_OFFSET_MS = 5 * 60 * 60 * 1000; // 5 h in ms

/**
 * Returns the UTC epoch ms for 00:00:00 on (today + offsetDays) in Surgut
 * local time (UTC+5 / Asia/Yekaterinburg).
 */
function surgutDayBoundaryMs(offsetDays: number): number {
  const nowLocalMs = Date.now() + SURGUT_OFFSET_MS;
  const local = new Date(nowLocalMs);
  // Start of day in "local" UTC
  const startOfDayLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + offsetDays,
    0, 0, 0, 0,
  );
  // Shift back to true UTC
  return startOfDayLocal - SURGUT_OFFSET_MS;
}

/** Day-of-week (0=Sun … 6=Sat) for a UTC date expressed in Surgut local time */
function surgutWeekday(utcDate: Date): number {
  return new Date(utcDate.getTime() + SURGUT_OFFSET_MS).getUTCDay();
}

function filterByDate(
  events: NormalizedEvent[],
  filter: 'today' | 'tomorrow' | 'weekend' | 'week',
): NormalizedEvent[] {
  const today            = surgutDayBoundaryMs(0);
  const tomorrow         = surgutDayBoundaryMs(1);
  const dayAfterTomorrow = surgutDayBoundaryMs(2);
  const weekLater        = surgutDayBoundaryMs(7);

  switch (filter) {
    case 'today':
      return events.filter(e => {
        const t = e.startDate.getTime();
        return t >= today && t < tomorrow;
      });
    case 'tomorrow':
      return events.filter(e => {
        const t = e.startDate.getTime();
        return t >= tomorrow && t < dayAfterTomorrow;
      });
    case 'weekend': {
      // Saturday (6) or Sunday (0) in Surgut local time
      return events.filter(e => {
        const wd = surgutWeekday(e.startDate);
        return wd === 0 || wd === 6;
      });
    }
    case 'week':
      return events.filter(e => {
        const t = e.startDate.getTime();
        return t >= today && t < weekLater;
      });
    default:
      // Unreachable at runtime; satisfies TypeScript exhaustiveness check
      return events;
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

interface EventsQuerystring {
  date?:     'today' | 'tomorrow' | 'weekend' | 'week';
  category?: EventCategory;
  free?:     boolean;
  upcoming?: boolean;
}

const eventsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: EventsQuerystring }>(
    '/api/events',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              enum: ['today', 'tomorrow', 'weekend', 'week'],
            },
            category: {
              type: 'string',
              enum: [
                'concert', 'club', 'theater', 'exhibition',
                'lecture', 'sport', 'standup', 'other',
              ],
            },
            free:     { type: 'boolean' },
            upcoming: { type: 'boolean' },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              events: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id:         { type: 'string' },
                    title:      { type: 'string' },
                    startDate:  { type: 'string' },
                    endDate:    { type: 'string' },
                    venue:      { type: 'string' },
                    address:    { type: 'string' },
                    priceText:  { type: 'string' },
                    priceMin:   { type: 'number' },
                    priceMax:   { type: 'number' },
                    isFree:     { type: 'boolean' },
                    sourceName: { type: 'string' },
                    sourceUrl:  { type: 'string' },
                    category:   { type: 'string' },
                    tags:       { type: 'array', items: { type: 'string' } },
                    ageLimit:   { type: 'string' },
                    imageUrl:   { type: 'string' },
                    fetchedAt:  { type: 'string' },
                    isSeed:     { type: 'boolean' },
                  },
                },
              },
              meta: {
                type: 'object',
                properties: {
                  count:       { type: 'number' },
                  generatedAt: { type: 'string' },
                },
                required: ['count', 'generatedAt'],
              },
            },
            required: ['events', 'meta'],
          },
        },
      },
    },
    async (req, reply) => {
      const { date, category, free, upcoming } = req.query;

      // Read from the in-memory index (no I/O, no pipeline coupling — T-01-15)
      let events = fastify.index.all();

      if (date !== undefined) {
        events = filterByDate(events, date);
      }
      if (category !== undefined) {
        events = events.filter(e => e.category === category);
      }
      if (free === true) {
        events = events.filter(e => e.isFree);
      }
      if (upcoming === true) {
        // Effective-date rule mirrors the recommendation engine:
        // still-running exhibitions (startDate < now, endDate > now) count as "today"
        // so they are retained; past events with no ongoing endDate are excluded.
        const now = Date.now();
        events = events.filter(e => {
          const effectiveMs =
            e.startDate.getTime() < now &&
            e.endDate !== undefined &&
            e.endDate.getTime() > now
              ? now                       // still-running exhibition → pin to now
              : e.startDate.getTime();
          return effectiveMs >= now;
        });
      }

      const serialized = events.map(serializeEvent);

      return reply.send({
        events: serialized,
        meta: {
          count:       serialized.length,
          generatedAt: new Date().toISOString(),
        },
      });
    },
  );
};

export default eventsRoute;
