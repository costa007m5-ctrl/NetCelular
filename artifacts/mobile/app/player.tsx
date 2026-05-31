import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
import type { TmdbEpisode, TmdbSeason } from "@/lib/api";

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

const AD_BLOCKER_JS = `
(function() {
  window.open = function() { return null; };
  history.pushState = function() { return null; };

  function isAllowedSrc(src) {
    return !src || src.includes('redeflix') || src.includes('embedtv') || src.includes('faz-o-eli');
  }

  function removeAds() {
    try {
      document.querySelectorAll('iframe').forEach(function(el) {
        if (!isAllowedSrc(el.src)) el.remove();
      });
    } catch(e) {}

    try {
      document.querySelectorAll('a[target="_blank"],a[onclick*="open"]').forEach(function(el) {
        el.removeAttribute('href');
        el.removeAttribute('onclick');
        el.removeAttribute('target');
        el.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); }, true);
      });
    } catch(e) {}

    var adSelectors = [
      '[id*="google_ads"],[id*="aswift"],[class*="overlay-ad"]',
      '[class*="ad-container"],[id*="ad-container"]',
      'iframe[src*="googlesyndication"],iframe[src*="doubleclick"]',
      '#preroll-ads,.preroll,[class*="preroll"]',
      '[class*="popup"],[id*="popup"]',
    ];
    adSelectors.forEach(function(sel) {
      try { document.querySelectorAll(sel).forEach(function(el) { el.remove(); }); } catch(e) {}
    });

    try {
      document.querySelectorAll('div,section,aside').forEach(function(el) {
        var z = parseInt(window.getComputedStyle(el).zIndex) || 0;
        if (z > 100) {
          var hasVideo = el.querySelector('video');
          var hasPlayer = el.querySelector('iframe[src*="embedtv"],iframe[src*="redeflix"]');
          if (!hasVideo && !hasPlayer) {
            var r = el.getBoundingClientRect();
            if (r.width > window.innerWidth * 0.45 && r.height > 60) {
              el.style.display = 'none';
            }
          }
        }
      });
    } catch(e) {}
  }

  removeAds();
  setInterval(removeAds, 1000);
  try { new MutationObserver(removeAds).observe(document.body, { childList: true, subtree: true }); } catch(e) {}
})();
true;
`;

const AUTO_HIDE_MS = 5000;

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
    streamUrl?: string;
    isLive?: string;
    totalSeasons?: string;
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [progressSaved, setProgressSaved] = useState(false);

  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showPicker, setShowPicker] = useState(false);
  const [pickerSeason, setPickerSeason] = useState(season);
  const [totalSeasons, setTotalSeasons] = useState(Number(params.totalSeasons ?? 1));
  const [pickerEpisodes, setPickerEpisodes] = useState<TmdbEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

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
    if (Platform.OS !== "web" && !error) {
      startHideTimer();
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

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
      if (data.number_of_seasons && data.number_of_seasons > 1) {
        setTotalSeasons(data.number_of_seasons);
      }
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

  const playerUrl = isLive && streamUrl ? streamUrl : api.redeflix.url(type as "movie" | "tv", id, season, episode);
  const topPad = Platform.OS === "web" ? 0 : insets.top;

  const goToEpisode = (s: number, ep: number) => {
    setShowPicker(false);
    router.replace({
      pathname: "/player",
      params: { type, id: String(id), season: String(s), episode: String(ep), title, totalSeasons: String(totalSeasons) },
    });
  };

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
          ) : (
            <View style={{ width: 40 }} />
          )}
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
        <EpisodePicker
          visible={showPicker}
          onClose={() => setShowPicker(false)}
          currentSeason={pickerSeason}
          currentEpisode={episode}
          totalSeasons={totalSeasons}
          episodes={pickerEpisodes}
          loading={loadingEpisodes}
          onSelectSeason={(s) => { setPickerSeason(s); fetchEpisodes(s); }}
          onSelectEpisode={goToEpisode}
        />
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
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>WebView indisponível</Text>
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
        onLoadEnd={() => { setLoading(false); saveProgress(); showControls(); }}
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
          const allowed = req.url.includes("redeflix") || req.url.includes("embedtv") || req.url.includes("faz-o-eli");
          if (!allowed && req.navigationType === "click") return false;
          return true;
        }}
      />

      {loading && !error && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Carregando player...</Text>
        </View>
      )}

      {error && (
        <View style={styles.loaderOverlay}>
          <Feather name="clock" size={48} color={colors.primary} />
          <Text style={[styles.unavailTitle, { color: colors.foreground }]}>Conteúdo Indisponível</Text>
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
        <>
          <Animated.View
            style={[styles.playerHeader, { paddingTop: topPad + 4, opacity: controlsOpacity }]}
            pointerEvents={controlsVisible ? "box-none" : "none"}
          >
            <Pressable onPress={() => router.back()} style={styles.iconBtn}>
              <Feather name="arrow-left" size={22} color="rgba(255,255,255,0.9)" />
            </Pressable>
            {title ? (
              <Text style={styles.playerTitle} numberOfLines={1}>{title}</Text>
            ) : null}
            <View style={{ width: 40 }} />
          </Animated.View>

          {type === "tv" && !isLive && (
            <Animated.View
              style={[styles.episodeBar, { backgroundColor: "rgba(0,0,0,0.9)", bottom: 0, position: "absolute", left: 0, right: 0, opacity: controlsOpacity }]}
              pointerEvents={controlsVisible ? "box-none" : "none"}
            >
              <Text style={[styles.episodeText, { color: "rgba(255,255,255,0.6)" }]}>
                T{season} · Ep {episode}
              </Text>
              <View style={styles.episodeActions}>
                <Pressable
                  style={[styles.epBtn, { borderColor: "rgba(255,255,255,0.2)" }]}
                  onPress={() => goToEpisode(season, Math.max(1, episode - 1))}
                >
                  <Feather name="chevron-left" size={14} color="#fff" />
                  <Text style={[styles.epBtnText, { color: "#fff" }]}>Anterior</Text>
                </Pressable>
                <Pressable
                  style={[styles.epBtn, { borderColor: "rgba(255,255,255,0.2)" }]}
                  onPress={openPicker}
                >
                  <Feather name="list" size={14} color="#fff" />
                  <Text style={[styles.epBtnText, { color: "#fff" }]}>Episódios</Text>
                </Pressable>
                <Pressable
                  style={[styles.epBtn, { backgroundColor: "#e50914", borderColor: "#e50914" }]}
                  onPress={() => goToEpisode(season, episode + 1)}
                >
                  <Text style={[styles.epBtnText, { color: "#fff" }]}>Próximo</Text>
                  <Feather name="chevron-right" size={14} color="#fff" />
                </Pressable>
              </View>
            </Animated.View>
          )}

          <Pressable
            style={styles.showControlsBtn}
            onPress={showControls}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <View style={[styles.showControlsInner, { opacity: controlsVisible ? 0.5 : 0.9 }]}>
              <Feather name={controlsVisible ? "eye" : "eye-off"} size={14} color="#fff" />
            </View>
          </Pressable>
        </>
      )}

      <EpisodePicker
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        currentSeason={pickerSeason}
        currentEpisode={episode}
        totalSeasons={totalSeasons}
        episodes={pickerEpisodes}
        loading={loadingEpisodes}
        onSelectSeason={(s) => { setPickerSeason(s); fetchEpisodes(s); }}
        onSelectEpisode={goToEpisode}
      />
    </View>
  );
}

interface EpisodePickerProps {
  visible: boolean;
  onClose: () => void;
  currentSeason: number;
  currentEpisode: number;
  totalSeasons: number;
  episodes: TmdbEpisode[];
  loading: boolean;
  onSelectSeason: (s: number) => void;
  onSelectEpisode: (season: number, ep: number) => void;
}

function EpisodePicker({
  visible, onClose, currentSeason, currentEpisode, totalSeasons,
  episodes, loading, onSelectSeason, onSelectEpisode,
}: EpisodePickerProps) {
  const seasons = Array.from({ length: Math.max(totalSeasons, 1) }, (_, i) => i + 1);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.pickerOverlay} onPress={onClose} />
      <View style={styles.pickerSheet}>
        <View style={styles.pickerHandle} />
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>Temporadas & Episódios</Text>
          <Pressable onPress={onClose} style={styles.pickerClose}>
            <Feather name="x" size={20} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.seasonRow}
        >
          {seasons.map((s) => (
            <Pressable
              key={s}
              onPress={() => onSelectSeason(s)}
              style={[
                styles.seasonChip,
                currentSeason === s && styles.seasonChipActive,
              ]}
            >
              <Text style={[styles.seasonChipText, currentSeason === s && styles.seasonChipTextActive]}>
                T{s}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <View style={styles.pickerLoading}>
            <ActivityIndicator color="#e50914" size="large" />
          </View>
        ) : episodes.length === 0 ? (
          <View style={styles.pickerLoading}>
            <Text style={styles.pickerEmptyText}>Nenhum episódio encontrado</Text>
          </View>
        ) : (
          <FlatList
            data={episodes}
            keyExtractor={(ep) => String(ep.episode_number)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
            renderItem={({ item: ep }) => {
              const isActive = ep.episode_number === currentEpisode && currentSeason === ep.season_number;
              return (
                <Pressable
                  style={[styles.epRow, isActive && styles.epRowActive]}
                  onPress={() => onSelectEpisode(currentSeason, ep.episode_number)}
                >
                  <View style={styles.epNumBox}>
                    <Text style={[styles.epNum, isActive && { color: "#e50914" }]}>{ep.episode_number}</Text>
                  </View>
                  {ep.still_path ? (
                    <Image
                      source={{ uri: `https://image.tmdb.org/t/p/w185${ep.still_path}` }}
                      style={styles.epThumb}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.epThumb, { backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }]}>
                      <Feather name="film" size={16} color="rgba(255,255,255,0.2)" />
                    </View>
                  )}
                  <View style={styles.epInfo}>
                    <Text style={styles.epName} numberOfLines={2}>{ep.name}</Text>
                    {ep.runtime ? (
                      <Text style={styles.epMeta}>{ep.runtime} min</Text>
                    ) : null}
                    {ep.overview ? (
                      <Text style={styles.epDesc} numberOfLines={2}>{ep.overview}</Text>
                    ) : null}
                  </View>
                  {isActive && (
                    <View style={styles.epPlayingBadge}>
                      <Text style={styles.epPlayingText}>▶</Text>
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
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
    backgroundColor: "rgba(0,0,0,0.55)",
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
    zIndex: 5,
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
  episodeBar: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, zIndex: 10 },
  episodeText: { fontSize: 13, fontWeight: "500" },
  episodeActions: { flexDirection: "row", gap: 8 },
  epBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  epBtnText: { fontSize: 13, fontWeight: "600" },

  showControlsBtn: {
    position: "absolute",
    bottom: 70,
    right: 16,
    zIndex: 20,
  },
  showControlsInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },

  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  pickerSheet: {
    backgroundColor: "#111",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: H * 0.75,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  pickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  pickerTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  pickerClose: { padding: 4 },
  seasonRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  seasonChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  seasonChipActive: {
    backgroundColor: "#e50914",
    borderColor: "#e50914",
  },
  seasonChipText: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600" },
  seasonChipTextActive: { color: "#fff" },
  pickerLoading: {
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerEmptyText: { color: "rgba(255,255,255,0.4)", fontSize: 14 },
  epRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  epRowActive: { backgroundColor: "rgba(229,9,20,0.08)", borderRadius: 10, paddingHorizontal: 8, marginHorizontal: -8 },
  epNumBox: { width: 28, alignItems: "center" },
  epNum: { color: "rgba(255,255,255,0.4)", fontSize: 14, fontWeight: "700" },
  epThumb: { width: 80, height: 50, borderRadius: 8, overflow: "hidden" },
  epInfo: { flex: 1, gap: 2 },
  epName: { color: "#fff", fontSize: 13, fontWeight: "600", lineHeight: 17 },
  epMeta: { color: "rgba(255,255,255,0.35)", fontSize: 11 },
  epDesc: { color: "rgba(255,255,255,0.4)", fontSize: 11, lineHeight: 15 },
  epPlayingBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#e50914",
    alignItems: "center",
    justifyContent: "center",
  },
  epPlayingText: { color: "#fff", fontSize: 8, fontWeight: "800" },
});
