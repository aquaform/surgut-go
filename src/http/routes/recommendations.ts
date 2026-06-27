/**
 * GET /api/recommendations?mood=drink|dance|learn|music — API-03
 *
 * Validates the `mood` querystring parameter with Ajv: must be one of the four
 * supported values. Missing or invalid mood → 400 (no custom error handling needed).
 *
 * The handler reads exclusively from fastify.index.all() (no I/O in request path).
 * Returns mood metadata, a ranked list of items with serialized event + reason, and meta.
 *
 * Route is registered before @fastify/static in server.ts so exact paths always win.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { Mood } from '../../types/events';
import { MOOD_MAPPINGS } from '../../recommend/mood-map';
import { getRecommendations } from '../../recommend/recommend';
import { serializeEvent } from '../serialize';

// ---------------------------------------------------------------------------
// Querystring type
// ---------------------------------------------------------------------------

interface RecommendationsQuerystring {
  mood: Mood;
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

const recommendationsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: RecommendationsQuerystring }>(
    '/api/recommendations',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['mood'],
          properties: {
            mood: {
              type: 'string',
              enum: ['drink', 'dance', 'learn', 'music'],
            },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { mood } = req.query;
      const mapping = MOOD_MAPPINGS[mood];
      const allEvents = fastify.index.all();
      const now = new Date();

      const ranked = getRecommendations(mood, mapping, allEvents, now);

      return reply.send({
        mood,
        label:  mapping.label,
        emoji:  mapping.emoji,
        items:  ranked.map(({ event, reason }) => ({
          event:  serializeEvent(event),
          reason,
        })),
        meta: {
          count:       ranked.length,
          generatedAt: now.toISOString(),
        },
      });
    },
  );
};

export default recommendationsRoute;
