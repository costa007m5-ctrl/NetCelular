-- NETPLAY — Supabase Schema
-- Run this in the Supabase SQL Editor:
-- supabase.com → seu projeto → SQL Editor → New Query → cole e execute

-- Users table (auth customizado, senha hasheada no client)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  avatar_letter TEXT NOT NULL DEFAULT 'U',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Watchlist
CREATE TABLE IF NOT EXISTS public.watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('movie', 'tv')),
  title TEXT NOT NULL,
  poster_path TEXT,
  backdrop_path TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tmdb_id, type)
);

-- Watch progress
CREATE TABLE IF NOT EXISTS public.watch_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('movie', 'tv')),
  title TEXT NOT NULL,
  poster_path TEXT,
  backdrop_path TEXT,
  progress FLOAT NOT NULL DEFAULT 0,
  season INTEGER,
  episode INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tmdb_id, type)
);

-- Ratings
CREATE TABLE IF NOT EXISTS public.ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('movie', 'tv')),
  liked BOOLEAN NOT NULL,
  UNIQUE (user_id, tmdb_id, type)
);

-- Row Level Security (permite anon key acessar tudo — auth feita via user_id no app)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_users" ON public.users FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_watchlist" ON public.watchlist FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_progress" ON public.watch_progress FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_ratings" ON public.ratings FOR ALL TO anon USING (true) WITH CHECK (true);
