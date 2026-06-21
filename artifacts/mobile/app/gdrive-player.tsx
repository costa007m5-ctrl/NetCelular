import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import type { AVPlaybackStatus } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { parseEpisodeInfo, getStreamUrl } from "@/lib/gdrive-index";

const RED = "#e50914";
const HIDE_DELAY = 4000;

let ScreenOrientation: any = null;
try { ScreenOrientation = require("expo-screen-orientation"); } catch {}
let NavBar: any = null;
try { NavBar = require("expo-navigation-bar"); } catch {}

type PlaylistItem = { name: string; link: string };

function fmt(ms: number): string {
  if (!isFinite(ms) || ms < 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function cleanTitle(name: string): string {
  const ep = parseEpisodeInfo(name);
  // If we found a series title before the SxxExx code, use it
  if (ep.seriesTitle) return ep.seriesTitle;
  // Otherwise strip extension, quality tags, and brackets
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function episodeLabel(name: string, index: number): string {
  const ep = parseEpisodeInfo(name);
  const bare = name.replace(/\.[^.]+$/, "").trim();
  // Remove quality/audio tags from the raw name
  const clean = bare
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (ep.seriesTitle) {
    // "A Lenda de Tarzan · E19"
    const epNum = ep.episode !== undefined ? ` · E${String(ep.episode).padStart(2, "0")}` : "";
    return `${ep.seriesTitle}${epNum}`;
  }
  return clean || String(index + 1);
}

export default function GdrivePlayer() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    fileName: string;
    fileLink: string;
    drive: string;
    folderPath: string;
    playlist: string;
    currentIndex: string;
  }>();

  const playlist: PlaylistItem[] = (() => {
    try { return JSON.parse(params.playlist ?? "[]"); } catch { return []; }
  })();

  const [currentIndex, setCurrentIndex] = useState(
    Math.max(0, parseInt(params.currentIndex ?? "0", 10))
  );
  const currentItem = playlist[currentIndex] ?? {
    name: params.fileName ?? "",
    link: params.fileLink ?? "",
  };

  // Drive signed URLs (download.aspx?file=...&expiry=...&mac=...) support Range requests
  // natively and work directly from mobile — no server proxy needed (server IPs are blocked
  // by the Cloudflare Worker with error 1102).
  const streamUrl = getStreamUrl({
    ...currentItem,
    id: "", driveId: "", mimeType: "", modifiedTime: "", kind: "drive#file",
  } as any);

  const ep = parseEpisodeInfo(currentItem.name);
  const videoRef = useRef<Video>(null);

  // Playback state
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const isLoaded = (status as any)?.isLoaded === true;
  const isPlaying = isLoaded && ((status as any)?.isPlaying ?? false);
  const isBuffering = isLoaded && ((status as any)?.isBuffering ?? false);
  const hasError = status !== null && ((status as any)?.isLoaded === false && (status as any)?.error);
  const positionMs: number = isLoaded ? ((status as any).positionMillis ?? 0) : 0;
  const durationMs: number = isLoaded ? ((status as any).durationMillis ?? 0) : 0;
  const didFinish: boolean = isLoaded && ((status as any).didJustFinish ?? false);

  // Refs for PanResponder (avoids stale closure)
  const durationRef = useRef(0);
  const isLoadedRef = useRef(false);
  useEffect(() => { durationRef.current = durationMs; }, [durationMs]);
  useEffect(() => { isLoadedRef.current = isLoaded; }, [isLoaded]);

  // Controls visibility
  const [showControls, setShowControls] = useState(true);
  const controlsAnim = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seek bar
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekProg, setSeekProg] = useState(0);
  const barWidthRef = useRef(300);
  const progress = durationMs > 0
    ? (isSeeking ? seekProg : positionMs / durationMs)
    : 0;

  // Playlist modal
  const [showPlaylist, setShowPlaylist] = useState(false);

  const hasNext = currentIndex < playlist.length - 1;
  const hasPrev = currentIndex > 0;

  // ── Orientation lock ────────────────────────────────────────────
  useEffect(() => {
    const lock = async () => {
      try {
        if (ScreenOrientation)
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT);
        if (NavBar && Platform.OS === "android") {
          await NavBar.setVisibilityAsync("hidden");
          await NavBar.setBehaviorAsync("overlay-swipe");
        }
      } catch {}
    };
    lock();
    return () => {
      try {
        if (ScreenOrientation)
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
        if (NavBar && Platform.OS === "android")
          NavBar.setVisibilityAsync("visible").catch(() => {});
      } catch {}
    };
  }, []);

  // ── Controls auto-hide ───────────────────────────────────────────
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(controlsAnim, { toValue: 0, duration: 400, useNativeDriver: true })
        .start(() => setShowControls(false));
    }, HIDE_DELAY);
  }, [controlsAnim]);

  const revealControls = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setShowControls(true);
    Animated.timing(controlsAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    scheduleHide();
  }, [controlsAnim, scheduleHide]);

  const toggleControls = useCallback(() => {
    if (showControls) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      Animated.timing(controlsAnim, { toValue: 0, duration: 300, useNativeDriver: true })
        .start(() => setShowControls(false));
    } else {
      revealControls();
    }
  }, [showControls, controlsAnim, revealControls]);

  useEffect(() => {
    scheduleHide();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [scheduleHide]);

  // ── Playback controls ────────────────────────────────────────────
  const togglePlay = useCallback(async () => {
    if (!videoRef.current || !isLoaded) return;
    if (isPlaying) await videoRef.current.pauseAsync();
    else await videoRef.current.playAsync();
    revealControls();
  }, [isLoaded, isPlaying, revealControls]);

  const skip = useCallback(async (sec: number) => {
    if (!videoRef.current || !isLoaded || durationMs === 0) return;
    const next = Math.max(0, Math.min(positionMs + sec * 1000, durationMs));
    await videoRef.current.setPositionAsync(next);
    revealControls();
  }, [isLoaded, positionMs, durationMs, revealControls]);

  const goToEpisode = useCallback((index: number) => {
    setCurrentIndex(index);
    setStatus(null);
    setIsSeeking(false);
    setSeekProg(0);
    setShowPlaylist(false);
    revealControls();
  }, [revealControls]);

  const goNext = useCallback(() => { if (hasNext) goToEpisode(currentIndex + 1); }, [hasNext, currentIndex, goToEpisode]);
  const goPrev = useCallback(() => { if (hasPrev) goToEpisode(currentIndex - 1); }, [hasPrev, currentIndex, goToEpisode]);

  // ── Seek bar PanResponder ────────────────────────────────────────
  const seekPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setIsSeeking(true);
        const x = Math.max(0, Math.min(evt.nativeEvent.locationX, barWidthRef.current));
        setSeekProg(x / barWidthRef.current);
        if (hideTimer.current) clearTimeout(hideTimer.current);
      },
      onPanResponderMove: (evt) => {
        const x = Math.max(0, Math.min(evt.nativeEvent.locationX, barWidthRef.current));
        setSeekProg(x / barWidthRef.current);
      },
      onPanResponderRelease: (evt) => {
        const x = Math.max(0, Math.min(evt.nativeEvent.locationX, barWidthRef.current));
        const prog = x / barWidthRef.current;
        setSeekProg(prog);
        setIsSeeking(false);
        if (videoRef.current && isLoadedRef.current && durationRef.current > 0) {
          videoRef.current.setPositionAsync(prog * durationRef.current).catch(() => {});
        }
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setTimeout(() => {
          Animated.timing(hideTimer as any, { toValue: 0, duration: 400, useNativeDriver: true }).start();
        }, HIDE_DELAY);
      },
    })
  ).current;

  // ── Empty URL guard ───────────────────────────────────────────────
  if (!streamUrl) {
    return (
      <View style={s.container}>
        <StatusBar hidden />
        <View style={s.errorFull}>
          <Feather name="alert-triangle" size={44} color="#555" />
          <Text style={s.errTitle}>Arquivo sem link</Text>
          <Text style={s.errSub}>Este episódio não tem URL de reprodução disponível.</Text>
          <TouchableOpacity onPress={() => router.back()} style={s.errBtn}>
            <Feather name="arrow-left" size={15} color="#fff" />
            <Text style={s.errBtnTxt}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <StatusBar hidden />

      {/* Video — key forces remount on episode change */}
      <Video
        key={`ep-${currentIndex}-${streamUrl}`}
        ref={videoRef}
        source={{ uri: streamUrl }}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        style={StyleSheet.absoluteFill}
        onPlaybackStatusUpdate={setStatus}
        progressUpdateIntervalMillis={500}
        useNativeControls={false}
      />

      {/* Loading */}
      {(status === null || (isLoaded && isBuffering)) && !hasError && (
        <View style={s.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={RED} size="large" />
          <Text style={s.loadingTxt}>Carregando...</Text>
        </View>
      )}

      {/* Error */}
      {hasError && (
        <View style={s.errorFull}>
          <Feather name="wifi-off" size={44} color="#555" />
          <Text style={s.errTitle}>Não foi possível carregar</Text>
          <Text style={s.errSub}>Verifique sua conexão ou tente outro episódio.</Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
            <TouchableOpacity onPress={() => router.back()} style={s.errBtn}>
              <Feather name="arrow-left" size={14} color="#fff" />
              <Text style={s.errBtnTxt}>Voltar</Text>
            </TouchableOpacity>
            {hasNext && (
              <TouchableOpacity onPress={goNext} style={[s.errBtn, { backgroundColor: RED }]}>
                <Feather name="skip-forward" size={14} color="#fff" />
                <Text style={s.errBtnTxt}>Próximo</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Touch target to toggle controls */}
      <Pressable style={StyleSheet.absoluteFill} onPress={toggleControls} />

      {/* Controls overlay */}
      {showControls && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: controlsAnim }]} pointerEvents="box-none">

          {/* ── TOP gradient ── */}
          <LinearGradient colors={["rgba(0,0,0,0.85)", "rgba(0,0,0,0.3)", "transparent"]} style={s.topGrad}>
            <View style={s.topBar}>
              <TouchableOpacity onPress={() => router.back()} hitSlop={14} style={s.backBtn}>
                <Feather name="chevron-down" size={28} color="#fff" />
              </TouchableOpacity>

              <View style={{ flex: 1, marginHorizontal: 16 }}>
                <Text style={s.topTitle} numberOfLines={1}>{cleanTitle(currentItem.name)}</Text>
                {ep.season !== undefined && ep.episode !== undefined && (
                  <Text style={s.topMeta}>Temporada {ep.season} · Episódio {ep.episode}</Text>
                )}
              </View>

              {playlist.length > 1 && (
                <TouchableOpacity
                  onPress={() => { setShowPlaylist(true); revealControls(); }}
                  hitSlop={14}
                  style={s.epListBtn}
                >
                  <Feather name="list" size={20} color="#fff" />
                  <Text style={s.epListCount}>{currentIndex + 1}/{playlist.length}</Text>
                </TouchableOpacity>
              )}
            </View>
          </LinearGradient>

          {/* ── CENTER controls ── */}
          <View style={s.centerRow} pointerEvents="box-none">
            <TouchableOpacity onPress={goPrev} style={[s.sideSkip, !hasPrev && { opacity: 0.3 }]} disabled={!hasPrev} hitSlop={16}>
              <Feather name="skip-back" size={24} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => skip(-10)} style={s.skipBtn} hitSlop={16}>
              <Feather name="rotate-ccw" size={24} color="#fff" />
              <Text style={s.skipN}>10</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={togglePlay} style={s.playCircle} hitSlop={8}>
              <Feather name={isPlaying ? "pause" : "play"} size={34} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => skip(10)} style={s.skipBtn} hitSlop={16}>
              <Feather name="rotate-cw" size={24} color="#fff" />
              <Text style={s.skipN}>10</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={goNext} style={[s.sideSkip, !hasNext && { opacity: 0.3 }]} disabled={!hasNext} hitSlop={16}>
              <Feather name="skip-forward" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* ── BOTTOM gradient ── */}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.9)"]} style={s.botGrad}>

            {/* Next episode banner */}
            {didFinish && hasNext && (
              <TouchableOpacity onPress={goNext} style={s.nextBanner}>
                <Text style={s.nextBannerLabel}>A SEGUIR</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Feather name="play" size={13} color="#fff" />
                  <Text style={s.nextBannerEp}>
                    Ep.{(() => {
                      const info = parseEpisodeInfo(playlist[currentIndex + 1].name);
                      return info.episode !== undefined ? ` ${info.episode}` : ` ${currentIndex + 2}`;
                    })()}
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Seek bar row */}
            <View style={s.seekRow}>
              <Text style={s.timeTxt}>{fmt(isSeeking ? seekProg * durationMs : positionMs)}</Text>

              <View
                style={s.seekTrack}
                onLayout={e => { barWidthRef.current = e.nativeEvent.layout.width; }}
                {...seekPan.panHandlers}
              >
                <View style={s.seekBg} />
                <View style={[s.seekFill, { width: `${Math.min(100, progress * 100)}%` as any }]} />
                <View style={[s.seekThumb, { left: `${Math.min(99, progress * 100)}%` as any }]} />
              </View>

              <Text style={s.timeTxt}>{fmt(durationMs)}</Text>
            </View>
          </LinearGradient>

        </Animated.View>
      )}

      {/* Episodes modal */}
      <Modal visible={showPlaylist} transparent animationType="slide" onRequestClose={() => setShowPlaylist(false)}>
        <View style={s.modalBg}>
          <View style={s.modalSheet}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Episódios ({playlist.length})</Text>
              <TouchableOpacity onPress={() => setShowPlaylist(false)} hitSlop={12}>
                <Feather name="x" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={playlist}
              keyExtractor={(_, i) => String(i)}
              showsVerticalScrollIndicator={false}
              initialScrollIndex={Math.min(currentIndex, playlist.length - 1)}
              getItemLayout={(_, i) => ({ length: 58, offset: 58 * i, index: i })}
              renderItem={({ item: pi, index }) => {
                const info = parseEpisodeInfo(pi.name);
                const active = index === currentIndex;
                return (
                  <TouchableOpacity onPress={() => goToEpisode(index)} style={[s.epItem, active && s.epItemActive]}>
                    <View style={[s.epBadge, { backgroundColor: active ? RED : "#252525" }]}>
                      <Text style={s.epBadgeTxt}>
                        {info.episode !== undefined
                          ? `E${String(info.episode).padStart(2, "0")}`
                          : String(index + 1).padStart(2, "0")}
                      </Text>
                    </View>
                    <Text style={[s.epItemTxt, { color: active ? "#fff" : "#aaa" }]} numberOfLines={2}>
                      {episodeLabel(pi.name, index)}
                    </Text>
                    {active && <Feather name="volume-2" size={14} color={RED} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  // Loading
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  loadingTxt: { color: "#bbb", fontSize: 13 },

  // Error
  errorFull: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#000",
  },
  errTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginTop: 10 },
  errSub: { color: "#666", fontSize: 13, textAlign: "center", paddingHorizontal: 48, lineHeight: 19 },
  errBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#222", paddingHorizontal: 22, paddingVertical: 11, borderRadius: 24,
  },
  errBtnTxt: { color: "#fff", fontSize: 14, fontWeight: "600" },

  // Top bar
  topGrad: { paddingBottom: 36 },
  topBar: { flexDirection: "row", alignItems: "center", paddingTop: 14, paddingHorizontal: 16, paddingBottom: 6 },
  backBtn: { padding: 8 },
  topTitle: { color: "#fff", fontSize: 14, fontWeight: "700", lineHeight: 18 },
  topMeta: { color: RED, fontSize: 11, fontWeight: "600", marginTop: 2 },
  epListBtn: { alignItems: "center", padding: 8 },
  epListCount: { color: "#bbb", fontSize: 10, marginTop: 2 },

  // Center
  centerRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 36,
  },
  playCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  skipBtn: { alignItems: "center", justifyContent: "center", position: "relative" },
  skipN: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    position: "absolute",
    bottom: -3,
  },
  sideSkip: { padding: 10 },

  // Bottom bar
  botGrad: { paddingTop: 36, paddingHorizontal: 16, paddingBottom: 12 },

  nextBanner: {
    alignSelf: "flex-end",
    marginBottom: 10,
    backgroundColor: "rgba(20,20,20,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: "center",
    gap: 4,
  },
  nextBannerLabel: { color: "#888", fontSize: 9, fontWeight: "700", letterSpacing: 1.2 },
  nextBannerEp: { color: "#fff", fontSize: 15, fontWeight: "700" },

  seekRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  timeTxt: { color: "#ddd", fontSize: 11, fontWeight: "500", minWidth: 40, textAlign: "center" },
  seekTrack: { flex: 1, height: 32, justifyContent: "center", position: "relative" },
  seekBg: {
    position: "absolute", left: 0, right: 0,
    height: 3, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2,
  },
  seekFill: {
    position: "absolute", left: 0,
    height: 3, backgroundColor: RED, borderRadius: 2,
  },
  seekThumb: {
    position: "absolute",
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: RED, marginLeft: -7, top: 9,
  },

  // Episodes modal
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: "#0e0e0e",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: "72%",
    borderTopWidth: 1,
    borderColor: "#282828",
  },
  modalHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: "#1e1e1e",
    marginBottom: 6,
  },
  modalTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  epItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    height: 58, paddingHorizontal: 4,
    borderRadius: 8, borderWidth: 1, borderColor: "transparent",
  },
  epItemActive: { backgroundColor: RED + "18", borderColor: RED + "44" },
  epBadge: { width: 42, height: 36, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  epBadgeTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
  epItemTxt: { flex: 1, fontSize: 12, lineHeight: 16 },
});
