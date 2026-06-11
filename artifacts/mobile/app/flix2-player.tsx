/**
 * flix2-player.tsx
 * Dedicated player for Flix2 / fontedecanais CDN content.
 *
 * KEY DESIGN:
 *  - nixplay.lat: redireciona (302) para http:// fontedecanais CDN (cleartext HTTP).
 *    → ExoPlayer segue o redirect e Android bloqueia cleartext mesmo com usesCleartextTraffic.
 *    → Fix: CF Worker resolve o redirect server-side e serve HTTPS ao ExoPlayer.
 *  - fontedecanais direct URL: token TIME-BASED, não IP-bound → play direto com headers.
 *    → CF Worker gets 403 porque Cloudflare IPs são bloqueados pela CDN fontedecanais.
 *  - cineveo.lat: precisa de Referer/Origin server-side → CF Worker.
 *  - Web: sempre proxy (CORS bloqueia requests diretos de mídia no browser).
 *
 * Routing (nativo Android/iOS):
 *  nixplay.lat  → CF Worker (resolve redirect HTTP→HTTPS server-side)
 *  cineveo.lat  → CF Worker (Referer/Origin server-side)
 *  fontedecanais direct URL → play direto com browser UA + Referer headers
 *  web → Replit proxy
 *
 * Flow:
 *  1. Receive rawFlix2Url
 *  2. Route per rules above → setVideoUrl()
 *  3. Play via expo-av with full controls
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { getApiBase } from "@/lib/api";
import { appLog } from "@/lib/app-logger";
import { getProxiedStreamUrl } from "@/lib/gdrive-index";
import { useAuth } from "@/lib/auth-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import { checkAndStartSession, heartbeatSession, endSession } from "@/lib/session-manager";
import { saveLocalProgress } from "@/hooks/useWatchProgress";
import WebViewVideoPlayer, { type WebViewVideoPlayerRef } from "@/components/WebViewVideoPlayer";

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
const NEXT_EP_COUNTDOWN_S = 20;
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

  // ── Loading screen state ─────────────────────────────────────────────────────
  const loadProgress = useRef(new Animated.Value(0)).current;
  const fakeAnim = useRef<Animated.CompositeAnimation | null>(null);
  const [loadingTips, setLoadingTips] = useState<string[]>([]);
  const [tipIdx, setTipIdx] = useState(0);
  const tipTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [contentLogo, setContentLogo] = useState<string | null>(null);

  // ── Player mode ───────────────────────────────────────────────────────────────
  // expo-av (ExoPlayer) is used for all native CDN types.
  // A hidden WebView is used ONLY to resolve nixplay.lat redirects before playing.
  const useWebViewPlayer = false;

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
    const isFonteUrl = (u: string) => ["72yrci50ppqp71.com", "fontedecanais.me"].some((r) => u.includes(r));
    const isCineveoUrl = (u: string) => u.includes("cineveo.lat");
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
      // ── Reprodução direta, sem servidor intermediário ─────────────────────────
      //
      // Routing rules (definitivo — sem proxy de servidor):
      //  nixplay.lat/movie|series → DIRETO no device com browser UA + Referer headers.
      //                             Sem CF Worker, sem proxy. expo-av repassa os headers
      //                             nativamente para ExoPlayer.
      //  cineveo.lat              → CF Worker (Referer/Origin precisam ser setados
      //                             server-side para CDN aceitar)
      //  fontedecanais direct     → play direto (token não é IP-bound)
      //  web                      → proxy (CORS bloqueia requests diretos do browser)

      if (Platform.OS !== "web" && isNixplayDirect(rawFlix2Url)) {
        // nixplay.lat → redireciona (302) para http:// fontedecanais CDN.
        // ExoPlayer bloqueia cross-scheme HTTPS→HTTP mesmo com usesCleartextTraffic.
        //
        // ESTRATÉGIA: resolver o redirect NO DEVICE (IP mobile não é bloqueado).
        // React Native fetch() segue HTTPS→HTTP sem restrição — diferente do ExoPlayer.
        // response.url retorna a URL final após todos os redirects.
        // Depois passamos a URL fontedecanais direto ao ExoPlayer (sem redirect).
        //
        // O servidor Replit tem IP de datacenter bloqueado pelo nixplay → não usar servidor.

        let resolvedUrl = rawFlix2Url;
        let resolvedVia = "nixplay-direct";

        // ESTRATÉGIA: WebView oculto com onShouldStartLoadWithRequest.
        //
        // fetch(redirect:"manual") no Android/Hermes NÃO expõe o header Location
        // em respostas 302 — retorna opaque response com headers vazios.
        // fetch(redirect:"follow") bloqueia cross-scheme HTTPS→HTTP (OkHttp segurança).
        //
        // O WebView do Android (Chromium) SIM segue HTTPS→HTTP e o callback
        // onShouldStartLoadWithRequest dispara para cada URL na cadeia de redirects,
        // permitindo capturar a URL final (fontedecanais) antes de qualquer carregamento.
        if (WebView) {
          try {
            const webviewResolved = await new Promise<string>((resolve) => {
              resolverCallbackRef.current = resolve;
              setResolverUrl(rawFlix2Url);
              // Timeout: se o WebView não resolver em 10s, continua sem resolução
              resolverTimerRef.current = setTimeout(() => {
                if (resolverCallbackRef.current) {
                  resolverCallbackRef.current = null;
                  resolve(rawFlix2Url);
                }
              }, 10000);
            });
            setResolverUrl(null);
            if (webviewResolved !== rawFlix2Url) {
              resolvedUrl = webviewResolved;
              resolvedVia = "webview-redirect";
              appLog.info("player.flix2", "Redirect resolvido via WebView", {
                resolved: webviewResolved.slice(0, 80),
              });
            }
          } catch (wvErr: any) {
            setResolverUrl(null);
            appLog.warn("player.flix2", "WebView resolver falhou", { error: String(wvErr) });
          }
        }

        // Fallback: CF Worker (caso o WebView não esteja disponível ou timeout)
        if (resolvedUrl === rawFlix2Url) {
          resolvedUrl = `${CF_WORKER_URL}/?url=${encodeURIComponent(rawFlix2Url)}`;
          resolvedVia = "cf-worker-fallback";
          appLog.warn("player.flix2", "Usando CF Worker como fallback para nixplay");
        }

        // If WebView resolved to an HTTP URL, ExoPlayer will throw CLEARTEXT error.
        // Upgrade via CF Worker so the device receives an HTTPS stream URL.
        if (resolvedUrl !== rawFlix2Url && resolvedUrl.startsWith("http://")) {
          appLog.info("player.flix2", "HTTP resolved URL → CF Worker HTTPS upgrade", {
            httpUrl: resolvedUrl.slice(0, 80),
          });
          resolvedUrl = `${CF_WORKER_URL}/?url=${encodeURIComponent(resolvedUrl)}`;
          resolvedVia = resolvedVia + "+cf-http-upgrade";
        }

        appLog.info("player.flix2", "Reprodução nixplay resolvida", {
          rawUrl: rawFlix2Url.slice(0, 80),
          resolvedUrl: resolvedUrl.slice(0, 80),
          via: resolvedVia,
          platform: Platform.OS,
        });

        setResolvedCdnType(isFonteUrl(resolvedUrl) ? "fontedecanais" : resolvedVia.includes("webview-redirect") ? "nixplay-resolved" : "nixplay");
        // fontedecanais: token não é IP-bound, play direto com browser UA + Referer
        // cf-worker / http-upgrade: HTTPS proxy, sem headers adicionais necessários
        setVideoSourceHeaders(isFonteUrl(resolvedUrl) ? FLIX2_HEADERS : undefined);
        setVideoUrl(resolvedUrl);
      } else if (Platform.OS !== "web" && isCineveoUrl(rawFlix2Url)) {
        // cineveo.lat → CF Worker (precisa de Referer/Origin setados server-side)
        const workerUrl = `${CF_WORKER_URL}/?url=${encodeURIComponent(rawFlix2Url)}`;
        appLog.info("player.flix2", "Reprodução via CF Worker (cineveo)", {
          workerUrl: workerUrl.slice(0, 80),
          platform: Platform.OS,
        });
        setResolvedCdnType("cineveo");
        setVideoUrl(workerUrl);
      } else if (Platform.OS === "web") {
        // Web: browser não pode setar Referer/Origin em requests de mídia → proxy
        const proxiedUrl = getProxiedStreamUrl(rawFlix2Url);
        if (!proxiedUrl || proxiedUrl === rawFlix2Url) {
          throw new Error("Servidor de proxy não disponível. Verifique a conexão.");
        }
        appLog.info("player.flix2", "Reprodução via proxy (web)", {
          proxyUrl: proxiedUrl.slice(0, 80),
        });
        setResolvedCdnType("flix2");
        setVideoUrl(proxiedUrl);
      } else {
        // Nativo (Android/iOS): fontedecanais direct CDN URL — token não é IP-bound,
        // play direto com headers de browser.
        appLog.info("player.flix2", "Reprodução direta com headers de browser", {
          url: rawFlix2Url?.slice(0, 80),
          platform: Platform.OS,
        });
        setResolvedCdnType(isFonteUrl(rawFlix2Url) ? "fontedecanais" : "flix2");
        setVideoSourceHeaders(FLIX2_HEADERS);
        setVideoUrl(rawFlix2Url);
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
    Animated.timing(panelAnim, { toValue: 1, duration: 280, useNativeDriver: false }).start();
    showControls();
  }, [season, showControls]);

  const closeEpisodesPanel = useCallback(() => {
    Animated.timing(panelAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start(() => setShowEpisodes(false));
  }, []);

  // Fetch TMDB episodes for panel display
  useEffect(() => {
    if (!showEpisodes || !tmdbId || !isTV) return;
    setPanelLoading(true);
    const ctrl = new AbortController();
    fetch(
      `https://api.themoviedb.org/3/tv/${tmdbId}/season/${panelSeason}?api_key=${TMDB_KEY}&language=pt-BR`,
      { signal: ctrl.signal }
    )
      .then((r) => r.json())
      .then((data) => setPanelEpisodes(data.episodes ?? []))
      .catch(() => setPanelEpisodes([]))
      .finally(() => setPanelLoading(false));
    return () => ctrl.abort();
  }, [showEpisodes, panelSeason, tmdbId, isTV]);

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
    await saveLocalProgress({
      contentId: `${contentType}_${tmdbId}`,
      tmdbId: String(tmdbId),
      type: contentType,
      title,
      posterPath: posterPath ?? "",
      backdropPath: backdropPath ?? "",
      progress: ratio,
      positionMs: positionMsRef.current,
      durationMs: durationMsRef.current,
      season: isTV ? (season ?? undefined) : undefined,
      episode: isTV ? (episode ?? undefined) : undefined,
    });
  }, [tmdbId, contentType, title, posterPath, backdropPath, season, episode, isTV]);

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

  // ── Double-tap seek detection ─────────────────────────────────────────────────
  const handleTap = useCallback((x: number) => {
    const now = Date.now();
    const isLeft = x < W / 2;
    if (lastTapRef.current && now - lastTapRef.current.time < 300 && Math.abs(x - lastTapRef.current.x) < 80) {
      if (tapTimerRef.current) { clearTimeout(tapTimerRef.current); tapTimerRef.current = null; }
      lastTapRef.current = null;
      seekBy(isLeft ? -15000 : 15000);
    } else {
      lastTapRef.current = { time: now, x };
      tapTimerRef.current = setTimeout(() => { lastTapRef.current = null; togglePlay(); }, 300);
    }
  }, [seekBy, togglePlay]);

  // ── Seek bar ─────────────────────────────────────────────────────────────────
  const onSeekStart = useCallback((x: number) => {
    setIsScrubbing(true);
    setScrubPosition((x / seekBarWidthRef.current) * durationMs);
    showControls();
  }, [durationMs, showControls]);

  const onSeekMove = useCallback((x: number) => {
    setScrubPosition(Math.max(0, Math.min(durationMs, (x / seekBarWidthRef.current) * durationMs)));
  }, [durationMs]);

  const onSeekEnd = useCallback((x: number) => {
    const pos = Math.max(0, Math.min(durationMs, (x / seekBarWidthRef.current) * durationMs));
    setIsScrubbing(false);
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
      {/* Session blocked modal */}
      <Modal visible={!!sessionBlocked} transparent animationType="fade">
        <View style={styles.sessionModal}>
          <View style={styles.sessionBox}>
            <Feather name="lock" size={32} color={RED} />
            <Text style={styles.sessionTitle}>Limite de telas atingido</Text>
            <Text style={styles.sessionMsg}>Seu plano não permite mais dispositivos simultâneos.</Text>
            <Pressable style={styles.sessionBtn} onPress={() => router.back()}>
              <Text style={styles.sessionBtnText}>Voltar</Text>
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

      {/* ── Video player ────────────────────────────────────────────────────── */}
      {/* IMPORTANT: mount as soon as videoUrl is set (not only when ready).
          Mounting only on "ready" creates a deadlock: onLoad/onPlaybackStatusUpdate
          never fire → transitionToReady never called → stuck at 80% forever.
          We hide the video visually during loading; it becomes visible once ready.
          
          Two player modes:
          • WebViewVideoPlayer — nixplay.lat / fontedecanais / cineveo links on native.
            Chromium WebView handles HTTPS→HTTP redirects and special URL chars (@@)
            that ExoPlayer rejects even with usesCleartextTraffic.
          • expo-av Video — all other sources (direct links, proxy, web). */}
      {videoUrl && useWebViewPlayer ? (
        <WebViewVideoPlayer
          ref={videoRef}
          uri={videoUrl}
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

      {/* ── Buffering indicator ────────────────────────────────────────────── */}
      {phase === "ready" && isBuffering && (
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

      {/* ── Speed boost badge ──────────────────────────────────────────────── */}
      {isSpeedBoost && (
        <View style={styles.speedBoostBadge} pointerEvents="none">
          <Feather name="fast-forward" size={16} color="#fff" />
          <Text style={styles.speedBoostText}>2×</Text>
        </View>
      )}

      {/* ── Skip intro ─────────────────────────────────────────────────────── */}
      {showSkipIntro && phase === "ready" && controlsVisible && (
        <Pressable style={styles.skipIntroBtnPos} onPress={skipIntro}>
          <View style={styles.skipIntroBtn}>
            <Feather name="skip-forward" size={14} color="#fff" />
            <Text style={styles.skipIntroBtnText}>Pular introdução</Text>
          </View>
        </Pressable>
      )}

      {/* ── Skip credits ────────────────────────────────────────────────────── */}
      {showSkipCredits && phase === "ready" && !showSkipIntro && controlsVisible && (
        <Pressable style={styles.skipCreditsBtnPos} onPress={skipCredits}>
          <View style={styles.skipIntroBtn}>
            <Feather name="skip-forward" size={14} color="#fff" />
            <Text style={styles.skipIntroBtnText}>{isTV ? "Próximo episódio" : "Pular créditos"}</Text>
          </View>
        </Pressable>
      )}

      {/* ── Next episode countdown ─────────────────────────────────────────── */}
      {showNextEpCountdown && !showEpisodes && (
        <View style={styles.nextEpCountdown}>
          <View style={styles.nextEpCountdownInner}>
            <Text style={styles.nextEpCountdownLabel}>Próximo episódio em</Text>
            <Text style={styles.nextEpCountdownNum}>{nextEpCountdownSec}s</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Pressable style={styles.nextEpNowBtn} onPress={goToNextEpisode}>
                <Feather name="skip-forward" size={14} color="#fff" />
                <Text style={styles.nextEpNowBtnText}>Assistir agora</Text>
              </Pressable>
              <Pressable style={styles.nextEpCancelBtn} onPress={() => { setShowNextEpCountdown(false); setContinuousPlay(false); }}>
                <Text style={styles.nextEpCancelText}>Cancelar</Text>
              </Pressable>
            </View>
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

      {/* ── Controls overlay ───────────────────────────────────────────────── */}
      {phase === "ready" && !showEpisodes && !isLocked && (
        <>
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
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
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  {contentLogo ? (
                    <Image source={{ uri: contentLogo }} style={styles.ctrlContentLogo} contentFit="contain" />
                  ) : (
                    <Text style={styles.ctrlTitle} numberOfLines={1}>{title}</Text>
                  )}
                  {season != null && episode != null && (
                    <Text style={styles.ctrlEp}>T{season} · Ep {episode}{episodeName ? ` — ${episodeName}` : ""}</Text>
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
                  {isScrubbing && (
                    <View style={[styles.seekTooltip, { left: Math.max(24, Math.min(seekBarWidthRef.current - 40, displayProgress * seekBarWidthRef.current - 24)) }]}>
                      <Text style={styles.seekTooltipText}>{formatTime(scrubPosition)}</Text>
                    </View>
                  )}
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

      {/* Dim overlay when episodes panel open */}
      {showEpisodes && (
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.45)" }]} onPress={closeEpisodesPanel} />
      )}

      {/* ── Episodes panel ─────────────────────────────────────────────────── */}
      <Animated.View
        style={[styles.episodesPanel, {
          width: panelAnim.interpolate({ inputRange: [0, 1], outputRange: [0, W * 0.4] }),
          opacity: panelAnim,
        }]}
        pointerEvents={showEpisodes ? "auto" : "none"}
      >
        <View style={styles.panelHeader}>
          {backdropPath ? (
            <Image source={{ uri: TMDB_IMG(backdropPath, "w780") ?? "" }} style={styles.panelBackdrop} contentFit="cover" />
          ) : posterPath ? (
            <Image source={{ uri: TMDB_IMG(posterPath, "w342") ?? "" }} style={styles.panelBackdrop} contentFit="cover" />
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

        <Pressable style={styles.panelAutoPlayRow} onPress={() => setContinuousPlay(!continuousPlay)}>
          <Feather name="repeat" size={14} color={continuousPlay ? RED : "#666"} />
          <Text style={[styles.panelAutoPlayText, continuousPlay && { color: RED }]}>
            {continuousPlay ? "Reprodução contínua ativada" : "Reprodução contínua desativada"}
          </Text>
          <View style={[styles.panelAutoPlayToggle, continuousPlay && { backgroundColor: RED }]}>
            <View style={[styles.panelAutoPlayKnob, continuousPlay && { marginLeft: 14 }]} />
          </View>
        </Pressable>

        {displaySeasons.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.panelSeasonRow}>
            {displaySeasons.map((s) => (
              <Pressable key={s} onPress={() => { haptic(20); setPanelSeason(s); }} style={[styles.panelSeasonBtn, panelSeason === s && { backgroundColor: RED, borderColor: RED }]}>
                <Text style={[styles.panelSeasonText, panelSeason === s && { color: "#fff" }]}>T{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {panelLoading ? (
            <View style={{ padding: 24, alignItems: "center" }}>
              <Text style={styles.panelEmpty}>Carregando episódios...</Text>
            </View>
          ) : (() => {
            const seasonFlix2 = flix2Items
              .filter((i) => i.season === panelSeason && i.episode != null)
              .sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));

            if (seasonFlix2.length === 0 && panelEpisodes.length > 0) {
              return panelEpisodes.map((tmdbEp: any) => (
                <View key={tmdbEp.episode_number} style={styles.panelEpRow}>
                  <View style={styles.panelEpThumb}>
                    {tmdbEp.still_path ? (
                      <Image source={{ uri: TMDB_IMG(tmdbEp.still_path, "w300") ?? "" }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, styles.panelEpThumbFallback]}>
                        <Feather name="film" size={16} color="#555" />
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.panelEpNum}>Ep. {tmdbEp.episode_number}</Text>
                    <Text style={styles.panelEpName} numberOfLines={2}>{tmdbEp.name}</Text>
                  </View>
                </View>
              ));
            }

            if (seasonFlix2.length === 0) {
              return <View style={{ padding: 24, alignItems: "center" }}><Text style={styles.panelEmpty}>Nenhum episódio disponível</Text></View>;
            }

            return seasonFlix2.map((item) => {
              const isCurrentEp = item.season === season && item.episode === episode;
              const tmdbEp = panelEpisodes.find((e: any) => e.episode_number === item.episode);
              return (
                <Pressable
                  key={item.id}
                  style={[styles.panelEpRow, isCurrentEp && styles.panelEpRowActive]}
                  onPress={() => { haptic(20); goToEpisode(item); }}
                >
                  <View style={styles.panelEpThumb}>
                    {tmdbEp?.still_path ? (
                      <Image source={{ uri: TMDB_IMG(tmdbEp.still_path, "w300") ?? "" }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, styles.panelEpThumbFallback]}>
                        <Feather name="film" size={16} color="#555" />
                      </View>
                    )}
                    {isCurrentEp && <View style={styles.panelEpPlayOverlay}><Feather name="pause" size={18} color="#fff" /></View>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.panelEpNum, isCurrentEp && { color: RED }]}>Ep. {item.episode}</Text>
                    <Text style={styles.panelEpName} numberOfLines={2}>{tmdbEp?.name ?? item.label}</Text>
                    {tmdbEp?.runtime && <Text style={styles.panelEpRuntime}>{tmdbEp.runtime}min</Text>}
                  </View>
                </Pressable>
              );
            });
          })()}
        </ScrollView>
      </Animated.View>

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
            // Ignore the original nixplay URL and about:/data: frames
            if (!u || u.includes("nixplay.lat") || u.startsWith("about:") || u.startsWith("data:")) {
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

  // Next ep countdown
  nextEpCountdown: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "flex-end", paddingRight: 32 },
  nextEpCountdownInner: { backgroundColor: "rgba(0,0,0,0.82)", borderRadius: 16, padding: 20, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  nextEpCountdownLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  nextEpCountdownNum: { color: "#fff", fontSize: 36, fontWeight: "900" },
  nextEpNowBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: RED, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  nextEpNowBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  nextEpCancelBtn: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  nextEpCancelText: { color: "rgba(255,255,255,0.7)", fontSize: 13 },

  // Sleep badge
  sleepBadge: { position: "absolute", top: 54, right: 16, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  sleepBadgeText: { color: "#aaa", fontSize: 11 },

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

  // Session modal
  sessionModal: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center" },
  sessionBox: { backgroundColor: "#1a1a1a", borderRadius: 16, padding: 28, alignItems: "center", gap: 12, maxWidth: 320, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  sessionTitle: { color: "#fff", fontSize: 18, fontWeight: "800", textAlign: "center" },
  sessionMsg: { color: "rgba(255,255,255,0.6)", fontSize: 13, textAlign: "center", lineHeight: 20 },
  sessionBtn: { backgroundColor: RED, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  sessionBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // Episodes panel
  episodesPanel: { position: "absolute", top: 0, right: 0, bottom: 0, backgroundColor: "rgba(12,12,12,0.97)", borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  panelHeader: { height: 120, overflow: "hidden", position: "relative" },
  panelBackdrop: { ...StyleSheet.absoluteFillObject },
  panelBackdropGrad: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  panelHeaderInfo: { position: "absolute", bottom: 10, left: 12, right: 40 },
  panelTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  panelCurrentEp: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 },
  panelCloseBtn: { position: "absolute", top: 10, right: 10, width: 32, height: 32, justifyContent: "center", alignItems: "center" },
  panelAutoPlayRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  panelAutoPlayText: { color: "#666", fontSize: 11, fontWeight: "600", flex: 1 },
  panelAutoPlayToggle: { width: 32, height: 18, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 9 },
  panelAutoPlayKnob: { width: 14, height: 14, backgroundColor: "#fff", borderRadius: 7, marginTop: 2, marginLeft: 2 },
  panelSeasonRow: { paddingHorizontal: 10, paddingVertical: 8, maxHeight: 48 },
  panelSeasonBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", marginRight: 6 },
  panelSeasonText: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "700" },
  panelEmpty: { color: "rgba(255,255,255,0.3)", fontSize: 13 },
  panelEpRow: { flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  panelEpRowActive: { backgroundColor: "rgba(229,9,20,0.1)", borderLeftWidth: 2, borderLeftColor: RED },
  panelEpThumb: { width: 80, height: 48, borderRadius: 6, backgroundColor: "#222", overflow: "hidden" },
  panelEpThumbFallback: { justifyContent: "center", alignItems: "center" },
  panelEpPlayOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(229,9,20,0.4)", justifyContent: "center", alignItems: "center" },
  panelEpNum: { color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "700" },
  panelEpName: { color: "#fff", fontSize: 12, fontWeight: "600", marginTop: 2 },
  panelEpRuntime: { color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 2 },
});
