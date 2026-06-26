/**
 * GET /api/sources/status — per-source freshness and event counts.
 *
 * Reads exclusively from CacheStore (no I/O in the request path).
 * Exposes only human-readable status/error — no stack traces or
 * internal URLs with tokens are ever returned (T-01-14, SRC-08).
 */

import type { FastifyPluginAsync } from 'fastify';
import type { SourceStatus } from '../../types/events';

// ---------------------------------------------------------------------------
// Serialised response shape
// ---------------------------------------------------------------------------

interface SerializedSource {
  name:        string;
  displayName: string;
  homeUrl:     string;
  status:      SourceStatus;
  eventCount:  number;
  fetchedAt:   string | null;
  error?:      string;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const sourcesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/sources/status',
    {
      schema: {
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name:        { type: 'string' },
                displayName: { type: 'string' },
                homeUrl:     { type: 'string' },
                status: {
                  type: 'string',
                  enum: ['live', 'cached', 'blocked', 'error', 'seed'],
                },
                eventCount: { type: 'number' },
                // fetchedAt can be ISO string or null
                fetchedAt:  { type: 'string', nullable: true },
                // error is optional — only present when status === 'error'
                error:      { type: 'string' },
              },
              required: ['name', 'displayName', 'homeUrl', 'status', 'eventCount', 'fetchedAt'],
            },
          },
        },
      },
    },
    async (_req, reply) => {
      const sources = fastify.store.getSources();

      // Map to a serializable shape.
      // Only expose human-readable error message — never stack traces or
      // internal URLs with tokens (T-01-14 / Security Domain: Info Disclosure).
      const serialized: SerializedSource[] = sources.map(src => {
        const result: SerializedSource = {
          name:        src.name,
          displayName: src.displayName,
          homeUrl:     src.homeUrl,
          status:      src.status,
          eventCount:  src.eventCount,
          fetchedAt:   src.fetchedAt ? src.fetchedAt.toISOString() : null,
        };
        if (src.error) {
          result.error = src.error;
        }
        return result;
      });

      return reply.send(serialized);
    },
  );
};

export default sourcesRoute;
