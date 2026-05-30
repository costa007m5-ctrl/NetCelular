-- NETPLAY Supabase Schema
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql/new

-- Watchlist: items the user saved to "Minha Lista"
create table if not exists watchlist (
  id uuid default gen_random_uuid() primary key,
  device_id text not null,
  tmdb_id integer not null,
  type text not null check (type in ('movie', 'tv')),
  title text,
  poster_path text,
  backdrop_path text,
  added_at timestamp with time zone default now(),
  unique (device_id, tmdb_id, type)
);

-- Watch progress: tracks how far the user is in each title
create table if not exists watch_progress (
  id uuid default gen_random_uuid() primary key,
  device_id text not null,
  tmdb_id integer not null,
  type text not null check (type in ('movie', 'tv')),
  title text,
  poster_path text,
  backdrop_path text,
  progress float not null default 0 check (progress >= 0 and progress <= 1),
  season integer,
  episode integer,
  updated_at timestamp with time zone default now(),
  unique (device_id, tmdb_id, type)
);

-- Enable Row Level Security (RLS)
-- Since we use device_id (no auth), we open access for now.
-- You can restrict later by adding Supabase Auth and changing policies.

alter table watchlist enable row level security;
alter table watch_progress enable row level security;

-- Open policies (device-id based, no auth required)
create policy "Allow all on watchlist" on watchlist for all using (true) with check (true);
create policy "Allow all on watch_progress" on watch_progress for all using (true) with check (true);

-- Indexes for fast lookups
create index if not exists idx_watchlist_device on watchlist (device_id);
create index if not exists idx_progress_device on watch_progress (device_id);
