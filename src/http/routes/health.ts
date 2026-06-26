/**
 * GET /health — liveness probe used by Traefik/Dokploy and the Docker HEALTHCHECK.
 *
 * Returns 200 with body 'ok' (text/plain).
 * No dependency on store/index — this route must always respond.
 */

import type { FastifyPluginAsync } from 'fastify';

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (_req, reply) => {
    return reply.type('text/plain').send('ok');
  });
};

export default healthRoute;
