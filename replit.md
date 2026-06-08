# NETPLAY

App mobile premium de streaming (IPTV/VOD) com identidade visual estilo Netflix/Disney+/Prime Video.

## Run & Operate (Replit)

- **Start application** workflow runs everything: builds the API server, then serves the Expo landing page on port 5000 with the API proxied to port 8080.
- `pnpm install` — install all workspace dependencies (required after fresh clone)
- `pnpm --filter @workspace/api-server run build` — rebuild the API server bundle
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Required Secrets / Env Vars

Set these in the Replit Secrets tab before deploying:

| Key | Description |
|-----|-------------|
| `DATABASE_URL` | Postgres connection string (auto-set by Replit DB) |
| `TMDB_API_KEY` | TMDB API key for movie/TV metadata |
| `ADMIN_API_KEY` | Admin route authentication key |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret key |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (push notifications) |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase service account JSON (FCM push) |
| `CF_ACCOUNT_ID` | Cloudflare account ID (D1 integration) |
| `CF_D1_DATABASE_ID` | Cloudflare D1 database ID |
| `CF_API_TOKEN` | Cloudflare API token |

Non-sensitive config already set as env vars: `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `SUPABASE_URL`, `PORT` (5000), `API_PORT` (8080).

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Mobile: Expo (React Native) with expo-router, Reanimated, expo-blur, expo-linear-gradient

## Where things live

- `artifacts/mobile/` — Expo mobile app (NETPLAY)
- `artifacts/mobile/constants/colors.ts` — design tokens (dark theme: black + crimson red)
- `artifacts/mobile/constants/content.ts` — mock TMDB-style content data
- `artifacts/mobile/components/` — HeroBanner, ContentCard, ContentRow, TopTenCard, SyncBar, SkeletonLoader
- `artifacts/mobile/app/(tabs)/` — Home, Search, Channels, List, Profile screens
- `artifacts/api-server/` — Express API server

## Architecture decisions

- Mobile-only for first build (no backend); uses TMDB CDN for images with onError fallbacks
- Always dark theme — `colors.ts` light key holds NETPLAY dark palette (black + #e50914 red)
- Floating glassmorphism tab bar via absolute-positioned Tabs with BlurView (iOS) or semi-opaque View (Android/Web)
- SyncBar is a minimal floating pill (not a full-width bar) with spinning icon + percentage
- AnimatedCard pattern used to avoid useAnimatedStyle inside .map() (Reanimated rule)

## Product

- **Home** — hero carousel (auto-advance 5s), category pills, Em Alta row, Top 10 numbered cards, Continue Assistindo with progress bars, Hype banner
- **Buscar** — search input + genre filter pills + responsive grid of results
- **Canais** — premium channel cards (Netflix, Disney+, HBO, etc.) + per-channel content rows
- **Lista** — saved titles with remove button
- **Perfil** — stats, settings with toggles, account options

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- TMDB image URLs may fail — all ContentCard and TopTenCard components have `onError` → gradient placeholder fallback
- Web: use 67px top inset + 34px bottom inset (handled per-screen via `Platform.OS === 'web'`)
- NativeTabs (iOS 26 Liquid Glass) path has all 5 tabs declared; ClassicTabLayout path uses floating pill design

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
