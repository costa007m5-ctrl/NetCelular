/**
 * flix2-player.tsx
 * Dedicated player for Flix2 / fontedecanais CDN content.
 *
 * KEY DESIGN:
 *  - Todos os CDNs no native (Android/iOS) → WebViewVideoPlayer (Chrome).
 *  - nixplay.lat URLs são resolvidas server-side via /api/stream/resolve-url:
 *    o servidor segue o redirect HEAD e devolve a URL fontedecanais HTTPS com token.
 *    O token é time-based (não IP-bound) → o dispositivo toca diretamente.
 *    Fallback: CF Worker se o resolve falhar.
 *  - cineveo.lat e fontedecanais direto → WebView sem intermediário.
 *  - Web: proxy (CORS bloqueia requests diretos de mídia no browser).
 *
 * Routing:
 *  native nixplay   → resolve-url API → fontedecanais direto (fallback: CF Worker)
 *  native cineveo   → WebViewVideoPlayer direto
 *  native fontedecanais → WebViewVideoPlayer direto
 *  web              → Replit proxy
 *
 * Flow:
 *  1. Receive rawFlix2Url
 *  2. native → setUseWebViewPlayer(true) + setVideoUrl(rawUrl)
 *     web    → setVideoUrl(proxiedUrl)
 *  3. WebViewVideoPlayer (Chrome HTML5 video) plays with full controls
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  Vibration,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { getApiBase, api } from "@/lib/api";
import { recordContentView } from "@/lib/view-tracker";
import { appLog } from "@/lib/app-logger";
import { getProxiedStreamUrl } from "@/lib/gdrive-index";
import { useAuth } from "@/lib/auth-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import { checkAndStartSession, heartbeatSession, endSession } from "@/lib/session-manager";
import { saveLocalProgress } from "@/hooks/useWatchProgress";
import WebViewVideoPlayer, { type WebViewVideoPlayerRef } from "@/components/WebViewVideoPlayer";
import StingOverlay from "@/components/StingOverlay";

let Video: any = null;
let ResizeMode: any = null;
try { const av = require("expo-av"); Video = av.Video; ResizeMode = av.ResizeMode; } catch {}

let WebView: any = null;
try { WebView = require("react-native-webview").WebView; } catch {}

let ScreenOrientation: any = null;
try { ScreenOrientation = require("expo-screen-orientation"); } catch {}

let NavBar: any = null;
try { NavBar = require("expo-navigation-bar"); } catch {}

const { width: W, height: H } = Dimensions.get("window");
const RED = "#e50914";
const TMDB_IMG = (path: string | null | undefined, size = "w780") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
const CF_WORKER_URL = "https://netplay-stream-proxy.netplay.workers.dev";
const AUTO_HIDE_MS = 4500;
const NEXT_EP_COUNTDOWN_S = 15;
const SKIP_INTRO_MAX_S = 90;
const SKIP_CREDITS_BEFORE_END_S = 180;
const SAVE_INTERVAL_MS = 15000;
const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;
const SLEEP_PRESETS = [15, 30, 45, 60, 90] as const;

/** Extrai um badge de qualidade reconhecível do label (ex: "Fonte 1080p" → "1080p"). */
function detectQualityLabel(label: string): string | null {
  if (!label) return null;
  const m = label.match(/\b(4[Kk]|2160p?|1080p?|720p?|480p?|360p?|SD|HD|FHD|UHD)\b/i);
  return m ? m[1].toUpperCase() : null;
}

interface Flix2Item {
  id: string;
  flix2Url: string;
  title: string;
  label: string;
  season: number | null;
  episode: number | null;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function ProgressText({ value }: { value: Animated.Value }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const id = value.addListener(({ value: v }) => setPct(Math.round(v)));
    return () => value.removeListener(id);
  }, [value]);
  return <>{pct}%</>;
}

function SeekFlash({ side, anim }: { side: "left" | "right"; anim: Animated.Value }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.seekFlash,
        side === "left"
          ? { left: 0, borderTopRightRadius: 80, borderBottomRightRadius: 80 }
          : { right: 0, borderTopLeftRadius: 80, borderBottomLeftRadius: 80 },
        { opacity: anim },
      ]}
    >
      <Feather name={side === "left" ? "rotate-ccw" : "rotate-cw"} size={30} color="#fff" />
      <Text style={styles.seekFlashText}>{side === "left" ? "-15s" : "+15s"}</Text>
    </Animated.View>
  );
}

export default function Flix2PlayerScreen() {
  const params = useLocalSearchParams<{
    flix2Url: string;
    title: string;
    episodeName?: string;
    season?: string;
    episode?: string;
    backdropPath?: string;
    posterPath?: string;
    tmdbId?: string;
    type?: string;
    flix2ItemsJson?: string;
    watchProgressRatio?: string;
    watchSeason?: string;
    watchEpisode?: string;
  }>();

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { user } = useAuth();
  // Use live window dimensions so the panel width is correct after rotation.
  const { width: winW } = useWindowDimensions();

  const title = params.title ?? "Assistindo";
  const episodeName = params.episodeName ?? "";
  const season = params.season ? Number(params.season) : null;
  const episode = params.episode ? Number(params.episode) : null;
  const backdropPath = params.backdropPath ?? null;
  const posterPath = params.posterPath ?? null;
  const tmdbId = params.tmdbId ? Number(params.tmdbId) : null;
  const contentType = (params.type ?? "movie") as "movie" | "tv";
  const isTV = contentType === "tv";
  const savedProgressRatio = params.watchProgressRatio ? Number(params.watchProgressRatio) : 0;

  const flix2Items: Flix2Item[] = (() => {
    try { return params.flix2ItemsJson ? JSON.parse(params.flix2ItemsJson) : []; } catch { return []; }
  })();

  // ── Core state ───────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [autoRetryCountdown, setAutoRetryCountdown] = useState<number | null>(null);
  const autoRetryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoSourceHeaders, setVideoSourceHeaders] = useState<Record<string, string> | undefined>(undefined);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);
  const [showTimeRemaining, setShowTimeRemaining] = useState(false);
  const [bufferedRatio, setBufferedRatio] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [videoResolution, setVideoResolution] = useState<string | null>(null);
  const [resolvedCdnType, setResolvedCdnType] = useState<string | null>(null);

  // ── Quality selector ─────────────────────────────────────────────────────────
  const [selectedQualityId, setSelectedQualityId] = useState<string>("current");
  const [showQualityPanel, setShowQualityPanel] = useState(false);

  // Quality options = flix2Items filtered by same episode (or all items for movies).
  // Each item with a different label represents a quality variant of the same content.
  const qualityOptions = isTV
    ? flix2Items.filter((i) => i.season === season && i.episode === episode)
    : flix2Items.filter((i) => i.season === null && i.episode === null);
  const hasMultipleQualities = qualityOptions.length > 1;

  // ── Advanced state ───────────────────────────────────────────────────────────
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [showSpeedPanel, setShowSpeedPanel] = useState(false);
  const [sleepTimerEnd, setSleepTimerEnd] = useState<number | null>(null);
  const [sleepMinutesLeft, setSleepMinutesLeft] = useState<number | null>(null);
  const [showSleepPanel, setShowSleepPanel] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [continuousPlay, setContinuousPlay] = useState(true);
  const [showNextEpCountdown, setShowNextEpCountdown] = useState(false);
  const [nextEpCountdownSec, setNextEpCountdownSec] = useState(0);
  const [isSpeedBoost, setIsSpeedBoost] = useState(false);
  const [sessionBlocked, setSessionBlocked] = useState<string | null>(null);

  // ── Episodes panel ───────────────────────────────────────────────────────────
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [panelSeason, setPanelSeason] = useState(season ?? 1);
  const [panelEpisodes, setPanelEpisodes] = useState<any[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const panelAnim = useRef(new Animated.Value(0)).current;
  // resolvedTmdbId: starts from the param; if it's 0 for a TV show we search
  // TMDB by title so the episode panel can load rich info.
  const [resolvedTmdbId, setResolvedTmdbId] = useState<number | null>(tmdbId ?? null);

  // ── Seek thumbnail — TMDB fallback (static, loaded on mount) ─────────────────
  const [seekThumbnailUrl, setSeekThumbnailUrl] = useState<string | null>(null);
  // Real video frame captured from the WebView during scrubbing (base64 JPEG)
  const [seekFrameUrl, setSeekFrameUrl] = useState<string | null>(null);
  const captureThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Similar movies panel (movies only, last 10 min) ───────────────────────────
  const [similarMovies, setSimilarMovies] = useState<any[]>([]);
  const [showSimilarPanel, setShowSimilarPanel] = useState(false);
  const [similarShowButtons, setSimilarShowButtons] = useState(false);
  const similarShownThisSession = useRef(false);
  const similarNeverShowRef = useRef(false);

  // ── Loading screen state ─────────────────────────────────────────────────────
  const loadProgress = useRef(new Animated.Value(0)).current;
  const fakeAnim = useRef<Animated.CompositeAnimation | null>(null);
  const [loadingTips, setLoadingTips] = useState<string[]>([]);
  const [tipIdx, setTipIdx] = useState(0);
  const tipTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [contentLogo, setContentLogo] = useState<string | null>(null);

  // ── Player mode ───────────────────────────────────────────────────────────────
  // expo-av (ExoPlayer) is used for most CDN types.
  // WebViewVideoPlayer is used for nixplay.lat / fontedecanais / cineveo on native:
  //   its Chromium engine follows HTTPS→HTTP redirects and allows mixed content,
  //   exactly like Expo Go — ExoPlayer blocks these even with usesCleartextTraffic.
  const [useWebViewPlayer, setUseWebViewPlayer] = useState(false);
  const [webViewBaseUrl, setWebViewBaseUrl] = useState("https://nixplay.lat");

  // ── Sting overlay ─────────────────────────────────────────────────────────────
  const [showSting, setShowSting] = useState(Platform.OS !== "web");

  // ── Resolver WebView (nixplay redirect resolution) ────────────────────────────
  // Android WebView's onShouldStartLoadWithRequest fires for cross-scheme
  // HTTPS→HTTP redirects — something fetch()/XHR cannot do on Android/Hermes.
  const [resolverUrl, setResolverUrl] = useState<string | null>(null);
  const resolverCallbackRef = useRef<((url: string) => void) | null>(null);
  const resolverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  // activeFlixUrlRef holds the URL currently being played — overridable by the
  // quality selector without triggering a full router navigation.
  const activeFlixUrlRef = useRef<string>(params.flix2Url ?? "");
  const videoRef = useRef<any>(null);
  const phaseRef = useRef<"loading" | "ready" | "error">("loading");
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekFlashLeft = useRef(new Animated.Value(0)).current;
  const seekFlashRight = useRef(new Animated.Value(0)).current;
  const seekBarWidthRef = useRef(0);
  const hasSeekedRef = useRef(false);
  const positionMsRef = useRef(0);
  const durationMsRef = useRef(0);
  const hasStartedPlayingRef = useRef(false);
  const lockAnim = useRef(new Animated.Value(1)).current;
  const sleepCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Episode panel: animates video right edge to shrink the video to the left half
  const videoRightAnim = useRef(new Animated.Value(0)).current;
  // Similar movies (movies only, last 10 min)
  const similarDismissedRef = useRef(false);
  const similarReminderRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Swipe-to-seek ─────────────────────────────────────────────────────────
  const [isSwipeSeeking, setIsSwipeSeeking] = useState(false);
  const [swipeSeekDisplay, setSwipeSeekDisplay] = useState(0);
  const swipeGestureActive = useRef(false);
  const swipeDeltaSec = useRef(0);
  const seekByRef = useRef<(ms: number) => void>(() => {});

  // ── Brightness (left 28% vertical swipe → black dim overlay) ───────────────
  const [brightnessLevel, setBrightnessLevel] = useState(0);
  const [showBrightnessHud, setShowBrightnessHud] = useState(false);
  const brightnessAtStart = useRef(0);
  const brightnessLevelRef = useRef(0);
  const brightnessHudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Volume (right 28% vertical swipe) ──────────────────────────────────────
  const [volumeLevel, setVolumeLevel] = useState(1.0);
  const [showVolumeHud, setShowVolumeHud] = useState(false);
  const volumeAtStart = useRef(1.0);
  const volumeLevelRef = useRef(1.0);
  const volumeHudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const progress = durationMs > 0 ? positionMs / durationMs : 0;
  const positionSec = Math.floor(positionMs / 1000);
  const durationSec = Math.floor(durationMs / 1000);
  const remainingSec = durationSec - positionSec;
  const displayPos = isScrubbing ? scrubPosition : positionMs;
  const displayProgress = durationMs > 0 ? displayPos / durationMs : 0;
  const showSkipIntro = phase === "ready" && positionSec >= 5 && positionSec <= SKIP_INTRO_MAX_S && isTV;
  const showSkipCredits = phase === "ready" && durationSec > 0 && remainingSec > 0 && remainingSec <= SKIP_CREDITS_BEFORE_END_S;

  // ── Haptic ──────────────────────────────────────────────────────────────────
  const haptic = useCallback((pattern: number | number[] = 40) => {
    try { Vibration.vibrate(pattern); } catch {}
  }, []);

  // ── Controls auto-hide ──────────────────────────────────────────────────────
  const showControls = useCallback(() => {
    if (isLocked) return;
    setControlsVisible(true);
    Animated.timing(lockAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(lockAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start(() =>
        setControlsVisible(false)
      );
    }, AUTO_HIDE_MS);
  }, [isLocked, lockAnim]);

  // ── Orientation ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web") {
      try { ScreenOrientation?.lockAsync(ScreenOrientation?.OrientationLock?.LANDSCAPE_LEFT); } catch {}
      if (Platform.OS === "android") {
        try { NavBar?.setVisibilityAsync("hidden"); NavBar?.setBehaviorAsync("overlay-swipe"); } catch {}
      }
    }
    return () => {
      try { ScreenOrientation?.lockAsync(ScreenOrientation?.OrientationLock?.PORTRAIT_UP); } catch {}
      if (Platform.OS === "android") {
        try { NavBar?.setVisibilityAsync("visible"); } catch {}
      }
    };
  }, []);

  // ── Session management ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    checkAndStartSession(user.id, user.role).then((result) => {
      if (result !== "ok") setSessionBlocked(result as any);
    });
    const hbInterval = setInterval(heartbeatSession, 20000);
    return () => { clearInterval(hbInterval); endSession(); };
  }, [user?.id]);

  // ── TMDB content logo ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tmdbId) return;
    const ctrl = new AbortController();
    fetch(
      `https://api.themoviedb.org/3/${contentType}/${tmdbId}/images?api_key=${TMDB_KEY}&include_image_language=pt,en,null`,
      { signal: ctrl.signal }
    )
      .then((r) => r.json())
      .then((data) => {
        const logos = data?.logos ?? [];
        const best = logos.find((l: any) => l.iso_639_1 === "pt") ?? logos.find((l: any) => l.iso_639_1 === "en") ?? logos[0];
        if (best?.file_path) setContentLogo(`https://image.tmdb.org/t/p/w300${best.file_path}`);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [tmdbId, contentType]);

  // ── Seek thumbnail — fetch TMDB episode still (TV) or use backdrop (movie) ────
  // For TV: GET /tv/{id}/season/{s}/episode/{e} and grab still_path.
  // For movie: use backdropPath directly.
  // Result is stored in seekThumbnailUrl and shown during scrubbing.
  useEffect(() => {
    // For movies: use the backdrop/poster immediately — no fetch needed.
    if (!isTV) {
      const fallback = backdropPath
        ? `https://image.tmdb.org/t/p/w780${backdropPath}`
        : posterPath
        ? `https://image.tmdb.org/t/p/w342${posterPath}`
        : null;
      setSeekThumbnailUrl(fallback);
      return;
    }
    // For TV: try to fetch the current episode's still image.
    if (!tmdbId || season == null || episode == null) {
      setSeekThumbnailUrl(
        backdropPath ? `https://image.tmdb.org/t/p/w780${backdropPath}` : null
      );
      return;
    }
    const ctrl = new AbortController();
    fetch(
      `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}/episode/${episode}?api_key=${TMDB_KEY}`,
      { signal: ctrl.signal }
    )
      .then((r) => r.json())
      .then((data) => {
        if (data?.still_path) {
          setSeekThumbnailUrl(`https://image.tmdb.org/t/p/w780${data.still_path}`);
        } else {
          setSeekThumbnailUrl(
            backdropPath ? `https://image.tmdb.org/t/p/w780${backdropPath}` : null
          );
        }
      })
      .catch(() => {
        setSeekThumbnailUrl(
          backdropPath ? `https://image.tmdb.org/t/p/w780${backdropPath}` : null
        );
      });
    return () => ctrl.abort();
  }, [tmdbId, isTV, season, episode, backdropPath, posterPath]);

  // ── Similar movies fetch (movies only) — used by the "watch next" panel ──────
  useEffect(() => {
    if (isTV || !tmdbId) return;
    const ctrl = new AbortController();
    fetch(
      `https://api.themoviedb.org/3/movie/${tmdbId}/similar?api_key=${TMDB_KEY}&language=pt-BR&page=1`,
      { signal: ctrl.signal }
    )
      .then((r) => r.json())
      .then((data) => {
        const results = (data?.results ?? []).filter((m: any) => m.poster_path || m.backdrop_path);
        setSimilarMovies(results.slice(0, 10));
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [tmdbId, isTV]);

  // ── Similar panel trigger — show when 10 min remain in a movie ───────────────
  useEffect(() => {
    if (isTV || phase !== "ready" || durationSec === 0 || similarNeverShowRef.current) return;
    if (remainingSec > 0 && remainingSec <= 600 && !showSimilarPanel && !similarShownThisSession.current) {
      similarShownThisSession.current = true;
      setSimilarShowButtons(false);
      setShowSimilarPanel(true);
    }
  }, [remainingSec, isTV, phase, durationSec, showSimilarPanel]);

  // ── Similar panel dismiss handlers ────────────────────────────────────────────
  const dismissSimilarPanel = useCallback((neverShow: boolean) => {
    setShowSimilarPanel(false);
    if (neverShow) {
      similarNeverShowRef.current = true;
      if (similarReminderRef.current) { clearTimeout(similarReminderRef.current); similarReminderRef.current = null; }
      return;
    }
    // Schedule re-show in 1.5 min with action buttons
    if (similarReminderRef.current) clearTimeout(similarReminderRef.current);
    similarReminderRef.current = setTimeout(() => {
      if (!similarNeverShowRef.current) {
        setSimilarShowButtons(true);
        setShowSimilarPanel(true);
      }
    }, 90000);
  }, []);

  // ── TMDB tips ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tmdbId) return;
    const ctrl = new AbortController();
    fetch(
      `https://api.themoviedb.org/3/${contentType}/${tmdbId}?api_key=${TMDB_KEY}&language=pt-BR&append_to_response=credits`,
      { signal: ctrl.signal }
    )
      .then((r) => r.json())
      .then((details) => {
        const tips: string[] = [];
        if (details.tagline) tips.push(`"${details.tagline}"`);
        if (details.vote_average > 0) tips.push(`⭐ ${details.vote_average.toFixed(1)} de 10 — ${(details.vote_count ?? 0).toLocaleString("pt-BR")} avaliações`);
        const genres = (details.genres ?? []).slice(0, 3).map((g: any) => g.name).join(" · ");
        if (genres) tips.push(`Gênero: ${genres}`);
        if (contentType === "movie" && details.runtime) tips.push(`Duração: ${Math.floor(details.runtime / 60)}h ${details.runtime % 60}min`);
        if (contentType === "tv" && details.number_of_seasons) tips.push(`${details.number_of_seasons} temporada${details.number_of_seasons > 1 ? "s" : ""} · ${details.number_of_episodes ?? 0} episódios`);
        const cast = (details.credits?.cast ?? []).slice(0, 3).map((c: any) => c.name).join(", ");
        if (cast) tips.push(`Com ${cast}`);
        if (details.overview) tips.push(details.overview.length > 130 ? details.overview.slice(0, 130) + "…" : details.overview);
        if (tips.length > 0) setLoadingTips(tips);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [tmdbId, contentType]);

  // ── Tip rotation ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loadingTips.length === 0 || phase !== "loading") {
      if (tipTimerRef.current) { clearInterval(tipTimerRef.current); tipTimerRef.current = null; }
      return;
    }
    setTipIdx(0);
    tipTimerRef.current = setInterval(() => setTipIdx((i) => (i + 1) % loadingTips.length), 3500);
    return () => { if (tipTimerRef.current) { clearInterval(tipTimerRef.current); tipTimerRef.current = null; } };
  }, [loadingTips, phase]);

  // ── Load video URL ───────────────────────────────────────────────────────────
  const loadVideoUrl = useCallback(async () => {
    // Use the quality-overridden URL if set, otherwise fall back to the route param.
    const rawFlix2Url = activeFlixUrlRef.current || params.flix2Url;
    if (!rawFlix2Url) { setPhase("error"); setErrorMsg("URL não especificada"); return; }

    phaseRef.current = "loading";
    setPhase("loading");
    setVideoUrl(null);
    setVideoSourceHeaders(undefined);
    setUseWebViewPlayer(false);
    setWebViewBaseUrl("https://nixplay.lat");
    setIsPlaying(false);
    setIsBuffering(false);
    hasStartedPlayingRef.current = false;
    setPositionMs(0);
    setDurationMs(0);
    hasSeekedRef.current = false;
    setVideoResolution(null);
    setResolvedCdnType(null);

    fakeAnim.current?.stop();
    loadProgress.setValue(0);
    fakeAnim.current = Animated.timing(loadProgress, { toValue: 80, duration: 6000, useNativeDriver: false });
    fakeAnim.current.start();

    // Browser UA + Referer used for all direct CDN requests
    const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const FLIX2_HEADERS = {
      "User-Agent": BROWSER_UA,
      "Referer": "https://nixplay.lat/",
      "Origin": "https://nixplay.lat",
    };
    const TERABOX_HOSTS = ["terabox.com", "1024terabox.com", "teraboxapp.com", "1024tera.com", "4funbox.com"];
    const isTeraboxUrl = (u: string) => TERABOX_HOSTS.some((h) => u.includes(h));
    // Direct CDN URLs (hubby.cx Xtream Codes or fontedecanais) — play without redirect
    const isFonteUrl = (u: string) => ["72yrci50ppqp71.com", "fontedecanais.me", "hubby.cx"].some((r) => u.includes(r));
    // Fontedecanais suporta HTTPS:443 — upgrade http:// com :80 → https:// sem porta.
    const fonteToHttps = (u: string) =>
      u.startsWith("http://")
        ? u.replace(/^http:\/\//, "https://").replace(/:80(\/|$|\?)/, (_, s: string) => s ?? "")
        : u;
    const isCineveoUrl = (u: string) => u.includes("cineveo.lat");
    const isHubbyCx = (u: string) => u.includes("hubby.cx");
    // nixplay.lat direct MP4/HLS URLs (e.g. /movie/..., /series/...) — their own server,
    // no Cloudflare proxy, ExoPlayer can reach it directly without custom headers.
    const isNixplayDirect = (u: string) => {
      try { return new URL(u).hostname === "nixplay.lat"; } catch { return false; }
    };

    appLog.info("player.flix2", "Iniciando reprodução direta", {
      rawUrl: rawFlix2Url?.slice(0, 120),
      platform: Platform.OS,
      title,
      tmdbId,
      season: season ?? null,
      episode: episode ?? null,
      retryCount,
    });

    try {
      // ── Routing rules (APK/native) ────────────────────────────────────────────
      //
      //  nixplay.lat  → CF Worker
      //    O nixplay retorna 302 para http://fontedecanais (HTTP, não HTTPS).
      //    ExoPlayer bloqueia HTTPS→HTTP mesmo com usesCleartextTraffic.
      //    WebViewVideoPlayer também falha no APK: o token gerado fica vinculado
      //    ao IP do dispositivo, e a CDN fontedecanais bloqueia IPs de celular.
      //    Solução: CF Worker resolve o redirect — token fica vinculado ao IP do
      //    Cloudflare, Worker faz proxy do stream com o mesmo IP → CDN aceita.
      //    IMPORTANTE: passar a URL nixplay.lat (não a CDN já resolvida), para que
      //    o token seja gerado para o IP do Worker, não do servidor Replit.
      //
      //  cineveo.lat  → CF Worker (Referer/Origin precisam ser setados server-side)
      //
      //  fontedecanais direct URL → play direto com headers de browser
      //    (URL já resolvida, token não é IP-bound nesse caso)
      //
      //  web → proxy (CORS bloqueia requests diretos do browser)

      if (Platform.OS === "web") {
        // Web: browser não pode setar Referer/Origin em requests de mídia → proxy
        // nixplay.lat bloqueia IPs de datacenter (Replit) → usar CF Worker que tem IP diferente
        let webUrl: string;
        if (isNixplayDirect(rawFlix2Url)) {
          // nixplay.lat redirects to fontedecanais which blocks datacenter IPs (Replit).
          // CF Worker has a different outbound IP → use it to resolve and proxy.
          webUrl = `${CF_WORKER_URL}/?url=${encodeURIComponent(rawFlix2Url)}`;
          appLog.info("player.flix2", "Reprodução via CF Worker (web + nixplay)", {
            proxyUrl: webUrl.slice(0, 80),
          });
        } else {
          // hubby.cx direct URLs, fontedecanais, cineveo → server proxy handles CORS + Range.
          webUrl = getProxiedStreamUrl(rawFlix2Url);
          if (!webUrl || webUrl === rawFlix2Url) {
            throw new Error("Servidor de proxy não disponível. Verifique a conexão.");
          }
          appLog.info("player.flix2", "Reprodução via proxy (web)", {
            proxyUrl: webUrl.slice(0, 80),
          });
        }
        setResolvedCdnType("flix2");
        setVideoUrl(webUrl);
      } else {
        // Nativo (Android/iOS): WebViewVideoPlayer para todos os CDNs.
        //
        // nixplay.lat → SEMPRE via CF Worker (URL HTTPS limpa para o WebView)
        //   O nixplay redireciona para http://fontedecanais (HTTP).
        //   Android WebView em APK de produção bloqueia <video> HTTPS→HTTP mesmo com
        //   mixedContentMode="always" → MEDIA_ELEMENT_ERROR: Format error.
        //   Fix definitivo: CF Worker resolve o redirect server-side e serve o stream
        //   como HTTPS. WebView recebe URL HTTPS do Worker → sem mixed content → funciona.
        //
        // cineveo.lat e fontedecanais direct → WebView direto (já são HTTPS, sem redirect HTTP)
        //
        // Chars especiais como @@ na URL são tratados nativamente pelo Chrome.

        let playerUrl = rawFlix2Url;
        let cdnLabel = "flix2";

        if (isNixplayDirect(rawFlix2Url) && WebView) {
          // nixplay.lat → resolver redirect usando o IP do DISPOSITIVO via WebView oculto.
          //
          // Por que dispositivo e não servidor/CF Worker?
          //   nixplay.lat bloqueia IPs de datacenter (Cloudflare, Replit) com 403/timeout.
          //   O dispositivo tem IP residencial/móvel que o nixplay aceita.
          //   onShouldStartLoadWithRequest do Android WebView dispara para redirects
          //   HTTPS→HTTP cross-scheme que fetch()/XHR não conseguem seguir no Hermes.
          //   Capturamos a URL fontedecanais real antes do WebView carregá-la.
          //
          // A URL capturada pode ser HTTP — WebViewVideoPlayer com mixedContentMode="always"
          // e v.src definido diretamente (sem redirect no elemento video) aceita HTTP.
          let capturedCdnUrl: string | null = null;
          try {
            capturedCdnUrl = await new Promise<string>((resolve, reject) => {
              resolverCallbackRef.current = resolve;
              resolverTimerRef.current = setTimeout(() => {
                resolverCallbackRef.current = null;
                reject(new Error("timeout"));
              }, 10_000);
              setResolverUrl(rawFlix2Url);
            });
          } catch {
            // timeout → tenta server-side como segundo nível
          } finally {
            if (resolverTimerRef.current) { clearTimeout(resolverTimerRef.current); resolverTimerRef.current = null; }
            setResolverUrl(null);
          }

          if (capturedCdnUrl) {
            // Dispositivo resolveu o redirect — upgrade http→https (fontedecanais:443)
            playerUrl = fonteToHttps(capturedCdnUrl);
            cdnLabel = "fontedecanais";
            setWebViewBaseUrl("https://nixplay.lat");
            appLog.info("player.flix2", "nixplay → CDN resolvido pelo dispositivo", {
              cdnUrl: playerUrl.slice(0, 100),
            });
          } else {
            // Nível 2: servidor resolve (funciona se nixplay não bloquear o IP do servidor)
            let serverResolved = false;
            try {
              const apiBase = await getApiBase();
              const resolveCtrl = new AbortController();
              const resolveTimeout = setTimeout(() => resolveCtrl.abort(), 8_000);
              const resolveResp = await fetch(
                `${apiBase}/stream/resolve-url?url=${encodeURIComponent(rawFlix2Url)}`,
                { signal: resolveCtrl.signal }
              );
              clearTimeout(resolveTimeout);
              if (resolveResp.ok) {
                const data = await resolveResp.json();
                if (data.url && data.url !== rawFlix2Url && isFonteUrl(data.url)) {
                  playerUrl = fonteToHttps(data.url);
                  cdnLabel = "fontedecanais";
                  setWebViewBaseUrl("https://nixplay.lat");
                  serverResolved = true;
                  appLog.info("player.flix2", "nixplay → fontedecanais via servidor", {
                    resolved: playerUrl.slice(0, 100),
                  });
                }
              }
            } catch {}
            if (!serverResolved) {
              // Nível 3 (último fallback): CF Worker
              playerUrl = `${CF_WORKER_URL}/?url=${encodeURIComponent(rawFlix2Url)}`;
              cdnLabel = "nixplay-cf";
              setWebViewBaseUrl(CF_WORKER_URL);
            }
          }
        } else if (isHubbyCx(rawFlix2Url) && WebView) {
          // hubby.cx → 302 para fontedecanais — resolve device-side via WebView oculto
          // (igual ao nixplay: IP do device tem acesso, servidor/datacenter é bloqueado)
          let capturedCdnUrl: string | null = null;
          try {
            capturedCdnUrl = await new Promise<string>((resolve, reject) => {
              resolverCallbackRef.current = resolve;
              resolverTimerRef.current = setTimeout(() => {
                resolverCallbackRef.current = null;
                reject(new Error("timeout"));
              }, 10_000);
              setResolverUrl(rawFlix2Url);
            });
          } catch {
            // timeout → tenta server-side como segundo nível
          } finally {
            if (resolverTimerRef.current) { clearTimeout(resolverTimerRef.current); resolverTimerRef.current = null; }
            setResolverUrl(null);
          }

          if (capturedCdnUrl) {
            playerUrl = fonteToHttps(capturedCdnUrl);
            cdnLabel = "fontedecanais";
            setWebViewBaseUrl("https://hubby.cx");
            appLog.info("player.flix2", "hubby.cx → CDN resolvido pelo dispositivo", {
              cdnUrl: playerUrl.slice(0, 100),
            });
          } else {
            // Nível 2: check-link server-side — usa redirect:"manual" e retorna location
            // (o servidor faz HEAD ao hubby.cx e captura o 302 → URL fontedecanais com token)
            let serverResolved = false;
            try {
              const apiBase = await getApiBase();
              const ctrl = new AbortController();
              const tid = setTimeout(() => ctrl.abort(), 8_000);
              const resp = await fetch(
                `${apiBase}/admin/check-link?url=${encodeURIComponent(rawFlix2Url)}`,
                { signal: ctrl.signal }
              );
              clearTimeout(tid);
              if (resp.ok) {
                const data = await resp.json();
                if (data.location && data.location !== rawFlix2Url) {
                  // URL fontedecanais — upgrade http→https (porta 443 funciona)
                  playerUrl = fonteToHttps(data.location);
                  cdnLabel = "fontedecanais";
                  setWebViewBaseUrl("https://hubby.cx");
                  serverResolved = true;
                  appLog.info("player.flix2", "hubby.cx → fontedecanais via check-link", {
                    resolved: playerUrl.slice(0, 100),
                  });
                }
              }
            } catch {}
            if (!serverResolved) {
              // Último recurso: API stream proxy
              const apiBase2 = await getApiBase();
              playerUrl = `${apiBase2}/stream/proxy?url=${encodeURIComponent(rawFlix2Url)}`;
              cdnLabel = "hubby-proxy";
              setWebViewBaseUrl(apiBase2.replace(/\/api$/, ""));
            }
          }
        } else if (isHubbyCx(rawFlix2Url)) {
          // Web ou sem WebView — resolve redirect via check-link; fallback: stream proxy
          const apiBase3 = await getApiBase();
          let resolvedForWeb = false;
          try {
            const ctrl3 = new AbortController();
            setTimeout(() => ctrl3.abort(), 8_000);
            const r3 = await fetch(`${apiBase3}/admin/check-link?url=${encodeURIComponent(rawFlix2Url)}`, { signal: ctrl3.signal });
            if (r3.ok) {
              const d3 = await r3.json();
              if (d3.location && d3.location !== rawFlix2Url) {
                playerUrl = d3.location;
                cdnLabel = "fontedecanais";
                setWebViewBaseUrl("https://hubby.cx");
                resolvedForWeb = true;
              }
            }
          } catch {}
          if (!resolvedForWeb) {
            playerUrl = `${apiBase3}/stream/proxy?url=${encodeURIComponent(rawFlix2Url)}`;
            cdnLabel = "hubby-proxy";
            setWebViewBaseUrl(apiBase3.replace(/\/api$/, ""));
          }
        } else if (isCineveoUrl(rawFlix2Url)) {
          cdnLabel = "cineveo";
          setWebViewBaseUrl("https://cineveo.lat");
        } else if (isFonteUrl(rawFlix2Url)) {
          // URL direta fontedecanais — upgrade http→https (porta 443 funciona)
          playerUrl = fonteToHttps(rawFlix2Url);
          cdnLabel = "fontedecanais";
          setWebViewBaseUrl("https://nixplay.lat");
        }

        appLog.info("player.flix2", `Reprodução via WebView Chrome (${cdnLabel})`, {
          url: playerUrl?.slice(0, 100),
          platform: Platform.OS,
        });
        setResolvedCdnType(cdnLabel);
        setUseWebViewPlayer(true);
        setVideoUrl(playerUrl);
      }
    } catch (e: any) {
      fakeAnim.current?.stop();
      const errMsg = e.message ?? "Erro ao carregar vídeo";
      appLog.error("player.flix2", `Falha ao carregar stream: ${errMsg}`, {
        rawUrl: rawFlix2Url?.slice(0, 120),
        error: errMsg,
        platform: Platform.OS,
        title,
        tmdbId,
        retryCount,
      });
      setPhase("error");
      setErrorMsg(errMsg);
    }
  }, [params.flix2Url]);

  // ── Trigger load on mount / URL change ──────────────────────────────────────
  useEffect(() => {
    setRetryCount(0);
    setAutoRetryCountdown(null);
    if (autoRetryTimerRef.current) { clearInterval(autoRetryTimerRef.current); autoRetryTimerRef.current = null; }
    loadVideoUrl();
  }, [params.flix2Url]);

  // ── Auto-retry on error ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === "error" && retryCount === 0) {
      setAutoRetryCountdown(5);
      autoRetryTimerRef.current = setInterval(() => {
        setAutoRetryCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(autoRetryTimerRef.current!);
            autoRetryTimerRef.current = null;
            setRetryCount(1);
            loadVideoUrl();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (phase !== "error") {
      if (autoRetryTimerRef.current) { clearInterval(autoRetryTimerRef.current); autoRetryTimerRef.current = null; }
      setAutoRetryCountdown(null);
    }
    return () => { if (autoRetryTimerRef.current) { clearInterval(autoRetryTimerRef.current); autoRetryTimerRef.current = null; } };
  }, [phase, retryCount]);

  // ── Transition to ready ──────────────────────────────────────────────────────
  const transitionToReady = useCallback((durationMillis = 0) => {
    if (phaseRef.current !== "loading") return;
    phaseRef.current = "ready";
    setDurationMs(durationMillis);
    durationMsRef.current = durationMillis;
    fakeAnim.current?.stop();
    Animated.timing(loadProgress, { toValue: 100, duration: 400, useNativeDriver: false }).start(() => {
      setPhase("ready");
      setIsPlaying(true);
      showControls();
      if (!hasSeekedRef.current && savedProgressRatio > 0.02 && durationMillis > 0) {
        hasSeekedRef.current = true;
        const seekMs = Math.round(savedProgressRatio * durationMillis);
        setTimeout(() => { videoRef.current?.setPositionAsync(seekMs).catch(() => {}); }, 600);
      }
    });
  }, [savedProgressRatio, showControls]);

  // ── Episode navigation ───────────────────────────────────────────────────────
  const getNextEpisodeItem = useCallback((): Flix2Item | null => {
    if (!isTV || season == null || episode == null) return null;
    const sortedEps = flix2Items.filter((i) => i.season === season).sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
    const idx = sortedEps.findIndex((i) => i.episode === episode);
    const next = sortedEps[idx + 1];
    if (next) return next;
    const nextSeasonNum = season + 1;
    return flix2Items.filter((i) => i.season === nextSeasonNum).sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0))[0] ?? null;
  }, [season, episode, flix2Items, isTV]);

  const getPrevEpisodeItem = useCallback((): Flix2Item | null => {
    if (!isTV || season == null || episode == null) return null;
    const sortedEps = flix2Items.filter((i) => i.season === season).sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
    const idx = sortedEps.findIndex((i) => i.episode === episode);
    if (idx > 0) return sortedEps[idx - 1];
    const prevSeasonNum = season - 1;
    if (prevSeasonNum < 1) return null;
    const prevSeasonEps = flix2Items.filter((i) => i.season === prevSeasonNum).sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
    return prevSeasonEps[prevSeasonEps.length - 1] ?? null;
  }, [season, episode, flix2Items, isTV]);

  const goToEpisode = useCallback((item: Flix2Item) => {
    haptic();
    setShowEpisodes(false);
    Animated.timing(panelAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start();
    router.replace({
      pathname: "/flix2-player",
      params: {
        flix2Url: item.flix2Url,
        title,
        episodeName: item.label,
        season: String(item.season ?? ""),
        episode: String(item.episode ?? ""),
        backdropPath: backdropPath ?? "",
        posterPath: posterPath ?? "",
        tmdbId: String(tmdbId ?? ""),
        type: contentType,
        flix2ItemsJson: params.flix2ItemsJson ?? "",
        watchSeason: params.watchSeason ?? "",
        watchEpisode: params.watchEpisode ?? "",
      },
    });
  }, [title, backdropPath, posterPath, tmdbId, contentType, params.flix2ItemsJson]);

  const goToNextEpisode = useCallback(() => {
    if (!isTV) { router.back(); return; }
    const next = getNextEpisodeItem();
    if (next) goToEpisode(next);
    else router.back();
  }, [isTV, getNextEpisodeItem, goToEpisode]);

  const goToPrevEpisode = useCallback(() => {
    const prev = getPrevEpisodeItem();
    if (prev) goToEpisode(prev);
  }, [getPrevEpisodeItem, goToEpisode]);

  // ── Episode panel ────────────────────────────────────────────────────────────
  const openEpisodesPanel = useCallback(() => {
    setShowEpisodes(true);
    setPanelSeason(season ?? 1);
    Animated.parallel([
      Animated.spring(panelAnim, { toValue: 1, useNativeDriver: false, tension: 70, friction: 12 }),
      Animated.spring(videoRightAnim, { toValue: winW * 0.5, useNativeDriver: false, tension: 70, friction: 12 }),
    ]).start();
    showControls();
  }, [season, showControls]);

  const closeEpisodesPanel = useCallback(() => {
    Animated.parallel([
      Animated.spring(panelAnim, { toValue: 0, useNativeDriver: false, tension: 80, friction: 14 }),
      Animated.spring(videoRightAnim, { toValue: 0, useNativeDriver: false, tension: 80, friction: 14 }),
    ]).start(() => setShowEpisodes(false));
  }, []);

  // When tmdbId is 0 (Flix 2.0 item without a TMDB ID in the catalog),
  // use the /flix2/lookup endpoint — it has year-qualified title matching,
  // so "One Piece 1999" won't be confused with "One Piece 2023 (Netflix)".
  useEffect(() => {
    if (!isTV) return;
    if (tmdbId && tmdbId > 0) { setResolvedTmdbId(tmdbId); return; }
    if (!title) return;
    let cancelled = false;
    getApiBase().then((apiBase) => {
      return fetch(
        `${apiBase}/api/flix2/lookup?title=${encodeURIComponent(title)}&type=serie`,
        { signal: AbortSignal.timeout ? undefined : undefined }
      ).then((r) => r.json());
    }).then((fi: any) => {
      if (!cancelled && fi?.tmdb_id && Number(fi.tmdb_id) > 0) {
        setResolvedTmdbId(Number(fi.tmdb_id));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [tmdbId, title, isTV]);

  // Pre-fetch TMDB episodes via server proxy — same path used by the detail screen.
  // Eager on mount so names/stills are ready when the panel opens.
  // Re-runs when the season tab or resolved TMDB ID changes.
  useEffect(() => {
    if (!resolvedTmdbId || !isTV) return;
    let cancelled = false;
    setPanelLoading(true);
    api.tmdb.tvSeason(resolvedTmdbId, panelSeason)
      .then((data: any) => { if (!cancelled) setPanelEpisodes(data.episodes ?? []); })
      .catch(() => { if (!cancelled) setPanelEpisodes([]); })
      .finally(() => { if (!cancelled) setPanelLoading(false); });
    return () => { cancelled = true; };
  }, [panelSeason, resolvedTmdbId, isTV]);

  // ── Video callbacks ──────────────────────────────────────────────────────────
  const resolutionLabel = (h: number) => {
    if (h >= 2160) return "4K";
    if (h >= 1080) return "1080p";
    if (h >= 720) return "720p";
    if (h >= 480) return "480p";
    if (h >= 360) return "360p";
    return "SD";
  };

  const onVideoLoad = useCallback((status: any) => {
    const ns = status?.naturalSize;
    if (ns?.height && ns.height > 0) {
      const h = ns.orientation === "landscape" ? ns.height : Math.max(ns.width ?? 0, ns.height);
      setVideoResolution(resolutionLabel(h));
    }
    transitionToReady(status?.durationMillis ?? 0);
  }, [transitionToReady]);

  const onPlaybackStatusUpdate = useCallback((status: any) => {
    if (status?.isLoaded === false && status?.error) {
      if (phaseRef.current === "loading" || phaseRef.current === "ready") {
        const playerErr = String(status.error ?? "");
        appLog.error("player.flix2", `Erro de playback: ${playerErr}`, {
          error: playerErr,
          platform: Platform.OS,
          title,
          tmdbId,
        });
        setPhase("error");
        setErrorMsg(playerErr || "Erro ao reproduzir vídeo. Tente novamente.");
        phaseRef.current = "error";
      }
      return;
    }
    if (!status?.isLoaded) return;
    transitionToReady(status.durationMillis ?? 0);
    setIsBuffering(!!(status.isBuffering));
    if (status.isPlaying) {
      hasStartedPlayingRef.current = true;
      setIsPlaying(true);
    } else if (!status.isBuffering && hasStartedPlayingRef.current) {
      setIsPlaying(false);
    }
    const pos = status.positionMillis ?? 0;
    const dur = status.durationMillis ?? 0;
    setPositionMs(pos);
    setDurationMs(dur);
    positionMsRef.current = pos;
    durationMsRef.current = dur;
    if (dur > 0) {
      setBufferedRatio(Math.min(1, (pos / dur) + 0.15));
    }
    if (status.didJustFinish) {
      if (continuousPlay) goToNextEpisode();
      else router.back();
    }
  }, [transitionToReady, goToNextEpisode, continuousPlay]);

  // ── Progress save ────────────────────────────────────────────────────────────
  const saveProgressLocal = useCallback(async () => {
    if (!tmdbId || !positionMsRef.current || !durationMsRef.current) return;
    const ratio = positionMsRef.current / durationMsRef.current;
    if (ratio < 0.02 || ratio > 0.97) return;
    const pos = positionMsRef.current;
    const dur = durationMsRef.current;
    // Save locally (always works, no auth needed)
    await saveLocalProgress({
      contentId: `${contentType}_${tmdbId}`,
      tmdbId: String(tmdbId),
      type: contentType,
      title,
      posterPath: posterPath ?? "",
      backdropPath: backdropPath ?? "",
      progress: ratio,
      positionMs: pos,
      durationMs: dur,
      season: isTV ? (season ?? undefined) : undefined,
      episode: isTV ? (episode ?? undefined) : undefined,
    });
    // Also sync to Supabase for cross-device Continue Watching
    if (user?.id && isSupabaseConfigured) {
      db.progress.upsert({
        user_id: user.id,
        tmdb_id: tmdbId,
        type: contentType,
        title,
        poster_path: posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : "",
        backdrop_path: backdropPath ? `https://image.tmdb.org/t/p/w1280${backdropPath}` : undefined,
        progress: ratio,
        position_ms: pos,
        duration_ms: dur,
        ...(isTV && season != null ? { season } : {}),
        ...(isTV && episode != null ? { episode } : {}),
      }).catch(() => {});
    }
  }, [tmdbId, contentType, title, posterPath, backdropPath, season, episode, isTV, user]);

  useEffect(() => {
    if (!tmdbId) return;
    const interval = setInterval(saveProgressLocal, SAVE_INTERVAL_MS);
    return () => { clearInterval(interval); saveProgressLocal(); };
  }, [saveProgressLocal, tmdbId]);

  // ── Seek helpers ─────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    haptic(20);
    showControls();
    if (isPlaying) videoRef.current.pauseAsync().catch(() => {});
    else videoRef.current.playAsync().catch(() => {});
  }, [isPlaying, showControls]);

  // Web: Chrome's autoplay policy blocks shouldPlay after a client-side navigation
  // (router.push changes the URL, making Chrome treat the new page as a fresh load).
  // When isPlaying becomes true, explicitly call playAsync() to bypass the block.
  useEffect(() => {
    if (Platform.OS !== "web" || !isPlaying || !videoRef.current) return;
    try { (videoRef.current as any).playAsync?.(); } catch {}
  }, [isPlaying]);

  const seekBy = useCallback((deltaMs: number) => {
    if (!videoRef.current || durationMs <= 0) return;
    haptic(20);
    showControls();
    const newPos = Math.max(0, Math.min(durationMs, positionMsRef.current + deltaMs));
    videoRef.current.setPositionAsync(newPos).catch(() => {});
    const anim = deltaMs < 0 ? seekFlashLeft : seekFlashRight;
    Animated.sequence([
      Animated.timing(anim, { toValue: 0.65, duration: 120, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [durationMs, showControls]);

  const skipIntro = useCallback(() => {
    if (!videoRef.current) return;
    const target = Math.min(durationMs, (SKIP_INTRO_MAX_S + 5) * 1000);
    videoRef.current.setPositionAsync(target).catch(() => {});
    haptic([0, 30, 50, 30]);
  }, [durationMs]);

  const skipCredits = useCallback(() => {
    if (!continuousPlay) { router.back(); return; }
    goToNextEpisode();
  }, [continuousPlay, goToNextEpisode]);

  // ── Quality selector ──────────────────────────────────────────────────────────
  const selectQuality = useCallback((item: Flix2Item) => {
    if (item.flix2Url === activeFlixUrlRef.current) {
      setShowQualityPanel(false);
      return;
    }
    haptic([0, 30, 60, 30]);
    setShowQualityPanel(false);
    setSelectedQualityId(item.id);
    activeFlixUrlRef.current = item.flix2Url;
    setRetryCount(0);
    setAutoRetryCountdown(null);
    if (autoRetryTimerRef.current) { clearInterval(autoRetryTimerRef.current); autoRetryTimerRef.current = null; }
    loadVideoUrl();
  }, [loadVideoUrl, haptic]);

  // ── Keep seekByRef fresh for PanResponder closures ───────────────────────────
  useEffect(() => { seekByRef.current = seekBy; }, [seekBy]);

  // ── Swipe-to-seek PanResponder ─────────────────────────────────────────────
  const bodySwipePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        !swipeGestureActive.current
          ? Math.abs(gs.dx) > 14 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5
          : true,
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderGrant: () => { swipeGestureActive.current = true; },
      onPanResponderMove: (_, gs) => {
        const deltaSec = Math.round((gs.dx / W) * 120);
        swipeDeltaSec.current = deltaSec;
        setSwipeSeekDisplay(deltaSec);
        setIsSwipeSeeking(true);
      },
      onPanResponderRelease: () => {
        if (swipeGestureActive.current && swipeDeltaSec.current !== 0) {
          seekByRef.current(swipeDeltaSec.current * 1000);
          try { Vibration.vibrate(30); } catch {}
        }
        swipeGestureActive.current = false;
        swipeDeltaSec.current = 0;
        setSwipeSeekDisplay(0);
        setIsSwipeSeeking(false);
      },
      onPanResponderTerminate: () => {
        swipeGestureActive.current = false;
        swipeDeltaSec.current = 0;
        setSwipeSeekDisplay(0);
        setIsSwipeSeeking(false);
      },
    })
  ).current;

  // ── Brightness zone PanResponder (left 28%) ─────────────────────────────────
  const leftBrightPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 12 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5,
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderGrant: () => { brightnessAtStart.current = brightnessLevelRef.current; },
      onPanResponderMove: (_, gs) => {
        const newLvl = Math.max(0, Math.min(0.85, brightnessAtStart.current + (-gs.dy / (H * 0.6))));
        brightnessLevelRef.current = newLvl; setBrightnessLevel(newLvl); setShowBrightnessHud(true);
        if (brightnessHudTimer.current) clearTimeout(brightnessHudTimer.current);
      },
      onPanResponderRelease: () => { brightnessHudTimer.current = setTimeout(() => setShowBrightnessHud(false), 1500); },
      onPanResponderTerminate: () => { brightnessHudTimer.current = setTimeout(() => setShowBrightnessHud(false), 1500); },
    })
  ).current;

  // ── Volume zone PanResponder (right 28%) ────────────────────────────────────
  const rightVolPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 12 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5,
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderGrant: () => { volumeAtStart.current = volumeLevelRef.current; },
      onPanResponderMove: (_, gs) => {
        const newVol = Math.max(0, Math.min(1.0, volumeAtStart.current + (-gs.dy / (H * 0.6))));
        volumeLevelRef.current = newVol; setVolumeLevel(newVol); setShowVolumeHud(true);
        if (volumeHudTimer.current) clearTimeout(volumeHudTimer.current);
        videoRef.current?.setVolumeAsync?.(newVol).catch(() => {});
      },
      onPanResponderRelease: () => { volumeHudTimer.current = setTimeout(() => setShowVolumeHud(false), 1500); },
      onPanResponderTerminate: () => { volumeHudTimer.current = setTimeout(() => setShowVolumeHud(false), 1500); },
    })
  ).current;

  // ── Double-tap seek detection ─────────────────────────────────────────────────
  // Single tap: show controls only (never toggle play directly on bare screen tap).
  // Double tap: seek ±15s. Toggle play is only via the center play button.
  const handleTap = useCallback((x: number) => {
    const now = Date.now();
    const isLeft = x < W / 2;
    if (lastTapRef.current && now - lastTapRef.current.time < 300 && Math.abs(x - lastTapRef.current.x) < 80) {
      // Double tap → seek
      if (tapTimerRef.current) { clearTimeout(tapTimerRef.current); tapTimerRef.current = null; }
      lastTapRef.current = null;
      seekBy(isLeft ? -15000 : 15000);
    } else {
      // Single tap → just show/hide controls, never auto-toggle play
      lastTapRef.current = { time: now, x };
      tapTimerRef.current = setTimeout(() => {
        lastTapRef.current = null;
        if (controlsVisible) {
          // Controls already visible → hide them
          if (hideTimer.current) clearTimeout(hideTimer.current);
          setControlsVisible(false);
        } else {
          // Controls hidden → show them
          showControls();
        }
      }, 300);
    }
  }, [seekBy, controlsVisible, showControls]);

  // ── Seek bar ─────────────────────────────────────────────────────────────────
  const onSeekStart = useCallback((x: number) => {
    setIsScrubbing(true);
    setScrubPosition((x / seekBarWidthRef.current) * durationMs);
    showControls();
  }, [durationMs, showControls]);

  const onSeekMove = useCallback((x: number) => {
    const pos = Math.max(0, Math.min(durationMs, (x / seekBarWidthRef.current) * durationMs));
    setScrubPosition(pos);
    // Throttle real-frame capture to ~150ms — avoids flooding the WebView
    if (useWebViewPlayer && videoRef.current && (videoRef.current as any).captureFrame) {
      if (captureThrottleRef.current) clearTimeout(captureThrottleRef.current);
      captureThrottleRef.current = setTimeout(() => {
        (videoRef.current as any).captureFrame(pos);
      }, 150);
    }
  }, [durationMs, useWebViewPlayer]);

  const onSeekEnd = useCallback((x: number) => {
    const pos = Math.max(0, Math.min(durationMs, (x / seekBarWidthRef.current) * durationMs));
    setIsScrubbing(false);
    setSeekFrameUrl(null);
    if (captureThrottleRef.current) { clearTimeout(captureThrottleRef.current); captureThrottleRef.current = null; }
    videoRef.current?.setPositionAsync(pos).catch(() => {});
  }, [durationMs]);

  // ── Speed ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (videoRef.current && phase === "ready") {
      const rate = isSpeedBoost ? 2.0 : playbackSpeed;
      videoRef.current.setRateAsync(rate, true).catch(() => {});
    }
  }, [playbackSpeed, isSpeedBoost, phase]);

  // ── Sleep timer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sleepTimerEnd) { setSleepMinutesLeft(null); if (sleepCheckRef.current) clearInterval(sleepCheckRef.current); return; }
    sleepCheckRef.current = setInterval(() => {
      const minsLeft = Math.ceil((sleepTimerEnd - Date.now()) / 60000);
      setSleepMinutesLeft(Math.max(0, minsLeft));
      if (Date.now() >= sleepTimerEnd) {
        videoRef.current?.pauseAsync().catch(() => {});
        setSleepTimerEnd(null);
        haptic([0, 80, 100, 80]);
      }
    }, 10000);
    return () => { if (sleepCheckRef.current) clearInterval(sleepCheckRef.current); };
  }, [sleepTimerEnd]);

  // ── Next episode countdown ────────────────────────────────────────────────────
  useEffect(() => {
    if (!continuousPlay || !isTV || durationMs <= 0 || !isPlaying) { setShowNextEpCountdown(false); return; }
    const remaining = durationMs - positionMs;
    if (remaining > 0 && remaining <= NEXT_EP_COUNTDOWN_S * 1000) {
      setShowNextEpCountdown(true);
      setNextEpCountdownSec(Math.ceil(remaining / 1000));
    } else {
      setShowNextEpCountdown(false);
    }
  }, [Math.floor(positionMs / 500), durationMs, continuousPlay, isTV, isPlaying]);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (sleepCheckRef.current) clearInterval(sleepCheckRef.current);
    };
  }, []);

  // ── Source badge label ────────────────────────────────────────────────────────
  const sourceBadgeLabel = resolvedCdnType === "fontedecanais" ? "FD" : resolvedCdnType === "cineveo" ? "CV" : "F2";

  // ── Seasons for panel ─────────────────────────────────────────────────────────
  const displaySeasons = [...new Set(flix2Items.filter((i) => i.season != null).map((i) => i.season as number))].sort((a, b) => a - b);

  // ── RENDER ────────────────────────────────────────────────────────────────────
  const backdropUri = backdropPath ? TMDB_IMG(backdropPath, "w1280") : posterPath ? TMDB_IMG(posterPath, "w780") : null;

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {/* Session blocked modal */}
      <Modal visible={!!sessionBlocked} transparent animationType="fade">
        <View style={styles.sessionModal}>
          <View style={styles.sessionBox}>
            <Feather
              name={sessionBlocked === "limit_exceeded" ? "monitor" : "clock"}
              size={32}
              color={RED}
            />
            <Text style={styles.sessionTitle}>
              {sessionBlocked === "trial_expired"
                ? "Período de teste encerrado"
                : sessionBlocked === "plan_expired"
                ? "Plano vencido"
                : "Limite de telas atingido"}
            </Text>
            <Text style={styles.sessionMsg}>
              {sessionBlocked === "trial_expired"
                ? "Seu período de teste gratuito de 3 dias chegou ao fim. Assine um plano para continuar assistindo."
                : sessionBlocked === "plan_expired"
                ? "Seu plano expirou. Renove para continuar assistindo sem interrupções."
                : "Seu plano não permite mais dispositivos simultâneos. Encerre outra sessão ou faça upgrade."}
            </Text>
            <Pressable
              style={styles.sessionBtn}
              onPress={() => {
                const { Linking } = require("react-native");
                Linking.openURL(
                  `https://wa.me/5596991718167?text=${encodeURIComponent(
                    sessionBlocked === "trial_expired"
                      ? "Olá! Meu período de teste encerrou, quero assinar um plano."
                      : sessionBlocked === "plan_expired"
                      ? "Olá! Meu plano venceu, quero renovar."
                      : "Olá! Quero fazer upgrade do meu plano para mais telas."
                  )}`
                );
              }}
            >
              <Text style={styles.sessionBtnText}>Falar no WhatsApp</Text>
            </Pressable>
            <Pressable
              style={[styles.sessionBtn, { backgroundColor: "rgba(255,255,255,0.08)", marginTop: 8 }]}
              onPress={() => router.back()}
            >
              <Text style={[styles.sessionBtnText, { color: "rgba(255,255,255,0.6)" }]}>Voltar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Speed panel */}
      <Modal visible={showSpeedPanel} transparent animationType="fade">
        <Pressable style={styles.panelOverlay} onPress={() => setShowSpeedPanel(false)}>
          <View style={styles.speedPanelBox}>
            <Text style={styles.speedPanelTitle}>Velocidade</Text>
            {SPEEDS.map((sp) => (
              <Pressable
                key={sp}
                style={[styles.speedOption, playbackSpeed === sp && { backgroundColor: "rgba(229,9,20,0.18)" }]}
                onPress={() => { setPlaybackSpeed(sp); setShowSpeedPanel(false); haptic(20); }}
              >
                <Text style={[styles.speedOptionText, playbackSpeed === sp && { color: RED }]}>{sp}×</Text>
                {playbackSpeed === sp && <Feather name="check" size={14} color={RED} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Quality panel */}
      {hasMultipleQualities && (
        <Modal visible={showQualityPanel} transparent animationType="fade">
          <Pressable style={styles.panelOverlay} onPress={() => setShowQualityPanel(false)}>
            <View style={styles.speedPanelBox}>
              <Text style={styles.speedPanelTitle}>Qualidade do vídeo</Text>
              {qualityOptions.map((opt) => {
                const isSelected = selectedQualityId === opt.id ||
                  (selectedQualityId === "current" && opt.flix2Url === params.flix2Url);
                const qualityLabel = detectQualityLabel(opt.label);
                return (
                  <Pressable
                    key={opt.id}
                    style={[styles.speedOption, isSelected && { backgroundColor: "rgba(229,9,20,0.18)" }]}
                    onPress={() => selectQuality(opt)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.speedOptionText, isSelected && { color: RED }]}>
                        {opt.label || `Fonte ${qualityOptions.indexOf(opt) + 1}`}
                      </Text>
                    </View>
                    {qualityLabel && (
                      <View style={styles.qualityOptionBadge}>
                        <Text style={styles.qualityOptionBadgeText}>{qualityLabel}</Text>
                      </View>
                    )}
                    {isSelected && <Feather name="check" size={14} color={RED} />}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Sleep panel */}
      <Modal visible={showSleepPanel} transparent animationType="fade">
        <Pressable style={styles.panelOverlay} onPress={() => setShowSleepPanel(false)}>
          <View style={styles.speedPanelBox}>
            <Text style={styles.speedPanelTitle}>Timer de sono</Text>
            {SLEEP_PRESETS.map((min) => (
              <Pressable
                key={min}
                style={styles.speedOption}
                onPress={() => { setSleepTimerEnd(Date.now() + min * 60000); setShowSleepPanel(false); haptic(20); }}
              >
                <Text style={styles.speedOptionText}>{min} min</Text>
              </Pressable>
            ))}
            {sleepTimerEnd && (
              <Pressable style={[styles.speedOption, { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" }]} onPress={() => { setSleepTimerEnd(null); setShowSleepPanel(false); }}>
                <Text style={[styles.speedOptionText, { color: RED }]}>Cancelar timer</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* ── Backdrop wallpaper — fills black bars behind the video ──────────── */}
      {(backdropPath || posterPath) ? (
        <Image
          source={{ uri: TMDB_IMG(backdropPath ?? posterPath, "w780") ?? "" }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={14}
        />
      ) : null}
      {(backdropPath || posterPath) ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.62)" }]} pointerEvents="none" />
      ) : null}

      {/* ── Video player ────────────────────────────────────────────────────── */}
      {/* Wrapped in Animated.View so the right edge shrinks when the episode
          panel opens — the video occupies the left half of the screen.        */}
      <Animated.View style={{ position: "absolute", top: 0, left: 0, bottom: 0, right: videoRightAnim }}>
      {videoUrl && useWebViewPlayer ? (
        <WebViewVideoPlayer
          ref={videoRef}
          uri={videoUrl}
          baseUrl={webViewBaseUrl}
          headers={videoSourceHeaders}
          style={[StyleSheet.absoluteFill, phase !== "ready" && { opacity: 0 }]}
          shouldPlay={phase === "ready"}
          rate={playbackSpeed}
          onLoad={onVideoLoad}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          onError={(errStr) => {
            if (phaseRef.current !== "error") {
              appLog.error("player.flix2", `onError WebView: ${errStr}`, {
                error: errStr,
                platform: Platform.OS,
                title,
                tmdbId,
                cdnType: resolvedCdnType,
                videoUrl: videoUrl?.slice(0, 120),
              });
              setPhase("error");
              setErrorMsg(errStr);
              phaseRef.current = "error";
            }
          }}
          onPreviewFrame={(dataUrl) => {
            if (dataUrl) setSeekFrameUrl(dataUrl);
          }}
          progressUpdateIntervalMillis={1000}
        />
      ) : videoUrl && Video ? (
        <Video
          ref={videoRef}
          source={{
            uri: videoUrl,
            // overrideFileExtensionAndroid tells ExoPlayer which extractor to use,
            // bypassing extractor sniffing that may fail when Content-Type/URL hints
            // are stripped/altered by the proxy. The Flix2 streams are always MP4.
            overrideFileExtensionAndroid: "mp4",
            ...(videoSourceHeaders ? { headers: videoSourceHeaders } : {}),
          }}
          style={[StyleSheet.absoluteFill, phase !== "ready" && { opacity: 0 }]}
          resizeMode={ResizeMode?.CONTAIN ?? "contain"}
          shouldPlay={phase === "ready"}
          isLooping={false}
          onLoad={onVideoLoad}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          onError={(err: any) => {
            if (phaseRef.current !== "error") {
              const errStr = String(err ?? "").trim() || "Erro ao reproduzir vídeo";
              appLog.error("player.flix2", `onError ExoPlayer: ${errStr}`, {
                error: errStr,
                platform: Platform.OS,
                title,
                tmdbId,
                cdnType: resolvedCdnType,
                videoUrl: videoUrl?.slice(0, 120),
              });
              setPhase("error");
              setErrorMsg(errStr);
              phaseRef.current = "error";
            }
          }}
          progressUpdateIntervalMillis={1000}
          useNativeControls={false}
          shouldCorrectPitch={true}
        />
      ) : null}
      </Animated.View>

      {/* ── Scrub overlay — hide video frames while dragging the seek bar ── */}
      {isScrubbing && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.72)" }]} />
      )}

      {/* ── Buffering indicator ────────────────────────────────────────────── */}
      {phase === "ready" && isBuffering && !isScrubbing && (
        <View style={styles.bufferingOverlay} pointerEvents="none">
          <View style={styles.bufferingSpinner}>
            <Feather name="loader" size={32} color="#fff" />
          </View>
        </View>
      )}

      {/* ── Loading / error screen ─────────────────────────────────────────── */}
      {phase !== "ready" && (
        <View style={styles.loadScreen}>
          {backdropUri ? (
            <Image source={{ uri: backdropUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          <View style={styles.loadDim} />

          {phase === "error" ? (
            <View style={styles.loadCenter}>
              <Feather name="alert-circle" size={44} color={RED} />
              <Text style={[styles.loadTitle, { marginTop: 12 }]}>Erro ao reproduzir vídeo</Text>
              {errorMsg && errorMsg !== "Erro ao reproduzir vídeo" ? (
                <Text style={[styles.loadEp, { color: "#ef4444", fontSize: 11, marginBottom: 4, textAlign: "center", maxWidth: 280 }]}>{errorMsg}</Text>
              ) : null}
              {resolvedCdnType ? (
                <Text style={[styles.loadEp, { color: "#888", fontSize: 10, marginBottom: 4 }]}>CDN: {resolvedCdnType}</Text>
              ) : null}
              <Text style={styles.loadEp}>Verifique sua conexão e tente novamente</Text>
              {autoRetryCountdown !== null ? (
                <View style={{ alignItems: "center", gap: 6, marginTop: 20 }}>
                  <View style={styles.retryCountdown}>
                    <Text style={styles.retryCountdownNum}>{autoRetryCountdown}</Text>
                  </View>
                  <Text style={styles.retryCountdownText}>Tentando novamente…</Text>
                  <Pressable onPress={() => { if (autoRetryTimerRef.current) { clearInterval(autoRetryTimerRef.current); autoRetryTimerRef.current = null; } setAutoRetryCountdown(null); setRetryCount(1); }}>
                    <Text style={styles.retryCancel}>Cancelar</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={{ gap: 10, marginTop: 20, alignItems: "center" }}>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Pressable style={styles.retryBtn} onPress={() => { setRetryCount((c) => c + 1); loadVideoUrl(); }}>
                      <Feather name="refresh-cw" size={14} color="#fff" />
                      <Text style={styles.retryText}>Tentar Novamente</Text>
                    </Pressable>
                    <Pressable style={styles.retryBtnSecondary} onPress={() => router.back()}>
                      <Text style={styles.retryText}>Voltar</Text>
                    </Pressable>
                  </View>
                  {tmdbId && (
                    <Pressable
                      style={styles.altPlayerBtn}
                      onPress={() => router.replace({
                        pathname: "/player",
                        params: { type: contentType, id: String(tmdbId), season: season != null ? String(season) : "", episode: episode != null ? String(episode) : "", title: title ?? "", posterPath: posterPath ?? "", backdropPath: backdropPath ?? "" },
                      })}
                    >
                      <Feather name="monitor" size={14} color="#a78bfa" />
                      <Text style={styles.altPlayerText}>Player Alternativo</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.loadCenter}>
              <Text style={styles.loadServiceLabel}>N E T P L A Y</Text>
              {contentLogo ? (
                <Image source={{ uri: contentLogo }} style={styles.loadContentLogo} contentFit="contain" />
              ) : (
                <Text style={styles.loadTitle} numberOfLines={2}>{title}</Text>
              )}
              {season != null && episode != null && (
                <Text style={styles.loadEp}>T{season} · Ep {episode}{episodeName ? ` — ${episodeName}` : ""}</Text>
              )}
              {loadingTips.length > 0 && (
                <View style={styles.tipBox}>
                  <Text style={styles.tipText} numberOfLines={3}>{loadingTips[tipIdx]}</Text>
                </View>
              )}
              <View style={styles.barTrack}>
                <Animated.View style={[styles.barFill, { width: loadProgress.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) }]} />
              </View>
              <Animated.Text style={styles.barPct}><ProgressText value={loadProgress} /></Animated.Text>
              <View style={styles.sourceBadge}>
                <Feather name="zap" size={10} color="#e50914" />
                <Text style={styles.sourceBadgeText}>Flix 2.0</Text>
              </View>
            </View>
          )}

          <Pressable style={[styles.backBtn, { top: topPad + 8 }]} onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
        </View>
      )}

      {/* ── Lock screen ────────────────────────────────────────────────────── */}
      {phase === "ready" && isLocked && (
        <Pressable style={[StyleSheet.absoluteFill, styles.lockOverlay]} onPress={() => { Animated.sequence([Animated.timing(lockAnim, { toValue: 1.2, duration: 100, useNativeDriver: true }), Animated.timing(lockAnim, { toValue: 1, duration: 100, useNativeDriver: true })]).start(); }}>
          <Pressable style={styles.lockUnlockBtn} onPress={() => { haptic([0, 40, 60, 40]); setIsLocked(false); }}>
            <Animated.View style={{ transform: [{ scale: lockAnim }] }}>
              <Feather name="lock" size={24} color="#fff" />
            </Animated.View>
            <Text style={styles.lockUnlockText}>Toque para desbloquear</Text>
          </Pressable>
        </Pressable>
      )}

      {/* ── Seek flash overlays ────────────────────────────────────────────── */}
      <SeekFlash side="left" anim={seekFlashLeft} />
      <SeekFlash side="right" anim={seekFlashRight} />

      {/* ── Swipe-to-seek indicator ─────────────────────────────────────────── */}
      {isSwipeSeeking && (
        <View style={styles.swipeSeekIndicator} pointerEvents="none">
          <Feather name={swipeSeekDisplay >= 0 ? "fast-forward" : "rewind"} size={28} color="#fff" />
          <Text style={styles.swipeSeekDelta}>{swipeSeekDisplay > 0 ? "+" : ""}{swipeSeekDisplay}s</Text>
          <Text style={styles.swipeSeekTarget}>
            {formatTime(Math.max(0, Math.min(durationMs, positionMs + swipeSeekDisplay * 1000)))}
          </Text>
        </View>
      )}

      {/* ── Speed boost badge ──────────────────────────────────────────────── */}
      {isSpeedBoost && (
        <View style={styles.speedBoostBadge} pointerEvents="none">
          <Feather name="fast-forward" size={16} color="#fff" />
          <Text style={styles.speedBoostText}>2×</Text>
        </View>
      )}


      {/* ── Next episode countdown — side panel with poster ───────────────── */}
      {showNextEpCountdown && !showEpisodes && (
        <View style={styles.nextEpPanel}>
          {/* Dim right side backdrop */}
          <View style={styles.nextEpPanelBg} />
          {/* Poster */}
          {(backdropPath || posterPath) && (
            <Image
              source={{ uri: TMDB_IMG(backdropPath ?? posterPath, "w780") ?? "" }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          )}
          <View style={styles.nextEpPanelDim} />
          <View style={styles.nextEpPanelContent}>
            <View style={styles.nextEpCountdownCircle}>
              <Text style={styles.nextEpCountdownNum}>{nextEpCountdownSec}</Text>
              <Text style={styles.nextEpCountdownUnit}>seg</Text>
            </View>
            <Text style={styles.nextEpCountdownLabel}>Próximo episódio</Text>
            {(() => {
              const nextItem = (() => {
                if (!isTV || !season || !episode) return null;
                const nextEp = episode + 1;
                return flix2Items.find((i) => i.season === season && i.episode === nextEp)
                  ?? flix2Items.find((i) => i.season === (season + 1) && i.episode === 1)
                  ?? null;
              })();
              const nextTmdbEp = nextItem ? panelEpisodes.find((e: any) => e.episode_number === nextItem.episode) : null;
              return nextItem ? (
                <Text style={styles.nextEpName} numberOfLines={2}>
                  {nextTmdbEp?.name ?? `Ep. ${nextItem.episode}`}
                </Text>
              ) : null;
            })()}
            <Pressable style={styles.nextEpNowBtn} onPress={goToNextEpisode}>
              <Feather name="play" size={16} color="#fff" />
              <Text style={styles.nextEpNowBtnText}>Assistir agora</Text>
            </Pressable>
            <Pressable style={styles.nextEpCancelBtn} onPress={() => { setShowNextEpCountdown(false); setContinuousPlay(false); }}>
              <Text style={styles.nextEpCancelText}>Cancelar reprodução</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Sleep timer badge ──────────────────────────────────────────────── */}
      {sleepTimerEnd && sleepMinutesLeft != null && (
        <Pressable style={styles.sleepBadge} onPress={() => setShowSleepPanel(true)}>
          <Feather name="moon" size={11} color="#aaa" />
          <Text style={styles.sleepBadgeText}>{sleepMinutesLeft > 0 ? `${sleepMinutesLeft}min` : "Pausando..."}</Text>
        </Pressable>
      )}

      {/* ── Brightness dim overlay ── */}
      {brightnessLevel > 0 && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: brightnessLevel }]} />
      )}

      {/* ── Brightness HUD ── */}
      {showBrightnessHud && (
        <View style={styles.hudPill} pointerEvents="none">
          <Feather name="sun" size={13} color="#fff" />
          <View style={styles.hudBar}><View style={[styles.hudBarFill, { width: `${Math.round((1 - brightnessLevel / 0.85) * 100)}%` as any }]} /></View>
          <Text style={styles.hudPct}>{Math.round((1 - brightnessLevel / 0.85) * 100)}%</Text>
        </View>
      )}

      {/* ── Volume HUD ── */}
      {showVolumeHud && (
        <View style={styles.hudPill} pointerEvents="none">
          <Feather name={volumeLevel === 0 ? "volume-x" : volumeLevel < 0.4 ? "volume-1" : "volume-2"} size={13} color="#fff" />
          <View style={styles.hudBar}><View style={[styles.hudBarFill, { width: `${Math.round(volumeLevel * 100)}%` as any }]} /></View>
          <Text style={styles.hudPct}>{Math.round(volumeLevel * 100)}%</Text>
        </View>
      )}

      {/* ── Controls overlay ───────────────────────────────────────────────── */}
      {phase === "ready" && !showEpisodes && !isLocked && (
        <>
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {/* Gesture layers: horizontal seek + brightness (left) + volume (right) */}
            <View style={StyleSheet.absoluteFill} {...bodySwipePan.panHandlers} pointerEvents="box-none" />
            <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: W * 0.28 }} {...leftBrightPan.panHandlers} pointerEvents="box-none" />
            <View style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: W * 0.28 }} {...rightVolPan.panHandlers} pointerEvents="box-none" />
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={(e) => handleTap(e.nativeEvent.pageX)}
              onLongPress={() => { setIsSpeedBoost(true); haptic([0, 20]); }}
              onPressOut={() => { if (isSpeedBoost) setIsSpeedBoost(false); }}
              delayLongPress={600}
            />
          </View>

          {controlsVisible && (
            <Animated.View style={[styles.controls, { opacity: lockAnim }]} pointerEvents="box-none">
              <View style={styles.ctrlGradTop} pointerEvents="none" />
              <View style={styles.ctrlGradBottom} pointerEvents="none" />

              {/* Top bar */}
              <View style={[styles.topBar, { paddingTop: topPad + 8 }]} pointerEvents="box-none">
                <Pressable style={styles.iconBtn} onPress={() => router.back()}>
                  <Feather name="arrow-left" size={22} color="#fff" />
                </Pressable>
                <View style={{ flex: 1, minWidth: 0, marginHorizontal: 10, overflow: "hidden" }}>
                  {contentLogo ? (
                    <Image source={{ uri: contentLogo }} style={styles.ctrlContentLogo} contentFit="contain" />
                  ) : (
                    <Text style={styles.ctrlTitle} numberOfLines={1}>{title}</Text>
                  )}
                  {season != null && episode != null && (
                    <Text style={styles.ctrlEp} numberOfLines={1}>T{season} · Ep {episode}{episodeName ? ` — ${episodeName}` : ""}</Text>
                  )}
                </View>
                {videoResolution && (
                  <View style={styles.qualityBadge}>
                    <Text style={styles.qualityBadgeText}>{videoResolution}</Text>
                  </View>
                )}
                <View style={styles.ctrlSourceBadge}>
                  <Feather name="zap" size={10} color={RED} />
                  <Text style={[styles.ctrlSourceBadgeText, { color: RED }]}>{sourceBadgeLabel}</Text>
                </View>
                {playbackSpeed !== 1.0 && (
                  <View style={styles.speedBadge}>
                    <Text style={styles.speedBadgeText}>{playbackSpeed}×</Text>
                  </View>
                )}
                {hasMultipleQualities && (
                  <Pressable style={styles.iconBtn} onPress={() => { setShowQualityPanel(true); showControls(); }}>
                    <Feather name="layers" size={18} color="#fff" />
                  </Pressable>
                )}
                <Pressable style={styles.iconBtn} onPress={() => { setShowSpeedPanel(true); showControls(); }}>
                  <Feather name="zap" size={18} color="#fff" />
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => { setShowSleepPanel(true); showControls(); }}>
                  <Feather name="moon" size={18} color={sleepTimerEnd ? "#f59e0b" : "#fff"} />
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => { haptic(30); setIsLocked(true); }}>
                  <Feather name="unlock" size={18} color="#fff" />
                </Pressable>
                {isTV && (
                  <Pressable style={styles.episodesBtn} onPress={openEpisodesPanel}>
                    <Feather name="list" size={16} color="#fff" />
                    <Text style={styles.episodesBtnText}>Episódios</Text>
                  </Pressable>
                )}
              </View>

              {/* Center row */}
              <View style={styles.centerRow} pointerEvents="box-none">
                {isTV && (
                  <Pressable style={styles.iconBtn} onPress={goToPrevEpisode} disabled={!getPrevEpisodeItem()}>
                    <Feather name="skip-back" size={22} color={getPrevEpisodeItem() ? "#fff" : "rgba(255,255,255,0.25)"} />
                  </Pressable>
                )}
                <Pressable style={styles.iconBtn} onPress={() => seekBy(-15000)}>
                  <Feather name="rotate-ccw" size={28} color="#fff" />
                  <Text style={styles.seekLabel}>15s</Text>
                </Pressable>
                <Pressable style={[styles.iconBtn, styles.playBtn]} onPress={togglePlay}>
                  <Feather name={isPlaying ? "pause" : "play"} size={36} color="#fff" />
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => seekBy(15000)}>
                  <Feather name="rotate-cw" size={28} color="#fff" />
                  <Text style={styles.seekLabel}>15s</Text>
                </Pressable>
                {isTV && (
                  <Pressable style={styles.iconBtn} onPress={goToNextEpisode}>
                    <Feather name="skip-forward" size={22} color="#fff" />
                  </Pressable>
                )}
              </View>

              {/* Bottom bar */}
              <View style={styles.bottomBar} pointerEvents="box-none">
                <Pressable onPress={() => setShowTimeRemaining(!showTimeRemaining)}>
                  <Text style={styles.timeText}>
                    {showTimeRemaining ? `-${formatTime(Math.max(0, durationMs - displayPos))}` : formatTime(displayPos)}
                  </Text>
                </Pressable>
                <View
                  style={styles.seekTrackOuter}
                  onLayout={(e) => { seekBarWidthRef.current = e.nativeEvent.layout.width; }}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={(e) => onSeekStart(e.nativeEvent.locationX)}
                  onResponderMove={(e) => onSeekMove(e.nativeEvent.locationX)}
                  onResponderRelease={(e) => onSeekEnd(e.nativeEvent.locationX)}
                >
                  <View style={[styles.seekTrack, { height: isScrubbing ? 6 : 4 }]}>
                    <View style={[styles.seekBuffered, { width: `${bufferedRatio * 100}%` as any }]} />
                    <View style={[styles.seekFill, { width: `${displayProgress * 100}%` as any }]} />
                    <View style={[styles.seekThumb, { left: `${displayProgress * 100}%` as any, width: isScrubbing ? 18 : 14, height: isScrubbing ? 18 : 14, marginLeft: isScrubbing ? -9 : -7, top: isScrubbing ? (6 - 18) / 2 : (4 - 14) / 2 }]} />
                  </View>
                  {isScrubbing && (() => {
                    const THUMB_W = 140;
                    const THUMB_H = 79; // 16:9
                    const rawLeft = displayProgress * seekBarWidthRef.current - THUMB_W / 2;
                    const clampedLeft = Math.max(0, Math.min(seekBarWidthRef.current - THUMB_W, rawLeft));
                    return (
                      <View style={[styles.seekThumbnail, { left: clampedLeft, width: THUMB_W, height: THUMB_H + 22 }]}>
                        <View style={[styles.seekThumbnailImgBox, { width: THUMB_W, height: THUMB_H }]}>
                          {(seekFrameUrl || seekThumbnailUrl) ? (
                            <Image
                              source={{ uri: seekFrameUrl || seekThumbnailUrl! }}
                              style={StyleSheet.absoluteFill}
                              contentFit="cover"
                            />
                          ) : (
                            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a1a", justifyContent: "center", alignItems: "center" }]}>
                              <Feather name="film" size={22} color="#444" />
                            </View>
                          )}
                          <View style={styles.seekThumbnailImgDim} />
                        </View>
                        <View style={styles.seekThumbnailTimeRow}>
                          <Text style={styles.seekThumbnailTime}>{formatTime(scrubPosition)}</Text>
                        </View>
                      </View>
                    );
                  })()}
                </View>
                <Text style={styles.timeText}>{formatTime(durationMs)}</Text>
                <Pressable
                  style={[styles.iconBtnSmall, continuousPlay && { backgroundColor: "rgba(229,9,20,0.2)" }]}
                  onPress={() => { haptic(20); setContinuousPlay(!continuousPlay); }}
                >
                  <Feather name="repeat" size={16} color={continuousPlay ? RED : "rgba(255,255,255,0.5)"} />
                </Pressable>
              </View>
            </Animated.View>
          )}
        </>
      )}

      {/* ── Skip vinheta — rendered AFTER controls overlay so it sits on top ── */}
      {showSkipIntro && phase === "ready" && (
        <Pressable style={styles.skipIntroBtnPos} onPress={skipIntro}>
          <View style={styles.skipIntroBtn}>
            <Feather name="skip-forward" size={14} color="#fff" />
            <Text style={styles.skipIntroBtnText}>Pular Vinheta</Text>
          </View>
        </Pressable>
      )}

      {/* ── Skip credits ─────────────────────────────────────────────────────── */}
      {showSkipCredits && phase === "ready" && !showSkipIntro && (
        <Pressable style={styles.skipCreditsBtnPos} onPress={skipCredits}>
          <View style={styles.skipIntroBtn}>
            <Feather name="skip-forward" size={14} color="#fff" />
            <Text style={styles.skipIntroBtnText}>{isTV ? "Próximo episódio" : "Pular créditos"}</Text>
          </View>
        </Pressable>
      )}

      {/* Dim overlay when episodes panel open */}
      {showEpisodes && (
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)" }]} onPress={closeEpisodesPanel} />
      )}

      {/* ── Episodes panel — right half of screen with backdrop wallpaper ─── */}
      <Animated.View
        style={[styles.episodesPanel, {
          width: panelAnim.interpolate({ inputRange: [0, 1], outputRange: [0, winW * 0.5] }),
          opacity: panelAnim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.5, 1] }),
        }]}
        pointerEvents={showEpisodes ? "auto" : "none"}
      >
        {/* Backdrop wallpaper fills the entire panel */}
        {backdropUri ? (
          <Image source={{ uri: backdropUri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={10} />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(5,5,5,0.87)" }]} pointerEvents="none" />

        {/* Header — shows backdrop image clearly */}
        <View style={styles.panelHeader}>
          {backdropUri ? (
            <Image source={{ uri: backdropUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          <View style={styles.panelBackdropGrad} />
          <View style={styles.panelHeaderRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.panelTitle} numberOfLines={1}>{title}</Text>
              {season != null && episode != null && (
                <Text style={styles.panelCurrentEp}>Assistindo: T{season} · Ep {episode}</Text>
              )}
            </View>
            <Pressable style={styles.panelCloseBtn} onPress={closeEpisodesPanel}>
              <Feather name="x" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Continuous play toggle */}
        <Pressable style={styles.panelAutoPlayRow} onPress={() => setContinuousPlay(!continuousPlay)}>
          <Feather name="repeat" size={13} color={continuousPlay ? RED : "#555"} />
          <Text style={[styles.panelAutoPlayText, continuousPlay && { color: "#ddd" }]}>
            Reprodução contínua {continuousPlay ? "ativada" : "desativada"}
          </Text>
          <View style={[styles.panelAutoPlayToggle, continuousPlay && { backgroundColor: RED }]}>
            <View style={[styles.panelAutoPlayKnob, continuousPlay && { marginLeft: 14 }]} />
          </View>
        </Pressable>

        {displaySeasons.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.panelSeasonRow} contentContainerStyle={{ paddingHorizontal: 10, gap: 6 }}>
            {displaySeasons.map((s) => (
              <Pressable key={s} onPress={() => { haptic(20); setPanelSeason(s); }} style={[styles.panelSeasonBtn, panelSeason === s && { backgroundColor: RED, borderColor: RED }]}>
                <Text style={[styles.panelSeasonText, panelSeason === s && { color: "#fff" }]}>T{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 10, gap: 14 }}>
          {panelLoading ? (
            <View style={{ padding: 24, alignItems: "center" }}>
              <Text style={styles.panelEmpty}>Carregando...</Text>
            </View>
          ) : (() => {
            const cardW = winW * 0.5 - 20;
            const thumbH = Math.round(cardW * (9 / 16));

            const seasonFlix2 = flix2Items
              .filter((i) => i.season === panelSeason && i.episode != null)
              .sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));

            const renderEpCard = (item: Flix2Item | null, tmdbEp: any, key: string | number) => {
              const isCurrentEp = item ? (item.season === season && item.episode === episode) : false;
              const epNum = item?.episode ?? tmdbEp?.episode_number;
              const epName = tmdbEp?.name ?? item?.label ?? "";
              const stillUri = tmdbEp?.still_path ? TMDB_IMG(tmdbEp.still_path, "w300") : null;
              const runtime = tmdbEp?.runtime;
              const overview = tmdbEp?.overview ?? "";
              const rating = tmdbEp?.vote_average;
              return (
                <Pressable
                  key={key}
                  style={[styles.panelEpCard, isCurrentEp && styles.panelEpCardActive]}
                  onPress={() => { if (item) { haptic(20); goToEpisode(item); } }}
                >
                  {/* 16:9 thumbnail */}
                  <View style={[styles.panelEpCardThumb, { height: thumbH }]}>
                    {stillUri ? (
                      <Image source={{ uri: stillUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, styles.panelEpThumbFallback]}>
                        <Feather name="film" size={26} color="#333" />
                      </View>
                    )}
                    <View style={styles.panelEpThumbGrad} pointerEvents="none" />
                    {isCurrentEp && (
                      <View style={styles.panelEpPlayOverlay}>
                        <View style={styles.panelEpPlayCircle}>
                          <Feather name="pause" size={20} color="#fff" />
                        </View>
                      </View>
                    )}
                    <View style={styles.panelEpNumBadge}>
                      <Text style={styles.panelEpNumBadgeText}>
                        {`T${item?.season ?? panelSeason} · E${epNum}`}
                      </Text>
                    </View>
                    {runtime ? (
                      <View style={styles.panelEpRuntimeBadge}>
                        <Text style={styles.panelEpRuntimeBadgeText}>{runtime}min</Text>
                      </View>
                    ) : null}
                  </View>
                  {/* Info below thumbnail */}
                  <View style={styles.panelEpCardInfo}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {isCurrentEp && <View style={styles.panelEpActiveDot} />}
                      <Text style={[styles.panelEpName, isCurrentEp && { color: RED }]} numberOfLines={2}>
                        {epName || `Episódio ${epNum}`}
                      </Text>
                    </View>
                    {rating && rating > 0 ? (
                      <Text style={styles.panelEpRating}>⭐ {(rating as number).toFixed(1)}</Text>
                    ) : null}
                    {overview ? (
                      <Text style={styles.panelEpOverview} numberOfLines={3}>{overview}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            };

            if (seasonFlix2.length === 0 && panelEpisodes.length > 0) {
              return panelEpisodes.map((tmdbEp: any) =>
                renderEpCard(null, tmdbEp, tmdbEp.episode_number)
              );
            }

            if (seasonFlix2.length === 0) {
              return <View style={{ padding: 24, alignItems: "center" }}><Text style={styles.panelEmpty}>Nenhum episódio disponível</Text></View>;
            }

            return seasonFlix2.map((item) => {
              const tmdbEp = panelEpisodes.find((e: any) => e.episode_number === item.episode);
              return renderEpCard(item, tmdbEp, item.id);
            });
          })()}
        </ScrollView>
      </Animated.View>

      {/* ── Similar movies panel (movies only, last 10 min) ─────────────── */}
      {showSimilarPanel && !isTV && similarMovies.length > 0 && (
        <View style={styles.similarPanel} pointerEvents="box-none">
          {(backdropPath || posterPath) ? (
            <Image
              source={{ uri: TMDB_IMG(backdropPath ?? posterPath, "w780") ?? "" }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              blurRadius={22}
            />
          ) : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.8)" }]} pointerEvents="none" />
          <View style={styles.similarPanelInner} pointerEvents="box-none">
            <View style={styles.similarHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.similarTitle}>Você também pode gostar</Text>
                <Text style={styles.similarSubtitle}>Faltam menos de 10 min para o fim</Text>
              </View>
              <Pressable style={styles.panelCloseBtn} onPress={() => dismissSimilarPanel(false)}>
                <Feather name="x" size={18} color="#fff" />
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.similarScroll}>
              {similarMovies.map((m: any) => (
                <Pressable key={m.id} style={styles.similarCard} onPress={() => dismissSimilarPanel(false)}>
                  {m.poster_path ? (
                    <Image source={{ uri: `https://image.tmdb.org/t/p/w342${m.poster_path}` }} style={styles.similarCardImg} contentFit="cover" />
                  ) : (
                    <View style={[styles.similarCardImg, styles.panelEpThumbFallback]}>
                      <Feather name="film" size={24} color="#333" />
                    </View>
                  )}
                  <View style={styles.similarCardOverlay} />
                  {m.vote_average > 0 && (
                    <View style={styles.similarCardBadge}>
                      <Text style={styles.similarCardBadgeText}>⭐ {(m.vote_average as number).toFixed(1)}</Text>
                    </View>
                  )}
                  <Text style={styles.similarCardTitle} numberOfLines={2}>{m.title ?? m.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {similarShowButtons && (
              <View style={styles.similarBtnsRow}>
                <Pressable style={styles.similarBtnRemind} onPress={() => dismissSimilarPanel(false)}>
                  <Feather name="clock" size={13} color="#fff" />
                  <Text style={styles.similarBtnRemindText}>Mostrar em 1min30s</Text>
                </Pressable>
                <Pressable style={styles.similarBtnNever} onPress={() => dismissSimilarPanel(true)}>
                  <Feather name="x-circle" size={13} color="#e50914" />
                  <Text style={styles.similarBtnNeverText}>Não mostrar mais</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ── Sting overlay ───────────────────────────────────────────────────── */}
      {showSting && (
        <StingOverlay
          videoReady={phase === "ready"}
          onDone={() => setShowSting(false)}
          tmdbId={tmdbId ?? undefined}
          mediaType={contentType === "tv" ? "tv" : "movie"}
        />
      )}

      {/* ── Hidden WebView — resolve nixplay.lat redirects before playing ──────
          Mounts only when resolverUrl is set (nixplay URL detected).
          onShouldStartLoadWithRequest fires for every URL in the redirect chain,
          including cross-scheme HTTPS→HTTP which fetch()/XHR cannot follow.
          Returns false to STOP the WebView loading (we only want the URL, not
          the actual content), then resolverCallbackRef delivers it to the
          awaiting Promise in loadVideoUrl(). ──────────────────────────────── */}
      {resolverUrl !== null && WebView && Platform.OS !== "web" && (
        <WebView
          source={{ uri: resolverUrl }}
          style={{ width: 0, height: 0, opacity: 0, position: "absolute", pointerEvents: "none" }}
          onShouldStartLoadWithRequest={(req: any) => {
            const u: string = req.url ?? "";
            // Ignore the original nixplay/hubby.cx URL and about:/data: frames
            if (!u || u.includes("nixplay.lat") || u.includes("hubby.cx") || u.startsWith("about:") || u.startsWith("data:")) {
              return true; // let it continue
            }
            // We got the redirect destination — capture it and stop loading
            if (resolverCallbackRef.current) {
              if (resolverTimerRef.current) clearTimeout(resolverTimerRef.current);
              resolverCallbackRef.current(u);
              resolverCallbackRef.current = null;
            }
            return false; // stop WebView from loading the actual content
          }}
          userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
          javaScriptEnabled={false}
          mediaPlaybackRequiresUserAction={true}
          startInLoadingState={false}
          mixedContentMode="always"
          originWhitelist={["*"]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  // Loading screen
  loadScreen: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000", justifyContent: "center", alignItems: "center" },
  loadDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.72)" },
  loadCenter: { alignItems: "center", paddingHorizontal: 32, gap: 12, zIndex: 1 },
  loadServiceLabel: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 10, opacity: 0.55, marginBottom: 4 },
  loadTitle: { color: "#fff", fontSize: 22, fontWeight: "800", textAlign: "center" },
  loadEp: { color: "rgba(255,255,255,0.55)", fontSize: 13, textAlign: "center" },
  loadContentLogo: { width: 220, height: 80 },
  tipBox: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, marginTop: 6, maxWidth: 340 },
  tipText: { color: "rgba(255,255,255,0.65)", fontSize: 12, lineHeight: 18, textAlign: "center", fontStyle: "italic" },
  barTrack: { width: 220, height: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2, marginTop: 18, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: RED, borderRadius: 2 },
  barPct: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 4 },
  sourceBadge: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6, backgroundColor: "rgba(229,9,20,0.12)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(229,9,20,0.25)" },
  sourceBadgeText: { color: RED, fontSize: 10, fontWeight: "700" },
  backBtn: { position: "absolute", left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },

  // Error screen
  retryCountdown: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center" },
  retryCountdownNum: { color: "#fff", fontSize: 22, fontWeight: "700" },
  retryCountdownText: { color: "rgba(255,255,255,0.45)", fontSize: 12 },
  retryCancel: { color: "rgba(255,255,255,0.3)", fontSize: 12, textDecorationLine: "underline" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: RED, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10 },
  retryBtnSecondary: { backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10 },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  altPlayerBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10, backgroundColor: "rgba(139,92,246,0.18)", borderWidth: 1, borderColor: "rgba(139,92,246,0.35)" },
  altPlayerText: { color: "#a78bfa", fontSize: 13, fontWeight: "600" },

  // Buffering
  bufferingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  bufferingSpinner: { opacity: 0.7 },

  // Controls
  controls: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  ctrlGradTop: { position: "absolute", top: 0, left: 0, right: 0, height: 120, backgroundColor: "transparent", backgroundImage: undefined, opacity: 0.85 },
  ctrlGradBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 120, opacity: 0.85 },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, gap: 6 },
  centerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16 },
  bottomBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 20, gap: 10 },
  iconBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  iconBtnSmall: { width: 32, height: 32, justifyContent: "center", alignItems: "center", borderRadius: 8 },
  playBtn: { width: 64, height: 64, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 32 },
  seekLabel: { color: "#fff", fontSize: 9, fontWeight: "700", position: "absolute", bottom: 6 },
  ctrlTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  ctrlEp: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 1 },
  ctrlContentLogo: { width: 120, height: 36 },
  ctrlSourceBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  ctrlSourceBadgeText: { fontSize: 9, fontWeight: "800" },
  qualityBadge: { backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  qualityBadgeText: { color: "rgba(255,255,255,0.7)", fontSize: 9, fontWeight: "700" },
  speedBadge: { backgroundColor: "rgba(229,9,20,0.3)", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  speedBadgeText: { color: RED, fontSize: 9, fontWeight: "800" },
  episodesBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  episodesBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  timeText: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600", minWidth: 44, textAlign: "center" },
  seekTrackOuter: { flex: 1, paddingVertical: 12, justifyContent: "center" },
  seekTrack: { borderRadius: 3, backgroundColor: "rgba(255,255,255,0.2)", overflow: "visible" },
  seekBuffered: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 3 },
  seekFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: RED, borderRadius: 3 },
  seekThumb: { position: "absolute", backgroundColor: "#fff", borderRadius: 10 },
  seekTooltip: { position: "absolute", bottom: 28, backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  seekTooltipText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  seekThumbnail: { position: "absolute", bottom: 26, overflow: "hidden", borderRadius: 8, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.18)", shadowColor: "#000", shadowOpacity: 0.7, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 10 },
  seekThumbnailImgBox: { overflow: "hidden", borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  seekThumbnailImgDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.12)" },
  seekThumbnailTimeRow: { backgroundColor: "rgba(15,15,15,0.95)", alignItems: "center", justifyContent: "center", height: 22 },
  seekThumbnailTime: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },

  // Seek flash
  seekFlash: { position: "absolute", top: 0, bottom: 0, width: W * 0.3, backgroundColor: "rgba(255,255,255,0.18)", justifyContent: "center", alignItems: "center", gap: 8 },
  seekFlashText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // Speed boost
  speedBoostBadge: { position: "absolute", top: "50%", left: "50%", transform: [{ translateX: -30 }, { translateY: -15 }], flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  speedBoostText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  // Skip intro/credits
  skipIntroBtnPos: { position: "absolute", bottom: 80, right: 24 },
  skipCreditsBtnPos: { position: "absolute", bottom: 80, right: 24 },
  skipIntroBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  skipIntroBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // Next ep countdown — immersive side panel
  nextEpPanel: { position: "absolute", top: 0, right: 0, bottom: 0, width: "42%", overflow: "hidden" },
  nextEpPanelBg: { ...StyleSheet.absoluteFillObject, backgroundColor: "#0a0a0a" },
  nextEpPanelDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.72)" },
  nextEpPanelContent: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 18, gap: 12 },
  nextEpCountdownCircle: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: RED, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(229,9,20,0.12)" },
  nextEpCountdownNum: { color: "#fff", fontSize: 26, fontWeight: "900", lineHeight: 28 },
  nextEpCountdownUnit: { color: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: "600" },
  nextEpCountdownLabel: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "700", textAlign: "center" },
  nextEpName: { color: "rgba(255,255,255,0.65)", fontSize: 11, textAlign: "center", lineHeight: 15 },
  nextEpNowBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: RED, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  nextEpNowBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  nextEpCancelBtn: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  nextEpCancelText: { color: "rgba(255,255,255,0.6)", fontSize: 11 },

  // Sleep badge
  sleepBadge: { position: "absolute", top: 54, right: 16, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  sleepBadgeText: { color: "#aaa", fontSize: 11 },
  hudPill: { position: "absolute", top: "40%" as any, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.72)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginTop: -18 },
  hudBar: { width: 100, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" },
  hudBarFill: { height: 4, backgroundColor: "#fff", borderRadius: 2 },
  hudPct: { color: "#fff", fontSize: 13, fontWeight: "700" as const, minWidth: 34 },

  // Lock screen
  lockOverlay: { justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.3)" },
  lockUnlockBtn: { alignItems: "center", gap: 8 },
  lockUnlockText: { color: "rgba(255,255,255,0.6)", fontSize: 12 },

  // Speed panel
  panelOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  speedPanelBox: { backgroundColor: "#1a1a1a", borderRadius: 16, padding: 8, minWidth: 200, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  speedPanelTitle: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "700", textAlign: "center", paddingVertical: 8 },
  speedOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderRadius: 10 },
  speedOptionText: { color: "#fff", fontSize: 15, fontWeight: "600" },

  // Quality option badge
  qualityOptionBadge: { backgroundColor: "rgba(229,9,20,0.25)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 },
  qualityOptionBadgeText: { color: RED, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },

  // Swipe-to-seek indicator
  swipeSeekIndicator: { position: "absolute", top: "50%", left: "50%", transform: [{ translateX: -70 }, { translateY: -45 }], alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 16, paddingHorizontal: 24, paddingVertical: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  swipeSeekDelta: { color: "#fff", fontSize: 26, fontWeight: "800" },
  swipeSeekTarget: { color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: "600" },

  // Session modal
  sessionModal: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center" },
  sessionBox: { backgroundColor: "#1a1a1a", borderRadius: 16, padding: 28, alignItems: "center", gap: 12, maxWidth: 320, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  sessionTitle: { color: "#fff", fontSize: 18, fontWeight: "800", textAlign: "center" },
  sessionMsg: { color: "rgba(255,255,255,0.6)", fontSize: 13, textAlign: "center", lineHeight: 20 },
  sessionBtn: { backgroundColor: RED, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  sessionBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // Episodes panel
  episodesPanel: { position: "absolute", top: 0, right: 0, bottom: 0, borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  panelHeader: { height: 140, overflow: "hidden", position: "relative" },
  panelBackdropGrad: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.72)" },
  panelHeaderRow: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  panelTitle: { color: "#fff", fontSize: 15, fontWeight: "800", lineHeight: 19 },
  panelCurrentEp: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 3 },
  panelCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.14)", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  panelAutoPlayRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  panelAutoPlayText: { color: "#888", fontSize: 11, fontWeight: "600", flex: 1 },
  panelAutoPlayToggle: { width: 34, height: 20, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 10, flexShrink: 0 },
  panelAutoPlayKnob: { width: 16, height: 16, backgroundColor: "#fff", borderRadius: 8, marginTop: 2, marginLeft: 2 },
  panelSeasonRow: { paddingHorizontal: 10, paddingVertical: 8, maxHeight: 50 },
  panelSeasonBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", marginRight: 6 },
  panelSeasonText: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "700" },
  panelEmpty: { color: "rgba(255,255,255,0.35)", fontSize: 13 },

  // Episode card (full-width, stacked: image top + info bottom)
  panelEpCard: { borderRadius: 12, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  panelEpCardActive: { borderColor: RED, borderWidth: 1.5, backgroundColor: "rgba(229,9,20,0.08)" },
  panelEpCardThumb: { width: "100%", backgroundColor: "#111", overflow: "hidden" },
  panelEpThumbFallback: { justifyContent: "center", alignItems: "center", backgroundColor: "#111" },
  panelEpThumbGrad: { position: "absolute", bottom: 0, left: 0, right: 0, height: 40, backgroundColor: "rgba(0,0,0,0.5)" },
  panelEpPlayOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  panelEpPlayCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(229,9,20,0.85)", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#fff" },
  panelEpNumBadge: { position: "absolute", top: 8, left: 8, backgroundColor: "rgba(0,0,0,0.72)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  panelEpNumBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  panelEpRuntimeBadge: { position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.72)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  panelEpRuntimeBadgeText: { color: "rgba(255,255,255,0.75)", fontSize: 10, fontWeight: "600" },
  panelEpCardInfo: { padding: 10, gap: 4 },
  panelEpActiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: RED, flexShrink: 0 },
  panelEpName: { color: "#fff", fontSize: 13, fontWeight: "700", lineHeight: 17, flex: 1 },
  panelEpRating: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "600" },
  panelEpOverview: { color: "rgba(255,255,255,0.45)", fontSize: 11, lineHeight: 15, marginTop: 2 },
  panelEpWatchedTxt: { color: RED, fontSize: 10, fontWeight: "700" },

  // Similar movies panel (movies only, last 10 min)
  similarPanel: { position: "absolute", bottom: 0, left: 0, right: 0, overflow: "hidden", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },
  similarPanelInner: { paddingTop: 14, paddingBottom: 16 },
  similarHeader: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, marginBottom: 12 },
  similarTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  similarSubtitle: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 },
  similarScroll: { paddingHorizontal: 14, gap: 10 },
  similarCard: { width: 100, borderRadius: 10, overflow: "hidden", backgroundColor: "#111" },
  similarCardImg: { width: 100, height: 150, borderRadius: 10 },
  similarCardOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.2)" },
  similarCardBadge: { position: "absolute", top: 6, left: 6, backgroundColor: "rgba(0,0,0,0.72)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  similarCardBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  similarCardTitle: { position: "absolute", bottom: 0, left: 0, right: 0, color: "#fff", fontSize: 10, fontWeight: "700", paddingHorizontal: 6, paddingBottom: 6, paddingTop: 20, backgroundColor: "rgba(0,0,0,0.55)" },
  similarBtnsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 14, marginTop: 12 },
  similarBtnRemind: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 10, paddingVertical: 10 },
  similarBtnRemindText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  similarBtnNever: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(229,9,20,0.12)", borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(229,9,20,0.3)" },
  similarBtnNeverText: { color: "#e50914", fontSize: 12, fontWeight: "600" },
});
