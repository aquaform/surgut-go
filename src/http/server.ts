/**
 * Fastify server factory.
 *
 * createServer({ store, index }) wires all plugins and decorations and returns
 * a configured FastifyInstance. The caller is responsible for calling listen().
 *
 * Routes read only from store/index — they never call the pipeline.
 * (ARCHITECTURE internal boundary: routes never reach past the in-memory index.)
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import type { CacheStore } from '../cache/store';
import type { EventIndex } from '../pipeline/index-events';
import healthRoute from './routes/health';
import eventsRoute from './routes/events';
import sourcesRoute from './routes/sources';

// ---------------------------------------------------------------------------
// Type augmentation — typed decorations on FastifyInstance
// ---------------------------------------------------------------------------
//
// Augmenting the global interface lets route handlers access fastify.store and
// fastify.index with full type safety via the Fastify instance reference.

declare module 'fastify' {
  interface FastifyInstance {
    store: CacheStore;
    index: EventIndex;
  }
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export interface ServerDeps {
  store: CacheStore;
  index: EventIndex;
}

/**
 * Build and configure a Fastify instance.
 *
 * @param deps - Injected application state ({ store, index }).
 * @returns A configured FastifyInstance that is not yet listening.
 *          Caller must `await fastify.listen({ port, host: '0.0.0.0' })`.
 */
export function createServer({ store, index }: ServerDeps): FastifyInstance {
  const fastify = Fastify({ logger: true });

  // Decorate the instance with shared application state.
  // Routes access fastify.store / fastify.index — never the pipeline directly.
  fastify.decorate('store', store);
  fastify.decorate('index', index);

  // API routes registered before the static wildcard so exact paths always win.
  // Order: health → events → sources → static (wildcard last).
  fastify.register(healthRoute);
  fastify.register(eventsRoute);
  fastify.register(sourcesRoute);

  // Serve the public/ directory at the root prefix.
  // __dirname in the esbuild CJS bundle resolves to the output file directory,
  // which is the same directory as public/ in both dev and Docker contexts.
  fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
  });

  return fastify;
}
