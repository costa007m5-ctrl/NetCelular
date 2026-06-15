import React, { useRef, useState, useCallback } from "react";
import { View, ActivityIndicator, Text, Pressable, Platform } from "react-native";
import { WebView } from "react-native-webview";

const RESOLVE_TIMEOUT_MS = 45_000;

const INJECT_JS = `
(function() {
  if (window.__tbInjected) return;
  window.__tbInjected = true;

  function post(url) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'videoUrl', url: url })); } catch(e) {}
  }

  function isVideoUrl(url) {
    if (!url || typeof url !== 'string') return false;
    var l = url.toLowerCase();
    // Direct video file extensions
    if (l.match(/\\.(m3u8|mp4|mkv|mov|ts|flv|webm)(\\?|$)/)) return true;
    // Terabox streaming API patterns
    if (l.indexOf('fast_dlink') > -1) return true;
    if (l.indexOf('fast_stream_url') > -1) return true;
    if (l.indexOf('/api/streaming') > -1) return true;
    if (l.indexOf('bdstoken') > -1 && l.indexOf('download') > -1) return true;
    // CDN download patterns (d.terabox.com, d.1024tera.com, etc.)
    if (l.match(/https?:\\/\\/d[0-9]*\\.(terabox|1024tera|teraboxapp|baidupan|pcs\\.baidu)\\.com\\//)) return true;
    return false;
  }

  // 1. Intercept XHR
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (isVideoUrl(url)) post(url);
    return origOpen.apply(this, arguments);
  };

  // 2. Intercept fetch
  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    if (isVideoUrl(url)) post(url);
    return origFetch.apply(this, arguments);
  };

  // 3. Watch video elements — accept ANY http URL including terabox CDNs
  function checkVideos() {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      var src = videos[i].src || videos[i].currentSrc || '';
      if (src && src.startsWith('http')) { post(src); return; }
      var sources = videos[i].querySelectorAll('source');
      for (var j = 0; j < sources.length; j++) {
        var s = sources[j].src || '';
        if (s && s.startsWith('http')) { post(s); return; }
      }
    }
  }

  setInterval(checkVideos, 600);

  var observer = new MutationObserver(checkVideos);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

  // 4. Intercept XHR responses that contain streaming URLs in JSON
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
    var xhr = this;
    var origOnLoad = xhr.onload;
    xhr.addEventListener('load', function() {
      try {
        var resp = JSON.parse(xhr.responseText || '{}');
        var streamUrl = resp.fast_stream_url || resp.stream_url || resp.dlink || resp.fast_dlink;
        if (streamUrl && streamUrl.startsWith('http')) post(streamUrl);
      } catch(e) {}
    });
    return origSend.apply(this, arguments);
  };

  // 5. Auto-click play buttons - Terabox WAP specific selectors + generic
  function tryClick() {
    var selectors = [
      // Terabox WAP specific
      '.preview-btn', '.preview-button', '[class*="preview-btn"]',
      '.video-play-btn', '[class*="video-play"]',
      '.u-icon-play', '[class*="u-icon-play"]',
      '.play-icon', '[class*="play-icon"]',
      '.btn-play', '[class*="btn-play"]',
      // Generic
      '[class*="play-btn"]', '[class*="playBtn"]', '[id*="play"]',
      '.fa-play', '[data-action="play"]',
      // Any large clickable element with play in it
      'button[class*="play"]', 'a[class*="play"]',
      // Cover/thumbnail that triggers video
      '.cover-play', '[class*="cover-play"]', '.file-play',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var els = document.querySelectorAll(selectors[i]);
      if (els.length > 0) {
        for (var j = 0; j < els.length; j++) {
          try { els[j].click(); } catch(e) {}
        }
        return true;
      }
    }
    return false;
  }

  setTimeout(function() { tryClick(); }, 2000);
  setTimeout(function() { tryClick(); }, 4000);
  setTimeout(function() { tryClick(); }, 7000);

  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'loaded' }));
})();
true;
`;

interface Props {
  teraboxUrl: string;
  visible: boolean;
  onResolved: (url: string) => void;
  onError: (msg: string) => void;
  onCancel?: () => void;
}

export function TeraboxWebViewResolver({ teraboxUrl, visible, onResolved, onError, onCancel }: Props) {
  const [status, setStatus] = useState<"loading" | "waiting" | "cf_challenge">("loading");
  const resolvedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Memory note: resolver must target 1024tera.com (not www.terabox.com)
  // 1024tera.com doesn't block mobile IPs the same way www.terabox.com might
  const normalizedUrl = teraboxUrl
    .replace(/^https?:\/\/www\.terabox\.com/, "https://1024tera.com")
    .replace(/^https?:\/\/(teraboxapp|terasharelink|4funbox|momerybox)\.com/, "https://1024tera.com");

  const startTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (!resolvedRef.current) onError("Tempo esgotado. Tente abrir o vídeo manualmente.");
    }, RESOLVE_TIMEOUT_MS);
  }, [onError]);

  const handleMessage = useCallback((event: any) => {
    if (resolvedRef.current) return;
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "loaded") {
        setStatus("waiting");
        startTimeout();
      } else if (msg.type === "videoUrl" && msg.url) {
        resolvedRef.current = true;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        onResolved(msg.url);
      }
    } catch {}
  }, [onResolved, startTimeout]);

  const handleNavChange = useCallback((request: any) => {
    if (resolvedRef.current) return true;
    const url: string = request.url ?? "";
    const l = url.toLowerCase();
    const isVideo =
      l.match(/\.(m3u8|mp4|mkv|mov|ts|flv|webm)(\?|$)/) ||
      l.includes("fast_dlink") ||
      l.includes("fast_stream_url") ||
      l.match(/https?:\/\/d[0-9]*\.(terabox|1024tera|baidupan|pcs\.baidu)\.com\//);
    if (isVideo) {
      resolvedRef.current = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      onResolved(url);
      return false;
    }
    return true;
  }, [onResolved]);

  const handleError = useCallback(() => {
    if (!resolvedRef.current) onError("Erro ao carregar página TeraBox");
  }, [onError]);

  const handleHttpError = useCallback((e: any) => {
    const code = e?.nativeEvent?.statusCode ?? 0;
    if (code >= 500 && !resolvedRef.current) onError(`TeraBox HTTP ${code}`);
  }, [onError]);

  if (!visible) return null;

  return (
    <View style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "#000", zIndex: 999,
    }}>
      {/* Semi-visible WebView — user can see and interact with the Terabox page if auto-click fails */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.85 }}>
        <WebView
          source={{ uri: normalizedUrl }}
          injectedJavaScript={INJECT_JS}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={handleNavChange}
          onError={handleError}
          onHttpError={handleHttpError}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          mixedContentMode="always"
          userAgent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36"
        />
      </View>

      {/* Overlay status bar at the top */}
      <View style={{
        position: "absolute", top: 0, left: 0, right: 0,
        backgroundColor: "rgba(0,0,0,0.75)",
        paddingVertical: 10, paddingHorizontal: 16,
        flexDirection: "row", alignItems: "center", gap: 10,
        zIndex: 1000,
      }}>
        <ActivityIndicator size="small" color="#06b6d4" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
            {status === "loading" ? "Carregando TeraBox…" : "Aguardando vídeo — toque em Play"}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginTop: 2 }}>
            {normalizedUrl.substring(0, 60)}…
          </Text>
        </View>
        {onCancel && (
          <Pressable
            onPress={onCancel}
            style={{ paddingVertical: 6, paddingHorizontal: 12,
              backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 8 }}
          >
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>Cancelar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
