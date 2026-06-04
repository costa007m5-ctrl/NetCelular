import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  Image,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { apiList, apiSignedUrl, r2Route } from "@/lib/r2-direct";
import { useAuth } from "@/lib/auth-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import { checkAndStartSession, heartbeatSession, endSession, getWhatsAppLink } from "@/lib/session-manager";

let Video: any = null;
let ResizeMode: any = null;
try { const av = require("expo-av"); Video = av.Video; ResizeMode = av.ResizeMode; } catch {}

let ScreenOrientation: any = null;
try { ScreenOrientation = require("expo-screen-orientation"); } catch {}

let NavBar: any = null;
try { NavBar = require("expo-navigation-bar"); } catch {}

const RED = "#e50914";
const TMDB_IMG = (path: string | null | undefined, size = "w1280") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";

interface RegistryItem {
  id: string; r2Key: string; teraboxUrl?: string; tmdbId: number; tmdbType: "movie" | "tv";
  title: string; label: string; season: number | null; episode: number | null;
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

// ── Auto-translation (MyMemory, free, no key) ─────────────────────────────────
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
  } catch {
    return text;
  }
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

async function fetchSignedUrl(key: string, episodeNum?: number | null): Promise<string> {
  const resolvedKey = await resolveVideoKey(key, episodeNum);
  const data = await apiSignedUrl(resolvedKey);
  return data.url;
}

async function fetchTeraboxUrl(registryItemId: string): Promise<string> {
  const data = await r2Route<{ url: string }>(`/terabox/play?id=${encodeURIComponent(registryItemId)}`);
  return data.url;
}

export default function R2PlayerScreen() {
  const { width: W, height: H } = useWindowDimensions();

  const params = useLocalSearchParams<{
    key: string;
    registryItemId?: string;
    title: string;
    episodeName?: string;
    season?: string;
    episode?: string;
    backdropPath?: string;
    posterPath?: string;
    tmdbId?: string;
    type?: string;
    r2ItemsJson?: string;
    watchSeason?: string;
    watchEpisode?: string;
    watchProgressRatio?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  // Episodes panel
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [panelSeason, setPanelSeason] = useState<number>(1);
  const [panelEpisodes, setPanelEpisodes] = useState<TmdbEpisode[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [tmdbTotalSeasons, setTmdbTotalSeasons] = useState<number>(1);
  const panelAnim = useRef(new Animated.Value(0)).current;
  const [sessionBlocked, setSessionBlocked] = useState<"trial_expired" | "plan_expired" | "limit_exceeded" | null>(null);

  const loadProgress = useRef(new Animated.Value(0)).current;
  const fakeAnim = useRef<Animated.CompositeAnimation | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<any>(null);
  const phaseRef = useRef<"loading" | "ready" | "error">("loading");
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSeekedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const positionMsRef = useRef(0);
  const durationMsRef = useRef(0);
  const seekBarWidthRef = useRef(0);

  const { user } = useAuth();
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

  // Parse R2 items for episodes panel
  const r2Items: RegistryItem[] = (() => {
    try { return params.r2ItemsJson ? JSON.parse(params.r2ItemsJson) : []; } catch { return []; }
  })();

  // Only items with specific episode numbers (exclude season-level folder items)
  const r2EpisodeItems = isTV ? r2Items.filter((i) => i.episode != null) : [];
  // Seasons available in R2 — only seasons that have at least one per-episode entry
  const r2Seasons = isTV
    ? [...new Set(r2EpisodeItems.filter((i) => i.season != null).map((i) => i.season as number))].sort((a, b) => a - b)
    : [];

  // Current watch progress
  const watchSeason = params.watchSeason ? Number(params.watchSeason) : null;
  const watchEpisode = params.watchEpisode ? Number(params.watchEpisode) : null;

  // R2 season-folder items (season entries without per-episode entries)
  const r2SeasonFolders = isTV ? r2Items.filter((i) => i.season != null && i.episode == null) : [];

  // All seasons we can display: prefer explicit per-episode R2 seasons, else fall back to folder seasons, else TMDB
  const displaySeasons: number[] = (() => {
    if (r2Seasons.length > 0) return r2Seasons;
    const folderSeasons = [...new Set(r2SeasonFolders.map((i) => i.season as number))].sort((a, b) => a - b);
    if (folderSeasons.length > 0) return folderSeasons;
    return Array.from({ length: tmdbTotalSeasons }, (_, i) => i + 1);
  })();

  // Init panel season from current episode
  useEffect(() => {
    if (season != null) setPanelSeason(season);
    else if (r2Seasons.length > 0) setPanelSeason(r2Seasons[0]);
    else if (r2SeasonFolders.length > 0) setPanelSeason(r2SeasonFolders[0].season as number);
  }, []);

  // Fetch TMDB total seasons on mount for TV shows
  useEffect(() => {
    if (!isTV || !tmdbId) return;
    const ctrl = new AbortController();
    fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_KEY}&language=pt-BR`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => { if (data.number_of_seasons > 0) setTmdbTotalSeasons(data.number_of_seasons); })
      .catch(() => {});
    return () => ctrl.abort();
  }, [tmdbId, isTV]);

  // ── Session limit tracking ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    checkAndStartSession(user.id).then((result) => {
      if (result !== "ok") setSessionBlocked(result);
    });
    const hbInterval = setInterval(heartbeatSession, 20000);
    return () => {
      clearInterval(hbInterval);
      endSession();
    };
  }, [user?.id]);

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
      // Seek to saved position if available (resume watching)
      if (!hasSeekedRef.current && savedProgressRatio > 0.02 && durationMillis > 0) {
        hasSeekedRef.current = true;
        const seekMs = Math.round(savedProgressRatio * durationMillis);
        setTimeout(() => {
          videoRef.current?.setPositionAsync(seekMs).catch(() => {});
        }, 600);
      }
    });
  }, [savedProgressRatio]);

  // ── Orientation / nav bar ──────────────────────────────────────────────────
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

  // ── Fetch video URL (R2 signed URL or TeraBox on-the-fly) ─────────────────
  const isTerabox = !!params.registryItemId;
  useEffect(() => {
    if (!isTerabox && !params.key) { setPhase("error"); setErrorMsg("Arquivo não especificado"); return; }

    phaseRef.current = "loading";
    setPhase("loading");
    setVideoUrl(null);
    setIsPlaying(false);
    setPositionMs(0);
    setDurationMs(0);

    fakeAnim.current = Animated.timing(loadProgress, { toValue: 80, duration: isTerabox ? 6000 : 4000, useNativeDriver: false });
    fakeAnim.current.start();

    const fetchUrl = isTerabox
      ? fetchTeraboxUrl(params.registryItemId!)
      : fetchSignedUrl(params.key, episode);

    fetchUrl
      .then((url) => {
        setVideoUrl(url);
        if (Platform.OS === "web") {
          fakeAnim.current?.stop();
          Animated.timing(loadProgress, { toValue: 100, duration: 300, useNativeDriver: false }).start(() => {
            phaseRef.current = "ready";
            setPhase("ready");
            setIsPlaying(true);
          });
        } else {
          fakeAnim.current = Animated.timing(loadProgress, { toValue: 95, duration: 1500, useNativeDriver: false });
          fakeAnim.current.start();
          readyTimer.current = setTimeout(() => transitionToReady(0), 12000);
        }
      })
      .catch((e) => {
        setPhase("error");
        setErrorMsg(e.message ?? "Erro ao carregar");
        fakeAnim.current?.stop();
      });
  }, [params.key, params.registryItemId]);

  // ── Next episode ───────────────────────────────────────────────────────────
  const goToNextEpisode = useCallback(() => {
    if (!isTV || season == null || episode == null) { router.back(); return; }
    const sortedEps = r2Items
      .filter((i) => i.season === season)
      .sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
    const idx = sortedEps.findIndex((i) => i.episode === episode);
    const next = sortedEps[idx + 1];
    if (next) {
      router.replace({
        pathname: "/r2-player",
        params: {
          key: next.r2Key ?? "",
          registryItemId: next.teraboxUrl ? next.id : "",
          title,
          episodeName: next.label,
          season: String(next.season ?? ""),
          episode: String(next.episode ?? ""),
          backdropPath: backdropPath ?? "",
          posterPath: posterPath ?? "",
          tmdbId: String(tmdbId ?? ""),
          type: contentType,
          r2ItemsJson: params.r2ItemsJson ?? "",
          watchSeason: params.watchSeason ?? "",
          watchEpisode: params.watchEpisode ?? "",
        },
      });
    } else {
      // Try next season
      const nextSeasonNum = season + 1;
      const firstNextSeason = r2Items
        .filter((i) => i.season === nextSeasonNum)
        .sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0))[0];
      if (firstNextSeason) {
        router.replace({
          pathname: "/r2-player",
          params: {
            key: firstNextSeason.r2Key ?? "",
            registryItemId: firstNextSeason.teraboxUrl ? firstNextSeason.id : "",
            title,
            episodeName: firstNextSeason.label,
            season: String(firstNextSeason.season ?? ""),
            episode: String(firstNextSeason.episode ?? ""),
            backdropPath: backdropPath ?? "",
            posterPath: posterPath ?? "",
            tmdbId: String(tmdbId ?? ""),
            type: contentType,
            r2ItemsJson: params.r2ItemsJson ?? "",
            watchSeason: params.watchSeason ?? "",
            watchEpisode: params.watchEpisode ?? "",
          },
        });
      } else {
        router.back();
      }
    }
  }, [season, episode, r2Items, isTV]);

  // ── Video callbacks ────────────────────────────────────────────────────────
  const onVideoLoad = useCallback((status: any) => {
    transitionToReady(status?.durationMillis ?? 0);
  }, [transitionToReady]);

  const onPlaybackStatusUpdate = useCallback((status: any) => {
    if (!status?.isLoaded) return;
    transitionToReady(status.durationMillis ?? 0);
    setIsPlaying(status.isPlaying ?? false);
    setPositionMs(status.positionMillis ?? 0);
    setDurationMs(status.durationMillis ?? 0);
    positionMsRef.current = status.positionMillis ?? 0;
    durationMsRef.current = status.durationMillis ?? 0;
    if (status.didJustFinish) goToNextEpisode();
  }, [transitionToReady, goToNextEpisode]);

  // ── Go to specific episode ─────────────────────────────────────────────────
  const goToEpisode = useCallback((item: RegistryItem) => {
    setShowEpisodes(false);
    Animated.timing(panelAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start();
    router.replace({
      pathname: "/r2-player",
      params: {
        key: item.r2Key ?? "",
        registryItemId: item.teraboxUrl ? item.id : "",
        title,
        episodeName: item.label,
        season: String(item.season ?? ""),
        episode: String(item.episode ?? ""),
        backdropPath: backdropPath ?? "",
        posterPath: posterPath ?? "",
        tmdbId: String(tmdbId ?? ""),
        type: contentType,
        r2ItemsJson: params.r2ItemsJson ?? "",
        watchSeason: params.watchSeason ?? "",
        watchEpisode: params.watchEpisode ?? "",
      },
    });
  }, [title, backdropPath, posterPath, tmdbId, contentType, params.r2ItemsJson]);

  // ── Load TMDB episode data for panel ───────────────────────────────────────
  const loadPanelEpisodes = useCallback(async (seasonNum: number) => {
    if (!tmdbId) return;
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

      const isGeneric = (name: string) => /^Epis[oó]dio\s*\d+$/i.test(name.trim()) || /^Episode\s*\d+$/i.test(name.trim());

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

      // Auto-translate texts that TMDB didn't have in pt-BR
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
      }
    } catch {
      setPanelEpisodes([]);
    } finally {
      setPanelLoading(false);
    }
  }, [tmdbId]);

  // ── Open/close episodes panel ──────────────────────────────────────────────
  const openEpisodesPanel = () => {
    setShowEpisodes(true);
    loadPanelEpisodes(panelSeason);
    Animated.timing(panelAnim, { toValue: 1, duration: 280, useNativeDriver: false }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setControlsVisible(false);
    Animated.timing(controlsOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
  };

  const closeEpisodesPanel = () => {
    Animated.timing(panelAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start(() => {
      setShowEpisodes(false);
    });
    showControls();
  };

  useEffect(() => {
    if (showEpisodes) loadPanelEpisodes(panelSeason);
  }, [panelSeason]);

  // ── Controls auto-hide ─────────────────────────────────────────────────────
  const showControls = useCallback(() => {
    if (showEpisodes) return;
    setControlsVisible(true);
    Animated.timing(controlsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(controlsOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() =>
        setControlsVisible(false)
      );
    }, 4000);
  }, [showEpisodes]);

  useEffect(() => { if (phase === "ready") showControls(); }, [phase]);
  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (readyTimer.current) clearTimeout(readyTimer.current);
  }, []);

  // ── Save progress ───────────────────────────────────────────────────────────
  const saveProgress = useCallback(async () => {
    if (!user?.id || !tmdbId || !isSupabaseConfigured) return;
    const dur = durationMsRef.current;
    const pos = positionMsRef.current;
    if (dur <= 0 || pos <= 0) return;
    const ratio = Math.min(1, pos / dur);
    if (ratio < 0.02) return;
    try {
      await db.progress.upsert({
        user_id: user.id,
        tmdb_id: tmdbId,
        type: contentType as "movie" | "tv",
        title,
        poster_path: posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : "",
        backdrop_path: backdropPath ? `https://image.tmdb.org/t/p/w1280${backdropPath}` : "",
        progress: ratio,
        ...(isTV && season != null ? { season } : {}),
        ...(isTV && episode != null ? { episode } : {}),
      });
    } catch {}
  }, [user, tmdbId, contentType, title, posterPath, backdropPath, isTV, season, episode]);

  // Start periodic save timer when ready
  useEffect(() => {
    if (phase !== "ready") return;
    saveTimerRef.current = setInterval(() => { saveProgress(); }, 30000);
    return () => { if (saveTimerRef.current) clearInterval(saveTimerRef.current); };
  }, [phase, saveProgress]);

  // Save on app background / unmount
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background") saveProgress();
    });
    return () => { sub.remove(); saveProgress(); };
  }, [saveProgress]);

  // ── Seek helpers ───────────────────────────────────────────────────────────
  const togglePlay = async () => {
    if (!videoRef.current) return;
    if (isPlaying) await videoRef.current.pauseAsync();
    else await videoRef.current.playAsync();
    showControls();
  };

  const seek = async (direction: "back" | "forward") => {
    if (!videoRef.current) return;
    const delta = direction === "forward" ? 10000 : -10000;
    await videoRef.current.setPositionAsync(Math.max(0, positionMs + delta));
    showControls();
  };

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const ss = String(s % 60).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  // ── Episode status helper ──────────────────────────────────────────────────
  const getEpStatus = (s: number, e: number): "watching" | "watched" | "none" => {
    if (s === season && e === episode) return "watching";
    if (watchSeason == null || watchEpisode == null) return "none";
    if (s < watchSeason) return "watched";
    if (s === watchSeason && e < watchEpisode) return "watched";
    if (s === watchSeason && e === watchEpisode) return "watching";
    return "none";
  };

  // Animated video width for panel mode
  const videoWidthAnim = panelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [W, W * 0.6],
  });

  // ── Web player ─────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <StatusBar hidden />

        {phase === "loading" && (
          <View style={StyleSheet.absoluteFill}>
            {backdropPath ? (
              <Image source={{ uri: TMDB_IMG(backdropPath) ?? "" }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : null}
            <View style={styles.loadOverlay} />
            <View style={styles.loadCenter}>
              <Text style={styles.loadServiceLabel}>N E T P L A Y</Text>
              <Text style={styles.loadTitle} numberOfLines={2}>{title}</Text>
              {(season != null && episode != null) && (
                <Text style={styles.loadEp}>T{season} · Ep {episode}{episodeName ? ` — ${episodeName}` : ""}</Text>
              )}
              <View style={styles.barTrack}>
                <Animated.View style={[styles.barFill, { width: loadProgress.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) }]} />
              </View>
              <Animated.Text style={styles.barPct}><ProgressText value={loadProgress} /></Animated.Text>
            </View>
          </View>
        )}

        {phase === "error" && (
          <View style={[StyleSheet.absoluteFill, styles.loadOverlay, styles.loadCenter]}>
            <Feather name="alert-circle" size={48} color={RED} />
            <Text style={styles.loadTitle}>{errorMsg}</Text>
          </View>
        )}

        {videoUrl && (
          <video
            src={videoUrl}
            controls
            autoPlay
            style={{ width: "100%", height: "100%", backgroundColor: "#000", display: phase === "loading" ? "none" : "block" } as any}
          />
        )}

        <Pressable style={[styles.backBtn, { top: topPad + 8 }]} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
      </View>
    );
  }

  // ── Native player ──────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: "#000", flexDirection: "row" }}>
      <StatusBar hidden />

      {/* Session blocked overlay */}
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
          <Pressable
            style={{ paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#333" }}
            onPress={() => router.back()}
          >
            <Text style={{ color: "#888", fontSize: 14 }}>Voltar</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Video container — shrinks when episodes panel is open */}
      <Animated.View style={{ width: videoWidthAnim, height: "100%", overflow: "hidden" }}>
        {videoUrl && Video && (
          <Video
            ref={videoRef}
            source={{ uri: videoUrl }}
            style={[StyleSheet.absoluteFill, { opacity: phase === "ready" ? 1 : 0 }]}
            resizeMode={ResizeMode?.CONTAIN ?? "contain"}
            shouldPlay={phase === "ready" && isPlaying}
            onLoad={onVideoLoad}
            onPlaybackStatusUpdate={onPlaybackStatusUpdate}
            useNativeControls={false}
          />
        )}

        {/* Loading / error overlay */}
        {(phase === "loading" || phase === "error") && (
          <View style={StyleSheet.absoluteFill}>
            {backdropPath ? (
              <Image source={{ uri: TMDB_IMG(backdropPath) ?? "" }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : null}
            <View style={styles.loadOverlay} />

            {phase === "error" ? (
              <View style={styles.loadCenter}>
                <Feather name="alert-circle" size={48} color={RED} />
                <Text style={styles.loadTitle}>{errorMsg}</Text>
                <Pressable style={styles.retryBtn} onPress={() => router.back()}>
                  <Text style={styles.retryText}>Voltar</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.loadCenter}>
                <Text style={styles.loadServiceLabel}>N E T P L A Y</Text>
                <Text style={styles.loadTitle} numberOfLines={2}>{title}</Text>
                {(season != null && episode != null) && (
                  <Text style={styles.loadEp}>T{season} · Ep {episode}{episodeName ? ` — ${episodeName}` : ""}</Text>
                )}
                <View style={styles.barTrack}>
                  <Animated.View style={[styles.barFill, { width: loadProgress.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) }]} />
                </View>
                <Animated.Text style={styles.barPct}><ProgressText value={loadProgress} /></Animated.Text>
              </View>
            )}

            <Pressable style={[styles.backBtn, { top: topPad + 8 }]} onPress={() => router.back()}>
              <Feather name="arrow-left" size={22} color="#fff" />
            </Pressable>
          </View>
        )}

        {/* Controls overlay */}
        {phase === "ready" && !showEpisodes && (
          <>
            <Pressable style={StyleSheet.absoluteFill} onPress={showControls} />
            {controlsVisible && (
              <Animated.View style={[styles.controls, { opacity: controlsOpacity }]}>
                <View style={[styles.topBar, { paddingTop: topPad + 8 }]}>
                  <Pressable style={styles.iconBtn} onPress={() => router.back()}>
                    <Feather name="arrow-left" size={22} color="#fff" />
                  </Pressable>
                  <View style={{ flex: 1, marginHorizontal: 12 }}>
                    <Text style={styles.ctrlTitle} numberOfLines={1}>{title}</Text>
                    {(season != null && episode != null) && (
                      <Text style={styles.ctrlEp}>T{season} · Ep {episode}{episodeName ? ` — ${episodeName}` : ""}</Text>
                    )}
                  </View>
                  <Pressable
                    style={[styles.iconBtn, { marginLeft: 8 }]}
                    onPress={() => Alert.alert("Espelhar Tela", "Use a função 'Transmitir' ou 'Screen Mirror' do seu dispositivo Android para espelhar o vídeo em uma TV.", [{ text: "OK" }])}
                  >
                    <Feather name="cast" size={19} color="#fff" />
                  </Pressable>
                  {isTV && (
                    <Pressable style={styles.episodesBtn} onPress={openEpisodesPanel}>
                      <Feather name="list" size={16} color="#fff" />
                      <Text style={styles.episodesBtnText}>Episódios</Text>
                    </Pressable>
                  )}
                </View>

                <View style={styles.centerRow}>
                  <Pressable style={styles.iconBtn} onPress={() => seek("back")}>
                    <Feather name="rotate-ccw" size={28} color="#fff" />
                    <Text style={styles.seekLabel}>10s</Text>
                  </Pressable>
                  <Pressable style={[styles.iconBtn, styles.playBtn]} onPress={togglePlay}>
                    <Feather name={isPlaying ? "pause" : "play"} size={36} color="#fff" />
                  </Pressable>
                  <Pressable style={styles.iconBtn} onPress={() => seek("forward")}>
                    <Feather name="rotate-cw" size={28} color="#fff" />
                    <Text style={styles.seekLabel}>10s</Text>
                  </Pressable>
                </View>

                <View style={styles.bottomBar}>
                  <Text style={styles.timeText}>{formatTime(positionMs)}</Text>
                  <View
                    style={styles.seekTrack}
                    onLayout={(e) => { seekBarWidthRef.current = e.nativeEvent.layout.width; }}
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderGrant={(e) => {
                      const ratio = Math.min(Math.max(0, e.nativeEvent.locationX) / (seekBarWidthRef.current || 1), 1);
                      const ms = Math.round(ratio * durationMs);
                      setPositionMs(ms); positionMsRef.current = ms;
                      videoRef.current?.setPositionAsync(ms).catch(() => {});
                      showControls();
                    }}
                    onResponderMove={(e) => {
                      const ratio = Math.min(Math.max(0, e.nativeEvent.locationX) / (seekBarWidthRef.current || 1), 1);
                      setPositionMs(Math.round(ratio * durationMs));
                    }}
                    onResponderRelease={(e) => {
                      const ratio = Math.min(Math.max(0, e.nativeEvent.locationX) / (seekBarWidthRef.current || 1), 1);
                      const ms = Math.round(ratio * durationMs);
                      setPositionMs(ms); positionMsRef.current = ms;
                      videoRef.current?.setPositionAsync(ms).catch(() => {});
                      showControls();
                    }}
                  >
                    <View style={[styles.seekFill, { width: `${progress * 100}%` as any }]} />
                    <View style={[styles.seekThumb, { left: `${progress * 100}%` as any }]} />
                  </View>
                  <Text style={styles.timeText}>{formatTime(durationMs)}</Text>
                  {isTV && (
                    <Pressable style={[styles.iconBtn, { marginLeft: 8 }]} onPress={goToNextEpisode}>
                      <Feather name="skip-forward" size={22} color="#fff" />
                    </Pressable>
                  )}
                </View>
              </Animated.View>
            )}
          </>
        )}

        {/* Dim overlay when panel is open (left side tap to close) */}
        {showEpisodes && (
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.45)" }]} onPress={closeEpisodesPanel} />
        )}
      </Animated.View>

      {/* ── Episodes Panel ─────────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.episodesPanel,
          {
            width: panelAnim.interpolate({ inputRange: [0, 1], outputRange: [0, W * 0.4] }),
            opacity: panelAnim,
          },
        ]}
        pointerEvents={showEpisodes ? "auto" : "none"}
      >
        {/* Panel header: backdrop + title */}
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

        {/* Season selector */}
        {displaySeasons.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.panelSeasonRow}>
            {displaySeasons.map((s) => (
              <Pressable
                key={s}
                onPress={() => setPanelSeason(s)}
                style={[
                  styles.panelSeasonBtn,
                  panelSeason === s && { backgroundColor: RED, borderColor: RED },
                ]}
              >
                <Text style={[styles.panelSeasonText, panelSeason === s && { color: "#fff" }]}>T{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Episode list */}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {(() => {
            const seasonItems = r2Items
              .filter((i) => i.season === panelSeason && i.episode != null)
              .sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));

            // Fallback: if no per-episode R2 items, use TMDB episodes + season-folder key
            const useTmdbFallback = seasonItems.length === 0 && panelEpisodes.length > 0;
            const folderItem = r2Items.find((i) => i.season === panelSeason && i.episode == null)
              ?? r2Items[0] ?? null;

            if (panelLoading) {
              return (
                <Text style={styles.panelEmpty}>Carregando episódios...</Text>
              );
            }

            if (useTmdbFallback) {
              return panelEpisodes.map((tmdbEp) => {
                const epNum = tmdbEp.episode_number;
                const status = getEpStatus(panelSeason, epNum);
                const isCurrentEp = status === "watching";
                const isWatched = status === "watched";
                const targetItem: RegistryItem | null = folderItem
                  ? { ...folderItem, episode: epNum, season: panelSeason }
                  : null;

                return (
                  <Pressable
                    key={epNum}
                    style={[styles.panelEpRow, isCurrentEp && styles.panelEpRowActive]}
                    onPress={() => targetItem && goToEpisode(targetItem)}
                  >
                    <View style={styles.panelEpThumb}>
                      {tmdbEp.still_path ? (
                        <Image source={{ uri: TMDB_IMG(tmdbEp.still_path, "w300") ?? "" }} style={StyleSheet.absoluteFill} resizeMode="cover" />
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
                      </View>
                      <Text style={styles.panelEpName} numberOfLines={2}>{tmdbEp.name}</Text>
                      {tmdbEp.runtime ? <Text style={styles.panelEpRuntime}>{tmdbEp.runtime} min</Text> : null}
                      {tmdbEp.overview ? <Text style={styles.panelEpOverview} numberOfLines={2}>{tmdbEp.overview}</Text> : null}
                    </View>
                  </Pressable>
                );
              });
            }

            if (seasonItems.length === 0) {
              return (
                <Text style={styles.panelEmpty}>Nenhum episódio disponível nesta temporada.</Text>
              );
            }

            return seasonItems.map((item) => {
              const epNum = item.episode ?? 0;
              const status = getEpStatus(panelSeason, epNum);
              const tmdbEp = panelEpisodes.find((e) => e.episode_number === epNum);
              const isCurrentEp = status === "watching";
              const isWatched = status === "watched";

              return (
                <Pressable
                  key={item.id}
                  style={[styles.panelEpRow, isCurrentEp && styles.panelEpRowActive]}
                  onPress={() => goToEpisode(item)}
                >
                  {/* Thumbnail */}
                  <View style={styles.panelEpThumb}>
                    {tmdbEp?.still_path ? (
                      <Image
                        source={{ uri: TMDB_IMG(tmdbEp.still_path, "w300") ?? "" }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, styles.panelEpThumbFallback]}>
                        <Feather name="film" size={16} color="#555" />
                      </View>
                    )}
                    {isCurrentEp && (
                      <View style={styles.panelEpPlayOverlay}>
                        <Feather name="pause" size={18} color="#fff" />
                      </View>
                    )}
                    {isWatched && (
                      <View style={styles.panelEpWatchedBadge}>
                        <Feather name="check" size={10} color="#fff" />
                      </View>
                    )}
                  </View>

                  {/* Info */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={[styles.panelEpNum, isCurrentEp && { color: RED }]}>Ep. {epNum}</Text>
                      {isWatched && <Text style={styles.panelEpWatchedTxt}>Assistido</Text>}
                      {isCurrentEp && <Text style={[styles.panelEpWatchedTxt, { color: RED }]}>Em andamento</Text>}
                    </View>
                    <Text style={styles.panelEpName} numberOfLines={2}>
                      {tmdbEp?.name ?? item.label}
                    </Text>
                    {tmdbEp?.runtime ? (
                      <Text style={styles.panelEpRuntime}>{tmdbEp.runtime} min</Text>
                    ) : null}
                    {tmdbEp?.overview ? (
                      <Text style={styles.panelEpOverview} numberOfLines={2}>{tmdbEp.overview}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            });
          })()}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function ProgressText({ value }: { value: Animated.Value }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const id = value.addListener(({ value: v }) => setPct(Math.round(v)));
    return () => value.removeListener(id);
  }, [value]);
  return <>{pct}%</>;
}

const styles = StyleSheet.create({
  loadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.72)" },
  loadCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  loadServiceLabel: { color: RED, fontSize: 13, fontWeight: "900", letterSpacing: 6, marginBottom: 24 },
  loadTitle: { color: "#fff", fontSize: 22, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  loadEp: { color: "rgba(255,255,255,0.55)", fontSize: 14, marginBottom: 32 },
  barTrack: { width: "100%", height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden", marginBottom: 8 },
  barFill: { height: "100%", backgroundColor: RED, borderRadius: 2 },
  barPct: { color: "rgba(255,255,255,0.6)", fontSize: 13 },
  retryBtn: { marginTop: 24, backgroundColor: RED, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 8 },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  backBtn: { position: "absolute", left: 16, zIndex: 20, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  controls: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "space-between" },
  topBar: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingBottom: 12 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  ctrlTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  ctrlEp: { color: "rgba(255,255,255,0.6)", fontSize: 13 },
  centerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 40 },
  playBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 2, borderColor: "rgba(255,255,255,0.4)" },
  seekLabel: { color: "#fff", fontSize: 10, marginTop: 2 },
  bottomBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 28, gap: 10 },
  timeText: { color: "rgba(255,255,255,0.7)", fontSize: 12, minWidth: 42 },
  seekTrack: { flex: 1, height: 4, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 2 },
  seekFill: { height: "100%", backgroundColor: RED, borderRadius: 2 },
  seekThumb: { position: "absolute", top: -5, marginLeft: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: RED },
  episodesBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)",
  },
  episodesBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  // Episodes panel
  episodesPanel: {
    height: "100%", backgroundColor: "#0e0e0e", overflow: "hidden",
    borderLeftWidth: 1, borderLeftColor: "#1e1e1e",
  },
  panelHeader: { height: 120, position: "relative", overflow: "hidden" },
  panelBackdrop: { ...StyleSheet.absoluteFillObject as any, width: "100%", height: "100%" },
  panelBackdropGrad: {
    ...StyleSheet.absoluteFillObject as any,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  panelHeaderInfo: { position: "absolute", bottom: 10, left: 12, right: 44 },
  panelTitle: { color: "#fff", fontSize: 14, fontWeight: "800", lineHeight: 18 },
  panelCurrentEp: { color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 2 },
  panelCloseBtn: {
    position: "absolute", top: 10, right: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center",
  },
  panelSeasonRow: { paddingHorizontal: 10, paddingVertical: 8, maxHeight: 50 },
  panelSeasonBtn: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, marginRight: 6,
    borderWidth: 1, borderColor: "#333", backgroundColor: "#1a1a1a",
  },
  panelSeasonText: { color: "#aaa", fontSize: 12, fontWeight: "700" },
  panelEmpty: { color: "#555", fontSize: 13, textAlign: "center", marginTop: 30, paddingHorizontal: 16 },
  panelEpRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: "#1a1a1a",
  },
  panelEpRowActive: { backgroundColor: "rgba(229,9,20,0.1)" },
  panelEpThumb: {
    width: 80, height: 50, borderRadius: 6, overflow: "hidden",
    backgroundColor: "#1a1a1a", position: "relative",
  },
  panelEpThumbFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#1a1a1a" },
  panelEpPlayOverlay: {
    ...StyleSheet.absoluteFillObject as any,
    backgroundColor: "rgba(229,9,20,0.4)",
    alignItems: "center", justifyContent: "center",
  },
  panelEpWatchedBadge: {
    position: "absolute", bottom: 4, right: 4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#4ade80", alignItems: "center", justifyContent: "center",
  },
  panelEpNum: { color: "#888", fontSize: 11, fontWeight: "700" },
  panelEpWatchedTxt: { color: "#4ade80", fontSize: 10, fontWeight: "600" },
  panelEpName: { color: "#fff", fontSize: 12, fontWeight: "600", marginTop: 2, lineHeight: 16 },
  panelEpRuntime: { color: "#666", fontSize: 10, marginTop: 2 },
  panelEpOverview: { color: "rgba(255,255,255,0.4)", fontSize: 10, lineHeight: 14, marginTop: 3 },
});
