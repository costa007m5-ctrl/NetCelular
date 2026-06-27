import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { ProfileAvatarButton } from "@/components/ProfileAvatarButton";
import { r2Route } from "@/lib/r2-direct";
import { getProxiedStreamUrl } from "@/lib/gdrive-index";
import { api, getApiBase, TMDB_IMG, tmdbItemToContent, type TmdbItem } from "@/lib/api";
import type { ContentItem } from "@/constants/content";
import { getMergedPreferences } from "@/lib/smart-preferences";
import { getBehaviorProfile, trackOpen } from "@/lib/ai-behavior-tracker";

const _GENRE_NAMES: Record<number, string> = {
  28: "Ação", 12: "Aventura", 16: "Animação", 35: "Comédia", 80: "Crime",
  99: "Documentário", 18: "Drama", 10751: "Família", 14: "Fantasia",
  27: "Terror", 9648: "Mistério", 10749: "Romance", 878: "Ficção Científica",
  53: "Thriller", 10752: "Guerra",
};

const { width: W, height: H } = Dimensions.get("window");

const RED    = "#e50914";
const AMBER  = "#f59e0b";
const GREEN  = "#22c55e";
const BLUE   = "#3b82f6";
const PURPLE = "#8b5cf6";
const TEAL   = "#0891b2";
const PINK   = "#ec4899";
const ORANGE = "#f97316";

const HERO_H = Math.round(H * 0.52);
const BANNER_INTERVAL = 6000;

// ─── Types ────────────────────────────────────────────────────────────────────
interface WhatsNewItem {
  id: string;
  title: string;
  tmdb_id: number;
  type: string;
  year: number;
  poster: string;
  backdrop?: string;
  added_at: number;
  added_date: string;
  rating?: number;
  overview?: string;
  exclusive?: boolean;
  stream_url?: string;
}

interface Top10Item {
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  poster: string | null;
  backdrop: string | null;
  rating: number;
  year: number;
  genre: string;
}
interface WhatsNewResp {
  ok: boolean;
  warming?: boolean;
  fallback?: boolean;
  since: string;
  days: number;
  total: number;
  movies: WhatsNewItem[];
  series: WhatsNewItem[];
  animes: WhatsNewItem[];
}

interface RawEp { season: number; episode: number; stream_url: string; title: string; }
interface EpGroup {
  seriesId: string; seriesTitle: string; seriesPoster: string; seriesTmdbId: number;
  totalEps: number; latestEp: RawEp; allEps: RawEp[]; seriesOverview?: string;
  backdropPath?: string; logoPath?: string;
  latestEpStill?: string; latestEpOverview?: string;
}

let WebViewEp: any = null;
try { WebViewEp = require("react-native-webview").WebView; } catch {}
const IS_NATIVE_EP = Platform.OS !== "web";

function buildEpPreviewHtml(uri: string, muted = true): string {
  const escaped = uri.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const mutedStr = muted ? "true" : "false";
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"/><style>*{margin:0;padding:0;background:#000}html,body,video{width:100%;height:100%;overflow:hidden}video{object-fit:cover;display:block}</style></head><body><video id="v" playsinline webkit-playsinline preload="auto"></video><script>(function(){var v=document.getElementById('v');var rn=window.ReactNativeWebView;v.muted=${mutedStr};function send(t,d){try{rn.postMessage(JSON.stringify(Object.assign({type:t},d||{})))}catch(e){}}v.addEventListener('loadedmetadata',function(){send('ready',{duration:v.duration*1000});});v.addEventListener('canplay',function(){v.play().catch(function(){});});v.addEventListener('error',function(){send('error',{code:v.error?v.error.code:-1});});function handleCmd(e){try{var d=JSON.parse(typeof e==='string'?e:(e.data||'{}'));if(d.type==='mute'){v.muted=true;}else if(d.type==='unmute'){v.muted=false;v.play().catch(function(){});}}catch(ex){}}window.addEventListener('message',handleCmd);document.addEventListener('message',handleCmd);v.src='${escaped}';v.load();v.play().catch(function(){});})()</script></body></html>`;
}

// ─── Flix2 stream resolution (ported from Shorts system) ──────────────────────
// Module-level cache so cards that scroll past once don't re-fetch on re-render
const FLIX_STREAM_CACHE = new Map<string, string>(); // cacheKey → final stream URL

function _isDirectVideo(u: string): boolean {
  return u.length > 0 && !u.startsWith("flix2id:") && !u.includes("player_api.php") && u !== "null";
}

/** Client-side episode picker when server IP is blocked (mirrors Shorts pickInterestingEpisode) */
function _pickEpisode(episodes: RawEp[]): RawEp | null {
  if (!episodes.length) return null;
  const bySeason = new Map<number, RawEp[]>();
  for (const ep of episodes) {
    if (!bySeason.has(ep.season)) bySeason.set(ep.season, []);
    bySeason.get(ep.season)!.push(ep);
  }
  const seasons = [...bySeason.keys()].sort((a, b) => a - b);
  const target = seasons.length >= 3
    ? seasons.slice(1, 3)[Math.floor(Math.random() * 2)]
    : seasons[seasons.length - 1];
  const pool = (bySeason.get(target) ?? episodes).filter(
    ep => !(ep.season === 1 && ep.episode <= 2)
  );
  const src = pool.length > 0 ? pool : (bySeason.get(target) ?? episodes);
  return src[Math.floor(Math.random() * src.length)] ?? null;
}

/** Resolve series episode stream URL — with client-side fallback (datacenter IP blocked) */
async function _resolveSeriesStream(seriesId: string, signal: AbortSignal): Promise<string> {
  const base = getApiBase();
  const res = await fetch(`${base}/r2/flix2/series-episodes?seriesId=${seriesId}`, { signal });
  if (!res.ok) return "";
  const data = await res.json() as any;

  if (data.found && Array.isArray(data.episodes) && data.episodes.length > 0) {
    const sorted = [...(data.episodes as RawEp[])].sort((a, b) =>
      b.season !== a.season ? b.season - a.season : b.episode - a.episode
    );
    return sorted[0]?.stream_url ?? "";
  }

  // Datacenter IP blocked → fetch directly from device (residential IP)
  if (data.tryClientDirect && data.directUrl && data.streamBase) {
    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), 8000);
    try {
      const r2 = await fetch(data.directUrl as string, { signal: ctrl2.signal });
      clearTimeout(t2);
      if (!r2.ok) return "";
      const d2 = await r2.json() as any;
      if (!d2?.episodes || typeof d2.episodes !== "object") return "";
      const all: RawEp[] = [];
      for (const [s, eps] of Object.entries(d2.episodes as Record<string, any[]>)) {
        if (!Array.isArray(eps)) continue;
        for (const ep of eps) {
          if (!ep?.id) continue;
          const ext = (ep.container_extension as string) || "mp4";
          all.push({ season: Number(s), episode: Number(ep.episode_num ?? ep.episode ?? 1),
            title: (ep.name ?? ep.title ?? "") as string,
            stream_url: `${data.streamBase as string}${ep.id}.${ext}` });
        }
      }
      const picked = _pickEpisode(all);
      return picked?.stream_url ?? "";
    } catch { clearTimeout(t2); return ""; }
  }
  return "";
}

/** Extracts quality (HD/CAM/4K…) and audio (DUB/LEG/DUAL) labels from a catalog title. */
function _extractQuality(title: string): { q: string | null; audio: string | null } {
  const u = (title ?? "").toUpperCase();
  let q: string | null = null;
  let audio: string | null = null;
  if (/\b4K\b|\b2160P?\b/.test(u))                                   q = "4K";
  else if (/\b1080P?\b|\bFULL[\s-]?HD\b|\bBLU[\s-]?RAY\b|\bBDRIP\b|\bBDREMUX\b/.test(u)) q = "FHD";
  else if (/\b720P?\b|\bHDTV\b|\bWEB[\s-]?DL\b|\bWEBRIP\b|\bHDRIP\b|\bHD\b/.test(u))     q = "HD";
  else if (/\bCAM[\s-]?RIP\b|\bCAM\b|\bTS\b|\bDVDSCR\b|\bSCREENER\b/.test(u))            q = "CAM";
  if      (/\bDUAL[\s-]?(AUDIO|ÁUDIO|AUDIO)?\b/.test(u))            audio = "DUAL";
  else if (/\bDUBLAD[OA]\b|\b\(DUB\)\b|\bDUBLAGEM\b|\b\sDUB\b/.test(u)) audio = "DUB";
  else if (/\bLEGENDAD[OA]\b|\b\(LEG\)\b|\bLEGENDADO\b/.test(u))   audio = "LEG";
  return { q, audio };
}

/** Full Flix2 stream resolution. Priority:
 *  0. item.flix2Url already set (from WhatsNew catalog) → use directly, no lookup needed
 *  1. Flix2 catalog lookup (by tmdbId or title)
 *  2. Veo catalog fallback (nixplay.lat) */
async function resolveFlixStream(item: ContentItem, signal: AbortSignal): Promise<string | null> {
  const isMovie = (item.mediaType ?? item.type) === "movie";
  const base = getApiBase();

  // ── 0. Direct stream URL already embedded in item (WhatsNew items) ──────────
  if (item.flix2Url && _isDirectVideo(item.flix2Url)) {
    return item.flix2Url;
  }

  // Need at least a title to do a catalog lookup
  if (!item.title) return null;

  const tmdbId = item.tmdbId ?? 0;

  // ── 1. Try Flix2 catalog first ─────────────────────────────────────────────
  try {
    const lookupUrl = `${base}/r2/flix2/lookup?tmdbId=${tmdbId}&type=${isMovie ? "movies" : "all"}&title=${encodeURIComponent(item.title)}`;
    const res = await fetch(lookupUrl, { signal });
    if (res.ok && !signal.aborted) {
      const data = await res.json() as any;
      if (data.found && data.item) {
        let raw: string = data.item?.stream_url ?? "";
        if (!_isDirectVideo(raw)) {
          const seriesId = String(data.item?.id ?? data.item?.series_id ?? "");
          if (seriesId) raw = await _resolveSeriesStream(seriesId, signal);
        }
        if (_isDirectVideo(raw)) return raw;
      }
    }
  } catch { /* fall through to Veo */ }

  if (signal.aborted) return null;

  // ── 2. Fallback: try Veo catalog (nixplay.lat) ─────────────────────────────
  try {
    const veoUrl = `${base}/r2/veo/lookup?tmdbId=${tmdbId}&type=${isMovie ? "movies" : "all"}&title=${encodeURIComponent(item.title)}`;
    const vRes = await fetch(veoUrl, { signal });
    if (vRes.ok && !signal.aborted) {
      const vData = await vRes.json() as any;
      if (vData.found && vData.item?.stream_url) {
        const raw: string = vData.item.stream_url;
        if (_isDirectVideo(raw)) return raw;
      }
    }
  } catch { /* not available */ }

  return null;
}

interface AllData {
  trending: TmdbItem[];
  trendingMovies: TmdbItem[];
  trendingTv: TmdbItem[];
  nowPlaying: TmdbItem[];
  upcoming: TmdbItem[];
  onTheAir: TmdbItem[];
  airingToday: TmdbItem[];
  whatsNew: WhatsNewResp | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function wn2Content(item: WhatsNewItem): ContentItem {
  const isMovie = item.type === "filme" || item.type === "movie";
  return {
    id: String(item.id),
    tmdbId: Number(item.tmdb_id) || 0,
    title: item.title ?? "",
    year: item.year || 0,
    rating: item.rating ?? 0,
    // Use || (not ??) so empty strings fall through to the fallback
    posterPath: item.poster || item.backdrop || "",
    backdropPath: item.backdrop || item.poster || "",
    description: item.overview ?? "",
    genres: [],
    type: isMovie ? "movie" : "series",
    mediaType: isMovie ? "movie" : "tv",
    exclusive: item.exclusive ?? false,
    addedAt: item.added_at,
    flix2Url: item.stream_url,
  };
}

/** Retorna dias desde que foi adicionado (0 = hoje), ou null se desconhecido/fora dos 30 dias */
function getDaysAgo(addedAt: number | undefined): number | null {
  if (!addedAt) return null;
  // added_at pode ser segundos (< 1e12) ou milissegundos
  const ms = addedAt < 1e12 ? addedAt * 1000 : addedAt;
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days < 0 || days > 30) return null;
  return days;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

async function fetchWhatsNew(attempt = 0): Promise<WhatsNewResp | null> {
  try {
    const res = await r2Route<WhatsNewResp>("/flix2/whats-new?days=30&limit=500");
    // Only retry when we have ZERO items — if series/animes are available, show them
    // immediately even if movies is still warming (movies may never warm in production).
    const hasData = (res.total ?? 0) > 0;
    if (res.warming && !hasData && attempt < 5) {
      await new Promise((r) => setTimeout(r, 5000));
      return fetchWhatsNew(attempt + 1);
    }
    return res;
  } catch {
    return null;
  }
}

async function loadAll(): Promise<AllData> {
  const [trendingRes, nowPlayingRes, upcomingRes, onTheAirRes, airingRes, wnRes] =
    await Promise.allSettled([
      api.tmdb.trending(),
      api.tmdb.nowPlaying(),
      api.tmdb.upcoming(),
      api.tmdb.onTheAir(),
      api.tmdb.airingToday(),
      fetchWhatsNew(),
    ]);

  const trending = trendingRes.status === "fulfilled" ? trendingRes.value : { all: [], movies: [], tv: [] };
  return {
    trending: (trending as any).all ?? [],
    trendingMovies: (trending as any).movies ?? [],
    trendingTv: (trending as any).tv ?? [],
    nowPlaying: nowPlayingRes.status === "fulfilled" ? (nowPlayingRes.value as TmdbItem[]) : [],
    upcoming: upcomingRes.status === "fulfilled" ? (upcomingRes.value as TmdbItem[]) : [],
    onTheAir: onTheAirRes.status === "fulfilled" ? (onTheAirRes.value as TmdbItem[]) : [],
    airingToday: airingRes.status === "fulfilled" ? (airingRes.value as TmdbItem[]) : [],
    whatsNew: wnRes.status === "fulfilled" ? (wnRes.value as WhatsNewResp | null) : null,
  };
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonRow({ count = 4, width = 120, height = 180 }: { count?: number; width?: number; height?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 850, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 850, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.12] });
  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View key={i} style={{ width, height, borderRadius: 12, backgroundColor: "white", opacity }} />
      ))}
    </View>
  );
}

function SkeletonHero() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 950, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 950, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.14] });
  return (
    <Animated.View style={{ width: W, height: HERO_H, backgroundColor: "white", opacity }} />
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
function SectionHeader({
  title, subtitle, icon, badge, accentColor = RED, onSeeAll,
}: {
  title: string; subtitle?: string; icon?: keyof typeof Feather.glyphMap;
  badge?: string | number; accentColor?: string; onSeeAll?: () => void;
}) {
  const parts = title.split(" ");
  const first = parts[0];
  const rest = parts.slice(1).join(" ");
  return (
    <View style={[sh.wrap, { overflow: "hidden" }]}>
      <LinearGradient
        colors={[`${accentColor}22`, "transparent"]}
        start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={sh.left}>
        <View style={[sh.bar, { backgroundColor: accentColor }]} />
        <View>
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text style={[sh.title, { color: accentColor }]}>{first}</Text>
            {rest ? <Text style={sh.title}> {rest}</Text> : null}
            {badge != null && (
              <View style={[sh.badge, { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}44` }]}>
                <Text style={[sh.badgeText, { color: accentColor }]}>{badge}</Text>
              </View>
            )}
          </View>
          {subtitle ? <Text style={sh.sub}>{subtitle}</Text> : null}
        </View>
      </View>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7} style={sh.seeAll}>
          <Text style={sh.seeAllText}>Ver mais</Text>
          <Feather name="chevron-right" size={12} color="rgba(255,255,255,0.35)" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const sh = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, marginBottom: 4 },
  left: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  bar: { width: 3, height: 20, borderRadius: 2 },
  iconBox: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "800", color: "#fff", letterSpacing: 0.2 },
  sub: { fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 1 },
  badge: { marginLeft: 6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 3, paddingLeft: 12 },
  seeAllText: { fontSize: 12, color: "rgba(255,255,255,0.38)", fontWeight: "600" },
});

// ─── PosterCard ───────────────────────────────────────────────────────────────
function PosterCard({
  item, onPress, isNew, badge, badgeColor = GREEN,
}: {
  item: ContentItem; onPress: () => void; isNew?: boolean; badge?: string; badgeColor?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const prevPosterRef = useRef<string>("");
  useEffect(() => {
    const u = item.posterPath || "";
    if (u && u !== prevPosterRef.current) { prevPosterRef.current = u; setErr(false); }
  }, [item.posterPath]);
  const pi = () => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 32 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={{ width: 118, marginRight: 10, transform: [{ scale }] }}>
        <View style={pc.card}>
          {!err && item.posterPath ? (
            <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" transition={250}
              onError={() => setErr(true)} />
          ) : (
            <LinearGradient colors={["#1a0a14", "#0a060e"]} style={StyleSheet.absoluteFill}>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Feather name="film" size={22} color="rgba(255,255,255,0.07)" />
              </View>
            </LinearGradient>
          )}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.78)"]} locations={[0.5, 1]}
            style={StyleSheet.absoluteFill} />
          {(badge || isNew) && (
            <View style={[pc.badge, { backgroundColor: badge ? `${badgeColor}ee` : `${GREEN}ee` }]}>
              <Text style={pc.badgeText}>{badge ?? "NOVO"}</Text>
            </View>
          )}
          {item.rating > 0 && (
            <View style={pc.rating}>
              <Feather name="star" size={8} color={AMBER} />
              <Text style={pc.ratingText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        <Text style={pc.title} numberOfLines={2}>{item.title}</Text>
        <Text style={pc.meta}>
          {item.type === "movie" ? "Filme" : "Série"}{item.year > 0 ? ` · ${item.year}` : ""}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const pc = StyleSheet.create({
  card: { width: 118, height: 172, borderRadius: 12, overflow: "hidden", backgroundColor: "#111", marginBottom: 6 },
  badge: { position: "absolute", top: 7, left: 7, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  badgeText: { fontSize: 8, fontWeight: "900", color: "#fff", letterSpacing: 0.8 },
  rating: { position: "absolute", bottom: 7, right: 7, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "rgba(0,0,0,0.72)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  ratingText: { fontSize: 9, fontWeight: "700", color: AMBER },
  title: { fontSize: 12, fontWeight: "700", color: "#fff", lineHeight: 16 },
  meta: { fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 },
});

// ─── LandscapeCard (wider, for now-playing) ───────────────────────────────────
function LandscapeCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const imgUri = item.backdropPath || item.posterPath;
  const prevImgRef = useRef<string | null>(null);
  useEffect(() => {
    if (imgUri && imgUri !== prevImgRef.current) { prevImgRef.current = imgUri; setErr(false); }
  }, [imgUri]);
  const pi = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ marginRight: 12 }}>
      <Animated.View style={{ width: 220, transform: [{ scale }] }}>
        <View style={lc.card}>
          {!err && imgUri ? (
            <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" transition={250}
              onError={() => setErr(true)} />
          ) : (
            <LinearGradient colors={["#1a0814", "#08060e"]} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient colors={["transparent", "transparent", "rgba(0,0,0,0.95)"]}
            locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
          <View style={lc.inner}>
            <View style={lc.cinemaTag}>
              <Feather name="film" size={9} color={RED} />
              <Text style={lc.cinemaTagText}>EM CARTAZ</Text>
            </View>
            <Text style={lc.title} numberOfLines={2}>{item.title}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {item.year > 0 && <Text style={lc.year}>{item.year}</Text>}
              {item.rating > 0 && (
                <View style={lc.ratingRow}>
                  <Feather name="star" size={9} color={AMBER} />
                  <Text style={lc.ratingText}>{item.rating.toFixed(1)}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const lc = StyleSheet.create({
  card: { width: 220, height: 130, borderRadius: 14, overflow: "hidden", backgroundColor: "#111" },
  inner: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 10 },
  cinemaTag: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  cinemaTagText: { fontSize: 8, fontWeight: "900", color: RED, letterSpacing: 1 },
  title: { fontSize: 13, fontWeight: "800", color: "#fff", lineHeight: 17, marginBottom: 3 },
  year: { fontSize: 10, color: "rgba(255,255,255,0.45)" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingText: { fontSize: 10, fontWeight: "700", color: AMBER },
});

// ─── UpcomingCard ─────────────────────────────────────────────────────────────
function UpcomingCard({ item, releaseDate, onPress }: { item: ContentItem; releaseDate: string; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const days = daysUntil(releaseDate);
  const pi = () => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 32 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }).start();
  const countdownColor = days <= 7 ? RED : days <= 30 ? AMBER : BLUE;
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={{ width: 120, marginRight: 10, transform: [{ scale }] }}>
        <View style={uc.card}>
          {!err && item.posterPath ? (
            <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" transition={250}
              onError={() => setErr(true)} />
          ) : (
            <LinearGradient colors={["#0e0a1a", "#060410"]} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} locations={[0.4, 1]}
            style={StyleSheet.absoluteFill} />
          <View style={[uc.countdown, { backgroundColor: `${countdownColor}ee` }]}>
            {days > 0 ? (
              <>
                <Text style={uc.countdownNum}>{days}</Text>
                <Text style={uc.countdownLabel}>{days === 1 ? "dia" : "dias"}</Text>
              </>
            ) : (
              <Text style={uc.countdownToday}>HOJE</Text>
            )}
          </View>
          <View style={uc.dateBadge}>
            <Text style={uc.dateText}>{formatDate(releaseDate)}</Text>
          </View>
        </View>
        <Text style={uc.title} numberOfLines={2}>{item.title}</Text>
        <Text style={uc.sub}>{days > 0 ? `Em ${days} dias` : "Estreia hoje!"}</Text>
      </Animated.View>
    </Pressable>
  );
}

const uc = StyleSheet.create({
  card: { width: 120, height: 172, borderRadius: 12, overflow: "hidden", backgroundColor: "#111", marginBottom: 6 },
  countdown: { position: "absolute", top: 7, right: 7, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, alignItems: "center" },
  countdownNum: { fontSize: 13, fontWeight: "900", color: "#fff", lineHeight: 14 },
  countdownLabel: { fontSize: 7, fontWeight: "700", color: "rgba(255,255,255,0.8)", lineHeight: 10 },
  countdownToday: { fontSize: 8, fontWeight: "900", color: "#fff" },
  dateBadge: { position: "absolute", bottom: 7, left: 7, backgroundColor: "rgba(0,0,0,0.72)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  dateText: { fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.7)" },
  title: { fontSize: 12, fontWeight: "700", color: "#fff", lineHeight: 16 },
  sub: { fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 },
});

// ─── HeroRotatingBanner ───────────────────────────────────────────────────────
function HeroRotatingBanner({
  items, onPress, topPad,
}: {
  items: ContentItem[];
  onPress: (item: ContentItem) => void;
  topPad: number;
}) {
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const flatRef = useRef<FlatList>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Map index → the URL that failed (not just a boolean) so if the URL later changes
  // (TMDB enrichment), the error doesn't carry over to the new URL.
  const [imgErrUrls, setImgErrUrls] = useState<Record<number, string>>({});

  const advanceTo = useCallback((next: number) => {
    Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => {
      setIndex(next);
      Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
      flatRef.current?.scrollToIndex({ index: next, animated: false });
    });
  }, [fade]);

  useEffect(() => {
    if (items.length < 2) return;
    timerRef.current = setInterval(() => {
      setIndex((cur) => {
        const next = (cur + 1) % items.length;
        Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => {
          setIndex(next);
          Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
          flatRef.current?.scrollToIndex({ index: next, animated: false });
        });
        return cur;
      });
    }, BANNER_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [items.length]);

  if (!items.length) return <SkeletonHero />;
  const item = items[Math.min(index, items.length - 1)];
  const imgUri = item.backdropPath || item.posterPath;
  // Error only counts if the *same* URL failed — a new URL from TMDB enrichment gets a fresh attempt
  const hasErr = !!imgUri && imgErrUrls[index] === imgUri;

  return (
    <View style={{ width: W, height: HERO_H + topPad }}>
      {/* background image */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        {!hasErr && imgUri ? (
          <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" transition={300}
            onError={() => setImgErrUrls((e) => ({ ...e, [index]: imgUri ?? "" }))} />
        ) : (
          <LinearGradient colors={["#1a0814", "#0e060c", "#050508"]} style={StyleSheet.absoluteFill} />
        )}
      </Animated.View>

      {/* Gradient overlays */}
      <LinearGradient
        colors={["rgba(5,5,8,0.82)", "transparent", "transparent"]}
        locations={[0, 0.25, 1]}
        style={[StyleSheet.absoluteFill, { height: topPad + 70 }]}
      />
      <LinearGradient
        colors={["transparent", "rgba(5,5,8,0.1)", "rgba(5,5,8,0.98)"]}
        locations={[0.38, 0.68, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Content */}
      <Animated.View style={[hb.content, { paddingTop: topPad + 60, opacity: fade }]}>
        <View style={hb.tagRow}>
          <View style={hb.trendTag}>
            <Feather name="trending-up" size={9} color={RED} />
            <Text style={hb.trendText}>EM ALTA</Text>
          </View>
          <View style={hb.typePill}>
            <Text style={hb.typeText}>{item.type === "movie" ? "FILME" : "SÉRIE"}</Text>
          </View>
        </View>
        <Text style={hb.title} numberOfLines={2}>{item.title}</Text>
        {item.description?.length > 10 && (
          <Text style={hb.desc} numberOfLines={2}>{item.description}</Text>
        )}
        <View style={hb.metaRow}>
          {item.year > 0 && <Text style={hb.meta}>{item.year}</Text>}
          {item.rating > 0 && (
            <View style={hb.ratingWrap}>
              <Feather name="star" size={10} color={AMBER} />
              <Text style={hb.ratingText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        <View style={hb.btnRow}>
          <TouchableOpacity onPress={() => onPress(item)} activeOpacity={0.82} style={hb.playBtn}>
            <Feather name="play" size={14} color="#fff" />
            <Text style={hb.playText}>Assistir</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onPress(item)} activeOpacity={0.82} style={hb.infoBtn}>
            <Feather name="info" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={hb.infoText}>Detalhes</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Dots */}
      {items.length > 1 && (
        <View style={hb.dots}>
          {items.slice(0, Math.min(items.length, 8)).map((_, i) => (
            <TouchableOpacity key={i} onPress={() => advanceTo(i)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <View style={[hb.dot, i === index && hb.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Hidden FlatList just for index sync tracking */}
      <FlatList
        ref={flatRef}
        data={items}
        horizontal
        keyExtractor={(_, i) => String(i)}
        renderItem={() => null}
        scrollEnabled={false}
        style={{ position: "absolute", opacity: 0, height: 0 }}
        getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
      />
    </View>
  );
}

const hb = StyleSheet.create({
  content: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 24 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  trendTag: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: `${RED}22`, borderWidth: 1, borderColor: `${RED}44`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  trendText: { fontSize: 9, fontWeight: "900", color: RED, letterSpacing: 0.8 },
  typePill: { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  typeText: { fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.7)", letterSpacing: 0.8 },
  title: { fontSize: 26, fontWeight: "900", color: "#fff", lineHeight: 30, marginBottom: 6, letterSpacing: -0.3 },
  desc: { fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 17, marginBottom: 10 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  meta: { fontSize: 12, color: "rgba(255,255,255,0.45)" },
  ratingWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontSize: 12, fontWeight: "700", color: AMBER },
  btnRow: { flexDirection: "row", gap: 10 },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: RED, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24 },
  playText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  infoBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24 },
  infoText: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.8)" },
  dots: { position: "absolute", bottom: 100, right: 20, flexDirection: "row", gap: 5, alignItems: "center" },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.25)" },
  dotActive: { width: 18, backgroundColor: RED },
});

// ─── StatsStrip ───────────────────────────────────────────────────────────────
function StatsStrip({ movies, series, animes }: { movies: number; series: number; animes: number }) {
  const items = [
    { label: "filmes", count: movies, icon: "film" as const, color: RED },
    { label: "séries", count: series, icon: "tv" as const, color: BLUE },
    { label: "animes", count: animes, icon: "star" as const, color: PURPLE },
  ];
  return (
    <View style={ss.row}>
      {items.map((s, i) => (
        <View key={i} style={[ss.pill, { borderColor: `${s.color}30` }]}>
          <View style={[ss.iconWrap, { backgroundColor: `${s.color}18` }]}>
            <Feather name={s.icon} size={11} color={s.color} />
          </View>
          <Text style={[ss.count, { color: s.color }]}>{s.count}</Text>
          <Text style={ss.label}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}
const ss = StyleSheet.create({
  row: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 24, marginTop: -8 },
  pill: { flex: 1, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  iconWrap: { width: 22, height: 22, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  count: { fontSize: 15, fontWeight: "900" },
  label: { fontSize: 10, color: "rgba(255,255,255,0.42)", fontWeight: "600" },
});

// ─── ExclusiveBanner ──────────────────────────────────────────────────────────
function ExclusiveBanner({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pi = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ paddingHorizontal: 16, marginBottom: 28 }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient
          colors={["#1a0520", "#0e0318", "#060110"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={eb.card}
        >
          {/* Background pattern */}
          <View style={eb.glowLeft} />
          <View style={eb.glowRight} />
          <View style={eb.content}>
            <View style={eb.iconCircle}>
              <Feather name="zap" size={20} color={PURPLE} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={eb.badgeRow}>
                <View style={eb.exclusiveBadge}>
                  <Text style={eb.exclusiveText}>SÓ NO NETPLAY</Text>
                </View>
              </View>
              <Text style={eb.title}>Conteúdos Exclusivos</Text>
              <Text style={eb.subtitle}>Títulos que você só encontra aqui — animes, doramas e séries raras</Text>
            </View>
            <Feather name="chevron-right" size={20} color="rgba(167,139,250,0.6)" />
          </View>
          <View style={eb.bottom}>
            {[["🎌", "Animes"], ["🎭", "Doramas"], ["🌟", "Raridades"]].map(([emoji, label]) => (
              <View key={label} style={eb.tag}>
                <Text style={eb.tagEmoji}>{emoji}</Text>
                <Text style={eb.tagLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}
const eb = StyleSheet.create({
  card: { borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "rgba(167,139,250,0.18)" },
  glowLeft: { position: "absolute", top: -30, left: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: `${PURPLE}22` },
  glowRight: { position: "absolute", bottom: -20, right: 40, width: 80, height: 80, borderRadius: 40, backgroundColor: `${PINK}1a` },
  content: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, paddingBottom: 12 },
  iconCircle: { width: 48, height: 48, borderRadius: 16, backgroundColor: `${PURPLE}22`, borderWidth: 1, borderColor: `${PURPLE}40`, alignItems: "center", justifyContent: "center" },
  badgeRow: { flexDirection: "row", marginBottom: 4 },
  exclusiveBadge: { backgroundColor: `${PURPLE}30`, borderWidth: 1, borderColor: `${PURPLE}55`, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  exclusiveText: { fontSize: 8, fontWeight: "900", color: PURPLE, letterSpacing: 0.8 },
  title: { fontSize: 15, fontWeight: "800", color: "#fff", lineHeight: 19 },
  subtitle: { fontSize: 11, color: "rgba(255,255,255,0.42)", lineHeight: 15, marginTop: 2 },
  bottom: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  tag: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  tagEmoji: { fontSize: 12 },
  tagLabel: { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.55)" },
});

// ─── HangTimeout — fires onTimeout after 8s (prevents infinite loading spinner) ─
function HangTimeout({ onTimeout }: { onTimeout: () => void }) {
  const cb = useRef(onTimeout);
  useEffect(() => { cb.current = onTimeout; }, [onTimeout]);
  useEffect(() => {
    const t = setTimeout(() => cb.current(), 8000);
    return () => clearTimeout(t);
  }, []);
  return null;
}

// ─── BreakingBanner (Estreias Hoje) ───────────────────────────────────────────
function BreakingBanner({ items, onPress }: { items: ContentItem[]; onPress: (item: ContentItem) => void }) {
  if (!items.length) return null;
  return (
    <View style={{ marginBottom: 28 }}>
      <SectionHeader title="Estreando Hoje" icon="sunrise" badge={items.length} accentColor={ORANGE} subtitle="Séries com novos episódios hoje" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 4 }}>
        {items.map((item, i) => (
          <PosterCard key={`at_${item.id}_${i}`} item={item} onPress={() => onPress(item)} badge="HOJE" badgeColor={ORANGE} />
        ))}
      </ScrollView>
    </View>
  );
}

// ─── TvOnAirCard ──────────────────────────────────────────────────────────────
function TvOnAirCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const prevPosterRef = useRef<string>("");
  useEffect(() => {
    const u = item.posterPath || "";
    if (u && u !== prevPosterRef.current) { prevPosterRef.current = u; setErr(false); }
  }, [item.posterPath]);
  const pi = () => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 32 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ marginRight: 10 }}>
      <Animated.View style={{ width: 150, transform: [{ scale }] }}>
        <View style={tv.card}>
          {!err && item.posterPath ? (
            <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" transition={250}
              onError={() => setErr(true)} />
          ) : (
            <LinearGradient colors={["#0a1020", "#060810"]} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} locations={[0.45, 1]}
            style={StyleSheet.absoluteFill} />
          <View style={tv.liveTag}>
            <View style={tv.liveDot} />
            <Text style={tv.liveText}>NO AR</Text>
          </View>
          {item.rating > 0 && (
            <View style={tv.rating}>
              <Feather name="star" size={8} color={AMBER} />
              <Text style={tv.ratingText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        <Text style={tv.title} numberOfLines={2}>{item.title}</Text>
        <Text style={tv.meta}>Série · Temporada atual</Text>
      </Animated.View>
    </Pressable>
  );
}
const tv = StyleSheet.create({
  card: { width: 150, height: 218, borderRadius: 12, overflow: "hidden", backgroundColor: "#111", marginBottom: 6 },
  liveTag: { position: "absolute", top: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${TEAL}dd`, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff" },
  liveText: { fontSize: 8, fontWeight: "900", color: "#fff", letterSpacing: 0.8 },
  rating: { position: "absolute", bottom: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  ratingText: { fontSize: 9, fontWeight: "700", color: AMBER },
  title: { fontSize: 12, fontWeight: "700", color: "#fff", lineHeight: 16 },
  meta: { fontSize: 10, color: "rgba(255,255,255,0.38)", marginTop: 1 },
});

// ─── AnimeCard ────────────────────────────────────────────────────────────────
function AnimeCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const prevPosterRef = useRef<string>("");
  useEffect(() => {
    const u = item.posterPath || "";
    if (u && u !== prevPosterRef.current) { prevPosterRef.current = u; setErr(false); }
  }, [item.posterPath]);
  const pi = () => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 32 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={{ width: 100, marginRight: 10, transform: [{ scale }] }}>
        <View style={ac.card}>
          {!err && item.posterPath ? (
            <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" transition={250}
              onError={() => setErr(true)} />
          ) : (
            <LinearGradient colors={["#10051a", "#06030e"]} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} locations={[0.5, 1]}
            style={StyleSheet.absoluteFill} />
          <View style={ac.badge}>
            <Text style={ac.badgeText}>🎌</Text>
          </View>
        </View>
        <Text style={ac.title} numberOfLines={2}>{item.title}</Text>
      </Animated.View>
    </Pressable>
  );
}
const ac = StyleSheet.create({
  card: { width: 100, height: 145, borderRadius: 10, overflow: "hidden", backgroundColor: "#111", marginBottom: 5 },
  badge: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 6, padding: 3 },
  badgeText: { fontSize: 10 },
  title: { fontSize: 10, fontWeight: "700", color: "#fff", lineHeight: 14 },
});

// URL resolver — handles both full URLs (Xtream CDN) and TMDB relative paths
function resolveImgUrl(pathOrUrl: string | null | undefined, size: "w185" | "w300" | "w342" | "w500" | "w780" | "w1280" | "original" = "w780"): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  return `https://image.tmdb.org/t/p/${size}${pathOrUrl}`;
}

// ─── EpisodeCard ──────────────────────────────────────────────────────────────
function EpisodeCard({
  group, onPress, onSynopsis,
}: { group: EpGroup; onPress: (g: EpGroup) => void; onSynopsis: (g: EpGroup) => void; }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [stillErr,   setStillErr]   = useState(false);
  const [backdropErr, setBackdropErr] = useState(false);
  const [posterErr,  setPosterErr]  = useState(false);
  const [logoErr,    setLogoErr]    = useState(false);
  const prevStillRef    = useRef<string>("");
  const prevBackdropRef = useRef<string>("");
  const prevPosterRef   = useRef<string>("");

  // Reset errors when TMDB enrichment provides better URLs after initial Xtream CDN load fails
  useEffect(() => {
    const u = group.latestEpStill || "";
    if (u && u !== prevStillRef.current) { prevStillRef.current = u; setStillErr(false); }
  }, [group.latestEpStill]);
  useEffect(() => {
    const u = group.backdropPath || "";
    if (u && u !== prevBackdropRef.current) { prevBackdropRef.current = u; setBackdropErr(false); }
  }, [group.backdropPath]);
  useEffect(() => {
    const u = group.seriesPoster || "";
    if (u && u !== prevPosterRef.current) { prevPosterRef.current = u; setPosterErr(false); }
  }, [group.seriesPoster]);

  const ep = group.latestEp;
  const isSingle = group.totalEps === 1;
  const epLabel = `S${String(ep.season).padStart(2, "0")} E${String(ep.episode).padStart(2, "0")}`;
  const pi = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26 }).start();

  // Banner priority: episode still → series backdrop → poster → gradient
  const stillUrl    = (!stillErr && group.latestEpStill) ? resolveImgUrl(group.latestEpStill, "w780") : null;
  const backdropUrl = (!stillUrl && !backdropErr && group.backdropPath) ? resolveImgUrl(group.backdropPath, "w780") : null;
  const posterUrl   = (!stillUrl && !backdropUrl && !posterErr && group.seriesPoster) ? group.seriesPoster : null;

  // Logo image instead of text title
  const logoUrl = (!logoErr && group.logoPath) ? resolveImgUrl(group.logoPath, "w300") : null;

  // Episode synopsis
  const synopsis = group.latestEpOverview || group.seriesOverview || "";

  return (
    <Pressable onPressIn={pi} onPressOut={po} onPress={() => onPress(group)} style={{ marginRight: 14 }}>
      <Animated.View style={{ width: 240, transform: [{ scale }] }}>
        <View style={epc.card}>
          {/* Banner image */}
          {stillUrl ? (
            <Image source={{ uri: stillUrl }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setStillErr(true)} />
          ) : backdropUrl ? (
            <Image source={{ uri: backdropUrl }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setBackdropErr(true)} />
          ) : posterUrl ? (
            <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setPosterErr(true)} />
          ) : (
            <LinearGradient colors={["#0a1020", "#050810"]} style={StyleSheet.absoluteFill} />
          )}

          {/* Gradient overlay — stronger at bottom for text legibility */}
          <LinearGradient colors={["rgba(0,0,0,0.3)", "transparent", "rgba(0,0,0,0.88)"]}
            locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />

          {/* Top badges */}
          <View style={epc.topRow}>
            <View style={epc.epBadge}><Text style={epc.epBadgeText}>{epLabel}</Text></View>
            <View style={epc.newBadge}><Text style={epc.newBadgeText}>EP NOVO</Text></View>
          </View>

          {/* Small play button — only for single-episode items */}
          {isSingle && (
            <View style={epc.playCircle}>
              <Feather name="play" size={13} color="#fff" />
            </View>
          )}

          {/* Bottom row: logo or title + episode info */}
          <View style={epc.bottomRow}>
            <View style={{ flex: 1 }}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={epc.logoImg}
                  contentFit="contain" cachePolicy="memory-disk" onError={() => setLogoErr(true)} />
              ) : (
                <Text style={epc.seriesTitle} numberOfLines={1}>{group.seriesTitle}</Text>
              )}
              {ep.title && !/S\d+\s*E\d+/i.test(ep.title)
                ? <Text style={epc.epName} numberOfLines={1}>{ep.title}</Text>
                : !isSingle && <Text style={epc.epCount}>{group.totalEps} novos ep</Text>
              }
            </View>
            {!isSingle && (
              <View style={epc.verEps}>
                <Text style={epc.verEpsText}>eps</Text>
                <Feather name="chevron-right" size={12} color={TEAL} />
              </View>
            )}
          </View>
        </View>

        {/* Synopsis below thumbnail */}
        {!!synopsis && (
          <Text style={epc.synopsis} numberOfLines={2}>{synopsis}</Text>
        )}

        {isSingle && (
          <View style={epc.actRow}>
            <TouchableOpacity onPress={() => onPress(group)} activeOpacity={0.8}
              style={[epc.actBtn, { backgroundColor: RED }]}>
              <Feather name="play" size={12} color="#fff" />
              <Text style={epc.actBtnTxt}>Assistir</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onSynopsis(group)} activeOpacity={0.8} style={epc.actBtnOut}>
              <Feather name="info" size={12} color="rgba(255,255,255,0.65)" />
              <Text style={epc.actBtnOutTxt}>Sinopse</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}
const epc = StyleSheet.create({
  card:        { width: 240, height: 136, borderRadius: 12, overflow: "hidden", backgroundColor: "#0a0a12", marginBottom: 6 },
  topRow:      { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", padding: 7 },
  epBadge:     { backgroundColor: `${TEAL}dd`, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  epBadgeText: { fontSize: 8, fontWeight: "900", color: "#fff", letterSpacing: 0.5 },
  newBadge:    { backgroundColor: "rgba(34,197,94,0.85)", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  newBadgeText:{ fontSize: 8, fontWeight: "800", color: "#fff" },
  playCircle:  { position: "absolute", top: "50%", left: "50%", width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(229,9,20,0.82)", alignItems: "center", justifyContent: "center", marginTop: -15, marginLeft: -15, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.35)" },
  bottomRow:   { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "flex-end", padding: 8 },
  logoImg:     { width: 90, height: 28, marginBottom: 2 },
  seriesTitle: { fontSize: 11, fontWeight: "800", color: "#fff", lineHeight: 14 },
  epName:      { fontSize: 9, color: "rgba(255,255,255,0.60)", fontWeight: "600", marginTop: 1 },
  epCount:     { fontSize: 9, color: `${TEAL}cc`, fontWeight: "600", marginTop: 1 },
  synopsis:    { fontSize: 10, color: "rgba(255,255,255,0.48)", lineHeight: 14, marginBottom: 6, marginTop: 0 },
  verEps:      { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 2 },
  verEpsText:  { fontSize: 9, color: TEAL, fontWeight: "700" },
  actRow:      { flexDirection: "row", gap: 8 },
  actBtn:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 8 },
  actBtnTxt:   { fontSize: 12, fontWeight: "800", color: "#fff" },
  actBtnOut:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  actBtnOutTxt:{ fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.65)" },
});

// ─── EpPreviewRow ─────────────────────────────────────────────────────────────
interface EpModalItem { group: EpGroup; ep: RawEp; key: string; }

function EpPreviewRow({
  item, isPlaying, muted, onPlay, onViewSeries,
}: { item: EpModalItem; isPlaying: boolean; muted: boolean; onPlay: () => void; onViewSeries: () => void; }) {
  const [vidLoading, setVidLoading] = useState(false);
  const [vidReady, setVidReady] = useState(false);
  const [vidErrored, setVidErrored] = useState(false);
  const [stillErr, setStillErr] = useState(false);
  const [backdropErr, setBackdropErr] = useState(false);
  const [posterErr, setPosterErr] = useState(false);
  const [webVidPlaying, setWebVidPlaying] = useState(false);
  const ep = item.ep;
  const g = item.group;
  const prevStillRef2    = useRef<string>("");
  const prevBackdropRef2 = useRef<string>("");
  const prevPosterRef2   = useRef<string>("");
  useEffect(() => {
    const u = g.latestEpStill || "";
    if (u && u !== prevStillRef2.current) { prevStillRef2.current = u; setStillErr(false); }
  }, [g.latestEpStill]);
  useEffect(() => {
    const u = g.backdropPath || "";
    if (u && u !== prevBackdropRef2.current) { prevBackdropRef2.current = u; setBackdropErr(false); }
  }, [g.backdropPath]);
  useEffect(() => {
    const u = g.seriesPoster || "";
    if (u && u !== prevPosterRef2.current) { prevPosterRef2.current = u; setPosterErr(false); }
  }, [g.seriesPoster]);
  const epLabel = `S${String(ep.season).padStart(2, "0")} E${String(ep.episode).padStart(2, "0")}`;
  const webviewEpRef = useRef<any>(null);
  const webVideoEpRef = useRef<any>(null);
  const [epDuration, setEpDuration] = useState(0);
  const [autoSeeked, setAutoSeeked] = useState(false);
  const [activeScene, setActiveScene] = useState<number | null>(null);
  const canPreview = IS_NATIVE_EP ? WebViewEp !== null : false;
  const canPreviewWeb = !IS_NATIVE_EP && !!ep.stream_url;

  // Episode still is the primary banner (landscape 16:9); falls back to series backdrop then poster
  const stillUrl = (!stillErr && g.latestEpStill) ? resolveImgUrl(g.latestEpStill, "w780") : null;
  const backdropUrl = (!stillUrl && !backdropErr && g.backdropPath) ? resolveImgUrl(g.backdropPath, "w780") : null;
  const hasPoster = !posterErr && !!g.seriesPoster && !stillUrl && !backdropUrl;
  // Synopsis: prefer episode-specific overview, fall back to series overview
  const synopsis = g.latestEpOverview || g.seriesOverview || "";

  // TMDB logo image URL (PNG with transparency)
  const logoUrl = g.logoPath ? resolveImgUrl(g.logoPath, "w300") : null;

  // Reset video state when play starts/stops
  useEffect(() => {
    setVidLoading(isPlaying && !canPreviewWeb);
    if (!isPlaying) {
      setVidReady(false);
      setVidErrored(false);
      setEpDuration(0);
      setAutoSeeked(false);
      setActiveScene(null);
      setWebVidPlaying(false);
      if (webVideoEpRef.current) webVideoEpRef.current.pause?.();
    }
  }, [isPlaying, canPreviewWeb]);

  // Sync mute toggle via injectedJavaScript (no need to remount WebView)
  useEffect(() => {
    if (!isPlaying || !vidReady) return;
    webviewEpRef.current?.injectJavaScript(`document.getElementById('v').muted=${muted};void 0`);
  }, [muted, isPlaying, vidReady]);

  const seekToScene = useCallback((pct: number, idx: number) => {
    if (!epDuration) return;
    const sec = Math.floor((epDuration / 1000) * pct);
    setActiveScene(idx);
    webviewEpRef.current?.injectJavaScript(`document.getElementById('v').currentTime=${sec};document.getElementById('v').play();void 0`);
  }, [epDuration]);

  return (
    <View style={epr.card}>
      {/* ── Thumbnail 16:9 ─────────────────────────────────────────── */}
      <View style={epr.thumb}>

        {/* Layer 1 — base image: episode still (preferred) > series backdrop > poster > gradient */}
        {stillUrl ? (
          <Image
            source={{ uri: stillUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setStillErr(true)}
          />
        ) : backdropUrl ? (
          <Image
            source={{ uri: backdropUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setBackdropErr(true)}
          />
        ) : hasPoster ? (
          <Image
            source={{ uri: g.seriesPoster }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            cachePolicy="memory-disk"
            onError={() => setPosterErr(true)}
          />
        ) : (
          <LinearGradient colors={["#1a0c24", "#0c0818", "#080510"]} style={StyleSheet.absoluteFill} />
        )}

        {/* WebView video preview — native APK only */}
        {isPlaying && canPreview && !vidErrored && (
          <WebViewEp
            ref={webviewEpRef}
            style={[StyleSheet.absoluteFill, { opacity: vidReady ? 1 : 0 }]}
            originWhitelist={["*"]}
            source={{ html: buildEpPreviewHtml(ep.stream_url, muted) }}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            scrollEnabled={false}
            allowsFullscreenVideo={false}
            onMessage={(e: any) => {
              try {
                const msg = JSON.parse(e.nativeEvent.data);
                if (msg.type === "ready") {
                  setVidLoading(false);
                  setVidReady(true);
                  if (msg.duration > 30000 && !autoSeeked) {
                    setAutoSeeked(true);
                    setEpDuration(msg.duration);
                    // Auto-seek: pula intro (~15%), vai direto para a ação
                    const seekSec = Math.floor((msg.duration / 1000) * 0.15);
                    setTimeout(() => {
                      webviewEpRef.current?.injectJavaScript(
                        `document.getElementById('v').currentTime=${seekSec};document.getElementById('v').play();void 0`
                      );
                    }, 600);
                  } else if (msg.duration > 0 && !epDuration) {
                    setEpDuration(msg.duration);
                  }
                } else if (msg.type === "error") {
                  setVidLoading(false);
                  setVidReady(false);
                  setVidErrored(true);
                }
              } catch {}
            }}
            onError={() => { setVidLoading(false); setVidErrored(true); }}
            onHttpError={() => { setVidLoading(false); setVidErrored(true); }}
          />
        )}

        {/* HTML5 video preview — web browser only (Chrome/Safari), proxied to avoid CORS */}
        {isPlaying && canPreviewWeb && !vidErrored && React.createElement("video", {
          ref: webVideoEpRef,
          key: ep.stream_url,
          src: getProxiedStreamUrl(ep.stream_url),
          autoPlay: true,
          muted: muted,
          playsInline: true,
          loop: true,
          style: {
            position: "absolute", top: 0, left: 0,
            width: "100%", height: "100%",
            objectFit: "cover",
          },
          onPlay: () => { setWebVidPlaying(true); setVidReady(true); setVidLoading(false); },
          onPause: () => setWebVidPlaying(false),
          onError: () => { setVidErrored(true); setVidLoading(false); setWebVidPlaying(false); },
        })}

        {/* Timeout: 10s sem resposta → desiste graciosamente */}
        {isPlaying && vidLoading && !vidReady && !vidErrored && (
          <HangTimeout onTimeout={() => { setVidLoading(false); setVidErrored(true); }} />
        )}

        {/* Gradient — only when video is NOT playing */}
        {!isPlaying && (
          <LinearGradient
            colors={["rgba(0,0,0,0.25)", "transparent", "rgba(0,0,0,0.82)"]}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* Loading spinner — native only (web video doesn't use vidLoading) */}
        {isPlaying && vidLoading && !canPreviewWeb && (
          <View style={epr.loadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={epr.loadingText}>Carregando prévia…</Text>
          </View>
        )}

        {/* PRÉVIA badge — shows when video is playing (native WebView or web <video>) */}
        {isPlaying && (vidReady || webVidPlaying) && (
          <View style={epr.liveBadge}>
            <View style={epr.liveDot} />
            <Text style={epr.liveTxt}>PRÉVIA</Text>
          </View>
        )}

        {/* S/E badge */}
        <View style={epr.epTag}><Text style={epr.epTagTxt}>{epLabel}</Text></View>
      </View>

      {/* ── Melhores Momentos — navegação por cenas ───────────────── */}
      {isPlaying && vidReady && epDuration > 30000 && (
        <View style={epr.scenesRow}>
          <Text style={epr.scenesLabel}>Melhores Momentos</Text>
          <View style={epr.sceneBtns}>
            {([
              { label: "▶ Início",  emoji: "▶",  pct: 0.08 },
              { label: "⚡ Ação",   emoji: "⚡", pct: 0.30 },
              { label: "🔥 Clímax", emoji: "🔥", pct: 0.60 },
              { label: "🎬 Final",  emoji: "🎬", pct: 0.82 },
            ] as { label: string; emoji: string; pct: number }[]).map((s, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => seekToScene(s.pct, i)}
                activeOpacity={0.75}
                style={[epr.sceneBtn, activeScene === i && epr.sceneBtnActive]}
              >
                <Text style={[epr.sceneBtnTxt, activeScene === i && epr.sceneBtnTxtActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── Info below thumbnail ──────────────────────────────────── */}
      <View style={epr.info}>
        {/* Season / Episode badges */}
        <View style={epr.metaRow}>
          <View style={epr.metaBadge}>
            <Feather name="layers" size={9} color={TEAL} />
            <Text style={epr.metaBadgeTxt}>{`Temporada ${ep.season}`}</Text>
          </View>
          <View style={[epr.metaBadge, { backgroundColor: `${RED}18`, borderColor: `${RED}30` }]}>
            <Feather name="play-circle" size={9} color={RED} />
            <Text style={[epr.metaBadgeTxt, { color: RED }]}>{`Episódio ${ep.episode}`}</Text>
          </View>
        </View>

        {/* Episode title */}
        {ep.title && !/S\d+\s*E\d+/i.test(ep.title) && (
          <Text style={epr.epName} numberOfLines={1}>{ep.title}</Text>
        )}

        {/* Synopsis */}
        {!!synopsis && (
          <Text style={epr.synopsis} numberOfLines={3}>{synopsis}</Text>
        )}

        {/* Series logo — below synopsis, left-aligned */}
        {logoUrl && (
          <Image
            source={{ uri: logoUrl }}
            style={epr.logoImg}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        )}

        {/* Action buttons */}
        <View style={epr.btnRow}>
          <TouchableOpacity onPress={onPlay} activeOpacity={0.85} style={epr.playBtn}>
            <Feather name="play" size={14} color="#fff" />
            <Text style={epr.playBtnTxt}>Assistir Episódio</Text>
          </TouchableOpacity>
          {g.totalEps > 1 && (
            <TouchableOpacity onPress={onViewSeries} activeOpacity={0.75} style={epr.seriesBtn}>
              <Text style={epr.seriesBtnTxt}>{g.totalEps}</Text>
              <Feather name="list" size={12} color={TEAL} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
const epr = StyleSheet.create({
  card:             { marginBottom: 16, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 16, overflow: "hidden" },
  thumb:            { width: "100%", aspectRatio: 16 / 9, maxHeight: 195, backgroundColor: "#000", overflow: "hidden" },
  loadingOverlay:   { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.38)" },
  loadingText:      { fontSize: 11, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  liveBadge:        { position: "absolute", top: 8, left: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(229,9,20,0.92)", borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  liveDot:          { width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff" },
  liveTxt:          { fontSize: 8, fontWeight: "900", color: "#fff", letterSpacing: 0.8 },
  epTag:            { position: "absolute", bottom: 6, left: 10, backgroundColor: `${TEAL}ee`, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  epTagTxt:         { fontSize: 9, fontWeight: "900", color: "#fff" },
  scenesRow:        { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  scenesLabel:      { fontSize: 10, fontWeight: "800", color: "rgba(255,255,255,0.35)", letterSpacing: 0.8, marginBottom: 7, textTransform: "uppercase" },
  sceneBtns:        { flexDirection: "row", gap: 7 },
  sceneBtn:         { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  sceneBtnActive:   { backgroundColor: `${TEAL}25`, borderColor: `${TEAL}55` },
  sceneBtnTxt:      { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.5)" },
  sceneBtnTxtActive:{ color: TEAL },
  info:             { padding: 14, gap: 7 },
  metaRow:          { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metaBadge:        { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${TEAL}18`, borderWidth: 1, borderColor: `${TEAL}30`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  metaBadgeTxt:     { fontSize: 10, fontWeight: "700", color: TEAL },
  epName:           { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.6)", lineHeight: 16 },
  synopsis:         { fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 18 },
  logoImg:          { width: 110, height: 36, alignSelf: "flex-start", marginTop: -2 },
  btnRow:           { flexDirection: "row", gap: 10, marginTop: 4 },
  playBtn:          { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: RED, paddingVertical: 12, borderRadius: 10 },
  playBtnTxt:       { fontSize: 13, fontWeight: "800", color: "#fff" },
  seriesBtn:        { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: `${TEAL}15`, borderWidth: 1, borderColor: `${TEAL}35` },
  seriesBtnTxt:     { fontSize: 13, fontWeight: "700", color: TEAL },
});

// ─── SingleEpSheet ────────────────────────────────────────────────────────────
function SingleEpSheet({
  visible, group, onClose, onPlay, onSynopsis,
}: { visible: boolean; group: EpGroup | null; onClose: () => void; onPlay: (g: EpGroup) => void; onSynopsis: (g: EpGroup) => void; }) {
  const slideY = useRef(new Animated.Value(H)).current;
  const bdrop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideY, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(bdrop, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: H, duration: 270, useNativeDriver: true }),
        Animated.timing(bdrop, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);
  if (!group) return null;
  const ep = group.latestEp;
  const epLabel = `S${String(ep.season).padStart(2, "0")} E${String(ep.episode).padStart(2, "0")}`;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.82)", opacity: bdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[ses.sheet, { transform: [{ translateY: slideY }] }]}>
        <LinearGradient colors={["#0c0814", "#060410"]} style={StyleSheet.absoluteFill} />
        <View style={[ses.handle, { backgroundColor: `${TEAL}55` }]} />
        <View style={ses.infoRow}>
          <View style={ses.posterWrap}>
            {group.seriesPoster ? (
              <Image source={{ uri: group.seriesPoster }} style={StyleSheet.absoluteFill}
                contentFit="cover" cachePolicy="memory-disk" />
            ) : (
              <LinearGradient colors={["#12061a", "#06030e"]} style={StyleSheet.absoluteFill} />
            )}
            <LinearGradient colors={["transparent", "rgba(0,0,0,0.6)"]} locations={[0.5, 1]}
              style={StyleSheet.absoluteFill} />
          </View>
          <View style={ses.metaCol}>
            <View style={ses.epBadge}><Text style={ses.epBadgeText}>{epLabel}</Text></View>
            <Text style={ses.title} numberOfLines={2}>{group.seriesTitle}</Text>
            <Text style={ses.epTitle} numberOfLines={2}>{ep.title || epLabel}</Text>
          </View>
        </View>
        <View style={ses.actions}>
          <TouchableOpacity onPress={() => { onClose(); onPlay(group); }} activeOpacity={0.85} style={ses.playBtn}>
            <Feather name="play" size={16} color="#fff" />
            <Text style={ses.playTxt}>Assistir Episódio</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { onClose(); onSynopsis(group); }} activeOpacity={0.8} style={ses.synBtn}>
            <Feather name="info" size={16} color={TEAL} />
            <Text style={ses.synTxt}>Ver Sinopse da Série</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}
const ses = StyleSheet.create({
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden", paddingBottom: 36 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 16 },
  infoRow: { flexDirection: "row", paddingHorizontal: 18, gap: 14, marginBottom: 22 },
  posterWrap: { width: 90, height: 126, borderRadius: 10, overflow: "hidden", backgroundColor: "#111" },
  metaCol: { flex: 1, justifyContent: "center", gap: 7 },
  epBadge: { alignSelf: "flex-start", backgroundColor: `${TEAL}dd`, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  epBadgeText: { fontSize: 10, fontWeight: "900", color: "#fff" },
  title: { fontSize: 16, fontWeight: "900", color: "#fff", lineHeight: 21 },
  epTitle: { fontSize: 12, color: "rgba(255,255,255,0.48)", lineHeight: 16 },
  actions: { paddingHorizontal: 18, gap: 10 },
  playBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: RED, paddingVertical: 14, borderRadius: 14 },
  playTxt: { fontSize: 15, fontWeight: "900", color: "#fff" },
  synBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: `${TEAL}18`, borderWidth: 1, borderColor: `${TEAL}40`, paddingVertical: 14, borderRadius: 14 },
  synTxt: { fontSize: 15, fontWeight: "700", color: TEAL },
});

// ─── EpisodesModal ────────────────────────────────────────────────────────────
function EpisodesModal({
  visible, groups, onClose, onPlayEp, onViewSeries,
}: {
  visible: boolean; groups: EpGroup[];
  onClose: () => void;
  onPlayEp: (g: EpGroup, ep: RawEp) => void;
  onViewSeries: (g: EpGroup) => void;
}) {
  const PAGE_SIZE = 15;

  const slideY = useRef(new Animated.Value(H)).current;
  const bdrop = useRef(new Animated.Value(0)).current;
  const [previewMuted, setPreviewMuted] = useState(true);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (visible) {
      setPlayingKey(null);
      setVisibleCount(PAGE_SIZE);
      Animated.parallel([
        Animated.timing(slideY, { toValue: 0, duration: 330, useNativeDriver: true }),
        Animated.timing(bdrop, { toValue: 1, duration: 270, useNativeDriver: true }),
      ]).start();
    } else {
      setPlayingKey(null);
      Animated.parallel([
        Animated.timing(slideY, { toValue: H, duration: 290, useNativeDriver: true }),
        Animated.timing(bdrop, { toValue: 0, duration: 230, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const allItems = useMemo<EpModalItem[]>(() => groups.map(g => ({
    group: g, ep: g.latestEp, key: `ep_${g.seriesId}_${g.latestEp.season}_${g.latestEp.episode}`,
  })), [groups]);

  const pageItems = useMemo(() => allItems.slice(0, visibleCount), [allItems, visibleCount]);
  const hasMore = visibleCount < allItems.length;

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount(c => Math.min(c + PAGE_SIZE, allItems.length));
      setLoadingMore(false);
    }, 250);
  }, [loadingMore, hasMore, allItems.length]);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 55 });
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setPlayingKey(viewableItems[0].item.key);
    else setPlayingKey(null);
  });

  const ListFooter = useCallback(() => {
    if (!hasMore) return (
      <View style={{ alignItems: "center", paddingVertical: 24 }}>
        <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
          {allItems.length} série{allItems.length !== 1 ? "s" : ""} exibidas
        </Text>
      </View>
    );
    return (
      <View style={{ alignItems: "center", paddingVertical: 20, gap: 8 }}>
        {loadingMore ? (
          <ActivityIndicator size="small" color={TEAL} />
        ) : (
          <TouchableOpacity onPress={loadMore} activeOpacity={0.75}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: `${TEAL}18`, borderWidth: 1, borderColor: `${TEAL}35`, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 }}>
            <Feather name="chevron-down" size={14} color={TEAL} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: TEAL }}>
              Carregar mais ({Math.min(PAGE_SIZE, allItems.length - visibleCount)} de {allItems.length - visibleCount})
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [hasMore, loadingMore, loadMore, allItems.length, visibleCount]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.78)", opacity: bdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[epm.sheet, { transform: [{ translateY: slideY }] }]}>
        <LinearGradient colors={["#080610", "#040308"]} style={StyleSheet.absoluteFill} />
        <View style={[epm.handle, { backgroundColor: `${TEAL}55` }]} />
        <View style={epm.header}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[epm.accent, { backgroundColor: TEAL }]} />
            <Text style={epm.title}>Novos Episódios</Text>
            <View style={epm.cnt}>
              <Text style={epm.cntText}>{visibleCount < allItems.length ? `${visibleCount}/` : ""}{allItems.length} séries</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity onPress={() => setPreviewMuted(m => !m)} activeOpacity={0.75}
              style={[epm.iconBtn, { backgroundColor: previewMuted ? "rgba(255,255,255,0.07)" : `${TEAL}28` }]}>
              <Feather name={previewMuted ? "volume-x" : "volume-2"} size={15}
                color={previewMuted ? "rgba(255,255,255,0.4)" : TEAL} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} activeOpacity={0.75} style={epm.iconBtn}>
              <Feather name="x" size={16} color="rgba(255,255,255,0.55)" />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={epm.hint}>
          {previewMuted ? "Prévia no mudo — toque 🔊 para ativar áudio" : "Prévia com áudio ativo"}
        </Text>
        <FlatList
          data={pageItems}
          keyExtractor={item => item.key}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 40, paddingTop: 4 }}
          viewabilityConfig={viewabilityConfig.current}
          onViewableItemsChanged={onViewableItemsChanged.current}
          initialNumToRender={4}
          maxToRenderPerBatch={3}
          windowSize={6}
          removeClippedSubviews
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={ListFooter}
          renderItem={({ item }) => (
            <EpPreviewRow
              item={item}
              isPlaying={playingKey === item.key}
              muted={previewMuted}
              onPlay={() => { onClose(); onPlayEp(item.group, item.ep); }}
              onViewSeries={() => { onClose(); onViewSeries(item.group); }}
            />
          )}
        />
      </Animated.View>
    </Modal>
  );
}
const epm = StyleSheet.create({
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, height: H * 0.9, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: "hidden" },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 },
  accent: { width: 3, height: 18, borderRadius: 2 },
  title: { fontSize: 16, fontWeight: "800", color: "#fff" },
  cnt: { backgroundColor: `${TEAL}20`, borderWidth: 1, borderColor: `${TEAL}44`, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  cntText: { fontSize: 11, fontWeight: "800", color: TEAL },
  iconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" },
  hint: { fontSize: 11, color: "rgba(255,255,255,0.28)", paddingHorizontal: 18, marginBottom: 10 },
});

// ─── VerMaisModal ─────────────────────────────────────────────────────────────
function VerMaisModal({ visible, title, items, accentColor = RED, onClose, onItemPress }: {
  visible: boolean; title: string; items: ContentItem[];
  accentColor?: string; onClose: () => void; onItemPress: (item: ContentItem) => void;
}) {
  const slideY = useRef(new Animated.Value(H)).current;
  const bdrop = useRef(new Animated.Value(0)).current;
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (visible) {
      setQuery("");
      Animated.parallel([
        Animated.timing(slideY, { toValue: 0, duration: 330, useNativeDriver: true }),
        Animated.timing(bdrop, { toValue: 1, duration: 270, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: H, duration: 290, useNativeDriver: true }),
        Animated.timing(bdrop, { toValue: 0, duration: 230, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((i) => i.title.toLowerCase().includes(q));
  }, [query, items]);

  const CARD_W = (W - 48) / 3;
  const CARD_H = CARD_W * 1.5;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.72)", opacity: bdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[vm.sheet, { transform: [{ translateY: slideY }] }]}>
        <LinearGradient colors={["#0a0810", "#060408"]} style={StyleSheet.absoluteFill} />
        <View style={[vm.handle, { backgroundColor: `${accentColor}55` }]} />
        <View style={vm.header}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[vm.accent, { backgroundColor: accentColor }]} />
            <Text style={vm.title}>{title}</Text>
            <View style={[vm.cnt, { backgroundColor: `${accentColor}20`, borderColor: `${accentColor}44` }]}>
              <Text style={[vm.cntText, { color: accentColor }]}>
                {query.trim() ? `${filtered.length}/${items.length}` : items.length}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={vm.close}>
            <Feather name="x" size={18} color="rgba(255,255,255,0.65)" />
          </TouchableOpacity>
        </View>
        <View style={vm.searchBar}>
          <Feather name="search" size={14} color={query ? accentColor : "rgba(255,255,255,0.3)"} style={{ marginRight: 8 }} />
          <TextInput
            value={query} onChangeText={setQuery}
            placeholder="Buscar…" placeholderTextColor="rgba(255,255,255,0.25)"
            style={[vm.searchInput, query && { color: "#fff" }]}
            returnKeyType="search" autoCorrect={false}
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x-circle" size={14} color={accentColor} />
            </TouchableOpacity>
          )}
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(item, idx) => `vm_${item.id}_${idx}`}
          numColumns={3}
          columnWrapperStyle={{ gap: 8, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={15}
          maxToRenderPerBatch={9}
          renderItem={({ item }) => (
            <Pressable onPress={() => { onItemPress(item); onClose(); }}
              style={{ width: CARD_W, marginBottom: 8 }}>
              <View style={{ width: CARD_W, height: CARD_H, borderRadius: 10, overflow: "hidden", backgroundColor: "#111" }}>
                {item.posterPath ? (
                  <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
                    contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <LinearGradient colors={["#1a0a14", "#08060e"]} style={StyleSheet.absoluteFill} />
                )}
                <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} locations={[0.5, 1]}
                  style={StyleSheet.absoluteFill} />
                <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 7 }}>
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", lineHeight: 14 }} numberOfLines={2}>
                    {item.title}
                  </Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      </Animated.View>
    </Modal>
  );
}
const vm = StyleSheet.create({
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, height: H * 0.88, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: "hidden" },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 10 },
  accent: { width: 3, height: 18, borderRadius: 2 },
  title: { fontSize: 16, fontWeight: "800", color: "#fff" },
  cnt: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  cntText: { fontSize: 11, fontWeight: "800" },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" },
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 10, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 13, color: "rgba(255,255,255,0.5)", padding: 0 },
});


// ─── Netflix-style Vertical Card ──────────────────────────────────────────────
function NovidadesVerticalCard({
  item,
  releaseDate,
  type,
  onPress,
  enrich,
}: {
  item: ContentItem;
  releaseDate?: string;
  type: "upcoming" | "trending";
  onPress: () => void;
  enrich?: EnrichData;
}) {
  const [imgErr, setImgErr]             = useState(false);
  const [logoErr, setLogoErr]           = useState(false);
  const [streamUrl, setStreamUrl]       = useState<string | null>(null);
  const [epCount, setEpCount]           = useState<number | null>(null);
  const [stillUrls, setStillUrls]       = useState<string[]>([]);
  const [stillIdx, setStillIdx]         = useState(0);
  const [muted, setMuted]               = useState(true);
  const [vidReady, setVidReady]         = useState(false);
  const [vidErrored, setVidErrored]     = useState(false);
  const [userRequestedPlay, setUserRequestedPlay] = useState(false);
  const [streamResolved, setStreamResolved]       = useState(false);
  const [isVisible, setIsVisible]       = useState(false);
  const [webVidPlaying, setWebVidPlaying] = useState(false);
  const [webVidFailed, setWebVidFailed]   = useState(false);
  const nativeWebViewRef   = useRef<any>(null);
  const webVideoRef        = useRef<any>(null);
  const containerRef       = useRef<View>(null);
  const prevBackdropUrlRef = useRef<string | null>(null);

  // All metadata comes from the batch-pre-fetched enrich prop — instant, no delay
  const logoUrl    = (!logoErr && enrich?.logoUrl)    ? enrich.logoUrl    : null;
  const backdropUrl = enrich?.backdropUrl || item.backdropPath || item.posterPath || null;
  const overview   = enrich?.overview || item.description || null;

  // When TMDB enrichment arrives with a better URL, reset imgErr so the new image gets a chance.
  // Without this, once the Xtream CDN image fails, imgErr stays true forever even after
  // TMDB provides a valid image.tmdb.org URL.
  useEffect(() => {
    if (backdropUrl && backdropUrl !== prevBackdropUrlRef.current) {
      prevBackdropUrlRef.current = backdropUrl;
      setImgErr(false);
    }
  }, [backdropUrl]);

  // Cycle through episode stills every 4s
  const epStillUrl = stillUrls[stillIdx] ?? null;
  useEffect(() => {
    if (stillUrls.length < 2) return;
    const t = setInterval(() => setStillIdx(i => (i + 1) % stillUrls.length), 4000);
    return () => clearInterval(t);
  }, [stillUrls]);

  // For video preview: episode still (series) takes priority over backdrop
  const backdropShown   = !imgErr ? (epStillUrl || backdropUrl) : null;
  const canPlayVideo    = IS_NATIVE_EP && !!streamUrl && WebViewEp !== null;
  const canPlayVideoWeb = !IS_NATIVE_EP && !!streamUrl && !webVidFailed;

  // Quality / audio badges — extracted from the raw catalog title
  const qualBadge = useMemo(() => _extractQuality(item.title), [item.title]);

  // Toggle muted without reloading the video
  const handleMuteToggle = useCallback(() => {
    setMuted(m => {
      const next = !m;
      if (IS_NATIVE_EP) {
        nativeWebViewRef.current?.injectJavaScript(
          `(function(){var v=document.getElementById('v');if(v)v.muted=${next};})();true;`
        );
      } else if (webVideoRef.current) {
        webVideoRef.current.muted = next;
        if (!next) webVideoRef.current.play?.().catch(() => {});
      }
      return next;
    });
  }, []);

  // Web-only: IntersectionObserver to detect when card enters/leaves viewport
  useEffect(() => {
    if (Platform.OS !== "web" || typeof IntersectionObserver === "undefined") return;
    const el = containerRef.current as unknown as Element;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.intersectionRatio >= 0.5),
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Web: auto-play when visible or user tapped play; pause when scrolled away
  useEffect(() => {
    if (IS_NATIVE_EP || !webVideoRef.current) return;
    const shouldPlay = (isVisible || userRequestedPlay) && !!streamUrl;
    if (shouldPlay) {
      webVideoRef.current.play?.().catch(() => {});
    } else {
      webVideoRef.current.pause?.();
    }
  }, [isVisible, userRequestedPlay, streamUrl]);

  // Lazy-fetch stream URL using the same system as Shorts (lookup + tryClientDirect fallback)
  useEffect(() => {
    const tmdbId = item.tmdbId;
    if (!tmdbId || tmdbId <= 0) {
      setStreamResolved(true); // no tmdbId → unavailable immediately
      return;
    }
    const cacheKey = `${tmdbId}_${item.mediaType ?? item.type}`;

    // If already resolved (scrolled past before), set immediately
    const cached = FLIX_STREAM_CACHE.get(cacheKey);
    if (cached) { setStreamUrl(cached); setStreamResolved(true); return; }

    const ctrl = new AbortController();
    const tid = setTimeout(async () => {
      try {
        const url = await resolveFlixStream(item, ctrl.signal);
        if (ctrl.signal.aborted) return;
        if (url) {
          FLIX_STREAM_CACHE.set(cacheKey, url);
          setStreamUrl(url);
        }
      } catch { /* network error — leave streamUrl null */ }
      if (!ctrl.signal.aborted) {
        setStreamResolved(true);
        setUserRequestedPlay(false);
      }
    }, 300);

    return () => { ctrl.abort(); clearTimeout(tid); };
  }, [item.tmdbId, item.title, item.mediaType, item.type]);

  const days = useMemo(() => {
    if (!releaseDate) return null;
    return Math.ceil((new Date(releaseDate).getTime() - Date.now()) / 86400000);
  }, [releaseDate]);

  const daysAgo = useMemo(() => getDaysAgo(item.addedAt), [item.addedAt]);

  const dateLabel = useMemo(() => {
    if (!releaseDate) return null;
    try {
      return new Date(releaseDate).toLocaleDateString("pt-BR", {
        day: "numeric", month: "long",
      }).toUpperCase();
    } catch { return releaseDate; }
  }, [releaseDate]);

  return (
    <View ref={containerRef} style={nvc.wrap}>
      {/* ── 16:9 Backdrop / Video Preview ── */}
      <View style={nvc.imgWrap}>
        {/* Layer 1: backdrop image — always visible as base */}
        {backdropShown ? (
          <Image
            source={{ uri: backdropShown }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setImgErr(true)}
          />
        ) : (
          <LinearGradient colors={["#1a0814", "#0e060c"]} style={StyleSheet.absoluteFill} />
        )}

        {/* Layer 2a: WebView video (native) — auto-plays on top of image, fades in when ready */}
        {canPlayVideo && !vidErrored && (
          <WebViewEp
            ref={nativeWebViewRef}
            style={[StyleSheet.absoluteFill, { opacity: vidReady ? 1 : 0 }]}
            source={{ html: buildEpPreviewHtml(streamUrl!) }}
            scrollEnabled={false}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            originWhitelist={["*"]}
            mixedContentMode="always"
            onMessage={(e: any) => {
              try {
                const msg = JSON.parse(e.nativeEvent.data);
                if (msg.type === "ready") setVidReady(true);
                else if (msg.type === "error") { setVidReady(false); setVidErrored(true); }
              } catch {}
            }}
            onError={() => { setVidReady(false); setVidErrored(true); }}
          />
        )}

        {/* Layer 2b: HTML5 video (web only) — roteado via /flix2/preview-proxy.
            O servidor resolve redirects HTTPS→HTTP e serve o vídeo sobre HTTPS,
            contornando o bloqueio de mixed-content do Chrome. */}
        {canPlayVideoWeb && React.createElement("video", {
          ref: webVideoRef,
          src: `${getApiBase()}/r2/flix2/preview-proxy?url=${encodeURIComponent(streamUrl!)}`,
          autoPlay: true,
          muted: muted,
          playsInline: true,
          loop: true,
          style: {
            position: "absolute", top: 0, left: 0,
            width: "100%", height: "100%",
            objectFit: "cover",
          },
          onPlay: () => setWebVidPlaying(true),
          onPause: () => setWebVidPlaying(false),
          onError: () => {
            // Video failed to play (e.g. mixed-content HTTPS→HTTP, or CDN block).
            // Keep streamUrl intact so the play button stays visible — content
            // exists in the catalog and is watchable via the detail/player screen.
            setWebVidFailed(true);
            setWebVidPlaying(false);
            setUserRequestedPlay(false);
          },
        })}

        {/* Gradient overlay — non-interactive, always on top */}
        <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.9)"]}
            locations={[0.35, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* Play button overlay — tap to start preview (web) or native loading */}
        {!canPlayVideo && !webVidPlaying && (
          <TouchableOpacity
            style={nvc.playBtnOverlay}
            onPress={() => { if (streamUrl || !streamResolved) setUserRequestedPlay(true); }}
            activeOpacity={streamResolved && !streamUrl ? 1 : 0.75}
          >
            <View style={[nvc.playBtnCircle, streamResolved && !streamUrl ? { opacity: 0.45 } : undefined]}>
              {!streamResolved ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : streamResolved && !streamUrl ? (
                <Feather name="film" size={18} color="rgba(255,255,255,0.5)" />
              ) : userRequestedPlay ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="play" size={24} color="#fff" style={{ marginLeft: 3 }} />
              )}
            </View>
          </TouchableOpacity>
        )}

        {/* Loading spinner — native buffering */}
        {canPlayVideo && !vidReady && !vidErrored && (
          <View style={nvc.previewLoading}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        )}

        {/* PRÉVIA badge — native or web */}
        {((canPlayVideo && vidReady) || webVidPlaying) && (
          <View style={nvc.previewBadge}>
            <View style={nvc.previewDot} />
            <Text style={nvc.previewBadgeTxt}>PRÉVIA</Text>
          </View>
        )}

        {/* Mute/Unmute button — shown while video is active */}
        {(canPlayVideo || webVidPlaying) && (
          <TouchableOpacity
            style={nvc.muteBtn}
            onPress={handleMuteToggle}
            activeOpacity={0.8}
          >
            <Feather
              name={muted ? "volume-x" : "volume-2"}
              size={15}
              color="rgba(255,255,255,0.8)"
            />
          </TouchableOpacity>
        )}

        {/* Countdown badge for upcoming content */}
        {days != null && days > 0 && days <= 30 && (
          <View style={nvc.daysWrap}>
            <Text style={nvc.daysTxt}>{days === 1 ? "AMANHÃ" : `EM ${days} DIAS`}</Text>
          </View>
        )}

        {/* "Adicionado há X dias" badge — only for trending cards with addedAt */}
        {type === "trending" && daysAgo != null && (
          <View style={[
            nvc.addedBadge,
            daysAgo <= 3 ? nvc.addedBadgeHot : daysAgo <= 7 ? nvc.addedBadgeNew : nvc.addedBadgeOld,
          ]}>
            <View style={nvc.addedBadgeInner}>
              <Text style={nvc.addedBadgeTop}>NOVO</Text>
              <Text style={nvc.addedBadgeBottom}>
                {daysAgo === 0 ? "HOJE" : daysAgo === 1 ? "HÁ 1 DIA" : `HÁ ${daysAgo} DIAS`}
              </Text>
            </View>
          </View>
        )}

        {/* Logo overlay — bottom-left of backdrop */}
        {logoUrl && (
          <Image
            source={{ uri: logoUrl }}
            style={nvc.logoOverlay}
            contentFit="contain"
            cachePolicy="memory-disk"
            onError={() => setLogoErr(true)}
          />
        )}
      </View>

      {/* ── Info Section ── */}
      <View style={nvc.info}>
        {!!dateLabel && <Text style={nvc.dateLabel}>{dateLabel}</Text>}
        {/* Text title only as fallback when logo is unavailable */}
        {!logoUrl && (
          <Text style={nvc.title} numberOfLines={2}>{item.title}</Text>
        )}
        {/* Quality / audio badges — HD, FHD, 4K, CAM, DUB, LEG, DUAL */}
        {(qualBadge.q || qualBadge.audio) && (
          <View style={nvc.qualRow}>
            {qualBadge.q && (
              <View style={[nvc.qualPill, qualBadge.q === "CAM" ? nvc.qualPillCam : qualBadge.q === "4K" ? nvc.qualPill4k : nvc.qualPillHd]}>
                <Text style={nvc.qualPillTxt}>{qualBadge.q}</Text>
              </View>
            )}
            {qualBadge.audio && (
              <View style={nvc.qualPill}>
                <Text style={nvc.qualPillTxt}>{qualBadge.audio}</Text>
              </View>
            )}
          </View>
        )}

        {/* Episode count badge — always visible for series once loaded */}
        {epCount != null && item.type !== "movie" && (
          <View style={nvc.epCountRow}>
            <View style={nvc.epCountBadge}>
              <Feather name="play-circle" size={10} color={GREEN} />
              <Text style={nvc.epCountTxt}>
                {epCount === 1 ? "1 novo ep" : `${epCount} novos ep`}
              </Text>
            </View>
          </View>
        )}
        {item.rating > 0 && (
          <View style={nvc.metaRow}>
            {item.year > 0 && <Text style={nvc.metaYear}>{item.year}</Text>}
            <View style={nvc.metaStar}>
              <Feather name="star" size={10} color={AMBER} />
              <Text style={nvc.metaRating}>{item.rating.toFixed(1)}</Text>
            </View>
            {!!(item.genres?.[0]) && <Text style={nvc.metaGenre}>{item.genres[0]}</Text>}
          </View>
        )}
        {!!overview && (
          <Text style={nvc.desc} numberOfLines={3}>{overview}</Text>
        )}
        <TouchableOpacity
          style={type === "upcoming" ? nvc.btnOutline : nvc.btnFill}
          onPress={onPress}
          activeOpacity={0.82}
        >
          <Feather name={type === "upcoming" ? "bell" : "play"} size={15} color="#fff" />
          <Text style={nvc.btnTxt}>{type === "upcoming" ? "Receber aviso" : "Assistir"}</Text>
        </TouchableOpacity>
      </View>

      <View style={nvc.divider} />
    </View>
  );
}

const nvc = StyleSheet.create({
  wrap: { width: "100%", backgroundColor: "#050508" },
  imgWrap: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#111", overflow: "hidden" },
  logoOverlay: {
    position: "absolute", bottom: 14, left: 14,
    width: 160, height: 52,
  },
  muteBtn: {
    position: "absolute", top: 10, right: 10,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center", justifyContent: "center",
  },
  daysWrap: {
    position: "absolute", top: 10, left: 14,
    backgroundColor: `${RED}e0`, borderRadius: 5,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  daysTxt: { fontSize: 11, fontWeight: "900", color: "#fff", letterSpacing: 0.8 },
  addedBadge: {
    position: "absolute", top: 10, left: 14,
    borderRadius: 7, overflow: "hidden",
    borderWidth: 1,
  },
  addedBadgeHot: {
    backgroundColor: `${GREEN}f0`,
    borderColor: `${GREEN}`,
  },
  addedBadgeNew: {
    backgroundColor: `${TEAL}e0`,
    borderColor: `${TEAL}`,
  },
  addedBadgeOld: {
    backgroundColor: "rgba(255,255,255,0.13)",
    borderColor: "rgba(255,255,255,0.22)",
  },
  addedBadgeInner: {
    paddingHorizontal: 9, paddingVertical: 5,
    alignItems: "center",
  },
  addedBadgeTop: {
    fontSize: 9, fontWeight: "900", color: "#fff",
    letterSpacing: 1.2, lineHeight: 11,
  },
  addedBadgeBottom: {
    fontSize: 8, fontWeight: "700", color: "rgba(255,255,255,0.85)",
    letterSpacing: 0.5, lineHeight: 11,
  },
  info: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 20 },
  dateLabel: { fontSize: 11, fontWeight: "700", color: RED, letterSpacing: 1.2, marginBottom: 5 },
  title: { fontSize: 22, fontWeight: "900", color: "#fff", lineHeight: 28, marginBottom: 6 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  metaYear: { fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: "600" },
  metaStar: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaRating: { fontSize: 12, fontWeight: "700", color: AMBER },
  metaGenre: { fontSize: 11, color: "rgba(255,255,255,0.35)", fontStyle: "italic" },
  desc: { fontSize: 14, color: "rgba(255,255,255,0.58)", lineHeight: 20, marginBottom: 16 },
  btnFill: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: RED, paddingVertical: 12, paddingHorizontal: 22,
    borderRadius: 6, alignSelf: "flex-start",
  },
  btnOutline: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.3)",
    paddingVertical: 12, paddingHorizontal: 22,
    borderRadius: 6, alignSelf: "flex-start",
  },
  btnTxt: { fontSize: 15, fontWeight: "800", color: "#fff" },
  divider: { height: 8, backgroundColor: "rgba(255,255,255,0.035)" },
  epCountRow: {
    flexDirection: "row", alignItems: "center", marginBottom: 8,
  },
  epCountBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: `${GREEN}22`, borderRadius: 12,
    borderWidth: 1, borderColor: `${GREEN}55`,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  epCountTxt: {
    fontSize: 11, fontWeight: "800", color: GREEN, letterSpacing: 0.3,
  },
  previewPlayBtn: {
    position: "absolute", bottom: 12, right: 12,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(229,9,20,0.88)",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  previewPlayTxt: { fontSize: 12, fontWeight: "800", color: "#fff", letterSpacing: 0.3 },
  previewLoading: {
    position: "absolute", bottom: 12, right: 12,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  previewBadge: {
    position: "absolute", top: 8, left: 10,
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(229,9,20,0.92)", borderRadius: 5,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  previewDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff" },
  previewBadgeTxt: { fontSize: 8, fontWeight: "900", color: "#fff", letterSpacing: 0.8 },
  playBtnOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },
  playBtnCircle: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: "rgba(0,0,0,0.58)",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.55)",
    alignItems: "center", justifyContent: "center",
  },
  qualRow: { flexDirection: "row", gap: 6, marginBottom: 8 },
  qualPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.22)",
  },
  qualPillHd: {
    backgroundColor: "rgba(59,130,246,0.22)",
    borderColor: "rgba(59,130,246,0.55)",
  },
  qualPill4k: {
    backgroundColor: "rgba(168,85,247,0.22)",
    borderColor: "rgba(168,85,247,0.55)",
  },
  qualPillCam: {
    backgroundColor: "rgba(245,158,11,0.22)",
    borderColor: "rgba(245,158,11,0.55)",
  },
  qualPillTxt: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 0.9 },
});

const pillsNf = StyleSheet.create({
  bar: {
    position: "absolute", left: 0, right: 0, zIndex: 90,
    backgroundColor: "rgba(5,5,8,0.92)",
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)",
  },
  row: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  pillActive: { backgroundColor: "#fff", borderColor: "#fff" },
  emoji: { fontSize: 14 },
  label: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.75)" },
  labelActive: { color: "#000" },
});

// ─── Enrich data type (pre-fetched TMDB metadata) ─────────────────────────────
type EnrichData = {
  logoUrl: string | null;
  backdropUrl: string | null;
  overview: string | null;
};

// Batch-fetches logo + backdrop + overview for a list of items so every card
// has its data ready instantly (no per-card lazy fetch delay).
// Keyed by item.id (string) to avoid collisions when tmdbId = 0.
function useTmdbEnrichMap(items: ContentItem[]): Map<string, EnrichData> {
  const [enrichMap, setEnrichMap] = useState<Map<string, EnrichData>>(new Map());
  const idsKey = useMemo(
    () => items.map(i => `${i.id}:${i.tmdbId ?? 0}`).join(","),
    [items],
  );

  useEffect(() => {
    if (!items.length) return;
    let cancelled = false;
    const BATCH = 4;

    const process = async () => {
      for (let bi = 0; bi < items.length; bi += BATCH) {
        if (cancelled) return;
        const batch = items.slice(bi, bi + BATCH);
        const results = await Promise.all(
          batch.map(async (it): Promise<[string, EnrichData]> => {
            const itemKey = it.id;
            const tmdbId = it.tmdbId ?? 0;
            const mt = it.mediaType ?? (it.type === "movie" ? "movie" : "tv");
            const searchType = mt === "movie" ? "movie" : "tv";
            try {
              if (tmdbId > 0) {
                // Normal path: fetch details + logo by TMDB ID
                const [det, logo] = await Promise.allSettled([
                  mt === "movie" ? api.tmdb.movie(tmdbId) : api.tmdb.tv(tmdbId),
                  api.tmdb.franchiseLogo(mt, tmdbId),
                ]);
                const d = det.status === "fulfilled" ? (det.value as any) : null;
                const l = logo.status === "fulfilled" ? logo.value : null;

                // When TMDB returns empty overview, try title search as fallback
                let overview: string | null = d?.overview || null;
                if (!overview && it.title) {
                  try {
                    const sr = await api.tmdb.search(it.title, searchType);
                    const hit = (sr as any)?.results?.[0];
                    if (hit?.overview) overview = hit.overview;
                  } catch { /* ignore */ }
                }

                return [itemKey, {
                  backdropUrl: d?.backdrop_path ? (TMDB_IMG(d.backdrop_path, "w780") ?? null) : null,
                  overview,
                  logoUrl: (l as any)?.logo_path ? (resolveImgUrl((l as any).logo_path, "w300") ?? null) : null,
                }];
              } else if (it.title) {
                // No TMDB ID: resolve via title search to get overview + logo + backdrop
                const sr = await api.tmdb.search(it.title, searchType);
                const hit = (sr as any)?.results?.[0];
                if (!hit) return [itemKey, { backdropUrl: null, overview: null, logoUrl: null }];

                const foundId = hit.id as number;
                const logo = await api.tmdb.franchiseLogo(mt, foundId).catch(() => null);

                return [itemKey, {
                  backdropUrl: hit.backdrop_path ? (TMDB_IMG(hit.backdrop_path, "w780") ?? null) : null,
                  overview: hit.overview || null,
                  logoUrl: (logo as any)?.logo_path ? (resolveImgUrl((logo as any).logo_path, "w300") ?? null) : null,
                }];
              }
            } catch { /* ignore */ }
            return [itemKey, { backdropUrl: null, overview: null, logoUrl: null }];
          }),
        );
        if (cancelled) return;
        setEnrichMap(prev => {
          const next = new Map(prev);
          for (const [id, d] of results) next.set(id, d);
          return next;
        });
        if (bi + BATCH < items.length) await new Promise(r => setTimeout(r, 150));
      }
    };

    process().catch(() => {});
    return () => { cancelled = true; };
  }, [idsKey]);

  return enrichMap;
}

// ─── CategoryFlatList ─────────────────────────────────────────────────────────
function CategoryFlatList({
  items, keyPrefix, emptyIcon, emptyText, topPad, refreshing, onRefresh, onPress, listHeader,
}: {
  items: ContentItem[];
  keyPrefix: string;
  emptyIcon: keyof typeof Feather.glyphMap;
  emptyText: string;
  topPad: number;
  refreshing: boolean;
  onRefresh: () => void;
  onPress: (item: ContentItem) => void;
  listHeader?: React.ReactNode;
}) {
  const enrichMap = useTmdbEnrichMap(items);

  return (
    <FlatList
      data={items}
      keyExtractor={(item, i) => `${keyPrefix}_${item.id}_${i}`}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: topPad + 96, paddingBottom: 160 }}
      ListHeaderComponent={listHeader ? <>{listHeader}</> : null}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
          tintColor={RED} colors={[RED]} progressViewOffset={topPad + 96} />
      }
      renderItem={({ item }) => (
        <NovidadesVerticalCard
          item={item}
          type="trending"
          onPress={() => onPress(item)}
          enrich={enrichMap.get(item.id)}
        />
      )}
      ListEmptyComponent={
        <View style={{ alignItems: "center", paddingTop: 80, gap: 12 }}>
          <Feather name={emptyIcon} size={40} color="rgba(255,255,255,0.12)" />
          <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, textAlign: "center", paddingHorizontal: 32 }}>
            {emptyText}
          </Text>
          <ActivityIndicator color={RED} size="small" style={{ marginTop: 8 }} />
        </View>
      }
    />
  );
}

// ─── TrendingFlatList (Todo mundo) ────────────────────────────────────────────
function TrendingFlatList({
  items, topPad, refreshing, onRefresh, onPress,
}: {
  items: ContentItem[];
  topPad: number;
  refreshing: boolean;
  onRefresh: () => void;
  onPress: (item: ContentItem) => void;
}) {
  const enrichMap = useTmdbEnrichMap(items);
  return (
    <FlatList
      data={items}
      keyExtractor={(item, i) => `tr_${item.id}_${i}`}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: topPad + 96, paddingBottom: 160 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
          tintColor={RED} colors={[RED]} progressViewOffset={topPad + 96} />
      }
      renderItem={({ item }) => (
        <NovidadesVerticalCard
          item={item}
          type="trending"
          onPress={() => onPress(item)}
          enrich={enrichMap.get(item.id)}
        />
      )}
      ListEmptyComponent={
        <View style={{ alignItems: "center", paddingTop: 80 }}>
          <ActivityIndicator color={RED} size="large" />
        </View>
      }
    />
  );
}

// ─── UpcomingFlatList (Em breve) ───────────────────────────────────────────────
function UpcomingFlatList({
  items, topPad, refreshing, onRefresh, onPress,
}: {
  items: Array<{ item: ContentItem; releaseDate: string }>;
  topPad: number;
  refreshing: boolean;
  onRefresh: () => void;
  onPress: (item: ContentItem) => void;
}) {
  const contentItems = useMemo(() => items.map(i => i.item), [items]);
  const enrichMap = useTmdbEnrichMap(contentItems);
  return (
    <FlatList
      data={items}
      keyExtractor={(_, i) => `up_${i}`}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: topPad + 96, paddingBottom: 160 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
          tintColor={RED} colors={[RED]} progressViewOffset={topPad + 96} />
      }
      renderItem={({ item: { item, releaseDate } }) => (
        <NovidadesVerticalCard
          item={item}
          releaseDate={releaseDate}
          type="upcoming"
          onPress={() => onPress(item)}
          enrich={enrichMap.get(item.id)}
        />
      )}
      ListEmptyComponent={
        <View style={{ alignItems: "center", paddingTop: 80 }}>
          <Feather name="calendar" size={40} color="rgba(255,255,255,0.12)" />
          <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, marginTop: 12 }}>
            Nenhum lançamento em breve
          </Text>
        </View>
      }
    />
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function NovidadesScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<AllData | null>(null);
  const [paraVoce, setParaVoce] = useState<ContentItem[]>([]);
  const [paraVoceLabel, setParaVoceLabel] = useState("Lançamentos para Você");
  const [modal, setModal] = useState<{ visible: boolean; title: string; items: ContentItem[]; accent: string }>({
    visible: false, title: "", items: [], accent: RED,
  });

  const [activeTab, setActiveTab] = useState<"embreve" | "assistindo" | "filmes" | "series" | "dorama" | "animes" | "animacao">("embreve");
  const [doramas, setDoramas] = useState<ContentItem[]>([]);
  const [animations, setAnimations] = useState<ContentItem[]>([]);
  const [jpAnimes, setJpAnimes] = useState<ContentItem[]>([]);

  const openModal = (title: string, items: ContentItem[], accent = RED) =>
    setModal({ visible: true, title, items, accent });
  const closeModal = () => setModal((m) => ({ ...m, visible: false }));

  const goTo = useCallback((item: ContentItem) => {
    trackOpen(item.tmdbId ?? 0, item.title, item.mediaType ?? (item.type === "movie" ? "movie" : "tv"), []).catch(() => {});
    router.push({
      pathname: "/detail",
      params: {
        type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"),
        id: String(item.tmdbId || 0),
        flix2Id: String(item.id ?? ""),
        title: item.title,
        poster: item.posterPath ?? "",
      },
    });
  }, [router]);

  const load = useCallback(async () => {
    const result = await loadAll();
    setData(result);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // ── IA: Lançamentos para Você — filtrar por gêneros preferidos ───────────
  useEffect(() => {
    if (!data) return;
    Promise.all([getMergedPreferences(), getBehaviorProfile()]).then(([prefs, profile]) => {
      const preferredGenres = new Set<number>([
        ...(prefs?.genres ?? []),
        ...(profile.topGenres ?? []),
      ]);
      if (preferredGenres.size === 0) return;

      const allNew: ContentItem[] = [
        ...(data.whatsNew?.movies ?? []).map(wn2Content),
        ...(data.whatsNew?.series ?? []).map(wn2Content),
        ...(data.trending ?? []).map(tmdbItemToContent),
        ...(data.trendingMovies ?? []).map(tmdbItemToContent),
      ];

      // Remove duplicates by tmdbId
      const seen = new Set<number>();
      const unique = allNew.filter(item => {
        if (!item.tmdbId || seen.has(item.tmdbId)) return false;
        seen.add(item.tmdbId);
        return true;
      });

      // Score by genre overlap + rating
      const scored = unique.map(item => {
        const gids = ((item as any).genreIds ?? []) as number[];
        const overlap = gids.filter(g => preferredGenres.has(g)).length;
        return { item, score: overlap * 2 + (item.rating ?? 0) / 5 };
      }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

      if (scored.length >= 4) {
        setParaVoce(scored.slice(0, 10).map(x => x.item));
        const topGenreName = profile.topGenres.length > 0 ? _GENRE_NAMES[profile.topGenres[0]] : null;
        setParaVoceLabel(topGenreName ? `Lançamentos de ${topGenreName}` : "Lançamentos para Você");
      }
    }).catch(() => {});
  }, [data]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  useEffect(() => {
    api.tmdb.discoverByCountry("tv", "KR")
      .then((res) => {
        if ((res as any).results?.length) setDoramas(((res as any).results as TmdbItem[]).map(tmdbItemToContent));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.allSettled([
      api.tmdb.discoverByLang("tv", "ja", 16),
      api.tmdb.discoverByLang("movie", "ja", 16),
    ]).then(([tvRes, movRes]) => {
      const tvs  = tvRes.status  === "fulfilled" ? (tvRes.value.results  ?? []) : [];
      const movs = movRes.status === "fulfilled" ? (movRes.value.results ?? []) : [];
      const merged = [...tvs, ...movs].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
      const seen = new Set<number>();
      const unique = merged.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
      if (unique.length) setJpAnimes(unique.map(tmdbItemToContent));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.allSettled([
      api.tmdb.discover("movie", 16),
      api.tmdb.discover("tv", 16),
    ]).then(([movRes, tvRes]) => {
      const movs = movRes.status === "fulfilled" ? (movRes.value.results ?? []) : [];
      const tvs  = tvRes.status  === "fulfilled" ? (tvRes.value.results  ?? []) : [];
      const merged = [...movs, ...tvs].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
      const seen = new Set<number>();
      const unique = merged.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
      if (unique.length) setAnimations(unique.map(tmdbItemToContent));
    }).catch(() => {});
  }, []);

  // ── Top 10 Em Alta Agora ─────────────────────────────────────────────────
  const [top10, setTop10] = useState<Top10Item[]>([]);
  const [top10Loading, setTop10Loading] = useState(true);

  useEffect(() => {
    r2Route<{ ok: boolean; items: Top10Item[] }>("/shorts/top10")
      .then((r) => { if (r.ok) setTop10(r.items); })
      .catch(() => {})
      .finally(() => setTop10Loading(false));
  }, []);

  // ── Episode groups ───────────────────────────────────────────────────────
  const [epGroups, setEpGroups] = useState<EpGroup[]>([]);
  const [epLoading, setEpLoading] = useState(false);
  const [showEpsModal, setShowEpsModal] = useState(false);
  const [singleSheet, setSingleSheet] = useState<{ visible: boolean; group: EpGroup | null }>({
    visible: false, group: null,
  });

  useEffect(() => {
    const series = data?.whatsNew?.series?.filter(i => i.poster) ?? [];
    if (!series.length) { setEpGroups([]); return; }
    setEpLoading(true);
    // Fetch ALL series from the last 30 days — no arbitrary cap
    Promise.allSettled(
      series.map(s =>
        r2Route<{ found: boolean; episodes: RawEp[] }>(`/flix2/series-episodes?seriesId=${s.id}`)
          .then(r => ({ s, r }))
      )
    ).then(results => {
      const groups: EpGroup[] = [];
      for (const res of results) {
        if (res.status !== "fulfilled") continue;
        const { s, r } = res.value;
        if (!r.found || !r.episodes?.length) continue;
        const allEps = r.episodes;
        const latestEp = [...allEps].sort((a, b) => {
          if (a.season !== b.season) return b.season - a.season;
          return b.episode - a.episode;
        })[0];
        groups.push({
          seriesId: String(s.id),
          seriesTitle: s.title,
          seriesPoster: s.poster,
          seriesTmdbId: Number(s.tmdb_id) || 0,
          totalEps: allEps.length,
          latestEp,
          allEps,
          seriesOverview: s.overview || "",
          backdropPath: s.backdrop || "",
        });
      }
      setEpGroups(groups);

      // ── TMDB enrichment: backdrop + logo + overview + episode still/synopsis ─
      // Pass 1: groups WITH tmdbId — fetch series details, logo, AND episode details
      const withTmdb = groups.filter(g => g.seriesTmdbId > 0).slice(0, 30);
      if (withTmdb.length) {
        Promise.allSettled(
          withTmdb.map(g =>
            Promise.all([
              r2Route<{ overview?: string; backdrop_path?: string }>(`/tmdb/tv/${g.seriesTmdbId}`),
              r2Route<{ logo_path: string | null }>(`/tmdb/franchise-logo?type=tv&id=${g.seriesTmdbId}`),
              r2Route<{ still_path: string | null; overview?: string }>(
                `/tmdb/tv/${g.seriesTmdbId}/season/${g.latestEp.season}/episode/${g.latestEp.episode}`
              ).catch(() => ({ still_path: null, overview: "" })),
            ]).then(([det, logo, ep]) => ({
              seriesId: g.seriesId,
              overview: det.overview || "",
              backdropPath: det.backdrop_path || "",
              logoPath: logo.logo_path || "",
              latestEpStill: ep.still_path || "",
              latestEpOverview: ep.overview || "",
            }))
          )
        ).then(enrichResults => {
          const map: Record<string, { overview: string; backdropPath: string; logoPath: string; latestEpStill: string; latestEpOverview: string }> = {};
          for (const r2 of enrichResults) {
            if (r2.status !== "fulfilled") continue;
            map[r2.value.seriesId] = r2.value;
          }
          setEpGroups(prev =>
            prev.map(g => {
              const e = map[g.seriesId];
              if (!e) return g;
              return {
                ...g,
                seriesOverview: g.seriesOverview || e.overview,
                backdropPath: e.backdropPath || g.backdropPath,
                logoPath: e.logoPath || g.logoPath,
                latestEpStill: e.latestEpStill || g.latestEpStill,
                latestEpOverview: e.latestEpOverview || g.latestEpOverview,
              };
            })
          );
        });
      }

      // Pass 2: groups WITHOUT tmdbId — try TMDB title search for overview
      const withoutTmdb = groups.filter(g => !g.seriesTmdbId && !g.seriesOverview).slice(0, 15);
      if (withoutTmdb.length) {
        Promise.allSettled(
          withoutTmdb.map(g =>
            r2Route<{ results: Array<{ overview: string }> }>(
              `/tmdb-search?q=${encodeURIComponent(g.seriesTitle)}&type=tv`
            ).then(d => ({
              seriesId: g.seriesId,
              overview: d.results?.[0]?.overview || "",
            }))
          )
        ).then(searchResults => {
          const overMap: Record<string, string> = {};
          for (const r2 of searchResults) {
            if (r2.status !== "fulfilled") continue;
            overMap[r2.value.seriesId] = r2.value.overview;
          }
          setEpGroups(prev =>
            prev.map(g => {
              const ov = overMap[g.seriesId];
              if (!ov) return g;
              return { ...g, seriesOverview: ov };
            })
          );
        });
      }
    }).finally(() => setEpLoading(false));
  }, [data?.whatsNew]);

  const epDetailParams = useCallback((group: EpGroup) => ({
    type: "tv" as const,
    id: group.seriesTmdbId > 0 ? String(group.seriesTmdbId) : "0",
    flix2Id: group.seriesId,
    title: group.seriesTitle,
    poster: group.seriesPoster,
  }), []);

  const handleEpCardPress = useCallback((group: EpGroup) => {
    if (group.totalEps === 1) {
      setSingleSheet({ visible: true, group });
    } else {
      router.push({ pathname: "/detail", params: epDetailParams(group) });
    }
  }, [router, epDetailParams]);

  const handlePlayEpisode = useCallback((group: EpGroup, ep: RawEp) => {
    const flix2Items = group.allEps.map(e => ({
      id: `ep-${e.season}-${e.episode}`,
      flix2Url: e.stream_url,
      title: group.seriesTitle,
      label: e.title,
      season: e.season,
      episode: e.episode,
    }));
    router.push({
      pathname: "/flix2-player",
      params: {
        flix2Url: ep.stream_url,
        title: group.seriesTitle,
        episodeName: ep.title || `S${String(ep.season).padStart(2, "0")} E${String(ep.episode).padStart(2, "0")}`,
        tmdbId: String(group.seriesTmdbId || 0),
        type: "tv",
        season: String(ep.season),
        episode: String(ep.episode),
        flix2ItemsJson: JSON.stringify(flix2Items),
      },
    });
  }, [router]);

  const handleEpSynopsis = useCallback((group: EpGroup) => {
    router.push({ pathname: "/detail", params: epDetailParams(group) });
  }, [router, epDetailParams]);

  // ── Computed sections ───────────────────────────────────────────────────────
  const heroBannerItems = useMemo<ContentItem[]>(() => {
    if (!data) return [];
    return data.trending.slice(0, 8).map(tmdbItemToContent);
  }, [data]);

  const nowPlayingItems = useMemo<ContentItem[]>(() => {
    if (!data) return [];
    return data.nowPlaying.map(tmdbItemToContent);
  }, [data]);

  const upcomingItems = useMemo<Array<{ item: ContentItem; releaseDate: string }>>(() => {
    if (!data) return [];
    return data.upcoming
      .filter((i) => i.release_date && daysUntil(i.release_date) >= 0)
      .map((i) => ({ item: tmdbItemToContent(i), releaseDate: i.release_date! }));
  }, [data]);

  const onTheAirItems = useMemo<ContentItem[]>(() => {
    if (!data) return [];
    return data.onTheAir.map(tmdbItemToContent);
  }, [data]);

  const airingTodayItems = useMemo<ContentItem[]>(() => {
    if (!data) return [];
    return data.airingToday.map(tmdbItemToContent);
  }, [data]);

  const trendingMovieItems = useMemo<ContentItem[]>(() => {
    if (!data) return [];
    return data.trendingMovies.map(tmdbItemToContent);
  }, [data]);

  const trendingTvItems = useMemo<ContentItem[]>(() => {
    if (!data) return [];
    return data.trendingTv.map(tmdbItemToContent);
  }, [data]);

  const newMovies = useMemo<ContentItem[]>(() => {
    if (!data?.whatsNew) return [];
    return data.whatsNew.movies
      .filter((i) => i.poster || i.backdrop)
      .sort((a, b) => b.added_at - a.added_at)
      .map(wn2Content);
  }, [data]);

  const newSeries = useMemo<ContentItem[]>(() => {
    if (!data?.whatsNew) return [];
    return data.whatsNew.series
      .filter((i) => i.poster || i.backdrop)
      .sort((a, b) => b.added_at - a.added_at)
      .map(wn2Content);
  }, [data]);

  // "Novos Episódios" — séries do whats-new onde novos eps foram adicionados
  // Ordenadas pelo mais recente, priorizando séries de hoje e ontem
  const newEpisodes = useMemo<ContentItem[]>(() => {
    if (!data?.whatsNew) return [];
    const today = new Date().toISOString().slice(0, 10);
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const sorted = [...data.whatsNew.series]
      .filter((i) => i.poster)
      .sort((a, b) => {
        // Hoje primeiro, ontem segundo, resto por added_at desc
        const pa = a.added_date === today ? 2 : a.added_date === yest ? 1 : 0;
        const pb = b.added_date === today ? 2 : b.added_date === yest ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return b.added_at - a.added_at;
      });
    return sorted.map(wn2Content);
  }, [data]);

  // "Recém Adicionados" — mix de todos os tipos, ordenados por added_at desc (aleatorio visual)
  const recentlyAdded = useMemo<ContentItem[]>(() => {
    if (!data?.whatsNew) return [];
    const all = [
      ...(data.whatsNew.movies ?? []),
      ...(data.whatsNew.series ?? []),
      ...(data.whatsNew.animes ?? []),
    ]
      .filter((i) => i.poster)
      .sort((a, b) => b.added_at - a.added_at);

    // Embaralha ligeiramente: pega os 30 mais recentes e shuffla
    const pool = all.slice(0, 40);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.map(wn2Content);
  }, [data]);

  const newAnimes = useMemo<ContentItem[]>(() => {
    if (!data?.whatsNew) return [];
    return data.whatsNew.animes.filter((i) => i.poster).map(wn2Content);
  }, [data]);

  // "Animes JP" — apenas animes de animação japonesa verdadeiros.
  // Filtra os itens do flix2 cross-referenciando com o discover do TMDB
  // (idioma original=ja + gênero Animação), e complementa com o restante do TMDB.
  const jpAnimesFiltered = useMemo<ContentItem[]>(() => {
    const jpIds = new Set(jpAnimes.map((i) => i.tmdbId).filter(Boolean));

    // Itens novos (flix2) que existem no TMDB com idioma ja + gênero animação
    const fromNew = newAnimes.filter(
      (i) => i.tmdbId && jpIds.has(i.tmdbId)
    );
    const fromNewIds = new Set(fromNew.map((i) => i.tmdbId).filter(Boolean));

    // Demais do TMDB que não estão nos novos
    const fromJp = jpAnimes.filter(
      (i) => !i.tmdbId || !fromNewIds.has(i.tmdbId)
    );

    return [...fromNew, ...fromJp];
  }, [newAnimes, jpAnimes]);

  const totalNew = (data?.whatsNew?.total ?? 0);

  // ── Week stats ──────────────────────────────────────────────────────────────
  const weekMovies = useMemo(() => data?.whatsNew?.movies.length ?? 0, [data]);
  const weekSeries = useMemo(() => data?.whatsNew?.series.length ?? 0, [data]);
  const weekAnimes = useMemo(() => data?.whatsNew?.animes.length ?? 0, [data]);

  return (
    <View style={[root.bg, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* ═══ HEADER ══════════════════════════════════════════════════════════ */}
      <View style={[root.header, { paddingTop: topPad + 10 }]}>
        <LinearGradient
          colors={["rgba(5,5,8,0.98)", "rgba(5,5,8,0.7)", "transparent"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={root.headerInner}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={root.logoAccent} />
            <Text style={root.logoA}>NOVI</Text>
            <Text style={root.logoB}>DADES</Text>
            {totalNew > 0 && (
              <View style={root.countBadge}>
                <Text style={root.countText}>{totalNew}+</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
            <TouchableOpacity style={root.iconBtn}
              onPress={() => router.push("/buscar")} activeOpacity={0.75}>
              <Feather name="search" size={19} color="rgba(255,255,255,0.75)" />
            </TouchableOpacity>
            <TouchableOpacity style={root.iconBtn}
              onPress={() => router.push("/(tabs)/list")} activeOpacity={0.75}>
              <Feather name="bookmark" size={19} color="rgba(255,255,255,0.75)" />
            </TouchableOpacity>
            <ProfileAvatarButton />
          </View>
        </View>
      </View>

      {/* ═══ PILLS ═══════════════════════════════════════════════════════════ */}
      <View style={[pillsNf.bar, { top: topPad + 52 }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={pillsNf.row}
        >
          {(
            [
              { id: "embreve" as const,    emoji: "🍿", label: "Em breve" },
              { id: "assistindo" as const, emoji: "🔥", label: "Todo mundo" },
              { id: "filmes" as const,     emoji: "🎬", label: "Filmes" },
              { id: "series" as const,     emoji: "📺", label: "Séries" },
              { id: "dorama" as const,     emoji: "🌸", label: "Dorama" },
              { id: "animes" as const,     emoji: "⛩️", label: "Animes JP" },
              { id: "animacao" as const,   emoji: "🎨", label: "Animação" },
            ] as const
          ).map(tab => (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.75}
              style={[pillsNf.pill, activeTab === tab.id && pillsNf.pillActive]}
            >
              <Text style={pillsNf.emoji}>{tab.emoji}</Text>
              <Text style={[pillsNf.label, activeTab === tab.id && pillsNf.labelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ═══ CONTENT ═════════════════════════════════════════════════════════ */}
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: topPad + 100 }}>
          <ActivityIndicator size="large" color={RED} />
        </View>
      ) : activeTab === "embreve" ? (
        <UpcomingFlatList
          items={upcomingItems}
          topPad={topPad}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onPress={goTo}
        />
      ) : activeTab === "filmes" ? (
        <CategoryFlatList
          items={newMovies}
          keyPrefix="film"
          emptyIcon="film"
          emptyText="Nenhum filme novo nos últimos 30 dias"
          topPad={topPad}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onPress={goTo}
        />
      ) : activeTab === "series" ? (
        <CategoryFlatList
          items={newSeries}
          keyPrefix="ser"
          emptyIcon="tv"
          emptyText="Nenhuma série nova nos últimos 30 dias"
          topPad={topPad}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onPress={goTo}
          listHeader={
            epGroups.length > 0 ? (
              <View style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10, gap: 8 }}>
                  <View style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: TEAL }} />
                  <Text style={{ fontSize: 15, fontWeight: "800", color: "#fff" }}>Novos Episódios</Text>
                  <View style={{ flex: 1 }} />
                  {epLoading && <ActivityIndicator size="small" color={TEAL} />}
                </View>
                <FlatList
                  horizontal
                  data={epGroups}
                  keyExtractor={g => `epg_${g.seriesId}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}
                  renderItem={({ item: g }) => (
                    <EpisodeCard
                      group={g}
                      onPress={handleEpCardPress}
                      onSynopsis={handleEpSynopsis}
                    />
                  )}
                />
              </View>
            ) : epLoading ? (
              <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <View style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: TEAL }} />
                  <Text style={{ fontSize: 15, fontWeight: "800", color: "#fff" }}>Novos Episódios</Text>
                  <ActivityIndicator size="small" color={TEAL} style={{ marginLeft: 4 }} />
                </View>
              </View>
            ) : null
          }
        />
      ) : activeTab === "dorama" ? (
        <CategoryFlatList
          items={doramas}
          keyPrefix="dor"
          emptyIcon="heart"
          emptyText="Nenhum dorama disponível no momento"
          topPad={topPad}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onPress={goTo}
        />
      ) : activeTab === "animes" ? (
        <CategoryFlatList
          items={jpAnimesFiltered}
          keyPrefix="ani"
          emptyIcon="star"
          emptyText="Nenhum anime japonês disponível no momento"
          topPad={topPad}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onPress={goTo}
        />
      ) : activeTab === "animacao" ? (
        <CategoryFlatList
          items={animations}
          keyPrefix="anim"
          emptyIcon="play-circle"
          emptyText="Nenhuma animação disponível nos últimos 30 dias"
          topPad={topPad}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onPress={goTo}
        />
      ) : (
        <TrendingFlatList
          items={[...heroBannerItems, ...newMovies.slice(0, 6), ...newSeries.slice(0, 6)].filter(
            (item, idx, arr) =>
              arr.findIndex(x => (x.tmdbId ?? 0) === (item.tmdbId ?? 0) && (x.tmdbId ?? 0) > 0) === idx ||
              (item.tmdbId ?? 0) === 0
          )}
          topPad={topPad}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onPress={goTo}
        />
      )}

      {/* ═══ VER MAIS MODAL ══════════════════════════════════════════════════ */}
      <VerMaisModal
        visible={modal.visible}
        title={modal.title}
        items={modal.items}
        accentColor={modal.accent}
        onClose={closeModal}
        onItemPress={goTo}
      />
    </View>
  );
}


const top10st = StyleSheet.create({
  card: { width: 100, marginRight: 10 },
  posterWrap: { width: 100, height: 148, borderRadius: 10, overflow: "hidden", marginBottom: 6 },
  poster: { width: "100%", height: "100%" },
  typeBadge: { position: "absolute", bottom: 6, left: 6, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  typeBadgeText: { fontSize: 8, fontWeight: "800", color: "#fff", letterSpacing: 0.3 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 },
  rank: { fontSize: 13, fontWeight: "900", letterSpacing: -0.5 },
  genre: { fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: "600", flex: 1 },
  title: { fontSize: 11, fontWeight: "700", color: "#fff", lineHeight: 15, marginBottom: 3 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  rating: { fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.6)" },
  year: { fontSize: 10, color: "rgba(255,255,255,0.3)", marginLeft: 4 },
});

const root = StyleSheet.create({
  bg: { flex: 1 },
  header: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 100 },
  headerInner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  logoAccent: { width: 3, height: 22, borderRadius: 2, backgroundColor: RED },
  logoA: { fontSize: 20, fontWeight: "900", color: RED, letterSpacing: 1 },
  logoB: { fontSize: 20, fontWeight: "900", color: "#fff", letterSpacing: 1 },
  countBadge: { backgroundColor: `${RED}25`, borderWidth: 1, borderColor: `${RED}50`, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  countText: { fontSize: 10, fontWeight: "900", color: RED },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  section: { marginBottom: 28 },
  emptyText: { color: "rgba(255,255,255,0.25)", fontSize: 13, paddingHorizontal: 20, fontStyle: "italic" },
  footer: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, marginTop: 12 },
  footerLine: { flex: 1, height: 1 },
  footerText: { fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.2)", letterSpacing: 0.5 },
});
