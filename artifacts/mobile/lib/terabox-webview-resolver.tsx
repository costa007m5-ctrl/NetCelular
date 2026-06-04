import React, { useRef, useState, useCallback } from "react";
import { View, ActivityIndicator, Text, Pressable } from "react-native";
import { WebView } from "react-native-webview";

const RESOLVE_TIMEOUT_MS = 30_000;

const INJECT_JS = `
(function() {
  if (window.__tbInjected) return;
  window.__tbInjected = true;

  function post(url) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'videoUrl', url: url })); } catch(e) {}
  }

  // 1. Intercept XHR
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (typeof url === 'string') {
      var lurl = url.toLowerCase();
      if (lurl.indexOf('fast_dlink') > -1 || lurl.indexOf('bdstoken') > -1 ||
          lurl.match(/\\.(m3u8|mp4|mkv|mov|ts)(\\?|$)/)) {
        post(url);
      }
    }
    return origOpen.apply(this, arguments);
  };

  // 2. Intercept fetch
  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    if (url) {
      var lurl = url.toLowerCase();
      if (lurl.match(/\\.(m3u8|mp4|mkv|mov|ts)(\\?|$)/) || lurl.indexOf('fast_dlink') > -1) {
        post(url);
      }
    }
    return origFetch.apply(this, arguments);
  };

  // 3. Watch video elements
  function checkVideos() {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      var src = videos[i].src || videos[i].currentSrc || '';
      if (src && src.startsWith('http') && src.indexOf('terabox') < 0 && src.indexOf('1024') < 0) {
        post(src); return;
      }
      var sources = videos[i].querySelectorAll('source');
      for (var j = 0; j < sources.length; j++) {
        var s = sources[j].src || '';
        if (s && s.startsWith('http') && s.indexOf('terabox') < 0) { post(s); return; }
      }
    }
  }

  setInterval(checkVideos, 800);

  var observer = new MutationObserver(checkVideos);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

  // 4. Auto-click play buttons after 2s
  setTimeout(function() {
    var btns = document.querySelectorAll('[class*="play-btn"], [class*="playBtn"], [id*="play"], .fa-play, [data-action="play"]');
    if (btns.length) btns[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, 2000);

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

  const normalizedUrl = teraboxUrl.replace(
    /^https?:\/\/(1024terabox|1024tera|teraboxapp|terasharelink|4funbox|momerybox)\.com/,
    "https://www.terabox.com"
  );

  const startTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (!resolvedRef.current) onError("Tempo esgotado ao resolver TeraBox");
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
    const lurl = url.toLowerCase();
    if (lurl.match(/\.(m3u8|mp4|mkv|mov|ts)(\?|$)/) || lurl.includes("fast_dlink")) {
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
      justifyContent: "center", alignItems: "center",
    }}>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.01 }}>
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
          userAgent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36"
        />
      </View>

      <ActivityIndicator size="large" color="#e50914" />
      <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, marginTop: 16, fontWeight: "600" }}>
        Resolvendo TeraBox…
      </Text>
      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 6, textAlign: "center", paddingHorizontal: 32 }}>
        {status === "loading" ? "Carregando página…" : "Aguardando URL do vídeo…"}
      </Text>

      {onCancel && (
        <Pressable
          onPress={onCancel}
          style={{ marginTop: 24, paddingVertical: 10, paddingHorizontal: 24,
            backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 20 }}
        >
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>Cancelar</Text>
        </Pressable>
      )}
    </View>
  );
}
