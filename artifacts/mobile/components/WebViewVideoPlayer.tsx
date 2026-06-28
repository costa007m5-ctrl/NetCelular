/**
 * WebViewVideoPlayer
 *
 * HTML5 video player embutido em react-native-webview.
 * Usado para URLs Flix2 (nixplay.lat/cineveo/fontedecanais) que o ExoPlayer
 * não consegue reproduzir (redirect HTTPS→HTTP, chars especiais, bloqueio de cleartext).
 *
 * A interface do ref é compatível com expo-av:
 *   ref.setPositionAsync(ms)
 *   ref.playAsync()
 *   ref.pauseAsync()
 *   ref.setRateAsync(rate)
 *
 * IMPORTANTE: o prop `baseUrl` deve bater com a origem do vídeo para evitar
 * bloqueio CORS do elemento <video>. Ex:
 *   nixplay via CF Worker → baseUrl="https://netplay-stream-proxy.netplay.workers.dev"
 *   cineveo/fontedecanais direto → baseUrl="https://nixplay.lat"
 */
import React, { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import WebView from "react-native-webview";

export interface WebViewVideoPlayerRef {
  setPositionAsync: (ms: number) => Promise<void>;
  playAsync: () => Promise<void>;
  pauseAsync: () => Promise<void>;
  setRateAsync: (rate: number, _pitchCorrect?: boolean) => Promise<void>;
  setVolumeAsync: (volume: number) => Promise<void>;
}

export interface PlaybackStatus {
  isLoaded: true;
  positionMillis: number;
  durationMillis: number;
  isPlaying: boolean;
  isBuffering: boolean;
  didJustFinish: boolean;
  rate: number;
  playableDurationMillis: number;
}

interface Props {
  uri: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  style?: any;
  shouldPlay?: boolean;
  rate?: number;
  onLoad?: (status: { durationMillis: number }) => void;
  onPlaybackStatusUpdate?: (status: PlaybackStatus) => void;
  onError?: (error: string) => void;
  progressUpdateIntervalMillis?: number;
}

function buildHtml(uri: string, _headers: Record<string, string>, intervalMs: number): string {
  const escapedUri = uri.replace(/'/g, "\\'").replace(/"/g, "&quot;");
  const intervalS = Math.max(0.25, intervalMs / 1000);

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;background:#000}
html,body{width:100%;height:100%;overflow:hidden}
video{width:100%;height:100%;object-fit:contain;display:block}
</style>
</head>
<body>
<video id="v" playsinline webkit-playsinline preload="auto"></video>
<script>
(function(){
  var v = document.getElementById('v');
  var progressTimer = null;
  var lastPos = -1;
  var lastPlaying = false;
  var lastBuffering = false;
  var lastDuration = 0;
  var rn = window.ReactNativeWebView;
  var INTERVAL_S = ${intervalS};

  function send(msg) {
    try { rn.postMessage(JSON.stringify(msg)); } catch(e){}
  }

  function sendProgress(force) {
    var pos = v.currentTime * 1000;
    var dur = isFinite(v.duration) ? v.duration * 1000 : 0;
    var playing = !v.paused && !v.ended;
    var buffering = v.readyState < 3 && !v.paused && !v.ended;
    var playable = 0;
    try {
      if (v.buffered.length > 0) playable = v.buffered.end(v.buffered.length - 1) * 1000;
    } catch(e){}
    if (force || Math.abs(pos - lastPos) > 200 || playing !== lastPlaying || buffering !== lastBuffering) {
      lastPos = pos; lastPlaying = playing; lastBuffering = buffering;
      send({type:'progress', position: pos, duration: dur, isPlaying: playing, isBuffering: buffering, playable: playable, rate: v.playbackRate});
    }
  }

  function startTimer() {
    if (progressTimer) return;
    progressTimer = setInterval(function(){ sendProgress(false); }, INTERVAL_S * 1000);
  }
  function stopTimer() {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
  }

  v.addEventListener('loadedmetadata', function() {
    var dur = isFinite(v.duration) ? v.duration * 1000 : 0;
    send({type:'ready', duration: dur});
    startTimer();
  });

  v.addEventListener('ended', function() {
    stopTimer();
    sendProgress(true);
    send({type:'ended'});
  });

  v.addEventListener('error', function() {
    var msg = 'Erro ao reproduzir vídeo';
    try { if (v.error) msg = v.error.message || 'Código: ' + v.error.code; } catch(e){}
    stopTimer();
    send({type:'error', message: msg});
  });

  v.addEventListener('waiting', function() { sendProgress(true); });
  v.addEventListener('playing', function() { startTimer(); sendProgress(true); });
  v.addEventListener('pause', function() { sendProgress(true); });
  v.addEventListener('seeked', function() { sendProgress(true); });
  v.addEventListener('ratechange', function() { sendProgress(true); });

  function handleCmd(e) {
    try {
      var cmd = JSON.parse(typeof e === 'string' ? e : (e.data || e));
      if (cmd.type === 'play') v.play();
      else if (cmd.type === 'pause') v.pause();
      else if (cmd.type === 'seek') { v.currentTime = cmd.position / 1000; sendProgress(true); }
      else if (cmd.type === 'rate') { v.playbackRate = cmd.value; }
      else if (cmd.type === 'volume') { v.volume = Math.max(0, Math.min(1, cmd.value)); }
      else if (cmd.type === 'src') {
        stopTimer();
        v.src = cmd.url;
        v.load();
        v.play().catch(function(){});
      }
    } catch(ex){}
  }

  document.addEventListener('message', handleCmd);
  window.addEventListener('message', handleCmd);

  // Load source directly — the WebView userAgent prop already sends a browser UA
  // for all requests (including <video> element fetches), so no blob trick needed.
  // Blob approach caused MEDIA_ELEMENT_ERROR: Format error on production APKs because
  // Android system WebView doesn't support seeking in blob-backed video URLs.
  v.src = '${escapedUri}';
  v.load();
  v.play().catch(function(){});
})();
</script>
</body>
</html>`;
}

const WebViewVideoPlayer = forwardRef<WebViewVideoPlayerRef, Props>(function WebViewVideoPlayer(
  {
    uri,
    baseUrl = "https://nixplay.lat",
    headers = {},
    style,
    shouldPlay,
    rate = 1.0,
    onLoad,
    onPlaybackStatusUpdate,
    onError,
    progressUpdateIntervalMillis = 1000,
  },
  ref
) {
  const webviewRef = useRef<WebView>(null);

  const injectCmd = useCallback((cmd: object) => {
    const js = `(function(){ 
      var e = new MessageEvent('message', { data: '${JSON.stringify(cmd).replace(/'/g, "\\'")}' }); 
      window.dispatchEvent(e); 
    })(); true;`;
    webviewRef.current?.injectJavaScript(js);
  }, []);

  useImperativeHandle(ref, () => ({
    setPositionAsync: async (ms: number) => { injectCmd({ type: "seek", position: ms }); },
    playAsync: async () => { injectCmd({ type: "play" }); },
    pauseAsync: async () => { injectCmd({ type: "pause" }); },
    setRateAsync: async (r: number) => { injectCmd({ type: "rate", value: r }); },
    setVolumeAsync: async (v: number) => { injectCmd({ type: "volume", value: v }); },
  }), [injectCmd]);

  const onMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "ready") {
        onLoad?.({ durationMillis: msg.duration });
      } else if (msg.type === "progress") {
        onPlaybackStatusUpdate?.({
          isLoaded: true,
          positionMillis: msg.position,
          durationMillis: msg.duration,
          isPlaying: msg.isPlaying,
          isBuffering: msg.isBuffering,
          didJustFinish: false,
          rate: msg.rate ?? rate,
          playableDurationMillis: msg.playable,
        });
      } else if (msg.type === "ended") {
        onPlaybackStatusUpdate?.({
          isLoaded: true,
          positionMillis: 0,
          durationMillis: 0,
          isPlaying: false,
          isBuffering: false,
          didJustFinish: true,
          rate: rate,
          playableDurationMillis: 0,
        });
      } else if (msg.type === "error") {
        onError?.(msg.message ?? "Erro no player WebView");
      }
    } catch {}
  }, [onLoad, onPlaybackStatusUpdate, onError, rate]);

  const html = buildHtml(uri, headers, progressUpdateIntervalMillis);

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webviewRef}
        source={{ html, baseUrl }}
        style={styles.webview}
        onMessage={onMessage}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        allowsFullscreenVideo={false}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        mixedContentMode="always"
        allowsProtectedMedia
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  webview: { flex: 1, backgroundColor: "#000" },
});

export default WebViewVideoPlayer;
