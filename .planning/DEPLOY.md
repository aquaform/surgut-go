# Deploy record — surgut-go

**Live URL:** https://surgut-go.apps.sielom.ru
**Repo:** https://github.com/aquaform/surgut-go (public)
**Deployed via:** `/deploy` → Dokploy API at `$DOKPLOY_URL` (https://dokploy.sielom.ru)

## Dokploy identifiers

| Field | Value |
|-------|-------|
| projectId | `yClsmGRWn8QpvEXG2_5nU` (project "surgut-go") |
| environmentId | `SdsAGeIbz9f9sYvn27jjR` (production) |
| **applicationId** | **`a0wKR0PzSvtrJKx5dTvvU`** (appName `surgut-go-ltshnl`) |
| serverId | `k8OseZqzTv9XkJuPnzIf4` ("AI AGENT SERVER", ip 93.189.230.175) |
| domainId | host `surgut-go.apps.sielom.ru`, https + letsencrypt, port 3000 |

## Deploy config (Dokploy)

- **sourceType:** `git` (custom git, public repo) — `customGitUrl=https://github.com/aquaform/surgut-go.git`, branch `main`, buildPath `/`
- **buildType:** `dockerfile` (root `Dockerfile`, esbuild multi-stage → `node server.js`)
- **domain:** `surgut-go.apps.sielom.ru`, port 3000, https, certResolver letsencrypt

## CRITICAL gotcha (cost ~debug time — keep for future deploys)

The Dokploy **panel** is `dokploy.sielom.ru` (212.96.206.138), but the **Traefik ingress** that
serves `*.sielom.ru` / `*.apps.sielom.ru` is a *separate* managed server: **"AI AGENT SERVER"**
`serverId=k8OseZqzTv9XkJuPnzIf4` (93.189.230.175). An application created with `serverId: null`
deploys onto the panel host and is **unreachable** via the public domain (Traefik returns 404 even
though the container is healthy). **Always create the application with
`serverId=k8OseZqzTv9XkJuPnzIf4`.** `serverId` is NOT updatable via `application.update` — if it is
wrong, delete and recreate the application on the correct server.

## Re-deploy

`POST $DOKPLOY_URL/api/application.deploy` with `{ "applicationId": "a0wKR0PzSvtrJKx5dTvvU" }`
(header `x-api-key: $DOKPLOY_API_KEY`). Auto-deploy on push is NOT configured (custom-git, no webhook);
trigger deploys explicitly via `/deploy`.

---
*Deployed 2026-06-27 (Phase 1).*
