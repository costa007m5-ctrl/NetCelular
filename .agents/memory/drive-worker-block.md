---
name: Drive Worker Cloudflare block
description: Animezey Drive Worker blocks server IPs (Replit, VPS) with error 1102 — fix is to resolve directly from mobile device.
---

## Rule
The Animezey Drive Worker (`1.animezey23112022.workers.dev`) blocks requests originating from server/VPS IPs with Cloudflare error 1102. Mobile devices are NOT blocked.

**Why:** Cloudflare Worker has server-IP-level blocking (anti-bot / hotlink protection).

**How to apply:**
- `/drive/play` must be resolved client-side on native (Android/iOS) — call `drivePlayDirect(id)` from `r2-direct.ts` which calls the Worker directly from the device.
- The web platform still uses the server-side path (`forwardToServer`) because browser CORS prevents direct calls.
- In `r2Route()`, intercept `route === "/drive/play"` BEFORE the `SERVER_ONLY_ROUTES` check (but after the `Platform.OS === "web"` check).
- API server-side timeout for Worker call reduced to 6 s (was 25 s) to fail fast when blocked.
- `drivePlayDirect` in `r2-direct.ts` mirrors the server logic: Priority 1 = signed link via Worker listing, Priority 2 = legacy Google Drive URL.
