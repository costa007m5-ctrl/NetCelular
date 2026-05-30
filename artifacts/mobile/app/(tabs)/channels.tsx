import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  liveTvApi,
  calcProgress,
  calcRemaining,
  fakeViewers,
  getAccent,
  CATEGORY_LABELS,
  MAIN_CATEGORIES,
  type LiveChannel,
  type EpgEntry,
} from "@/lib/live-tv-api";

const { width: W } = Dimensions.get("window");
const CARD_WIDTH = (W - 48) / 2;

export default function ChannelsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [epgMap, setEpgMap] = useState<Record<string, EpgEntry["epg"]>>({});
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState(0);
  const [heroIndex, setHeroIndex] = useState(0);
  const [pulse, setPulse] = useState(true);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const heroFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    Promise.all([liveTvApi.getChannels(), liveTvApi.getEpgs()])
      .then(([chData, epgs]) => {
        setChannels(chData.channels);
        const map: Record<string, EpgEntry["epg"]> = {};
        epgs.forEach((e) => { map[e.id] = e.epg; });
        setEpgMap(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (heroChannels.length <= 1) return;
    const t = setInterval(() => {
      Animated.timing(heroFade, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setHeroIndex((i) => (i + 1) % heroChannels.length);
        Animated.timing(heroFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      });
    }, 5000);
    return () => clearInterval(t);
  }, [channels]);

  const heroChannels = channels.filter((c) => c.categories.includes(1) || c.categories.includes(6)).slice(0, 6);
  const hero = heroChannels[heroIndex] ?? channels[0];

  const filtered =
    activeCat === 0
      ? channels
      : channels.filter((c) => c.categories.includes(activeCat));

  const goToDetail = (ch: LiveChannel) => {
    const epg = epgMap[ch.id];
    router.push({
      pathname: "/channel-detail",
      params: {
        channelId: ch.id,
        channelName: ch.name,
        channelImage: ch.image,
        channelPreview: ch.preview,
        channelUrl: ch.url,
        epgTitle: epg?.title ?? "Ao Vivo",
        epgDesc: epg?.desc ?? "",
        epgStart: epg?.start_date ?? "",
      },
    });
  };

  const goToPlayer = (ch: LiveChannel, e?: any) => {
    if (e) e.stopPropagation?.();
    const epg = epgMap[ch.id];
    router.push({
      pathname: "/player",
      params: {
        type: "live",
        id: "0",
        streamUrl: ch.url,
        isLive: "true",
        title: epg?.title ? `${ch.name} • ${epg.title}` : ch.name,
      },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: "#0a0a0a" }]}>
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ height: topPad }} />

        {/* ── HERO ─────────────────────────────────── */}
        {loading ? (
          <View style={styles.heroSkeleton}>
            <ActivityIndicator color="#e50914" size="large" />
          </View>
        ) : hero ? (
          <Animated.View style={[styles.heroWrap, { opacity: heroFade }]}>
            <Pressable onPress={() => goToDetail(hero)}>
              <Image
                source={{ uri: hero.preview || hero.image }}
                style={styles.heroImg}
                resizeMode="cover"
              />
              <LinearGradient
                colors={["transparent", "rgba(10,10,10,0.6)", "#0a0a0a"]}
                style={StyleSheet.absoluteFillObject}
              />
              <LinearGradient
                colors={["rgba(10,10,10,0.7)", "transparent"]}
                style={[StyleSheet.absoluteFillObject, { height: 120 }]}
              />

              {/* Red glow */}
              <View style={styles.heroGlow} pointerEvents="none" />

              {/* Content */}
              <View style={styles.heroContent}>
                {/* Live badge */}
                <View style={styles.heroTopRow}>
                  <View style={styles.liveBadge}>
                    <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
                    <Text style={styles.liveBadgeText}>AO VIVO AGORA</Text>
                  </View>
                  <Text style={styles.heroPagination}>{heroIndex + 1}/{heroChannels.length}</Text>
                </View>

                {/* Channel label */}
                <Text style={styles.heroChannelLabel}>{hero.name.toUpperCase()}</Text>

                {/* EPG title */}
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {epgMap[hero.id]?.title ?? hero.name}
                </Text>

                {/* Viewers */}
                <View style={styles.heroViewersRow}>
                  <Animated.View style={[styles.liveDotSmall, { opacity: pulseAnim }]} />
                  <Text style={styles.heroViewers}>{fakeViewers(hero.id)} assistindo</Text>
                </View>

                {/* Buttons */}
                <View style={styles.heroBtns}>
                  <Pressable
                    style={({ pressed }) => [styles.heroPlayBtn, { opacity: pressed ? 0.85 : 1 }]}
                    onPress={() => goToPlayer(hero)}
                  >
                    <Text style={styles.heroPlayIcon}>▶</Text>
                    <Text style={styles.heroPlayText}>Assistir Agora</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.heroSecBtn, { opacity: pressed ? 0.8 : 1 }]}
                    onPress={() => goToDetail(hero)}
                  >
                    <Text style={styles.heroSecText}>Sinopse</Text>
                  </Pressable>
                </View>
              </View>

              {/* Side dots */}
              <View style={styles.heroDots}>
                {heroChannels.map((_, i) => (
                  <View key={i} style={[styles.heroDot, i === heroIndex && styles.heroDotActive]} />
                ))}
              </View>
            </Pressable>
          </Animated.View>
        ) : null}

        {/* ── CATEGORY PILLS ───────────────────────── */}
        <View style={{ marginTop: 4 }}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Animated.View style={[styles.liveIndicator, { opacity: pulseAnim }]} />
              <Text style={styles.sectionTitle}>CANAIS AO VIVO</Text>
            </View>
            <Text style={styles.seeAll}>Ver todos →</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsRow}
          >
            {MAIN_CATEGORIES.map((catId) => (
              <Pressable
                key={catId}
                onPress={() => setActiveCat(catId)}
                style={[styles.pill, activeCat === catId && styles.pillActive]}
              >
                <Text style={[styles.pillText, activeCat === catId && styles.pillTextActive]}>
                  {CATEGORY_LABELS[catId]}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* ── CHANNEL GRID ─────────────────────────── */}
        {loading ? (
          <View style={styles.loadingGrid}>
            {[1, 2, 3, 4].map((n) => (
              <View key={n} style={[styles.skeletonCard, { width: CARD_WIDTH }]} />
            ))}
          </View>
        ) : (
          <View style={styles.grid}>
            {filtered.map((ch) => {
              const epg = epgMap[ch.id];
              const accent = getAccent(ch.id);
              const progress = epg ? calcProgress(epg.start_date) : 45;
              const remaining = epg ? calcRemaining(epg.start_date) : "AO VIVO";
              return (
                <Pressable
                  key={ch.id}
                  style={({ pressed }) => [styles.card, { width: CARD_WIDTH, opacity: pressed ? 0.85 : 1 }]}
                  onPress={() => goToDetail(ch)}
                >
                  {/* Top: logo + badge + viewers */}
                  <View style={styles.cardTop}>
                    <View style={[styles.cardLogo, { backgroundColor: accent + "22", borderColor: accent + "55" }]}>
                      <Image
                        source={{ uri: ch.image }}
                        style={styles.cardLogoImg}
                        resizeMode="contain"
                      />
                    </View>
                    <View style={styles.cardBadgeViewers}>
                      <View style={[styles.cardLiveBadge, { backgroundColor: accent + "25", borderColor: accent + "55" }]}>
                        <Animated.View style={[styles.cardLiveDot, { backgroundColor: accent, opacity: pulseAnim }]} />
                        <Text style={[styles.cardLiveTxt, { color: accent }]}>AO VIVO</Text>
                      </View>
                      <View style={styles.viewersRow}>
                        <Text style={styles.eyeIcon}>👁</Text>
                        <Text style={styles.viewersText}>{fakeViewers(ch.id)}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Center: program info */}
                  <View style={styles.cardMid}>
                    <Text style={styles.cardProgram} numberOfLines={1}>
                      {epg?.title ?? ch.name}
                    </Text>
                    <Text style={styles.cardRemaining} numberOfLines={1}>{remaining}</Text>
                  </View>

                  {/* Progress bar */}
                  <View style={styles.progressWrap}>
                    <View style={styles.progressBg}>
                      <View
                        style={[styles.progressFill, {
                          width: `${progress}%` as any,
                          backgroundColor: accent,
                          shadowColor: accent,
                        }]}
                      />
                    </View>
                  </View>

                  {/* Bottom: quality + play */}
                  <View style={styles.cardBottom}>
                    <Text style={styles.cardQuality}>HD</Text>
                    <Pressable
                      style={[styles.playBtn, {
                        backgroundColor: accent,
                        shadowColor: accent,
                      }]}
                      onPress={() => goToPlayer(ch)}
                    >
                      <Text style={styles.playBtnIcon}>▶</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Hero
  heroSkeleton: {
    height: 340,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
  },
  heroWrap: { width: "100%", height: 340, position: "relative" },
  heroImg: { width: "100%", height: 340, position: "absolute" },
  heroGlow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 200,
    height: 120,
    borderRadius: 100,
    backgroundColor: "rgba(229,9,20,0.18)",
  },
  heroContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 24,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#e50914",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveDotSmall: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#e50914" },
  liveBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  heroPagination: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "600" },
  heroChannelLabel: { color: "rgba(255,255,255,0.5)", fontSize: 9, fontWeight: "700", letterSpacing: 2, marginBottom: 4 },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.5, lineHeight: 26, marginBottom: 6 },
  heroViewersRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  heroViewers: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "500" },
  heroBtns: { flexDirection: "row", gap: 10, alignItems: "center" },
  heroPlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#e50914",
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    shadowColor: "#e50914",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  heroPlayIcon: { color: "#fff", fontSize: 12 },
  heroPlayText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  heroSecBtn: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  heroSecText: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "600" },
  heroDots: {
    position: "absolute",
    top: 16,
    right: 16,
    gap: 4,
  },
  heroDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)" },
  heroDotActive: { width: 4, height: 14, backgroundColor: "#e50914" },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
    marginTop: 8,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#e50914" },
  sectionTitle: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 1 },
  seeAll: { color: "#e50914", fontSize: 12, fontWeight: "600" },

  // Pills
  pillsRow: { paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  pillActive: { backgroundColor: "#e50914", borderColor: "#e50914" },
  pillText: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "600" },
  pillTextActive: { color: "#fff" },

  // Grid
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 16,
  },
  loadingGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 12,
  },
  skeletonCard: {
    height: 150,
    borderRadius: 16,
    backgroundColor: "#1a1a1a",
  },

  // Card
  card: {
    backgroundColor: "#161616",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
    paddingTop: 12,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  cardLogo: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
  cardLogoImg: { width: 30, height: 30 },
  cardBadgeViewers: { alignItems: "flex-end", gap: 5 },
  cardLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  cardLiveDot: { width: 4, height: 4, borderRadius: 2 },
  cardLiveTxt: { fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  viewersRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  eyeIcon: { fontSize: 9 },
  viewersText: { color: "rgba(255,255,255,0.45)", fontSize: 9, fontWeight: "600" },

  // Card middle
  cardMid: { paddingHorizontal: 12, marginBottom: 8 },
  cardProgram: { color: "#fff", fontSize: 11, fontWeight: "700", lineHeight: 15, marginBottom: 2 },
  cardRemaining: { color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: "500" },

  // Progress
  progressWrap: { paddingHorizontal: 12, marginBottom: 2 },
  progressBg: { height: 2, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 1, overflow: "hidden" },
  progressFill: {
    height: 2,
    borderRadius: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
  },

  // Card bottom
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    marginTop: 4,
  },
  cardQuality: { color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  playBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  playBtnIcon: { color: "#fff", fontSize: 10, marginLeft: 2 },
});
