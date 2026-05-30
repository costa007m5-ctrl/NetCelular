import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { api, TMDB_IMG } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";

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

// JavaScript injected into the WebView to block ads
const AD_BLOCKER_JS = `
(function() {
  window.open = function() { return null; };
  var _pushState = history.pushState;
  history.pushState = function() { return null; };
  
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
  
  removeAds();
  setInterval(removeAds, 1500);
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
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    type: string;
    id: string;
    season?: string;
    episode?: string;
    title?: string;
    posterPath?: string;
    backdropPath?: string;
  }>();

  const type = (params.type ?? "movie") as "movie" | "tv";
  const id = Number(params.id ?? 0);
  const season = Number(params.season ?? 1);
  const episode = Number(params.episode ?? 1);
  const title = params.title ?? "";
  const posterPath = params.posterPath ?? "";
  const backdropPath = params.backdropPath ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [progressSaved, setProgressSaved] = useState(false);

  // Lock to landscape on native, unlock on unmount
  useEffect(() => {
    if (Platform.OS === "web" || !ScreenOrientation) return;
    try {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } catch {}
    return () => {
      try {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      } catch {}
    };
  }, []);

  const saveProgress = async () => {
    if (!user?.id || !id || !isSupabaseConfigured || progressSaved) return;
    try {
      setProgressSaved(true);
      await db.progress.upsert({
        user_id: user.id,
        tmdb_id: id,
        type,
        title,
        poster_path: TMDB_IMG(posterPath || null, "w500") ?? posterPath,
        backdrop_path: TMDB_IMG(backdropPath || null, "w1280") ?? undefined,
        progress: 0.05,
        ...(type === "tv" ? { season, episode } : {}),
      });
    } catch (e) {
      setProgressSaved(false);
    }
  };

  useEffect(() => {
    if (Platform.OS === "web" && id) {
      const timer = setTimeout(() => saveProgress(), 3000);
      return () => clearTimeout(timer);
    }
  }, [id, type]);

  const playerUrl = api.redeflix.url(type, id, season, episode);
  const topPad = Platform.OS === "web" ? 0 : insets.top;

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
            style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#000" }}
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
        onLoadEnd={() => { setLoading(false); saveProgress(); }}
        onError={() => { setError(true); setLoading(false); }}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
        injectedJavaScript={AD_BLOCKER_JS}
        injectedJavaScriptBeforeContentLoaded={`(function(){ window.open = function(){ return null; }; })(); true;`}
        onShouldStartLoadWithRequest={(req) => {
          if (!req.url.includes("redeflix") && req.navigationType === "click") return false;
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
          <Feather name="clock" size={48} color={colors.primary} />
          <Text style={[styles.unavailTitle, { color: colors.foreground }]}>
            Conteúdo Indisponível
          </Text>
          <Text style={[styles.unavailDesc, { color: colors.mutedForeground }]}>
            Este conteúdo ainda não está disponível no catálogo. Estamos trabalhando para trazê-lo em breve!
          </Text>
          <TouchableOpacity
            style={[styles.indicateBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Feather name="heart" size={16} color="#fff" />
            <Text style={styles.indicateBtnText}>Indicar este conteúdo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.backButton, { borderColor: colors.border }]}
            onPress={() => router.back()}
          >
            <Feather name="arrow-left" size={16} color={colors.foreground} />
            <Text style={[styles.backButtonText, { color: colors.foreground }]}>Voltar</Text>
          </TouchableOpacity>
        </View>
      )}

      {!error && (
        <View style={[styles.playerHeader, { paddingTop: topPad + 4 }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color="rgba(255,255,255,0.9)" />
          </Pressable>
          {title ? (
            <Text style={styles.playerTitle} numberOfLines={1}>{title}</Text>
          ) : null}
          <View style={{ width: 40 }} />
        </View>
      )}

      {type === "tv" && !error && (
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
    gap: 16,
    paddingHorizontal: 32,
  },
  loadingText: { fontSize: 14, fontWeight: "500" },
  errorText: { fontSize: 15, fontWeight: "500", textAlign: "center" },
  unavailTitle: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  unavailDesc: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  indicateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  indicateBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  backButtonText: { fontSize: 14, fontWeight: "600" },
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
