# Stack Research

**Domain:** Server-side events aggregator + scraper, mobile-first server-rendered web UI
**Researched:** 2026-06-26
**Confidence:** HIGH (all versions verified via npm registry; all locked decisions respected)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 20 (LOCKED) | Runtime | LTS, built-in `fetch` (undici-backed), no separate HTTP client needed |
| TypeScript | 5.x (latest) | Language | Enforces types on public functions per AGENTS.md, catches parse-shape mismatches at compile time |
| Fastify | 5.8.5 (LOCKED) | HTTP framework | Schema-first, fast, first-class TS, built-in Ajv for API route validation |

### HTML Parsing

**Decision: `cheerio` v1.2.0**

Confidence: HIGH (30 million weekly downloads, first-party TS types since v1.0, active maintenance, 5 months since last release as of June 2026)

Rationale over alternatives:
- **`cheerio`** beats `node-html-parser` on ecosystem size (30M vs ~3M weekly downloads) and jQuery-familiar API. Raw parse speed (node-html-parser is ~8x faster in microbenchmarks) does not matter here — we parse once per TTL refresh interval, not per request.
- **`cheerio`** beats `linkedom` for our use case; linkedom simulates a full DOM (designed for SSR of web components), adding unnecessary weight. We need read-only extraction, not DOM mutation.
- **`cheerio`** handles the two structured-data extraction patterns without extra libraries:
  - JSON-LD: `JSON.parse($('script[type="application/ld+json"]').first().html() ?? '{}')` 
  - `__NEXT_DATA__` (Next.js sites like afisha.ru): `JSON.parse($('#__NEXT_DATA__').html() ?? '{}')` 
  - These are preferred over HTML scraping when available — they are stable, unaffected by layout changes, and carry typed event data.

### HTTP Fetching

**Decision: Native `fetch` (Node 20 built-in) + `p-retry` v8.0.0**

Confidence: HIGH

| Package | Version | Role |
|---------|---------|------|
| `fetch` (built-in) | Node 20 | HTTP requests, gzip handled automatically via `Accept-Encoding` |
| `p-retry` | 8.0.0 | Retry with exponential back-off (ESM-only; bundles cleanly via esbuild `--format=cjs`) |
| `robots-parser` | 3.0.1 | Parse and check each source's `robots.txt` before scraping |

Standard fetch call pattern:
```typescript
const res = await fetch(url, {
  signal: AbortSignal.timeout(8_000),   // built-in since Node 20, no AbortController needed
  headers: {
    'User-Agent': 'surgut-go/1.0 (+https://surgut-go.apps.sielom.ru)',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept': 'text/html,application/xhtml+xml',
  },
});
```

Retry wrapper:
```typescript
import pRetry from 'p-retry';

const html = await pRetry(
  () => fetchHtml(url),
  { retries: 2, minTimeout: 1_000, maxTimeout: 4_000 }
);
```

Why NOT `got` v15: `got` is ESM-only and adds ~200 KB of extra dependency surface for features (retry hooks, `extend()`) we replicate in <20 lines with `p-retry`. Native fetch is undici-powered and production-quality in Node 20.

Why NOT raw `undici`: Native `fetch` is the stable public API over undici. Reaching into `undici` directly is only warranted for connection-pool tuning at scale — not relevant for a 6-source scraper.

### TypeScript Build (Dockerfile Contract: `node server.js`)

**Decision: esbuild v0.28.1 for production; tsx v4.22.4 for development**

Confidence: HIGH

The contract is `node server.js` in `node:20-slim`. The cleanest path:

**Multi-stage Dockerfile (builder → runner):**
```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
COPY public/ ./public/
RUN npx esbuild src/server.ts \
      --bundle \
      --platform=node \
      --format=cjs \
      --outfile=server.js \
      --external:./public

FROM node:20-slim AS runner
WORKDIR /app
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/public ./public
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
```

Key flags:
- `--bundle`: tree-shakes and inlines all `node_modules`, so the runner stage needs NO `npm ci --omit=dev` and NO `node_modules/` folder
- `--platform=node`: marks Node built-ins as external, prevents bundling them
- `--format=cjs`: produces CommonJS output compatible with `node server.js` regardless of `"type"` in `package.json`; also handles ESM-only packages (`p-retry`, `cheerio` internals) automatically
- `--external:./public`: prevents the bundler from trying to inline static assets

**Dev workflow:**
```bash
npx tsx watch src/server.ts   # hot-reload without compile step
```

**Type checking (CI only, not in build):**
```bash
npx tsc --noEmit              # type errors only, no JS output
```

Why NOT `tsc` for production build: `tsc` produces one `.js` per `.ts` file, requires copying `node_modules` into the runner stage, and makes `npm ci --omit=dev` essential. esbuild bundle eliminates all of this.

Why NOT `ts-node` / `tsx` in production: runtime compilation adds startup time and requires dev dependencies in the production image.

Why NOT `tsup`: tsup wraps esbuild with sensible defaults (good for libraries), but the direct esbuild call gives us explicit control over the `server.js` naming and `--external` list — worth the minor verbosity.

### Fastify Ecosystem

| Package | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `fastify` | 5.8.5 | HTTP server | Built-in Ajv schema validation on API routes |
| `@fastify/static` | 9.1.3 | Serve `public/` (CSS, JS, images) | Prefix `/__static` or root, disable for API routes |

**Server-rendered HTML templating: use tagged template literals — no @fastify/view needed**

Rationale: The UI is 4 mood buttons + event cards. A `render.ts` module with typed helper functions returning HTML strings is:
- Zero dependencies
- TypeScript-typed (function signatures enforce required fields)  
- Trivially testable (pure functions → string output)
- Sufficient for this scope

If layout complexity grows: add `@fastify/view` v12.0.0 + `eta` v4.6.0. Eta is the recommended pairing — 3 KB, supports async, uses `<%= %>` syntax (similar to EJS), native TypeScript types. Do NOT introduce Handlebars or Pug; they are heavier and add a compilation step.

**API route schema validation:**
```typescript
fastify.get('/api/events', {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        mood: { type: 'string', enum: ['drink', 'dance', 'learn', 'music'] },
        date: { type: 'string', enum: ['today', 'tomorrow', 'weekend', 'week'] },
      },
    },
    response: {
      200: { type: 'object', properties: { events: { type: 'array' } } },
    },
  },
}, handler);
```

### Testing

**Decision: `vitest` v4.1.9**

Confidence: HIGH

Pattern for parser unit tests against saved HTML fixtures:

```
src/
  scrapers/
    afisha-surguta/
      parser.ts
      parser.test.ts
      __fixtures__/
        afisha-surguta-2024-12-01.html   ← saved real response
```

```typescript
// parser.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseAfishaSurguta } from './parser';

const fixture = readFileSync(
  join(__dirname, '__fixtures__/afisha-surguta-2024-12-01.html'),
  'utf-8'
);

describe('parseAfishaSurguta', () => {
  it('extracts at least 3 events', () => {
    const events = parseAfishaSurguta(fixture);
    expect(events.length).toBeGreaterThanOrEqual(3);
  });

  it('normalizes first event to EventModel shape', () => {
    const [first] = parseAfishaSurguta(fixture);
    expect(first).toMatchObject({
      title: expect.any(String),
      startDate: expect.any(Date),
      sourceName: 'afisha.surguta.ru',
    });
  });
});
```

`vitest.config.ts` minimal setup:
```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: { provider: 'v8', thresholds: { lines: 80 } },
  },
});
```

Run alongside typecheck in CI:
```bash
npx tsc --noEmit && npx vitest run --coverage
```

### Scheduling

**Decision: `node-cron` v4.5.0**

Confidence: HIGH

```typescript
import cron from 'node-cron';

// Refresh all sources every 2 hours
cron.schedule('0 */2 * * *', () => refreshAllSources());
```

Why NOT `setInterval`: Cannot express "run at the top of every 2nd hour" without calendar math. node-cron syntax is self-documenting and aligns with DevOps mental models.

Why NOT external scheduler (Kubernetes CronJob, systemd timer): single container contract — in-process scheduling is simpler and sufficient.

---

## Supporting Libraries (Full Install List)

```bash
# Production dependencies
npm install fastify @fastify/static cheerio p-retry robots-parser node-cron

# Dev dependencies
npm install -D typescript tsx esbuild vitest @vitest/coverage-v8 @types/node @types/robots-parser @types/node-cron
```

Versions pinned to what was verified:
```json
{
  "dependencies": {
    "fastify": "^5.8.5",
    "@fastify/static": "^9.1.3",
    "cheerio": "^1.2.0",
    "p-retry": "^8.0.0",
    "robots-parser": "^3.0.1",
    "node-cron": "^4.5.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsx": "^4.22.4",
    "esbuild": "^0.28.1",
    "vitest": "^4.1.9",
    "@vitest/coverage-v8": "^4.1.9",
    "@types/node": "^20.0.0",
    "@types/robots-parser": "^3.0.0",
    "@types/node-cron": "^3.0.0"
  }
}
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| HTML Parser | `cheerio` 1.2.0 | `node-html-parser` 8.0.3 | Smaller ecosystem, non-jQuery API, 8x faster parsing doesn't matter at TTL-refresh cadence |
| HTML Parser | `cheerio` 1.2.0 | `linkedom` 0.18.12 | Full DOM simulation — designed for SSR rendering, not read-only extraction; heavier |
| HTTP Client | native `fetch` + `p-retry` | `got` 15.0.6 | `got` is ESM-only which bundles fine but adds ~200 KB; native fetch handles gzip + timeout natively in Node 20 |
| HTTP Client | native `fetch` + `p-retry` | `axios` | axios is CommonJS-legacy, larger, no built-in timeout signal |
| TS Build | `esbuild` (bundle) | `tsc` (compile) | tsc requires node_modules in runner stage; multi-file output complicates `node server.js` entrypoint |
| TS Build | `esbuild` (bundle) | `tsup` | tsup wraps esbuild; fine alternative but adds indirection; direct esbuild call gives explicit `server.js` naming |
| Scheduling | `node-cron` | `setInterval` | setInterval cannot express calendar-aligned intervals without arithmetic; less readable |
| Templates | template literals | `@fastify/view` + Eta | Sufficient for current scope; add @fastify/view + eta v4.6.0 if layout complexity grows |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `puppeteer` / `playwright` | Chromium binary breaks `node:20-slim` without extra packages; 200 MB+ image bloat; violates no-native-modules constraint | `cheerio` for static HTML; `__NEXT_DATA__` / JSON-LD extraction for SPA sites |
| `sqlite3` / `better-sqlite3` | Native C++ addons require `build-essential` in `node:20-slim` (not available by default) | JSON file on disk with TTL (LOCKED decision) |
| `ts-node` in production | Requires TypeScript as a production dependency; adds compile latency on startup | esbuild bundle in multi-stage Docker |
| `jsdom` | 25 MB bundle; slow; designed for browser emulation, not scraping | `cheerio` for scraping |
| `cheerio.fromURL()` | Convenience wrapper that hides timeout/retry/robots.txt control | Fetch HTML manually, then `cheerio.load(html)` |
| `got-scraping` | Browser fingerprint rotation library from Apify — overkill; Russian afisha sites don't fingerprint bots | Plain `got` or native fetch with a descriptive User-Agent |
| `axios` | CommonJS legacy; no built-in `AbortSignal` timeout; adds 13 KB for nothing over native fetch | Native `fetch` |
| `node-fetch` | Was a polyfill for pre-18 Node; redundant since Node 18 built-in fetch | Native `fetch` |

---

## JSON-LD / `__NEXT_DATA__` Extraction Strategy

Several Surgut sources may use Next.js (Яндекс Афиша, Afisha.ru, T-Bank). Always probe for structured data before falling back to HTML scraping:

```typescript
export function extractStructuredData(html: string): unknown | null {
  const $ = cheerio.load(html);

  // Priority 1: JSON-LD (most reliable, schema.org typed)
  const ldJson = $('script[type="application/ld+json"]').first().html();
  if (ldJson) {
    try { return JSON.parse(ldJson); } catch { /* malformed, fall through */ }
  }

  // Priority 2: __NEXT_DATA__ (Next.js SSR payload — full page data tree)
  const nextData = $('#__NEXT_DATA__').html();
  if (nextData) {
    try { return JSON.parse(nextData); } catch { /* fall through */ }
  }

  // Priority 3: Cheerio CSS-selector scraping of HTML
  return null;
}
```

Note: If `__NEXT_DATA__` is absent AND the HTML only has empty `<div id="__next"></div>`, the site is client-rendered and requires a headless browser — which is out of scope. Log the source as `blocked/client-rendered` and serve fallback seed data.

---

## Version Compatibility Matrix

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `cheerio` ^1.2.0 | Node 18+ | v1.x requires `import * as cheerio from 'cheerio'`; old `require('cheerio')` default export removed |
| `p-retry` ^8.0.0 | Node 18+ | ESM-only; esbuild `--format=cjs` bundles it correctly; no top-level await in p-retry |
| `node-cron` ^4.5.0 | Node 18+ | v4.x has breaking changes from v3.x (API is same, but ES module exports differ) |
| `@fastify/static` ^9.1.3 | `fastify` ^5.x | Major version aligns with fastify major; do NOT mix fastify v4 with @fastify/static v9 |
| `@fastify/view` ^12.0.0 | `fastify` ^5.x | Same major alignment rule |
| `esbuild` ^0.28.1 | Node 16+ builder | Builder-only (devDep); not in production image |

---

## Sources

- [cheerio npm page](https://www.npmjs.com/package/cheerio) — version 1.2.0 confirmed
- [cheerio official docs](https://cheerio.js.org/docs/intro/) — load API, TS usage (HIGH confidence via Context7 CLI)
- [npmtrends: cheerio vs htmlparser2 vs jsdom vs linkedom](https://npmtrends.com/cheerio-vs-htmlparser2-vs-jsdom-vs-linkedom) — download volume (MEDIUM confidence, web)
- [ScrapeOps: Best NodeJS HTML Parsing Libraries](https://scrapeops.io/nodejs-web-scraping-playbook/best-nodejs-html-parsing-libraries/) — comparison (MEDIUM confidence)
- [node-html-parser GitHub benchmarks](https://github.com/node-projects/node-html-parser) — parse speed benchmarks (MEDIUM confidence, community benchmark)
- [undici.nodejs.org](https://undici.nodejs.org/) — confirmed Node 20 fetch is undici-backed (HIGH confidence)
- [pkgpulse: got vs undici vs node-fetch](https://www.pkgpulse.com/guides/got-vs-undici-vs-node-fetch-http-clients-nodejs-2026) — HTTP client comparison (MEDIUM confidence)
- [got README](https://github.com/sindresorhus/got/blob/main/readme.md) — ESM-only confirmation (HIGH confidence)
- [esbuild docs](https://esbuild.github.io/api/) — `--format=cjs --platform=node --bundle` behavior (HIGH confidence)
- [Deploying NodeJS Apps with ESBuild and Docker](https://www.martinrichards.me/post/building_nodejs_apps_with_esbuild_and_docker/) — multi-stage pattern (MEDIUM confidence)
- [WebScraping.AI: JSON-LD extraction with Cheerio](https://webscraping.ai/faq/cheerio/how-do-you-extract-structured-data-like-json-ld-or-microdata-using-cheerio) — JSON-LD pattern (MEDIUM confidence)
- [robots-parser GitHub](https://github.com/samclarke/robots-parser) — robots.txt compliance library (HIGH confidence)
- [vitest docs](https://vitest.dev/guide/) — test setup, coverage (HIGH confidence)
- npm registry (direct): all versions verified via `npm show <pkg> version` on 2026-06-26

---

*Stack research for: surgut-go events aggregator*
*Researched: 2026-06-26*
