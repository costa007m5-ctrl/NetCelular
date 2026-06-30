import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Dimensions,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  Vibration,
  View,
  Image,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { apiList, apiSignedUrl, r2Route, drivePlayDirect } from "@/lib/r2-direct";
import { recordContentView } from "@/lib/view-tracker";
import { saveLocalProgress } from "@/hooks/useWatchProgress";
import { getApiBase } from "@/lib/api";
import { TeraboxWebViewResolver } from "@/lib/terabox-webview-resolver";
import { downloadsManager } from "@/lib/downloads";
import { CastModal } from "@/components/CastModal";
import { getProxiedStreamUrl } from "@/lib/gdrive-index";
import { useAuth } from "@/lib/auth-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import { checkAndStartSession, heartbeatSession, endSession, getWhatsAppLink } from "@/lib/session-manager";
import {
  getCachedSignedUrl, setCachedSignedUrl,
  getCachedEpisodes, setCachedEpisodes,
} from "@/lib/r2-cache";
import StingOverlay from "@/components/StingOverlay";

const H = Dimensions.get("window").height;

let Video: any = null;
let ResizeMode: any = null;
try { const av = require("expo-av"); Video = av.Video; ResizeMode = av.ResizeMode; } catch {}


let ScreenOrientation: any = null;
try { ScreenOrientation = require("expo-screen-orientation"); } catch {}

let NavBar: any = null;
try { NavBar = require("expo-navigation-bar"); } catch {}

let activateKeepAwake: (() => void) | null = null;
let deactivateKeepAwake: (() => void) | null = null;
try { const ka = require("expo-keep-awake"); activateKeepAwake = ka.activateKeepAwake; deactivateKeepAwake = ka.deactivateKeepAwake; } catch {}

const RED = "#e50914";
const TMDB_IMG = (path: string | null | undefined, size = "w1280") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
const SKIP_INTRO_MAX_S = 90;
const SKIP_CREDITS_BEFORE_END_S = 180;
const AUTO_HIDE_MS = 4500;
const NEXT_EP_COUNTDOWN_S = 15;
const PRELOAD_TRIGGER_RATIO = 0.80;
const SAVE_INTERVAL_MS = 15000;

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;
const SLEEP_PRESETS = [15, 30, 45, 60, 90] as const;

interface RegistryItem {
  id: string; r2Key: string; teraboxUrl?: string; fileIndex?: number; fileName?: string;
  driveUrl?: string; driveDirectUrl?: string; driveFilePath?: string; driveNum?: number;
  tmdbId: number; tmdbType: "movie" | "tv";
  title: string; label: string; season: number | null; episode: number | null;
  quality?: string;
}

interface TmdbEpisode {
  episode_number: number;
  name: string;
  overview?: string;
  still_path?: string | null;
  runtime?: number | null;
}

function mkSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

const _translateCache = new Map<string, string>();
async function translateToPtBr(text: string): Promise<string> {
  if (!text?.trim()) return text;
  const key = text.trim();
  if (_translateCache.has(key)) return _translateCache.get(key)!;
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(key)}&langpair=en|pt-BR`,
      { signal: mkSignal(8000) }
    );
    if (!res.ok) return text;
    const data = await res.json();
    const translated: string = data?.responseData?.translatedText ?? text;
    _translateCache.set(key, translated);
    return translated;
  } catch { return text; }
}

async function resolveVideoKey(key: string, episodeNum?: number | null): Promise<string> {
  if (!key.endsWith("/")) return key;
  const data = await apiList(key, undefined, false, undefined);
  const videoExts = /\.(mp4|mkv|mov|avi|webm|m4v|ts|m2ts|wmv|flv|ogv)$/i;
  const videos = (data.files ?? []).filter((f: any) => f.isVideo || videoExts.test(f.key));
  if (videos.length === 0) throw new Error("Nenhum vídeo encontrado na pasta");
  if (episodeNum != null) {
    const n = episodeNum;
    const pats = [
      new RegExp(`[Ee]p?0*${n}(?!\\d)`, "i"),
      new RegExp(`[Ee]p?\\s*0*${n}[^\\d]`, "i"),
      new RegExp(`[-_.\\s]0*${n}[-_.\\s]`),
      new RegExp(`\\b0*${n}\\b`),
    ];
    for (const pat of pats) {
      const hit = videos.find((f: any) => pat.test(f.key.split("/").pop() ?? f.key));
      if (hit) return hit.key;
    }
  }
  const sorted = [...videos].sort((a: any, b: any) => (a.key ?? "").localeCompare(b.key ?? ""));
  return sorted[0].key;
}

async function fetchSignedUrlCached(key: string, episodeNum?: number | null): Promise<string> {
  const cacheKey = `${key}__ep${episodeNum ?? ""}`;
  const cached = await getCachedSignedUrl(cacheKey);
  if (cached) return cached;
  const resolvedKey = await resolveVideoKey(key, episodeNum);
  const data = await apiSignedUrl(resolvedKey);
  await setCachedSignedUrl(cacheKey, data.url);
  return data.url;
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
        side === "left" ? { left: 0, borderTopRightRadius: 80, borderBottomRightRadius: 80 } : { right: 0, borderTopLeftRadius: 80, borderBottomLeftRadius: 80 },
        { opacity: anim },
      ]}
    >
      <Feather name={side === "left" ? "rotate-ccw" : "rotate-cw"} size={30} color="#fff" />
      <Text style={styles.seekFlashText}>{side === "left" ? "-15s" : "+15s"}</Text>
    </Animated.View>
  );
}

export default function R2PlayerScreen() {
  const { width: W } = useWindowDimensions();
  const params = useLocalSearchParams<{
    key: string; registryItemId?: string; teraboxItemId?: string; driveItemId?: string; flix2ItemUrl?: string;
    fallbackDriveItemId?: string; fallbackFlix2Url?: string;
    title: string; episodeName?: string;
    season?: string; episode?: string; backdropPath?: string; posterPath?: string;
    tmdbId?: string; type?: string; r2ItemsJson?: string;
    watchSeason?: string; watchEpisode?: string; watchProgressRatio?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { user } = useAuth();

  // ── Params ─────────────────────────────────────────────────────────────────
  const title = params.title ?? "Assistindo";
  const episodeName = params.episodeName ?? "";
  const season = params.season ? Number(params.season) : null;
  const episode = params.episode ? Number(params.episode) : null;
  const backdropPath = params.backdropPath ?? null;
  const posterPath = params.posterPath ?? null;
  const tmdbId = params.tmdbId ? Number(params.tmdbId) : null;
  const contentType = params.type ?? "movie";
  const isTV = contentType === "tv";
  const savedProgressRatio = params.watchProgressRatio ? Number(params.watchProgressRatio) : 0;
  const isDrive = !!params.driveItemId;
  const isFlix2 = !!params.flix2ItemUrl;
  const isTerabox = !!params.teraboxItemId;
  const hasFallbackDrive = !!params.fallbackDriveItemId;
  const hasFallbackFlix2 = !!params.fallbackFlix2Url;
  const r2Items: RegistryItem[] = (() => {
    try { return params.r2ItemsJson ? JSON.parse(params.r2ItemsJson) : []; } catch { return []; }
  })();
  const r2EpisodeItems = isTV ? r2Items.filter((i) => i.episode != null) : [];
  const r2Seasons = isTV
    ? [...new Set(r2EpisodeItems.filter((i) => i.season != null).map((i) => i.season as number))].sort((a, b) => a - b)
    : [];
  const r2SeasonFolders = isTV ? r2Items.filter((i) => i.season != null && i.episode == null) : [];
  const watchSeason = params.watchSeason ? Number(params.watchSeason) : null;
  const watchEpisode = params.watchEpisode ? Number(params.watchEpisode) : null;

  // ── Sting overlay ─────────────────────────────────────────────────────────
  const [showSting, setShowSting] = useState(Platform.OS !== "web");

  // ── Core state ─────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [autoRetryCountdown, setAutoRetryCountdown] = useState<number | null>(null);
  const autoRetryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tbUploadState, setTbUploadState] = useState<{ jobId: string; progress: number; status: string; message: string } | null>(null);
  const tbPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeDriveOverride, setActiveDriveOverride] = useState<string | null>(null);
  const [activeFlix2Override, setActiveFlix2Override] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [tbWebViewMode, setTbWebViewMode] = useState<{ url: string; fileName: string } | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoSourceHeaders, setVideoSourceHeaders] = useState<Record<string, string> | null>(null);
  const [showCastModal, setShowCastModal] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [bufferedRatio, setBufferedRatio] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);
  const [showTimeRemaining, setShowTimeRemaining] = useState(false);

  // ── New feature state ───────────────────────────────────────────────────────
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
  const [fromCache, setFromCache] = useState(false);
  const [videoResolution, setVideoResolution] = useState<string | null>(null);
  const [showQualityPanel, setShowQualityPanel] = useState(false);

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

  // ── Volume (right 28% vertical swipe → expo-av setVolumeAsync) ─────────────
  const [volumeLevel, setVolumeLevel] = useState(1.0);
  const [showVolumeHud, setShowVolumeHud] = useState(false);
  const volumeAtStart = useRef(1.0);
  const volumeLevelRef = useRef(1.0);
  const volumeHudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeKeyRef = useRef<string>(params.key ?? "");
  // ── TeraBox quality picker state ────────────────────────────────────────────
  const [teraboxQualities, setTeraboxQualities] = useState<Record<string, string>>({});
  const [teraboxQuality, setTeraboxQuality] = useState<string>("Automático");
  const teraboxQualityRef = useRef<string>("Automático");
  const lockAnim = useRef(new Animated.Value(0)).current;

  // ── Episodes panel ──────────────────────────────────────────────────────────
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [panelSeason, setPanelSeason] = useState<number>(season ?? 1);
  const [panelEpisodes, setPanelEpisodes] = useState<TmdbEpisode[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [tmdbTotalSeasons, setTmdbTotalSeasons] = useState<number>(1);
  const [expandedEpOverview, setExpandedEpOverview] = useState<number | null>(null);
  const [sessionBlocked, setSessionBlocked] = useState<"trial_expired" | "plan_expired" | "limit_exceeded" | null>(null);

  // ── Buffering state ──────────────────────────────────────────────────────────
  const [isBuffering, setIsBuffering] = useState(false);
  // Tracks whether playback has started at least once for the current video.
  // Prevents expo-av's initial isPlaying:false status from killing shouldPlay.
  const hasStartedPlayingRef = useRef(false);

  // ── TMDB content logo + loading tips ────────────────────────────────────────
  const [contentLogo, setContentLogo] = useState<string | null>(null);
  const [loadingTips, setLoadingTips] = useState<string[]>([]);
  const [tipIdx, setTipIdx] = useState(0);
  const tipTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Animated refs ───────────────────────────────────────────────────────────
  const panelAnim = useRef(new Animated.Value(0)).current;
  const loadProgress = useRef(new Animated.Value(0)).current;
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const videoOpacity = useRef(new Animated.Value(0)).current;
  const seekFlashLeft = useRef(new Animated.Value(0)).current;
  const seekFlashRight = useRef(new Animated.Value(0)).current;
  const speedBoostOpacity = useRef(new Animated.Value(0)).current;
  const fakeAnim = useRef<Animated.CompositeAnimation | null>(null);

  // ── Mutable refs ─────────────────────────────────────────────────────────────
  const videoRef = useRef<any>(null);
  const phaseRef = useRef<"loading" | "ready" | "error">("loading");
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSeekedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const positionMsRef = useRef(0);
  const durationMsRef = useRef(0);
  const seekBarWidthRef = useRef(0);
  const lastPosSetRef = useRef(0); // throttle setPositionMs to avoid excessive re-renders
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preloadedNextUrlRef = useRef<string | null>(null);
  const preloadingRef = useRef(false);
  const sleepCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Quality variants (same content, different r2Key = different quality) ────
  const qualityVariants = useMemo<RegistryItem[]>(() => {
    if (!r2Items.length || isDrive || isFlix2) return [];
    if (!isTV) {
      // Filme: todas as entradas r2 sem season/episode
      const movies = r2Items.filter((i) => i.r2Key && !i.teraboxUrl && i.season == null && i.episode == null);
      return movies.length > 1 ? movies : [];
    }
    if (episode != null) {
      // Episódio: entradas com mesmo season+episode
      const variants = r2Items.filter((i) => i.season === season && i.episode === episode && i.r2Key);
      return variants.length > 1 ? variants : [];
    }
    // Pasta de temporada: todas as pastas com mesmo season
    const folderVariants = r2Items.filter((i) => i.season === season && i.episode == null && i.r2Key);
    return folderVariants.length > 1 ? folderVariants : [];
  }, [r2Items, isDrive, isFlix2, isTV, season, episode]);

  const activeVariant = qualityVariants.find((i) => i.r2Key === activeKeyRef.current) ?? qualityVariants[0] ?? null;

  // ── Computed seasons ────────────────────────────────────────────────────────
  const displaySeasons: number[] = (() => {
    // Union episode-level seasons AND folder-level seasons so neither type hides the other
    const folderSeasons = [...new Set(r2SeasonFolders.map((i) => i.season as number))];
    const allRegistered = [...new Set([...r2Seasons, ...folderSeasons])].sort((a, b) => a - b);
    if (allRegistered.length > 0) return allRegistered;
    return Array.from({ length: tmdbTotalSeasons }, (_, i) => i + 1);
  })();

  const progress = durationMs > 0 ? positionMs / durationMs : 0;
  const positionSec = Math.floor(positionMs / 1000);
  const durationSec = Math.floor(durationMs / 1000);
  const remainingSec = durationSec - positionSec;
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
    Animated.timing(controlsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(controlsOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() =>
        setControlsVisible(false)
      );
    }, AUTO_HIDE_MS);
  }, [isLocked, controlsOpacity]);

  // ── Orientation / nav bar ───────────────────────────────────────────────────
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

  // ── Session limit tracking ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    checkAndStartSession(user.id, user.role).then((result) => {
      if (result !== "ok") setSessionBlocked(result);
    });
    const hbInterval = setInterval(heartbeatSession, 20000);
    return () => { clearInterval(hbInterval); endSession(); };
  }, [user?.id]);

  // ── TMDB total seasons ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTV || !tmdbId) return;
    const ctrl = new AbortController();
    fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_KEY}&language=pt-BR`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => { if (data.number_of_seasons > 0) setTmdbTotalSeasons(data.number_of_seasons); })
      .catch(() => {});
    return () => ctrl.abort();
  }, [tmdbId, isTV]);

  // ── TMDB content logo + loading tips ────────────────────────────────────────
  useEffect(() => {
    if (!tmdbId) return;
    const ctrl = new AbortController();
    const type = contentType === "tv" ? "tv" : "movie";
    Promise.all([
      fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_KEY}&language=pt-BR&append_to_response=credits`, { signal: ctrl.signal }),
      fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}/images?api_key=${TMDB_KEY}&include_image_language=en,pt,null`, { signal: ctrl.signal }),
    ]).then(async ([detailsRes, imagesRes]) => {
      const details = detailsRes.ok ? await detailsRes.json() : null;
      const images = imagesRes.ok ? await imagesRes.json() : null;
      const logos: any[] = images?.logos ?? [];
      const best = logos.find((l) => l.iso_639_1 === "pt") ?? logos.find((l) => l.iso_639_1 === "en") ?? logos[0];
      if (best?.file_path) setContentLogo(`https://image.tmdb.org/t/p/w500${best.file_path}`);
      if (details) {
        const tips: string[] = [];
        if (details.tagline) tips.push(`"${details.tagline}"`);
        if (details.vote_average > 0) tips.push(`⭐ ${details.vote_average.toFixed(1)} de 10 — ${(details.vote_count ?? 0).toLocaleString("pt-BR")} avaliações`);
        const genres = (details.genres ?? []).slice(0, 3).map((g: any) => g.name).join(" · ");
        if (genres) tips.push(`Gênero: ${genres}`);
        if (type === "movie" && details.runtime) tips.push(`Duração: ${Math.floor(details.runtime / 60)}h ${details.runtime % 60}min`);
        if (type === "tv" && details.number_of_seasons) tips.push(`${details.number_of_seasons} temporada${details.number_of_seasons > 1 ? "s" : ""} · ${details.number_of_episodes ?? 0} episódios`);
        const cast = (details.credits?.cast ?? []).slice(0, 3).map((c: any) => c.name).join(", ");
        if (cast) tips.push(`Com ${cast}`);
        const director = (details.credits?.crew ?? []).find((c: any) => c.job === "Director");
        if (director) tips.push(`Dirigido por ${director.name}`);
        if (details.overview) tips.push(details.overview.length > 130 ? details.overview.slice(0, 130) + "…" : details.overview);
        const country = details.production_countries?.[0]?.name;
        if (country) tips.push(`Produção: ${country}`);
        if (tips.length > 0) setLoadingTips(tips);
      }
    }).catch(() => {});
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

  // ── Fetch video URL (with cache) ────────────────────────────────────────────
  const loadVideoUrl = useCallback(async () => {
    const effectiveDriveId = activeDriveOverride ?? (isDrive ? params.driveItemId! : null);
    const effectiveFlix2Url = activeFlix2Override ?? (isFlix2 ? params.flix2ItemUrl! : null);
    const isEffectiveDrive = !!effectiveDriveId && !effectiveFlix2Url;
    const isEffectiveFlix2 = !!effectiveFlix2Url;

    if (!isEffectiveDrive && !isEffectiveFlix2 && !activeKeyRef.current && !isTerabox) { setPhase("error"); setErrorMsg("Arquivo não especificado"); return; }

    // ── TeraBox: resolve via server API (xAPIverse) ─────────────────────────
    if (isTerabox && params.teraboxItemId) {
      phaseRef.current = "loading";
      setPhase("loading");
      setVideoUrl(null);
      setVideoSourceHeaders(null);
      setIsPlaying(false);
      setIsBuffering(false);
      hasStartedPlayingRef.current = false;
      setPositionMs(0);
      setDurationMs(0);
      hasSeekedRef.current = false;
      preloadedNextUrlRef.current = null;
      preloadingRef.current = false;
      setVideoResolution(null);
      setTeraboxQualities({});
      setTeraboxQuality("Automático");
      teraboxQualityRef.current = "Automático";
      fakeAnim.current = Animated.timing(loadProgress, { toValue: 80, duration: 6000, useNativeDriver: false });
      fakeAnim.current.start();
      try {
        const data = await r2Route<{
          url?: string; urlType?: string; needsProxy?: boolean; needsWebView?: boolean;
          fast_stream_url?: Record<string, string>;
          name?: string; error?: string;
          uploading?: boolean; jobId?: string; progress?: number; status?: string; message?: string;
        }>(`/terabox/play?id=${encodeURIComponent(params.teraboxItemId)}`);

        // ── 202: fallback upload em progresso — mostra UI de espera e faz polling ──
        if (data.uploading) {
          fakeAnim.current?.stop();
          const itemId = params.teraboxItemId!;
          const startState = { jobId: data.jobId ?? "", progress: data.progress ?? 0, status: data.status ?? "queued", message: data.message ?? "Preparando vídeo…" };
          setTbUploadState(startState);
          if (tbPollRef.current) clearInterval(tbPollRef.current);
          tbPollRef.current = setInterval(async () => {
            try {
              const base = getApiBase();
              const pr = await fetch(`${base}/api/r2/terabox/r2-fallback-status?id=${encodeURIComponent(itemId)}`);
              const pd = await pr.json();
              setTbUploadState((prev) => prev ? { ...prev, progress: pd.progress ?? prev.progress, status: pd.status ?? prev.status, message: pd.message ?? prev.message } : null);
              if (pd.status === "done") {
                if (tbPollRef.current) { clearInterval(tbPollRef.current); tbPollRef.current = null; }
                setTbUploadState(null);
                if (pd.r2Url) {
                  loadProgress.setValue(100);
                  setVideoUrl(pd.r2Url);
                  phaseRef.current = "ready";
                  setPhase("ready");
                  setIsPlaying(true);
                } else {
                  setPhase("error");
                  setErrorMsg("Upload concluído mas URL indisponível. Tente novamente.");
                }
              } else if (pd.status === "error") {
                if (tbPollRef.current) { clearInterval(tbPollRef.current); tbPollRef.current = null; }
                setTbUploadState(null);
                setPhase("error");
                setErrorMsg(pd.message ?? "Falha ao preparar vídeo. Tente novamente.");
              }
            } catch {}
          }, 4000);
          return;
        }

        if (data.error) throw new Error(data.error);
        if (!data.url) throw new Error("URL de stream não disponível");

        // Folder-based TeraBox item — open WebView resolver instead of direct play
        if (data.needsWebView || data.urlType === "webview") {
          fakeAnim.current?.stop();
          loadProgress.setValue(100);
          setTbWebViewMode({ url: data.url, fileName: data.name ?? "" });
          phaseRef.current = "ready";
          setPhase("ready");
          return;
        }

        // Build quality map: "Automático" = best quality chosen by server, then each HLS quality
        const qmap: Record<string, string> = { "Automático": data.url };
        if (data.fast_stream_url) {
          const qualityOrder = ["1080p", "720p", "480p", "360p", "240p"];
          for (const q of qualityOrder) {
            if (data.fast_stream_url[q]) qmap[q] = data.fast_stream_url[q];
          }
        }
        setTeraboxQualities(qmap);
        teraboxQualityRef.current = "Automático";
        setTeraboxQuality("Automático");

        // xAPIverse HLS via CF Workers — CORS open, no auth needed. Play immediately (tokens are short-lived).
        fakeAnim.current?.stop();
        loadProgress.setValue(100);
        setVideoUrl(data.url);
        phaseRef.current = "ready";
        setPhase("ready");
        setIsPlaying(true);
      } catch (e: any) {
        fakeAnim.current?.stop();
        setPhase("error");
        setErrorMsg(e?.message ?? "Erro ao resolver TeraBox");
      }
      return;
    }

    // ── Check for locally downloaded file ──────────────────────────────────
    if (tmdbId && Platform.OS !== "web") {
      try {
        const dlItem = await downloadsManager.getDownloadedItem(contentType as "movie" | "tv", tmdbId, season ?? undefined, episode ?? undefined);
        if (dlItem?.localUri) {
          let FileSystem: any = null;
          try { FileSystem = require("expo-file-system"); } catch {}
          const exists = FileSystem ? (await FileSystem.getInfoAsync(dlItem.localUri))?.exists : false;
          if (exists) {
            setVideoUrl(dlItem.localUri);
            phaseRef.current = "ready";
            setPhase("ready");
            setIsPlaying(true);
            return;
          }
        }
      } catch {}
    }

    phaseRef.current = "loading";
    setPhase("loading");
    setVideoUrl(null);
    setVideoSourceHeaders(null);
    setIsPlaying(false);
    setIsBuffering(false);
    hasStartedPlayingRef.current = false;
    setPositionMs(0);
    setDurationMs(0);
    hasSeekedRef.current = false;
    preloadedNextUrlRef.current = null;
    preloadingRef.current = false;
    setVideoResolution(null);

    fakeAnim.current = Animated.timing(loadProgress, { toValue: 80, duration: (isEffectiveDrive || isEffectiveFlix2) ? 6000 : 3000, useNativeDriver: false });
    fakeAnim.current.start();

    try {
      let url: string;
      if (isEffectiveFlix2) {
        // Flix 2.0: nixplay.lat stream_url redirects 302 → signed CDN URL on cineveo CDN.
        // nocache=1: always bypass server cache — CDN signed URLs expire quickly.
        const rawUrl = effectiveFlix2Url!;
        const data = await r2Route<{ url: string; error?: string; via?: string }>(`/flix2/stream-url?streamUrl=${encodeURIComponent(rawUrl)}&nocache=1`);
        if (data.error) throw new Error(data.error);
        // CDN routing:
        //
        //  cineveo.lat (vod99.cineveo.lat) — HTTPS, token = exp+sig (time-based, any IP).
        //    → Play directly with browser UA headers. ExoPlayer uses Range natively.
        //
        //  fontedecanais (72yrci50ppqp71.com) — HTTP or HTTPS, token = username+token
        //    bound to the IP that resolved the nixplay redirect (Replit server).
        //    → MUST proxy: the proxy runs on the same server IP that got the token,
        //    so the CDN accepts the request. Direct play fails because ExoPlayer
        //    would use the device IP — CDN rejects with 403 → "Erro ao reproduzir".
        //
        //  Unresolved nixplay.lat URL (stream-url endpoint returned original URL) —
        //    direct play sends ExoPlayer to nixplay.lat which redirects to fontedecanais
        //    HTTP → cleartext block on Android APKs. Proxy handles the redirect safely.
        //
        //  Web → always proxy (CORS).
        const resolvedUrl = data.url;
        const isHttps = resolvedUrl.startsWith("https://");
        const isFontedecanais = ["72yrci50ppqp71.com", "fontedecanais.me"].some(
          (root) => resolvedUrl.includes(root)
        );
        const isUnresolved = resolvedUrl.includes("nixplay.lat/movie/");

        if (Platform.OS !== "web" && isHttps && !isFontedecanais && !isUnresolved) {
          // cineveo HTTPS: time-based sig works from any IP — direct with browser headers.
          url = resolvedUrl;
          setVideoSourceHeaders({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://nixplay.lat/",
            "Origin": "https://nixplay.lat",
          });
        } else {
          // Fontedecanais (IP-bound token), HTTP CDN, unresolved nixplay, or web → proxy.
          // Proxy runs on the same Replit server IP that resolved the token — CDN accepts.
          url = getProxiedStreamUrl(resolvedUrl);
        }
      } else if (isEffectiveDrive) {
        // Drive: resolve client-side (bypasses server IP block by Cloudflare).
        // When playing an episode with a season/episode override, prefer an exact per-episode
        // Drive registry item over the series-level fallback item that was passed in.
        let driveId = effectiveDriveId!;
        if (episode != null && season != null) {
          const exactEp = r2Items.find(
            (i) =>
              ((i as any).driveFilePath != null || !!i.driveUrl) &&
              Number(i.season) === season &&
              Number(i.episode) === episode
          );
          if (exactEp) driveId = exactEp.id;
        }
        const data = await drivePlayDirect(driveId);
        const isHttps = data.url.startsWith("https://");
        if (Platform.OS !== "web" && isHttps) {
          // HTTPS Drive CDN: pass directly with browser headers.
          url = data.url;
          setVideoSourceHeaders({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://animezey16082023.animezey16082023.workers.dev/",
          });
        } else {
          // HTTP or web: route through HTTPS proxy.
          url = getProxiedStreamUrl(data.url);
        }
      } else {
        if (Platform.OS === "web") {
          // No web: proxy via API server — evita CORS do R2 direto.
          // O endpoint /api/r2/stream aceita pastas e resolve episódio no servidor.
          let streamUrl = `/api/r2/stream?key=${encodeURIComponent(activeKeyRef.current)}`;
          if (episode != null) streamUrl += `&episode=${episode}`;
          url = streamUrl;
        } else {
          const cacheKey = `${activeKeyRef.current}__ep${episode ?? ""}`;
          const cached = await getCachedSignedUrl(cacheKey);
          if (cached) {
            setFromCache(true);
            url = cached;
          } else {
            setFromCache(false);
            url = await fetchSignedUrlCached(activeKeyRef.current, episode);
          }
        }
      }
      setVideoUrl(url);
      if (Platform.OS === "web") {
        fakeAnim.current?.stop();
        Animated.timing(loadProgress, { toValue: 100, duration: 300, useNativeDriver: false }).start(() => {
          phaseRef.current = "ready";
          setPhase("ready");
          setIsPlaying(true);
        });
      } else {
        fakeAnim.current = Animated.timing(loadProgress, { toValue: 95, duration: 1200, useNativeDriver: false });
        fakeAnim.current.start();
        readyTimer.current = setTimeout(() => {
          transitionToReady(0);
        }, 12000);
      }
    } catch (e: any) {
      setPhase("error");
      setErrorMsg(e.message ?? "Erro ao carregar vídeo");
      fakeAnim.current?.stop();
    }
  }, [params.flix2ItemUrl, params.driveItemId, isFlix2, isDrive, episode, r2Items, activeDriveOverride, activeFlix2Override]);

  // ── Reload when fallback source changes ──────────────────────────────────────
  useEffect(() => {
    if (activeDriveOverride !== null || activeFlix2Override !== null) {
      loadVideoUrl();
    }
  }, [activeDriveOverride, activeFlix2Override]);

  const switchQuality = useCallback((item: RegistryItem) => {
    activeKeyRef.current = item.r2Key;
    setShowQualityPanel(false);
    setVideoResolution(null);
    loadVideoUrl();
  }, [loadVideoUrl]);

  const switchTeraboxQuality = useCallback((qKey: string, url: string) => {
    teraboxQualityRef.current = qKey;
    setTeraboxQuality(qKey);
    setShowQualityPanel(false);
    setVideoResolution(null);
    setVideoUrl(url);
    setIsPlaying(true);
  }, []);

  useEffect(() => {
    // Sync activeKeyRef when params change (new item navigated to)
    activeKeyRef.current = params.key ?? "";
    setRetryCount(0);
    setAutoRetryCountdown(null);
    if (autoRetryTimerRef.current) { clearInterval(autoRetryTimerRef.current); autoRetryTimerRef.current = null; }
    loadVideoUrl();
  }, [params.key, params.registryItemId, params.flix2ItemUrl, params.driveItemId]);

  // ── Auto-retry on first error; then auto-fallback to alternative source ─────
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
    } else if (phase === "error" && retryCount === 1) {
      // After first retry failed, try fallback source if available
      const effectiveFlix2 = activeFlix2Override ?? (isFlix2 ? params.flix2ItemUrl! : null);
      const effectiveDriveId = activeDriveOverride ?? (isDrive ? params.driveItemId! : null);
      const isCurrentlyFlix2 = !!effectiveFlix2;
      const isCurrentlyDrive = !!effectiveDriveId && !effectiveFlix2;

      if (isCurrentlyFlix2 && hasFallbackDrive && params.fallbackDriveItemId) {
        setFallbackNotice("Flix 2.0 indisponível. Tentando Drive...");
        setActiveDriveOverride(params.fallbackDriveItemId);
        setActiveFlix2Override(null);
        setRetryCount(0);
        setTimeout(() => setFallbackNotice(null), 4000);
      } else if (isCurrentlyDrive && hasFallbackFlix2 && params.fallbackFlix2Url) {
        setFallbackNotice("Drive indisponível. Tentando Flix 2.0...");
        setActiveFlix2Override(params.fallbackFlix2Url);
        setActiveDriveOverride(null);
        setRetryCount(0);
        setTimeout(() => setFallbackNotice(null), 4000);
      } else if (isCurrentlyFlix2 && tmdbId) {
        // No fallback source — auto-switch to embed WebView player (always available)
        setFallbackNotice("Flix 2.0 indisponível. Abrindo player alternativo…");
        setTimeout(() => {
          router.replace({
            pathname: "/player",
            params: {
              type: contentType,
              id: String(tmdbId),
              season: season != null ? String(season) : "",
              episode: episode != null ? String(episode) : "",
              title: title ?? "",
              posterPath: posterPath ?? "",
              backdropPath: backdropPath ?? "",
            },
          });
        }, 2000);
      }
    } else if (phase !== "error") {
      if (autoRetryTimerRef.current) { clearInterval(autoRetryTimerRef.current); autoRetryTimerRef.current = null; }
      setAutoRetryCountdown(null);
    }
    return () => {
      if (autoRetryTimerRef.current) { clearInterval(autoRetryTimerRef.current); autoRetryTimerRef.current = null; }
      if (tbPollRef.current) { clearInterval(tbPollRef.current); tbPollRef.current = null; }
    };
  }, [phase, retryCount]);

  // ── transitionToReady ───────────────────────────────────────────────────────
  const transitionToReady = useCallback((durationMillis = 0) => {
    if (phaseRef.current !== "loading") return;
    phaseRef.current = "ready";
    if (readyTimer.current) clearTimeout(readyTimer.current);
    setDurationMs(durationMillis);
    durationMsRef.current = durationMillis;
    fakeAnim.current?.stop();
    Animated.timing(loadProgress, { toValue: 100, duration: 400, useNativeDriver: false }).start(() => {
      setPhase("ready");
      setIsPlaying(true);
      if (!hasSeekedRef.current && savedProgressRatio > 0.02 && durationMillis > 0) {
        hasSeekedRef.current = true;
        const seekMs = Math.round(savedProgressRatio * durationMillis);
        setTimeout(() => {
          videoRef.current?.setPositionAsync(seekMs).catch(() => {});
        }, 600);
      }
    });
  }, [savedProgressRatio]);

  // ── Navigation: get next episode item ────────────────────────────────────────
  const getNextEpisodeItem = useCallback((): RegistryItem | null => {
    if (!isTV || season == null || episode == null) return null;
    const sortedEps = r2Items.filter((i) => i.season === season).sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
    const idx = sortedEps.findIndex((i) => i.episode === episode);
    const next = sortedEps[idx + 1];
    if (next) return next;
    const nextSeasonNum = season + 1;
    const firstNext = r2Items.filter((i) => i.season === nextSeasonNum).sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0))[0];
    return firstNext ?? null;
  }, [season, episode, r2Items, isTV]);

  const getPrevEpisodeItem = useCallback((): RegistryItem | null => {
    if (!isTV || season == null || episode == null) return null;
    const sortedEps = r2Items.filter((i) => i.season === season).sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
    const idx = sortedEps.findIndex((i) => i.episode === episode);
    if (idx > 0) return sortedEps[idx - 1];
    const prevSeasonNum = season - 1;
    if (prevSeasonNum < 1) return null;
    const prevSeasonEps = r2Items.filter((i) => i.season === prevSeasonNum).sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
    return prevSeasonEps[prevSeasonEps.length - 1] ?? null;
  }, [season, episode, r2Items, isTV]);

  // ── Preload next episode URL at 80% ─────────────────────────────────────────
  useEffect(() => {
    if (!isTV || !durationMs || preloadingRef.current) return;
    if (progress < PRELOAD_TRIGGER_RATIO) return;
    const nextItem = getNextEpisodeItem();
    if (!nextItem || preloadedNextUrlRef.current) return;
    preloadingRef.current = true;
    fetchSignedUrlCached(nextItem.r2Key, nextItem.episode)
      .then((url) => { preloadedNextUrlRef.current = url; }).catch(() => { preloadingRef.current = false; });
  }, [Math.floor(progress * 20), isTV, durationMs]);

  // ── Navigate to episode ─────────────────────────────────────────────────────
  const goToEpisode = useCallback((item: RegistryItem) => {
    haptic();
    setShowEpisodes(false);
    Animated.timing(panelAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start();
    router.replace({
      pathname: "/r2-player",
      params: {
        key: item.r2Key ?? "",
        registryItemId: "",
        title, episodeName: item.label,
        season: String(item.season ?? ""), episode: String(item.episode ?? ""),
        backdropPath: backdropPath ?? "", posterPath: posterPath ?? "",
        tmdbId: String(tmdbId ?? ""), type: contentType,
        r2ItemsJson: params.r2ItemsJson ?? "",
        watchSeason: params.watchSeason ?? "", watchEpisode: params.watchEpisode ?? "",
      },
    });
  }, [title, backdropPath, posterPath, tmdbId, contentType, params.r2ItemsJson]);

  const goToNextEpisode = useCallback(() => {
    if (!isTV || season == null || episode == null) { router.back(); return; }
    const next = getNextEpisodeItem();
    if (next) goToEpisode(next);
    else router.back();
  }, [season, episode, isTV, getNextEpisodeItem, goToEpisode]);

  const goToPrevEpisode = useCallback(() => {
    const prev = getPrevEpisodeItem();
    if (prev) goToEpisode(prev);
  }, [getPrevEpisodeItem, goToEpisode]);

  // ── Helper: label de qualidade a partir de altura em pixels ─────────────────
  const resolutionLabel = (h: number): string => {
    if (h >= 2160) return "4K";
    if (h >= 1080) return "1080p";
    if (h >= 720) return "720p";
    if (h >= 480) return "480p";
    if (h >= 360) return "360p";
    return "SD";
  };

  // ── Video callbacks ─────────────────────────────────────────────────────────
  const onVideoLoad = useCallback((status: any) => {
    // naturalSize disponível no evento de load do expo-av (web + native)
    const ns = status?.naturalSize;
    if (ns?.height && ns.height > 0) {
      const h = ns.orientation === "landscape" ? ns.height : Math.max(ns.width ?? 0, ns.height);
      setVideoResolution(resolutionLabel(h));
    }
    transitionToReady(status?.durationMillis ?? 0);
  }, [transitionToReady]);

  const onPlaybackStatusUpdate = useCallback((status: any) => {
    // Handle load error from expo-av
    if (status?.isLoaded === false && status?.error) {
      if (phaseRef.current === "loading" || phaseRef.current === "ready") {
        setPhase("error");
        const err = String(status.error ?? "");
        const isFmtErr = err.includes("NOPLAYABLE") || err.includes("cannot play") ||
          err.includes("format") || err.includes("unsupported") || err.includes("AVFoundation") ||
          err.includes("error -11800") || err.includes("error -11828");
        setErrorMsg(
          isFmtErr
            ? Platform.OS === "ios"
              ? "Formato MKV não suportado no iOS. Use Android para assistir."
              : "Formato de vídeo não suportado neste dispositivo."
            : "Erro ao reproduzir vídeo"
        );
      }
      return;
    }
    if (!status?.isLoaded) return;
    transitionToReady(status.durationMillis ?? 0);
    const buffering = !!(status.isBuffering);
    setIsBuffering(buffering);
    // Sync isPlaying with careful rules to avoid two bugs:
    // 1. Seek/buffer loop: expo-av briefly reports isPlaying:false while buffering — ignore.
    // 2. Initial-load false negative: expo-av reports isPlaying:false before first frame — ignore
    //    until the video has actually started playing (hasStartedPlayingRef guards this).
    if (status.isPlaying) {
      hasStartedPlayingRef.current = true;
      setIsPlaying(true);
    } else if (!buffering && hasStartedPlayingRef.current) {
      // Video was playing before and stopped (user paused, or playback ended)
      setIsPlaying(false);
    }
    // else: buffering=true OR video never started yet — don't touch isPlaying
    const pos = status.positionMillis ?? 0;
    const dur = status.durationMillis ?? 0;
    // Always update refs so seekBy / saveProgress see the latest value
    positionMsRef.current = pos;
    durationMsRef.current = dur;
    // Throttle React state updates to max once per 500ms to prevent
    // excessive re-renders (which cause flickering of the Video native layer)
    const now = Date.now();
    if (now - lastPosSetRef.current >= 500) {
      lastPosSetRef.current = now;
      setPositionMs(pos);
      setDurationMs(dur);
      if (dur > 0) setBufferedRatio(Math.min(1, (pos / dur) + 0.15));
    }
    if (status.didJustFinish) {
      if (continuousPlay) goToNextEpisode();
      else router.back();
    }
  }, [transitionToReady, goToNextEpisode, continuousPlay]);

  // ── Next episode countdown (last N seconds) ─────────────────────────────────
  useEffect(() => {
    if (!continuousPlay || !isTV || durationMs <= 0 || !isPlaying) {
      setShowNextEpCountdown(false);
      return;
    }
    const remaining = durationMs - positionMs;
    if (remaining > 0 && remaining <= NEXT_EP_COUNTDOWN_S * 1000) {
      setShowNextEpCountdown(true);
      setNextEpCountdownSec(Math.ceil(remaining / 1000));
    } else {
      setShowNextEpCountdown(false);
    }
  }, [Math.floor(positionMs / 500), durationMs, continuousPlay, isTV, isPlaying]);

  // ── Sleep timer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sleepTimerEnd) {
      setSleepMinutesLeft(null);
      if (sleepCheckRef.current) clearInterval(sleepCheckRef.current);
      return;
    }
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

  // ── Speed boost apply ────────────────────────────────────────────────────────
  useEffect(() => {
    if (videoRef.current && phase === "ready") {
      const rate = isSpeedBoost ? 2.0 : playbackSpeed;
      videoRef.current.setRateAsync(rate, true).catch(() => {});
    }
  }, [playbackSpeed, isSpeedBoost, phase]);

  // ── Lock screen animation ────────────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(lockAnim, { toValue: isLocked ? 1 : 0, duration: 200, useNativeDriver: true }).start();
    if (isLocked && hideTimer.current) {
      clearTimeout(hideTimer.current);
      setControlsVisible(false);
    }
  }, [isLocked]);

  // ── Save progress ────────────────────────────────────────────────────────────
  const saveProgress = useCallback(async () => {
    if (!user?.id || !tmdbId || !isSupabaseConfigured) return;
    const dur = durationMsRef.current;
    const pos = positionMsRef.current;
    if (dur <= 0 || pos <= 0) return;
    const ratio = Math.min(1, pos / dur);
    if (ratio < 0.02) return;
    // Save locally (always, regardless of auth)
    saveLocalProgress({
      contentId: `${contentType}_${tmdbId}`,
      tmdbId: String(tmdbId),
      type: contentType as "movie" | "tv",
      title,
      posterPath: posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : "",
      backdropPath: backdropPath ? `https://image.tmdb.org/t/p/w1280${backdropPath}` : "",
      progress: ratio,
      positionMs: pos,
      durationMs: dur,
      season: isTV && season != null ? season : undefined,
      episode: isTV && episode != null ? episode : undefined,
    }).catch(() => {});
    // Sync to Supabase cloud
    if (!user?.id || !isSupabaseConfigured) return;
    try {
      await db.progress.upsert({
        user_id: user.id, tmdb_id: tmdbId, type: contentType as "movie" | "tv",
        title, poster_path: posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : "",
        backdrop_path: backdropPath ? `https://image.tmdb.org/t/p/w1280${backdropPath}` : "",
        progress: ratio,
        position_ms: pos,
        duration_ms: dur,
        ...(isTV && season != null ? { season } : {}),
        ...(isTV && episode != null ? { episode } : {}),
      });
    } catch {}
  }, [user, tmdbId, contentType, title, posterPath, backdropPath, isTV, season, episode]);

  useEffect(() => {
    if (phase !== "ready") return;
    saveTimerRef.current = setInterval(saveProgress, SAVE_INTERVAL_MS);
    return () => { if (saveTimerRef.current) clearInterval(saveTimerRef.current); };
  }, [phase, saveProgress]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s === "background") saveProgress(); });
    return () => { sub.remove(); saveProgress(); };
  }, [saveProgress]);

  // ── Save on pause ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying && phase === "ready") saveProgress();
  }, [isPlaying]);

  // ── Animate video opacity on phase change (avoids inline style flicker) ──
  useEffect(() => {
    Animated.timing(videoOpacity, {
      toValue: phase === "ready" ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [phase]);

  // ── Keep screen awake while playing ─────────────────────────────────────
  const keepAwakeActive = useRef(false);
  useEffect(() => {
    if (isPlaying && phase === "ready") {
      try {
        const r = activateKeepAwake?.();
        // expo-keep-awake may return a Promise — suppress async rejection
        if (r && typeof (r as any).catch === "function") (r as any).catch(() => {});
        keepAwakeActive.current = true;
      } catch {}
    } else if (keepAwakeActive.current) {
      try {
        const r = deactivateKeepAwake?.();
        if (r && typeof (r as any).catch === "function") (r as any).catch(() => {});
        keepAwakeActive.current = false;
      } catch {}
    }
    return () => {
      if (keepAwakeActive.current) {
        try {
          const r = deactivateKeepAwake?.();
          if (r && typeof (r as any).catch === "function") (r as any).catch(() => {});
          keepAwakeActive.current = false;
        } catch {}
      }
    };
  }, [isPlaying, phase]);

  // ── Controls auto-hide trigger ────────────────────────────────────────────
  useEffect(() => { if (phase === "ready") showControls(); }, [phase]);
  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (readyTimer.current) clearTimeout(readyTimer.current);
    if (sleepCheckRef.current) clearInterval(sleepCheckRef.current);
  }, []);

  // ── Seek helpers ────────────────────────────────────────────────────────────
  const togglePlay = useCallback(async () => {
    if (!videoRef.current) return;
    haptic(30);
    if (isPlaying) await videoRef.current.pauseAsync();
    else await videoRef.current.playAsync();
    showControls();
  }, [isPlaying, showControls, haptic]);

  const seekBy = useCallback(async (deltaMs: number) => {
    if (!videoRef.current) return;
    const newPos = Math.max(0, Math.min(durationMsRef.current, positionMsRef.current + deltaMs));
    await videoRef.current.setPositionAsync(newPos).catch(() => {});
    setPositionMs(newPos);
    positionMsRef.current = newPos;
    showControls();
  }, [showControls]);

  const skipIntro = useCallback(() => {
    haptic([0, 40, 60, 40]);
    seekBy(SKIP_INTRO_MAX_S * 1000 - positionMs);
  }, [seekBy, positionMs, haptic]);

  const skipCredits = useCallback(() => {
    haptic([0, 40, 60, 40]);
    goToNextEpisode();
  }, [goToNextEpisode, haptic]);

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
        const deltaSec = Math.round((gs.dx / 360) * 120);
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

  // ── Tap handler: single vs double tap ────────────────────────────────────────
  const handleTap = useCallback((px: number) => {
    const now = Date.now();
    const zoneW = W / 3;
    const isLeft = px < zoneW;
    const isRight = px > W - zoneW;

    if (lastTapRef.current && now - lastTapRef.current.time < 350 && Math.abs(px - lastTapRef.current.x) < 80) {
      if (tapTimerRef.current) { clearTimeout(tapTimerRef.current); tapTimerRef.current = null; }
      lastTapRef.current = null;
      haptic([0, 30, 50, 30]);
      if (isLeft) {
        seekBy(-15000);
        Animated.sequence([
          Animated.timing(seekFlashLeft, { toValue: 0.85, duration: 100, useNativeDriver: true }),
          Animated.timing(seekFlashLeft, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]).start();
      } else if (isRight) {
        seekBy(15000);
        Animated.sequence([
          Animated.timing(seekFlashRight, { toValue: 0.85, duration: 100, useNativeDriver: true }),
          Animated.timing(seekFlashRight, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]).start();
      }
    } else {
      lastTapRef.current = { time: now, x: px };
      tapTimerRef.current = setTimeout(() => {
        lastTapRef.current = null;
        tapTimerRef.current = null;
        showControls();
      }, 360);
    }
  }, [W, seekBy, showControls, haptic]);

  // ── Load TMDB episode data (with cache) ────────────────────────────────────
  const loadPanelEpisodes = useCallback(async (seasonNum: number) => {
    if (!tmdbId) return;
    const cached = await getCachedEpisodes(tmdbId, seasonNum);
    if (cached) { setPanelEpisodes(cached); return; }
    setPanelLoading(true);
    try {
      const [resEn, resPt] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?api_key=${TMDB_KEY}&language=en-US`, { signal: mkSignal(10000) }),
        fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?api_key=${TMDB_KEY}&language=pt-BR`, { signal: mkSignal(10000) }),
      ]);
      const dataEn = resEn.ok ? await resEn.json() : null;
      const dataPt = resPt.ok ? await resPt.json() : null;
      const enEps: TmdbEpisode[] = dataEn?.episodes ?? [];
      const ptEps: TmdbEpisode[] = dataPt?.episodes ?? [];
      const isGeneric = (n: string) => /^Epis[oó]dio\s*\d+$/i.test(n.trim()) || /^Episode\s*\d+$/i.test(n.trim());
      const merged = enEps.map((enEp) => {
        const ptEp = ptEps.find((p) => p.episode_number === enEp.episode_number);
        return {
          ...enEp,
          name: ptEp && ptEp.name && !isGeneric(ptEp.name) ? ptEp.name : enEp.name,
          overview: ptEp?.overview?.trim() ? ptEp.overview : enEp.overview,
          _needsNameTranslation: !(ptEp && ptEp.name && !isGeneric(ptEp.name)),
          _needsOverviewTranslation: !(ptEp?.overview?.trim()),
        };
      });
      const base = merged.length > 0 ? merged : ptEps.map((ep) => ({ ...ep, _needsNameTranslation: true, _needsOverviewTranslation: true }));
      setPanelEpisodes(base);
      await setCachedEpisodes(tmdbId, seasonNum, base);
      const needTranslation = base.filter((ep: any) => ep._needsNameTranslation || ep._needsOverviewTranslation);
      if (needTranslation.length > 0) {
        const translated = await Promise.all(
          base.map(async (ep: any) => {
            const name = ep._needsNameTranslation && ep.name ? await translateToPtBr(ep.name) : ep.name;
            const overview = ep._needsOverviewTranslation && ep.overview ? await translateToPtBr(ep.overview) : ep.overview;
            return { ...ep, name, overview };
          })
        );
        setPanelEpisodes(translated);
        await setCachedEpisodes(tmdbId, seasonNum, translated);
      }
    } catch { setPanelEpisodes([]); } finally { setPanelLoading(false); }
  }, [tmdbId]);

  const openEpisodesPanel = () => {
    setShowEpisodes(true);
    loadPanelEpisodes(panelSeason);
    Animated.timing(panelAnim, { toValue: 1, duration: 280, useNativeDriver: false }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setControlsVisible(false);
    Animated.timing(controlsOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
  };

  const closeEpisodesPanel = () => {
    Animated.timing(panelAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start(() => setShowEpisodes(false));
    showControls();
  };

  useEffect(() => { if (showEpisodes) loadPanelEpisodes(panelSeason); }, [panelSeason]);

  // ── Episode status helper ────────────────────────────────────────────────────
  const getEpStatus = (s: number, e: number): "watching" | "watched" | "none" => {
    if (s === season && e === episode) return "watching";
    if (watchSeason == null || watchEpisode == null) return "none";
    if (s < watchSeason) return "watched";
    if (s === watchSeason && e < watchEpisode) return "watched";
    if (s === watchSeason && e === watchEpisode) return "watching";
    return "none";
  };

  // ── Speed panel helper ──────────────────────────────────────────────────────
  const setSpeed = (speed: number) => {
    haptic(30);
    setPlaybackSpeed(speed);
    videoRef.current?.setRateAsync(speed, true).catch(() => {});
    setShowSpeedPanel(false);
    showControls();
  };

  // ── Sleep timer helper ──────────────────────────────────────────────────────
  const activateSleepTimer = (minutes: number) => {
    haptic([0, 40, 60, 40]);
    setSleepTimerEnd(Date.now() + minutes * 60 * 1000);
    setShowSleepPanel(false);
    showControls();
  };

  // ── Share ────────────────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: isTV
          ? `Estou assistindo "${title}" — Temporada ${season}, Episódio ${episode}${episodeName ? ` (${episodeName})` : ""} no NETPLAY`
          : `Estou assistindo "${title}" no NETPLAY`,
        title: "NETPLAY",
      });
    } catch {}
  }, [title, season, episode, episodeName, isTV]);

  // ── Seek bar interaction ─────────────────────────────────────────────────────
  const onSeekStart = (locationX: number) => {
    const ratio = Math.min(Math.max(0, locationX) / (seekBarWidthRef.current || 1), 1);
    const ms = Math.round(ratio * durationMs);
    setIsScrubbing(true);
    setScrubPosition(ms);
    showControls();
  };
  const onSeekMove = (locationX: number) => {
    const ratio = Math.min(Math.max(0, locationX) / (seekBarWidthRef.current || 1), 1);
    setScrubPosition(Math.round(ratio * durationMs));
  };
  const onSeekEnd = (locationX: number) => {
    const ratio = Math.min(Math.max(0, locationX) / (seekBarWidthRef.current || 1), 1);
    const ms = Math.round(ratio * durationMs);
    setIsScrubbing(false);
    setScrubPosition(ms);
    setPositionMs(ms);
    positionMsRef.current = ms;
    videoRef.current?.setPositionAsync(ms).catch(() => {});
    haptic(20);
    showControls();
  };

  const displayPos = isScrubbing ? scrubPosition : positionMs;
  const displayProgress = durationMs > 0 ? displayPos / durationMs : 0;

  const videoWidthAnim = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [W, W * 0.6] });

  // ─────────────────────────────────────────────────────────────────────────────
  // ── WEB PLATFORM ─────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <StatusBar hidden />
        {phase === "loading" && (
          <View style={StyleSheet.absoluteFill}>
            {backdropPath && <Image source={{ uri: TMDB_IMG(backdropPath) ?? "" }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
            <View style={styles.loadOverlay} />
            <View style={styles.loadCenter}>
              <Text style={styles.loadServiceLabel}>N E T P L A Y</Text>
              <Text style={styles.loadTitle} numberOfLines={2}>{title}</Text>
              {(season != null && episode != null) && <Text style={styles.loadEp}>T{season} · Ep {episode}{episodeName ? ` — ${episodeName}` : ""}</Text>}
              <View style={styles.barTrack}>
                <Animated.View style={[styles.barFill, { width: loadProgress.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) }]} />
              </View>
              <Animated.Text style={styles.barPct}><ProgressText value={loadProgress} /></Animated.Text>
            </View>
          </View>
        )}
        {fallbackNotice !== null && (
          <View style={{ position: "absolute", top: 60, left: 20, right: 20, backgroundColor: "rgba(0,0,0,0.85)", borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, zIndex: 99 }}>
            <Feather name="refresh-cw" size={14} color="#f59e0b" />
            <Text style={{ color: "#f59e0b", fontSize: 13, fontWeight: "600", flex: 1 }}>{fallbackNotice}</Text>
          </View>
        )}
        {phase === "error" && (
          <View style={[StyleSheet.absoluteFill, styles.loadOverlay, styles.loadCenter]}>
            <Feather name="alert-circle" size={48} color={RED} />
            <Text style={styles.loadTitle}>{errorMsg}</Text>
            {autoRetryCountdown !== null ? (
              <View style={{ alignItems: "center", gap: 6, marginTop: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: "rgba(255,255,255,0.25)", justifyContent: "center", alignItems: "center" }}>
                  <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>{autoRetryCountdown}</Text>
                </View>
                <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>Tentando novamente…</Text>
              </View>
            ) : (
              <Pressable style={styles.retryBtn} onPress={() => { setRetryCount((c) => c + 1); loadVideoUrl(); }}>
                <Feather name="refresh-cw" size={14} color="#fff" />
                <Text style={styles.retryText}>Tentar Novamente</Text>
              </Pressable>
            )}
          </View>
        )}
        {videoUrl ? (
          <video src={videoUrl} controls autoPlay style={{ width: "100%", height: "100%", backgroundColor: "#000", display: phase === "loading" ? "none" : "block" } as any} onError={() => { if (isTerabox && phase !== "error") { setPhase("error"); setErrorMsg("Stream TeraBox expirou — renovando token…"); setRetryCount(0); } }} />
        ) : null}
        <Pressable style={[styles.backBtn, { top: topPad + 8 }]} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ── NATIVE PLAYER ─────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: "#000", flexDirection: "row" }}>
      <StatusBar hidden />

      {/* ── TeraBox Folder WebView resolver ───────────────────────────────────── */}
      {tbWebViewMode && (
        <TeraboxWebViewResolver
          teraboxUrl={tbWebViewMode.url}
          visible={!!tbWebViewMode}
          onResolved={(url) => {
            setTbWebViewMode(null);
            setTeraboxQualities({ "Automático": url });
            teraboxQualityRef.current = "Automático";
            setTeraboxQuality("Automático");
            setVideoUrl(url);
            setIsPlaying(true);
          }}
          onError={(msg) => {
            setTbWebViewMode(null);
            setPhase("error");
            setErrorMsg(msg);
          }}
          onCancel={() => {
            setTbWebViewMode(null);
            router.back();
          }}
        />
      )}

      {/* ── Session blocked modal ────────────────────────────────────────────── */}
      <Modal visible={!!sessionBlocked} animationType="fade" transparent={false} onRequestClose={() => router.back()}>
        <View style={{ flex: 1, backgroundColor: "#080808", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Feather name={sessionBlocked === "limit_exceeded" ? "monitor" : "lock"} size={60} color={RED} />
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800", textAlign: "center", marginTop: 20, lineHeight: 28 }}>
            {sessionBlocked === "trial_expired" ? "Período de teste encerrado" : sessionBlocked === "plan_expired" ? "Plano expirado" : "Limite de telas atingido"}
          </Text>
          <Text style={{ color: "#888", fontSize: 14, textAlign: "center", lineHeight: 21, marginTop: 12, marginBottom: 32 }}>
            {sessionBlocked === "limit_exceeded"
              ? "Você atingiu o máximo de telas simultâneas do seu plano. Pause outro dispositivo e tente novamente."
              : "Entre em contato com o administrador para ativar ou renovar seu plano."}
          </Text>
          {sessionBlocked !== "limit_exceeded" && (
            <Pressable
              style={{ backgroundColor: "#25D366", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}
              onPress={() => Linking.openURL(getWhatsAppLink("Olá! Preciso ativar meu plano NETPLAY.")).catch(() => {})}
            >
              <Feather name="message-circle" size={20} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Falar com administrador</Text>
            </Pressable>
          )}
          <Pressable style={{ paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#333" }} onPress={() => router.back()}>
            <Text style={{ color: "#888", fontSize: 14 }}>Voltar</Text>
          </Pressable>
        </View>
      </Modal>

      {/* ── Speed selector panel ─────────────────────────────────────────────── */}
      <Modal visible={showSpeedPanel} animationType="fade" transparent onRequestClose={() => setShowSpeedPanel(false)}>
        <Pressable style={styles.panelModalBg} onPress={() => setShowSpeedPanel(false)}>
          <View style={styles.floatingPanel}>
            <Text style={styles.floatingPanelTitle}>Velocidade de reprodução</Text>
            {SPEEDS.map((s) => (
              <Pressable key={s} style={[styles.floatingPanelRow, playbackSpeed === s && styles.floatingPanelRowActive]} onPress={() => setSpeed(s)}>
                <Text style={[styles.floatingPanelRowText, playbackSpeed === s && { color: RED }]}>{s === 1.0 ? "1× Normal" : `${s}×`}</Text>
                {playbackSpeed === s && <Feather name="check" size={14} color={RED} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Sleep timer panel ───────────────────────────────────────────────── */}
      <Modal visible={showSleepPanel} animationType="fade" transparent onRequestClose={() => setShowSleepPanel(false)}>
        <Pressable style={styles.panelModalBg} onPress={() => setShowSleepPanel(false)}>
          <View style={styles.floatingPanel}>
            <Text style={styles.floatingPanelTitle}>Timer de sono</Text>
            {SLEEP_PRESETS.map((mins) => (
              <Pressable key={mins} style={styles.floatingPanelRow} onPress={() => activateSleepTimer(mins)}>
                <Feather name="moon" size={14} color="#888" />
                <Text style={styles.floatingPanelRowText}>Pausar em {mins} min</Text>
              </Pressable>
            ))}
            {sleepTimerEnd && (
              <Pressable style={[styles.floatingPanelRow, { borderTopWidth: 1, borderTopColor: "#2a2a2a" }]} onPress={() => { setSleepTimerEnd(null); setShowSleepPanel(false); }}>
                <Feather name="x" size={14} color={RED} />
                <Text style={[styles.floatingPanelRowText, { color: RED }]}>Cancelar timer</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* ── Quality panel ───────────────────────────────────────────────────── */}
      <Modal visible={showQualityPanel} animationType="fade" transparent onRequestClose={() => setShowQualityPanel(false)}>
        <Pressable style={styles.panelModalBg} onPress={() => setShowQualityPanel(false)}>
          <View style={styles.floatingPanel}>
            <Text style={styles.floatingPanelTitle}>Selecionar qualidade</Text>
            {isTerabox && Object.keys(teraboxQualities).length > 0 ? (
              Object.entries(teraboxQualities).map(([qKey, qUrl]) => {
                const isActive = teraboxQuality === qKey;
                const isAuto = qKey === "Automático";
                return (
                  <Pressable key={qKey} style={[styles.floatingPanelRow, isActive && styles.floatingPanelRowActive]} onPress={() => switchTeraboxQuality(qKey, qUrl)}>
                    <Feather name={isAuto ? "zap" : "film"} size={14} color={isActive ? RED : "#888"} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.floatingPanelRowText, isActive && { color: RED }]}>{qKey}</Text>
                      {isAuto && (
                        <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>Melhor qualidade disponível</Text>
                      )}
                    </View>
                    {isActive && <Feather name="check" size={14} color={RED} />}
                  </Pressable>
                );
              })
            ) : (
              qualityVariants.map((item) => {
                const isActive = item.r2Key === activeKeyRef.current;
                const qLabel = item.quality ?? item.label ?? item.r2Key.split("/").filter(Boolean).pop() ?? "Padrão";
                return (
                  <Pressable key={item.id} style={[styles.floatingPanelRow, isActive && styles.floatingPanelRowActive]} onPress={() => switchQuality(item)}>
                    <Feather name="layers" size={14} color={isActive ? RED : "#888"} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.floatingPanelRowText, isActive && { color: RED }]}>{qLabel}</Text>
                      {item.label && item.label !== qLabel && (
                        <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>{item.label}</Text>
                      )}
                    </View>
                    {isActive && <Feather name="check" size={14} color={RED} />}
                  </Pressable>
                );
              })
            )}
          </View>
        </Pressable>
      </Modal>

      {/* ── Video container ──────────────────────────────────────────────────── */}
      <Animated.View style={{ width: videoWidthAnim, height: "100%", overflow: "hidden" }}>
        {videoUrl && Video && (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: videoOpacity }]} pointerEvents="none">
            <Video
              ref={videoRef}
              source={videoSourceHeaders ? { uri: videoUrl, headers: videoSourceHeaders } : { uri: videoUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode={ResizeMode?.CONTAIN ?? "contain"}
              shouldPlay={phase === "ready" && isPlaying}
              onLoad={onVideoLoad}
              onPlaybackStatusUpdate={onPlaybackStatusUpdate}
              useNativeControls={false}
            />
          </Animated.View>
        )}

        {/* Buffering spinner — appears when video is buffering mid-playback */}
        {isBuffering && phase === "ready" && (
          <View style={styles.bufferingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color="rgba(255,255,255,0.75)" />
          </View>
        )}

        {/* ── Loading screen ─────────────────────────────────────────────────── */}
        {(phase === "loading" || phase === "error") && (
          <View style={StyleSheet.absoluteFill}>
            {backdropPath ? (
              <Image source={{ uri: TMDB_IMG(backdropPath) ?? "" }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : posterPath ? (
              <Image source={{ uri: TMDB_IMG(posterPath, "w780") ?? "" }} style={[StyleSheet.absoluteFill, { opacity: 0.4 }]} resizeMode="cover" />
            ) : null}
            <View style={styles.loadOverlay} />

            {fallbackNotice !== null && (
              <View style={{ position: "absolute", top: 0, left: 20, right: 20, backgroundColor: "rgba(0,0,0,0.85)", borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, zIndex: 99 }}>
                <Feather name="refresh-cw" size={14} color="#f59e0b" />
                <Text style={{ color: "#f59e0b", fontSize: 13, fontWeight: "600", flex: 1 }}>{fallbackNotice}</Text>
              </View>
            )}
            {phase === "error" ? (
              <View style={styles.loadCenter}>
                {posterPath && (
                  <Image source={{ uri: TMDB_IMG(posterPath, "w342") ?? "" }} style={styles.errorPoster} resizeMode="cover" />
                )}
                <Feather name="alert-circle" size={44} color={RED} />
                <Text style={styles.loadTitle}>{errorMsg}</Text>
                <Text style={styles.loadEp}>Verifique sua conexão e tente novamente</Text>
                {autoRetryCountdown !== null ? (
                  <View style={{ alignItems: "center", gap: 6, marginTop: 20 }}>
                    <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: "rgba(255,255,255,0.20)", justifyContent: "center", alignItems: "center" }}>
                      <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700" }}>{autoRetryCountdown}</Text>
                    </View>
                    <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>Tentando novamente…</Text>
                    <Pressable onPress={() => {
                      if (autoRetryTimerRef.current) { clearInterval(autoRetryTimerRef.current); autoRetryTimerRef.current = null; }
                      setAutoRetryCountdown(null);
                      setRetryCount(1);
                    }}>
                      <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, textDecorationLine: "underline" }}>Cancelar</Text>
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
                    {isTerabox && params.teraboxItemId ? (
                      <Pressable
                        style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10, backgroundColor: "rgba(229,9,20,0.15)", borderWidth: 1, borderColor: "rgba(229,9,20,0.35)" }}
                        onPress={async () => {
                          try {
                            const base = getApiBase();
                            await fetch(`${base}/api/r2/terabox/trigger-r2-fallback`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: params.teraboxItemId }),
                            });
                          } catch {}
                          setRetryCount(0);
                          loadVideoUrl();
                        }}
                      >
                        <Feather name="upload-cloud" size={14} color={RED} />
                        <Text style={{ color: RED, fontSize: 13, fontWeight: "600" }}>Preparar Vídeo</Text>
                      </Pressable>
                    ) : isFlix2 && tmdbId ? (
                      <Pressable
                        style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10, backgroundColor: "rgba(139,92,246,0.18)", borderWidth: 1, borderColor: "rgba(139,92,246,0.35)" }}
                        onPress={() => router.replace({
                          pathname: "/player",
                          params: {
                            type: contentType,
                            id: String(tmdbId),
                            season: season != null ? String(season) : "",
                            episode: episode != null ? String(episode) : "",
                            title: title ?? "",
                            posterPath: posterPath ?? "",
                            backdropPath: backdropPath ?? "",
                          },
                        })}
                      >
                        <Feather name="monitor" size={14} color="#a78bfa" />
                        <Text style={{ color: "#a78bfa", fontSize: 13, fontWeight: "600" }}>Player Alternativo</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.loadCenter}>
                {/* NETPLAY wordmark */}
                <Text style={styles.loadServiceLabel}>N E T P L A Y</Text>

                {/* Content logo or title */}
                {contentLogo ? (
                  <Image
                    source={{ uri: contentLogo }}
                    style={styles.loadContentLogo}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={styles.loadTitle} numberOfLines={2}>{title}</Text>
                )}

                {(season != null && episode != null) && (
                  <Text style={styles.loadEp}>T{season} · Ep {episode}{episodeName ? ` — ${episodeName}` : ""}</Text>
                )}

                {/* Rotating TMDB tip */}
                {loadingTips.length > 0 && (
                  <View style={styles.tipBox}>
                    <Text style={styles.tipText} numberOfLines={3}>{loadingTips[tipIdx]}</Text>
                  </View>
                )}

                {tbUploadState ? (
                  <View style={{ alignItems: "center", gap: 10, marginTop: 8 }}>
                    <ActivityIndicator color={RED} size="large" />
                    <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700", textAlign: "center" }}>
                      Preparando vídeo para reprodução
                    </Text>
                    <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, textAlign: "center" }}>
                      {tbUploadState.message}
                    </Text>
                    {tbUploadState.progress > 0 && (
                      <View style={{ width: "100%", gap: 4 }}>
                        <View style={styles.barTrack}>
                          <View style={[styles.barFill, { width: `${Math.min(tbUploadState.progress, 100)}%` }]} />
                        </View>
                        <Text style={[styles.barPct, { opacity: 0.7 }]}>{Math.round(tbUploadState.progress)}%</Text>
                      </View>
                    )}
                    <View style={styles.sourceBadge}>
                      <Feather name="upload-cloud" size={10} color="#888" />
                      <Text style={styles.sourceBadgeText}>Enviando para servidor R2</Text>
                    </View>
                  </View>
                ) : (
                  <View style={{ width: "100%" }}>
                    <View style={styles.barTrack}>
                      <Animated.View style={[styles.barFill, { width: loadProgress.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) }]} />
                    </View>
                    <Animated.Text style={styles.barPct}><ProgressText value={loadProgress} /></Animated.Text>
                    <View style={styles.sourceBadge}>
                      <Feather name="server" size={10} color="#888" />
                      <Text style={styles.sourceBadgeText}>{fromCache ? "R2 (cache)" : "R2"}</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            <Pressable style={[styles.backBtn, { top: topPad + 8 }]} onPress={() => router.back()}>
              <Feather name="arrow-left" size={22} color="#fff" />
            </Pressable>
          </View>
        )}

        {/* ── Lock screen ────────────────────────────────────────────────────── */}
        {isLocked && (
          <Pressable
            style={[StyleSheet.absoluteFill, styles.lockOverlay]}
            onPress={() => {
              Animated.sequence([
                Animated.timing(lockAnim, { toValue: 1.2, duration: 100, useNativeDriver: true }),
                Animated.timing(lockAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
              ]).start();
            }}
          >
            <Pressable
              style={styles.lockUnlockBtn}
              onPress={() => { haptic([0, 40, 60, 40]); setIsLocked(false); }}
            >
              <Animated.View style={{ transform: [{ scale: lockAnim }] }}>
                <Feather name="lock" size={24} color="#fff" />
              </Animated.View>
              <Text style={styles.lockUnlockText}>Toque para desbloquear</Text>
            </Pressable>
          </Pressable>
        )}

        {/* ── Seek flash overlays (double-tap feedback) ────────────────────── */}
        <SeekFlash side="left" anim={seekFlashLeft} />
        <SeekFlash side="right" anim={seekFlashRight} />

        {/* ── Swipe-to-seek indicator ───────────────────────────────────────── */}
        {isSwipeSeeking && (
          <View style={styles.swipeSeekIndicator} pointerEvents="none">
            <Feather name={swipeSeekDisplay >= 0 ? "fast-forward" : "rewind"} size={28} color="#fff" />
            <Text style={styles.swipeSeekDelta}>{swipeSeekDisplay > 0 ? "+" : ""}{swipeSeekDisplay}s</Text>
            <Text style={styles.swipeSeekTarget}>
              {formatTime(Math.max(0, Math.min(durationMs, positionMs + swipeSeekDisplay * 1000)))}
            </Text>
          </View>
        )}

        {/* ── Speed boost indicator ─────────────────────────────────────────── */}
        {isSpeedBoost && (
          <View style={styles.speedBoostBadge} pointerEvents="none">
            <Feather name="fast-forward" size={16} color="#fff" />
            <Text style={styles.speedBoostText}>2×</Text>
          </View>
        )}

        {/* ── Skip vinheta ─────────────────────────────────────────────────── */}
        {showSkipIntro && phase === "ready" && controlsVisible && (
          <Pressable style={styles.skipIntroBtnPos} onPress={skipIntro}>
            <View style={styles.skipIntroBtn}>
              <Feather name="skip-forward" size={14} color="#fff" />
              <Text style={styles.skipIntroBtnText}>Pular Vinheta</Text>
            </View>
          </Pressable>
        )}

        {/* ── Skip credits button ───────────────────────────────────────────── */}
        {showSkipCredits && phase === "ready" && !showSkipIntro && controlsVisible && (
          <Pressable style={styles.skipCreditsBtnPos} onPress={skipCredits}>
            <View style={styles.skipIntroBtn}>
              <Feather name="skip-forward" size={14} color="#fff" />
              <Text style={styles.skipIntroBtnText}>{isTV ? "Próximo episódio" : "Pular créditos"}</Text>
            </View>
          </Pressable>
        )}

        {/* ── Next episode countdown — side panel with poster ───────────────── */}
        {showNextEpCountdown && !showEpisodes && (
          <View style={styles.nextEpPanel}>
            <View style={styles.nextEpPanelBg} />
            {(backdropPath || posterPath) && (
              <Image
                source={{ uri: TMDB_IMG(backdropPath ?? posterPath, "w780") ?? "" }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
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
                  return r2Items.find((i) => i.season === season && i.episode === nextEp)
                    ?? r2Items.find((i) => i.season === (season + 1) && i.episode === 1)
                    ?? null;
                })();
                const nextTmdbEp = nextItem ? panelEpisodes.find((e) => e.episode_number === nextItem.episode) : null;
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

        {/* ── Sleep timer indicator ─────────────────────────────────────────── */}
        {sleepTimerEnd && sleepMinutesLeft != null && (
          <Pressable style={styles.sleepBadge} onPress={() => setShowSleepPanel(true)}>
            <Feather name="moon" size={11} color="#aaa" />
            <Text style={styles.sleepBadgeText}>
              {sleepMinutesLeft > 0 ? `${sleepMinutesLeft}min` : "Pausando..."}
            </Text>
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

        {/* ── Controls overlay ──────────────────────────────────────────────── */}
        {phase === "ready" && !showEpisodes && !isLocked && (
          <>
            {/* Gesture layers: horizontal seek + brightness (left) + volume (right) */}
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <View style={StyleSheet.absoluteFill} {...bodySwipePan.panHandlers} pointerEvents="box-none" />
              <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: W * 0.28 }} {...leftBrightPan.panHandlers} pointerEvents="box-none" />
              <View style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: W * 0.28 }} {...rightVolPan.panHandlers} pointerEvents="box-none" />
              <Pressable
                style={[StyleSheet.absoluteFill]}
                onPress={(e) => handleTap(e.nativeEvent.pageX)}
                onLongPress={() => { setIsSpeedBoost(true); haptic([0, 20]); }}
                onPressOut={() => { if (isSpeedBoost) setIsSpeedBoost(false); }}
                delayLongPress={600}
              />
            </View>

            {controlsVisible && (
              <Animated.View style={[styles.controls, { opacity: controlsOpacity }]} pointerEvents="box-none">
                {/* Gradient overlay top */}
                <View style={styles.ctrlGradTop} pointerEvents="none" />
                {/* Gradient overlay bottom */}
                <View style={styles.ctrlGradBottom} pointerEvents="none" />

                {/* ── Top bar ─────────────────────────────────────────────── */}
                <View style={[styles.topBar, { paddingTop: topPad + 8 }]} pointerEvents="box-none">
                  <Pressable style={styles.iconBtn} onPress={() => router.back()}>
                    <Feather name="arrow-left" size={22} color="#fff" />
                  </Pressable>
                  <View style={{ flex: 1, marginHorizontal: 10 }}>
                    {contentLogo ? (
                      <Image
                        source={{ uri: contentLogo }}
                        style={styles.ctrlContentLogo}
                        resizeMode="contain"
                      />
                    ) : (
                      <Text style={styles.ctrlTitle} numberOfLines={1}>{title}</Text>
                    )}
                    {(season != null && episode != null) && (
                      <Text style={styles.ctrlEp}>T{season} · Ep {episode}{episodeName ? ` — ${episodeName}` : ""}</Text>
                    )}
                  </View>
                  {/* Quality selector / badge */}
                  {isTerabox && Object.keys(teraboxQualities).length > 0 ? (
                    <Pressable
                      style={[styles.qualityBadge, { borderColor: "rgba(229,9,20,0.5)" }]}
                      onPress={() => { setShowQualityPanel(true); showControls(); }}
                    >
                      <Feather name="zap" size={9} color={RED} />
                      <Text style={[styles.qualityBadgeText, { color: RED }]}>{teraboxQuality}</Text>
                    </Pressable>
                  ) : qualityVariants.length > 1 ? (
                    <Pressable
                      style={[styles.qualityBadge, { borderColor: "rgba(229,9,20,0.5)" }]}
                      onPress={() => { setShowQualityPanel(true); showControls(); }}
                    >
                      <Feather name="layers" size={9} color={RED} />
                      <Text style={[styles.qualityBadgeText, { color: RED }]}>
                        {activeVariant?.quality ?? (videoResolution ?? "Qualidade")}
                      </Text>
                    </Pressable>
                  ) : videoResolution ? (
                    <View style={styles.qualityBadge}>
                      <Text style={styles.qualityBadgeText}>{videoResolution}</Text>
                    </View>
                  ) : null}
                  {/* Source badge */}
                  <View style={styles.ctrlSourceBadge}>
                    <Feather name="server" size={10} color="#888" />
                    <Text style={styles.ctrlSourceBadgeText}>R2</Text>
                  </View>
                  {/* Speed badge */}
                  {playbackSpeed !== 1.0 && (
                    <View style={styles.speedBadge}>
                      <Text style={styles.speedBadgeText}>{playbackSpeed}×</Text>
                    </View>
                  )}
                  {/* Cast to TV */}
                  <Pressable
                    style={styles.iconBtn}
                    onPress={() => setShowCastModal(true)}
                    disabled={!videoUrl}>
                    <Feather name="cast" size={18} color={videoUrl ? "#fff" : "rgba(255,255,255,0.3)"} />
                  </Pressable>
                  <Pressable style={styles.iconBtn} onPress={handleShare}>
                    <Feather name="share-2" size={18} color="#fff" />
                  </Pressable>
                  {/* Lock */}
                  <Pressable style={styles.iconBtn} onPress={() => { haptic(30); setIsLocked(true); }}>
                    <Feather name="unlock" size={18} color="#fff" />
                  </Pressable>
                  {/* Speed control */}
                  <Pressable style={styles.iconBtn} onPress={() => { setShowSpeedPanel(true); showControls(); }}>
                    <Feather name="zap" size={18} color="#fff" />
                  </Pressable>
                  {/* Sleep timer */}
                  <Pressable style={styles.iconBtn} onPress={() => { setShowSleepPanel(true); showControls(); }}>
                    <Feather name="moon" size={18} color={sleepTimerEnd ? "#f59e0b" : "#fff"} />
                  </Pressable>
                  {/* Episodes panel (TV only) */}
                  {isTV && (
                    <Pressable style={styles.episodesBtn} onPress={openEpisodesPanel}>
                      <Feather name="list" size={16} color="#fff" />
                      <Text style={styles.episodesBtnText}>Episódios</Text>
                    </Pressable>
                  )}
                </View>

                {/* ── Center row ──────────────────────────────────────────── */}
                <View style={styles.centerRow} pointerEvents="box-none">
                  {/* Prev episode */}
                  {isTV && (
                    <Pressable style={styles.iconBtn} onPress={goToPrevEpisode} disabled={!getPrevEpisodeItem()}>
                      <Feather name="skip-back" size={22} color={getPrevEpisodeItem() ? "#fff" : "rgba(255,255,255,0.25)"} />
                    </Pressable>
                  )}
                  {/* Seek back 15s */}
                  <Pressable style={styles.iconBtn} onPress={() => seekBy(-15000)}>
                    <Feather name="rotate-ccw" size={28} color="#fff" />
                    <Text style={styles.seekLabel}>15s</Text>
                  </Pressable>
                  {/* Play/Pause */}
                  <Pressable style={[styles.iconBtn, styles.playBtn]} onPress={togglePlay}>
                    <Feather name={isPlaying ? "pause" : "play"} size={36} color="#fff" />
                  </Pressable>
                  {/* Seek forward 15s */}
                  <Pressable style={styles.iconBtn} onPress={() => seekBy(15000)}>
                    <Feather name="rotate-cw" size={28} color="#fff" />
                    <Text style={styles.seekLabel}>15s</Text>
                  </Pressable>
                  {/* Next episode */}
                  {isTV && (
                    <Pressable style={styles.iconBtn} onPress={goToNextEpisode}>
                      <Feather name="skip-forward" size={22} color="#fff" />
                    </Pressable>
                  )}
                </View>

                {/* ── Bottom bar ───────────────────────────────────────────── */}
                <View style={styles.bottomBar} pointerEvents="box-none">
                  {/* Time (tap to toggle remaining) */}
                  <Pressable onPress={() => setShowTimeRemaining(!showTimeRemaining)}>
                    <Text style={styles.timeText}>
                      {showTimeRemaining ? `-${formatTime(Math.max(0, durationMs - displayPos))}` : formatTime(displayPos)}
                    </Text>
                  </Pressable>

                  {/* Seek bar */}
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
                      {/* Buffered track */}
                      <View style={[styles.seekBuffered, { width: `${bufferedRatio * 100}%` as any }]} />
                      {/* Progress fill */}
                      <View style={[styles.seekFill, { width: `${displayProgress * 100}%` as any }]} />
                      {/* Thumb */}
                      <View style={[
                        styles.seekThumb,
                        { left: `${displayProgress * 100}%` as any, width: isScrubbing ? 18 : 14, height: isScrubbing ? 18 : 14, marginLeft: isScrubbing ? -9 : -7, top: isScrubbing ? (6 - 18) / 2 : (4 - 14) / 2 },
                      ]} />
                    </View>
                    {/* Scrub time tooltip */}
                    {isScrubbing && (
                      <View style={[styles.seekTooltip, { left: Math.max(24, Math.min(seekBarWidthRef.current - 40, displayProgress * seekBarWidthRef.current - 24)) }]}>
                        <Text style={styles.seekTooltipText}>{formatTime(scrubPosition)}</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.timeText}>{formatTime(durationMs)}</Text>

                  {/* Continuous play toggle */}
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

        {/* Dim overlay when panel is open */}
        {showEpisodes && (
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.45)" }]} onPress={closeEpisodesPanel} />
        )}
      </Animated.View>

      {/* ── Episodes Panel ────────────────────────────────────────────────────── */}
      <Animated.View
        style={[styles.episodesPanel, {
          width: panelAnim.interpolate({ inputRange: [0, 1], outputRange: [0, W * 0.46] }),
          opacity: panelAnim,
        }]}
        pointerEvents={showEpisodes ? "auto" : "none"}
      >
        {/* Panel header */}
        <View style={styles.panelHeader}>
          {backdropPath ? (
            <Image source={{ uri: TMDB_IMG(backdropPath, "w780") ?? "" }} style={styles.panelBackdrop} resizeMode="cover" />
          ) : posterPath ? (
            <Image source={{ uri: TMDB_IMG(posterPath, "w342") ?? "" }} style={styles.panelBackdrop} resizeMode="cover" />
          ) : null}
          <View style={styles.panelBackdropGrad} />
          <View style={styles.panelHeaderInfo}>
            <Text style={styles.panelTitle} numberOfLines={2}>{title}</Text>
            {season != null && episode != null && (
              <Text style={styles.panelCurrentEp}>Assistindo: T{season} · Ep {episode}</Text>
            )}
          </View>
          <Pressable style={styles.panelCloseBtn} onPress={closeEpisodesPanel}>
            <Feather name="x" size={18} color="#fff" />
          </Pressable>
        </View>

        {/* Continuous play toggle in panel */}
        <Pressable style={styles.panelAutoPlayRow} onPress={() => setContinuousPlay(!continuousPlay)}>
          <Feather name="repeat" size={14} color={continuousPlay ? RED : "#666"} />
          <Text style={[styles.panelAutoPlayText, continuousPlay && { color: RED }]}>
            {continuousPlay ? "Reprodução contínua ativada" : "Reprodução contínua desativada"}
          </Text>
          <View style={[styles.panelAutoPlayToggle, continuousPlay && { backgroundColor: RED }]}>
            <View style={[styles.panelAutoPlayKnob, continuousPlay && { marginLeft: 14 }]} />
          </View>
        </Pressable>

        {/* Season selector */}
        {displaySeasons.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.panelSeasonRow}>
            {displaySeasons.map((s) => (
              <Pressable key={s} onPress={() => { haptic(20); setPanelSeason(s); }} style={[styles.panelSeasonBtn, panelSeason === s && { backgroundColor: RED, borderColor: RED }]}>
                <Text style={[styles.panelSeasonText, panelSeason === s && { color: "#fff" }]}>T{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Episode list */}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {(() => {
            const seasonItemsRaw = r2Items
              .filter((i) => i.season === panelSeason && i.episode != null)
              .sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
            // Deduplicate by episode number — keep the first occurrence
            const _seenEps = new Set<number>();
            const seasonItems = seasonItemsRaw.filter((i) => {
              const ep = i.episode ?? 0;
              if (_seenEps.has(ep)) return false;
              _seenEps.add(ep);
              return true;
            });
            const useTmdbFallback = seasonItems.length === 0 && panelEpisodes.length > 0;
            const folderItem = r2Items.find((i) => i.season === panelSeason && i.episode == null) ?? r2Items[0] ?? null;

            if (panelLoading) {
              return (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <Text style={styles.panelEmpty}>Carregando episódios...</Text>
                </View>
              );
            }

            const renderEpRow = (epNum: number, epName: string, epOverview: string | undefined, epStillPath: string | null | undefined, epRuntime: number | null | undefined, onPress: () => void) => {
              const status = getEpStatus(panelSeason, epNum);
              const isCurrentEp = status === "watching";
              const isWatched = status === "watched";
              const isExpanded = expandedEpOverview === epNum;
              return (
                <Pressable key={epNum} style={[styles.panelEpRow, isCurrentEp && styles.panelEpRowActive]} onPress={() => { haptic(20); onPress(); }}>
                  <View style={styles.panelEpThumb}>
                    {epStillPath ? (
                      <Image source={{ uri: TMDB_IMG(epStillPath, "w300") ?? "" }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, styles.panelEpThumbFallback]}>
                        <Feather name="film" size={16} color="#555" />
                      </View>
                    )}
                    {isCurrentEp && <View style={styles.panelEpPlayOverlay}><Feather name="pause" size={18} color="#fff" /></View>}
                    {isWatched && <View style={styles.panelEpWatchedBadge}><Feather name="check" size={10} color="#fff" /></View>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={[styles.panelEpNum, isCurrentEp && { color: RED }]}>Ep. {epNum}</Text>
                      {isWatched && <Text style={styles.panelEpWatchedTxt}>Assistido</Text>}
                      {isCurrentEp && <Text style={[styles.panelEpWatchedTxt, { color: RED }]}>Em andamento</Text>}
                      {epRuntime && <Text style={styles.panelEpRuntime}>{epRuntime}min</Text>}
                    </View>
                    <Text style={styles.panelEpName} numberOfLines={2}>{epName}</Text>
                    {epOverview ? (
                      <Pressable onPress={(e) => { e.stopPropagation(); setExpandedEpOverview(isExpanded ? null : epNum); }}>
                        <Text style={styles.panelEpOverview} numberOfLines={isExpanded ? 10 : 2}>{epOverview}</Text>
                        <Text style={styles.panelEpOverviewToggle}>{isExpanded ? "▲ Menos" : "▼ Mais"}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Pressable>
              );
            };

            if (useTmdbFallback) {
              return panelEpisodes.map((tmdbEp) => {
                const targetItem: RegistryItem | null = folderItem ? { ...folderItem, episode: tmdbEp.episode_number, season: panelSeason } : null;
                return renderEpRow(tmdbEp.episode_number, tmdbEp.name, tmdbEp.overview, tmdbEp.still_path, tmdbEp.runtime, () => targetItem && goToEpisode(targetItem));
              });
            }

            if (seasonItems.length === 0) {
              return <Text style={styles.panelEmpty}>Nenhum episódio disponível nesta temporada.</Text>;
            }

            return seasonItems.map((item) => {
              const epNum = item.episode ?? 0;
              const tmdbEp = panelEpisodes.find((e) => e.episode_number === epNum);
              return renderEpRow(epNum, tmdbEp?.name ?? item.label, tmdbEp?.overview, tmdbEp?.still_path, tmdbEp?.runtime, () => goToEpisode(item));
            });
          })()}
        </ScrollView>
      </Animated.View>

      {/* ── Cast to TV modal ── */}
      <CastModal
        visible={showCastModal}
        onClose={() => setShowCastModal(false)}
        castUrl={videoUrl
          ? `${getApiBase()}/api/cast?url=${encodeURIComponent(videoUrl)}&title=${encodeURIComponent(title ?? "")}`
          : ""}
        title={title ?? undefined}
        videoUrl={videoUrl ?? undefined}
      />

      {/* ── Sting overlay ───────────────────────────────────────────────────── */}
      {showSting && (
        <StingOverlay
          videoReady={phase === "ready"}
          onDone={() => setShowSting(false)}
          tmdbId={tmdbId ?? undefined}
          mediaType={contentType === "tv" ? "tv" : "movie"}
          title={title ?? undefined}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  loadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.72)" },
  loadCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  loadPoster: { width: 80, height: 120, borderRadius: 8, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 12 },
  errorPoster: { width: 60, height: 90, borderRadius: 6, marginBottom: 16, opacity: 0.6 },
  loadServiceLabel: { color: RED, fontSize: 12, fontWeight: "900", letterSpacing: 6, marginBottom: 16 },
  loadContentLogo: { width: 220, height: 70, marginBottom: 8 },
  loadTitle: { color: "#fff", fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 6 },
  loadEp: { color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 16, textAlign: "center" },
  tipBox: { marginBottom: 24, paddingHorizontal: 8, alignItems: "center", minHeight: 48, justifyContent: "center" },
  tipText: { color: "rgba(255,255,255,0.45)", fontSize: 12, textAlign: "center", lineHeight: 18, fontStyle: "italic" },
  bufferingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" },
  ctrlContentLogo: { width: 120, height: 32 },
  barTrack: { width: "100%", height: 3, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden", marginBottom: 8 },
  barFill: { height: "100%", backgroundColor: RED, borderRadius: 2 },
  barPct: { color: "rgba(255,255,255,0.5)", fontSize: 12 },
  sourceBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 16, backgroundColor: "rgba(255,255,255,0.06)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: "#2a2a2a" },
  sourceBadgeText: { color: "#666", fontSize: 10 },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: RED, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 8 },
  retryBtnSecondary: { paddingHorizontal: 20, paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: "#333" },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  backBtn: { position: "absolute", left: 16, zIndex: 20, width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  controls: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  ctrlGradTop: {
    position: "absolute", top: 0, left: 0, right: 0, height: 120,
    backgroundColor: "rgba(0,0,0,0)",
  },
  ctrlGradBottom: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 120,
    backgroundColor: "rgba(0,0,0,0)",
  },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: "rgba(0,0,0,0.5)", flexWrap: "wrap" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  iconBtnSmall: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16 },
  ctrlTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  ctrlEp: { color: "rgba(255,255,255,0.55)", fontSize: 11 },
  ctrlSourceBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, marginHorizontal: 4 },
  ctrlSourceBadgeText: { color: "#888", fontSize: 9, fontWeight: "700" },
  qualityBadge: { backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, marginHorizontal: 2 },
  qualityBadgeText: { color: "#e8e8e8", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  speedBadge: { backgroundColor: RED, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginHorizontal: 4 },
  speedBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  episodesBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", marginLeft: 4 },
  episodesBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  centerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28 },
  playBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: "rgba(229,9,20,0.8)", borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center", shadowColor: "#e50914", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 10 },
  seekLabel: { color: "rgba(255,255,255,0.7)", fontSize: 9, marginTop: 1, fontWeight: "700" },

  bottomBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 24, gap: 8, backgroundColor: "rgba(0,0,0,0.5)" },
  timeText: { color: "rgba(255,255,255,0.7)", fontSize: 11, minWidth: 38, fontVariant: ["tabular-nums"] },
  seekTrackOuter: { flex: 1, height: 28, justifyContent: "center", position: "relative" },
  seekTrack: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden", position: "relative" },
  seekBuffered: { position: "absolute", top: 0, left: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 3 },
  seekFill: { position: "absolute", top: 0, left: 0, bottom: 0, backgroundColor: RED, borderRadius: 3 },
  seekThumb: { position: "absolute", borderRadius: 9, backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4, elevation: 4 },
  seekTooltip: { position: "absolute", top: -32, backgroundColor: "rgba(0,0,0,0.85)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  seekTooltipText: { color: "#fff", fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },

  seekFlash: {
    position: "absolute", top: 0, bottom: 0, width: "35%",
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center", gap: 6,
  },
  seekFlashText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  lockOverlay: { backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  lockUnlockBtn: { alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 28, paddingVertical: 20, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  lockUnlockText: { color: "rgba(255,255,255,0.7)", fontSize: 13 },

  speedBoostBadge: { position: "absolute", top: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(229,9,20,0.85)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  speedBoostText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  skipIntroBtnPos: { position: "absolute", bottom: 72, right: 20 },
  skipCreditsBtnPos: { position: "absolute", bottom: 72, right: 20 },
  skipIntroBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.4)", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8 },
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

  sleepBadge: { position: "absolute", top: 60, right: 14, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(245,158,11,0.15)", borderWidth: 1, borderColor: "rgba(245,158,11,0.3)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  sleepBadgeText: { color: "#f59e0b", fontSize: 10, fontWeight: "700" },
  hudPill: { position: "absolute", top: "40%" as any, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.72)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginTop: -18 },
  hudBar: { width: 100, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" },
  hudBarFill: { height: 4, backgroundColor: "#fff", borderRadius: 2 },
  hudPct: { color: "#fff", fontSize: 13, fontWeight: "700" as const, minWidth: 34 },

  panelModalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
  floatingPanel: { backgroundColor: "#141414", borderRadius: 16, paddingVertical: 8, width: 260, borderWidth: 1, borderColor: "#2a2a2a" },
  floatingPanelTitle: { color: "#888", fontSize: 11, fontWeight: "700", letterSpacing: 1, paddingHorizontal: 18, paddingVertical: 10, textTransform: "uppercase" },
  floatingPanelRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 12 },
  floatingPanelRowActive: { backgroundColor: "rgba(229,9,20,0.08)" },
  floatingPanelRowText: { color: "#fff", fontSize: 14, flex: 1 },

  episodesPanel: { height: "100%", backgroundColor: "#0e0e0e", overflow: "hidden", borderLeftWidth: 1, borderLeftColor: "#1e1e1e" },
  panelHeader: { height: 110, position: "relative", overflow: "hidden" },
  panelBackdrop: { ...StyleSheet.absoluteFillObject as any, width: "100%", height: "100%" },
  panelBackdropGrad: { ...StyleSheet.absoluteFillObject as any, backgroundColor: "rgba(0,0,0,0.6)" },
  panelHeaderInfo: { position: "absolute", bottom: 10, left: 12, right: 44 },
  panelTitle: { color: "#fff", fontSize: 13, fontWeight: "800", lineHeight: 17 },
  panelCurrentEp: { color: "rgba(255,255,255,0.5)", fontSize: 10, marginTop: 2 },
  panelCloseBtn: { position: "absolute", top: 10, right: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },

  panelAutoPlayRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#1a1a1a" },
  panelAutoPlayText: { color: "#555", fontSize: 11, flex: 1 },
  panelAutoPlayToggle: { width: 32, height: 18, borderRadius: 9, backgroundColor: "#2a2a2a", padding: 2, justifyContent: "center" },
  panelAutoPlayKnob: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#fff" },

  panelSeasonRow: { paddingHorizontal: 10, paddingVertical: 8, maxHeight: 46 },
  panelSeasonBtn: { paddingHorizontal: 11, paddingVertical: 4, borderRadius: 14, marginRight: 5, borderWidth: 1, borderColor: "#333", backgroundColor: "#1a1a1a" },
  panelSeasonText: { color: "#aaa", fontSize: 11, fontWeight: "700" },
  panelEmpty: { color: "#555", fontSize: 12, textAlign: "center", marginTop: 24, paddingHorizontal: 16 },

  panelEpRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#1a1a1a" },
  panelEpRowActive: { backgroundColor: "rgba(229,9,20,0.08)" },
  panelEpThumb: { width: 76, height: 48, borderRadius: 5, overflow: "hidden", backgroundColor: "#1a1a1a", position: "relative", flexShrink: 0 },
  // Swipe-to-seek indicator
  swipeSeekIndicator: { position: "absolute", top: "50%", left: "50%", transform: [{ translateX: -70 }, { translateY: -45 }], alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 16, paddingHorizontal: 24, paddingVertical: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  swipeSeekDelta: { color: "#fff", fontSize: 26, fontWeight: "800" },
  swipeSeekTarget: { color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: "600" },

  panelEpThumbFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#1a1a1a" },
  panelEpPlayOverlay: { ...StyleSheet.absoluteFillObject as any, backgroundColor: "rgba(229,9,20,0.4)", alignItems: "center", justifyContent: "center" },
  panelEpWatchedBadge: { position: "absolute", bottom: 3, right: 3, width: 16, height: 16, borderRadius: 8, backgroundColor: "#4ade80", alignItems: "center", justifyContent: "center" },
  panelEpNum: { color: "#666", fontSize: 10, fontWeight: "700" },
  panelEpWatchedTxt: { color: "#4ade80", fontSize: 9, fontWeight: "600" },
  panelEpRuntime: { color: "#555", fontSize: 9, marginLeft: "auto" },
  panelEpName: { color: "#e0e0e0", fontSize: 11, fontWeight: "600", marginTop: 2, lineHeight: 15 },
  panelEpOverview: { color: "rgba(255,255,255,0.35)", fontSize: 9, lineHeight: 13, marginTop: 3 },
  panelEpOverviewToggle: { color: "#555", fontSize: 9, marginTop: 2 },
});
