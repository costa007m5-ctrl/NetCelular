-- ═══════════════════════════════════════════════════════════════
-- NETPLAY — Cloudflare D1 Schema
-- Cole este SQL no console do D1 (dash.cloudflare.com → Workers & Pages → D1)
-- ═══════════════════════════════════════════════════════════════

-- ── Catálogo principal (filmes e séries) ────────────────────────
CREATE TABLE IF NOT EXISTS content (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id         INTEGER UNIQUE,
  type            TEXT NOT NULL CHECK(type IN ('movie', 'tv')),
  title           TEXT NOT NULL,
  original_title  TEXT,
  overview        TEXT,
  poster_path     TEXT,
  backdrop_path   TEXT,
  release_year    INTEGER,
  rating          REAL DEFAULT 0,
  vote_count      INTEGER DEFAULT 0,
  genres          TEXT DEFAULT '[]',   -- JSON array de strings
  runtime         INTEGER,             -- minutos (filmes)
  total_seasons   INTEGER,             -- temporadas (séries)
  is_featured     INTEGER DEFAULT 0,   -- 1 = aparece no hero banner
  is_top10        INTEGER DEFAULT 0,   -- 1 = aparece na lista Top 10
  top10_rank      INTEGER,             -- posição 1–10
  status          TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'coming_soon')),
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

-- ── Temporadas de séries ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seasons (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id      INTEGER NOT NULL,
  tmdb_id         INTEGER,
  season_number   INTEGER NOT NULL,
  name            TEXT,
  overview        TEXT,
  poster_path     TEXT,
  episode_count   INTEGER DEFAULT 0,
  air_date        TEXT,
  FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
  UNIQUE(content_id, season_number)
);

-- ── Episódios ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS episodes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id      INTEGER NOT NULL,
  season_id       INTEGER,
  tmdb_id         INTEGER,
  season_number   INTEGER NOT NULL,
  episode_number  INTEGER NOT NULL,
  name            TEXT,
  overview        TEXT,
  still_path      TEXT,
  runtime         INTEGER,
  air_date        TEXT,
  FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
  FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL,
  UNIQUE(content_id, season_number, episode_number)
);

-- ── Fontes de vídeo (R2, Terabox, M3U8, Embed) ─────────────────
CREATE TABLE IF NOT EXISTS content_sources (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id      INTEGER NOT NULL,
  season_number   INTEGER,            -- NULL = filme inteiro
  episode_number  INTEGER,            -- NULL = temporada inteira (pasta R2)
  source_type     TEXT NOT NULL CHECK(source_type IN ('r2', 'terabox', 'm3u8', 'embed', 'hls')),
  source_url      TEXT NOT NULL,      -- chave R2, ID Terabox, ou URL direta
  quality         TEXT DEFAULT 'HD'  CHECK(quality IN ('SD', 'HD', 'FHD', '4K', 'AUTO')),
  language        TEXT DEFAULT 'pt-BR',
  label           TEXT,               -- ex: "Dublado HD", "Legendado FHD"
  priority        INTEGER DEFAULT 0,  -- maior = preferido
  is_active       INTEGER DEFAULT 1,
  created_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE
);

-- ── Índices de performance ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_content_type       ON content(type);
CREATE INDEX IF NOT EXISTS idx_content_tmdb       ON content(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_content_status     ON content(status);
CREATE INDEX IF NOT EXISTS idx_content_featured   ON content(is_featured);
CREATE INDEX IF NOT EXISTS idx_content_top10      ON content(is_top10, top10_rank);
CREATE INDEX IF NOT EXISTS idx_seasons_content    ON seasons(content_id);
CREATE INDEX IF NOT EXISTS idx_episodes_content   ON episodes(content_id, season_number, episode_number);
CREATE INDEX IF NOT EXISTS idx_sources_content    ON content_sources(content_id);
CREATE INDEX IF NOT EXISTS idx_sources_active     ON content_sources(content_id, is_active);

-- ── Trigger: atualiza updated_at ao editar content ──────────────
CREATE TRIGGER IF NOT EXISTS content_updated_at
  AFTER UPDATE ON content
BEGIN
  UPDATE content SET updated_at = datetime('now') WHERE id = NEW.id;
END;
