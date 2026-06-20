/**
 * tvmaze.ts — /api/tv
 *
 * TV programming guide powered by:
 *   - TVmaze API (schedule, show details, episodes)
 *   - TMDB (content discovery per network, premieres)
 *
 * Routes:
 *   GET /tv/channels                          — curated BR channel list
 *   GET /tv/guide?date=YYYY-MM-DD             — daily schedule grouped by network
 *   GET /tv/channel/:channelId/schedule       — schedule for one channel (TVmaze)
 *   GET /tv/channel/:channelId/content        — shows/movies from this channel (TMDB)
 *   GET /tv/premieres                         — upcoming premieres (TMDB)
 *   GET /tv/show/:showId                      — TVmaze show details + episodes
 */

import { Router } from "express";

const router = Router();

const TVMAZE_BASE    = "https://api.tvmaze.com";
const TMDB_BASE      = "https://api.themoviedb.org/3";
const TMDB_IMG       = "https://image.tmdb.org/t/p";
const TVMAZE_API_KEY = process.env["TVMAZE_API_KEY"] ?? "reNpE2Bji26A8UNBOqycB92MbTR34bQT";

function getTmdbKey(): string {
  return process.env["TMDB_API_KEY"] ?? "8f0beb08cf016ec8de49e454e09879ec";
}

// ── Curated Brazilian Channel List ───────────────────────────────────────────
export interface ChannelDef {
  id: string;
  name: string;
  shortName: string;
  description: string;
  tagline: string;
  category: "aberta" | "fechada" | "news" | "esporte" | "infantil";
  color: string;
  bgColor: string;
  accentColor: string;
  tvmazeNetworkId: number | null;
  tmdbNetworkId: number | null;
}

const CHANNELS: ChannelDef[] = [
  {
    id: "globo",
    name: "TV Globo",
    shortName: "Globo",
    description: "A maior rede de televisão do Brasil e da América Latina, presente em todo o território nacional.",
    tagline: "A vida como ela é",
    category: "aberta",
    color: "#e30000",
    bgColor: "#1a0000",
    accentColor: "#ff4444",
    tvmazeNetworkId: 374,
    tmdbNetworkId: 65,
  },
  {
    id: "sbt",
    name: "SBT",
    shortName: "SBT",
    description: "Sistema Brasileiro de Televisão — entretenimento, humor e novelas.",
    tagline: "Aqui tem alegria",
    category: "aberta",
    color: "#0066cc",
    bgColor: "#001a40",
    accentColor: "#3399ff",
    tvmazeNetworkId: null,
    tmdbNetworkId: 278,
  },
  {
    id: "record",
    name: "Record TV",
    shortName: "Record",
    description: "Record TV — jornalismo, entretenimento e conteúdo de qualidade.",
    tagline: "Cada vez mais sua",
    category: "aberta",
    color: "#ff6600",
    bgColor: "#1a0d00",
    accentColor: "#ff8833",
    tvmazeNetworkId: null,
    tmdbNetworkId: null,
  },
  {
    id: "band",
    name: "Band",
    shortName: "Band",
    description: "TV Bandeirantes — esporte, jornalismo e programas de auditório.",
    tagline: "A Band é sua",
    category: "aberta",
    color: "#003399",
    bgColor: "#000a1f",
    accentColor: "#4466cc",
    tvmazeNetworkId: null,
    tmdbNetworkId: null,
  },
  {
    id: "redetv",
    name: "RedeTV!",
    shortName: "RedeTV",
    description: "RedeTV! — entretenimento, variedades e programas de auditório.",
    tagline: "Onde o Brasil se vê",
    category: "aberta",
    color: "#cc0033",
    bgColor: "#1a0008",
    accentColor: "#ff3366",
    tvmazeNetworkId: null,
    tmdbNetworkId: null,
  },
  {
    id: "cultura",
    name: "TV Cultura",
    shortName: "Cultura",
    description: "TV Cultura — educação, cultura brasileira e programação infantil.",
    tagline: "Cultura em cada lar",
    category: "aberta",
    color: "#00aa44",
    bgColor: "#001a0d",
    accentColor: "#00dd66",
    tvmazeNetworkId: null,
    tmdbNetworkId: null,
  },
  {
    id: "gnt",
    name: "GNT",
    shortName: "GNT",
    description: "GNT — lifestyle, gastronomia, moda e comportamento feminino.",
    tagline: "Mais você, mais GNT",
    category: "fechada",
    color: "#e87700",
    bgColor: "#1a0e00",
    accentColor: "#ffaa33",
    tvmazeNetworkId: null,
    tmdbNetworkId: 2284,
  },
  {
    id: "multishow",
    name: "Multishow",
    shortName: "Multishow",
    description: "Multishow — humor, música, reality shows e entretenimento.",
    tagline: "Seu canal favorito",
    category: "fechada",
    color: "#9900cc",
    bgColor: "#130019",
    accentColor: "#cc44ff",
    tvmazeNetworkId: null,
    tmdbNetworkId: null,
  },
  {
    id: "hbo",
    name: "HBO",
    shortName: "HBO",
    description: "HBO — as melhores séries e filmes do mundo em sua tela.",
    tagline: "It's not TV. It's HBO.",
    category: "fechada",
    color: "#555555",
    bgColor: "#0a0a0a",
    accentColor: "#aaaaaa",
    tvmazeNetworkId: 8,
    tmdbNetworkId: 49,
  },
  {
    id: "tnt",
    name: "TNT",
    shortName: "TNT",
    description: "TNT Brasil — blockbusters, séries e entretenimento premium.",
    tagline: "Estamos do lado certo",
    category: "fechada",
    color: "#c8102e",
    bgColor: "#1a0208",
    accentColor: "#ff3355",
    tvmazeNetworkId: null,
    tmdbNetworkId: 119,
  },
  {
    id: "discovery",
    name: "Discovery Channel",
    shortName: "Discovery",
    description: "Discovery Channel — documentários, ciência e exploração do mundo.",
    tagline: "O mundo é incrível",
    category: "fechada",
    color: "#013ea8",
    bgColor: "#000f2a",
    accentColor: "#3366dd",
    tvmazeNetworkId: 11,
    tmdbNetworkId: 62,
  },
  {
    id: "natgeo",
    name: "National Geographic",
    shortName: "NatGeo",
    description: "National Geographic — natureza, ciência, historia e aventura.",
    tagline: "Further",
    category: "fechada",
    color: "#f5c400",
    bgColor: "#1a1400",
    accentColor: "#ffd700",
    tvmazeNetworkId: 39,
    tmdbNetworkId: 36,
  },
  {
    id: "cnn_brasil",
    name: "CNN Brasil",
    shortName: "CNN BR",
    description: "CNN Brasil — jornalismo 24 horas com correspondentes no Brasil e no mundo.",
    tagline: "Fatos, não opinião",
    category: "news",
    color: "#c8102e",
    bgColor: "#1a0208",
    accentColor: "#ff3355",
    tvmazeNetworkId: null,
    tmdbNetworkId: null,
  },
  {
    id: "globonews",
    name: "GloboNews",
    shortName: "GloboNews",
    description: "GloboNews — canal de notícias 24 horas da Rede Globo.",
    tagline: "A notícia no seu tempo",
    category: "news",
    color: "#e30000",
    bgColor: "#1a0000",
    accentColor: "#ff4444",
    tvmazeNetworkId: null,
    tmdbNetworkId: null,
  },
  {
    id: "espn",
    name: "ESPN Brasil",
    shortName: "ESPN",
    description: "ESPN Brasil — esporte ao vivo: futebol, NBA, F1, UFC e muito mais.",
    tagline: "The Worldwide Leader in Sports",
    category: "esporte",
    color: "#e30000",
    bgColor: "#1a0000",
    accentColor: "#ff4444",
    tvmazeNetworkId: 22,
    tmdbNetworkId: 2739,
  },
  {
    id: "sportv",
    name: "SporTV",
    shortName: "SporTV",
    description: "SporTV — o canal do esporte brasileiro com transmissões exclusivas.",
    tagline: "Paixão pelo esporte",
    category: "esporte",
    color: "#009900",
    bgColor: "#001a00",
    accentColor: "#00cc44",
    tvmazeNetworkId: null,
    tmdbNetworkId: null,
  },
  {
    id: "cartoon",
    name: "Cartoon Network",
    shortName: "Cartoon",
    description: "Cartoon Network — animações e aventura para toda a família.",
    tagline: "Cartoon é demais",
    category: "infantil",
    color: "#00aaff",
    bgColor: "#001a2a",
    accentColor: "#44ccff",
    tvmazeNetworkId: 33,
    tmdbNetworkId: 56,
  },
  {
    id: "disneych",
    name: "Disney Channel",
    shortName: "Disney CH",
    description: "Disney Channel — mágica e entretenimento para toda a família.",
    tagline: "Where the Magic Lives",
    category: "infantil",
    color: "#006ed1",
    bgColor: "#00142a",
    accentColor: "#3399ff",
    tvmazeNetworkId: 21,
    tmdbNetworkId: null,
  },
];

// ── Cache ─────────────────────────────────────────────────────────────────────
const _cache = new Map<string, { data: any; at: number }>();

function cacheGet(key: string, ttlMs: number): any | null {
  const e = _cache.get(key);
  if (e && Date.now() - e.at < ttlMs) return e.data;
  return null;
}
function cacheSet(key: string, data: any): void {
  _cache.set(key, { data, at: Date.now() });
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
async function tvmazeFetch<T>(path: string, useAuth = false): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const url = new URL(`${TVMAZE_BASE}${path}`);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "NETPLAY/1.0",
    };
    if (useAuth) {
      headers["Authorization"] = `Bearer ${TVMAZE_API_KEY}`;
    }
    const res = await fetch(url.toString(), { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`TVmaze ${res.status}: ${path}`);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(t);
  }
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", getTmdbKey());
  url.searchParams.set("language", "pt-BR");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal });
    if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(t);
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Curated channel list
router.get("/tv/channels", (_req: any, res: any) => {
  res.json({ ok: true, channels: CHANNELS });
});

// Daily guide grouped by TVmaze network
router.get("/tv/guide", async (req: any, res: any) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const cached = cacheGet(`guide:${date}`, 30 * 60 * 1000);
  if (cached) { res.json(cached); return; }

  try {
    const [brRes, webRes] = await Promise.allSettled([
      tvmazeFetch<any[]>(`/schedule?country=BR&date=${date}`),
      tvmazeFetch<any[]>(`/schedule/web?country=BR&date=${date}`),
    ]);

    const episodes: any[] = [
      ...(brRes.status === "fulfilled" ? brRes.value : []),
      ...(webRes.status === "fulfilled" ? webRes.value : []),
    ];

    const byNetwork: Record<string, { network: any; episodes: any[] }> = {};
    for (const ep of episodes) {
      const network = ep.show?.network || ep.show?.webChannel;
      if (!network) continue;
      const nid = String(network.id);
      if (!byNetwork[nid]) byNetwork[nid] = { network, episodes: [] };
      byNetwork[nid].episodes.push({
        id: ep.id,
        name: ep.name,
        season: ep.season,
        number: ep.number,
        airtime: ep.airtime,
        airstamp: ep.airstamp,
        runtime: ep.runtime ?? 60,
        show: {
          id: ep.show.id,
          name: ep.show.name,
          genres: ep.show.genres ?? [],
          image: ep.show.image,
          rating: ep.show.rating,
          summary: ep.show.summary,
        },
      });
    }

    for (const nid of Object.keys(byNetwork)) {
      byNetwork[nid].episodes.sort((a, b) => (a.airtime ?? "").localeCompare(b.airtime ?? ""));
    }

    const data = { ok: true, date, byNetwork };
    cacheSet(`guide:${date}`, data);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "TVmaze error" });
  }
});

// Schedule for a specific channel (by our channel id → tvmazeNetworkId)
router.get("/tv/channel/:channelId/schedule", async (req: any, res: any) => {
  const { channelId } = req.params;
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const channel = CHANNELS.find((c) => c.id === channelId);

  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  // If no TVmaze ID, return empty gracefully
  if (!channel.tvmazeNetworkId) {
    res.json({ ok: true, channelId, date, episodes: [], channel });
    return;
  }

  const cacheKey = `chsched:${channelId}:${date}`;
  const cached = cacheGet(cacheKey, 30 * 60 * 1000);
  if (cached) { res.json(cached); return; }

  try {
    const schedule = await tvmazeFetch<any[]>(`/schedule?country=BR&date=${date}`);
    const eps = schedule
      .filter(
        (ep) =>
          String(ep.show?.network?.id) === String(channel.tvmazeNetworkId) ||
          String(ep.show?.webChannel?.id) === String(channel.tvmazeNetworkId)
      )
      .sort((a, b) => (a.airtime ?? "").localeCompare(b.airtime ?? ""));

    const data = { ok: true, channelId, date, episodes: eps, channel };
    cacheSet(cacheKey, data);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "TVmaze error" });
  }
});

// TMDB content for a channel (shows + movies)
router.get("/tv/channel/:channelId/content", async (req: any, res: any) => {
  const { channelId } = req.params;
  const channel = CHANNELS.find((c) => c.id === channelId);

  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const cacheKey = `chcontent:${channelId}`;
  const cached = cacheGet(cacheKey, 2 * 60 * 60 * 1000); // 2h
  if (cached) { res.json(cached); return; }

  const mapItem = (r: any, type: "tv" | "movie") => ({
    tmdbId: r.id,
    type,
    title: r.title ?? r.name ?? "",
    year: parseInt((r.release_date ?? r.first_air_date ?? "2024").slice(0, 4)),
    rating: Math.round((r.vote_average ?? 0) * 10) / 10,
    poster: r.poster_path ? `${TMDB_IMG}/w342${r.poster_path}` : null,
    backdrop: r.backdrop_path ? `${TMDB_IMG}/w780${r.backdrop_path}` : null,
    overview: r.overview ?? "",
    genreIds: r.genre_ids ?? [],
    popularity: r.popularity ?? 0,
  });

  try {
    let shows: any[] = [];
    let movies: any[] = [];

    if (channel.tmdbNetworkId) {
      const [sv, mv] = await Promise.allSettled([
        tmdbFetch<any>("/discover/tv", {
          with_networks: String(channel.tmdbNetworkId),
          sort_by: "popularity.desc",
          "vote_count.gte": "5",
          page: "1",
        }),
        tmdbFetch<any>("/discover/movie", {
          with_watch_providers: String(channel.tmdbNetworkId),
          watch_region: "BR",
          sort_by: "popularity.desc",
          page: "1",
        }),
      ]);
      shows = sv.status === "fulfilled" ? (sv.value.results ?? []) : [];
      movies = mv.status === "fulfilled" ? (mv.value.results ?? []) : [];
    }

    // Supplement with a trending/popular search by channel name
    if (shows.length < 5) {
      const keywords = channel.id === "hbo" ? "hbo" :
                       channel.id === "discovery" ? "discovery" :
                       channel.id === "natgeo" ? "national geographic" :
                       channel.id === "cartoon" ? "cartoon network" :
                       channel.shortName.toLowerCase();

      const [kv] = await Promise.allSettled([
        tmdbFetch<any>("/search/tv", { query: keywords, page: "1" }),
      ]);
      if (kv.status === "fulfilled") {
        const extra = (kv.value.results ?? []).filter((r: any) => r.poster_path);
        shows = [...shows, ...extra].slice(0, 20);
      }
    }

    const data = {
      ok: true,
      channelId,
      channel,
      shows: shows
        .filter((r) => r.poster_path || r.backdrop_path)
        .slice(0, 20)
        .map((r) => mapItem(r, "tv")),
      movies: movies
        .filter((r) => r.poster_path || r.backdrop_path)
        .slice(0, 20)
        .map((r) => mapItem(r, "movie")),
    };
    cacheSet(cacheKey, data);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Error" });
  }
});

// TVmaze show details (with cast + episodes)
router.get("/tv/show/:showId", async (req: any, res: any) => {
  const { showId } = req.params;
  const cached = cacheGet(`show:${showId}`, 60 * 60 * 1000); // 1h
  if (cached) { res.json(cached); return; }

  try {
    const show = await tvmazeFetch<any>(`/shows/${showId}?embed[]=episodes&embed[]=cast`);
    cacheSet(`show:${showId}`, show);
    res.json(show);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "TVmaze error" });
  }
});

// Upcoming premieres (TMDB)
router.get("/tv/premieres", async (_req: any, res: any) => {
  const cached = cacheGet("premieres", 60 * 60 * 1000);
  if (cached) { res.json(cached); return; }

  const mapItem = (r: any, type: "tv" | "movie") => ({
    tmdbId: r.id,
    type,
    title: r.title ?? r.name ?? "",
    year: parseInt((r.release_date ?? r.first_air_date ?? "2024").slice(0, 4)),
    rating: Math.round((r.vote_average ?? 0) * 10) / 10,
    poster: r.poster_path ? `${TMDB_IMG}/w342${r.poster_path}` : null,
    backdrop: r.backdrop_path ? `${TMDB_IMG}/w780${r.backdrop_path}` : null,
    releaseDate: r.release_date ?? r.first_air_date ?? null,
    overview: r.overview ?? "",
  });

  try {
    // TV series: airing this week on BR
    // Movies: only from streaming/cable providers in BR (NOT cinema upcoming)
    //   Netflix=8, Amazon Prime=119, Disney+=337, HBO Max=384, Globoplay=307, Paramount+=531, Apple TV+=350
    const BR_STREAMING = "8|119|337|384|307|531|350";

    const today = new Date();
    const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const [tv, movies] = await Promise.allSettled([
      tmdbFetch<any>("/discover/tv", {
        watch_region: "BR",
        with_watch_providers: BR_STREAMING,
        sort_by: "first_air_date.desc",
        "first_air_date.gte": fmt(today),
        "first_air_date.lte": fmt(in30),
        page: "1",
      }),
      // Streaming movies — exclude those without a streaming provider (cinema-only)
      tmdbFetch<any>("/discover/movie", {
        watch_region: "BR",
        with_watch_providers: BR_STREAMING,
        sort_by: "release_date.desc",
        "release_date.gte": fmt(new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000)),
        "release_date.lte": fmt(in30),
        page: "1",
      }),
    ]);

    // If discover returns few results, fall back to on_the_air for series
    let seriesList: any[] = tv.status === "fulfilled" ? (tv.value.results ?? []) : [];
    if (seriesList.length < 5) {
      const fallback = await tmdbFetch<any>("/tv/on_the_air", { watch_region: "BR", page: "1" }).catch(() => null);
      seriesList = [...seriesList, ...(fallback?.results ?? [])];
    }

    const data = {
      ok: true,
      series: seriesList.filter((r: any) => r.poster_path).slice(0, 15).map((r: any) => mapItem(r, "tv")),
      movies: movies.status === "fulfilled"
        ? (movies.value.results ?? []).filter((r: any) => r.poster_path).slice(0, 15).map((r: any) => mapItem(r, "movie"))
        : [],
    };
    cacheSet("premieres", data);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Error" });
  }
});

// ── Full today schedule per channel (past + live + upcoming) ─────────────────
router.get("/tv/schedule/today", async (req: any, res: any) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const cacheKey = `today:${date}`;
  const cached = cacheGet(cacheKey, 10 * 60 * 1000); // 10 min cache
  if (cached) { res.json(cached); return; }

  try {
    const [brRes, webRes] = await Promise.allSettled([
      tvmazeFetch<any[]>(`/schedule?country=BR&date=${date}`, true),
      tvmazeFetch<any[]>(`/schedule/web?country=BR&date=${date}`, true),
    ]);

    const allEps: any[] = [
      ...(brRes.status === "fulfilled" ? brRes.value : []),
      ...(webRes.status === "fulfilled" ? webRes.value : []),
    ];

    const now = Date.now();

    function epStatus(airtime: string, runtime: number): "past" | "live" | "upcoming" {
      if (!airtime) return "upcoming";
      const [h, m] = airtime.split(":").map(Number);
      const start = new Date(date);
      start.setHours(h, m, 0, 0);
      const end = new Date(start.getTime() + (runtime ?? 60) * 60000);
      if (now < start.getTime()) return "upcoming";
      if (now > end.getTime()) return "past";
      return "live";
    }

    // Build per-channel schedule for all our curated channels
    const byChannel: Record<string, any[]> = {};
    for (const ch of CHANNELS) {
      if (!ch.tvmazeNetworkId) continue;
      const eps = allEps
        .filter(
          (ep) =>
            String(ep.show?.network?.id) === String(ch.tvmazeNetworkId) ||
            String(ep.show?.webChannel?.id) === String(ch.tvmazeNetworkId)
        )
        .sort((a, b) => (a.airtime ?? "").localeCompare(b.airtime ?? ""))
        .map((ep) => ({
          id: ep.id,
          name: ep.name,
          season: ep.season,
          number: ep.number,
          airtime: ep.airtime,
          airstamp: ep.airstamp,
          runtime: ep.runtime ?? 60,
          status: epStatus(ep.airtime, ep.runtime ?? 60),
          show: {
            id: ep.show.id,
            name: ep.show.name,
            genres: ep.show.genres ?? [],
            image: ep.show.image,
            summary: ep.show.summary ?? "",
            rating: ep.show.rating?.average ?? null,
          },
        }));
      if (eps.length > 0) byChannel[ch.id] = eps;
    }

    // Also include a raw "all" grouped by network (for channels not in our curated list)
    const byNetwork: Record<string, any[]> = {};
    for (const ep of allEps) {
      const network = ep.show?.network || ep.show?.webChannel;
      if (!network) continue;
      const nid = String(network.id);
      if (!byNetwork[nid]) byNetwork[nid] = [];
      byNetwork[nid].push({
        id: ep.id,
        name: ep.name,
        airtime: ep.airtime,
        runtime: ep.runtime ?? 60,
        status: epStatus(ep.airtime, ep.runtime ?? 60),
        networkName: network.name,
        show: {
          id: ep.show.id,
          name: ep.show.name,
          genres: ep.show.genres ?? [],
          image: ep.show.image,
        },
      });
    }

    const data = { ok: true, date, byChannel, byNetwork, channels: CHANNELS };
    cacheSet(cacheKey, data);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "TVmaze error" });
  }
});

// TMDB trending for a category (used by channel category filter)
router.get("/tv/trending", async (req: any, res: any) => {
  const category = (req.query.category as string) || "all";
  const cacheKey = `trending:${category}`;
  const cached = cacheGet(cacheKey, 60 * 60 * 1000);
  if (cached) { res.json(cached); return; }

  const mapItem = (r: any, type: "tv" | "movie") => ({
    tmdbId: r.id,
    type,
    title: r.title ?? r.name ?? "",
    year: parseInt((r.release_date ?? r.first_air_date ?? "2024").slice(0, 4)),
    rating: Math.round((r.vote_average ?? 0) * 10) / 10,
    poster: r.poster_path ? `${TMDB_IMG}/w342${r.poster_path}` : null,
    backdrop: r.backdrop_path ? `${TMDB_IMG}/w780${r.backdrop_path}` : null,
    overview: r.overview ?? "",
  });

  try {
    const [tv, mov] = await Promise.allSettled([
      tmdbFetch<any>("/trending/tv/week"),
      tmdbFetch<any>("/trending/movie/week"),
    ]);

    const data = {
      ok: true,
      tv: tv.status === "fulfilled"
        ? (tv.value.results ?? []).filter((r: any) => r.poster_path).slice(0, 20).map((r: any) => mapItem(r, "tv"))
        : [],
      movies: mov.status === "fulfilled"
        ? (mov.value.results ?? []).filter((r: any) => r.poster_path).slice(0, 20).map((r: any) => mapItem(r, "movie"))
        : [],
    };
    cacheSet(cacheKey, data);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Error" });
  }
});

export default router;
