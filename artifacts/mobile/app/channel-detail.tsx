import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { calcProgress, calcRemaining, fakeViewers, getAccent, CATEGORY_LABELS } from "@/lib/live-tv-api";

const { width: W } = Dimensions.get("window");

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

// Ad blocker JS (same as player.tsx)
const AD_BLOCKER_JS = `
(function() {
  window.open = function() { return null; };
  history.pushState = function() { return null; };
  function isAllowedSrc(src) {
    return !src || src.includes('embedtv') || src.includes('faz-o-eli');
  }
  function removeAds() {
    try { document.querySelectorAll('iframe').forEach(function(el) { if (!isAllowedSrc(el.src)) el.remove(); }); } catch(e) {}
    try { document.querySelectorAll('a[target="_blank"],a[onclick*="open"]').forEach(function(el) { el.removeAttribute('href'); el.removeAttribute('onclick'); el.removeAttribute('target'); el.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); }, true); }); } catch(e) {}
    var adSelectors = ['[id*="google_ads"],[id*="aswift"],[class*="overlay-ad"]','[class*="ad-container"],[id*="ad-container"]','iframe[src*="googlesyndication"],iframe[src*="doubleclick"]','#preroll-ads,.preroll,[class*="preroll"]','[class*="popup"],[id*="popup"]'];
    adSelectors.forEach(function(sel) { try { document.querySelectorAll(sel).forEach(function(el) { el.remove(); }); } catch(e) {} });
  }
  removeAds();
  setInterval(removeAds, 1500);
  true;
})();
`;

function getNextSlots(startDateStr: string): { time: string; title: string; duration: string }[] {
  try {
    const start = new Date(startDateStr);
    const slots = [];
    for (let i = 1; i <= 3; i++) {
      const t = new Date(start.getTime() + i * 60 * 60 * 1000);
      const hh = String(t.getHours()).padStart(2, "0");
      const mm = String(t.getMinutes()).padStart(2, "0");
      slots.push({ time: `${hh}:${mm}`, title: "Programação ao Vivo", duration: "60 min" });
    }
    return slots;
  } catch {
    return [
      { time: "—", title: "Programação ao Vivo", duration: "60 min" },
      { time: "—", title: "Programação ao Vivo", duration: "60 min" },
    ];
  }
}

export default function ChannelDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 16 : insets.top;

  const params = useLocalSearchParams<{
    channelId: string;
    channelName: string;
    channelImage: string;
    channelPreview: string;
    channelUrl: string;
    channelCategories: string;
    epgTitle: string;
    epgDesc: string;
    epgStart: string;
  }>();

  const {
    channelId = "",
    channelName = "Canal",
    channelImage = "",
    channelPreview = "",
    channelUrl = "",
    channelCategories = "[]",
    epgTitle = "Ao Vivo",
    epgDesc = "",
    epgStart = "",
  } = params;

  const accent = getAccent(channelId);
  const progress = epgStart ? calcProgress(epgStart) : 45;
  const remaining = epgStart ? calcRemaining(epgStart) : "AO VIVO";
  const viewers = fakeViewers(channelId);
  const nextSlots = epgStart ? getNextSlots(epgStart) : [];

  let categories: number[] = [];
  try { categories = JSON.parse(channelCategories); } catch { categories = []; }
  const genreLabel = categories.length > 0 ? (CATEGORY_LABELS[categories[0]] ?? "Ao Vivo") : "Ao Vivo";

  const [isPlaying, setIsPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [favorited, setFavorited] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const toggleFullscreen = () => {
    setFullscreen((v) => !v);
  };

  const PLAYER_H = 230;

  return (
    <View style={styles.container}>
      <StatusBar style="light" hidden={fullscreen} />

      {/* ── INLINE PLAYER ──────────────────────── */}
      <View style={[styles.playerWrap, { height: PLAYER_H }, fullscreen && styles.playerFullscreen]}>
        {!isPlaying ? (
          /* Thumbnail + big play button */
          <>
            <Image
              source={{ uri: channelPreview || channelImage }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
            <LinearGradient
              colors={["rgba(0,0,0,0.5)", "transparent", "rgba(0,0,0,0.5)"]}
              style={StyleSheet.absoluteFillObject}
            />
            {/* Back button */}
            {!fullscreen && (
              <Pressable style={[styles.backBtn, { top: topPad + 8 }]} onPress={() => router.back()}>
                <Feather name="arrow-left" size={20} color="#fff" />
              </Pressable>
            )}
            {/* Channel logo overlay */}
            <View style={styles.thumbLogoWrap}>
              <View style={[styles.thumbLogo, { borderColor: accent + "60", backgroundColor: accent + "22" }]}>
                <Image source={{ uri: channelImage }} style={styles.thumbLogoImg} resizeMode="contain" />
              </View>
            </View>
            {/* Big play button */}
            <Pressable
              style={styles.bigPlayBtn}
              onPress={() => setIsPlaying(true)}
            >
              <LinearGradient
                colors={[accent, "#000"]}
                style={styles.bigPlayGradient}
              >
                <Text style={styles.bigPlayIcon}>▶</Text>
              </LinearGradient>
            </Pressable>
            {/* Live badge bottom-left */}
            <View style={styles.thumbLiveBadge}>
              <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
              <Text style={styles.thumbLiveText}>AO VIVO</Text>
            </View>
          </>
        ) : isWeb ? (
          /* ── Web iframe Player ── */
          <>
            <iframe
              src={channelUrl}
              style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#000" } as any}
              allowFullScreen
              allow="autoplay; fullscreen; encrypted-media"
            />
            <Pressable style={styles.fsBtn} onPress={() => setFullscreen((v) => !v)}>
              <Feather name={fullscreen ? "minimize" : "maximize"} size={18} color="#fff" />
            </Pressable>
            {!fullscreen && (
              <Pressable style={[styles.backBtnPlayer, { top: topPad + 8 }]} onPress={() => router.back()}>
                <Feather name="arrow-left" size={20} color="#fff" />
              </Pressable>
            )}
          </>
        ) : WebView ? (
          /* ── Native WebView Player ── */
          <>
            <WebView
              source={{ uri: channelUrl }}
              style={{ flex: 1, backgroundColor: "#000" }}
              allowsFullscreenVideo
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback
              javaScriptEnabled
              domStorageEnabled
              mixedContentMode="always"
              injectedJavaScript={AD_BLOCKER_JS}
              onShouldStartLoadWithRequest={(req: any) => {
                const url: string = req.url || "";
                const blocked =
                  url.includes("googlesyndication") ||
                  url.includes("doubleclick.net") ||
                  url.includes("adservice.google") ||
                  url.includes("pagead2.googlesyndication");
                return !blocked;
              }}
            />
            {/* Fullscreen button */}
            <Pressable style={styles.fsBtn} onPress={toggleFullscreen}>
              <Feather name={fullscreen ? "minimize" : "maximize"} size={18} color="#fff" />
            </Pressable>
            {/* Back button when not fullscreen */}
            {!fullscreen && (
              <Pressable style={[styles.backBtnPlayer, { top: topPad + 8 }]} onPress={() => router.back()}>
                <Feather name="arrow-left" size={20} color="#fff" />
              </Pressable>
            )}
            {/* Exit fullscreen button when fullscreen */}
            {fullscreen && (
              <Pressable style={styles.fsExitBtn} onPress={toggleFullscreen}>
                <Feather name="x" size={20} color="#fff" />
              </Pressable>
            )}
          </>
        ) : null}
      </View>

      {/* ── SCROLLABLE INFO ─────────────────────── */}
      {!fullscreen && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <View style={styles.contentPad}>

              {/* Channel name + live */}
              <View style={styles.channelRow}>
                <View style={[styles.channelLogoSmall, { borderColor: accent + "50", backgroundColor: accent + "18" }]}>
                  <Image source={{ uri: channelImage }} style={styles.channelLogoSmallImg} resizeMode="contain" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.liveRow}>
                    <View style={[styles.livePill, { backgroundColor: accent + "28", borderColor: accent + "55" }]}>
                      <Animated.View style={[styles.liveDotSmall, { backgroundColor: accent, opacity: pulseAnim }]} />
                      <Text style={[styles.livePillText, { color: accent }]}>AO VIVO</Text>
                    </View>
                    <Text style={styles.viewersText}>{viewers} assistindo</Text>
                  </View>
                  <Text style={styles.channelNameText}>{channelName}</Text>
                </View>
              </View>

              {/* EPG title + meta */}
              <Text style={styles.epgTitle} numberOfLines={2}>{epgTitle}</Text>
              <View style={styles.metaRow}>
                <View style={[styles.metaTag, { backgroundColor: accent + "20", borderColor: accent + "50" }]}>
                  <Text style={[styles.metaTagText, { color: accent }]}>{genreLabel}</Text>
                </View>
                <Text style={styles.metaSep}>•</Text>
                <Text style={styles.metaText}>Ao Vivo</Text>
                <Text style={styles.metaSep}>•</Text>
                <Text style={styles.metaText}>HD</Text>
                <Text style={styles.metaSep}>•</Text>
                <Text style={styles.metaText}>{remaining}</Text>
              </View>

              {/* Progress */}
              <View style={styles.progressWrap}>
                <View style={styles.progressBg}>
                  <View style={[styles.progressFill, { width: `${progress}%` as any, backgroundColor: accent, shadowColor: accent }]} />
                </View>
                <Text style={styles.progressLabel}>{Math.round(progress)}% transmitido</Text>
              </View>

              {/* Synopsis */}
              {!!epgDesc && (
                <Text style={styles.synopsis}>{epgDesc}</Text>
              )}

              {/* Action buttons */}
              <View style={styles.actionsRow}>
                <Pressable
                  style={({ pressed }) => [styles.watchBtn, { backgroundColor: accent, shadowColor: accent, opacity: pressed ? 0.85 : 1 }]}
                  onPress={() => { setIsPlaying(true); }}
                >
                  <Text style={styles.watchBtnPlay}>▶</Text>
                  <Text style={styles.watchBtnText}>Assistir Agora</Text>
                </Pressable>
                <Pressable
                  onPress={() => setFavorited((v) => !v)}
                  style={[styles.iconAction, favorited && { backgroundColor: accent + "25", borderColor: accent + "60" }]}
                >
                  <Text style={[styles.iconActionText, favorited && { color: accent }]}>{favorited ? "★" : "☆"}</Text>
                </Pressable>
                <Pressable style={styles.iconAction}>
                  <Feather name="share-2" size={18} color="rgba(255,255,255,0.7)" />
                </Pressable>
              </View>

              {/* Details grid */}
              <View style={styles.detailsGrid}>
                {([
                  { icon: "globe", label: "Idioma", value: "Português" },
                  { icon: "monitor", label: "Qualidade", value: "HD 1080p" },
                  { icon: "radio", label: "Transmissão", value: "Ao Vivo" },
                  { icon: "lock", label: "Classificação", value: "Livre" },
                  { icon: "clock", label: "Restante", value: remaining },
                  { icon: "eye", label: "Assistindo", value: viewers },
                ] as const).map((d) => (
                  <View key={d.label} style={styles.detailCell}>
                    <Feather name={d.icon as any} size={16} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.detailLabel}>{d.label}</Text>
                    <Text style={styles.detailValue}>{d.value}</Text>
                  </View>
                ))}
              </View>

              {/* Next programs (real EPG slots) */}
              {nextSlots.length > 0 && (
                <View style={styles.nextSection}>
                  <View style={styles.nextHeader}>
                    <Text style={styles.nextTitle}>Próximos Programas</Text>
                  </View>
                  {nextSlots.map((p, i) => (
                    <View key={i} style={styles.nextItem}>
                      <Text style={[styles.nextTime, { color: accent }]}>{p.time}</Text>
                      <Text style={styles.nextProg}>{p.title}</Text>
                      <Text style={styles.nextDur}>{p.duration}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },

  /* Player */
  playerWrap: { width: "100%", backgroundColor: "#000", position: "relative", overflow: "hidden" },
  playerFullscreen: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, height: undefined,
  } as any,

  backBtn: {
    position: "absolute", left: 14, zIndex: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  backBtnPlayer: {
    position: "absolute", left: 14, zIndex: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },

  thumbLogoWrap: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },
  thumbLogo: {
    width: 64, height: 64, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, overflow: "hidden",
  },
  thumbLogoImg: { width: 50, height: 50 },

  bigPlayBtn: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },
  bigPlayGradient: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
    opacity: 0.92,
  },
  bigPlayIcon: { color: "#fff", fontSize: 24, marginLeft: 5 },

  thumbLiveBadge: {
    position: "absolute", bottom: 12, left: 14,
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#e50914", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  thumbLiveText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },

  fsBtn: {
    position: "absolute", bottom: 12, right: 14, zIndex: 30,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  fsExitBtn: {
    position: "absolute", top: 16, right: 16, zIndex: 30,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center", justifyContent: "center",
  },

  /* Info section */
  contentPad: { padding: 20, paddingTop: 16 },

  channelRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  channelLogoSmall: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: "center", justifyContent: "center", borderWidth: 1, overflow: "hidden",
  },
  channelLogoSmallImg: { width: 38, height: 38 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  livePill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1,
  },
  liveDotSmall: { width: 5, height: 5, borderRadius: 3 },
  livePillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  viewersText: { color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: "500" },
  channelNameText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  epgTitle: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.5, marginBottom: 8, lineHeight: 28 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  metaTag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  metaTagText: { fontSize: 11, fontWeight: "700" },
  metaSep: { color: "rgba(255,255,255,0.25)", fontSize: 11 },
  metaText: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "500" },

  progressWrap: { marginBottom: 14 },
  progressBg: { height: 3, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden", marginBottom: 4 },
  progressFill: {
    height: 3, borderRadius: 2,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 6, elevation: 3,
  },
  progressLabel: { color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: "600" },

  synopsis: { color: "rgba(255,255,255,0.65)", fontSize: 13, lineHeight: 20, marginBottom: 16 },

  actionsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  watchBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 13, borderRadius: 14,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 6,
  },
  watchBtnPlay: { color: "#fff", fontSize: 13 },
  watchBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  iconAction: {
    width: 46, height: 46, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  iconActionText: { fontSize: 20, color: "rgba(255,255,255,0.7)" },

  detailsGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 22,
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 14,
  },
  detailCell: { width: "30%", alignItems: "center", gap: 4 },
  detailLabel: { color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  detailValue: { color: "#fff", fontSize: 10, fontWeight: "600", textAlign: "center" },

  nextSection: { marginTop: 4 },
  nextHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  nextTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  nextItem: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 11, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", marginBottom: 8, gap: 12,
  },
  nextTime: { fontSize: 13, fontWeight: "800", minWidth: 38 } as any,
  nextProg: { flex: 1, color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "500" },
  nextDur: { color: "rgba(255,255,255,0.35)", fontSize: 11 },
});
