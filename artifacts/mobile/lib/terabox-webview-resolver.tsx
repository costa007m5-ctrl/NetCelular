import React, { useRef, useState, useCallback } from "react";
import { View, ActivityIndicator, Text, Pressable } from "react-native";
import { WebView } from "react-native-webview";

const RESOLVE_TIMEOUT_MS = 45_000;

const INJECT_JS = `
(function() {
  if (window.__tbInjected) return;
  window.__tbInjected = true;

  function post(url) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'videoUrl', url: url })); } catch(e) {}
  }

  // Only accept URLs that look like actual video streams (absolute, CDN-like, not API endpoints)
  function isVideoStreamUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (!url.startsWith('http')) return false;  // must be absolute
    var l = url.toLowerCase();
    // Must be a video file extension or known streaming pattern
    if (l.match(/\\.(m3u8|mp4|mkv|mov|ts|flv|webm)(\\?|$)/)) return true;
    // Terabox CDN download domains: d.terabox.com, d5.terabox.com, d.1024tera.com, etc.
    if (l.match(/https?:\\/\\/d[0-9]*\\.(terabox|1024tera|teraboxapp|baidupan)\\.com\\/file\\//)) return true;
    // fast_dlink pattern (download redirect URL from Terabox)
    if (l.indexOf('fast_dlink') > -1 && l.startsWith('http')) return true;
    // PCS (Baidu Personal Cloud Storage) download URLs
    if (l.match(/https?:\\/\\/[^/]*(pcs\\.baidu|bcs\\.dubox)\\.com\\//)) return true;
    return false;
  }

  // 1. Intercept XHR requests — only capture video stream URLs
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (isVideoStreamUrl(url)) post(url);
    return origOpen.apply(this, arguments);
  };

  // 2. Intercept fetch — only capture video stream URLs
  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    if (isVideoStreamUrl(url)) post(url);
    return origFetch.apply(this, arguments);
  };

  // 3. Watch <video> elements — only report absolute CDN URLs, not Terabox API/page URLs
  function isPlayableVideoSrc(src) {
    if (!src || !src.startsWith('http')) return false;
    var l = src.toLowerCase();
    // Reject Terabox web/API pages
    if (l.indexOf('/wap/') > -1) return false;
    if (l.indexOf('/share/list') > -1) return false;
    if (l.indexOf('/share/filelist') > -1) return false;
    if (l.indexOf('/api/') > -1 && !l.match(/\\.(m3u8|mp4)/)) return false;
    // Accept anything with a video extension
    if (l.match(/\\.(m3u8|mp4|mkv|mov|ts|flv|webm)(\\?|$)/)) return true;
    // Accept CDN domains
    if (l.match(/https?:\\/\\/d[0-9]*\\.(terabox|1024tera)\\.com\\//)) return true;
    if (l.match(/https?:\\/\\/[^/]*(pcs\\.baidu|bcs\\.dubox)\\.com\\//)) return true;
    // Accept blob: and data: for video (rare but possible)
    if (l.startsWith('blob:') || l.startsWith('data:video')) return true;
    return false;
  }

  function checkVideos() {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      var src = videos[i].src || videos[i].currentSrc || '';
      if (isPlayableVideoSrc(src)) { post(src); return; }
      var sources = videos[i].querySelectorAll('source');
      for (var j = 0; j < sources.length; j++) {
        var s = sources[j].src || '';
        if (isPlayableVideoSrc(s)) { post(s); return; }
      }
    }
  }

  setInterval(checkVideos, 600);

  var observer = new MutationObserver(checkVideos);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

  // 4. Auto-click play buttons — Terabox WAP Vue.js specific classes + generic
  function tryClick() {
    var selectors = [
      '.preview-btn', '.preview-button', '[class*="preview-btn"]',
      '.video-play-btn', '[class*="video-play"]',
      '.u-icon-play', '[class*="u-icon-play"]',
      '.play-icon', '[class*="play-icon"]',
      '.btn-play', '[class*="btn-play"]',
      '[class*="play-btn"]', '[class*="playBtn"]', '[id*="play"]',
      '.fa-play', '[data-action="play"]',
      'button[class*="play"]', 'a[class*="play"]',
      '.cover-play', '[class*="cover-play"]',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var els = document.querySelectorAll(selectors[i]);
      if (els.length > 0) {
        for (var j = 0; j < els.length; j++) {
          try { els[j].click(); } catch(e) {}
        }
        return;
      }
    }
  }

  setTimeout(function() { tryClick(); }, 2000);
  setTimeout(function() { tryClick(); }, 4500);
  setTimeout(function() { tryClick(); }, 8000);

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
  const [status, setStatus] = useState<"loading" | "waiting">("loading");
  const resolvedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Memory: resolver must use 1024tera.com, not www.terabox.com
  const normalizedUrl = teraboxUrl
    .replace(/^https?:\/\/www\.terabox\.com/, "https://1024tera.com")
    .replace(/^https?:\/\/(teraboxapp|terasharelink|4funbox|momerybox)\.com/, "https://1024tera.com");

  const startTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (!resolvedRef.current) onError("Tempo esgotado. Tente abrir o vídeo manualmente no Terabox.");
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
      l.match(/https?:\/\/d[0-9]*\.(terabox|1024tera|baidupan|pcs\.baidu)\.com\/file\//);
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
      {/* Visible WebView — user can see & tap Play if auto-click fails */}
      <View style={{ position: "absolute", top: 44, left: 0, right: 0, bottom: 0, opacity: 0.92 }}>
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

      {/* Status bar at top */}
      <View style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 44,
        backgroundColor: "#0a0a0a",
        paddingHorizontal: 12,
        flexDirection: "row", alignItems: "center", gap: 8,
        zIndex: 1000,
      }}>
        <ActivityIndicator size="small" color="#06b6d4" />
        <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600", flex: 1 }} numberOfLines={1}>
          {status === "loading" ? "Carregando TeraBox…" : "Toque em ▶ Play para reproduzir"}
        </Text>
        {onCancel && (
          <Pressable
            onPress={onCancel}
            style={{ paddingVertical: 5, paddingHorizontal: 10,
              backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 6 }}
          >
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>Cancelar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
