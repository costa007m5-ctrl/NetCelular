import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { GlobalSearchBar } from "@/components/GlobalSearchBar";
import {
  liveTvApi,
  calcProgress,
  calcRemaining,
  fakeViewers,
  getAccent,
  CATEGORY_LABELS,
  MAIN_CATEGORIES,
  type LiveChannel,
  type LiveCategory,
  type EpgEntry,
} from "@/lib/live-tv-api";

// ─── Dimensions ────────────────────────────────────────────────────────────────
const { width: W } = Dimensions.get("window");

// ─── Palette ───────────────────────────────────────────────────────────────────
const RED    = "#e50914";
const GREEN  = "#22c55e";
const AMBER  = "#f59e0b";
const BLUE   = "#3b82f6";
const PURPLE = "#8b5cf6";

const CARD_W = (W - 16 * 2 - 10 * 2) / 3;  // 3-col grid with gaps

// ─── EPG lookup helper ─────────────────────────────────────────────────────────
function getEpg(epgs: EpgEntry[], channelId: string) {
  return epgs.find((e) => e.id === channelId);
}

// ─── ChannelCard ───────────────────────────────────────────────────────────────
function ChannelCard({
  channel, epg, onPress,
}: {
  channel: LiveChannel; epg?: EpgEntry; onPress: () => void;
}) {
  const sc = useRef(new Animated.Value(1)).current;
  const [imgErr, setImgErr] = useState(false);
  const accent  = getAccent(channel.id);
  const prog    = epg ? calcProgress(epg.epg.start_date) : 35;
  const viewers = fakeViewers(channel.id);

  const pi = () => Animated.spring(sc, { toValue: 0.93, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[st.card, { transform: [{ scale: sc }] }]}>
        {/* Accent bar top */}
        <View style={[st.cardAccentBar, { backgroundColor: accent }]} />

        {/* Logo */}
        <View style={st.cardLogoWrap}>
          {!imgErr && channel.image
            ? <Image source={{ uri: channel.image }} style={st.cardLogo} contentFit="contain"
                cachePolicy="memory-disk" onError={() => setImgErr(true)} />
            : <LinearGradient colors={[`${accent}22`, "#080608"]} style={st.cardLogo}>
                <Feather name="tv" size={20} color={accent} />
              </LinearGradient>
          }
        </View>

        {/* Live badge */}
        <View style={st.liveBadge}>
          <View style={st.liveDot} />
          <Text style={st.liveBadgeT}>AO VIVO</Text>
        </View>

        {/* Channel name */}
        <Text style={st.cardName} numberOfLines={1}>{channel.name}</Text>

        {/* EPG / program name */}
        {epg && (
          <Text style={st.cardEpg} numberOfLines={1}>{epg.epg.title}</Text>
        )}

        {/* Progress bar */}
        <View style={st.cardProgWrap}>
          <View style={[st.cardProgFill, { width: `${prog}%` as any, backgroundColor: accent }]} />
        </View>

        {/* Viewers */}
        <View style={st.cardViewers}>
          <Feather name="eye" size={8} color="rgba(255,255,255,0.35)" />
          <Text style={st.cardViewersT}>{viewers}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── FeaturedBanner ────────────────────────────────────────────────────────────
function FeaturedBanner({
  channel, epg, onPress,
}: {
  channel: LiveChannel; epg?: EpgEntry; onPress: () => void;
}) {
  const sc    = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const [imgErr, setImgErr] = useState(false);
  const accent = getAccent(channel.id);
  const prog   = epg ? calcProgress(epg.epg.start_date) : 35;
  const remain = epg ? calcRemaining(epg.epg.start_date) : "AO VIVO";
  const viewers = fakeViewers(channel.id);

  const pi = () => Animated.spring(sc, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,   duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={st.featPad}>
      <Animated.View style={[st.featCard, { transform: [{ scale: sc }] }]}>
        {/* Backdrop preview */}
        {!imgErr && channel.preview
          ? <Image source={{ uri: channel.preview }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setImgErr(true)} />
          : <LinearGradient colors={[`${accent}30`, "#080608"]} style={StyleSheet.absoluteFill} />
        }
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.98)"]} locations={[0.2, 1]} style={StyleSheet.absoluteFill} />

        {/* Top accent line */}
        <View style={[st.featAccentLine, { backgroundColor: accent }]} />

        {/* Logo + live badge */}
        <View style={st.featTop}>
          <View style={[st.featLogoWrap, { borderColor: `${accent}50` }]}>
            {!imgErr && channel.image
              ? <Image source={{ uri: channel.image }} style={st.featLogo} contentFit="contain" cachePolicy="memory-disk" />
              : <Feather name="tv" size={22} color={accent} />
            }
          </View>
          <View style={st.featTopInfo}>
            <View style={st.featLiveBadge}>
              <Animated.View style={[st.featLiveDot, { backgroundColor: GREEN, opacity: pulse }]} />
              <Text style={[st.featLiveBadgeT, { color: GREEN }]}>AO VIVO</Text>
            </View>
            <Text style={st.featChannelName}>{channel.name}</Text>
          </View>
          <View style={[st.featPlayBtn, { backgroundColor: accent }]}>
            <Feather name="play" size={16} color="#fff" />
          </View>
        </View>

        {/* EPG info */}
        {epg && (
          <View style={st.featEpgRow}>
            <View style={[st.featEpgDot, { backgroundColor: accent }]} />
            <View style={{ flex: 1 }}>
              <Text style={st.featEpgTitle} numberOfLines={1}>{epg.epg.title}</Text>
              {epg.epg.desc ? (
                <Text style={st.featEpgDesc} numberOfLines={2}>{epg.epg.desc}</Text>
              ) : null}
            </View>
          </View>
        )}

        {/* Progress + meta */}
        <View style={st.featMeta}>
          <View style={st.featProgWrap}>
            <View style={[st.featProgFill, { width: `${prog}%` as any, backgroundColor: accent }]} />
          </View>
          <View style={st.featMetaRow}>
            <View style={st.featMetaLeft}>
              <Feather name="clock" size={9} color="rgba(255,255,255,0.4)" />
              <Text style={st.featMetaT}>{remain}</Text>
            </View>
            <View style={st.featMetaRight}>
              <Feather name="eye" size={9} color="rgba(255,255,255,0.4)" />
              <Text style={st.featMetaT}>{viewers} assistindo</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── CategoryTab ───────────────────────────────────────────────────────────────
function CategoryTab({ label, active, color, onPress }: {
  label: string; active: boolean; color: string; onPress: () => void;
}) {
  const sc = useRef(new Animated.Value(1)).current;
  return (
    <Pressable onPress={onPress}
      onPressIn={() => Animated.spring(sc, { toValue: 0.93, useNativeDriver: true, speed: 30 }).start()}
      onPressOut={() => Animated.spring(sc, { toValue: 1, useNativeDriver: true, speed: 26 }).start()}>
      <Animated.View style={[st.catTab, active && { backgroundColor: `${color}20`, borderColor: `${color}50` }, { transform: [{ scale: sc }] }]}>
        {active && <View style={[st.catTabDot, { backgroundColor: color }]} />}
        <Text style={[st.catTabT, { color: active ? color : "rgba(255,255,255,0.35)" }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── SectionHeader ─────────────────────────────────────────────────────────────
function SectionHeader({ title, count, accentColor = RED }: {
  title: string; count?: number; accentColor?: string;
}) {
  return (
    <View style={st.secHead}>
      <View style={[st.secBar, { backgroundColor: accentColor }]} />
      <Text style={st.secTitle}>{title}</Text>
      {count !== undefined && (
        <View style={[st.secBadge, { backgroundColor: `${accentColor}20`, borderColor: `${accentColor}40` }]}>
          <Text style={[st.secBadgeT, { color: accentColor }]}>{count}</Text>
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
export default function LiveTvScreen() {
  const colors  = useColors();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const isWeb   = Platform.OS === "web";
  const topPad  = isWeb ? 0 : insets.top;

  // ── Animations ──────────────────────────────────────────────────────────────
  const headerFade  = useRef(new Animated.Value(0)).current;
  const gridFade    = useRef(new Animated.Value(0)).current;
  const featFade    = useRef(new Animated.Value(0)).current;
  const blink       = useRef(new Animated.Value(1)).current;

  // ── State ───────────────────────────────────────────────────────────────────
  const [channels,   setChannels]   = useState<LiveChannel[]>([]);
  const [categories, setCategories] = useState<LiveCategory[]>([]);
  const [epgs,       setEpgs]       = useState<EpgEntry[]>([]);
  const [activeCat,  setActiveCat]  = useState<number>(0);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Live dot blink loop ─────────────────────────────────────────────────────
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(blink, { toValue: 0.2, duration: 600, useNativeDriver: true }),
      Animated.timing(blink, { toValue: 1,   duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    try {
      const [channelsRes, epgsRes] = await Promise.allSettled([
        liveTvApi.getChannels(),
        liveTvApi.getEpgs(),
      ]);

      if (channelsRes.status === "fulfilled") {
        setChannels(channelsRes.value.channels ?? []);
        setCategories(channelsRes.value.categories ?? []);
      }
      if (epgsRes.status === "fulfilled") {
        setEpgs(epgsRes.value ?? []);
      }
    } catch {}

    setLoading(false);
    setRefreshing(false);

    // Stagger entrance animations
    Animated.stagger(80, [
      Animated.timing(headerFade, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(featFade,   { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(gridFade,   { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    headerFade.setValue(0);
    featFade.setValue(0);
    gridFade.setValue(0);
    loadAll();
  }, [loadAll]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goToChannel = useCallback((ch: LiveChannel) => {
    router.push({
      pathname: "/channel-detail",
      params: {
        channelId: ch.id,
        channelName: ch.name,
        channelImage: ch.image,
        channelPreview: ch.preview,
        channelUrl: ch.url,
        channelCategories: JSON.stringify(ch.categories),
      },
    });
  }, [router]);

  // ── Filtered channels ───────────────────────────────────────────────────────
  const filtered = activeCat === 0
    ? channels
    : channels.filter((ch) => ch.categories?.includes(activeCat));

  // Featured = first channel in filtered list
  const featured = filtered[0];
  const rest     = filtered.slice(1);

  // Category tabs — only show categories that have channels
  const activeCategoryIds = new Set(channels.flatMap((ch) => ch.categories ?? []));
  const catTabs = [
    { id: 0, name: CATEGORY_LABELS[0] ?? "Todos" },
    ...MAIN_CATEGORIES.filter((id) => id !== 0 && activeCategoryIds.has(id))
      .map((id) => ({ id, name: CATEGORY_LABELS[id] ?? `Cat ${id}` })),
  ];

  // Accent color for active category
  const catColors: Record<number, string> = {
    0: RED, 1: GREEN, 2: PURPLE, 3: BLUE, 4: "#f97316", 5: AMBER, 6: RED, 7: PURPLE,
  };
  const activeColor = catColors[activeCat] ?? RED;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <Animated.View style={[st.header, { paddingTop: topPad + 10, opacity: headerFade }]}>
        <LinearGradient
          colors={["rgba(0,0,0,0.95)", "rgba(0,0,0,0.7)", "transparent"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={st.headerInner}>
          <View style={st.headerLeft}>
            <View style={st.livePill}>
              <Animated.View style={[st.livePillDot, { opacity: blink }]} />
              <Text style={st.livePillT}>AO VIVO</Text>
            </View>
            <View>
              <Text style={st.headerTitle}>TV ao Vivo</Text>
              {!loading && (
                <Text style={st.headerSub}>{filtered.length} canais disponíveis</Text>
              )}
            </View>
          </View>
          <TouchableOpacity onPress={onRefresh} style={st.refreshBtn} activeOpacity={0.7}>
            <Feather name="refresh-cw" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        {/* Category tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.catScroll}
          style={{ marginTop: 10 }}
        >
          {catTabs.map((cat) => (
            <CategoryTab
              key={cat.id}
              label={cat.name}
              active={activeCat === cat.id}
              color={catColors[cat.id] ?? RED}
              onPress={() => setActiveCat(cat.id)}
            />
          ))}
        </ScrollView>
      </Animated.View>

      {/* ── CONTENT ────────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={st.loadingWrap}>
          <ActivityIndicator color={RED} size="large" />
          <Text style={st.loadingT}>Conectando à transmissão...</Text>
          <Text style={st.loadingHint}>Buscando canais ao vivo</Text>
        </View>
      ) : channels.length === 0 ? (
        <View style={st.emptyWrap}>
          <Feather name="wifi-off" size={52} color="rgba(255,255,255,0.08)" />
          <Text style={st.emptyTitle}>Sem conexão</Text>
          <Text style={st.emptyHint}>Verifique sua internet e tente novamente</Text>
          <TouchableOpacity onPress={onRefresh} style={[st.retryBtn, { backgroundColor: RED }]} activeOpacity={0.8}>
            <Feather name="refresh-cw" size={14} color="#fff" />
            <Text style={st.retryT}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(ch) => ch.id}
          numColumns={3}
          contentContainerStyle={[st.grid, { paddingTop: topPad + 170 }]}
          columnWrapperStyle={st.gridRow}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
              tintColor={RED} colors={[RED]} progressViewOffset={topPad + 60} />
          }
          ListHeaderComponent={
            <>
              {/* Search bar */}
              <GlobalSearchBar placeholder="Buscar canais ao vivo..." style={{ marginTop: 8, marginBottom: 0 }} />

              {/* Featured banner */}
              {featured && (
                <Animated.View style={{ opacity: featFade }}>
                  <FeaturedBanner
                    channel={featured}
                    epg={getEpg(epgs, featured.id)}
                    onPress={() => goToChannel(featured)}
                  />
                </Animated.View>
              )}

              {/* Section header */}
              <Animated.View style={{ opacity: gridFade }}>
                <SectionHeader
                  title="Todos os Canais"
                  count={rest.length}
                  accentColor={activeColor}
                />
              </Animated.View>
            </>
          }
          ListEmptyComponent={
            <View style={st.noChannels}>
              <Feather name="tv" size={40} color="rgba(255,255,255,0.07)" />
              <Text style={st.noChannelsT}>Nenhum canal nesta categoria</Text>
            </View>
          }
          renderItem={({ item: ch }) => (
            <ChannelCard
              channel={ch}
              epg={getEpg(epgs, ch.id)}
              onPress={() => goToChannel(ch)}
            />
          )}
          ListFooterComponent={<View style={{ height: 130 }} />}
        />
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════
const st = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header:       { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, paddingBottom: 8 },
  headerInner:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18 },
  headerLeft:   { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle:  { fontSize: 24, fontWeight: "900", color: "#fff", letterSpacing: -0.5 },
  headerSub:    { fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: "500", marginTop: 1 },
  refreshBtn:   { width: 38, height: 38, alignItems: "center", justifyContent: "center",
    borderRadius: 19, backgroundColor: "rgba(255,255,255,0.08)" },

  // Live pill
  livePill:    { flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(229,9,20,0.2)", borderWidth: 1, borderColor: "rgba(229,9,20,0.5)",
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  livePillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: RED },
  livePillT:   { color: RED, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },

  // Category tabs
  catScroll: { paddingHorizontal: 16, gap: 6 },
  catTab:    { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)" },
  catTabDot: { width: 5, height: 5, borderRadius: 2.5 },
  catTabT:   { fontSize: 12, fontWeight: "700" },

  // Featured banner
  featPad:        { paddingHorizontal: 16, marginBottom: 20 },
  featCard:       { height: 200, borderRadius: 20, overflow: "hidden", backgroundColor: "#0d0a1a",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 18 }, android: { elevation: 14 } }) },
  featAccentLine: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  featTop:        { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  featLogoWrap:   { width: 56, height: 56, borderRadius: 14, borderWidth: 1, overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  featLogo:       { width: "100%", height: "100%" },
  featTopInfo:    { flex: 1, gap: 3 },
  featLiveBadge:  { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    backgroundColor: "rgba(34,197,94,0.15)", borderWidth: 1, borderColor: "rgba(34,197,94,0.4)",
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  featLiveDot:    { width: 6, height: 6, borderRadius: 3 },
  featLiveBadgeT: { fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  featChannelName:{ color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  featPlayBtn:    { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8 }, android: { elevation: 6 } }) },
  featEpgRow:     { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  featEpgDot:     { width: 3, height: "100%" as any, borderRadius: 2, marginTop: 3 },
  featEpgTitle:   { color: "#fff", fontSize: 13, fontWeight: "700" },
  featEpgDesc:    { color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: "400", marginTop: 2, lineHeight: 15 },
  featMeta:       { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 14, gap: 6 },
  featProgWrap:   { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" },
  featProgFill:   { height: "100%", borderRadius: 2 },
  featMetaRow:    { flexDirection: "row", justifyContent: "space-between" },
  featMetaLeft:   { flexDirection: "row", alignItems: "center", gap: 4 },
  featMetaRight:  { flexDirection: "row", alignItems: "center", gap: 4 },
  featMetaT:      { color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: "500" },

  // Grid
  grid:    { paddingHorizontal: 16 },
  gridRow: { gap: 10, marginBottom: 10 },

  // Channel card
  card:          { width: CARD_W, borderRadius: 14, overflow: "hidden", backgroundColor: "#0f0c14",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 }, android: { elevation: 5 } }) },
  cardAccentBar: { height: 2.5, width: "100%" },
  cardLogoWrap:  { height: CARD_W * 0.62, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)", overflow: "hidden" },
  cardLogo:      { width: CARD_W * 0.7, height: CARD_W * 0.55, alignItems: "center", justifyContent: "center" },
  liveBadge:     { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    marginHorizontal: 8, marginTop: 6, backgroundColor: "rgba(229,9,20,0.15)",
    borderWidth: 1, borderColor: "rgba(229,9,20,0.4)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  liveDot:       { width: 4, height: 4, borderRadius: 2, backgroundColor: RED },
  liveBadgeT:    { color: RED, fontSize: 7, fontWeight: "900", letterSpacing: 1.2 },
  cardName:      { color: "#fff", fontSize: 11, fontWeight: "700", marginHorizontal: 8, marginTop: 4, letterSpacing: -0.1 },
  cardEpg:       { color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: "500", marginHorizontal: 8, marginTop: 2 },
  cardProgWrap:  { height: 2, marginHorizontal: 8, marginTop: 6, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  cardProgFill:  { height: "100%", borderRadius: 1 },
  cardViewers:   { flexDirection: "row", alignItems: "center", gap: 3, marginHorizontal: 8, marginTop: 5, marginBottom: 9 },
  cardViewersT:  { color: "rgba(255,255,255,0.25)", fontSize: 8, fontWeight: "500" },

  // Section header
  secHead:  { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 2, marginBottom: 12 },
  secBar:   { width: 3, height: 16, borderRadius: 2 },
  secTitle: { fontSize: 16, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  secBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  secBadgeT:{ fontSize: 10, fontWeight: "800" },

  // States
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  loadingT:    { color: "#fff", fontSize: 15, fontWeight: "700" },
  loadingHint: { color: "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: "500" },
  emptyWrap:   { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingTop: 80 },
  emptyTitle:  { color: "#fff", fontSize: 18, fontWeight: "800" },
  emptyHint:   { color: "rgba(255,255,255,0.35)", fontSize: 13, fontWeight: "500", textAlign: "center", paddingHorizontal: 40 },
  retryBtn:    { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  retryT:      { color: "#fff", fontSize: 14, fontWeight: "700" },
  noChannels:  { paddingTop: 40, alignItems: "center", gap: 12 },
  noChannelsT: { color: "rgba(255,255,255,0.3)", fontSize: 13, fontWeight: "600" },
});
