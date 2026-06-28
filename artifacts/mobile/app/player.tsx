import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Dimensions,
  FlatList,
  GestureResponderEvent,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { api, TMDB_IMG, getApiBase } from "@/lib/api";
import { CastModal } from "@/components/CastModal";
import { useAuth } from "@/lib/auth-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import { checkAndStartSession, heartbeatSession, endSession, getWhatsAppLink } from "@/lib/session-manager";
import { getSettings } from "@/lib/user-settings";
import { scheduleContinueWatchingReminder, cancelContinueWatchingReminder } from "@/lib/notifications";
import { saveLocalProgress } from "@/hooks/useWatchProgress";
import type { TmdbEpisode, TmdbSeason } from "@/lib/api";
import StingOverlay from "@/components/StingOverlay";

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
  var _isTop = (window === window.top);

  // Top-frame bridge: forward postMessage from child iframes to ReactNativeWebView
  if (_isTop) {
    window.addEventListener('message', function(e) {
      try {
        var d = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
        if (d && d.includes('m3u8_found')) {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(d);
        }
      } catch(x) {}
    });
  }

  function rnPost(payload) {
    // Try direct ReactNativeWebView first (works in main frame and in-frame injections)
    try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(payload); } catch(e) {}
    // Fallback for iframes: bubble up via postMessage to top frame bridge above
    if (!_isTop) {
      try { window.parent.postMessage(payload, '*'); } catch(e) {}
      try { window.top.postMessage(payload, '*'); } catch(e) {}
    }
  }

  function send(url, ref) {
    if (!url || typeof url !== 'string') return;
    if (!url.includes('.m3u8')) return;
    var base = url.split('?')[0].split('#')[0];
    if (_seen[base]) return;
    _seen[base] = 1;
    rnPost(JSON.stringify({ type: 'm3u8_found', url: url, referer: ref || window.location.href || '' }));
  }

  function tryExtractM3u8(text, ref) {
    if (!text || !text.includes('.m3u8')) return;
    try {
      var data = JSON.parse(text);
      if (!data) return;
      var srcs = data.sources || data.source || data.data || [];
      if (!Array.isArray(srcs)) srcs = [srcs];
      srcs.forEach(function(s) {
        if (s && s.file) send(s.file, ref);
        if (s && s.src) send(s.src, ref);
        if (s && s.url) send(s.url, ref);
        if (typeof s === 'string') send(s, ref);
      });
      if (data.file) send(data.file, ref);
      if (data.src) send(data.src, ref);
      if (data.url) send(data.url, ref);
      if (data.stream) send(data.stream, ref);
      if (data.hls) send(data.hls, ref);
    } catch(e) {
      var matches = text.match(/https?:[^"' ]+\\.m3u8[^"' ]*/g);
      if (matches) matches.forEach(function(m) { send(m, ref); });
    }
  }

  // Hook XHR — intercept both URL and RESPONSE body
  var _xOpen = XMLHttpRequest.prototype.open;
  var _xSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u) {
    this.__rnUrl = u ? String(u) : '';
    if (this.__rnUrl) send(this.__rnUrl);
    return _xOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    var self = this;
    var origLoad = self.onload;
    self.onload = function(e) {
      try { tryExtractM3u8(self.responseText, self.__rnUrl); } catch(x) {}
      if (origLoad) origLoad.apply(self, arguments);
    };
    self.addEventListener('load', function() {
      try { tryExtractM3u8(self.responseText, self.__rnUrl); } catch(x) {}
    });
    return _xSend.apply(self, arguments);
  };

  // Hook fetch — intercept URL and response body
  var _fetch = window.fetch;
  if (_fetch) {
    window.fetch = function(r, opts) {
      var u = typeof r === 'string' ? r : (r && r.url) ? r.url : '';
      if (u) send(u);
      var p = _fetch.apply(window, arguments);
      if (u) {
        p.then(function(resp) {
          try { resp.clone().text().then(function(t) { tryExtractM3u8(t, u); }).catch(function(){}); } catch(x) {}
        }).catch(function(){});
      }
      return p;
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

  // Hook HTMLSourceElement.src
  try {
    var _ssrcD = Object.getOwnPropertyDescriptor(HTMLSourceElement.prototype, 'src');
    if (_ssrcD && _ssrcD.set) {
      Object.defineProperty(HTMLSourceElement.prototype, 'src', {
        configurable: true, enumerable: true,
        get: _ssrcD.get,
        set: function(v) { if (v) send(String(v)); return _ssrcD.set.call(this, v); }
      });
    }
  } catch(e) {}

  // Hook HLS.js
  function hookHls() {
    if (!window.Hls || window.Hls.__rnHooked) return false;
    window.Hls.__rnHooked = true;
    var _load = window.Hls.prototype.loadSource;
    window.Hls.prototype.loadSource = function(src) { send(src); return _load.apply(this, arguments); };
    return true;
  }

  // Hook JWPlayer
  function hookJw() {
    if (!window.jwplayer || window.jwplayer.__rnHooked) return false;
    window.jwplayer.__rnHooked = true;
    var _jw = window.jwplayer;
    window.jwplayer = function() {
      var p = _jw.apply(this, arguments);
      if (p && p.setup) {
        var _setup = p.setup.bind(p);
        p.setup = function(cfg) {
          try { ((cfg && cfg.sources) || []).forEach(function(s) { if (s && s.file) send(s.file); }); } catch(x) {}
          return _setup(cfg);
        };
      }
      return p;
    };
    try { window.jwplayer.key = _jw.key; } catch(x) {}
    return true;
  }

  if (!hookHls() || !hookJw()) {
    var _t = setInterval(function() {
      if (!window.Hls || !window.Hls.__rnHooked) hookHls();
      if (!window.jwplayer || !window.jwplayer.__rnHooked) hookJw();
    }, 150);
    setTimeout(function() { clearInterval(_t); }, 30000);
  }

  // Scan video elements periodically (fallback for preloaded videos)
  setInterval(function() {
    try {
      document.querySelectorAll('video[src],video>source').forEach(function(el) {
        var s = el.src || el.getAttribute('src');
        if (s) send(s);
      });
    } catch(e) {}
  }, 800);
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
  var AD_DOMAINS = ['parembed.embedplayer.site','parembed','adplayer.pro','googlesyndication','doubleclick.net','adservice','googleadservices','googletagmanager','googletagservices','google-analytics','adnxs','advertising.com','taboola','criteo','rubiconproject','pubmatic','openx.net','casalemedia','smartadserver','sovrn','contextweb','districtm.io','popads','popcash','propellerads','trafficjunky','trafficfactory','popunder.ru','adskeeper','adcash','adsterra','mgid','revcontent','outbrain','exoclick','juicyads','hilltopads','clickadu','evadav','trafficstars','zeropark','richpush','ero-advertising','hotjar','crazyegg'];
  function isAdDomain(src) {
    if (!src) return false;
    try { var h = new URL(src).hostname; return AD_DOMAINS.some(function(d){ return h === d || h.endsWith('.'+d) || src.includes(d); }); } catch(e) { return AD_DOMAINS.some(function(d){ return src.includes(d); }); }
  }
  function isAllowed(src) {
    if (!src) return true;
    if (isAdDomain(src)) return false;
    return src.includes('redeflix') || src.includes('embedtv') || src.includes('faz-o-eli') || src.includes('embed.embedplayer.site') || src.includes('embedplayer2.xyz');
  }
  function removeAds() {
    try { document.querySelectorAll('iframe').forEach(function(el) { if (!isAllowed(el.src)) el.remove(); }); } catch(e) {}
    try { document.querySelectorAll('a[target="_blank"],a[onclick*="open"]').forEach(function(el) { el.removeAttribute('href'); el.removeAttribute('onclick'); el.removeAttribute('target'); el.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); }, true); }); } catch(e) {}
    var sels = ['[id*="google_ads"],[id*="aswift"],[class*="overlay-ad"]','[class*="ad-container"],[id*="ad-container"]','iframe[src*="googlesyndication"],iframe[src*="doubleclick"]','iframe[src*="parembed"]','#preroll-ads,.preroll,[class*="preroll"]','[class*="popup"],[id*="popup"]'];
    sels.forEach(function(s) { try { document.querySelectorAll(s).forEach(function(el) { el.remove(); }); } catch(e) {} });
  }
  removeAds();
  setInterval(removeAds, 800);
  try { new MutationObserver(removeAds).observe(document.body, { childList: true, subtree: true }); } catch(e) {}
})(); true;
`;

// Auto-triggers fireload() on embedplayer2.xyz pages (direct iframe embed mode)
const EMBED_AUTOPLAY_JS = `
(function() {
  function tryFire() {
    try {
      if (typeof fireload === 'function') { fireload(); return true; }
    } catch(e) {}
    try {
      var btn = document.querySelector('.play-button-outer');
      if (btn && btn.style.display !== 'none') { btn.click(); return true; }
    } catch(e) {}
    return false;
  }
  [200, 600, 1200, 2000, 3500].forEach(function(ms) {
    setTimeout(function() { if (!window.__rn_fired) { if(tryFire()) window.__rn_fired=true; } }, ms);
  });
})(); true;
`;

// Detects 404/error pages rendered inside the WebView and signals back to RN
const ERROR_PAGE_DETECTOR_JS = `
(function() {
  try {
    var title = (document.title || '').toLowerCase();
    var body  = (document.body ? document.body.innerText : '').toLowerCase();
    var patterns = [
      'page you visited does not exist',
      'file does not exist',
      'page not found',
      '404 not found',
      'sorry, the page',
      'access link is wrong',
      'não existe',
      'página não encontrada',
      'this page could not be found',
      'oops! that page',
      'error 404',
    ];
    var is404 = (
      title === '404' ||
      title.includes('not found') ||
      title.includes('não encontrada') ||
      patterns.some(function(p) { return body.includes(p); })
    );
    if (is404) {
      try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'page_error_detected',code:404})); } catch(x) {}
    }
  } catch(e) {}
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

const NAT_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;
const NAT_SLEEP = [15, 30, 45, 60, 90] as const;
const NAT_RED = "#e50914";

function NatSeekFlash({ side, anim }: { side: "left" | "right"; anim: Animated.Value }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        nat.seekFlash,
        side === "left"
          ? { left: 0, borderTopRightRadius: 80, borderBottomRightRadius: 80 }
          : { right: 0, borderTopLeftRadius: 80, borderBottomLeftRadius: 80 },
        { opacity: anim },
      ]}
    >
      <Feather name={side === "left" ? "rotate-ccw" : "rotate-cw"} size={28} color="#fff" />
      <Text style={nat.seekFlashTxt}>{side === "left" ? "-15s" : "+15s"}</Text>
    </Animated.View>
  );
}

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
  onProgressUpdate?: (positionMs: number, durationMs: number) => void;
}

function NativeVideoPlayer({
  m3u8Url, referer, title, type, season, episode,
  onBack, onPrevEp, onNextEp, onOpenPicker, onFallbackToWebView, onProgressUpdate,
}: NativePlayerProps) {
  const insets = useSafeAreaInsets();
  const videoRef = useRef<any>(null);

  // ── Core state ──────────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(true);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [bufferedMs, setBufferedMs] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // ── Controls visibility ─────────────────────────────────────────────────────
  const [controlsVisible, setControlsVisible] = useState(true);
  const lockAnim = useRef(new Animated.Value(1)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekBarWidthRef = useRef(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);
  const [showTimeRemaining, setShowTimeRemaining] = useState(false);

  // ── Speed ───────────────────────────────────────────────────────────────────
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [showSpeedPanel, setShowSpeedPanel] = useState(false);
  const [isSpeedBoost, setIsSpeedBoost] = useState(false);

  // ── Sleep timer ─────────────────────────────────────────────────────────────
  const [sleepTimerEnd, setSleepTimerEnd] = useState<number | null>(null);
  const [sleepMinutesLeft, setSleepMinutesLeft] = useState<number | null>(null);
  const [showSleepPanel, setShowSleepPanel] = useState(false);
  const sleepCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Screen lock ─────────────────────────────────────────────────────────────
  const [isLocked, setIsLocked] = useState(false);

  // ── Seek flash ──────────────────────────────────────────────────────────────
  const seekFlashLeft = useRef(new Animated.Value(0)).current;
  const seekFlashRight = useRef(new Animated.Value(0)).current;

  // ── Swipe-to-seek ───────────────────────────────────────────────────────────
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

  // ── Volume (right 28% vertical swipe → expo-av volume) ─────────────────────
  const [volumeLevel, setVolumeLevel] = useState(1.0);
  const [showVolumeHud, setShowVolumeHud] = useState(false);
  const volumeAtStart = useRef(1.0);
  const volumeLevelRef = useRef(1.0);
  const volumeHudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Continuous play (TV) ────────────────────────────────────────────────────
  const [continuousPlay, setContinuousPlay] = useState(true);

  // ── Double-tap ──────────────────────────────────────────────────────────────
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Position tracking refs for closures ────────────────────────────────────
  const positionMsRef = useRef(0);
  const durationMsRef = useRef(0);
  const positionRatioRef = useRef(0);

  // ── Smart Autoplay (TV only) ───────────────────────────────────────────────
  const [autoplayVisible, setAutoplayVisible] = useState(false);
  const [autoplayCountdown, setAutoplayCountdown] = useState(10);
  const autoplayTriggeredRef = useRef(false);
  const autoplayIntervalRef = useRef<any>(null);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const positionSec = Math.floor(positionMs / 1000);
  const durationSec = Math.floor(durationMs / 1000);
  const remainingSec = durationSec - positionSec;
  const displayPos = isScrubbing ? scrubPosition : positionMs;
  const displayProgress = durationMs > 0 ? displayPos / durationMs : 0;
  const bufferedRatio = durationMs > 0 ? bufferedMs / durationMs : 0;
  const showSkipIntro = type === "tv" && positionSec >= 5 && positionSec <= 90 && durationMs > 0;
  const showSkipCredits = durationSec > 0 && remainingSec > 0 && remainingSec <= 180;

  // ── Controls auto-hide ──────────────────────────────────────────────────────
  const showControls = useCallback(() => {
    if (isLocked) return;
    setControlsVisible(true);
    Animated.timing(lockAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      Animated.timing(lockAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start(() =>
        setControlsVisible(false)
      );
    }, AUTO_HIDE_MS);
  }, [isLocked, lockAnim]);

  useEffect(() => {
    showControls();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

  // ── Sleep timer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sleepTimerEnd) {
      setSleepMinutesLeft(null);
      if (sleepCheckRef.current) { clearInterval(sleepCheckRef.current); sleepCheckRef.current = null; }
      return;
    }
    const check = () => {
      const minsLeft = Math.ceil((sleepTimerEnd - Date.now()) / 60000);
      if (minsLeft <= 0) { setSleepTimerEnd(null); videoRef.current?.pauseAsync?.().catch(() => {}); }
      else setSleepMinutesLeft(minsLeft);
    };
    check();
    sleepCheckRef.current = setInterval(check, 10000);
    return () => { if (sleepCheckRef.current) { clearInterval(sleepCheckRef.current); sleepCheckRef.current = null; } };
  }, [sleepTimerEnd]);

  // ── Smart Autoplay countdown tick ───────────────────────────────────────────
  const dismissAutoplay = useCallback(() => {
    setAutoplayVisible(false);
    setAutoplayCountdown(10);
    if (autoplayIntervalRef.current) { clearInterval(autoplayIntervalRef.current); autoplayIntervalRef.current = null; }
  }, []);

  useEffect(() => {
    if (!autoplayVisible) return;
    autoplayIntervalRef.current = setInterval(() => {
      setAutoplayCountdown((prev) => {
        if (prev <= 1) { setTimeout(() => { dismissAutoplay(); if (continuousPlay) onNextEp(); }, 0); return 10; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (autoplayIntervalRef.current) { clearInterval(autoplayIntervalRef.current); autoplayIntervalRef.current = null; } };
  }, [autoplayVisible, continuousPlay, onNextEp, dismissAutoplay]);

  // ── Playback actions ────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    try { Vibration.vibrate(30); } catch {}
    showControls();
    if (isPlaying) videoRef.current.pauseAsync().catch(() => {});
    else videoRef.current.playAsync().catch(() => {});
  }, [isPlaying, showControls]);

  const seekBy = useCallback((ms: number) => {
    if (!videoRef.current) return;
    const newPos = Math.max(0, Math.min(durationMsRef.current, positionMsRef.current + ms));
    videoRef.current.setPositionAsync(newPos).catch(() => {});
    setPositionMs(newPos);
    positionMsRef.current = newPos;
    showControls();
  }, [showControls]);

  useEffect(() => { seekByRef.current = seekBy; }, [seekBy]);

  const seekToRatio = useCallback((ratio: number) => {
    if (!videoRef.current || !durationMsRef.current) return;
    const pos = Math.max(0, Math.min(1, ratio)) * durationMsRef.current;
    videoRef.current.setPositionAsync(pos).catch(() => {});
    setPositionMs(pos);
    positionMsRef.current = pos;
  }, []);

  // ── Swipe-to-seek PanResponder ──────────────────────────────────────────────
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
        swipeGestureActive.current = false; swipeDeltaSec.current = 0;
        setSwipeSeekDisplay(0); setIsSwipeSeeking(false);
      },
      onPanResponderTerminate: () => {
        swipeGestureActive.current = false; swipeDeltaSec.current = 0;
        setSwipeSeekDisplay(0); setIsSwipeSeeking(false);
      },
    })
  ).current;

  // ── Brightness zone PanResponder (left 28%) ─────────────────────────────────
  const leftZonePan = useRef(
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
  const rightZonePan = useRef(
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

  // ── Double-tap handler ──────────────────────────────────────────────────────
  const handleTap = useCallback((px: number) => {
    const now = Date.now();
    const zoneW = W / 3;
    const isLeft = px < zoneW;
    const isRight = px > W - zoneW;
    if (lastTapRef.current && now - lastTapRef.current.time < 350 && Math.abs(px - lastTapRef.current.x) < 80) {
      if (tapTimerRef.current) { clearTimeout(tapTimerRef.current); tapTimerRef.current = null; }
      lastTapRef.current = null;
      try { Vibration.vibrate([0, 30, 50, 30]); } catch {}
      if (isLeft) {
        seekByRef.current(-15000);
        Animated.sequence([
          Animated.timing(seekFlashLeft, { toValue: 0.85, duration: 100, useNativeDriver: true }),
          Animated.timing(seekFlashLeft, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]).start();
      } else if (isRight) {
        seekByRef.current(15000);
        Animated.sequence([
          Animated.timing(seekFlashRight, { toValue: 0.85, duration: 100, useNativeDriver: true }),
          Animated.timing(seekFlashRight, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]).start();
      }
    } else {
      lastTapRef.current = { time: now, x: px };
      tapTimerRef.current = setTimeout(() => {
        lastTapRef.current = null; tapTimerRef.current = null;
        showControls();
      }, 360);
    }
  }, [showControls, seekFlashLeft, seekFlashRight]);

  // ── Error screen ────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <View style={nat.container}>
        <StatusBar style="light" hidden />
        <View style={nat.errCenter}>
          <Feather name="alert-triangle" size={48} color={NAT_RED} />
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

      {/* ── Video ── */}
      {Video ? (
        <Video
          ref={videoRef}
          source={{ uri: m3u8Url, headers: referer ? { Referer: referer, Origin: new URL(referer).origin } : {} }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode?.CONTAIN ?? "contain"}
          shouldPlay
          useNativeControls={false}
          rate={isSpeedBoost ? 2.0 : playbackSpeed}
          volume={volumeLevel}
          onPlaybackStatusUpdate={(status: any) => {
            if (!status.isLoaded) { if (status.error) setLoadError(true); return; }
            setIsPlaying(status.isPlaying ?? false);
            setPositionMs(status.positionMillis ?? 0);
            setDurationMs(status.durationMillis ?? 0);
            setBufferedMs(status.playableDurationMillis ?? 0);
            setBuffering(status.isBuffering ?? false);
            positionMsRef.current = status.positionMillis ?? 0;
            durationMsRef.current = status.durationMillis ?? 0;
            if (status.durationMillis && status.durationMillis > 0) {
              positionRatioRef.current = (status.positionMillis ?? 0) / status.durationMillis;
              onProgressUpdate?.(status.positionMillis ?? 0, status.durationMillis ?? 0);
              if (type === "tv" && !autoplayTriggeredRef.current && positionRatioRef.current >= 0.93) {
                autoplayTriggeredRef.current = true; setAutoplayVisible(true);
              }
            }
            if (status.didJustFinish && type === "tv" && !autoplayTriggeredRef.current) {
              autoplayTriggeredRef.current = true; setAutoplayVisible(true);
            }
          }}
          onError={() => setLoadError(true)}
        />
      ) : null}

      {/* ── Brightness dim overlay ── */}
      {brightnessLevel > 0 && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: brightnessLevel }]} />
      )}

      {/* ── Buffering spinner ── */}
      {buffering && (
        <View style={nat.bufferOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={NAT_RED} />
        </View>
      )}

      {/* ── Speed boost badge ── */}
      {isSpeedBoost && (
        <View style={nat.speedBoostBadge} pointerEvents="none">
          <Feather name="zap" size={14} color="#fff" />
          <Text style={nat.speedBoostText}>2.0×</Text>
        </View>
      )}

      {/* ── Seek flash overlays ── */}
      <NatSeekFlash side="left" anim={seekFlashLeft} />
      <NatSeekFlash side="right" anim={seekFlashRight} />

      {/* ── Swipe-to-seek display ── */}
      {isSwipeSeeking && (
        <View style={nat.swipeSeekBubble} pointerEvents="none">
          <Feather name={swipeSeekDisplay >= 0 ? "fast-forward" : "rewind"} size={18} color="#fff" />
          <Text style={nat.swipeSeekText}>{swipeSeekDisplay >= 0 ? "+" : ""}{swipeSeekDisplay}s</Text>
        </View>
      )}

      {/* ── Brightness HUD ── */}
      {showBrightnessHud && (
        <View style={nat.hudPill} pointerEvents="none">
          <Feather name="sun" size={13} color="#fff" />
          <View style={nat.hudBar}><View style={[nat.hudBarFill, { width: `${Math.round((1 - brightnessLevel / 0.85) * 100)}%` as any }]} /></View>
          <Text style={nat.hudPct}>{Math.round((1 - brightnessLevel / 0.85) * 100)}%</Text>
        </View>
      )}

      {/* ── Volume HUD ── */}
      {showVolumeHud && (
        <View style={nat.hudPill} pointerEvents="none">
          <Feather name={volumeLevel === 0 ? "volume-x" : volumeLevel < 0.4 ? "volume-1" : "volume-2"} size={13} color="#fff" />
          <View style={nat.hudBar}><View style={[nat.hudBarFill, { width: `${Math.round(volumeLevel * 100)}%` as any }]} /></View>
          <Text style={nat.hudPct}>{Math.round(volumeLevel * 100)}%</Text>
        </View>
      )}

      {/* ── Sleep badge ── */}
      {sleepTimerEnd && sleepMinutesLeft != null && (
        <Pressable style={nat.sleepBadge} onPress={() => setShowSleepPanel(true)}>
          <Feather name="moon" size={11} color="#aaa" />
          <Text style={nat.sleepBadgeText}>{sleepMinutesLeft > 0 ? `${sleepMinutesLeft}min` : "Pausando..."}</Text>
        </Pressable>
      )}

      {/* ── Skip intro ── */}
      {showSkipIntro && !isLocked && controlsVisible && (
        <Pressable style={nat.skipIntroPos} onPress={() => { try { Vibration.vibrate([0, 40, 60, 40]); } catch {} seekBy(90 * 1000 - positionMs); }}>
          <View style={nat.skipIntroBtn}><Feather name="skip-forward" size={13} color="#fff" /><Text style={nat.skipIntroBtnText}>Pular abertura</Text></View>
        </Pressable>
      )}

      {/* ── Skip credits ── */}
      {showSkipCredits && !isLocked && controlsVisible && !showSkipIntro && (
        <Pressable style={nat.skipIntroPos} onPress={() => { try { Vibration.vibrate([0, 40, 60, 40]); } catch {} if (type === "tv") onNextEp(); }}>
          <View style={nat.skipIntroBtn}><Feather name="skip-forward" size={13} color="#fff" /><Text style={nat.skipIntroBtnText}>{type === "tv" ? "Próximo episódio" : "Pular créditos"}</Text></View>
        </Pressable>
      )}

      {/* ── Lock screen ── */}
      {isLocked && (
        <Pressable style={StyleSheet.absoluteFillObject} onLongPress={() => { try { Vibration.vibrate([0, 30, 50, 30]); } catch {} setIsLocked(false); showControls(); }} delayLongPress={700}>
          <View style={nat.lockPill}><Feather name="lock" size={14} color="#fff" /><Text style={nat.lockPillText}>Segure para desbloquear</Text></View>
        </Pressable>
      )}

      {/* ── Controls overlay ── */}
      {!isLocked && (
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: lockAnim }]} pointerEvents={controlsVisible ? "box-none" : "none"}>
          <View style={nat.gradTop} pointerEvents="none" />
          <View style={nat.gradBottom} pointerEvents="none" />

          {/* Gesture zones: horizontal seek + brightness (left) + volume (right) */}
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <View style={StyleSheet.absoluteFill} {...bodySwipePan.panHandlers} pointerEvents="box-none" />
            <View style={[nat.gestureZone, { left: 0, width: W * 0.28 }]} {...leftZonePan.panHandlers} pointerEvents="box-none" />
            <View style={[nat.gestureZone, { right: 0, width: W * 0.28 }]} {...rightZonePan.panHandlers} pointerEvents="box-none" />
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={(e) => handleTap(e.nativeEvent.pageX)}
              onLongPress={() => { setIsSpeedBoost(true); try { Vibration.vibrate([0, 20]); } catch {} }}
              onPressOut={() => { if (isSpeedBoost) setIsSpeedBoost(false); }}
              delayLongPress={600}
            />
          </View>

          {/* Top bar */}
          <View style={[nat.topBar, { paddingTop: (Platform.OS === "android" ? 8 : insets.top) + 4 }]}>
            <Pressable onPress={onBack} style={nat.iconBtn} hitSlop={12}><Feather name="arrow-left" size={22} color="#fff" /></Pressable>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={nat.titleText} numberOfLines={1}>{title}</Text>
              {type === "tv" && <Text style={nat.subTitle}>T{season} · Ep {episode}</Text>}
            </View>
            {playbackSpeed !== 1.0 && <View style={nat.speedBadge}><Text style={nat.speedBadgeText}>{playbackSpeed}×</Text></View>}
            <Pressable style={nat.iconBtn} onPress={() => { setShowSpeedPanel(true); showControls(); }} hitSlop={12}><Feather name="zap" size={18} color="#fff" /></Pressable>
            <Pressable style={nat.iconBtn} onPress={() => { setShowSleepPanel(true); showControls(); }} hitSlop={12}><Feather name="moon" size={18} color={sleepTimerEnd ? "#f59e0b" : "#fff"} /></Pressable>
            <Pressable style={nat.iconBtn} onPress={() => { try { Vibration.vibrate(30); } catch {} setIsLocked(true); }} hitSlop={12}><Feather name="unlock" size={18} color="#fff" /></Pressable>
            {type === "tv" ? (
              <Pressable onPress={onOpenPicker} style={nat.iconBtn} hitSlop={12}><Feather name="list" size={20} color="#fff" /></Pressable>
            ) : <View style={{ width: 8 }} />}
          </View>

          {/* Center row */}
          <View style={nat.centerRow}>
            {type === "tv" && <Pressable onPress={onPrevEp} style={nat.iconBtn} hitSlop={12}><Feather name="skip-back" size={22} color="#fff" /></Pressable>}
            <Pressable onPress={() => seekBy(-15000)} style={nat.skipBtn} hitSlop={16}>
              <View style={nat.skipCircle}><Feather name="rotate-ccw" size={22} color="#fff" /><Text style={nat.skipLabel}>15</Text></View>
            </Pressable>
            <Pressable onPress={togglePlay} style={nat.playBtn} hitSlop={10}>
              <View style={nat.playCircle}>
                {buffering ? <ActivityIndicator size="small" color="#fff" /> : <Feather name={isPlaying ? "pause" : "play"} size={32} color="#fff" />}
              </View>
            </Pressable>
            <Pressable onPress={() => seekBy(15000)} style={nat.skipBtn} hitSlop={16}>
              <View style={nat.skipCircle}><Feather name="rotate-cw" size={22} color="#fff" /><Text style={nat.skipLabel}>15</Text></View>
            </Pressable>
            {type === "tv" && <Pressable onPress={onNextEp} style={nat.iconBtn} hitSlop={12}><Feather name="skip-forward" size={22} color="#fff" /></Pressable>}
          </View>

          {/* Bottom bar */}
          <View style={[nat.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
            <Pressable onPress={() => setShowTimeRemaining(!showTimeRemaining)}>
              <Text style={nat.timeText}>{showTimeRemaining ? `-${fmtTime(Math.max(0, durationMs - displayPos))}` : fmtTime(displayPos)}</Text>
            </Pressable>
            <View
              style={nat.seekBarTrack}
              onLayout={(e) => { seekBarWidthRef.current = e.nativeEvent.layout.width; }}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(e) => {
                const ratio = Math.max(0, Math.min(e.nativeEvent.locationX / seekBarWidthRef.current, 1));
                setScrubPosition(ratio * durationMs); setIsScrubbing(true); showControls();
              }}
              onResponderMove={(e) => {
                if (!seekBarWidthRef.current) return;
                const ratio = Math.max(0, Math.min(e.nativeEvent.locationX / seekBarWidthRef.current, 1));
                setScrubPosition(ratio * durationMs);
              }}
              onResponderRelease={(e) => {
                if (!seekBarWidthRef.current) return;
                const ratio = Math.max(0, Math.min(e.nativeEvent.locationX / seekBarWidthRef.current, 1));
                seekToRatio(ratio); setIsScrubbing(false); showControls();
              }}
            >
              <View style={[nat.seekBarBuf, { width: `${Math.round(bufferedRatio * 100)}%` as any }]} />
              <View style={[nat.seekBarFill, { width: `${Math.round(displayProgress * 100)}%` as any }]} />
              <View style={[nat.seekThumb, {
                left: `${Math.round(displayProgress * 100)}%` as any,
                width: isScrubbing ? 18 : 13, height: isScrubbing ? 18 : 13,
                marginTop: isScrubbing ? -7 : -4.5, marginLeft: isScrubbing ? -9 : -6.5,
              }]} />
              {isScrubbing && (
                <View style={[nat.scrubTooltip, { left: Math.max(24, Math.min(seekBarWidthRef.current - 40, displayProgress * seekBarWidthRef.current - 24)) }]}>
                  <Text style={nat.scrubTooltipText}>{fmtTime(scrubPosition)}</Text>
                </View>
              )}
            </View>
            <Text style={nat.timeText}>{fmtTime(durationMs)}</Text>
            {type === "tv" && (
              <Pressable style={[nat.iconBtnSm, continuousPlay && { backgroundColor: "rgba(229,9,20,0.2)" }]} onPress={() => { try { Vibration.vibrate(20); } catch {} setContinuousPlay(!continuousPlay); }}>
                <Feather name="repeat" size={15} color={continuousPlay ? NAT_RED : "rgba(255,255,255,0.5)"} />
              </Pressable>
            )}
          </View>
        </Animated.View>
      )}

      {/* ── Speed panel ── */}
      <Modal visible={showSpeedPanel} transparent animationType="fade" onRequestClose={() => setShowSpeedPanel(false)}>
        <Pressable style={nat.panelBackdrop} onPress={() => setShowSpeedPanel(false)}>
          <View style={nat.panel}>
            <Text style={nat.panelTitle}>Velocidade de Reprodução</Text>
            {NAT_SPEEDS.map((s) => (
              <Pressable key={s} style={[nat.panelRow, playbackSpeed === s && { backgroundColor: "rgba(229,9,20,0.12)" }]}
                onPress={() => { try { Vibration.vibrate(20); } catch {} setPlaybackSpeed(s); setShowSpeedPanel(false); showControls(); }}>
                <Text style={[nat.panelRowText, playbackSpeed === s && { color: NAT_RED, fontWeight: "700" }]}>{s === 1.0 ? "1.0× (Normal)" : `${s}×`}</Text>
                {playbackSpeed === s && <Feather name="check" size={16} color={NAT_RED} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Sleep panel ── */}
      <Modal visible={showSleepPanel} transparent animationType="fade" onRequestClose={() => setShowSleepPanel(false)}>
        <Pressable style={nat.panelBackdrop} onPress={() => setShowSleepPanel(false)}>
          <View style={nat.panel}>
            <Text style={nat.panelTitle}>Timer de Sono</Text>
            {NAT_SLEEP.map((m) => (
              <Pressable key={m} style={nat.panelRow}
                onPress={() => { try { Vibration.vibrate(20); } catch {} setSleepTimerEnd(Date.now() + m * 60 * 1000); setShowSleepPanel(false); showControls(); }}>
                <Text style={nat.panelRowText}>{m} minutos</Text>
              </Pressable>
            ))}
            {sleepTimerEnd && (
              <Pressable style={[nat.panelRow, { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", marginTop: 4 }]}
                onPress={() => { try { Vibration.vibrate(20); } catch {} setSleepTimerEnd(null); setShowSleepPanel(false); }}>
                <Text style={[nat.panelRowText, { color: "#f87171" }]}>Cancelar timer</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* ── Smart Autoplay (TV) ── */}
      {type === "tv" && autoplayVisible && (
        <View style={nat.autoplayOverlay}>
          <View style={nat.autoplayCard}>
            <Text style={nat.autoplayLabel}>PRÓXIMO EPISÓDIO</Text>
            <Text style={nat.autoplayEpInfo}>T{season} · Episódio {episode + 1}</Text>
            <View style={nat.autoplayCountdownWrap}>
              <Text style={nat.autoplayCountdownNum}>{autoplayCountdown}</Text>
              <Text style={nat.autoplayCountdownSub}>segundos</Text>
            </View>
            <View style={nat.autoplayBarTrack}>
              <View style={[nat.autoplayBarFill, { width: `${((10 - autoplayCountdown) / 10) * 100}%` as any }]} />
            </View>
            <View style={nat.autoplayBtns}>
              <Pressable style={nat.autoCancelBtn} onPress={dismissAutoplay}><Text style={nat.autoCancelTxt}>Cancelar</Text></Pressable>
              <Pressable style={nat.autoNextBtn} onPress={() => { dismissAutoplay(); onNextEp(); }}>
                <Feather name="play" size={15} color="#fff" /><Text style={nat.autoNextTxt}>Próximo</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
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
  gradTop: { position: "absolute", top: 0, left: 0, right: 0, height: 130, backgroundColor: "rgba(0,0,0,0.55)" },
  gradBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 130, backgroundColor: "rgba(0,0,0,0.6)" },
  gestureZone: { position: "absolute", top: 0, bottom: 0 },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 8, gap: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  iconBtnSm: { width: 32, height: 32, justifyContent: "center", alignItems: "center", borderRadius: 8 },
  titleText: { color: "#fff", fontSize: 15, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  subTitle: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 },
  speedBadge: { backgroundColor: "rgba(229,9,20,0.18)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(229,9,20,0.35)" },
  speedBadgeText: { color: "#e50914", fontSize: 11, fontWeight: "700" },
  centerRow: { ...StyleSheet.absoluteFillObject as any, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 32 },
  skipBtn: { alignItems: "center", justifyContent: "center" },
  skipCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.22)" },
  skipLabel: { color: "#fff", fontSize: 10, fontWeight: "700", position: "absolute", bottom: 9 },
  playBtn: { alignItems: "center", justifyContent: "center" },
  playCircle: { width: 74, height: 74, borderRadius: 37, backgroundColor: "rgba(229,9,20,0.85)", alignItems: "center", justifyContent: "center", shadowColor: "#e50914", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 12 },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingTop: 10, gap: 10 },
  timeText: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "500", fontVariant: ["tabular-nums"] as any },
  seekBarTrack: { flex: 1, height: 28, justifyContent: "center", position: "relative" },
  seekBarBuf: { height: 4, borderRadius: 2, position: "absolute", top: 12, left: 0, backgroundColor: "rgba(255,255,255,0.3)" },
  seekBarFill: { height: 4, borderRadius: 2, position: "absolute", top: 12, left: 0, backgroundColor: "#e50914" },
  seekThumb: { position: "absolute", top: 9, borderRadius: 9, backgroundColor: "#e50914", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.6, shadowRadius: 4, elevation: 4 },
  scrubTooltip: { position: "absolute", bottom: 20, backgroundColor: "rgba(0,0,0,0.85)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  scrubTooltipText: { color: "#fff", fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] as any },
  seekFlash: { position: "absolute", top: 0, bottom: 0, width: "38%", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.1)" },
  seekFlashTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },
  swipeSeekBubble: { position: "absolute", top: "50%", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginTop: -20 },
  swipeSeekText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  hudPill: { position: "absolute", top: "40%", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.72)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginTop: -18 },
  hudBar: { width: 100, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" },
  hudBarFill: { height: 4, backgroundColor: "#fff", borderRadius: 2 },
  hudPct: { color: "#fff", fontSize: 13, fontWeight: "700", minWidth: 34 },
  sleepBadge: { position: "absolute", top: 56, right: 12, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  sleepBadgeText: { color: "#aaa", fontSize: 11 },
  skipIntroPos: { position: "absolute", bottom: 80, right: 18 },
  skipIntroBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  skipIntroBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  lockPill: { position: "absolute", bottom: 50, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  lockPillText: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600" },
  speedBoostBadge: { position: "absolute", top: "48%", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(229,9,20,0.85)", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginTop: -16 },
  speedBoostText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  panelBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  panel: { backgroundColor: "rgba(16,16,16,0.98)", borderRadius: 18, paddingVertical: 10, paddingHorizontal: 4, minWidth: 240, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  panelTitle: { color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: "700", letterSpacing: 1.5, marginBottom: 6, paddingHorizontal: 20, paddingTop: 4 },
  panelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 13, borderRadius: 10 },
  panelRowText: { color: "#fff", fontSize: 15, fontWeight: "500" },
  autoplayOverlay: { ...StyleSheet.absoluteFillObject as any, alignItems: "flex-end", justifyContent: "flex-end", padding: 20, zIndex: 30, backgroundColor: "rgba(0,0,0,0.45)" },
  autoplayCard: { width: 270, backgroundColor: "rgba(12,6,10,0.97)", borderRadius: 20, padding: 20, gap: 10, borderWidth: 1, borderColor: "rgba(229,9,20,0.4)", shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.7, shadowRadius: 28, elevation: 24 },
  autoplayLabel: { color: "#e50914", fontSize: 9, fontWeight: "900", letterSpacing: 2.5 },
  autoplayEpInfo: { color: "#fff", fontSize: 17, fontWeight: "800", lineHeight: 22 },
  autoplayCountdownWrap: { alignSelf: "center", alignItems: "center", paddingVertical: 4 },
  autoplayCountdownNum: { color: "#fff", fontSize: 56, fontWeight: "900", lineHeight: 62, fontVariant: ["tabular-nums"] as any },
  autoplayCountdownSub: { color: "rgba(255,255,255,0.38)", fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
  autoplayBarTrack: { height: 3, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 2, overflow: "hidden" },
  autoplayBarFill: { height: 3, backgroundColor: "#e50914", borderRadius: 2 },
  autoplayBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  autoCancelBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: "center", backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  autoCancelTxt: { color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: "700" },
  autoNextBtn: { flex: 1.5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 11, borderRadius: 10, backgroundColor: "#e50914" },
  autoNextTxt: { color: "#fff", fontSize: 14, fontWeight: "800" },
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
    directM3u8?: string; directReferer?: string; directEmbed?: string;
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
  const directM3u8 = params.directM3u8 ?? "";
  const directReferer = params.directReferer ?? "";
  const directEmbed = params.directEmbed ?? "";

  // ── Sting overlay ──────────────────────────────────────────────────────────
  const [showSting, setShowSting] = useState(Platform.OS !== "web");

  // ── WebView states ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [error, setError] = useState(false);
  const [progressSaved, setProgressSaved] = useState(false);
  const [showCastModal, setShowCastModal] = useState(false);
  const [pipEnabled, setPipEnabled] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const webviewRef = useRef<any>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Native player states ─────────────────────────────────────────────────────
  // If directM3u8 was resolved server-side, use it immediately (no WebView)
  const [m3u8Url, setM3u8Url] = useState<string | null>(directM3u8 || null);
  const [m3u8Referer, setM3u8Referer] = useState(directReferer || "");
  const [useWebViewFallback, setUseWebViewFallback] = useState(false);

  // ── Episode picker states ───────────────────────────────────────────────────
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSeason, setPickerSeason] = useState(season);
  const [totalSeasons, setTotalSeasons] = useState(Number(params.totalSeasons ?? 1));
  const [pickerEpisodes, setPickerEpisodes] = useState<TmdbEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const navigatingToEpisodeRef = useRef(false);
  const [sessionBlocked, setSessionBlocked] = useState<"trial_expired" | "plan_expired" | "limit_exceeded" | null>(null);

  const EMBED_BASE = "https://embed.embedplayer.site";
  const playerUrl = directEmbed
    ? directEmbed
    : isLive && streamUrl
    ? streamUrl
    : `${EMBED_BASE}/${type === "tv" ? `tv/${id}/${season}/${episode}` : String(id)}`;

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

  // ── Session limit tracking ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    checkAndStartSession(user.id, user.role).then((result) => {
      if (result !== "ok") setSessionBlocked(result);
    });
    const hbInterval = setInterval(heartbeatSession, 20000);
    return () => {
      clearInterval(hbInterval);
      endSession();
    };
  }, [user?.id]);

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

  const positionRatioRef = useRef(0.05);
  const positionMsRef   = useRef(0);
  const durationMsRef   = useRef(0);

  // ── Local progress save (AsyncStorage — no auth needed) ───────────────────
  const saveLocalProgressData = useCallback(async () => {
    if (!id || isLive) return;
    const ratio = positionRatioRef.current;
    if (ratio < 0.02 || ratio > 0.97) return; // skip near start/end
    await saveLocalProgress({
      contentId: `${type === "live" ? "movie" : type}_${id}`,
      tmdbId: String(id),
      type: type === "tv" ? "tv" : "movie",
      title: title || "Sem título",
      posterPath,
      backdropPath,
      progress: ratio,
      positionMs: positionMsRef.current,
      durationMs: durationMsRef.current,
      season: type === "tv" ? season : undefined,
      episode: type === "tv" ? episode : undefined,
    });
  }, [id, type, title, posterPath, backdropPath, season, episode, isLive]);

  // Save every 15 s; also save when player unmounts
  useEffect(() => {
    if (!id || isLive) return;
    const interval = setInterval(saveLocalProgressData, 15000);
    return () => {
      clearInterval(interval);
      saveLocalProgressData();
    };
  }, [saveLocalProgressData]);

  const saveProgress = async () => {
    if (!user?.id || !id || !isSupabaseConfigured || progressSaved || isLive) return;
    const dbType = type === "tv" ? "tv" : "movie";
    try {
      setProgressSaved(true);
      await db.progress.upsert({
        user_id: user.id, tmdb_id: id, type: dbType, title,
        poster_path: TMDB_IMG(posterPath || null, "w500") ?? posterPath,
        backdrop_path: TMDB_IMG(backdropPath || null, "w1280") ?? undefined,
        progress: positionRatioRef.current,
        position_ms: positionMsRef.current,
        duration_ms: durationMsRef.current,
        ...(dbType === "tv" ? { season, episode } : {}),
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
      } else if (msg.type === "page_error_detected") {
        setError(true);
        setLoading(false);
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
      params: {
        type,
        id: String(id),
        season: String(s),
        episode: String(ep),
        title,
        totalSeasons: String(totalSeasons),
      },
    });
  };

  // ── Guard: invalid ID ───────────────────────────────────────────────────────

  if (!id && !isLive && !directM3u8 && !directEmbed) {
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
          {directM3u8 ? (
            /* Native HTML5 player when m3u8 resolved server-side — NO ads */
            <video
              src={directM3u8}
              controls
              autoPlay
              style={{ width: "100%", height: "100%", backgroundColor: "#000" } as any}
              ref={(el: any) => { if (el) { el.volume = 1; } }}
            />
          ) : (
            <iframe
              src={directEmbed || playerUrl}
              style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#000" }}
              allowFullScreen allow="autoplay; fullscreen; encrypted-media" title={title}
            />
          )}
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
          onProgressUpdate={(pos, dur) => {
            positionMsRef.current = pos;
            durationMsRef.current = dur;
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

      {/* Session blocked overlay */}
      <Modal visible={!!sessionBlocked} animationType="fade" transparent={false} onRequestClose={() => router.back()}>
        <View style={{ flex: 1, backgroundColor: "#080808", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Feather name={sessionBlocked === "limit_exceeded" ? "monitor" : "lock"} size={60} color="#e50914" />
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

      <WebView
        ref={webviewRef}
        source={
          directEmbed
            ? {
                uri: directEmbed,
                headers: {
                  Referer: directReferer || "https://embed.embedplayer.site/",
                  Origin: "https://embed.embedplayer.site",
                },
              }
            : { uri: playerUrl }
        }
        style={styles.webview}
        onLoadStart={() => { if (!initialLoadDone) { setLoading(true); setError(false); } }}
        onLoadEnd={() => { setLoading(false); setInitialLoadDone(true); saveProgress(); showControls(); }}
        onError={() => { setError(true); setLoading(false); }}
        onHttpError={(ev: any) => { if (ev.nativeEvent.statusCode >= 400) { setError(true); setLoading(false); } }}
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
        injectedJavaScript={directEmbed ? `${AD_BLOCKER_JS}\n${EMBED_AUTOPLAY_JS}\n${ERROR_PAGE_DETECTOR_JS}` : `${AD_BLOCKER_JS}\n${ERROR_PAGE_DETECTOR_JS}`}
        injectedJavaScriptForMainFrameOnly={false}
        injectedJavaScriptBeforeContentLoadedIntoEachFrame={M3U8_INTERCEPTOR_JS}
        injectedJavaScriptBeforeContentLoadedIntoEachFrameForMainFrameOnly={false}
        onShouldStartLoadWithRequest={(req: any) => {
          const url: string = req.url || "";
          const isTopFrame: boolean = req.isTopFrame ?? true;

          // ── Capture m3u8 URLs that the WebView tries to navigate to ──────────
          if (url.includes(".m3u8") && !useWebViewFallback) {
            setM3u8Url(url);
            setM3u8Referer((req.mainDocumentURL as string) || playerUrl || "");
            saveProgress();
            return false;
          }

          // ── AdGuard-style comprehensive domain blocklist ──────────────────────
          const BLOCKED = [
            // Embed ad domains
            "parembed.embedplayer.site","parembed","adplayer.pro",
            // Google ads
            "googlesyndication.com","doubleclick.net","adservice.google.com",
            "pagead2.googlesyndication","googleadservices.com","googletagmanager.com",
            "googletagservices.com","google-analytics.com","analytics.google.com",
            // Programmatic ad networks
            "adnxs.com","advertising.com","ads.yahoo.com","taboola.com",
            "criteo.com","criteo.net","criteoadvertising.com",
            "rubiconproject.com","pubmatic.com","openx.net","openx.com",
            "casalemedia.com","smartadserver.com","sovrn.com",
            "contextweb.com","districtm.io","33across.com",
            // Pop/redirect ad networks
            "popads.net","popcash.net","trafficjunky.com","trafficfactory.biz",
            "popunder.ru","propellerads.com","popadscdn.net",
            "adskeeper.co.uk","adcash.com","adcloudstore.com",
            // Tracking/stats
            "adsterra.com","adsterra.network","highperformancecpm.com",
            "mgid.com","revcontent.com","outbrain.com","exoclick.com",
            "juicyads.com","hilltopads.net","hilltopads.com",
            "clickadu.com","evadav.com","trafficstars.com",
            "zeropark.com","richpush.co","a-ads.com",
            "ero-advertising.com","etargetnet.com","clksite.com",
            // Malware / redirects
            "go.oclasrv.com","allyouwant","p.vitaminupdates.com",
            "browser-update.org","softwareupdate","cdn77-static.com",
            // Analytics/trackers
            "mc.yandex.ru","metrika.yandex","hotjar.com","crazyegg.com",
            "mouseflow.com","amplitude.com","mixpanel.com","segment.com",
            "fullstory.com","logrocket.com","newrelic.com",
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
              {/* Cast to TV — works on all platforms */}
              <Pressable
                style={styles.iconBtn}
                onPress={() => setShowCastModal(true)}
                disabled={!streamUrl && !m3u8Url}
              >
                <Feather
                  name="cast"
                  size={19}
                  color={(streamUrl || m3u8Url) ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)"}
                />
              </Pressable>
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

      {/* ── Cast to TV modal ── */}
      <CastModal
        visible={showCastModal}
        onClose={() => setShowCastModal(false)}
        castUrl={(streamUrl || m3u8Url)
          ? `${getApiBase()}/api/cast?url=${encodeURIComponent(streamUrl || m3u8Url || "")}&title=${encodeURIComponent(String(title ?? ""))}`
          : ""}
        title={String(title ?? "")}
        videoUrl={streamUrl || m3u8Url || undefined}
      />

      {/* ── Sting overlay ─────────────────────────────────────────────────── */}
      {showSting && (
        <StingOverlay
          videoReady={!loading}
          onDone={() => setShowSting(false)}
          tmdbId={id > 0 ? id : undefined}
          mediaType={type === "tv" ? "tv" : "movie"}
        />
      )}
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
