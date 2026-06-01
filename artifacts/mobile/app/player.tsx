import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Dimensions,
  FlatList,
  GestureResponderEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { api, TMDB_IMG } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import { getSettings } from "@/lib/user-settings";
import { scheduleContinueWatchingReminder, cancelContinueWatchingReminder } from "@/lib/notifications";
import type { TmdbEpisode, TmdbSeason } from "@/lib/api";

let Video: any = null;
let ResizeMode: any = null;
try {
  const av = require("expo-av");
  Video = av.Video;
  ResizeMode = av.ResizeMode;
} catch {}

const { width: W, height: H } = Dimensions.get("window");

let WebView: any = null;
try {
  WebView = require("react-native-webview").WebView;
} catch {
  WebView = null;
}

let ScreenOrientation: any = null;
try {
  ScreenOrientation = require("expo-screen-orientation");
} catch {
  ScreenOrientation = null;
}

let NavBar: any = null;
try {
  NavBar = require("expo-navigation-bar");
} catch {
  NavBar = null;
}

const SCREEN = Dimensions.get("screen");
const AUTO_HIDE_MS = 4000;

// ─── M3U8 INTERCEPTOR ────────────────────────────────────────────────────────
// Injected into ALL frames (main + iframes) to capture m3u8 URLs as they load

const M3U8_INTERCEPTOR_JS = `
(function() {
  if (window.__m3u8HookInstalled) return;
  window.__m3u8HookInstalled = true;
  var _seen = {};

  function send(url) {
    if (!url || typeof url !== 'string') return;
    var base = url.split('?')[0].split('#')[0];
    if (!base.match(/\\.m3u8$/i)) return;
    if (_seen[base]) return;
    _seen[base] = 1;
    try {
      var ref = window.location.href || '';
      window.top.ReactNativeWebView && window.top.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'm3u8_found', url: url, referer: ref })
      );
    } catch(e) {
      try {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'm3u8_found', url: url, referer: window.location.href || '' })
        );
      } catch(e2) {}
    }
  }

  // Hook XHR
  var _xOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u) {
    if (u) send(String(u));
    return _xOpen.apply(this, arguments);
  };

  // Hook fetch
  var _fetch = window.fetch;
  if (_fetch) {
    window.fetch = function(r, i) {
      var u = typeof r === 'string' ? r : (r && typeof r === 'object' && r.url) ? r.url : '';
      if (u) send(u);
      return _fetch.apply(window, arguments);
    };
  }

  // Hook HTMLMediaElement.src
  try {
    var _srcD = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (_srcD && _srcD.set) {
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        configurable: true, enumerable: true,
        get: _srcD.get,
        set: function(v) { if (v) send(String(v)); return _srcD.set.call(this, v); }
      });
    }
  } catch(e) {}

  // Hook JWPlayer (may load after this script)
  function hookJw() {
    if (!window.jwplayer || window.jwplayer.__hooked) return false;
    var _jw = window.jwplayer;
    window.jwplayer = function() {
      var p = _jw.apply(this, arguments);
      if (p && p.setup) {
        var _setup = p.setup.bind(p);
        p.setup = function(cfg) {
          try { (cfg && cfg.sources || []).forEach(function(s) { if (s && s.file) send(s.file); }); } catch(e) {}
          return _setup(cfg);
        };
      }
      return p;
    };
    window.jwplayer.__hooked = true;
    try { window.jwplayer.key = _jw.key; } catch(e) {}
    return true;
  }
  if (!hookJw()) {
    var _ti = setInterval(function() { if (hookJw()) clearInterval(_ti); }, 150);
    setTimeout(function() { clearInterval(_ti); }, 20000);
  }
})(); true;
`;

// ─── PIP + AD BLOCKER ────────────────────────────────────────────────────────

const PIP_JS = `
(function(){
  function tryPip(el) {
    if (!el) return false;
    if (typeof el.requestPictureInPicture === 'function') { el.requestPictureInPicture().catch(function(){}); return true; }
    if (typeof el.webkitSetPresentationMode === 'function') { el.webkitSetPresentationMode('picture-in-picture'); return true; }
    return false;
  }
  var vid = document.querySelector('video');
  if (tryPip(vid)) return;
  var iframes = document.querySelectorAll('iframe');
  for (var i = 0; i < iframes.length; i++) {
    try { var v = iframes[i].contentDocument && iframes[i].contentDocument.querySelector('video'); if (tryPip(v)) return; } catch(e){}
  }
  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'pip_unavailable'}));
})(); true;
`;

const AD_BLOCKER_JS = `
(function() {
  window.open = function() { return null; };
  history.pushState = function() { return null; };
  function isAllowed(src) { return !src || src.includes('redeflix') || src.includes('embedtv') || src.includes('faz-o-eli') || src.includes('embedplayer'); }
  function removeAds() {
    try { document.querySelectorAll('iframe').forEach(function(el) { if (!isAllowed(el.src)) el.remove(); }); } catch(e) {}
    try { document.querySelectorAll('a[target="_blank"],a[onclick*="open"]').forEach(function(el) { el.removeAttribute('href'); el.removeAttribute('onclick'); el.removeAttribute('target'); el.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); }, true); }); } catch(e) {}
    var sels = ['[id*="google_ads"],[id*="aswift"],[class*="overlay-ad"]','[class*="ad-container"],[id*="ad-container"]','iframe[src*="googlesyndication"],iframe[src*="doubleclick"]','#preroll-ads,.preroll,[class*="preroll"]','[class*="popup"],[id*="popup"]'];
    sels.forEach(function(s) { try { document.querySelectorAll(s).forEach(function(el) { el.remove(); }); } catch(e) {} });
  }
  removeAds();
  setInterval(removeAds, 1000);
  try { new MutationObserver(removeAds).observe(document.body, { childList: true, subtree: true }); } catch(e) {}
})(); true;
`;

const FULLSCREEN_JS = `
(function() {
  function tryFs(el) {
    if (!el) return false;
    if (el.requestFullscreen) { el.requestFullscreen().catch(function(){}); return true; }
    if (el.webkitEnterFullscreen) { el.webkitEnterFullscreen(); return true; }
    if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); return true; }
    if (el.mozRequestFullScreen) { el.mozRequestFullScreen(); return true; }
    return false;
  }
  var vid = document.querySelector('video');
  if (tryFs(vid)) return;
  var frames = document.querySelectorAll('iframe');
  for (var i = 0; i < frames.length; i++) {
    try { var doc = frames[i].contentDocument; if (doc) { var v = doc.querySelector('video'); if (tryFs(v)) return; } } catch(e) {}
  }
  try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); } catch(e) {}
})(); true;
`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function fmtTime(ms: number): string {
  if (!ms || isNaN(ms)) return "0:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

// ─── NATIVE VIDEO PLAYER ─────────────────────────────────────────────────────

interface NativePlayerProps {
  m3u8Url: string;
  referer: string;
  title: string;
  type: "movie" | "tv" | "live";
  season: number;
  episode: number;
  totalSeasons: number;
  onBack: () => void;
  onPrevEp: () => void;
  onNextEp: () => void;
  onOpenPicker: () => void;
  onFallbackToWebView: () => void;
}

function NativeVideoPlayer({
  m3u8Url, referer, title, type, season, episode,
  onBack, onPrevEp, onNextEp, onOpenPicker, onFallbackToWebView,
}: NativePlayerProps) {
  const insets = useSafeAreaInsets();
  const videoRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekBarWidthRef = useRef(0);
  const isSeeking = useRef(false);
  const [seekPreview, setSeekPreview] = useState<number | null>(null);

  const showControls = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setControlsVisible(true);
    Animated.timing(controlsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    hideTimerRef.current = setTimeout(() => {
      Animated.timing(controlsOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
        setControlsVisible(false);
      });
    }, AUTO_HIDE_MS);
  }, [controlsOpacity]);

  useEffect(() => {
    showControls();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    showControls();
    if (isPlaying) {
      videoRef.current.pauseAsync().catch(() => {});
    } else {
      videoRef.current.playAsync().catch(() => {});
    }
  }, [isPlaying, showControls]);

  const skip = useCallback((ms: number) => {
    if (!videoRef.current) return;
    showControls();
    const next = Math.max(0, Math.min(positionMs + ms, durationMs));
    videoRef.current.setPositionAsync(next).catch(() => {});
  }, [positionMs, durationMs, showControls]);

  const seekToRatio = useCallback((ratio: number) => {
    if (!videoRef.current || !durationMs) return;
    const pos = Math.max(0, Math.min(ratio, 1)) * durationMs;
    videoRef.current.setPositionAsync(pos).catch(() => {});
    setPositionMs(pos);
  }, [durationMs]);

  const handleSeekBarPress = useCallback((e: GestureResponderEvent) => {
    if (!seekBarWidthRef.current) return;
    const x = e.nativeEvent.locationX;
    const ratio = x / seekBarWidthRef.current;
    seekToRatio(ratio);
    showControls();
  }, [seekToRatio, showControls]);

  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  if (loadError) {
    return (
      <View style={nat.container}>
        <StatusBar style="light" hidden />
        <View style={nat.errCenter}>
          <Feather name="alert-triangle" size={48} color="#e50914" />
          <Text style={nat.errTitle}>Erro ao carregar stream</Text>
          <Text style={nat.errSub}>O m3u8 não pôde ser reproduzido nativamente.</Text>
          <TouchableOpacity style={nat.errBtn} onPress={onFallbackToWebView}>
            <Feather name="monitor" size={16} color="#fff" />
            <Text style={nat.errBtnTxt}>Abrir no Player Web</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[nat.errBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", marginTop: 8 }]} onPress={onBack}>
            <Feather name="arrow-left" size={16} color="#fff" />
            <Text style={nat.errBtnTxt}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={nat.container}>
      <StatusBar style="light" hidden />

      {Video ? (
        <Video
          ref={videoRef}
          source={{ uri: m3u8Url, headers: referer ? { Referer: referer, Origin: new URL(referer).origin } : {} }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode?.CONTAIN ?? "contain"}
          shouldPlay
          useNativeControls={false}
          onPlaybackStatusUpdate={(status: any) => {
            if (!status.isLoaded) {
              if (status.error) setLoadError(true);
              return;
            }
            setIsPlaying(status.isPlaying ?? false);
            setPositionMs(status.positionMillis ?? 0);
            setDurationMs(status.durationMillis ?? 0);
            setBuffering(status.isBuffering ?? false);
          }}
          onError={() => setLoadError(true)}
        />
      ) : null}

      {/* Buffering spinner */}
      {buffering && (
        <View style={nat.bufferOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#e50914" />
        </View>
      )}

      {/* Tap area to show controls */}
      {!controlsVisible && (
        <Pressable style={StyleSheet.absoluteFillObject} onPress={showControls} />
      )}

      <Animated.View style={[nat.overlay, { opacity: controlsOpacity }]} pointerEvents={controlsVisible ? "box-none" : "none"}>

        {/* ── TOP BAR ── */}
        <View style={[nat.topBar, { paddingTop: (Platform.OS === "android" ? 8 : insets.top) + 4 }]}>
          <Pressable onPress={onBack} style={nat.iconBtn} hitSlop={12}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={nat.titleText} numberOfLines={1}>{title}</Text>
            {type === "tv" && (
              <Text style={nat.subTitle}>T{season} · Ep {episode}</Text>
            )}
          </View>
          {type === "tv" ? (
            <Pressable onPress={onOpenPicker} style={nat.iconBtn} hitSlop={12}>
              <Feather name="list" size={20} color="#fff" />
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* ── CENTER CONTROLS ── */}
        <View style={nat.centerRow} pointerEvents="box-none">
          <Pressable onPress={() => skip(-10000)} style={nat.skipBtn} hitSlop={16}>
            <View style={nat.skipCircle}>
              <Feather name="rotate-ccw" size={22} color="#fff" />
              <Text style={nat.skipLabel}>10</Text>
            </View>
          </Pressable>

          <Pressable onPress={togglePlay} style={nat.playBtn} hitSlop={10}>
            <View style={nat.playCircle}>
              {buffering ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name={isPlaying ? "pause" : "play"} size={32} color="#fff" />
              )}
            </View>
          </Pressable>

          <Pressable onPress={() => skip(10000)} style={nat.skipBtn} hitSlop={16}>
            <View style={nat.skipCircle}>
              <Feather name="rotate-cw" size={22} color="#fff" />
              <Text style={nat.skipLabel}>10</Text>
            </View>
          </Pressable>
        </View>

        {/* ── BOTTOM BAR ── */}
        <View style={[nat.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          {/* Episode navigation */}
          {type === "tv" && (
            <View style={nat.epRow}>
              <Pressable style={nat.epNavBtn} onPress={onPrevEp}>
                <Feather name="chevron-left" size={14} color="#fff" />
                <Text style={nat.epNavTxt}>Anterior</Text>
              </Pressable>
              <Pressable style={[nat.epNavBtn, { backgroundColor: "#e50914", borderColor: "#e50914" }]} onPress={onNextEp}>
                <Text style={nat.epNavTxt}>Próximo</Text>
                <Feather name="chevron-right" size={14} color="#fff" />
              </Pressable>
            </View>
          )}

          {/* Time row */}
          <View style={nat.timeRow}>
            <Text style={nat.timeText}>{fmtTime(positionMs)}</Text>
            <Text style={nat.timeText}>{fmtTime(durationMs)}</Text>
          </View>

          {/* Seek bar */}
          <View
            style={nat.seekBarTrack}
            onLayout={(e) => { seekBarWidthRef.current = e.nativeEvent.layout.width; }}
            onStartShouldSetResponder={() => true}
            onResponderGrant={handleSeekBarPress}
            onResponderMove={(e) => {
              if (!seekBarWidthRef.current) return;
              const x = e.nativeEvent.locationX;
              const ratio = Math.max(0, Math.min(x / seekBarWidthRef.current, 1));
              setSeekPreview(ratio);
            }}
            onResponderRelease={(e) => {
              if (!seekBarWidthRef.current) return;
              const x = e.nativeEvent.locationX;
              const ratio = Math.max(0, Math.min(x / seekBarWidthRef.current, 1));
              seekToRatio(ratio);
              setSeekPreview(null);
              showControls();
            }}
          >
            {/* Buffered track (background) */}
            <View style={[nat.seekBarFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: "rgba(255,255,255,0.35)" }]} />
            {/* Progress fill */}
            <View style={[nat.seekBarFill, { width: `${Math.round((seekPreview ?? progress) * 100)}%`, backgroundColor: "#e50914", position: "absolute", top: 0, left: 0, bottom: 0 }]} />
            {/* Thumb */}
            <View style={[nat.seekThumb, { left: `${Math.round((seekPreview ?? progress) * 100)}%` }]} />
          </View>
        </View>

      </Animated.View>
    </View>
  );
}

const nat = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  errCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  errTitle: { color: "#fff", fontSize: 20, fontWeight: "800", textAlign: "center" },
  errSub: { color: "rgba(255,255,255,0.5)", fontSize: 14, textAlign: "center", lineHeight: 20 },
  errBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#e50914", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  errBtnTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },
  bufferOverlay: { ...StyleSheet.absoluteFillObject as any, alignItems: "center", justifyContent: "center" },
  overlay: { ...StyleSheet.absoluteFillObject as any, justifyContent: "space-between" },
  topBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingBottom: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  titleText: { color: "#fff", fontSize: 15, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  subTitle: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 },
  centerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 48 },
  skipBtn: { alignItems: "center", justifyContent: "center" },
  skipCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)" },
  skipLabel: { color: "#fff", fontSize: 10, fontWeight: "700", position: "absolute", bottom: 9 },
  playBtn: { alignItems: "center", justifyContent: "center" },
  playCircle: { width: 74, height: 74, borderRadius: 37, backgroundColor: "rgba(229,9,20,0.85)", alignItems: "center", justifyContent: "center", shadowColor: "#e50914", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 12 },
  bottomBar: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: "rgba(0,0,0,0.6)" },
  epRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  epNavBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.1)" },
  epNavTxt: { color: "#fff", fontSize: 12, fontWeight: "600" },
  timeRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  timeText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "500", fontVariant: ["tabular-nums"] },
  seekBarTrack: { height: 28, justifyContent: "center", marginBottom: 4, position: "relative" },
  seekBarFill: { height: 4, borderRadius: 2, position: "absolute", top: 12, left: 0 },
  seekThumb: { position: "absolute", top: 8, width: 14, height: 14, borderRadius: 7, backgroundColor: "#e50914", marginLeft: -7, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.6, shadowRadius: 4, elevation: 4 },
});

// ─── MAIN PLAYER SCREEN ───────────────────────────────────────────────────────

export default function PlayerScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    type: string; id: string; season?: string; episode?: string;
    title?: string; posterPath?: string; backdropPath?: string;
    streamUrl?: string; isLive?: string; totalSeasons?: string;
  }>();

  const type = (params.type ?? "movie") as "movie" | "tv" | "live";
  const id = Number(params.id ?? 0);
  const season = Number(params.season ?? 1);
  const episode = Number(params.episode ?? 1);
  const title = params.title ?? "";
  const posterPath = params.posterPath ?? "";
  const backdropPath = params.backdropPath ?? "";
  const streamUrl = params.streamUrl ?? "";
  const isLive = params.isLive === "true";

  // ── WebView states ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [error, setError] = useState(false);
  const [progressSaved, setProgressSaved] = useState(false);
  const [pipEnabled, setPipEnabled] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const webviewRef = useRef<any>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Native player states ────────────────────────────────────────────────────
  const [m3u8Url, setM3u8Url] = useState<string | null>(null);
  const [m3u8Referer, setM3u8Referer] = useState("");
  const [useWebViewFallback, setUseWebViewFallback] = useState(false);

  // ── Episode picker states ───────────────────────────────────────────────────
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSeason, setPickerSeason] = useState(season);
  const [totalSeasons, setTotalSeasons] = useState(Number(params.totalSeasons ?? 1));
  const [pickerEpisodes, setPickerEpisodes] = useState<TmdbEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const navigatingToEpisodeRef = useRef(false);

  const playerUrl = isLive && streamUrl ? streamUrl : api.redeflix.url(type as "movie" | "tv", id, season, episode);

  useEffect(() => {
    if (Platform.OS === "web" || !ScreenOrientation) return;
    navigatingToEpisodeRef.current = false;
    try { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT); } catch {}
    if (Platform.OS === "android" && NavBar) {
      try { NavBar.setVisibilityAsync("hidden"); NavBar.setBehaviorAsync("overlay-swipe"); } catch {}
    }
    return () => {
      if (!navigatingToEpisodeRef.current) {
        try { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch {}
      }
      if (Platform.OS === "android" && NavBar) {
        try { NavBar.setVisibilityAsync("visible"); } catch {}
      }
    };
  }, []);

  const startHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      Animated.timing(controlsOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
      setControlsVisible(false);
    }, AUTO_HIDE_MS);
  }, [controlsOpacity]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    Animated.timing(controlsOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    startHideTimer();
  }, [controlsOpacity, startHideTimer]);

  useEffect(() => {
    if (Platform.OS !== "web" && !error) startHideTimer();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    if (Platform.OS === "android" && NavBar) {
      try {
        if (next) { NavBar.setVisibilityAsync("hidden"); NavBar.setBehaviorAsync("overlay-swipe"); }
        else { NavBar.setVisibilityAsync("visible"); }
      } catch {}
    }
    if (webviewRef.current) webviewRef.current.injectJavaScript(FULLSCREEN_JS);
  }, [isFullscreen]);

  const fetchEpisodes = useCallback(async (seasonNum: number) => {
    if (!id) return;
    setLoadingEpisodes(true);
    try {
      const data = await api.tmdb.tvSeason(id, seasonNum);
      setPickerEpisodes(data.episodes ?? []);
    } catch {
      setPickerEpisodes([]);
    } finally {
      setLoadingEpisodes(false);
    }
  }, [id]);

  const fetchTotalSeasons = useCallback(async () => {
    if (!id || totalSeasons > 1) return;
    try {
      const data = await api.tmdb.tv(id);
      if (data.number_of_seasons && data.number_of_seasons > 1) setTotalSeasons(data.number_of_seasons);
    } catch {}
  }, [id, totalSeasons]);

  const openPicker = useCallback(() => {
    showControls();
    setPickerSeason(season);
    fetchEpisodes(season);
    fetchTotalSeasons();
    setShowPicker(true);
  }, [season, fetchEpisodes, fetchTotalSeasons, showControls]);

  const saveProgress = async () => {
    if (!user?.id || !id || !isSupabaseConfigured || progressSaved) return;
    try {
      setProgressSaved(true);
      await db.progress.upsert({
        user_id: user.id, tmdb_id: id, type, title,
        poster_path: TMDB_IMG(posterPath || null, "w500") ?? posterPath,
        backdrop_path: TMDB_IMG(backdropPath || null, "w1280") ?? undefined,
        progress: 0.05,
        ...(type === "tv" ? { season, episode } : {}),
      });
    } catch (e) { setProgressSaved(false); }
  };

  useEffect(() => {
    if (Platform.OS === "web" && id) {
      const timer = setTimeout(() => saveProgress(), 3000);
      return () => clearTimeout(timer);
    }
  }, [id, type]);

  useEffect(() => { getSettings().then((s) => setPipEnabled(s.pip)); }, []);

  const triggerPiP = useCallback(() => {
    if (Platform.OS === "web") {
      const iframe = document.querySelector("iframe") as HTMLIFrameElement | null;
      try {
        const vid = (iframe?.contentDocument ?? document).querySelector("video") as HTMLVideoElement | null;
        if (vid && document.pictureInPictureEnabled) vid.requestPictureInPicture().catch(() => {});
      } catch {}
      return;
    }
    if (webviewRef.current) {
      webviewRef.current.injectJavaScript(PIP_JS);
      setPipActive(true);
      if (Platform.OS === "android") {
        try { ToastAndroid.show("PiP ativado", ToastAndroid.SHORT); } catch {}
      }
    }
  }, []);

  const handleWebViewMessage = useCallback((e: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "pip_unavailable") {
        setPipActive(false);
      } else if (msg.type === "m3u8_found" && msg.url && !useWebViewFallback) {
        setM3u8Url(msg.url);
        setM3u8Referer(msg.referer ?? "");
        saveProgress();
        if (Platform.OS === "android") {
          try { ToastAndroid.show("▶ Player nativo ativado", ToastAndroid.SHORT); } catch {}
        }
      }
    } catch {}
  }, [useWebViewFallback]);

  useEffect(() => {
    if (Platform.OS === "web" || !pipEnabled) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" && webviewRef.current && !pipActive) {
        webviewRef.current.injectJavaScript(PIP_JS);
        setPipActive(true);
      }
      if (state === "active") setPipActive(false);
    });
    return () => sub.remove();
  }, [pipEnabled, pipActive]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const mediaType = (type === "tv" ? "tv" : "movie") as "movie" | "tv";
    const tmdbId = id > 0 ? id : undefined;
    const posterUrl = posterPath ? TMDB_IMG(posterPath, "w500") ?? undefined : undefined;
    const sub = AppState.addEventListener("change", (appState) => {
      if (appState === "background") {
        scheduleContinueWatchingReminder(title || "Conteúdo", tmdbId, mediaType, posterUrl).catch(() => {});
      } else if (appState === "active") {
        cancelContinueWatchingReminder().catch(() => {});
      }
    });
    return () => { sub.remove(); cancelContinueWatchingReminder().catch(() => {}); };
  }, [title, posterPath, id, type]);

  const topPad = Platform.OS === "web" ? 0 : insets.top;

  const goToEpisode = (s: number, ep: number) => {
    setShowPicker(false);
    setM3u8Url(null);
    setM3u8Referer("");
    setUseWebViewFallback(false);
    navigatingToEpisodeRef.current = true;
    router.replace({
      pathname: "/player",
      params: { type, id: String(id), season: String(s), episode: String(ep), title, totalSeasons: String(totalSeasons) },
    });
  };

  // ── Guard: invalid ID ───────────────────────────────────────────────────────

  if (!id && !isLive) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.backBtn, { top: topPad + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
        </View>
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>ID inválido</Text>
      </View>
    );
  }

  // ── WEB PLATFORM ───────────────────────────────────────────────────────────

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <StatusBar style="light" />
        <View style={[styles.playerHeader, { paddingTop: topPad + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.playerTitle} numberOfLines={1}>
            {title || (type === "tv" ? `T${season}:E${episode}` : "Assistindo")}
          </Text>
          {type === "tv" ? (
            <Pressable onPress={openPicker} style={styles.iconBtn}>
              <Feather name="list" size={20} color="#fff" />
            </Pressable>
          ) : <View style={{ width: 40 }} />}
        </View>
        <View style={styles.iframeWrap}>
          <iframe
            src={playerUrl}
            style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#000" }}
            allowFullScreen allow="autoplay; fullscreen; encrypted-media" title={title}
          />
        </View>
        <EpisodePicker
          visible={showPicker} onClose={() => setShowPicker(false)}
          currentSeason={pickerSeason} currentEpisode={episode} totalSeasons={totalSeasons}
          episodes={pickerEpisodes} loading={loadingEpisodes}
          onSelectSeason={(s) => { setPickerSeason(s); fetchEpisodes(s); }}
          onSelectEpisode={goToEpisode}
        />
      </View>
    );
  }

  // ── NATIVE: SHOW NATIVE PLAYER WHEN M3U8 FOUND ────────────────────────────

  if (m3u8Url && !useWebViewFallback && Video) {
    return (
      <>
        <NativeVideoPlayer
          m3u8Url={m3u8Url}
          referer={m3u8Referer}
          title={title || (type === "tv" ? `T${season} · Ep ${episode}` : "Assistindo")}
          type={type as "movie" | "tv" | "live"}
          season={season}
          episode={episode}
          totalSeasons={totalSeasons}
          onBack={() => router.back()}
          onPrevEp={() => goToEpisode(season, Math.max(1, episode - 1))}
          onNextEp={() => goToEpisode(season, episode + 1)}
          onOpenPicker={openPicker}
          onFallbackToWebView={() => {
            setUseWebViewFallback(true);
            setM3u8Url(null);
          }}
        />
        <EpisodePicker
          visible={showPicker} onClose={() => setShowPicker(false)}
          currentSeason={pickerSeason} currentEpisode={episode} totalSeasons={totalSeasons}
          episodes={pickerEpisodes} loading={loadingEpisodes}
          onSelectSeason={(s) => { setPickerSeason(s); fetchEpisodes(s); }}
          onSelectEpisode={goToEpisode}
        />
      </>
    );
  }

  // ── NO WEBVIEW ─────────────────────────────────────────────────────────────

  if (!WebView) {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <StatusBar style="light" />
        <View style={[styles.backBtn, { top: topPad + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.centered}>
          <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>WebView indisponível</Text>
        </View>
      </View>
    );
  }

  // ── WEBVIEW PLAYER (loading / fallback) ────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <StatusBar style="light" hidden />

      <WebView
        ref={webviewRef}
        source={{ uri: playerUrl }}
        style={styles.webview}
        onLoadStart={() => { if (!initialLoadDone) { setLoading(true); setError(false); } }}
        onLoadEnd={() => { setLoading(false); setInitialLoadDone(true); saveProgress(); showControls(); }}
        onError={() => { if (!initialLoadDone) { setError(true); setLoading(false); } }}
        onMessage={handleWebViewMessage}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        allowsPictureInPictureMediaPlayback={Platform.OS === "ios"}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        startInLoadingState={false}
        scalesPageToFit={false}
        injectedJavaScriptBeforeContentLoaded={M3U8_INTERCEPTOR_JS}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
        injectedJavaScript={AD_BLOCKER_JS}
        injectedJavaScriptForMainFrameOnly={false}
        injectedJavaScriptBeforeContentLoadedIntoEachFrame={M3U8_INTERCEPTOR_JS}
        injectedJavaScriptBeforeContentLoadedIntoEachFrameForMainFrameOnly={false}
        onShouldStartLoadWithRequest={(req: any) => {
          const url: string = req.url || "";
          const isTopFrame: boolean = req.isTopFrame ?? true;
          const BLOCKED = [
            "googlesyndication","doubleclick.net","adservice.google",
            "pagead2.googlesyndication","adnxs.com","taboola.com",
            "popads.net","popcash.net","propellerads.com","adsterra.com",
            "mgid.com","revcontent.com","outbrain.com","exoclick.com",
            "trafficjunky.com","juicyads.com","hilltopads.net",
          ];
          if (BLOCKED.some((d) => url.includes(d))) return false;
          if (isLive && isTopFrame && url !== playerUrl && url !== "about:blank") {
            try {
              const origHost = new URL(playerUrl).hostname;
              const navHost = new URL(url).hostname;
              if (navHost !== origHost) return false;
            } catch {}
          }
          return true;
        }}
      />

      {loading && !error && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            {m3u8Url ? "Iniciando player nativo..." : "Carregando player..."}
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.loaderOverlay}>
          <Feather name="clock" size={48} color={colors.primary} />
          <Text style={[styles.unavailTitle, { color: colors.foreground }]}>Conteúdo Indisponível</Text>
          <Text style={[styles.unavailDesc, { color: colors.mutedForeground }]}>
            Este conteúdo ainda não está disponível no catálogo.
          </Text>
          <TouchableOpacity style={[styles.indicateBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Feather name="heart" size={16} color="#fff" />
            <Text style={styles.indicateBtnText}>Indicar este conteúdo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.backButton, { borderColor: colors.border }]} onPress={() => router.back()}>
            <Feather name="arrow-left" size={16} color={colors.foreground} />
            <Text style={[styles.backButtonText, { color: colors.foreground }]}>Voltar</Text>
          </TouchableOpacity>
        </View>
      )}

      {!error && (
        <>
          {!controlsVisible && (
            <Pressable style={StyleSheet.absoluteFillObject} onPress={showControls} />
          )}

          <Animated.View
            style={[styles.playerHeader, { paddingTop: topPad + 4, opacity: controlsOpacity }]}
            pointerEvents={controlsVisible ? "box-none" : "none"}
          >
            <Pressable onPress={() => router.back()} style={styles.iconBtn}>
              <Feather name="arrow-left" size={22} color="rgba(255,255,255,0.9)" />
            </Pressable>
            {title ? <Text style={styles.playerTitle} numberOfLines={1}>{title}</Text> : null}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {pipEnabled ? (
                <Pressable onPress={triggerPiP} style={[styles.iconBtn, pipActive && styles.iconBtnActive]}>
                  <Feather name="minimize-2" size={19} color={pipActive ? "#e50914" : "rgba(255,255,255,0.9)"} />
                </Pressable>
              ) : null}
            </View>
          </Animated.View>

          {type === "tv" && !isLive && (
            <Animated.View
              style={[styles.episodeBar, { backgroundColor: "rgba(0,0,0,0.9)", bottom: 0, position: "absolute", left: 0, right: 0, opacity: controlsOpacity }]}
              pointerEvents={controlsVisible ? "box-none" : "none"}
            >
              <Text style={[styles.episodeText, { color: "rgba(255,255,255,0.6)" }]}>T{season} · Ep {episode}</Text>
              <View style={styles.episodeActions}>
                <Pressable style={[styles.epBtn, { borderColor: "rgba(255,255,255,0.2)" }]} onPress={() => goToEpisode(season, Math.max(1, episode - 1))}>
                  <Feather name="chevron-left" size={14} color="#fff" />
                  <Text style={[styles.epBtnText, { color: "#fff" }]}>Anterior</Text>
                </Pressable>
                <Pressable style={[styles.epBtn, { borderColor: "rgba(255,255,255,0.2)" }]} onPress={openPicker}>
                  <Feather name="list" size={14} color="#fff" />
                  <Text style={[styles.epBtnText, { color: "#fff" }]}>Episódios</Text>
                </Pressable>
                <Pressable style={[styles.epBtn, { backgroundColor: "#e50914", borderColor: "#e50914" }]} onPress={() => goToEpisode(season, episode + 1)}>
                  <Text style={[styles.epBtnText, { color: "#fff" }]}>Próximo</Text>
                  <Feather name="chevron-right" size={14} color="#fff" />
                </Pressable>
              </View>
            </Animated.View>
          )}

          <Animated.View
            style={[styles.fullscreenBtn, { opacity: controlsOpacity }]}
            pointerEvents={controlsVisible ? "box-none" : "none"}
          >
            <Pressable onPress={toggleFullscreen} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <View style={[styles.fullscreenInner, isFullscreen && styles.fullscreenInnerActive]}>
                <Feather name={isFullscreen ? "minimize" : "maximize"} size={16} color="#fff" />
              </View>
            </Pressable>
          </Animated.View>
        </>
      )}

      <EpisodePicker
        visible={showPicker} onClose={() => setShowPicker(false)}
        currentSeason={pickerSeason} currentEpisode={episode} totalSeasons={totalSeasons}
        episodes={pickerEpisodes} loading={loadingEpisodes}
        onSelectSeason={(s) => { setPickerSeason(s); fetchEpisodes(s); }}
        onSelectEpisode={goToEpisode}
      />
    </View>
  );
}

// ─── EPISODE PICKER ───────────────────────────────────────────────────────────

interface EpisodePickerProps {
  visible: boolean; onClose: () => void;
  currentSeason: number; currentEpisode: number; totalSeasons: number;
  episodes: TmdbEpisode[]; loading: boolean;
  onSelectSeason: (s: number) => void;
  onSelectEpisode: (season: number, ep: number) => void;
}

function EpisodePicker({ visible, onClose, currentSeason, currentEpisode, totalSeasons, episodes, loading, onSelectSeason, onSelectEpisode }: EpisodePickerProps) {
  const seasons = Array.from({ length: Math.max(totalSeasons, 1) }, (_, i) => i + 1);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.pickerOverlay} onPress={onClose} />
      <View style={styles.pickerSheet}>
        <View style={styles.pickerHandle} />
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>Temporadas & Episódios</Text>
          <Pressable onPress={onClose} style={styles.pickerClose}>
            <Feather name="x" size={20} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonRow}>
          {seasons.map((s) => (
            <Pressable key={s} onPress={() => onSelectSeason(s)} style={[styles.seasonChip, currentSeason === s && styles.seasonChipActive]}>
              <Text style={[styles.seasonChipText, currentSeason === s && styles.seasonChipTextActive]}>T{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {loading ? (
          <View style={styles.pickerLoading}><ActivityIndicator color="#e50914" size="large" /></View>
        ) : episodes.length === 0 ? (
          <View style={styles.pickerLoading}><Text style={styles.pickerEmptyText}>Nenhum episódio encontrado</Text></View>
        ) : (
          <FlatList
            data={episodes}
            keyExtractor={(ep) => String(ep.episode_number)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
            renderItem={({ item: ep }) => {
              const isActive = ep.episode_number === currentEpisode && currentSeason === ep.season_number;
              return (
                <Pressable style={[styles.epRow, isActive && styles.epRowActive]} onPress={() => onSelectEpisode(currentSeason, ep.episode_number)}>
                  <View style={styles.epNumBox}><Text style={[styles.epNum, isActive && { color: "#e50914" }]}>{ep.episode_number}</Text></View>
                  {ep.still_path ? (
                    <Image source={{ uri: `https://image.tmdb.org/t/p/w185${ep.still_path}` }} style={styles.epThumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.epThumb, { backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }]}>
                      <Feather name="film" size={16} color="rgba(255,255,255,0.2)" />
                    </View>
                  )}
                  <View style={styles.epInfo}>
                    <Text style={styles.epName} numberOfLines={2}>{ep.name}</Text>
                    {ep.runtime ? <Text style={styles.epMeta}>{ep.runtime} min</Text> : null}
                    {ep.overview ? <Text style={styles.epDesc} numberOfLines={2}>{ep.overview}</Text> : null}
                  </View>
                  {isActive && <View style={styles.epPlayingBadge}><Text style={styles.epPlayingText}>▶</Text></View>}
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  webview: { flex: 1, backgroundColor: "#000" },
  playerHeader: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingBottom: 12, zIndex: 10, backgroundColor: "transparent",
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  iconBtnActive: { backgroundColor: "rgba(229,9,20,0.25)", borderWidth: 1, borderColor: "rgba(229,9,20,0.6)" },
  playerTitle: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "600", textAlign: "center", marginHorizontal: 8, textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  iframeWrap: { flex: 1, backgroundColor: "#000" },
  loaderOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "#000", gap: 16, paddingHorizontal: 32, zIndex: 5 },
  loadingText: { fontSize: 14, fontWeight: "500" },
  errorText: { fontSize: 15, fontWeight: "500", textAlign: "center" },
  unavailTitle: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  unavailDesc: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  indicateBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12, marginTop: 8 },
  indicateBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  backButton: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  backButtonText: { fontSize: 14, fontWeight: "600" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  backBtn: { position: "absolute", left: 12, zIndex: 10 },
  episodeBar: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, zIndex: 10 },
  episodeText: { fontSize: 13, fontWeight: "500" },
  episodeActions: { flexDirection: "row", gap: 8 },
  epBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  epBtnText: { fontSize: 13, fontWeight: "600" },
  fullscreenBtn: { position: "absolute", bottom: 116, right: 16, zIndex: 20 },
  fullscreenInner: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.35)" },
  fullscreenInnerActive: { backgroundColor: "rgba(229,9,20,0.3)", borderColor: "#e50914" },
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  pickerSheet: { backgroundColor: "#111", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: H * 0.75, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  pickerHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginTop: 10, marginBottom: 4 },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  pickerTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  pickerClose: { padding: 4 },
  seasonRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  seasonChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  seasonChipActive: { backgroundColor: "#e50914", borderColor: "#e50914" },
  seasonChipText: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600" },
  seasonChipTextActive: { color: "#fff" },
  pickerLoading: { height: 160, alignItems: "center", justifyContent: "center" },
  pickerEmptyText: { color: "rgba(255,255,255,0.4)", fontSize: 14 },
  epRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  epRowActive: { backgroundColor: "rgba(229,9,20,0.08)", borderRadius: 10, paddingHorizontal: 8, marginHorizontal: -8 },
  epNumBox: { width: 28, alignItems: "center" },
  epNum: { color: "rgba(255,255,255,0.4)", fontSize: 14, fontWeight: "700" },
  epThumb: { width: 80, height: 50, borderRadius: 8, overflow: "hidden" },
  epInfo: { flex: 1, gap: 2 },
  epName: { color: "#fff", fontSize: 13, fontWeight: "600", lineHeight: 17 },
  epMeta: { color: "rgba(255,255,255,0.35)", fontSize: 11 },
  epDesc: { color: "rgba(255,255,255,0.4)", fontSize: 11, lineHeight: 15 },
  epPlayingBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#e50914", alignItems: "center", justifyContent: "center" },
  epPlayingText: { color: "#fff", fontSize: 8, fontWeight: "800" },
});
