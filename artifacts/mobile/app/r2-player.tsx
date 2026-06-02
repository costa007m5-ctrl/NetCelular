import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { getApiBase } from "@/lib/api";

let Video: any = null;
let ResizeMode: any = null;
try { const av = require("expo-av"); Video = av.Video; ResizeMode = av.ResizeMode; } catch {}

let ScreenOrientation: any = null;
try { ScreenOrientation = require("expo-screen-orientation"); } catch {}

let NavBar: any = null;
try { NavBar = require("expo-navigation-bar"); } catch {}

const { width: W, height: H } = Dimensions.get("window");
const RED = "#e50914";
const TMDB_IMG = (path: string | null, size = "w1280") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

function mkSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

async function resolveVideoKey(key: string): Promise<string> {
  // If key is a direct file, return as-is
  if (!key.endsWith("/")) return key;
  const base = getApiBase();
  if (!base) throw new Error("API não configurada");
  // List recursively (empty delimiter) so videos in sub-folders are found too
  const res = await fetch(`${base}/r2/list?prefix=${encodeURIComponent(key)}&delimiter=`, {
    signal: mkSignal(20000),
  });
  if (!res.ok) throw new Error("Erro ao listar pasta");
  const data = await res.json();
  const videoExts = /\.(mp4|mkv|mov|avi|webm|m4v|ts|m2ts|wmv|flv|ogv)$/i;
  // Accept files flagged as video by the API OR matched by extension
  const vid = (data.files ?? []).find((f: any) => f.isVideo || videoExts.test(f.key));
  if (!vid) throw new Error("Nenhum vídeo encontrado na pasta");
  return vid.key;
}

async function fetchSignedUrl(key: string): Promise<string> {
  const base = getApiBase();
  if (!base) throw new Error("API não configurada");
  const resolvedKey = await resolveVideoKey(key);
  const res = await fetch(`${base}/r2/signed-url?key=${encodeURIComponent(resolvedKey)}`, {
    signal: mkSignal(15000),
  });
  if (!res.ok) throw new Error("Erro ao gerar URL de vídeo");
  const data = await res.json();
  return data.url;
}

export default function R2PlayerScreen() {
  const params = useLocalSearchParams<{
    key: string;
    title: string;
    episodeName?: string;
    season?: string;
    episode?: string;
    backdropPath?: string;
    posterPath?: string;
    tmdbId?: string;
    type?: string;
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

  const loadProgress = useRef(new Animated.Value(0)).current;
  const fakeAnim = useRef<Animated.CompositeAnimation | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<any>(null);
  const phaseRef = useRef<"loading" | "ready" | "error">("loading");
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep phaseRef in sync so callbacks can read it without stale closure
  const transitionToReady = useCallback((durationMillis = 0) => {
    if (phaseRef.current !== "loading") return;
    phaseRef.current = "ready";
    if (readyTimer.current) clearTimeout(readyTimer.current);
    setDurationMs(durationMillis);
    fakeAnim.current?.stop();
    Animated.timing(loadProgress, { toValue: 100, duration: 400, useNativeDriver: false }).start(() => {
      setPhase("ready");
      setIsPlaying(true);
    });
  }, []);

  const title = params.title ?? "Assistindo";
  const episodeName = params.episodeName ?? "";
  const season = params.season ? Number(params.season) : null;
  const episode = params.episode ? Number(params.episode) : null;
  const backdropPath = params.backdropPath ?? null;

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

  // ── Fetch signed URL + fake loading animation ──────────────────────────────
  useEffect(() => {
    if (!params.key) { setPhase("error"); setErrorMsg("Arquivo não especificado"); return; }

    fakeAnim.current = Animated.timing(loadProgress, {
      toValue: 80,
      duration: 4000,
      useNativeDriver: false,
    });
    fakeAnim.current.start();

    fetchSignedUrl(params.key)
      .then((url) => {
        setVideoUrl(url);

        if (Platform.OS === "web") {
          // Web: <video> element handles buffering natively — transition to ready immediately
          fakeAnim.current?.stop();
          Animated.timing(loadProgress, { toValue: 100, duration: 300, useNativeDriver: false }).start(() => {
            phaseRef.current = "ready";
            setPhase("ready");
          });
        } else {
          // Native: animate to 95%, then wait for onLoad/onPlaybackStatusUpdate
          // Fallback: force ready after 12s if callbacks don't fire
          fakeAnim.current = Animated.timing(loadProgress, {
            toValue: 95,
            duration: 1500,
            useNativeDriver: false,
          });
          fakeAnim.current.start();
          readyTimer.current = setTimeout(() => transitionToReady(0), 12000);
        }
      })
      .catch((e) => {
        setPhase("error");
        setErrorMsg(e.message ?? "Erro ao carregar");
        fakeAnim.current?.stop();
      });
  }, [params.key]);

  // ── When video is ready (expo-av onLoad) — native only ────────────────────
  const onVideoLoad = useCallback((status: any) => {
    transitionToReady(status?.durationMillis ?? 0);
  }, [transitionToReady]);

  const onPlaybackStatusUpdate = useCallback((status: any) => {
    if (!status?.isLoaded) return;
    // Secondary ready trigger: fires more reliably than onLoad for some formats/URLs
    transitionToReady(status.durationMillis ?? 0);
    setIsPlaying(status.isPlaying ?? false);
    setPositionMs(status.positionMillis ?? 0);
    setDurationMs(status.durationMillis ?? 0);
    if (status.didJustFinish) router.back();
  }, [transitionToReady]);

  // ── Controls auto-hide ─────────────────────────────────────────────────────
  const showControls = useCallback(() => {
    setControlsVisible(true);
    Animated.timing(controlsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(controlsOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() =>
        setControlsVisible(false)
      );
    }, 4000);
  }, []);

  useEffect(() => { if (phase === "ready") showControls(); }, [phase]);
  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (readyTimer.current) clearTimeout(readyTimer.current);
  }, []);

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

  // ── Web player ─────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <StatusBar hidden />

        {/* Loading overlay — shown until URL is ready */}
        {phase === "loading" && (
          <View style={StyleSheet.absoluteFill}>
            {backdropPath ? (
              <Image source={{ uri: TMDB_IMG(backdropPath) ?? "" }} style={StyleSheet.absoluteFill} contentFit="cover" />
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

        {/* Error overlay */}
        {phase === "error" && (
          <View style={[StyleSheet.absoluteFill, styles.loadOverlay, styles.loadCenter]}>
            <Feather name="alert-circle" size={48} color={RED} />
            <Text style={styles.loadTitle}>{errorMsg}</Text>
          </View>
        )}

        {/* HTML video — rendered as soon as URL is available */}
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

  // ── Native player ─────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar hidden />

      {/* Native Video — always mounted once URL is available so onLoad fires during loading phase */}
      {videoUrl && Video && (
        <Video
          ref={videoRef}
          source={{ uri: videoUrl }}
          style={[StyleSheet.absoluteFill, { opacity: phase === "ready" ? 1 : 0 }]}
          resizeMode={ResizeMode?.CONTAIN ?? "contain"}
          shouldPlay={false}
          onLoad={onVideoLoad}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          useNativeControls={false}
        />
      )}

      {/* Loading overlay — shown until video is ready */}
      {(phase === "loading" || phase === "error") && (
        <View style={StyleSheet.absoluteFill}>
          {backdropPath ? (
            <Image source={{ uri: TMDB_IMG(backdropPath) ?? "" }} style={StyleSheet.absoluteFill} contentFit="cover" />
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

      {/* Controls overlay — shown after video is ready */}
      {phase === "ready" && (
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
                <View style={styles.seekTrack}>
                  <View style={[styles.seekFill, { width: `${progress * 100}%` }]} />
                  <View style={[styles.seekThumb, { left: `${progress * 100}%` }]} />
                </View>
                <Text style={styles.timeText}>{formatTime(durationMs)}</Text>
              </View>
            </Animated.View>
          )}
        </>
      )}
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
});
