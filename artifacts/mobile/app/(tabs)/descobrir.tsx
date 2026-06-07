import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { InlineSearchBar } from "@/components/InlineSearchBar";
import { HeroBanner } from "@/components/HeroBanner";
import type { ContentItem } from "@/constants/content";
import { r2Route } from "@/lib/r2-direct";
import { getModalHistory, addToModalHistory, removeFromModalHistory, clearModalHistory } from "@/lib/modal-search-history";
import {
  liveTvApi,
  calcProgress,
  calcRemaining,
  fakeViewers,
  getAccent,
  jogoStatus,
  formatJogoTime,
  jogoElapsedMin,
  CATEGORY_LABELS,
  MAIN_CATEGORIES,
  type LiveChannel,
  type LiveCategory,
  type EpgEntry,
  type JogoEntry,
} from "@/lib/live-tv-api";

const { width: W } = Dimensions.get("window");


const RED    = "#e50914";
const GREEN  = "#22c55e";
const AMBER  = "#f59e0b";
const BLUE   = "#3b82f6";
const PURPLE = "#8b5cf6";

const CARD_W  = (W - 16 * 2 - 10 * 2) / 3;
const JOGO_W  = 200;

// ─── Category accent colors ────────────────────────────────────────────────────
const CAT_COLORS: Record<number, string> = {
  0: RED, 1: GREEN, 2: PURPLE, 3: BLUE,
  4: "#f97316", 5: AMBER, 6: RED, 7: PURPLE, 9: "#10b981",
};

// ─── EPG lookup ───────────────────────────────────────────────────────────────
function getEpg(epgs: EpgEntry[], channelId: string) {
  return epgs.find((e) => e.id === channelId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// JogoCard — horizontal sports match card
// ═══════════════════════════════════════════════════════════════════════════════
function JogoCard({ jogo, onPress }: { jogo: JogoEntry; onPress: () => void }) {
  const sc    = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  const status  = jogoStatus(jogo.data.timer);
  const elapsed = jogoElapsedMin(jogo.data.timer);
  const kickoff = formatJogoTime(jogo.data.timer);

  const pi = () => Animated.spring(sc, { toValue: 0.93, useNativeDriver: true, speed: 32 }).start();
  const po = () => Animated.spring(sc, { toValue: 1, useNativeDriver: true, speed: 26 }).start();

  useEffect(() => {
    if (status !== "live") return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.2, duration: 600, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,   duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [status]);

  const statusColor = status === "live" ? GREEN : status === "upcoming" ? AMBER : "rgba(255,255,255,0.25)";
  const statusLabel =
    status === "live"     ? `${elapsed}'` :
    status === "upcoming" ? kickoff :
    "Encerrado";

  return (
    <Pressable onPress={status !== "ended" ? onPress : undefined} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[jst.card, status === "ended" && jst.cardEnded, { transform: [{ scale: sc }] }]}>

        {/* League + status badge */}
        <View style={jst.top}>
          <Text style={jst.league} numberOfLines={1}>{jogo.data.league}</Text>
          <View style={[jst.statusBadge, { borderColor: `${statusColor}50`, backgroundColor: `${statusColor}15` }]}>
            {status === "live" && (
              <Animated.View style={[jst.liveDot, { backgroundColor: GREEN, opacity: pulse }]} />
            )}
            <Text style={[jst.statusT, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        {/* Teams */}
        <View style={jst.teamsRow}>
          {/* Home */}
          <View style={jst.teamCol}>
            <View style={jst.teamImgWrap}>
              <Image
                source={{ uri: jogo.data.teams.home.image }}
                style={jst.teamImg}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            </View>
            <Text style={jst.teamName} numberOfLines={2}>{jogo.data.teams.home.name}</Text>
          </View>

          {/* VS */}
          <View style={jst.vs}>
            <Text style={jst.vsT}>VS</Text>
          </View>

          {/* Away */}
          <View style={jst.teamCol}>
            <View style={jst.teamImgWrap}>
              <Image
                source={{ uri: jogo.data.teams.away.image }}
                style={jst.teamImg}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            </View>
            <Text style={jst.teamName} numberOfLines={2}>{jogo.data.teams.away.name}</Text>
          </View>
        </View>

        {/* Channels strip */}
        {status !== "ended" && jogo.players.length > 0 && (
          <View style={jst.playersRow}>
            <Feather name="tv" size={10} color="rgba(255,255,255,0.35)" />
            <Text style={jst.playersT} numberOfLines={1}>
              {jogo.players.length} canal{jogo.players.length > 1 ? "is" : ""}
            </Text>
            <View style={jst.playBtn}>
              <Feather name="play" size={8} color="#fff" />
              <Text style={jst.playT}>Assistir</Text>
            </View>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ChannelCard — 3-column grid card
// ═══════════════════════════════════════════════════════════════════════════════
function ChannelCard({
  channel, epg, onPress,
}: {
  channel: LiveChannel; epg?: EpgEntry; onPress: () => void;
}) {
  const sc    = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const [imgErr, setImgErr] = useState(false);
  const accent  = getAccent(channel.id);
  const prog    = epg ? calcProgress(epg.epg.start_date) : 35;
  const viewers = fakeViewers(channel.id);

  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.15, duration: 550, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 550, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, []);

  const pi = () => Animated.spring(sc, { toValue: 0.93, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[st.card, { transform: [{ scale: sc }] }]}>
        <View style={[st.cardAccentBar, { backgroundColor: accent }]} />
        <View style={st.cardLogoWrap}>
          {!imgErr && channel.image
            ? <Image source={{ uri: channel.image }} style={st.cardLogo} contentFit="contain"
                cachePolicy="memory-disk" onError={() => setImgErr(true)} />
            : <LinearGradient colors={[`${accent}22`, "#080608"]} style={st.cardLogo}>
                <Feather name="tv" size={20} color={accent} />
              </LinearGradient>
          }
        </View>
        <View style={st.liveBadge}>
          <Animated.View style={[st.liveDot, { opacity: pulse }]} />
          <Text style={st.liveBadgeT}>AO VIVO</Text>
        </View>
        <Text style={st.cardName} numberOfLines={1}>{channel.name}</Text>
        {epg && (
          <Text style={st.cardEpg} numberOfLines={1}>{epg.epg.title}</Text>
        )}
        <View style={st.cardProgWrap}>
          <View style={[st.cardProgFill, { width: `${prog}%` as any, backgroundColor: accent }]} />
        </View>
        <View style={st.cardViewers}>
          <Feather name="eye" size={8} color="rgba(255,255,255,0.35)" />
          <Text style={st.cardViewersT}>{viewers}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FeaturedBanner — full-width live channel hero
// ═══════════════════════════════════════════════════════════════════════════════
function FeaturedBanner({
  channel, epg, onPress,
}: {
  channel: LiveChannel; epg?: EpgEntry; onPress: () => void;
}) {
  const sc    = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const [imgErr, setImgErr] = useState(false);
  const accent  = getAccent(channel.id);
  const prog    = epg ? calcProgress(epg.epg.start_date) : 35;
  const remain  = epg ? calcRemaining(epg.epg.start_date) : "AO VIVO";
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
        {!imgErr && channel.preview
          ? <Image source={{ uri: channel.preview }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setImgErr(true)} />
          : <LinearGradient colors={[`${accent}30`, "#080608"]} style={StyleSheet.absoluteFill} />
        }
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.98)"]} locations={[0.2, 1]} style={StyleSheet.absoluteFill} />
        <View style={[st.featAccentLine, { backgroundColor: accent }]} />

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

// ═══════════════════════════════════════════════════════════════════════════════
// CategoryTab
// ═══════════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════════
// SectionHeader
// ═══════════════════════════════════════════════════════════════════════════════
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

  const headerFade = useRef(new Animated.Value(0)).current;
  const gridFade   = useRef(new Animated.Value(0)).current;
  const featFade   = useRef(new Animated.Value(0)).current;
  const blink      = useRef(new Animated.Value(1)).current;

  const goTo = useCallback((item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"),
        id: String(item.tmdbId ?? item.id),
        title: item.title,
      },
    });
  }, [router]);

  const [channels,   setChannels]   = useState<LiveChannel[]>([]);
  const [categories, setCategories] = useState<LiveCategory[]>([]);
  const [epgs,       setEpgs]       = useState<EpgEntry[]>([]);
  const [jogos,      setJogos]      = useState<JogoEntry[]>([]);
  const [heroItems,  setHeroItems]  = useState<ContentItem[]>([]);
  const [activeCat,     setActiveCat]     = useState<number>(0);
  const [searchQ,       setSearchQ]       = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);

  useEffect(() => {
    getModalHistory("Ao Vivo").then(setSearchHistory).catch(() => {});
  }, []);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(blink, { toValue: 0.2, duration: 600, useNativeDriver: true }),
      Animated.timing(blink, { toValue: 1,   duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  const loadAll = useCallback(async () => {
    // Phase 1: hero banner from Flix 2.0 series catalog
    try {
      const serRes = await r2Route<{ success: boolean; data: any[] }>("/flix2/catalog?type=series&page=1");
      if (serRes.success && serRes.data?.length) {
        const IMG = "https://image.tmdb.org/t/p";
        const heroRaw = serRes.data
          .filter((i: any) => i.tmdb_id > 0 && (i.backdrop || i.poster))
          .slice(0, 8)
          .map((i: any): ContentItem => ({
            id: String(i.tmdb_id),
            tmdbId: Number(i.tmdb_id),
            title: i.title ?? i.name ?? "",
            year: parseInt(((i.release_date ?? i.first_air_date) || "2024").slice(0, 4)),
            rating: i.vote_average ?? i.rating ?? 0,
            posterPath:   i.poster   ? `${IMG}/w342${i.poster}`   : "",
            backdropPath: i.backdrop ? `${IMG}/w780${i.backdrop}` : "",
            description: i.overview ?? "",
            genres: i.genre_ids ?? [],
            type: "series",
            mediaType: "tv",
          }));
        if (heroRaw.length > 0) setHeroItems(heroRaw);
      }
    } catch {}

    // Phase 2: channels + rest
    try {
      const [channelsRes, epgsRes, jogosRes] = await Promise.allSettled([
        liveTvApi.getChannels(),
        liveTvApi.getEpgs(),
        liveTvApi.getJogos(),
      ]);

      if (channelsRes.status === "fulfilled") {
        setChannels(channelsRes.value.channels ?? []);
        setCategories(channelsRes.value.categories ?? []);
      }
      if (epgsRes.status === "fulfilled") setEpgs(epgsRes.value ?? []);
      if (jogosRes.status === "fulfilled") setJogos(jogosRes.value ?? []);
    } catch {}

    setLoading(false);
    setRefreshing(false);

    Animated.stagger(80, [
      Animated.timing(headerFade, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(featFade,   { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(gridFade,   { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    headerFade.setValue(0); featFade.setValue(0); gridFade.setValue(0);
    loadAll();
  }, [loadAll]);

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

  const goToJogo = useCallback((j: JogoEntry) => {
    if (!j.players.length) return;
    const url = j.players[0];
    const channelId = url.split("/").pop() ?? "live";
    const ch = channels.find((c) => c.url === url) ?? {
      id: channelId, name: j.title,
      image: j.data.teams.home.image, preview: j.image,
      url, categories: [1],
    };
    router.push({
      pathname: "/channel-detail",
      params: {
        channelId: ch.id,
        channelName: j.title,
        channelImage: ch.image,
        channelPreview: j.image,
        channelUrl: url,
        channelCategories: JSON.stringify([1]),
      },
    });
  }, [router, channels]);

  // ── Filtered channels ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = activeCat === 0
      ? channels
      : channels.filter((ch) => ch.categories?.includes(activeCat));
    if (searchQ.trim().length >= 2) {
      const q = searchQ.toLowerCase();
      list = list.filter((ch) => ch.name.toLowerCase().includes(q));
    }
    return list;
  }, [channels, activeCat, searchQ]);

  const featured = searchQ.length < 2 ? filtered[0] : undefined;
  const rest     = searchQ.length < 2 ? filtered.slice(1) : filtered;

  const isSearching = searchQ.length >= 2;

  const activeCategoryIds = new Set(channels.flatMap((ch) => ch.categories ?? []));
  const catTabs = [
    { id: 0, name: CATEGORY_LABELS[0] ?? "Todos" },
    ...MAIN_CATEGORIES.filter((id) => id !== 0 && activeCategoryIds.has(id))
      .map((id) => ({ id, name: CATEGORY_LABELS[id] ?? `Cat ${id}` })),
  ];

  const activeColor = CAT_COLORS[activeCat] ?? RED;

  // Jogos: live first, then upcoming, skip ended (unless all ended)
  const sortedJogos = useMemo(() => {
    const live     = jogos.filter((j) => jogoStatus(j.data.timer) === "live");
    const upcoming = jogos.filter((j) => jogoStatus(j.data.timer) === "upcoming");
    const ended    = jogos.filter((j) => jogoStatus(j.data.timer) === "ended");
    return [...live, ...upcoming, ...ended];
  }, [jogos]);

  const headerHeight = 160;

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* ── FLOATING HEADER ──────────────────────────────────────────────── */}
      <Animated.View style={[st.header, { paddingTop: topPad + 10, opacity: headerFade }]}>
        <LinearGradient
          colors={["rgba(0,0,0,0.97)", "rgba(0,0,0,0.7)", "transparent"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={st.headerInner}>
          <View style={st.headerLeft}>
            <View style={st.livePill}>
              <Animated.View style={[st.livePillDot, { opacity: blink }]} />
              <Text style={st.livePillT}>AO VIVO</Text>
            </View>
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <View style={st.logoAccent} />
                <Text style={st.headerTitleRed}>CANAIS</Text>
                <Text style={st.headerTitleWhite}> DE TV</Text>
              </View>
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
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.catScroll}
          style={{ marginTop: 8 }}
        >
          {catTabs.map((cat) => (
            <CategoryTab
              key={cat.id}
              label={cat.name}
              active={activeCat === cat.id}
              color={CAT_COLORS[cat.id] ?? RED}
              onPress={() => setActiveCat(cat.id)}
            />
          ))}
        </ScrollView>
      </Animated.View>

      {/* ── CONTENT ──────────────────────────────────────────────────────── */}
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
          contentContainerStyle={[st.grid, { paddingTop: topPad + headerHeight }]}
          columnWrapperStyle={st.gridRow}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing} onRefresh={onRefresh}
              tintColor={RED} colors={[RED]} progressViewOffset={topPad + 60}
            />
          }
          ListHeaderComponent={
            <>
              {/* Search bar */}
              <InlineSearchBar
                value={searchQ}
                onChangeText={setSearchQ}
                placeholder="Buscar canal ao vivo..."
                style={{ marginTop: 0, marginBottom: searchFocused && !searchQ && searchHistory.length > 0 ? 8 : 12 }}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onSubmitEditing={() => {
                  const t = searchQ.trim();
                  if (t) addToModalHistory("Ao Vivo", t)
                    .then(() => getModalHistory("Ao Vivo"))
                    .then(setSearchHistory)
                    .catch(() => {});
                }}
              />

              {/* Search history pills */}
              {searchFocused && !searchQ && searchHistory.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection:"row", alignItems:"center",
                    justifyContent:"space-between", paddingHorizontal:16, marginBottom:8 }}>
                    <Text style={{ color:"rgba(255,255,255,0.38)", fontSize:11,
                      fontWeight:"700", letterSpacing:0.5, textTransform:"uppercase" }}>
                      Buscas recentes
                    </Text>
                    <TouchableOpacity
                      onPress={() => { clearModalHistory("Ao Vivo").then(() => setSearchHistory([])).catch(() => {}); }}
                      hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                      <Text style={{ color:`${RED}99`, fontSize:11, fontWeight:"600" }}>Limpar</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="always"
                    contentContainerStyle={{ paddingHorizontal:16, gap:8 }}
                    style={{ flexGrow:0 }}>
                    {searchHistory.map((h, i) => (
                      <View key={i} style={{ flexDirection:"row", alignItems:"center",
                        borderRadius:20, overflow:"hidden",
                        backgroundColor:`${RED}15`, borderWidth:1, borderColor:`${RED}35` }}>
                        <TouchableOpacity
                          onPress={() => { setSearchQ(h); setSearchFocused(false);
                            addToModalHistory("Ao Vivo", h).then(() => getModalHistory("Ao Vivo"))
                              .then(setSearchHistory).catch(() => {}); }}
                          activeOpacity={0.75}
                          style={{ flexDirection:"row", alignItems:"center", gap:6,
                            paddingLeft:12, paddingRight:6, paddingVertical:7 }}>
                          <Feather name="clock" size={10} color={`${RED}cc`} />
                          <Text style={{ color:"rgba(255,255,255,0.82)", fontSize:12,
                            fontWeight:"600", maxWidth:140 }} numberOfLines={1}>{h}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => { removeFromModalHistory("Ao Vivo", h).then(setSearchHistory).catch(() => {}); }}
                          hitSlop={{ top:8, bottom:8, left:4, right:10 }}
                          activeOpacity={0.7}
                          style={{ paddingRight:10, paddingLeft:2, paddingVertical:7 }}>
                          <Feather name="x" size={10} color={`${RED}99`} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Jogos section — hidden while searching */}
              {!isSearching && sortedJogos.length > 0 && (
                <Animated.View style={{ opacity: featFade }}>
                  <SectionHeader
                    title="Partidas de Hoje"
                    count={sortedJogos.length}
                    accentColor={GREEN}
                  />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={st.jogosScroll}
                    style={{ marginBottom: 20 }}
                  >
                    {sortedJogos.map((j, i) => (
                      <JogoCard key={`${j.title}-${i}`} jogo={j} onPress={() => goToJogo(j)} />
                    ))}
                  </ScrollView>
                </Animated.View>
              )}

              {/* Featured banner — hidden while searching */}
              {!isSearching && featured && (
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
                  title={isSearching ? `Resultados para "${searchQ}"` : "Todos os Canais"}
                  count={rest.length}
                  accentColor={activeColor}
                />
              </Animated.View>
            </>
          }
          ListEmptyComponent={
            <View style={st.noChannels}>
              <Feather name={isSearching ? "search" : "tv"} size={40} color="rgba(255,255,255,0.07)" />
              <Text style={st.noChannelsT}>
                {isSearching ? "Nenhum canal encontrado" : "Nenhum canal nesta categoria"}
              </Text>
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
// STYLES — Channel cards
// ═══════════════════════════════════════════════════════════════════════════════
const st = StyleSheet.create({
  root: { flex: 1 },

  header:       { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, paddingBottom: 8 },
  headerInner:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18 },
  headerLeft:   { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle:      { fontSize: 24, fontWeight: "900", color: "#fff", letterSpacing: -0.5 },
  headerTitleRed:   { fontSize: 22, fontWeight: "900", color: RED,   letterSpacing: 1.2 },
  headerTitleWhite: { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: 1.2 },
  logoAccent:       { width: 4, height: 20, borderRadius: 2, backgroundColor: RED, marginRight: 2 },
  headerSub:    { fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: "500", marginTop: 1 },
  refreshBtn:   { width: 38, height: 38, alignItems: "center", justifyContent: "center",
    borderRadius: 19, backgroundColor: "rgba(255,255,255,0.08)" },

  livePill:    { flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(229,9,20,0.2)", borderWidth: 1, borderColor: "rgba(229,9,20,0.5)",
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  livePillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: RED },
  livePillT:   { color: RED, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },

  catScroll: { paddingHorizontal: 16, gap: 6 },
  catTab:    { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)" },
  catTabDot: { width: 5, height: 5, borderRadius: 2.5 },
  catTabT:   { fontSize: 12, fontWeight: "700" },

  // Featured
  featPad:         { paddingHorizontal: 16, marginBottom: 20 },
  featCard:        { height: 200, borderRadius: 20, overflow: "hidden", backgroundColor: "#0d0a1a",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 18 }, android: { elevation: 14 } }) },
  featAccentLine:  { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  featTop:         { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  featLogoWrap:    { width: 56, height: 56, borderRadius: 14, borderWidth: 1, overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  featLogo:        { width: "100%", height: "100%" },
  featTopInfo:     { flex: 1, gap: 3 },
  featLiveBadge:   { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    backgroundColor: "rgba(34,197,94,0.15)", borderWidth: 1, borderColor: "rgba(34,197,94,0.4)",
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  featLiveDot:     { width: 6, height: 6, borderRadius: 3 },
  featLiveBadgeT:  { fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  featChannelName: { color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  featPlayBtn:     { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8 }, android: { elevation: 6 } }) },
  featEpgRow:      { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  featEpgDot:      { width: 3, height: "100%" as any, borderRadius: 2, marginTop: 3 },
  featEpgTitle:    { color: "#fff", fontSize: 13, fontWeight: "700" },
  featEpgDesc:     { color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: "400", marginTop: 2, lineHeight: 15 },
  featMeta:        { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 14, gap: 6 },
  featProgWrap:    { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" },
  featProgFill:    { height: "100%", borderRadius: 2 },
  featMetaRow:     { flexDirection: "row", justifyContent: "space-between" },
  featMetaLeft:    { flexDirection: "row", alignItems: "center", gap: 4 },
  featMetaRight:   { flexDirection: "row", alignItems: "center", gap: 4 },
  featMetaT:       { color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: "500" },

  // Jogos scroll
  jogosScroll: { paddingHorizontal: 16, gap: 12 },

  // Grid
  grid:    { paddingHorizontal: 16 },
  gridRow: { gap: 10, marginBottom: 10 },

  // Section header
  secHead:   { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, marginTop: 4 },
  secBar:    { width: 3, height: 18, borderRadius: 2 },
  secTitle:  { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: -0.3, flex: 1 },
  secBadge:  { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  secBadgeT: { fontSize: 11, fontWeight: "700" },

  // Channel card
  card:          { width: CARD_W, borderRadius: 14, overflow: "hidden", backgroundColor: "#0f0c14",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 }, android: { elevation: 5 } }) },
  cardAccentBar: { height: 3 },
  cardLogoWrap:  { width: "100%", height: CARD_W * 0.6, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)", padding: 12 },
  cardLogo:      { width: "100%", height: "100%", borderRadius: 8 },
  liveBadge:     { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    marginHorizontal: 8, marginTop: 6, backgroundColor: "rgba(229,9,20,0.18)", borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: "rgba(229,9,20,0.4)" },
  liveDot:       { width: 5, height: 5, borderRadius: 2.5, backgroundColor: RED },
  liveBadgeT:    { color: RED, fontSize: 7, fontWeight: "900", letterSpacing: 1.2 },
  cardName:      { color: "#fff", fontSize: 11, fontWeight: "700", marginHorizontal: 8, marginTop: 5, letterSpacing: -0.2 },
  cardEpg:       { color: "rgba(255,255,255,0.4)", fontSize: 9, fontWeight: "500", marginHorizontal: 8, marginTop: 2 },
  cardProgWrap:  { height: 2, marginHorizontal: 8, marginTop: 6, borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  cardProgFill:  { height: "100%", borderRadius: 1 },
  cardViewers:   { flexDirection: "row", alignItems: "center", gap: 3, marginHorizontal: 8, marginTop: 5, marginBottom: 8 },
  cardViewersT:  { color: "rgba(255,255,255,0.3)", fontSize: 8, fontWeight: "500" },

  // Loading / empty
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingT:    { color: "#fff", fontSize: 16, fontWeight: "700" },
  loadingHint: { color: "rgba(255,255,255,0.35)", fontSize: 12 },
  emptyWrap:   { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyTitle:  { color: "#fff", fontSize: 20, fontWeight: "800" },
  emptyHint:   { color: "rgba(255,255,255,0.35)", fontSize: 13, textAlign: "center" },
  retryBtn:    { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 12, marginTop: 8 },
  retryT:      { color: "#fff", fontSize: 14, fontWeight: "700" },
  noChannels:  { alignItems: "center", paddingTop: 40, gap: 12 },
  noChannelsT: { color: "rgba(255,255,255,0.25)", fontSize: 14, fontWeight: "600" },
});

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES — Jogo cards
// ═══════════════════════════════════════════════════════════════════════════════
const jst = StyleSheet.create({
  card: {
    width: JOGO_W,
    borderRadius: 18,
    backgroundColor: "#0e0a18",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: 14,
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  cardEnded: { opacity: 0.45 },

  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  league: { color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: "700", flex: 1, letterSpacing: 0.5 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  liveDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusT: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },

  teamsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  teamCol: { flex: 1, alignItems: "center", gap: 6 },
  teamImgWrap: { width: 50, height: 50, borderRadius: 25, overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center" },
  teamImg: { width: 44, height: 44 },
  teamName: { color: "#fff", fontSize: 10, fontWeight: "700", textAlign: "center", lineHeight: 13 },

  vs: { alignItems: "center", justifyContent: "center", width: 28 },
  vsT: { color: "rgba(255,255,255,0.2)", fontSize: 11, fontWeight: "900" },

  playersRow: { flexDirection: "row", alignItems: "center", gap: 6,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", paddingTop: 8, marginTop: 2 },
  playersT: { flex: 1, color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: "500" },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: RED, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  playT: { color: "#fff", fontSize: 9, fontWeight: "800" },
});
