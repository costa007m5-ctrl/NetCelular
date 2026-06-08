---
name: Expo port conflict with Start application
description: How the expo dev workflow port must be configured to coexist with Start application (API proxy).
---

The Replit artifact system expects `artifacts/mobile: expo` to open port **18115** (configured in `.replit` as `localPort = 18115 → externalPort = 3000`).

The `Start application` workflow must own port **5000** (the primary dev domain) so that `EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN` routes to serve.js, which proxies `/api/*` to the API server on port 8080.

**Why:** If expo runs on port 5000 (the global `PORT` env var), it occupies the primary dev domain. `initApiDomain()` then fails to find a live API at `REPLIT_DEV_DOMAIN/api/healthz` and falls back to the production domain — which may run outdated code missing Flix2 routes.

**How to apply:**
- `artifacts/mobile/package.json` dev script must use `--port 18115` (NOT `--port $PORT`).
- `REACT_NATIVE_PACKAGER_HOSTNAME` must be `$REPLIT_EXPO_DEV_DOMAIN` (the expo-specific subdomain), not `$REPLIT_DEV_DOMAIN`.
- `EXPO_PUBLIC_DOMAIN` stays `$REPLIT_DEV_DOMAIN` so API calls route through serve.js proxy on port 5000.
- Run both `Start application` AND `artifacts/mobile: expo` simultaneously — they no longer conflict.

**Route paths:** All r2/flix2 routes are mounted at `/api/r2/*` (not `/api/*`). `r2Base()` already accounts for this by returning `getApiBase() + "/r2"`.
