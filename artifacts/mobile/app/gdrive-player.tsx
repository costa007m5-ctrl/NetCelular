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
  Vibration,
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
const NEXT_EP_COUNTDOWN_S = 15;
const SKIP_INTRO_MAX_S = 90;
const SKIP_CREDITS_BEFORE_END_S = 180;
const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;
const SLEEP_PRESETS = [15, 30, 45, 60, 90] as const;
const SWIPE_SEEK_PER_SCREEN = 120;

let ScreenOrientation: any = null;
try { ScreenOrientation = require("expo-screen-orientation"); } catch {}
let NavBar: any = null;
try { NavBar = require("expo-navigation-bar"); } catch {}
let activateKeepAwake: (() => void) | null = null;
let deactivateKeepAwake: (() => void) | null = null;
try { const ka = require("expo-keep-awake"); activateKeepAwake = ka.activateKeepAwake; deactivateKeepAwake = ka.deactivateKeepAwake; } catch {}

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
  if (ep.seriesTitle) return ep.seriesTitle;
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
  const clean = bare
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (ep.seriesTitle) {
    const epNum = ep.episode !== undefined ? ` · E${String(ep.episode).padStart(2, "0")}` : "";
    return `${ep.seriesTitle}${epNum}`;
  }
  return clean || String(index + 1);
}

function SeekFlash({ side, anim }: { side: "left" | "right"; anim: Animated.Value }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.seekFlash,
        side === "left"
          ? { left: 0, borderTopRightRadius: 80, borderBottomRightRadius: 80 }
          : { right: 0, borderTopLeftRadius: 80, borderBottomLeftRadius: 80 },
        { opacity: anim },
      ]}
    >
      <Feather name={side === "left" ? "rotate-ccw" : "rotate-cw"} size={28} color="#fff" />
      <Text style={s.seekFlashText}>{side === "left" ? "-10s" : "+10s"}</Text>
    </Animated.View>
  );
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

  const DRIVE_DOWNLOAD_BASE = "https://animezey16082023.animezey16082023.workers.dev";
  const streamUrl = (() => {
    const fromLink = getStreamUrl({
      ...currentItem,
      id: "", driveId: "", mimeType: "", modifiedTime: "", kind: "drive#file",
    } as any);
    if (fromLink) return fromLink;
    const drive = params.drive;
    const folderPath = params.folderPath;
    if (drive && folderPath && currentItem.name) {
      const fullPath = `${folderPath}/${currentItem.name}`;
      const encoded = fullPath.split("/").map((seg) => encodeURIComponent(seg)).join("/");
      return `${DRIVE_DOWNLOAD_BASE}/${drive}:/${encoded}`;
    }
    return "";
  })();

  const ep = parseEpisodeInfo(currentItem.name);
  const videoRef = useRef<Video>(null);
  const W = useRef(require("react-native").Dimensions.get("window").width).current;

  // ── Playback state ────────────────────────────────────────────────────────
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const isLoaded = (status as any)?.isLoaded === true;
  const isPlaying = isLoaded && ((status as any)?.isPlaying ?? false);
  const isBuffering = isLoaded && ((status as any)?.isBuffering ?? false);
  const hasError = status !== null && ((status as any)?.isLoaded === false && (status as any)?.error);
  const positionMs: number = isLoaded ? ((status as any).positionMillis ?? 0) : 0;
  const durationMs: number = isLoaded ? ((status as any).durationMillis ?? 0) : 0;
  const bufferedMs: number = isLoaded ? ((status as any).playableDurationMillis ?? 0) : 0;
  const didFinish: boolean = isLoaded && ((status as any).didJustFinish ?? false);
  const positionSec = Math.floor(positionMs / 1000);
  const durationSec = Math.floor(durationMs / 1000);
  const remainingSec = durationSec - positionSec;

  const durationRef = useRef(0);
  const isLoadedRef = useRef(false);
  const positionMsRef = useRef(0);
  useEffect(() => { durationRef.current = durationMs; }, [durationMs]);
  useEffect(() => { isLoadedRef.current = isLoaded; }, [isLoaded]);
  useEffect(() => { positionMsRef.current = positionMs; }, [positionMs]);

  // ── Controls visibility ───────────────────────────────────────────────────
  const [showControls, setShowControls] = useState(true);
  const controlsAnim = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Seek bar state ────────────────────────────────────────────────────────
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekProg, setSeekProg] = useState(0);
  const barWidthRef = useRef(300);
  const progress = durationMs > 0 ? (isSeeking ? seekProg : positionMs / durationMs) : 0;
  const bufferedProgress = durationMs > 0 ? bufferedMs / durationMs : 0;
  const [showTimeRemaining, setShowTimeRemaining] = useState(false);

  // ── Advanced state ────────────────────────────────────────────────────────
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [showSpeedPanel, setShowSpeedPanel] = useState(false);
  const [sleepTimerEnd, setSleepTimerEnd] = useState<number | null>(null);
  const [sleepMinutesLeft, setSleepMinutesLeft] = useState<number | null>(null);
  const [showSleepPanel, setShowSleepPanel] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isSpeedBoost, setIsSpeedBoost] = useState(false);
  const lockAnim = useRef(new Animated.Value(1)).current;
  const sleepCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Next episode countdown ────────────────────────────────────────────────
  const [nextEpCountdown, setNextEpCountdown] = useState<number | null>(null);
  const nextEpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasNext = currentIndex < playlist.length - 1;
  const hasPrev = currentIndex > 0;

  // ── Skip intro / credits ──────────────────────────────────────────────────
  const showSkipIntro = isLoaded && positionSec >= 5 && positionSec <= SKIP_INTRO_MAX_S && playlist.length > 1;
  const showSkipCredits = isLoaded && durationSec > 0 && remainingSec > 0 && remainingSec <= SKIP_CREDITS_BEFORE_END_S && !showSkipIntro;

  // ── Seek flash animations ─────────────────────────────────────────────────
  const seekFlashLeft = useRef(new Animated.Value(0)).current;
  const seekFlashRight = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Swipe-to-seek ─────────────────────────────────────────────────────────
  const [isSwipeSeeking, setIsSwipeSeeking] = useState(false);
  const [swipeSeekDisplay, setSwipeSeekDisplay] = useState(0);
  const swipeGestureActive = useRef(false);
  const swipeDeltaSec = useRef(0);

  // ── Playlist modal ────────────────────────────────────────────────────────
  const [showPlaylist, setShowPlaylist] = useState(false);

  // ── Keep awake ────────────────────────────────────────────────────────────
  const keepAwakeActive = useRef(false);
  useEffect(() => {
    if (isPlaying) {
      try {
        const r = activateKeepAwake?.();
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
  }, [isPlaying]);

  // ── Orientation lock ──────────────────────────────────────────────────────
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
      if (keepAwakeActive.current) {
        try { deactivateKeepAwake?.(); } catch {}
        keepAwakeActive.current = false;
      }
    };
  }, []);

  // ── Controls auto-hide ────────────────────────────────────────────────────
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(controlsAnim, { toValue: 0, duration: 400, useNativeDriver: true })
        .start(() => setShowControls(false));
    }, HIDE_DELAY);
  }, [controlsAnim]);

  const revealControls = useCallback(() => {
    if (isLocked) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setShowControls(true);
    Animated.timing(controlsAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    scheduleHide();
  }, [controlsAnim, scheduleHide, isLocked]);

  const toggleControls = useCallback(() => {
    if (isLocked) return;
    if (showControls) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      Animated.timing(controlsAnim, { toValue: 0, duration: 300, useNativeDriver: true })
        .start(() => setShowControls(false));
    } else {
      revealControls();
    }
  }, [showControls, controlsAnim, revealControls, isLocked]);

  useEffect(() => {
    scheduleHide();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [scheduleHide]);

  // ── Playback controls ─────────────────────────────────────────────────────
  const togglePlay = useCallback(async () => {
    if (!videoRef.current || !isLoaded) return;
    if (isPlaying) await videoRef.current.pauseAsync();
    else await videoRef.current.playAsync();
    revealControls();
  }, [isLoaded, isPlaying, revealControls]);

  const skip = useCallback(async (sec: number) => {
    if (!videoRef.current || !isLoaded || durationMs === 0) return;
    const next = Math.max(0, Math.min(positionMsRef.current + sec * 1000, durationRef.current));
    await videoRef.current.setPositionAsync(next);
    revealControls();
  }, [isLoaded, durationMs, revealControls]);

  const haptic = useCallback((pattern: number | number[] = 40) => {
    try { Vibration.vibrate(pattern as any); } catch {}
  }, []);

  // ── Double-tap to seek ────────────────────────────────────────────────────
  const flashSeek = useCallback((side: "left" | "right") => {
    const anim = side === "left" ? seekFlashLeft : seekFlashRight;
    anim.setValue(1);
    Animated.timing(anim, { toValue: 0, duration: 500, useNativeDriver: true }).start();
  }, [seekFlashLeft, seekFlashRight]);

  const handleTap = useCallback((x: number) => {
    const now = Date.now();
    const isLeft = x < W / 2;
    if (lastTapRef.current && now - lastTapRef.current.time < 320 && Math.abs(x - lastTapRef.current.x) < 90) {
      if (tapTimerRef.current) { clearTimeout(tapTimerRef.current); tapTimerRef.current = null; }
      lastTapRef.current = null;
      skip(isLeft ? -10 : 10);
      haptic(30);
      flashSeek(isLeft ? "left" : "right");
    } else {
      lastTapRef.current = { time: now, x };
      tapTimerRef.current = setTimeout(() => {
        lastTapRef.current = null;
        toggleControls();
      }, 320);
    }
  }, [skip, haptic, flashSeek, toggleControls, W]);

  // ── Episode navigation ────────────────────────────────────────────────────
  const goToEpisode = useCallback((index: number) => {
    setCurrentIndex(index);
    setStatus(null);
    setIsSeeking(false);
    setSeekProg(0);
    setShowPlaylist(false);
    setNextEpCountdown(null);
    if (nextEpTimerRef.current) { clearInterval(nextEpTimerRef.current); nextEpTimerRef.current = null; }
    revealControls();
  }, [revealControls]);

  const goNext = useCallback(() => { if (hasNext) goToEpisode(currentIndex + 1); }, [hasNext, currentIndex, goToEpisode]);
  const goPrev = useCallback(() => { if (hasPrev) goToEpisode(currentIndex - 1); }, [hasPrev, currentIndex, goToEpisode]);

  // ── Next episode countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (!didFinish && durationMs > 0 && remainingSec > 0 && remainingSec <= NEXT_EP_COUNTDOWN_S && hasNext && isPlaying) {
      if (nextEpTimerRef.current) return;
      setNextEpCountdown(remainingSec);
      nextEpTimerRef.current = setInterval(() => {
        setNextEpCountdown((prev) => {
          if (prev === null || prev <= 1) {
            if (nextEpTimerRef.current) { clearInterval(nextEpTimerRef.current); nextEpTimerRef.current = null; }
            setTimeout(() => goNext(), 0);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (didFinish && hasNext && nextEpCountdown === null) {
      goNext();
    }
  }, [Math.floor(remainingSec), didFinish, hasNext, isPlaying]);

  useEffect(() => {
    return () => {
      if (nextEpTimerRef.current) { clearInterval(nextEpTimerRef.current); nextEpTimerRef.current = null; }
    };
  }, []);

  // ── Playback speed ────────────────────────────────────────────────────────
  useEffect(() => {
    if (videoRef.current && isLoaded) {
      const rate = isSpeedBoost ? 2.0 : playbackSpeed;
      videoRef.current.setRateAsync(rate, true).catch(() => {});
    }
  }, [playbackSpeed, isSpeedBoost, isLoaded]);

  // ── Sleep timer ───────────────────────────────────────────────────────────
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

  // ── Seek bar PanResponder ─────────────────────────────────────────────────
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
        setTimeout(scheduleHide, 500);
      },
    })
  ).current;

  // ── Swipe-to-seek PanResponder ────────────────────────────────────────────
  const bodySwipePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        !swipeGestureActive.current
          ? Math.abs(gs.dx) > 14 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5
          : true,
      onMoveShouldSetPanResponderCapture: (_, gs) =>
        !swipeGestureActive.current
          ? Math.abs(gs.dx) > 14 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5
          : false,
      onPanResponderGrant: () => {
        swipeGestureActive.current = true;
      },
      onPanResponderMove: (_, gs) => {
        const deltaSec = Math.round((gs.dx / 320) * SWIPE_SEEK_PER_SCREEN);
        swipeDeltaSec.current = deltaSec;
        setSwipeSeekDisplay(deltaSec);
        setIsSwipeSeeking(true);
      },
      onPanResponderRelease: () => {
        if (swipeGestureActive.current && swipeDeltaSec.current !== 0) {
          skip(swipeDeltaSec.current);
          haptic(30);
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

  // ── Empty URL guard ───────────────────────────────────────────────────────
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

  const displayPositionMs = isSeeking ? seekProg * durationMs : positionMs;
  const swipeTargetMs = Math.max(0, Math.min(durationMs, positionMs + swipeSeekDisplay * 1000));

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

      {/* Loading / Buffering */}
      {(status === null || (isLoaded && isBuffering)) && !hasError && (
        <View style={s.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={RED} size="large" />
          <Text style={s.loadingTxt}>
            {status === null ? "Carregando..." : "Carregando buffer..."}
          </Text>
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

      {/* Swipe-to-seek overlay */}
      <View style={StyleSheet.absoluteFill} {...bodySwipePan.panHandlers} pointerEvents="box-none" />

      {/* Tap to toggle controls */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={(e) => handleTap(e.nativeEvent.pageX)}
        onLongPress={() => { setIsSpeedBoost(true); haptic([0, 20]); }}
        onPressOut={() => { if (isSpeedBoost) setIsSpeedBoost(false); }}
        delayLongPress={600}
      />

      {/* ── Lock screen ────────────────────────────────────────────────────── */}
      {isLocked && (
        <Pressable style={[StyleSheet.absoluteFill, s.lockOverlay]} onPress={() => {
          Animated.sequence([
            Animated.timing(lockAnim, { toValue: 1.3, duration: 100, useNativeDriver: true }),
            Animated.timing(lockAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
          ]).start();
        }}>
          <Pressable style={s.lockUnlockBtn} onPress={() => { haptic([0, 40, 60, 40]); setIsLocked(false); }}>
            <Animated.View style={{ transform: [{ scale: lockAnim }] }}>
              <Feather name="lock" size={24} color="#fff" />
            </Animated.View>
            <Text style={s.lockUnlockText}>Toque para desbloquear</Text>
          </Pressable>
        </Pressable>
      )}

      {/* Seek flash animations */}
      <SeekFlash side="left" anim={seekFlashLeft} />
      <SeekFlash side="right" anim={seekFlashRight} />

      {/* Speed boost badge */}
      {isSpeedBoost && (
        <View style={s.speedBoostBadge} pointerEvents="none">
          <Feather name="fast-forward" size={16} color="#fff" />
          <Text style={s.speedBoostText}>2×</Text>
        </View>
      )}

      {/* Swipe-to-seek indicator */}
      {isSwipeSeeking && (
        <View style={s.swipeSeekIndicator} pointerEvents="none">
          <Feather
            name={swipeSeekDisplay >= 0 ? "fast-forward" : "rewind"}
            size={26} color="#fff"
          />
          <Text style={s.swipeSeekDelta}>
            {swipeSeekDisplay > 0 ? "+" : ""}{swipeSeekDisplay}s
          </Text>
          <Text style={s.swipeSeekTarget}>{fmt(swipeTargetMs)}</Text>
        </View>
      )}

      {/* Skip intro button */}
      {showSkipIntro && !isLocked && (
        <Pressable
          style={s.skipIntroBtnPos}
          onPress={() => {
            skip(SKIP_INTRO_MAX_S - positionSec + 5);
            haptic([0, 30, 50, 30]);
          }}
        >
          <View style={s.skipIntroBtn}>
            <Feather name="skip-forward" size={14} color="#fff" />
            <Text style={s.skipIntroBtnText}>Pular Abertura</Text>
          </View>
        </Pressable>
      )}

      {/* Skip credits button */}
      {showSkipCredits && !isLocked && !showSkipIntro && (
        <Pressable style={s.skipCreditsBtnPos} onPress={goNext}>
          <View style={s.skipIntroBtn}>
            <Feather name="skip-forward" size={14} color="#fff" />
            <Text style={s.skipIntroBtnText}>Próximo Episódio</Text>
          </View>
        </Pressable>
      )}

      {/* Next episode countdown */}
      {nextEpCountdown !== null && !isSwipeSeeking && (
        <View style={s.nextEpPanel} pointerEvents="box-none">
          <View style={s.nextEpContent}>
            <Text style={s.nextEpLabel}>A SEGUIR</Text>
            <View style={s.nextEpCountdownCircle}>
              <Text style={s.nextEpCountdownNum}>{nextEpCountdown}</Text>
              <Text style={s.nextEpCountdownUnit}>seg</Text>
            </View>
            {playlist[currentIndex + 1] && (
              <Text style={s.nextEpName} numberOfLines={2}>
                {episodeLabel(playlist[currentIndex + 1].name, currentIndex + 1)}
              </Text>
            )}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable style={s.nextEpSkipBtn} onPress={goNext}>
                <Feather name="play" size={14} color="#fff" />
                <Text style={s.nextEpSkipTxt}>Próximo</Text>
              </Pressable>
              <Pressable style={s.nextEpCancelBtn} onPress={() => {
                setNextEpCountdown(null);
                if (nextEpTimerRef.current) { clearInterval(nextEpTimerRef.current); nextEpTimerRef.current = null; }
              }}>
                <Text style={s.nextEpCancelTxt}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Sleep badge */}
      {sleepTimerEnd && sleepMinutesLeft != null && (
        <Pressable style={s.sleepBadge} onPress={() => setShowSleepPanel(true)}>
          <Feather name="moon" size={11} color="#aaa" />
          <Text style={s.sleepBadgeText}>{sleepMinutesLeft > 0 ? `${sleepMinutesLeft}min` : "Pausando..."}</Text>
        </Pressable>
      )}

      {/* Controls overlay */}
      {!isLocked && showControls && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: controlsAnim }]} pointerEvents="box-none">

          {/* ── TOP gradient ── */}
          <LinearGradient colors={["rgba(0,0,0,0.85)", "rgba(0,0,0,0.3)", "transparent"]} style={s.topGrad}>
            <View style={s.topBar}>
              <TouchableOpacity onPress={() => router.back()} hitSlop={14} style={s.backBtn}>
                <Feather name="chevron-down" size={28} color="#fff" />
              </TouchableOpacity>

              <View style={{ flex: 1, marginHorizontal: 12 }}>
                <Text style={s.topTitle} numberOfLines={1}>{cleanTitle(currentItem.name)}</Text>
                {ep.season !== undefined && ep.episode !== undefined && (
                  <Text style={s.topMeta}>Temporada {ep.season} · Episódio {ep.episode}</Text>
                )}
              </View>

              {/* Speed badge */}
              {playbackSpeed !== 1.0 && (
                <View style={s.speedBadge}>
                  <Text style={s.speedBadgeText}>{playbackSpeed}×</Text>
                </View>
              )}

              {/* Top action buttons */}
              <TouchableOpacity onPress={() => { setShowSpeedPanel(true); revealControls(); }} hitSlop={10} style={s.topIconBtn}>
                <Feather name="zap" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowSleepPanel(true); revealControls(); }} hitSlop={10} style={s.topIconBtn}>
                <Feather name="moon" size={18} color={sleepTimerEnd ? "#f59e0b" : "#fff"} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { haptic(30); setIsLocked(true); }} hitSlop={10} style={s.topIconBtn}>
                <Feather name="unlock" size={18} color="#fff" />
              </TouchableOpacity>

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
              <Feather name="rotate-ccw" size={26} color="#fff" />
              <Text style={s.skipN}>10</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={togglePlay} style={s.playCircle} hitSlop={8}>
              {isBuffering && isLoaded ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Feather name={isPlaying ? "pause" : "play"} size={36} color="#fff" />
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => skip(10)} style={s.skipBtn} hitSlop={16}>
              <Feather name="rotate-cw" size={26} color="#fff" />
              <Text style={s.skipN}>10</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={goNext} style={[s.sideSkip, !hasNext && { opacity: 0.3 }]} disabled={!hasNext} hitSlop={16}>
              <Feather name="skip-forward" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* ── BOTTOM gradient ── */}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.9)"]} style={s.botGrad}>

            {/* Seek bar row */}
            <View style={s.seekRow}>
              <Pressable onPress={() => setShowTimeRemaining(!showTimeRemaining)}>
                <Text style={s.timeTxt}>
                  {showTimeRemaining
                    ? `-${fmt(Math.max(0, durationMs - displayPositionMs))}`
                    : fmt(displayPositionMs)}
                </Text>
              </Pressable>

              <View
                style={s.seekTrack}
                onLayout={e => { barWidthRef.current = e.nativeEvent.layout.width; }}
                {...seekPan.panHandlers}
              >
                <View style={s.seekBg} />
                <View style={[s.seekBuffered, { width: `${Math.min(100, bufferedProgress * 100)}%` as any }]} />
                <View style={[s.seekFill, { width: `${Math.min(100, progress * 100)}%` as any }]} />
                <View style={[
                  s.seekThumb,
                  { left: `${Math.min(99, progress * 100)}%` as any },
                  isSeeking && { width: 18, height: 18, marginLeft: -9, top: 7 },
                ]} />
                {isSeeking && (
                  <View style={[s.seekTooltip, { left: Math.max(20, Math.min(barWidthRef.current - 36, progress * barWidthRef.current - 20)) }]}>
                    <Text style={s.seekTooltipText}>{fmt(displayPositionMs)}</Text>
                  </View>
                )}
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

      {/* Speed panel */}
      <Modal visible={showSpeedPanel} transparent animationType="fade" onRequestClose={() => setShowSpeedPanel(false)}>
        <Pressable style={s.panelBg} onPress={() => setShowSpeedPanel(false)}>
          <View style={s.panelSheet}>
            <Text style={s.panelTitle}>Velocidade de reprodução</Text>
            {SPEEDS.map((sp) => (
              <Pressable
                key={sp}
                style={[s.panelOption, playbackSpeed === sp && s.panelOptionActive]}
                onPress={() => { setPlaybackSpeed(sp); setShowSpeedPanel(false); haptic(20); revealControls(); }}
              >
                <Text style={[s.panelOptionText, playbackSpeed === sp && s.panelOptionTextActive]}>
                  {sp === 1.0 ? "Normal" : `${sp}×`}
                </Text>
                {playbackSpeed === sp && <Feather name="check" size={16} color={RED} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Sleep timer panel */}
      <Modal visible={showSleepPanel} transparent animationType="fade" onRequestClose={() => setShowSleepPanel(false)}>
        <Pressable style={s.panelBg} onPress={() => setShowSleepPanel(false)}>
          <View style={s.panelSheet}>
            <Text style={s.panelTitle}>Timer de sono</Text>
            {sleepTimerEnd && (
              <Pressable
                style={[s.panelOption, { borderColor: "#ef4444" }]}
                onPress={() => { setSleepTimerEnd(null); setShowSleepPanel(false); haptic(20); }}
              >
                <Text style={[s.panelOptionText, { color: "#ef4444" }]}>Cancelar timer</Text>
                <Feather name="x" size={16} color="#ef4444" />
              </Pressable>
            )}
            {SLEEP_PRESETS.map((min) => (
              <Pressable
                key={min}
                style={s.panelOption}
                onPress={() => {
                  setSleepTimerEnd(Date.now() + min * 60000);
                  setShowSleepPanel(false);
                  haptic(20);
                  revealControls();
                }}
              >
                <Text style={s.panelOptionText}>{min} minutos</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  loadingTxt: { color: "#bbb", fontSize: 13 },

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

  lockOverlay: {
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  lockUnlockBtn: { alignItems: "center", gap: 10 },
  lockUnlockText: { color: "rgba(255,255,255,0.65)", fontSize: 12 },

  seekFlash: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "40%",
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  seekFlashText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  speedBoostBadge: {
    position: "absolute",
    top: "50%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    marginTop: -22,
  },
  speedBoostText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  swipeSeekIndicator: {
    position: "absolute",
    alignSelf: "center",
    top: "38%",
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    gap: 4,
  },
  swipeSeekDelta: { color: "#fff", fontSize: 22, fontWeight: "800" },
  swipeSeekTarget: { color: "#bbb", fontSize: 13 },

  skipIntroBtnPos: {
    position: "absolute",
    bottom: 80,
    right: 20,
  },
  skipCreditsBtnPos: {
    position: "absolute",
    bottom: 80,
    right: 20,
  },
  skipIntroBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.7)",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  skipIntroBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  nextEpPanel: {
    position: "absolute",
    right: 20,
    bottom: 90,
  },
  nextEpContent: {
    backgroundColor: "rgba(10,10,10,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    gap: 6,
    minWidth: 160,
  },
  nextEpLabel: { color: "#888", fontSize: 10, fontWeight: "700", letterSpacing: 1.2 },
  nextEpCountdownCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: RED,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 4,
  },
  nextEpCountdownNum: { color: "#fff", fontSize: 22, fontWeight: "800" },
  nextEpCountdownUnit: { color: "#aaa", fontSize: 9, fontWeight: "600" },
  nextEpName: { color: "#ddd", fontSize: 12, textAlign: "center", maxWidth: 140 },
  nextEpSkipBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: RED,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  nextEpSkipTxt: { color: "#fff", fontSize: 12, fontWeight: "700" },
  nextEpCancelBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  nextEpCancelTxt: { color: "#666", fontSize: 12 },

  sleepBadge: {
    position: "absolute",
    top: 14,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  sleepBadgeText: { color: "#aaa", fontSize: 11 },

  speedBadge: {
    backgroundColor: "rgba(229,9,20,0.25)",
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 4,
  },
  speedBadgeText: { color: RED, fontSize: 11, fontWeight: "700" },

  topGrad: { paddingBottom: 36 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  backBtn: { padding: 8 },
  topTitle: { color: "#fff", fontSize: 13, fontWeight: "700", lineHeight: 18 },
  topMeta: { color: RED, fontSize: 11, fontWeight: "600", marginTop: 2 },
  topIconBtn: { padding: 8, marginLeft: 2 },
  epListBtn: { alignItems: "center", padding: 8, marginLeft: 2 },
  epListCount: { color: "#bbb", fontSize: 10, marginTop: 2 },

  centerRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
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
    bottom: -4,
  },
  sideSkip: { padding: 10 },

  botGrad: { paddingTop: 36, paddingHorizontal: 16, paddingBottom: 14 },

  seekRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  timeTxt: { color: "#ddd", fontSize: 11, fontWeight: "500", minWidth: 44, textAlign: "center" },
  seekTrack: { flex: 1, height: 36, justifyContent: "center", position: "relative" },
  seekBg: {
    position: "absolute", left: 0, right: 0,
    height: 3, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2,
  },
  seekBuffered: {
    position: "absolute", left: 0,
    height: 3, backgroundColor: "rgba(255,255,255,0.35)", borderRadius: 2,
  },
  seekFill: {
    position: "absolute", left: 0,
    height: 3, backgroundColor: RED, borderRadius: 2,
  },
  seekThumb: {
    position: "absolute",
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: RED, marginLeft: -7, top: 11,
  },
  seekTooltip: {
    position: "absolute",
    bottom: 26,
    backgroundColor: "rgba(0,0,0,0.85)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  seekTooltipText: { color: "#fff", fontSize: 11, fontWeight: "600" },

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

  panelBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  panelSheet: {
    backgroundColor: "#111",
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 8,
    width: 260,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    gap: 2,
  },
  panelTitle: { color: "#888", fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textAlign: "center", paddingVertical: 10 },
  panelOption: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  panelOptionActive: { backgroundColor: RED + "18", borderColor: RED + "44" },
  panelOptionText: { color: "#ccc", fontSize: 14 },
  panelOptionTextActive: { color: "#fff", fontWeight: "700" },
});
