import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { getApiBase } from "@/lib/api";
import { getProxiedStreamUrl } from "@/lib/gdrive-index";
import { ProfileAvatarButton } from "@/components/ProfileAvatarButton";
import { recordShortsWatch } from "@/lib/shorts-history";
import { toggleShortsLike, loadShortsLikes } from "@/lib/shorts-likes";

let WebView: any = null;
try { WebView = require("react-native-webview").WebView; } catch {}

const { width: W, height: H } = Dimensions.get("window");
const RED = "#e50914";
const IS_NATIVE = Platform.OS !== "web";

// ─── CDN helpers (same logic as flix2-player) ─────────────────────────────────
const FONTE_HOSTS = ["72yrci50ppqp71.com", "fontedecanais.me", "hubby.cx"];
const isFonteUrl = (u: string) => FONTE_HOSTS.some((h) => u.includes(h));
const isHubbyCx  = (u: string) => u.includes("hubby.cx");
// nixplay.lat is the Xtream CDN — returns 302 to fontedecanais on device IP.
// Chrome (Android WebView) follows the redirect natively; no resolver needed.
const isNixplay  = (u: string) => u.includes("nixplay.lat");
// Upgrade http://fontedecanais:80 → https:// (porta 443 funciona)
const fonteToHttps = (u: string) =>
  u.startsWith("http://")
    ? u.replace(/^http:\/\//, "https://").replace(/:80(\/|$|\?)/, (_, s: string) => s ?? "")
    : u;
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ─── Lookup / episode cache ───────────────────────────────────────────────────
// Stores playable stream URLs by item.id — populated by prefetchLookup().
// For movies: raw hubby.cx URL from /flix2/lookup.
// For series: URL of the picked "interesting" episode from /flix2/series-episodes.
const LOOKUP_CACHE = new Map<string, string>(); // itemId → playable stream URL
const PREFETCH_IN_FLIGHT = new Set<string>();   // itemIds currently being fetched

// ── Episode picker — selects an "interesting" episode from a series ────────────
// Strategy: avoid S1E1 (slow intros), prefer middle episodes from mid-seasons.
type RawEpisode = { season: number; episode: number; stream_url: string };

function pickInterestingEpisode(episodes: RawEpisode[]): RawEpisode | null {
  if (episodes.length === 0) return null;

  // Group by season
  const bySeason = new Map<number, RawEpisode[]>();
  for (const ep of episodes) {
    if (!bySeason.has(ep.season)) bySeason.set(ep.season, []);
    bySeason.get(ep.season)!.push(ep);
  }
  const seasons = [...bySeason.keys()].sort((a, b) => a - b);
  const totalSeasons = seasons.length;

  // Pick target season: prefer mid-series seasons (more interesting plot)
  let targetSeason: number;
  if (totalSeasons >= 3) {
    // Pick season 2 or 3 for peak-TV quality
    const midSeasons = seasons.slice(1, 3);
    targetSeason = midSeasons[Math.floor(Math.random() * midSeasons.length)];
  } else {
    // 1-2 seasons: use whatever is available
    targetSeason = seasons[Math.floor(Math.random() * totalSeasons)];
  }

  const pool = (bySeason.get(targetSeason) ?? []).filter((ep) => {
    // Skip S1E1 and S1E2 — usually slow exposition
    if (ep.season === 1 && ep.episode <= 2) return false;
    return true;
  });
  const finalPool = pool.length > 0 ? pool : (bySeason.get(targetSeason) ?? episodes);

  // Pick randomly from the pool (avoid always showing the same episode)
  return finalPool[Math.floor(Math.random() * finalPool.length)] ?? null;
}

// ── Resolve series episodes directly from client (when server is blocked) ─────
async function resolveSeriesEpisodeDirect(directUrl: string, streamBase: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(directUrl, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return "";
    const data = await res.json() as any;
    if (!data?.episodes || typeof data.episodes !== "object") return "";
    const allEpisodes: RawEpisode[] = [];
    for (const [seasonStr, eps] of Object.entries(data.episodes as Record<string, any[]>)) {
      if (!Array.isArray(eps)) continue;
      const season = Number(seasonStr);
      for (const ep of eps as any[]) {
        if (!ep?.id) continue;
        const ext = (ep.container_extension as string) || "mp4";
        allEpisodes.push({
          season,
          episode: Number(ep.episode_num ?? ep.episode ?? 1),
          stream_url: `${streamBase}${ep.id}.${ext}`,
        });
      }
    }
    if (allEpisodes.length === 0) return "";
    const picked = pickInterestingEpisode(allEpisodes);
    return picked?.stream_url ?? "";
  } catch {
    clearTimeout(t);
    return "";
  }
}

// ── Resolve series → episode stream URL ───────────────────────────────────────
async function resolveSeriesEpisode(seriesId: string, base: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${base}/r2/flix2/series-episodes?seriesId=${seriesId}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return "";
    const data = await res.json() as any;
    if (data.found && Array.isArray(data.episodes) && data.episodes.length > 0) {
      const picked = pickInterestingEpisode(data.episodes as RawEpisode[]);
      return picked?.stream_url ?? "";
    }
    // Datacenter IP blocked by Xtream provider — retry directly from the device (residential IP)
    if (data.tryClientDirect && data.directUrl && data.streamBase) {
      return await resolveSeriesEpisodeDirect(data.directUrl as string, data.streamBase as string);
    }
    return "";
  } catch {
    clearTimeout(t);
    return "";
  }
}

async function prefetchLookup(item: ShortItem): Promise<void> {
  // Skip if already cached or in flight
  if (LOOKUP_CACHE.has(item.id) || PREFETCH_IN_FLIGHT.has(item.id)) return;
  PREFETCH_IN_FLIGHT.add(item.id);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const base = getApiBase();
    const catalogType = item.type === "movie" ? "movies" : "series";
    const url = `${base}/r2/flix2/lookup?tmdbId=${item.tmdbId}&type=${catalogType}&title=${encodeURIComponent(item.title)}&year=${item.year ?? ""}`;
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return;
    const data = await res.json() as any;
    if (!data.found) return;

    let raw: string = data.item?.stream_url ?? "";
    const isDirectVideo = (u: string) =>
      u.length > 0 && !u.startsWith("flix2id:") && !u.includes("player_api.php") && u !== "null";

    if (!isDirectVideo(raw)) {
      // Series: no direct URL — pick a random episode
      const seriesId = String(data.item?.id ?? data.item?.series_id ?? "");
      if (seriesId) raw = await resolveSeriesEpisode(seriesId, base);
    }

    if (isDirectVideo(raw)) LOOKUP_CACHE.set(item.id, raw);
  } catch {
    clearTimeout(t);
  } finally {
    PREFETCH_IN_FLIGHT.delete(item.id);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrendingGenreEntry {
  id: string;
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  poster: string | null;
  backdrop: string | null;
  rating: number;
  year: number;
}

interface ShortItem {
  id: string;
  tmdbId: number;
  title: string;
  type: "movie" | "tv";
  backdrop: string | null;
  poster: string | null;
  overview: string;
  year: number;
  rating: number;
  genre: string;
  genreIds: number[];
  runtime: number;
  startTimePct: number;
  startTimeSeconds: number;
  clipDurationSeconds: number;
  sceneLabel: string;
  availableOnFlix2: boolean;
  liked: boolean;
  likes: number;
  saved: boolean;
  // Trending row sentinel — set when this slot is a "Trending por Gênero" card
  isTrendingRow?: boolean;
  trendingGenreId?: number;
  trendingGenreName?: string;
  trendingItems?: TrendingGenreEntry[];
}

type VideoState = "idle" | "resolving" | "playing" | "error";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function buildShortVideoHtml(
  streamUrl: string,
  startTimeSeconds: number,
  clipDurationSeconds: number,
  muted: boolean,
): string {
  const escaped = streamUrl.replace(/'/g, "\\'").replace(/"/g, "&quot;");
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;background:#000}
html,body,video{width:100%;height:100%;overflow:hidden}
video{object-fit:cover;display:block}
</style>
</head>
<body>
<video id="v" playsinline webkit-playsinline preload="auto" ${muted ? "muted" : ""}></video>
<script>
(function(){
  var v = document.getElementById('v');
  var START = ${startTimeSeconds};
  var CLIP  = ${clipDurationSeconds};
  var rn    = window.ReactNativeWebView;

  function send(obj) {
    try { rn && rn.postMessage(JSON.stringify(obj)); } catch(e){}
  }

  v.addEventListener('loadedmetadata', function() {
    v.currentTime = START;
    v.play().catch(function(){});
    send({ type: 'ready', duration: v.duration });
  });

  v.addEventListener('timeupdate', function() {
    if (v.currentTime >= START + CLIP) {
      v.currentTime = START;
    }
    send({ type: 'progress', position: v.currentTime, duration: v.duration });
  });

  v.addEventListener('error', function() {
    send({ type: 'error', msg: 'video error' });
  });

  v.addEventListener('canplay', function() {
    send({ type: 'canplay' });
  });

  v.addEventListener('progress', function() {
    if (v.buffered && v.buffered.length > 0 && v.duration > 0) {
      send({ type: 'buffer', pct: v.buffered.end(v.buffered.length - 1) / v.duration });
    }
  });

  v.addEventListener('stalled', function() {
    send({ type: 'buffering' });
  });

  function handleCmd(e) {
    try {
      var d = typeof e === 'string' ? e : (e.data || '{}');
      var cmd = JSON.parse(d);
      if (cmd.type === 'play')   { v.currentTime = START; v.play().catch(function(){}); }
      if (cmd.type === 'pause')  { v.pause(); }
      if (cmd.type === 'mute')   { v.muted = true; }
      if (cmd.type === 'unmute') { v.muted = false; }
    } catch(ex){}
  }

  document.addEventListener('message', handleCmd);
  window.addEventListener('message', handleCmd);

  v.src = '${escaped}';
  v.load();
})();
</script>
</body>
</html>`;
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({
  icon, label, color = "#fff", onPress, active = false,
}: {
  icon: string; label: string; color?: string; onPress: () => void; active?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const tap = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.72, duration: 75, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 320, friction: 5 }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity onPress={tap} activeOpacity={0.8} style={s.actionBtn}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Feather name={icon as any} size={28} color={active ? RED : color} />
      </Animated.View>
      <Text style={[s.actionLabel, active && { color: RED }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Short Video Card ─────────────────────────────────────────────────────────

function ShortVideoCard({
  item,
  isVisible,
  muted,
  onToggleMute,
  onLike,
  onSave,
  onDetail,
  onMoreLikeThis,
}: {
  item: ShortItem;
  isVisible: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onDetail: (item: ShortItem) => void;
  onMoreLikeThis: (item: ShortItem) => void;
}) {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const [videoState, setVideoState] = useState<VideoState>("idle");
  // finalUrl is the resolved playable URL (fontedecanais HTTPS, or proxied URL)
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  // baseUrl for the WebView srcdoc — must match CDN origin to avoid CORS
  const [webViewBaseUrl, setWebViewBaseUrl] = useState("https://hubby.cx");
  const [shared, setShared] = useState(false); // brief "Copiado!" feedback
  const [boosted, setBoosted] = useState(false); // brief "Feed atualizado!" feedback
  // videoReady: true once video emits canplay — triggers poster crossfade
  const [videoReady, setVideoReady] = useState(false);
  const webviewRef   = useRef<any>(null);
  const webVideoRef  = useRef<any>(null); // ref for web <video> element
  const bufferBarRef = useRef<any>(null); // ref for web buffer bar <div>
  // posterOpacity: 1 → 0 when video is ready (crossfade poster→video)
  const posterOpacity = useRef(new Animated.Value(1)).current;
  // bufferAnim: 0→1 for native buffer bar (driven by WebView postMessage)
  const bufferAnim = useRef(new Animated.Value(0)).current;

  // Resolver WebView (hidden) — captures hubby.cx redirect URL on native
  // Same pattern as flix2-player.tsx
  const [resolverUrl, setResolverUrl] = useState<string | null>(null);
  const resolverCallbackRef = useRef<((url: string) => void) | null>(null);
  const resolverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const infoY   = useRef(new Animated.Value(30)).current;
  const infoOp  = useRef(new Animated.Value(0)).current;
  const aiBadgeScale = useRef(new Animated.Value(0)).current;

  // ── Resolve stream URL when visible ─────────────────────────────────────────
  // Mirrors flix2-player loadVideoUrl() exactly:
  //   0. Check LOOKUP_CACHE (populated by prefetchLookup) — skip API call if hit
  //   1. Lookup Flix2 catalog → get hubby.cx URL
  //   2. Native + hubby.cx → resolver WebView captures fontedecanais redirect URL
  //   3. Server fallback → /api/admin/check-link → location header
  //   4. Last resort → /api/stream/proxy (same proxy used by flix2-player)
  //   5. Web → getProxiedStreamUrl() → /api/stream/proxy
  useEffect(() => {
    if (!isVisible || videoState !== "idle") return;

    setVideoState("resolving");
    let cancelled = false;

    const resolve = async () => {
      try {
        const base = getApiBase();

        // ── Path 0: pre-fetch cache (populated by ShortsScreen prefetchLookup) ──
        // If the lookup was already done in the background while the previous item
        // was playing, skip the API call entirely and go straight to CDN resolution.
        let raw = LOOKUP_CACHE.get(item.id) ?? "";

        const isDirectVideo = (u: string) =>
          u.length > 0 && !u.startsWith("flix2id:") && !u.includes("player_api.php") && u !== "null";

        if (!raw) {
          // Cache miss — do the lookup now (AbortSignal.timeout crashes on Hermes)
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 10000);
          try {
            const catalogType = item.type === "movie" ? "movies" : "series";
            const lookupUrl = `${base}/r2/flix2/lookup?tmdbId=${item.tmdbId}&type=${catalogType}&title=${encodeURIComponent(item.title)}&year=${item.year ?? ""}`;
            const res = await fetch(lookupUrl, { signal: ctrl.signal });
            clearTimeout(timer);
            if (cancelled) return;
            if (!res.ok) throw new Error("lookup failed");
            const data = await res.json() as any;
            if (!data.found) { setVideoState("error"); return; }

            raw = data.item?.stream_url ?? "";

            // ── Series: stream_url is null — fetch episodes and pick one ─────────
            if (!isDirectVideo(raw)) {
              const seriesId = String(data.item?.id ?? data.item?.series_id ?? "");
              if (!seriesId) { setVideoState("error"); return; }
              raw = await resolveSeriesEpisode(seriesId, base);
              if (cancelled) return;
            }

            if (!isDirectVideo(raw)) { setVideoState("error"); return; }
            // Store in cache for future use
            LOOKUP_CACHE.set(item.id, raw);
          } catch {
            clearTimeout(timer);
            if (!cancelled) setVideoState("error");
            return;
          }
        }

        if (cancelled) return;
        if (!isDirectVideo(raw)) { setVideoState("error"); return; }

        if (isWeb) {
          // Web: use the same proxy as flix2-player → /api/stream/proxy
          const proxied = getProxiedStreamUrl(raw);
          setWebViewBaseUrl(typeof window !== "undefined" ? window.location.origin : "");
          setFinalUrl(proxied);
          setVideoState("playing");
          return;
        }

        // ── Native: resolve hubby.cx redirect via device WebView (same as flix2-player) ──
        if (isHubbyCx(raw) && WebView) {
          let capturedUrl: string | null = null;
          try {
            capturedUrl = await new Promise<string>((resolve2, reject2) => {
              resolverCallbackRef.current = resolve2;
              resolverTimerRef.current = setTimeout(() => {
                resolverCallbackRef.current = null;
                reject2(new Error("timeout"));
              }, 8000);
              setResolverUrl(raw);
            });
          } catch { /* timeout — fall through to server-side */ } finally {
            if (resolverTimerRef.current) { clearTimeout(resolverTimerRef.current); resolverTimerRef.current = null; }
            setResolverUrl(null);
          }

          if (capturedUrl && isFonteUrl(capturedUrl)) {
            if (cancelled) return;
            setWebViewBaseUrl("https://hubby.cx");
            setFinalUrl(fonteToHttps(capturedUrl));
            setVideoState("playing");
            return;
          }

          // Level 2: server-side check-link (HEAD request captures 302 Location)
          try {
            const ctrl2 = new AbortController();
            const t2 = setTimeout(() => ctrl2.abort(), 6000);
            const r2 = await fetch(`${base}/admin/check-link?url=${encodeURIComponent(raw)}`, { signal: ctrl2.signal });
            clearTimeout(t2);
            if (r2.ok) {
              const d2 = await r2.json();
              if (d2.location && d2.location !== raw) {
                if (cancelled) return;
                setWebViewBaseUrl("https://hubby.cx");
                setFinalUrl(fonteToHttps(d2.location));
                setVideoState("playing");
                return;
              }
            }
          } catch { /* fall through */ }
        }

        // Native + nixplay.lat: play directly — Chrome WebView follows 302 to
        // fontedecanais natively on device IP (no server proxy needed).
        // baseUrl="https://nixplay.lat" sets the Referer header for CDN auth.
        if (IS_NATIVE && isNixplay(raw)) {
          if (cancelled) return;
          setWebViewBaseUrl("https://nixplay.lat");
          setFinalUrl(raw);
          setVideoState("playing");
          return;
        }

        // Level 3 (last resort): stream proxy — same URL as flix2-player uses
        if (cancelled) return;
        const proxied = getProxiedStreamUrl(raw);
        setWebViewBaseUrl(base.replace(/\/api$/, ""));
        setFinalUrl(proxied);
        setVideoState("playing");
      } catch {
        if (!cancelled) setVideoState("error");
      }
    };

    resolve();
    return () => { cancelled = true; };
  }, [isVisible]);

  // Reset poster/ready state when card resets to idle
  useEffect(() => {
    if (videoState === "idle") {
      setVideoReady(false);
      posterOpacity.setValue(1);
      bufferAnim.setValue(0);
    }
  }, [videoState]);

  // Fade poster out when video is ready (crossfade poster → video)
  useEffect(() => {
    if (videoReady) {
      Animated.timing(posterOpacity, {
        toValue: 0, duration: 350, useNativeDriver: true,
      }).start();
    }
  }, [videoReady]);

  // Inject play/pause when visibility changes (native WebView)
  useEffect(() => {
    if (videoState !== "playing" || !webviewRef.current) return;
    const cmd = isVisible ? { type: "play" } : { type: "pause" };
    const js = `(function(){ var e = new MessageEvent('message',{data:'${JSON.stringify(cmd).replace(/'/g, "\\'")}'}); window.dispatchEvent(e); })(); true;`;
    webviewRef.current.injectJavaScript?.(js);
  }, [isVisible, videoState]);

  // Play/pause web <video> element when card scrolls in/out
  useEffect(() => {
    if (!isWeb || videoState !== "playing" || !webVideoRef.current) return;
    if (isVisible) { webVideoRef.current.play?.().catch(() => {}); }
    else           { webVideoRef.current.pause?.(); }
  }, [isVisible, videoState, isWeb]);

  // Animate info overlay
  useEffect(() => {
    if (isVisible) {
      Animated.parallel([
        Animated.timing(infoY, { toValue: 0, duration: 380, useNativeDriver: true, delay: 100 }),
        Animated.timing(infoOp, { toValue: 1, duration: 340, useNativeDriver: true, delay: 100 }),
        Animated.spring(aiBadgeScale, { toValue: 1, useNativeDriver: true, tension: 220, friction: 6, delay: 500 }),
      ]).start();
    } else {
      infoY.setValue(30);
      infoOp.setValue(0);
      aiBadgeScale.setValue(0);
    }
  }, [isVisible]);

  const injectMute = (m: boolean) => {
    if (!webviewRef.current) return;
    const cmd = m ? { type: "mute" } : { type: "unmute" };
    const js = `(function(){ var e = new MessageEvent('message',{data:'${JSON.stringify(cmd).replace(/'/g, "\\'")}'}); window.dispatchEvent(e); })(); true;`;
    webviewRef.current.injectJavaScript?.(js);
  };

  // Sync global mute prop → WebView whenever it changes while video is playing
  useEffect(() => {
    if (videoState === "playing") injectMute(muted);
  }, [muted, videoState]);

  const toggleMute = () => {
    onToggleMute();
  };

  // ── Share ─────────────────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    const emoji = item.type === "movie" ? "🎬" : "📺";
    const stars = "⭐".repeat(Math.round(item.rating / 2));
    const msg = `${emoji} ${item.title} (${item.year}) ${stars}\n\nAssistindo no NETPLAY — o melhor streaming! 🍿`;

    try {
      if (isWeb) {
        // Web: copy to clipboard + brief icon feedback
        await navigator.clipboard?.writeText(msg);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } else {
        await Share.share({ message: msg, title: item.title });
      }
    } catch { /* user dismissed or no clipboard API */ }
  }, [item, isWeb]);

  // Web: render native <video> element — iframe can't play raw video bytes from proxy
  // Native: render WebView with srcdoc (html template handles CDN playback)
  const showWebVideo   = isWeb && videoState === "playing" && !!finalUrl;
  const showNativeVideo = !isWeb && videoState === "playing" && !!finalUrl && !!WebView;
  const html = showNativeVideo
    ? buildShortVideoHtml(finalUrl!, item.startTimeSeconds, item.clipDurationSeconds, muted)
    : null;

  return (
    <View style={{ width: W, height: H }}>

      {/* ── Hidden resolver WebView (native only) — captures hubby.cx → fontedecanais redirect ── */}
      {resolverUrl && WebView && IS_NATIVE && (
        <WebView
          style={{ width: 0, height: 0, position: "absolute" }}
          source={{ uri: resolverUrl }}
          userAgent={BROWSER_UA}
          onShouldStartLoadWithRequest={(req: any) => {
            const url: string = req.url ?? "";
            if (isFonteUrl(url) && !isHubbyCx(url)) {
              if (resolverCallbackRef.current) {
                resolverCallbackRef.current(url);
                resolverCallbackRef.current = null;
              }
              return false; // don't navigate — we captured the URL
            }
            return true;
          }}
        />
      )}

      {/* ── Background: video layer ── */}
      {showWebVideo && finalUrl ? (
        // Web: <video> element with canplay/progress events for crossfade + buffer bar
        React.createElement("video", {
          key: finalUrl,
          ref: webVideoRef,
          src: finalUrl,
          autoPlay: true,
          playsInline: true,
          muted: muted,
          loop: false,
          style: {
            position: "absolute" as const, top: 0, left: 0,
            width: "100%", height: "100%",
            objectFit: "cover", background: "#000",
          },
          onCanPlay: () => setVideoReady(true),
          onPlaying: () => setVideoReady(true),
          onProgress: (e: any) => {
            const v = e.target;
            if (bufferBarRef.current && v.buffered && v.buffered.length > 0 && v.duration > 0) {
              const pct = v.buffered.end(v.buffered.length - 1) / v.duration;
              bufferBarRef.current.style.width = `${Math.round(pct * 100)}%`;
            }
          },
          onError: () => setVideoState("error"),
        })
      ) : showNativeVideo && html ? (
        <WebView
          ref={webviewRef}
          style={StyleSheet.absoluteFill}
          source={{ html, baseUrl: webViewBaseUrl }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsAirPlayForMediaPlayback={false}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={["*"]}
          mixedContentMode="always"
          allowsProtectedMedia
          setSupportMultipleWindows={false}
          overScrollMode="never"
          userAgent={BROWSER_UA}
          onMessage={(e: any) => {
            try {
              const msg = JSON.parse(e.nativeEvent.data);
              if (msg.type === "error") setVideoState("error");
              if (msg.type === "canplay") setVideoReady(true);
              if (msg.type === "buffer" && typeof msg.pct === "number") {
                Animated.timing(bufferAnim, {
                  toValue: msg.pct, duration: 200, useNativeDriver: false,
                }).start();
              }
            } catch {}
          }}
          scrollEnabled={false}
          bounces={false}
        />
      ) : null}

      {/* ── Poster crossfade overlay — always rendered, fades out on canplay ── */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: posterOpacity }]}
        pointerEvents="none"
      >
        <Image
          source={{ uri: item.backdrop ?? undefined }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
        />
      </Animated.View>

      {/* ── Buffer progress bar (top of card) ── */}
      {(showNativeVideo || showWebVideo) && (
        <View style={s.bufferTrack} pointerEvents="none">
          {isWeb ? (
            // Web: direct DOM ref manipulation (no React state = no re-render)
            React.createElement("div", {
              ref: bufferBarRef,
              style: {
                height: "100%", width: "0%",
                background: "#e50914", borderRadius: 2,
                transition: "width 0.2s linear",
              },
            })
          ) : (
            // Native: Animated.View driven by postMessage buffer events
            <Animated.View
              style={[
                s.bufferFill,
                {
                  width: bufferAnim.interpolate({
                    inputRange: [0, 1], outputRange: ["0%", "100%"],
                  }) as any,
                },
              ]}
            />
          )}
        </View>
      )}

      {/* ── Top gradient ── */}
      <LinearGradient
        colors={["rgba(0,0,0,0.55)", "transparent"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: topPad + 80 }}
        pointerEvents="none"
      />

      {/* ── Bottom gradient ── */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.90)"]}
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: H * 0.60 }}
        pointerEvents="none"
      />

      {/* ── Resolving / buffering indicator ── */}
      {videoState === "resolving" && (
        <View style={s.spinnerWrap} pointerEvents="none">
          <Feather name="loader" size={28} color="rgba(255,255,255,0.6)" />
        </View>
      )}

      {/* ── Right action column ── */}
      <View style={[s.actions, { bottom: bottomPad + 100 }]}>
        <ActionBtn
          icon="heart"
          label={fmtNum(item.likes + (item.liked ? 1 : 0))}
          active={item.liked}
          onPress={() => onLike(item.id)}
        />
        <ActionBtn
          icon="bookmark"
          label="Salvar"
          active={item.saved}
          onPress={() => onSave(item.id)}
        />
        <ActionBtn
          icon={shared ? "check" : "share-2"}
          label={shared ? "Copiado!" : "Partilhar"}
          color={shared ? "#4ade80" : "#fff"}
          onPress={handleShare}
        />
        <ActionBtn
          icon="info"
          label="Detalhes"
          onPress={() => onDetail(item)}
        />
        {/* Mute toggle — só mostra quando o vídeo está tocando (nativo apenas) */}
        {showNativeVideo && (
          <ActionBtn
            icon={muted ? "volume-x" : "volume-2"}
            label={muted ? "Som" : "Mudo"}
            onPress={toggleMute}
          />
        )}
      </View>

      {/* ── Bottom info ── */}
      <Animated.View
        style={[s.info, { bottom: bottomPad + 92, opacity: infoOp, transform: [{ translateY: infoY }] }]}
        pointerEvents="box-none"
      >
        {/* AI Scene badge */}
        <Animated.View style={[s.aiBadge, { transform: [{ scale: aiBadgeScale }] }]}>
          <LinearGradient colors={["#7c3aed", "#a855f7"]} style={s.aiBadgeInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Feather name="zap" size={10} color="#fff" />
            <Text style={s.aiBadgeText}>IA • {item.sceneLabel}</Text>
          </LinearGradient>
        </Animated.View>

        {/* Poster + info row */}
        <View style={s.infoRow}>
          <Image source={{ uri: item.poster ?? undefined }} style={s.miniPoster} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={s.infoTitle} numberOfLines={2}>{item.title}</Text>
            <View style={s.infoMeta}>
              <View style={s.genrePill}>
                <Text style={s.genreText}>{item.genre}</Text>
              </View>
              <Text style={s.metaText}>{item.year}</Text>
              <Feather name="star" size={11} color="#f59e0b" />
              <Text style={[s.metaText, { color: "#f59e0b" }]}>{item.rating}</Text>
            </View>
            <Text style={s.overview} numberOfLines={2}>{item.overview}</Text>
          </View>
        </View>

        {/* Watch full + clip info + Mais como este */}
        <View style={s.bottomRow}>
          <TouchableOpacity style={s.watchBtn} onPress={() => onDetail(item)} activeOpacity={0.85}>
            <Feather name="play-circle" size={15} color="#fff" />
            <Text style={s.watchBtnText}>Assistir completo</Text>
          </TouchableOpacity>

          {/* "Mais como este" — boosts this item's genres in the feed */}
          <TouchableOpacity
            style={[s.moreBtn, boosted && s.moreBtnActive]}
            activeOpacity={0.75}
            onPress={() => {
              if (boosted) return;
              setBoosted(true);
              onMoreLikeThis(item);
              setTimeout(() => setBoosted(false), 3000);
            }}
          >
            <Feather name={boosted ? "check" : "sliders"} size={13} color={boosted ? "#4ade80" : "#fff"} />
            <Text style={[s.moreBtnText, boosted && { color: "#4ade80" }]}>
              {boosted ? "Feed atualizado!" : "Mais como este"}
            </Text>
          </TouchableOpacity>

          {(showWebVideo || showNativeVideo) && (
            <View style={s.clipPill}>
              <Feather name="scissors" size={10} color="rgba(255,255,255,0.7)" />
              <Text style={s.clipText}>{item.clipDurationSeconds}s</Text>
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

// ─── TMDB genre ID → PT-BR name map ──────────────────────────────────────────
const TMDB_GENRE_NAMES: Record<number, string> = {
  // Movies
  28:    "Ação",
  12:    "Aventura",
  16:    "Animação",
  35:    "Comédia",
  80:    "Crime",
  99:    "Documentário",
  18:    "Drama",
  10751: "Família",
  14:    "Fantasia",
  36:    "História",
  27:    "Terror",
  10402: "Música",
  9648:  "Mistério",
  10749: "Romance",
  878:   "Ficção Científica",
  10770: "Telefilme",
  53:    "Suspense",
  10752: "Guerra",
  37:    "Faroeste",
  // TV extra
  10759: "Ação/Aventura",
  10762: "Infantil",
  10763: "Notícias",
  10764: "Reality",
  10765: "Sci-Fi/Fantasia",
  10766: "Novela",
  10767: "Talk Show",
  10768: "Guerra/Política",
};

// Short display names for the badge (space-constrained)
const GENRE_SHORT: Record<number, string> = {
  878:   "Sci-Fi",
  10749: "Romance",
  10751: "Família",
  10752: "Guerra",
  10759: "Ação/Av.",
  10765: "Sci-Fi/Fan.",
  10768: "Guerra/Pol.",
};

function genreName(id: number): string {
  return GENRE_SHORT[id] ?? TMDB_GENRE_NAMES[id] ?? String(id);
}

// Returns top-N genre names sorted by view count
function getTopGenreNames(prefs: Record<number, number>, n = 2): string[] {
  return Object.entries(prefs)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([id]) => genreName(Number(id)));
}

// ─── Genre preference store ───────────────────────────────────────────────────
// Tracks which genres the user has watched in Shorts (AsyncStorage).
// Updated every time a card is visible for 3+ seconds.
// Used to personalize the feed order via ?preferGenres= param.

const GENRE_PREFS_KEY = "netplay_shorts_genre_prefs_v1";

async function loadGenrePrefs(): Promise<Record<number, number>> {
  try {
    const raw = await AsyncStorage.getItem(GENRE_PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function recordGenreView(genreIds: number[]): Promise<void> {
  if (!genreIds.length) return;
  try {
    const prefs = await loadGenrePrefs();
    for (const id of genreIds) {
      prefs[id] = (prefs[id] ?? 0) + 1;
    }
    await AsyncStorage.setItem(GENRE_PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

function getTopGenreIds(prefs: Record<number, number>, n = 5): number[] {
  return Object.entries(prefs)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([id]) => Number(id));
}

// ─── Fetch shorts feed ────────────────────────────────────────────────────────

async function fetchShortsFeed(page = 1, preferGenres: number[] = []): Promise<{ items: ShortItem[]; personalized: boolean }> {
  // AbortSignal.timeout() crashes on Hermes — use AbortController+setTimeout
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const base = getApiBase();
    const genreParam = preferGenres.length > 0 ? `&preferGenres=${preferGenres.join(",")}` : "";
    const res = await fetch(`${base}/shorts/feed?page=${page}&limit=20${genreParam}`, {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error("feed error");
    const data = await res.json() as any;
    return {
      items: (data.items ?? []).map((item: any) => ({
        ...item,
        liked: false,
        likes: Math.floor(Math.random() * 9000) + 1000,
        saved: false,
      })),
      personalized: data.personalized === true,
    };
  } catch {
    clearTimeout(t);
    return { items: [], personalized: false };
  }
}

// ─── Trending genre fetch ─────────────────────────────────────────────────────

async function fetchTrendingGenre(genreId: number): Promise<{ genreName: string; items: TrendingGenreEntry[] }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/shorts/trending-genre?genreId=${genreId}&limit=12`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { genreName: "", items: [] };
    const data = await res.json() as any;
    return { genreName: data.genreName ?? "", items: data.items ?? [] };
  } catch {
    clearTimeout(t);
    return { genreName: "", items: [] };
  }
}

// ─── Trending Genre Card ──────────────────────────────────────────────────────
// Full-screen card rendered inside the vertical FlatList at position ~5.
// Shows a horizontal scrollable row of poster cards for the user's top genre.

function TrendingGenreCard({
  genreName: gName,
  genreId,
  items,
  onPress,
}: {
  genreName: string;
  genreId: number;
  items: TrendingGenreEntry[];
  onPress: (item: TrendingGenreEntry) => void;
}) {
  const BAR_COLOR = BAR_COLORS[0]; // use the genre's color slot

  return (
    <View style={tg.root}>
      {/* Blurred dark gradient background */}
      <LinearGradient
        colors={["#0a0010", "#100008", "#000"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Header */}
      <View style={tg.header}>
        <LinearGradient
          colors={["#7c3aed", "#e50914"]}
          style={tg.headerIcon}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Feather name="trending-up" size={16} color="#fff" />
        </LinearGradient>
        <View>
          <Text style={tg.headerTitle}>Trending em {gName}</Text>
          <Text style={tg.headerSub}>Os mais populares do seu gênero favorito</Text>
        </View>
      </View>

      {/* Horizontal poster grid */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={tg.scrollContent}
        style={tg.scroll}
      >
        {items.map((item, i) => (
          <TouchableOpacity
            key={item.id}
            style={tg.card}
            activeOpacity={0.85}
            onPress={() => onPress(item)}
          >
            <Image
              source={{ uri: item.poster ?? item.backdrop ?? "" }}
              style={tg.poster}
              contentFit="cover"
            />
            {/* Rating badge */}
            <View style={tg.ratingBadge}>
              <Feather name="star" size={9} color="#f59e0b" />
              <Text style={tg.ratingText}>{item.rating.toFixed(1)}</Text>
            </View>
            {/* Rank number */}
            <View style={tg.rankBadge}>
              <Text style={tg.rankText}>{i + 1}</Text>
            </View>
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.9)"]}
              style={tg.cardGrad}
            />
            <Text style={tg.cardTitle} numberOfLines={2}>{item.title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Swipe hint */}
      <View style={tg.swipeHint}>
        <Feather name="chevrons-down" size={18} color="rgba(255,255,255,0.3)" />
        <Text style={tg.swipeHintText}>Deslize para continuar os Shorts</Text>
      </View>
    </View>
  );
}

const tg = StyleSheet.create({
  root: {
    width: W, height: H,
    backgroundColor: "#000",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 20, paddingBottom: 24,
  },
  headerIcon: {
    width: 44, height: 44, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 2 },

  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 16, gap: 12 },

  card: { width: 130, borderRadius: 12, overflow: "hidden", backgroundColor: "#111" },
  poster: { width: 130, height: 190, borderRadius: 12 },
  cardGrad: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 70, borderRadius: 12,
  },
  cardTitle: {
    position: "absolute", bottom: 8, left: 7, right: 7,
    color: "#fff", fontSize: 11, fontWeight: "700",
  },
  ratingBadge: {
    position: "absolute", top: 7, right: 7,
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 8,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  ratingText: { color: "#f59e0b", fontSize: 10, fontWeight: "700" },
  rankBadge: {
    position: "absolute", top: 7, left: 7,
    backgroundColor: "rgba(229,9,20,0.85)", borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  rankText: { color: "#fff", fontSize: 11, fontWeight: "900" },

  swipeHint: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, marginTop: 28,
  },
  swipeHintText: { color: "rgba(255,255,255,0.3)", fontSize: 12 },
});

// ─── Shorts Report Modal ──────────────────────────────────────────────────────
// Shows a visual genre profile: bar chart, stats, top genre.
// Opened by tapping the "★ Gênero" badge in the Shorts header.

const BAR_COLORS = ["#e50914","#7c3aed","#3b82f6","#f59e0b","#22c55e","#ec4899","#06b6d4","#f97316","#8b5cf6","#10b981"];

function ShortsReportModal({
  visible,
  prefs,
  onClose,
  onReset,
}: {
  visible: boolean;
  prefs: Record<number, number>;
  onClose: () => void;
  onReset: () => void;
}) {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 24 : insets.top;

  // Build sorted genre list
  const entries = Object.entries(prefs)
    .map(([id, count]) => ({ id: Number(id), name: genreName(Number(id)), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const totalViews = Object.values(prefs).reduce((s, v) => s + v, 0);
  const maxCount = entries[0]?.count ?? 1;
  const topGenre = entries[0]?.name ?? "—";
  const genreCount = entries.length;

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={rm.backdrop}>
        <View style={[rm.sheet, { paddingTop: topPad + 8 }]}>

          {/* Header */}
          <View style={rm.header}>
            <View style={rm.headerLeft}>
              <LinearGradient colors={["#7c3aed","#e50914"]} style={rm.headerIcon} start={{x:0,y:0}} end={{x:1,y:1}}>
                <Feather name="bar-chart-2" size={14} color="#fff" />
              </LinearGradient>
              <View>
                <Text style={rm.headerTitle}>Perfil de Gosto</Text>
                <Text style={rm.headerSub}>Baseado nos seus Shorts assistidos</Text>
              </View>
            </View>
            <TouchableOpacity style={rm.closeBtn} onPress={onClose} activeOpacity={0.75}>
              <Feather name="x" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          {/* Stats row */}
          <View style={rm.statsRow}>
            <View style={rm.statCard}>
              <Text style={rm.statValue}>{totalViews}</Text>
              <Text style={rm.statLabel}>Visualizações</Text>
            </View>
            <View style={[rm.statCard, { borderColor: "#7c3aed" }]}>
              <Text style={[rm.statValue, { color: "#a78bfa" }]}>{topGenre}</Text>
              <Text style={rm.statLabel}>Gênero Favorito</Text>
            </View>
            <View style={[rm.statCard, { borderColor: "#3b82f6" }]}>
              <Text style={[rm.statValue, { color: "#60a5fa" }]}>{genreCount}</Text>
              <Text style={rm.statLabel}>Gêneros</Text>
            </View>
          </View>

          {/* Bar chart */}
          <ScrollView style={rm.chartScroll} showsVerticalScrollIndicator={false}>
            <Text style={rm.chartTitle}>Distribuição por Gênero</Text>
            {entries.map((entry, i) => {
              const pct = maxCount > 0 ? entry.count / maxCount : 0;
              const color = BAR_COLORS[i % BAR_COLORS.length];
              return (
                <View key={entry.id} style={rm.barRow}>
                  <Text style={rm.barLabel} numberOfLines={1}>{entry.name}</Text>
                  <View style={rm.barTrack}>
                    <View style={[rm.barFill, { width: `${Math.max(4, pct * 100)}%` as any, backgroundColor: color }]} />
                  </View>
                  <Text style={[rm.barCount, { color }]}>{entry.count}</Text>
                </View>
              );
            })}

            {entries.length === 0 && (
              <View style={{ alignItems: "center", paddingVertical: 32 }}>
                <Feather name="bar-chart-2" size={40} color="rgba(255,255,255,0.15)" />
                <Text style={{ color: "rgba(255,255,255,0.3)", marginTop: 12, fontSize: 14 }}>
                  Assista Shorts para construir seu perfil
                </Text>
              </View>
            )}

            {/* Reset button */}
            <TouchableOpacity
              style={rm.resetBtn}
              activeOpacity={0.8}
              onPress={() => { onReset(); onClose(); }}
            >
              <Feather name="refresh-ccw" size={15} color="#fff" />
              <Text style={rm.resetBtnText}>Redefinir preferências</Text>
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const rm = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0e0e14",
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "88%",
    borderTopWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 16,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 1 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },

  statsRow: {
    flexDirection: "row", gap: 10, paddingHorizontal: 20, marginBottom: 20,
  },
  statCard: {
    flex: 1, borderRadius: 12, borderWidth: 1, borderColor: "#e50914",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 12, alignItems: "center", gap: 3,
  },
  statValue: { color: "#fff", fontSize: 18, fontWeight: "800" },
  statLabel: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "600" },

  chartScroll: { paddingHorizontal: 20 },
  chartTitle: {
    color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "700",
    letterSpacing: 1, textTransform: "uppercase", marginBottom: 14,
  },
  barRow: {
    flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 10,
  },
  barLabel: {
    width: 88, color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "600",
  },
  barTrack: {
    flex: 1, height: 8, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 4 },
  barCount: { width: 28, fontSize: 12, fontWeight: "700", textAlign: "right" },

  resetBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "rgba(229,9,20,0.15)", borderWidth: 1, borderColor: "#e50914",
    borderRadius: 12, paddingVertical: 13, marginTop: 24,
  },
  resetBtnText: { color: "#e50914", fontSize: 14, fontWeight: "700" },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ShortsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [items, setItems] = useState<ShortItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Global mute state — one toggle applies to ALL cards
  const [globalMuted, setGlobalMuted] = useState(true);
  const toggleGlobalMute = useCallback(() => setGlobalMuted((m) => !m), []);
  // Personalization state
  const [genrePrefs, setGenrePrefs] = useState<Record<number, number>>({});
  const [isPersonalized, setIsPersonalized] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const loadFeed = useCallback(async (p = 1, overridePrefs?: Record<number, number>) => {
    if (p === 1) setLoading(true);
    else setLoadingMore(true);

    // Load genre preferences from AsyncStorage and pass to feed
    const prefs = overridePrefs ?? await loadGenrePrefs();
    const topGenres = getTopGenreIds(prefs, 5);
    const { items: newItems, personalized } = await fetchShortsFeed(p, topGenres);

    // On first page + personalized: inject a "Trending por Gênero" card at position 4
    let finalItems = newItems;
    if (p === 1 && personalized && topGenres.length > 0) {
      const topGenreId = topGenres[0];
      // Fetch trending in background — don't block first render
      fetchTrendingGenre(topGenreId).then(({ genreName: gName, items: tItems }) => {
        if (tItems.length === 0) return;
        const trendRow: ShortItem = {
          id: `trending-row-${topGenreId}`,
          isTrendingRow: true,
          trendingGenreId: topGenreId,
          trendingGenreName: gName,
          trendingItems: tItems,
          // Sentinel values — not used for playback
          tmdbId: 0, title: "", type: "movie",
          backdrop: null, poster: null, overview: "",
          year: 0, rating: 0, genre: "", genreIds: [],
          runtime: 0, startTimePct: 0, startTimeSeconds: 0,
          clipDurationSeconds: 0, sceneLabel: "",
          availableOnFlix2: false, liked: false, likes: 0, saved: false,
        };
        setItems((prev) => {
          // Insert at position 4 (after 4 real Shorts), skip if already present
          if (prev.some((it) => it.isTrendingRow)) return prev;
          const insertAt = Math.min(4, prev.length);
          return [...prev.slice(0, insertAt), trendRow, ...prev.slice(insertAt)];
        });
      });
    }

    setItems((prev) => p === 1 ? finalItems : [...prev, ...newItems]);
    setHasMore(newItems.length >= 20);
    setPage(p);
    if (p === 1) setIsPersonalized(personalized);

    if (p === 1) setLoading(false);
    else setLoadingMore(false);
  }, []);

  // Pull-to-refresh: clears genre preferences and reloads feed from scratch
  const clearPrefsAndRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await AsyncStorage.removeItem(GENRE_PREFS_KEY);
      setGenrePrefs({});
      setIsPersonalized(false);
      setVisibleIndex(0);
      await loadFeed(1, {});
    } finally {
      setRefreshing(false);
    }
  }, [loadFeed]);

  // Load genre prefs on mount (for header badge)
  useEffect(() => {
    loadGenrePrefs().then(setGenrePrefs);
  }, []);

  useEffect(() => { loadFeed(1); }, []);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    loadFeed(page + 1);
  }, [loadingMore, hasMore, page, loadFeed]);

  const onLike = useCallback((id: string) => {
    setItems((prev) => {
      const updated = prev.map((it) => {
        if (it.id !== id) return it;
        const isNowLiked = !it.liked;
        // Persist like/unlike to AsyncStorage (non-blocking)
        if (!it.isTrendingRow && it.tmdbId) {
          toggleShortsLike(
            { id: it.id, tmdbId: it.tmdbId, type: it.type, title: it.title, poster: it.poster },
            isNowLiked
          );
        }
        return { ...it, liked: isNowLiked };
      });
      return updated;
    });
  }, []);

  const onSave = useCallback((id: string) => {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, saved: !it.saved } : it));
  }, []);

  const onDetail = useCallback((item: ShortItem) => {
    router.push({
      pathname: "/detail",
      params: { type: item.type, id: String(item.tmdbId), title: item.title },
    });
  }, [router]);

  const onTrendingPress = useCallback((entry: TrendingGenreEntry) => {
    router.push({
      pathname: "/detail",
      params: { type: entry.type, id: String(entry.tmdbId), title: entry.title },
    });
  }, [router]);

  // "Mais como este" — heavily boost this item's genres (×5) then reload feed
  const onMoreLikeThis = useCallback(async (item: ShortItem) => {
    if (!item.genreIds?.length) return;
    // Boost each genre 5× for instant strong signal
    await recordGenreView([...item.genreIds, ...item.genreIds, ...item.genreIds, ...item.genreIds, ...item.genreIds]);
    const updated = await loadGenrePrefs();
    setGenrePrefs(updated);
    await loadFeed(1, updated);
    setVisibleIndex(0);
  }, [loadFeed]);

  // Record genre view + watch history after card is visible for 3s
  useEffect(() => {
    const item = items[visibleIndex];
    if (!item || item.isTrendingRow) return;
    if (!item.genreIds?.length && !item.tmdbId) return;
    const timer = setTimeout(async () => {
      if (item.genreIds?.length) {
        await recordGenreView(item.genreIds);
        const updated = await loadGenrePrefs();
        setGenrePrefs(updated);
      }
      // Record in watch history: progress = 3s / clipDuration, clamped 0.15..0.85
      const rawPct = item.clipDurationSeconds > 0 ? 3 / item.clipDurationSeconds : 0.4;
      const progress = Math.min(0.85, Math.max(0.15, rawPct));
      await recordShortsWatch(
        { id: item.id, tmdbId: item.tmdbId, type: item.type, title: item.title, poster: item.poster },
        progress
      );
    }, 3000);
    return () => clearTimeout(timer);
  }, [visibleIndex, items]);

  // Pre-fetch lookups for the next 10 items so video starts instantly when the card appears
  useEffect(() => {
    const targets = items.slice(visibleIndex + 1, visibleIndex + 11).filter(Boolean);
    targets.forEach((it) => prefetchLookup(it));
  }, [visibleIndex, items]);

  // On initial load, immediately prefetch the first 10 items
  useEffect(() => {
    if (items.length > 0) {
      items.slice(0, 10).forEach((it) => prefetchLookup(it));
    }
  }, [items.length > 0]);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 55 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        setVisibleIndex(viewableItems[0].index ?? 0);
      }
    }
  ).current;

  if (loading) {
    return (
      <View style={[s.root, { alignItems: "center", justifyContent: "center" }]}>
        <StatusBar style="light" />
        <View style={{ alignItems: "center", gap: 14 }}>
          <LinearGradient colors={["#7c3aed", "#e50914"]} style={s.loadingIcon}>
            <Feather name="zap" size={22} color="#fff" />
          </LinearGradient>
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "600" }}>
            IA selecionando as melhores cenas...
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
            Powered by TMDB + Flix 2.0
          </Text>
        </View>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[s.root, { alignItems: "center", justifyContent: "center" }]}>
        <StatusBar style="light" />
        <Feather name="scissors" size={48} color="rgba(255,255,255,0.2)" />
        <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 15, marginTop: 16 }}>
          Nenhum short disponível
        </Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* ── TikTok-style vertical feed ── */}
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={H}
        decelerationRate="fast"
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onEndReached={loadMore}
        onEndReachedThreshold={2}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={clearPrefsAndRefresh}
            tintColor={RED}
            colors={[RED]}
            progressBackgroundColor="#000"
          />
        }
        renderItem={({ item, index }) => {
          if (item.isTrendingRow) {
            return (
              <TrendingGenreCard
                genreName={item.trendingGenreName ?? ""}
                genreId={item.trendingGenreId ?? 0}
                items={item.trendingItems ?? []}
                onPress={onTrendingPress}
              />
            );
          }
          return (
            <ShortVideoCard
              item={item}
              isVisible={index === visibleIndex}
              muted={globalMuted}
              onToggleMute={toggleGlobalMute}
              onLike={onLike}
              onSave={onSave}
              onDetail={onDetail}
              onMoreLikeThis={onMoreLikeThis}
            />
          );
        }}
        getItemLayout={(_, index) => ({ length: H, offset: H * index, index })}
      />

      {/* ── Floating header ── */}
      <View style={[s.header, { paddingTop: topPad }]} pointerEvents="box-none">
        <View style={s.headerInner}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <LinearGradient colors={["#7c3aed", "#e50914"]} style={s.headerIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Feather name="zap" size={13} color="#fff" />
            </LinearGradient>
            <Text style={s.headerTitle}>SHORTS</Text>
            <View style={s.aiHeaderBadge}>
              <Text style={s.aiHeaderBadgeText}>IA</Text>
            </View>
            {isPersonalized && (() => {
              const names = getTopGenreNames(genrePrefs, 2);
              const label = names.length > 0 ? names.join(", ") : "Gosto";
              return (
                <TouchableOpacity
                  style={s.personalizedBadge}
                  activeOpacity={0.75}
                  onPress={() => setShowReport(true)}
                >
                  <Feather name="star" size={9} color="#fff" />
                  <Text style={s.personalizedBadgeText}>{label}</Text>
                  <Feather name="chevron-right" size={9} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              );
            })()}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <TouchableOpacity
              style={s.iconBtn}
              onPress={() => router.push("/buscar")}
              activeOpacity={0.75}
            >
              <Feather name="search" size={20} color="rgba(255,255,255,0.82)" />
            </TouchableOpacity>
            <ProfileAvatarButton />
          </View>
        </View>
      </View>

      {/* ── Scroll indicator dots ── */}
      <View style={[s.dots, { top: topPad + 64 }]} pointerEvents="none">
        {items.slice(0, Math.min(items.length, 8)).map((_, i) => (
          <View
            key={i}
            style={[s.dot, i === visibleIndex % Math.min(items.length, 8) && s.dotActive]}
          />
        ))}
      </View>

      {/* ── Genre profile report modal ── */}
      <ShortsReportModal
        visible={showReport}
        prefs={genrePrefs}
        onClose={() => setShowReport(false)}
        onReset={clearPrefsAndRefresh}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  // Header
  header: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
  },
  headerInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, paddingVertical: 6,
  },
  headerIcon: {
    width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center",
  },
  headerTitle: {
    color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: 2,
  },
  aiHeaderBadge: {
    backgroundColor: "#7c3aed", borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  aiHeaderBadgeText: {
    color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 1,
  },
  personalizedBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(229,9,20,0.85)", borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  personalizedBadgeText: {
    color: "#fff", fontSize: 9, fontWeight: "700", letterSpacing: 0.5,
  },
  iconBtn: {
    width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20,
  },

  // Loading
  loadingIcon: {
    width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center",
  },

  // Dots
  dots: {
    position: "absolute", right: 6, flexDirection: "column", gap: 4, alignItems: "center",
  },
  dot: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)",
  },
  dotActive: {
    backgroundColor: RED, height: 12, borderRadius: 3,
  },

  // Buffer progress bar
  bufferTrack: {
    position: "absolute", top: 0, left: 0, right: 0, height: 3,
    backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden",
  },
  bufferFill: {
    height: 3, backgroundColor: "#e50914", borderRadius: 2,
  },

  // Spinner
  spinnerWrap: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },

  // Right actions
  actions: {
    position: "absolute", right: 12,
    alignItems: "center", gap: 18,
  },
  actionBtn: { alignItems: "center", gap: 4 },
  actionLabel: {
    color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "700",
  },

  // AI scene badge
  aiBadge: {
    alignSelf: "flex-start", marginBottom: 6,
  },
  aiBadgeInner: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
  },
  aiBadgeText: {
    color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.3,
  },

  // Bottom info
  info: {
    position: "absolute", left: 0, right: 80, paddingHorizontal: 16, gap: 8,
  },
  infoRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  miniPoster: {
    width: 52, height: 76, borderRadius: 8,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)",
  },
  infoTitle: {
    color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: 0.2, marginBottom: 5,
  },
  infoMeta: {
    flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4,
  },
  genrePill: {
    backgroundColor: "rgba(229,9,20,0.85)", borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  genreText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  metaText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600" },
  overview: { color: "rgba(255,255,255,0.6)", fontSize: 12, lineHeight: 17 },

  // Bottom row
  bottomRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
  },
  watchBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: RED, borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 16,
  },
  watchBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  moreBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 12,
  },
  moreBtnActive: {
    backgroundColor: "rgba(74,222,128,0.18)",
  },
  moreBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  clipPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  clipText: {
    color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "600",
  },

});
