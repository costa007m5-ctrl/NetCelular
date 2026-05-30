import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";

const { width: W, height: H } = Dimensions.get("window");

let WebView: any = null;
try {
  WebView = require("react-native-webview").WebView;
} catch {
  WebView = null;
}

// JavaScript injected into the WebView to block ads
const AD_BLOCKER_JS = `
(function() {
  // Block popup windows
  window.open = function() { return null; };
  
  // Block all navigation away from the player
  var _pushState = history.pushState;
  history.pushState = function() { return null; };
  
  // Remove ad overlays, banners and redirect links
  function removeAds() {
    var adSelectors = [
      'a[target="_blank"]',
      'a[onclick*="window.open"]',
      '[id*="google_ads"]',
      '[id*="aswift"]',
      '[class*="overlay-ad"]',
      '[class*="ad-container"]',
      '[id*="ad-container"]',
      'iframe[src*="googlesyndication"]',
      'iframe[src*="doubleclick"]',
      'iframe[src*="ads"]',
      'div[style*="z-index: 999"]',
      'div[style*="z-index:999"]',
      '#preroll-ads',
      '.preroll',
    ];
    adSelectors.forEach(function(sel) {
      try {
        document.querySelectorAll(sel).forEach(function(el) {
          var tag = el.tagName.toLowerCase();
          if (tag === 'a') {
            el.removeAttribute('href');
            el.removeAttribute('onclick');
            el.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); }, true);
          } else if (tag === 'iframe' && !el.src.includes('redeflix')) {
            el.remove();
          }
        });
      } catch(e) {}
    });
    
    // Remove elements that look like ad overlays (large z-index, no video inside)
    try {
      document.querySelectorAll('div,section').forEach(function(el) {
        var style = window.getComputedStyle(el);
        var zIndex = parseInt(style.zIndex) || 0;
        if (zIndex > 100 && !el.querySelector('video') && !el.querySelector('iframe[src*="redeflix"]')) {
          var rect = el.getBoundingClientRect();
          if (rect.width > window.innerWidth * 0.5 && rect.height > 80) {
            el.style.display = 'none';
          }
        }
      });
    } catch(e) {}
  }
  
  // Run immediately and on intervals
  removeAds();
  setInterval(removeAds, 1500);
  
  // Also run after DOM changes
  try {
    var obs = new MutationObserver(removeAds);
    obs.observe(document.body, { childList: true, subtree: true });
  } catch(e) {}
})();
true;
`;

export default function PlayerScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    type: string;
    id: string;
    season?: string;
    episode?: string;
    title?: string;
  }>();

  const type = (params.type ?? "movie") as "movie" | "tv";
  const id = Number(params.id ?? 0);
  const season = Number(params.season ?? 1);
  const episode = Number(params.episode ?? 1);
  const title = params.title ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const playerUrl = api.redeflix.url(type, id, season, episode);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (!id) {
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
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.iframeWrap}>
          <iframe
            src={playerUrl}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              backgroundColor: "#000",
            }}
            allowFullScreen
            allow="autoplay; fullscreen; encrypted-media"
            title={title}
          />
        </View>
        {type === "tv" && (
          <View style={[styles.episodeBar, { backgroundColor: "rgba(0,0,0,0.85)" }]}>
            <Text style={[styles.episodeText, { color: colors.mutedForeground }]}>
              Temporada {season} — Episódio {episode}
            </Text>
            <View style={styles.episodeActions}>
              <Pressable
                style={[styles.epBtn, { borderColor: colors.border }]}
                onPress={() =>
                  router.replace({
                    pathname: "/player",
                    params: { type, id: String(id), season: String(season), episode: String(Math.max(1, episode - 1)), title },
                  })
                }
              >
                <Feather name="chevron-left" size={16} color={colors.foreground} />
                <Text style={[styles.epBtnText, { color: colors.foreground }]}>Anterior</Text>
              </Pressable>
              <Pressable
                style={[styles.epBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() =>
                  router.replace({
                    pathname: "/player",
                    params: { type, id: String(id), season: String(season), episode: String(episode + 1), title },
                  })
                }
              >
                <Text style={[styles.epBtnText, { color: "#fff" }]}>Próximo</Text>
                <Feather name="chevron-right" size={16} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  }

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
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            WebView indisponível
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <StatusBar style="light" hidden />

      <WebView
        source={{ uri: playerUrl }}
        style={styles.webview}
        onLoadStart={() => { setLoading(true); setError(false); }}
        onLoadEnd={() => setLoading(false)}
        onError={() => { setError(true); setLoading(false); }}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
        injectedJavaScript={AD_BLOCKER_JS}
        injectedJavaScriptBeforeContentLoaded={`
          (function(){
            window.open = function(){ return null; };
          })(); true;
        `}
        onShouldStartLoadWithRequest={(req) => {
          // Block navigations away from the redeflix domain
          if (!req.url.includes("redeflix") && req.navigationType === "click") {
            return false;
          }
          return true;
        }}
      />

      {loading && !error && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Carregando player...
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.loaderOverlay}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            Não foi possível carregar o player
          </Text>
          <Text style={[styles.errorUrl, { color: colors.border }]}>{playerUrl}</Text>
        </View>
      )}

      <View style={[styles.playerHeader, { paddingTop: topPad + 4 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color="rgba(255,255,255,0.9)" />
        </Pressable>
        {title ? (
          <Text style={styles.playerTitle} numberOfLines={1}>{title}</Text>
        ) : null}
        <View style={{ width: 40 }} />
      </View>

      {type === "tv" && (
        <View style={[styles.episodeBar, { backgroundColor: "rgba(0,0,0,0.85)", bottom: 0, position: "absolute", left: 0, right: 0 }]}>
          <Text style={[styles.episodeText, { color: colors.mutedForeground }]}>
            T{season} · Ep {episode}
          </Text>
          <View style={styles.episodeActions}>
            <Pressable
              style={[styles.epBtn, { borderColor: colors.border }]}
              onPress={() =>
                router.replace({
                  pathname: "/player",
                  params: { type, id: String(id), season: String(season), episode: String(Math.max(1, episode - 1)), title },
                })
              }
            >
              <Feather name="chevron-left" size={14} color={colors.foreground} />
              <Text style={[styles.epBtnText, { color: colors.foreground }]}>Anterior</Text>
            </Pressable>
            <Pressable
              style={[styles.epBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() =>
                router.replace({
                  pathname: "/player",
                  params: { type, id: String(id), season: String(season), episode: String(episode + 1), title },
                })
              }
            >
              <Text style={[styles.epBtnText, { color: "#fff" }]}>Próximo</Text>
              <Feather name="chevron-right" size={14} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: "#000" },
  playerHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
    zIndex: 10,
    backgroundColor: "transparent",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  playerTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    marginHorizontal: 8,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  iframeWrap: { flex: 1, backgroundColor: "#000" },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    gap: 14,
  },
  loadingText: { fontSize: 14, fontWeight: "500" },
  errorText: { fontSize: 15, fontWeight: "500", textAlign: "center" },
  errorUrl: { fontSize: 11, textAlign: "center", paddingHorizontal: 24 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  backBtn: { position: "absolute", left: 12, zIndex: 10 },
  episodeBar: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  episodeText: { fontSize: 13, fontWeight: "500" },
  episodeActions: { flexDirection: "row", gap: 10 },
  epBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  epBtnText: { fontSize: 13, fontWeight: "600" },
});
