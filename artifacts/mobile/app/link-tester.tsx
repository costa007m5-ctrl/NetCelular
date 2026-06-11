/**
 * Link Tester — Admin tool
 *
 * Testa 20 estratégias diferentes de reprodução para uma URL nixplay/fontedecanais.
 * Ajuda a descobrir qual combinação funciona no APK de produção.
 */
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { getApiBase } from "@/lib/api";

let Video: any = null;
try { Video = require("expo-av").Video; } catch {}
let ResizeMode: any = null;
try { ResizeMode = require("expo-av").ResizeMode; } catch {}
let WebView: any = null;
try { WebView = require("react-native-webview").WebView; } catch {}

const RED = "#e50914";
const CF_WORKER = "https://netplay-stream-proxy.netplay.workers.dev";
const UA_CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const UA_CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36";
const UA_SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

const FLIX2_HEADERS = {
  "User-Agent": UA_CHROME_WIN,
  "Referer": "https://nixplay.lat/",
  "Origin": "https://nixplay.lat",
  "Accept": "*/*",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

const DEFAULT_URL = "https://nixplay.lat/movie/Reis007-vods/Reis12@@/784769.mp4";

type StrategyStatus = "idle" | "loading" | "ok" | "error";
interface Strategy {
  id: number;
  group: "ExoPlayer" | "WebView";
  name: string;
  desc: string;
  color: string;
}

const STRATEGIES: Strategy[] = [
  // ── ExoPlayer (expo-av) ───────────────────────────────────────────────────
  { id: 1,  group: "ExoPlayer", name: "Sem headers",            desc: "URL bruta, sem nenhum header customizado",                     color: "#3b82f6" },
  { id: 2,  group: "ExoPlayer", name: "UA Chrome Windows",      desc: "User-Agent: Chrome 124 desktop Windows",                       color: "#3b82f6" },
  { id: 3,  group: "ExoPlayer", name: "UA Chrome Android",      desc: "User-Agent: Chrome 124 Android mobile",                        color: "#3b82f6" },
  { id: 4,  group: "ExoPlayer", name: "UA Safari iOS",          desc: "User-Agent: Safari iOS 17",                                    color: "#3b82f6" },
  { id: 5,  group: "ExoPlayer", name: "Headers Flix2 completo", desc: "UA + Referer nixplay.lat + Origin",                            color: "#3b82f6" },
  { id: 6,  group: "ExoPlayer", name: "CF Worker",              desc: "URL via netplay-stream-proxy.netplay.workers.dev",             color: "#3b82f6" },
  { id: 7,  group: "ExoPlayer", name: "HEAD resolve → direto",  desc: "Faz HEAD redirect:manual p/ pegar Location, toca direto",     color: "#3b82f6" },
  { id: 8,  group: "ExoPlayer", name: "HEAD resolve → CF Worker (se http://)", desc: "Resolve redirect; se HTTP → envolve no CF Worker", color: "#3b82f6" },
  { id: 9,  group: "ExoPlayer", name: "@@ encoded",             desc: "Troca @@ por %40%40 na URL antes de tocar",                   color: "#3b82f6" },
  { id: 10, group: "ExoPlayer", name: "Extensão .m3u8",         desc: "overrideFileExtensionAndroid: m3u8 (trata como HLS)",          color: "#3b82f6" },
  // ── WebView ───────────────────────────────────────────────────────────────
  { id: 11, group: "WebView",   name: "src direto",             desc: "v.src = url; v.load(); v.play() — sem headers",               color: "#8b5cf6" },
  { id: 12, group: "WebView",   name: "CF Worker",              desc: "v.src = CF Worker URL (proxy HTTPS)",                         color: "#8b5cf6" },
  { id: 13, group: "WebView",   name: "@@ encoded",             desc: "v.src = url com @@ → %40%40",                                color: "#8b5cf6" },
  { id: 14, group: "WebView",   name: "fetch + blob (com headers)", desc: "fetch → resp.blob() → createObjectURL → v.src",          color: "#8b5cf6" },
  { id: 15, group: "WebView",   name: "fetch + blob (sem headers)", desc: "fetch sem headers → blob → createObjectURL",              color: "#8b5cf6" },
  { id: 16, group: "WebView",   name: "HLS.js (CDN jsDelivr)",  desc: "Carrega HLS.js do CDN, trata como stream HLS",               color: "#8b5cf6" },
  { id: 17, group: "WebView",   name: "Video.js (CDN)",         desc: "Carrega Video.js do CDN, player HTML5 universal",            color: "#8b5cf6" },
  { id: 18, group: "WebView",   name: "Shaka Player (CDN)",     desc: "Google Shaka — DASH + HLS + proteção DRM",                   color: "#8b5cf6" },
  { id: 19, group: "WebView",   name: "baseUrl vazio",          desc: "WebView sem baseUrl (origem null — sem CORS restriction)",    color: "#8b5cf6" },
  { id: 20, group: "WebView",   name: "HEAD resolve → WebView", desc: "Resolve redirect manual p/ Location, toca no WebView",       color: "#8b5cf6" },
];

function buildWebViewHtml(url: string, stratId: number): string {
  const esc = url.replace(/'/g, "\\'").replace(/`/g, "\\`");
  const hdrs = JSON.stringify(FLIX2_HEADERS);

  const baseScript = `
    var v = document.getElementById('v');
    var rn = window.ReactNativeWebView;
    function send(msg){ try{ rn.postMessage(JSON.stringify(msg)); }catch(e){} }
    var t0 = Date.now();
    v.addEventListener('loadedmetadata', function(){ send({type:'ready', ms: Date.now()-t0, duration: v.duration*1000}); });
    v.addEventListener('error', function(){
      var code = v.error ? v.error.code : -1;
      var msg = v.error ? (v.error.message || 'code:'+code) : 'unknown';
      send({type:'error', message: 'MEDIA_ELEMENT_ERROR: ' + msg});
    });
    v.addEventListener('playing', function(){ send({type:'playing', ms: Date.now()-t0}); });
  `;

  let loadScript = "";

  if (stratId === 11) {
    // direct src
    loadScript = `v.src='${esc}'; v.load(); v.play().catch(function(){});`;
  } else if (stratId === 12) {
    // CF Worker
    const workerUrl = `${CF_WORKER}/?url=${encodeURIComponent(url)}`;
    loadScript = `v.src='${workerUrl}'; v.load(); v.play().catch(function(){});`;
  } else if (stratId === 13) {
    // @@ encoded
    const encoded = url.replace(/@@/g, "%40%40");
    loadScript = `v.src='${encoded}'; v.load(); v.play().catch(function(){});`;
  } else if (stratId === 14) {
    // fetch + blob with headers
    loadScript = `
      fetch('${esc}', { headers: ${hdrs} })
        .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.blob(); })
        .then(function(b){ v.src=URL.createObjectURL(b); v.load(); v.play().catch(function(){}); })
        .catch(function(e){ send({type:'error', message: 'fetch+blob error: '+String(e)}); });
    `;
  } else if (stratId === 15) {
    // fetch + blob NO headers
    loadScript = `
      fetch('${esc}')
        .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.blob(); })
        .then(function(b){ v.src=URL.createObjectURL(b); v.load(); v.play().catch(function(){}); })
        .catch(function(e){ send({type:'error', message: 'fetch+blob(sem hdr) error: '+String(e)}); });
    `;
  } else if (stratId === 16) {
    // HLS.js
    return `<!DOCTYPE html><html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}video{width:100%;height:100%;object-fit:contain}</style>
      <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    </head><body>
      <video id="v" playsinline webkit-playsinline controls autoplay></video>
      <script>
        var v = document.getElementById('v');
        var rn = window.ReactNativeWebView;
        function send(msg){ try{ rn.postMessage(JSON.stringify(msg)); }catch(e){} }
        var t0 = Date.now();
        v.addEventListener('error', function(){ send({type:'error', message:'HLS.js: '+(v.error?v.error.message:'err')}); });
        v.addEventListener('playing', function(){ send({type:'playing', ms:Date.now()-t0}); });
        if(Hls.isSupported()){
          var hls = new Hls();
          hls.loadSource('${esc}');
          hls.attachMedia(v);
          hls.on(Hls.Events.ERROR, function(e,d){ send({type:'error', message:'HLS.js event: '+d.details}); });
        } else if(v.canPlayType('application/vnd.apple.mpegurl')){ v.src='${esc}'; v.play(); }
        else { send({type:'error', message:'HLS.js: não suportado'}); }
      </script>
    </body></html>`;
  } else if (stratId === 17) {
    // Video.js
    return `<!DOCTYPE html><html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <link href="https://vjs.zencdn.net/8.10.0/video-js.css" rel="stylesheet"/>
      <style>*{margin:0;padding:0;background:#000}html,body,#v{width:100%;height:100%}.video-js{width:100%;height:100%}</style>
    </head><body>
      <video id="v" class="video-js" playsinline webkit-playsinline controls autoplay>
        <source src="${esc}" type="video/mp4"/>
      </video>
      <script src="https://vjs.zencdn.net/8.10.0/video.min.js"></script>
      <script>
        var rn = window.ReactNativeWebView;
        function send(msg){ try{ rn.postMessage(JSON.stringify(msg)); }catch(e){} }
        var t0 = Date.now();
        var player = videojs('v',{fluid:false,fill:true,autoplay:true,muted:false});
        player.on('playing', function(){ send({type:'playing', ms:Date.now()-t0}); });
        player.on('error', function(){ send({type:'error', message:'Video.js: '+player.error().message}); });
      </script>
    </body></html>`;
  } else if (stratId === 18) {
    // Shaka Player
    return `<!DOCTYPE html><html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}video{width:100%;height:100%;object-fit:contain}</style>
      <script src="https://ajax.googleapis.com/ajax/libs/shaka-player/4.7.11/shaka-player.compiled.js"></script>
    </head><body>
      <video id="v" playsinline webkit-playsinline autoplay></video>
      <script>
        var rn = window.ReactNativeWebView;
        function send(msg){ try{ rn.postMessage(JSON.stringify(msg)); }catch(e){} }
        var t0 = Date.now();
        shaka.polyfill.installAll();
        var v = document.getElementById('v');
        v.addEventListener('playing', function(){ send({type:'playing', ms:Date.now()-t0}); });
        if(shaka.Player.isBrowserSupported()){
          var player = new shaka.Player(v);
          player.configure({ streaming: { bufferingGoal: 10 } });
          player.load('${esc}').then(function(){ v.play(); })
            .catch(function(e){ send({type:'error', message:'Shaka: '+e.message}); });
        } else { send({type:'error', message:'Shaka: browser não suportado'}); }
      </script>
    </body></html>`;
  } else if (stratId === 19) {
    // no baseUrl (null origin)
    loadScript = `v.src='${esc}'; v.load(); v.play().catch(function(){});`;
  } else if (stratId === 20) {
    // HEAD resolve → WebView (show what the redirect resolved to, then play)
    loadScript = `
      fetch('${esc}', { method:'HEAD', redirect:'manual' })
        .then(function(r){
          var loc = r.headers ? r.headers.get('location') : null;
          var playUrl = loc || '${esc}';
          send({type:'info', message: 'Resolved: '+playUrl.slice(0,80)});
          v.src = playUrl; v.load(); v.play().catch(function(){});
        })
        .catch(function(e){
          v.src='${esc}'; v.load(); v.play().catch(function(){});
        });
    `;
  }

  return `<!DOCTYPE html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no"/>
    <style>*{margin:0;padding:0;box-sizing:border-box;background:#000}html,body{width:100%;height:100%;overflow:hidden}video{width:100%;height:100%;object-fit:contain;display:block}</style>
  </head><body>
    <video id="v" playsinline webkit-playsinline preload="auto"></video>
    <script>(function(){${baseScript}${loadScript}})();</script>
  </body></html>`;
}

interface TestResult {
  status: StrategyStatus;
  message: string;
  ms?: number;
}

export default function LinkTesterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [testUrl, setTestUrl] = useState(DEFAULT_URL);
  const [results, setResults] = useState<Record<number, TestResult>>({});
  const [activeModal, setActiveModal] = useState<Strategy | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [modalPlayerReady, setModalPlayerReady] = useState(false);

  const videoRef = useRef<any>(null);
  const t0 = useRef<number>(0);

  const setResult = useCallback((id: number, result: TestResult) => {
    setResults((prev) => ({ ...prev, [id]: result }));
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
    setResolvedUrl(null);
    setModalPlayerReady(false);
    try { videoRef.current?.pauseAsync?.(); } catch {}
  }, []);

  const resolveRedirectManual = useCallback(async (url: string): Promise<string> => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(url, {
        method: "HEAD",
        headers: FLIX2_HEADERS,
        redirect: "manual",
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const loc = resp.headers.get("location") ?? resp.headers.get("Location");
      if (loc && loc !== url) return loc;
    } catch {}
    // fallback: GET redirect follow
    try {
      const ctrl2 = new AbortController();
      const timer2 = setTimeout(() => ctrl2.abort(), 8000);
      const resp2 = await fetch(url, {
        method: "GET",
        headers: { ...FLIX2_HEADERS, "Range": "bytes=0-0" },
        signal: ctrl2.signal,
      });
      clearTimeout(timer2);
      if (resp2.url && resp2.url !== url) return resp2.url;
    } catch {}
    return url;
  }, []);

  const openStrategy = useCallback(async (strategy: Strategy) => {
    const url = testUrl.trim();
    if (!url) return;

    setResult(strategy.id, { status: "loading", message: "Testando..." });
    setActiveModal(strategy);
    setResolvedUrl(null);
    setModalPlayerReady(false);
    t0.current = Date.now();

    if (strategy.group === "ExoPlayer") {
      // Compute the actual URL to play for expo-av strategies
      let playUrl = url;

      if (strategy.id === 6) {
        playUrl = `${CF_WORKER}/?url=${encodeURIComponent(url)}`;
      } else if (strategy.id === 7) {
        playUrl = await resolveRedirectManual(url);
      } else if (strategy.id === 8) {
        const loc = await resolveRedirectManual(url);
        playUrl = (loc.startsWith("http://")) ? `${CF_WORKER}/?url=${encodeURIComponent(url)}` : loc;
      } else if (strategy.id === 9) {
        playUrl = url.replace(/@@/g, "%40%40");
      } else if (strategy.id === 10) {
        playUrl = url;
      }

      setResolvedUrl(playUrl);
    }
  }, [testUrl, resolveRedirectManual, setResult]);

  const getHeaders = (stratId: number): Record<string, string> | undefined => {
    if (stratId === 1) return undefined;
    if (stratId === 2) return { "User-Agent": UA_CHROME_WIN };
    if (stratId === 3) return { "User-Agent": UA_CHROME_ANDROID };
    if (stratId === 4) return { "User-Agent": UA_SAFARI_IOS };
    return FLIX2_HEADERS;
  };

  const groups = ["ExoPlayer", "WebView"] as const;

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>🧪 Testador de Links</Text>
          <Text style={st.subtitle}>20 estratégias de reprodução</Text>
        </View>
      </View>

      {/* URL Input */}
      <View style={st.urlRow}>
        <TextInput
          style={st.urlInput}
          value={testUrl}
          onChangeText={setTestUrl}
          placeholder="URL para testar..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        <Pressable style={st.clearBtn} onPress={() => setTestUrl(DEFAULT_URL)}>
          <Feather name="rotate-ccw" size={14} color="rgba(255,255,255,0.5)" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={st.list} showsVerticalScrollIndicator={false}>
        {groups.map((group) => (
          <View key={group}>
            <View style={st.groupHeader}>
              <View style={[st.groupDot, { backgroundColor: group === "ExoPlayer" ? "#3b82f6" : "#8b5cf6" }]} />
              <Text style={st.groupLabel}>{group === "ExoPlayer" ? "⚡ ExoPlayer (expo-av)" : "🌐 WebView (HTML5)"}</Text>
            </View>
            {STRATEGIES.filter((s) => s.group === group).map((s) => {
              const res = results[s.id];
              return (
                <Pressable key={s.id} style={st.strategyCard} onPress={() => openStrategy(s)}>
                  <View style={st.strategyLeft}>
                    <View style={st.strategyNum}>
                      <Text style={st.strategyNumText}>{s.id}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.strategyName}>{s.name}</Text>
                      <Text style={st.strategyDesc}>{s.desc}</Text>
                      {res && (
                        <Text style={[st.strategyResult, {
                          color: res.status === "ok" ? "#22c55e" : res.status === "error" ? RED : "#f59e0b",
                        }]}>
                          {res.status === "ok" ? `✓ ${res.message}${res.ms ? ` (${res.ms}ms)` : ""}` :
                           res.status === "error" ? `✗ ${res.message}` : "⏳ Testando..."}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={[st.playBtn, { backgroundColor: res?.status === "ok" ? "rgba(34,197,94,0.2)" : res?.status === "error" ? "rgba(229,9,20,0.2)" : "rgba(255,255,255,0.08)" }]}>
                    {res?.status === "loading" ? (
                      <ActivityIndicator size="small" color="#f59e0b" />
                    ) : (
                      <Feather name="play" size={16} color={res?.status === "ok" ? "#22c55e" : res?.status === "error" ? RED : "#fff"} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Test Modal */}
      <Modal visible={!!activeModal} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            {/* Modal header */}
            <View style={st.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={st.modalTitle}>#{activeModal?.id} — {activeModal?.name}</Text>
                <Text style={st.modalGroup}>{activeModal?.group}</Text>
              </View>
              <Pressable onPress={closeModal} style={st.modalClose}>
                <Feather name="x" size={20} color="#fff" />
              </Pressable>
            </View>

            {/* Resolved URL */}
            {activeModal?.group === "ExoPlayer" && resolvedUrl && (
              <Text style={st.resolvedUrl} numberOfLines={2}>
                URL: {resolvedUrl}
              </Text>
            )}

            {/* Player area */}
            <View style={st.playerArea}>
              {activeModal?.group === "ExoPlayer" && resolvedUrl && Video ? (
                <Video
                  ref={videoRef}
                  source={{
                    uri: resolvedUrl,
                    headers: getHeaders(activeModal.id),
                    ...(activeModal.id === 10 ? { overrideFileExtensionAndroid: "m3u8" } : { overrideFileExtensionAndroid: "mp4" }),
                  } as any}
                  style={st.videoPlayer}
                  resizeMode={ResizeMode?.CONTAIN ?? "contain"}
                  shouldPlay
                  isLooping={false}
                  onLoad={(status: any) => {
                    const ms = Date.now() - t0.current;
                    setModalPlayerReady(true);
                    setResult(activeModal!.id, { status: "ok", message: `Funcionou! ${Math.round((status?.durationMillis ?? 0) / 1000)}s de vídeo`, ms });
                  }}
                  onPlaybackStatusUpdate={(status: any) => {
                    if (status?.isLoaded && !modalPlayerReady) {
                      setModalPlayerReady(true);
                    }
                  }}
                  onError={(err: any) => {
                    const msg = typeof err === "string" ? err : (err?.message ?? JSON.stringify(err));
                    setResult(activeModal!.id, { status: "error", message: msg });
                  }}
                />
              ) : activeModal?.group === "ExoPlayer" && !resolvedUrl ? (
                <View style={st.playerLoading}>
                  <ActivityIndicator size="large" color={RED} />
                  <Text style={st.playerLoadingText}>Resolvendo URL...</Text>
                </View>
              ) : activeModal?.group === "WebView" && WebView ? (
                <WebView
                  source={
                    (activeModal.id === 16 || activeModal.id === 17 || activeModal.id === 18)
                      ? { html: buildWebViewHtml(testUrl, activeModal.id) }
                      : activeModal.id === 19
                        ? { html: buildWebViewHtml(testUrl, 11) }  // same html but no baseUrl
                        : {
                            html: buildWebViewHtml(testUrl, activeModal.id),
                            baseUrl: activeModal.id !== 19 ? "https://nixplay.lat" : undefined,
                          }
                  }
                  style={st.videoPlayer}
                  mediaPlaybackRequiresUserAction={false}
                  allowsInlineMediaPlayback
                  javaScriptEnabled
                  domStorageEnabled
                  originWhitelist={["*"]}
                  mixedContentMode="always"
                  allowsProtectedMedia
                  userAgent={UA_CHROME_WIN}
                  onMessage={(e: any) => {
                    try {
                      const msg = JSON.parse(e.nativeEvent.data);
                      if (msg.type === "ready" || msg.type === "playing") {
                        const ms = msg.ms ?? (Date.now() - t0.current);
                        setModalPlayerReady(true);
                        setResult(activeModal!.id, { status: "ok", message: `Funcionou! ${ms}ms para começar`, ms });
                      } else if (msg.type === "error") {
                        setResult(activeModal!.id, { status: "error", message: msg.message });
                      } else if (msg.type === "info") {
                        setResult(activeModal!.id, { status: "loading", message: msg.message });
                      }
                    } catch {}
                  }}
                />
              ) : (
                <View style={st.playerLoading}>
                  <ActivityIndicator size="large" color={RED} />
                  <Text style={st.playerLoadingText}>Iniciando player...</Text>
                </View>
              )}
            </View>

            {/* Status */}
            {activeModal && results[activeModal.id] && (
              <View style={[st.statusBar, {
                backgroundColor: results[activeModal.id].status === "ok"
                  ? "rgba(34,197,94,0.15)"
                  : results[activeModal.id].status === "error"
                    ? "rgba(229,9,20,0.15)"
                    : "rgba(245,158,11,0.15)",
              }]}>
                <Text style={[st.statusText, {
                  color: results[activeModal.id].status === "ok" ? "#22c55e"
                    : results[activeModal.id].status === "error" ? RED : "#f59e0b",
                }]} numberOfLines={3}>
                  {results[activeModal.id].status === "ok" ? "✅ " :
                   results[activeModal.id].status === "error" ? "❌ " : "⏳ "}
                  {results[activeModal.id].message}
                </Text>
              </View>
            )}

            <Pressable style={st.closeBtn} onPress={closeModal}>
              <Text style={st.closeBtnText}>Fechar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0a0a" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  backBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center", marginRight: 12 },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  subtitle: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 1 },
  urlRow: { flexDirection: "row", alignItems: "flex-start", margin: 12, backgroundColor: "#1a1a1a", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", padding: 10 },
  urlInput: { flex: 1, color: "#fff", fontSize: 11, fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace", lineHeight: 16 },
  clearBtn: { padding: 4, marginLeft: 4 },
  list: { paddingHorizontal: 12 },
  groupHeader: { flexDirection: "row", alignItems: "center", marginTop: 16, marginBottom: 8 },
  groupDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  groupLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  strategyCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#141414", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 12, marginBottom: 6 },
  strategyLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  strategyNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.08)", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  strategyNumText: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "700" },
  strategyName: { color: "#fff", fontSize: 13, fontWeight: "700", marginBottom: 2 },
  strategyDesc: { color: "rgba(255,255,255,0.45)", fontSize: 11, lineHeight: 15 },
  strategyResult: { fontSize: 11, fontWeight: "600", marginTop: 4 },
  playBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center", flexShrink: 0, marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "flex-end" },
  modalBox: { backgroundColor: "#111", borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  modalTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  modalGroup: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 },
  modalClose: { width: 32, height: 32, justifyContent: "center", alignItems: "center" },
  resolvedUrl: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace", paddingHorizontal: 16, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.04)" },
  playerArea: { height: 220, backgroundColor: "#000" },
  videoPlayer: { flex: 1 },
  playerLoading: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  playerLoadingText: { color: "rgba(255,255,255,0.5)", fontSize: 13 },
  statusBar: { padding: 12, marginHorizontal: 12, marginTop: 8, borderRadius: 10 },
  statusText: { fontSize: 12, fontWeight: "600", lineHeight: 18 },
  closeBtn: { margin: 12, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, padding: 14, alignItems: "center" },
  closeBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
