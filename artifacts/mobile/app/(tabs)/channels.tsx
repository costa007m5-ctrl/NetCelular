import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  liveTvApi,
  calcProgress,
  fakeViewers,
  getAccent,
  CATEGORY_LABELS,
  MAIN_CATEGORIES,
  type LiveChannel,
  type EpgEntry,
} from "@/lib/live-tv-api";

const { width: W } = Dimensions.get("window");
const CARD_W = 160;

const MOCK_CHANNELS: LiveChannel[] = [
  { id: "globo", name: "Globo", categories: [6], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Rede_Globo_logo_2021.svg/240px-Rede_Globo_logo_2021.svg.png", preview: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Rede_Globo_logo_2021.svg/240px-Rede_Globo_logo_2021.svg.png", url: "" },
  { id: "sbt", name: "SBT", categories: [6], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/SBT_logo_2020.svg/240px-SBT_logo_2020.svg.png", preview: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/SBT_logo_2020.svg/240px-SBT_logo_2020.svg.png", url: "" },
  { id: "record", name: "Record TV", categories: [6], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/RecordTV_logo.svg/240px-RecordTV_logo.svg.png", preview: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/RecordTV_logo.svg/240px-RecordTV_logo.svg.png", url: "" },
  { id: "band", name: "Band", categories: [6, 1], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Rede_Bandeirantes_logo.svg/240px-Rede_Bandeirantes_logo.svg.png", preview: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Rede_Bandeirantes_logo.svg/240px-Rede_Bandeirantes_logo.svg.png", url: "" },
  { id: "espn", name: "ESPN", categories: [1], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/240px-ESPN_wordmark.svg.png", preview: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/240px-ESPN_wordmark.svg.png", url: "" },
  { id: "espn2", name: "ESPN 2", categories: [1], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/240px-ESPN_wordmark.svg.png", preview: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/240px-ESPN_wordmark.svg.png", url: "" },
  { id: "sportv", name: "SporTV", categories: [1], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/SporTV_logo.png/240px-SporTV_logo.png", preview: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/SporTV_logo.png/240px-SporTV_logo.png", url: "" },
  { id: "combate", name: "Combate", categories: [1], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Canal_combate.png/240px-Canal_combate.png", preview: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Canal_combate.png/240px-Canal_combate.png", url: "" },
  { id: "cnn_br", name: "CNN Brasil", categories: [5], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/CNN_Brasil_logo.svg/240px-CNN_Brasil_logo.svg.png", preview: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/CNN_Brasil_logo.svg/240px-CNN_Brasil_logo.svg.png", url: "" },
  { id: "globonews", name: "GloboNews", categories: [5], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/GloboNews_2019.svg/240px-GloboNews_2019.svg.png", preview: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/GloboNews_2019.svg/240px-GloboNews_2019.svg.png", url: "" },
  { id: "tnt", name: "TNT", categories: [4], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/TNT_Logo_2016.svg/240px-TNT_Logo_2016.svg.png", preview: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/TNT_Logo_2016.svg/240px-TNT_Logo_2016.svg.png", url: "" },
  { id: "tbs", name: "TBS", categories: [4], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/TBS_network_logo.svg/240px-TBS_network_logo.svg.png", preview: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/TBS_network_logo.svg/240px-TBS_network_logo.svg.png", url: "" },
  { id: "discovery", name: "Discovery", categories: [3], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Discovery_Channel_2019_logo.svg/240px-Discovery_Channel_2019_logo.svg.png", preview: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Discovery_Channel_2019_logo.svg/240px-Discovery_Channel_2019_logo.svg.png", url: "" },
  { id: "national", name: "Nat Geo", categories: [3], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/National_Geographic_Logo.svg/240px-National_Geographic_Logo.svg.png", preview: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/National_Geographic_Logo.svg/240px-National_Geographic_Logo.svg.png", url: "" },
  { id: "disney", name: "Disney Channel", categories: [2], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Disney_Channel_2019.svg/240px-Disney_Channel_2019.svg.png", preview: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Disney_Channel_2019.svg/240px-Disney_Channel_2019.svg.png", url: "" },
  { id: "cartoon", name: "Cartoon Network", categories: [2], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Cartoon_Network_2010_logo.svg/240px-Cartoon_Network_2010_logo.svg.png", preview: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Cartoon_Network_2010_logo.svg/240px-Cartoon_Network_2010_logo.svg.png", url: "" },
  { id: "multishow", name: "Multishow", categories: [7], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Multishow_2014.png/240px-Multishow_2014.png", preview: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Multishow_2014.png/240px-Multishow_2014.png", url: "" },
];

const MOCK_EPGS: Record<string, { title: string; desc: string; start_date: string }> = {
  globo: { title: "Jornal Nacional", desc: "Principal telejornal da Globo", start_date: new Date(Date.now() - 30 * 60000).toISOString() },
  sbt: { title: "SBT Brasil", desc: "Telejornal do SBT", start_date: new Date(Date.now() - 20 * 60000).toISOString() },
  espn: { title: "ESPN SportsCenter", desc: "Principais notícias do esporte", start_date: new Date(Date.now() - 45 * 60000).toISOString() },
  sportv: { title: "Futebol ao Vivo", desc: "Transmissão ao vivo", start_date: new Date(Date.now() - 60 * 60000).toISOString() },
  cnn_br: { title: "CNN Brasil Prime Time", desc: "Notícias ao vivo", start_date: new Date(Date.now() - 15 * 60000).toISOString() },
  tnt: { title: "Cinema em Cartaz", desc: "O melhor do cinema na TNT", start_date: new Date(Date.now() - 90 * 60000).toISOString() },
  discovery: { title: "Descobertas Incríveis", desc: "Documentários sobre ciência e natureza", start_date: new Date(Date.now() - 25 * 60000).toISOString() },
};

export default function ChannelsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [epgMap, setEpgMap] = useState<Record<string, EpgEntry["epg"]>>({});
  const [loading, setLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);
  const [isOffline, setIsOffline] = useState(false);

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
        if (chData.channels.length > 0) {
          setChannels(chData.channels);
          const map: Record<string, EpgEntry["epg"]> = {};
          epgs.forEach((e) => { map[e.id] = e.epg; });
          setEpgMap(map);
        } else {
          setChannels(MOCK_CHANNELS);
          setEpgMap(MOCK_EPGS);
          setIsOffline(true);
        }
      })
      .catch(() => {
        setChannels(MOCK_CHANNELS);
        setEpgMap(MOCK_EPGS);
        setIsOffline(true);
      })
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

  const carousels = MAIN_CATEGORIES.filter((id) => id !== 0).map((catId) => ({
    catId,
    label: CATEGORY_LABELS[catId] ?? String(catId),
    channels: channels.filter((c) => c.categories.includes(catId)),
  })).filter((g) => g.channels.length > 0);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {isOffline && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineTxt}>⚠️ Canais ao vivo indisponíveis — exibindo grade de referência</Text>
          </View>
        )}

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
                contentFit="cover"
              />
              <LinearGradient
                colors={["transparent", "rgba(10,10,10,0.7)", "#0a0a0a"]}
                style={StyleSheet.absoluteFillObject}
              />
              <LinearGradient
                colors={["rgba(10,10,10,0.55)", "transparent"]}
                style={[StyleSheet.absoluteFillObject, { height: 100 }]}
              />

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

              <View style={styles.heroDots}>
                {heroChannels.map((_, i) => (
                  <View key={i} style={[styles.heroDot, i === heroIndex && styles.heroDotActive]} />
                ))}
              </View>
            </Pressable>
          </Animated.View>
        ) : null}

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
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <Animated.View style={[styles.liveIndicator, { opacity: pulseAnim }]} />
                  <Text style={styles.sectionTitle}>{label.toUpperCase()}</Text>
                </View>
                <Text style={styles.seeAll}>{catChannels.length} canais</Text>
              </View>

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
                      <View style={styles.cardTop}>
                        <View style={[styles.cardLogo, { backgroundColor: accent + "22", borderColor: accent + "55" }]}>
                          <Image source={{ uri: ch.image }} style={styles.cardLogoImg} contentFit="contain" />
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

                      <View style={styles.cardMid}>
                        <Text style={styles.cardProgram} numberOfLines={2}>
                          {epg?.title ?? ch.name}
                        </Text>
                        <Text style={styles.cardName} numberOfLines={1}>{ch.name}</Text>
                      </View>

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

  offlineBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "rgba(255,190,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,190,0,0.3)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  offlineTxt: { color: "#fbbf24", fontSize: 11, fontWeight: "600", textAlign: "center" },

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
