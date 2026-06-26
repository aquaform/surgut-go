# ── Stage 1: Builder ──────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

# Install ALL deps (including devDeps for esbuild, tsx, typescript)
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy source
COPY src/ ./src/
COPY public/ ./public/

# Bundle TypeScript → single server.js (no node_modules needed in runner)
RUN npx esbuild src/server.ts \
      --bundle \
      --platform=node \
      --format=cjs \
      --outfile=server.js \
      --external:./public \
      --external:./cache

# ── Stage 2: Runner ───────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

# Only copy the bundle and static assets — zero node_modules
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/public ./public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Healthcheck using Node 20 built-in fetch (no wget/curl needed)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
