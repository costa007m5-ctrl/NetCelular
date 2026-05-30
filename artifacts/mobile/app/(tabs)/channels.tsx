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
const CARD_W = 160;

export default function ChannelsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [epgMap, setEpgMap] = useState<Record<string, EpgEntry["epg"]>>({});
  const [loading, setLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);

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

  const heroChannels = channels.filter((c) => c.categories.includes(1) || c.categories.includes(6)).slice(0, 6);
  const hero = heroChannels[heroIndex] ?? channels[0];

  useEffect(() => {
    if (heroChannels.length <= 1) return;
    const t = setInterval(() => {
      Animated.timing(heroFade, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setHeroIndex((i) => (i + 1) % heroChannels.length);
        Animated.timing(heroFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      });
    }, 5000);
    return () => clearInterval(t);
  }, [heroChannels.length]);

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
        channelCategories: JSON.stringify(ch.categories),
        epgTitle: epg?.title ?? "Ao Vivo",
        epgDesc: epg?.desc ?? "",
        epgStart: epg?.start_date ?? "",
      },
    });
  };

  // Build carousels: one per category
  const carousels = MAIN_CATEGORIES.filter((id) => id !== 0).map((catId) => ({
    catId,
    label: CATEGORY_LABELS[catId] ?? String(catId),
    channels: channels.filter((c) => c.categories.includes(catId)),
  })).filter((g) => g.channels.length > 0);

  return (
    <View style={styles.container}>
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
            <Pressable onPress={() => goToDetail(hero)} style={{ flex: 1 }}>
              <Image
                source={{ uri: hero.preview || hero.image }}
                style={styles.heroImg}
                resizeMode="cover"
              />
              <LinearGradient
                colors={["transparent", "rgba(10,10,10,0.7)", "#0a0a0a"]}
                style={StyleSheet.absoluteFillObject}
              />
              <LinearGradient
                colors={["rgba(10,10,10,0.55)", "transparent"]}
                style={[StyleSheet.absoluteFillObject, { height: 100 }]}
              />

              {/* Content */}
              <View style={styles.heroContent}>
                <View style={styles.heroTopRow}>
                  <View style={styles.liveBadge}>
                    <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
                    <Text style={styles.liveBadgeText}>AO VIVO AGORA</Text>
                  </View>
                  <Text style={styles.heroPagination}>{heroIndex + 1}/{heroChannels.length}</Text>
                </View>

                <Text style={styles.heroChannelLabel}>{hero.name.toUpperCase()}</Text>

                <Text style={styles.heroTitle} numberOfLines={2}>
                  {epgMap[hero.id]?.title ?? hero.name}
                </Text>

                <View style={styles.heroViewersRow}>
                  <Animated.View style={[styles.liveDotSmall, { opacity: pulseAnim }]} />
                  <Text style={styles.heroViewers}>{fakeViewers(hero.id)} assistindo • Toque para detalhes</Text>
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

        {/* ── CAROUSELS BY GENRE ─────────────────── */}
        {loading ? (
          <View style={styles.skeletonSection}>
            <View style={styles.skeletonTitle} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
              {[1, 2, 3].map((n) => <View key={n} style={styles.skeletonCard} />)}
            </ScrollView>
          </View>
        ) : (
          carousels.map(({ catId, label, channels: catChannels }) => (
            <View key={catId} style={styles.carouselSection}>
              {/* Section header */}
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <Animated.View style={[styles.liveIndicator, { opacity: pulseAnim }]} />
                  <Text style={styles.sectionTitle}>{label.toUpperCase()}</Text>
                </View>
                <Text style={styles.seeAll}>{catChannels.length} canais</Text>
              </View>

              {/* Horizontal scroll */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.carouselRow}
              >
                {catChannels.map((ch) => {
                  const epg = epgMap[ch.id];
                  const accent = getAccent(ch.id);
                  const progress = epg ? calcProgress(epg.start_date) : 45;
                  return (
                    <Pressable
                      key={ch.id}
                      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}
                      onPress={() => goToDetail(ch)}
                    >
                      {/* Logo + badge */}
                      <View style={styles.cardTop}>
                        <View style={[styles.cardLogo, { backgroundColor: accent + "22", borderColor: accent + "55" }]}>
                          <Image source={{ uri: ch.image }} style={styles.cardLogoImg} resizeMode="contain" />
                        </View>
                        <View style={styles.cardBadgeCol}>
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

                      {/* Program info */}
                      <View style={styles.cardMid}>
                        <Text style={styles.cardProgram} numberOfLines={2}>
                          {epg?.title ?? ch.name}
                        </Text>
                        <Text style={styles.cardName} numberOfLines={1}>{ch.name}</Text>
                      </View>

                      {/* Progress + play */}
                      <View style={styles.cardBottom}>
                        <View style={styles.progressBg}>
                          <View style={[styles.progressFill, { width: `${progress}%` as any, backgroundColor: accent }]} />
                        </View>
                        <View style={styles.cardPlayRow}>
                          <Text style={styles.cardQuality}>HD</Text>
                          <View style={[styles.playBtn, { backgroundColor: accent }]}>
                            <Text style={styles.playBtnIcon}>▶</Text>
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },

  heroSkeleton: { height: 300, alignItems: "center", justifyContent: "center", backgroundColor: "#111" },
  heroWrap: { width: "100%", height: 300 },
  heroImg: { width: "100%", height: 300, position: "absolute" },
  heroContent: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 22 },
  heroTopRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  liveBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#e50914", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveDotSmall: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#e50914" },
  liveBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  heroPagination: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "600" },
  heroChannelLabel: { color: "rgba(255,255,255,0.45)", fontSize: 9, fontWeight: "700", letterSpacing: 2, marginBottom: 3 },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.5, lineHeight: 26, marginBottom: 6 },
  heroViewersRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroViewers: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "500" },
  heroDots: { position: "absolute", top: 16, right: 16, gap: 4 },
  heroDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)" },
  heroDotActive: { width: 4, height: 14, backgroundColor: "#e50914" },

  skeletonSection: { marginTop: 24 },
  skeletonTitle: { height: 16, width: 120, backgroundColor: "#1a1a1a", borderRadius: 8, marginHorizontal: 16, marginBottom: 12 },
  skeletonCard: { width: CARD_W, height: 160, borderRadius: 16, backgroundColor: "#1a1a1a" },

  carouselSection: { marginTop: 24 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, marginBottom: 12,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#e50914" },
  sectionTitle: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 1 },
  seeAll: { color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: "500" },
  carouselRow: { paddingHorizontal: 16, gap: 10 },

  card: {
    width: CARD_W,
    backgroundColor: "#161616",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
    paddingTop: 12,
  },
  cardTop: {
    flexDirection: "row", alignItems: "flex-start",
    justifyContent: "space-between", paddingHorizontal: 10, marginBottom: 8,
  },
  cardLogo: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center", borderWidth: 1, overflow: "hidden",
  },
  cardLogoImg: { width: 28, height: 28 },
  cardBadgeCol: { alignItems: "flex-end", gap: 4 },
  cardLiveBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 5, paddingVertical: 3, borderRadius: 5, borderWidth: 1,
  },
  cardLiveDot: { width: 4, height: 4, borderRadius: 2 },
  cardLiveTxt: { fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  viewersRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  eyeIcon: { fontSize: 9 },
  viewersText: { color: "rgba(255,255,255,0.4)", fontSize: 9, fontWeight: "600" },

  cardMid: { paddingHorizontal: 10, marginBottom: 8, flex: 1 },
  cardProgram: { color: "#fff", fontSize: 11, fontWeight: "700", lineHeight: 15, marginBottom: 3 },
  cardName: { color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: "500" },

  cardBottom: { paddingHorizontal: 10, paddingBottom: 10 },
  progressBg: { height: 2, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 1, overflow: "hidden", marginBottom: 8 },
  progressFill: { height: 2, borderRadius: 1 },
  cardPlayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardQuality: { color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  playBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  playBtnIcon: { color: "#fff", fontSize: 10, marginLeft: 2 },
});
