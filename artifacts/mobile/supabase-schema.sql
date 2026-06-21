-- ============================================================
-- NETPLAY — Schema Supabase (IDEMPOTENTE)
-- Pode rodar quantas vezes quiser sem dar erro.
-- Supabase → SQL Editor → New Query → Cole tudo → Run
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. TABELAS
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT        UNIQUE NOT NULL,
  name            TEXT        NOT NULL,
  password_hash   TEXT,
  role            TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  avatar_letter   TEXT        NOT NULL DEFAULT 'U',
  avatar_url      TEXT,
  profile_banner  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_settings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  parental_control BOOLEAN     NOT NULL DEFAULT false,
  content_rating   TEXT        NOT NULL DEFAULT 'Livre',
  stream_quality   TEXT        NOT NULL DEFAULT 'Auto',
  audio_lang       TEXT        NOT NULL DEFAULT 'Portugues',
  subtitle_lang    TEXT        NOT NULL DEFAULT 'Portugues',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_settings_user_id_unique UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.watchlist (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tmdb_id       INTEGER     NOT NULL,
  type          TEXT        NOT NULL CHECK (type IN ('movie', 'tv')),
  title         TEXT        NOT NULL,
  poster_path   TEXT,
  backdrop_path TEXT,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT watchlist_unique UNIQUE (user_id, tmdb_id, type)
);

CREATE TABLE IF NOT EXISTS public.watch_progress (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tmdb_id       INTEGER     NOT NULL,
  type          TEXT        NOT NULL CHECK (type IN ('movie', 'tv')),
  title         TEXT        NOT NULL,
  poster_path   TEXT,
  backdrop_path TEXT,
  progress      FLOAT       NOT NULL DEFAULT 0,
  season        INTEGER,
  episode       INTEGER,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT watch_progress_unique UNIQUE (user_id, tmdb_id, type)
);

CREATE TABLE IF NOT EXISTS public.ratings (
  id      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  type    TEXT    NOT NULL CHECK (type IN ('movie', 'tv')),
  liked   BOOLEAN NOT NULL,
  CONSTRAINT ratings_unique UNIQUE (user_id, tmdb_id, type)
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  avatar_url  TEXT,
  is_kids     BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────
-- 2. COLUNAS OPCIONAIS (adiciona só se ainda nao existirem)
-- ────────────────────────────────────────────────────────────

DO $$ BEGIN ALTER TABLE public.users ADD COLUMN avatar_url TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.users ADD COLUMN profile_banner TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.users ADD COLUMN blocked BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.user_settings ADD COLUMN stream_quality TEXT NOT NULL DEFAULT 'Auto'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.user_settings ADD COLUMN audio_lang TEXT NOT NULL DEFAULT 'Português (BR)'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.user_settings ADD COLUMN subtitle_lang TEXT NOT NULL DEFAULT 'Desativado'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.user_settings ADD COLUMN auto_play BOOLEAN NOT NULL DEFAULT true; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.user_settings ADD COLUMN pip BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.user_settings ADD COLUMN notif_push BOOLEAN NOT NULL DEFAULT true; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.user_settings ADD COLUMN notif_lancamentos BOOLEAN NOT NULL DEFAULT true; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.user_settings ADD COLUMN notif_continue BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.user_settings ADD COLUMN notif_promo BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.user_settings ADD COLUMN wifi_only BOOLEAN NOT NULL DEFAULT true; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.user_settings ADD COLUMN smart_download BOOLEAN NOT NULL DEFAULT true; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.user_settings ADD COLUMN download_quality TEXT NOT NULL DEFAULT 'Boa (720p)'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.user_settings ADD COLUMN theme TEXT NOT NULL DEFAULT 'dark'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;


-- ────────────────────────────────────────────────────────────
-- 3. MIGRAÇÃO SUPABASE AUTH — rode 1x para migrar auth customizado
-- ────────────────────────────────────────────────────────────

-- Remove obrigatoriedade de password_hash (senhas agora ficam no Supabase Auth)
ALTER TABLE public.users ALTER COLUMN password_hash DROP NOT NULL;


-- ────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;


-- ────────────────────────────────────────────────────────────
-- 5. POLICIES — anon (app não autenticado) + authenticated (logado via Supabase Auth)
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "anon_all_users"         ON public.users;
DROP POLICY IF EXISTS "anon_all_user_settings" ON public.user_settings;
DROP POLICY IF EXISTS "anon_all_watchlist"     ON public.watchlist;
DROP POLICY IF EXISTS "anon_all_progress"      ON public.watch_progress;
DROP POLICY IF EXISTS "anon_all_ratings"       ON public.ratings;
DROP POLICY IF EXISTS "anon_all_profiles"      ON public.profiles;

DROP POLICY IF EXISTS "auth_all_users"         ON public.users;
DROP POLICY IF EXISTS "auth_all_user_settings" ON public.user_settings;
DROP POLICY IF EXISTS "auth_all_watchlist"     ON public.watchlist;
DROP POLICY IF EXISTS "auth_all_progress"      ON public.watch_progress;
DROP POLICY IF EXISTS "auth_all_ratings"       ON public.ratings;
DROP POLICY IF EXISTS "auth_all_profiles"      ON public.profiles;

-- Anon: apenas leitura de users para criação de perfil pós-cadastro
CREATE POLICY "anon_all_users"
  ON public.users FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- Authenticated: acesso total às próprias linhas
CREATE POLICY "auth_all_users"
  ON public.users FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_user_settings"
  ON public.user_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_watchlist"
  ON public.watchlist FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_progress"
  ON public.watch_progress FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_ratings"
  ON public.ratings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────
-- 6. ASSINATURAS E SESSÕES ATIVAS
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  plan             TEXT        NOT NULL DEFAULT 'trial',
  screen_limit     INTEGER     NOT NULL DEFAULT 1,
  trial_started_at TIMESTAMPTZ DEFAULT NOW(),
  plan_activated_at TIMESTAMPTZ,
  plan_expires_at  TIMESTAMPTZ,
  selected_plan    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.active_sessions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_id      TEXT        NOT NULL,
  session_token  TEXT        NOT NULL UNIQUE,
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_sessions    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_user_subscriptions" ON public.user_subscriptions;
DROP POLICY IF EXISTS "auth_all_active_sessions"    ON public.active_sessions;

CREATE POLICY "auth_all_user_subscriptions"
  ON public.user_subscriptions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_active_sessions"
  ON public.active_sessions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- anon access needed for session checks before full auth
CREATE POLICY "anon_all_user_subscriptions"
  ON public.user_subscriptions FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_active_sessions"
  ON public.active_sessions FOR ALL TO anon
  USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────
-- SUPPORT TICKETS
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject      TEXT        NOT NULL,
  message      TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  admin_reply  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_support_tickets" ON public.support_tickets;
CREATE POLICY "auth_all_support_tickets"
  ON public.support_tickets FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_support_tickets" ON public.support_tickets;
CREATE POLICY "anon_all_support_tickets"
  ON public.support_tickets FOR ALL TO anon
  USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────
-- RELEASE REMINDERS (Em Breve)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.release_reminders (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tmdb_id      INTEGER     NOT NULL,
  type         TEXT        NOT NULL CHECK (type IN ('movie', 'tv')),
  title        TEXT        NOT NULL,
  poster_path  TEXT,
  release_date TEXT,
  notif_id     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT release_reminders_unique UNIQUE (user_id, tmdb_id, type)
);

ALTER TABLE public.release_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_release_reminders" ON public.release_reminders;
CREATE POLICY "auth_all_release_reminders"
  ON public.release_reminders FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "anon_all_release_reminders" ON public.release_reminders;
CREATE POLICY "anon_all_release_reminders"
  ON public.release_reminders FOR ALL TO anon
  USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────
-- CONTENT OVERRIDES (edição de metadados — somente admin)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_overrides (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_key       TEXT        NOT NULL UNIQUE,
  tmdb_id           INTEGER,
  tmdb_type         TEXT        CHECK (tmdb_type IN ('movie', 'tv')),
  custom_title      TEXT,
  custom_overview   TEXT,
  overview_mode     TEXT        NOT NULL DEFAULT 'auto' CHECK (overview_mode IN ('auto', 'manual')),
  poster_path       TEXT,
  backdrop_path     TEXT,
  number_of_seasons INTEGER,
  number_of_episodes INTEGER,
  vote_average      NUMERIC,
  updated_by        UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Adicionar colunas se já existir a tabela (safe to run multiple times)
ALTER TABLE public.content_overrides ADD COLUMN IF NOT EXISTS poster_path TEXT;
ALTER TABLE public.content_overrides ADD COLUMN IF NOT EXISTS backdrop_path TEXT;
ALTER TABLE public.content_overrides ADD COLUMN IF NOT EXISTS number_of_seasons INTEGER;
ALTER TABLE public.content_overrides ADD COLUMN IF NOT EXISTS number_of_episodes INTEGER;
ALTER TABLE public.content_overrides ADD COLUMN IF NOT EXISTS vote_average NUMERIC;
ALTER TABLE public.content_overrides ADD COLUMN IF NOT EXISTS imdb_id TEXT;

ALTER TABLE public.content_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_content_overrides" ON public.content_overrides;
CREATE POLICY "anon_read_content_overrides"
  ON public.content_overrides FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "auth_read_content_overrides" ON public.content_overrides;
CREATE POLICY "auth_read_content_overrides"
  ON public.content_overrides FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "auth_write_content_overrides" ON public.content_overrides;
CREATE POLICY "auth_write_content_overrides"
  ON public.content_overrides FOR ALL TO authenticated
  USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────
-- PERFIL DE IA (Gemini behavior profile por usuário)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_ai_profile (
  user_id         UUID        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  top_genres      INTEGER[]   NOT NULL DEFAULT '{}',
  top_titles      TEXT[]      NOT NULL DEFAULT '{}',
  recent_searches TEXT[]      NOT NULL DEFAULT '{}',
  prefers_movies  BOOLEAN     NOT NULL DEFAULT true,
  prefers_series  BOOLEAN     NOT NULL DEFAULT false,
  prefers_anime   BOOLEAN     NOT NULL DEFAULT false,
  liked_ids       INTEGER[]   NOT NULL DEFAULT '{}',
  disliked_ids    INTEGER[]   NOT NULL DEFAULT '{}',
  watched_ids     INTEGER[]   NOT NULL DEFAULT '{}',
  tab_frequency   JSONB       NOT NULL DEFAULT '{}',
  total_events    INTEGER     NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_ai_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_user_ai_profile" ON public.user_ai_profile;
CREATE POLICY "auth_all_user_ai_profile"
  ON public.user_ai_profile FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_user_ai_profile" ON public.user_ai_profile;
CREATE POLICY "anon_all_user_ai_profile"
  ON public.user_ai_profile FOR ALL TO anon
  USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────
-- SHORTS — Comentários, Reações e Seguidores
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shorts_comments (
  id              TEXT        PRIMARY KEY,
  post_id         TEXT        NOT NULL,
  tmdb_id         INTEGER     NOT NULL DEFAULT 0,
  user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_name       TEXT        NOT NULL,
  avatar_letter   TEXT        NOT NULL DEFAULT 'U',
  avatar_url      TEXT,
  content         TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shorts_comments_post   ON public.shorts_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_shorts_comments_user   ON public.shorts_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_shorts_comments_time   ON public.shorts_comments(created_at DESC);

ALTER TABLE public.shorts_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_shorts_comments" ON public.shorts_comments;
CREATE POLICY "auth_all_shorts_comments"
  ON public.shorts_comments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_shorts_comments" ON public.shorts_comments;
CREATE POLICY "anon_read_shorts_comments"
  ON public.shorts_comments FOR SELECT TO anon
  USING (true);


CREATE TABLE IF NOT EXISTS public.shorts_comment_reactions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  TEXT        NOT NULL REFERENCES public.shorts_comments(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  emoji       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shorts_reactions_unique UNIQUE (comment_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_shorts_reactions_comment ON public.shorts_comment_reactions(comment_id);

ALTER TABLE public.shorts_comment_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_shorts_reactions" ON public.shorts_comment_reactions;
CREATE POLICY "auth_all_shorts_reactions"
  ON public.shorts_comment_reactions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_shorts_reactions" ON public.shorts_comment_reactions;
CREATE POLICY "anon_read_shorts_reactions"
  ON public.shorts_comment_reactions FOR SELECT TO anon
  USING (true);


CREATE TABLE IF NOT EXISTS public.shorts_follows (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id           UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  followed_id           UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  followed_name         TEXT        NOT NULL DEFAULT '',
  followed_avatar_letter TEXT       NOT NULL DEFAULT 'U',
  followed_avatar_url   TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shorts_follows_unique UNIQUE (follower_id, followed_id)
);

CREATE INDEX IF NOT EXISTS idx_shorts_follows_follower ON public.shorts_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_shorts_follows_followed ON public.shorts_follows(followed_id);

ALTER TABLE public.shorts_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_shorts_follows" ON public.shorts_follows;
CREATE POLICY "auth_all_shorts_follows"
  ON public.shorts_follows FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_shorts_follows" ON public.shorts_follows;
CREATE POLICY "anon_read_shorts_follows"
  ON public.shorts_follows FOR SELECT TO anon
  USING (true);


-- ────────────────────────────────────────────────────────────
-- FIM — todas as tabelas e permissoes prontas
-- ────────────────────────────────────────────────────────────
