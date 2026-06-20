/**
 * tv-channel.tsx — Tela de detalhe de um canal de TV
 *
 * Mostra:
 *   - Hero com identidade visual do canal (cor, nome, tagline)
 *   - Programa atual + próximo (TVmaze schedule)
 *   - Timeline da programação do dia
 *   - Conteúdo do canal (séries + filmes via TMDB)
 *   - Estreias da semana
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tvApi } from "@/lib/api";
import { loadFavorites, toggleFavorite, isFavorite } from "@/lib/tv-favorites";

const { width: W, height: H } = Dimensions.get("window");
const IS_WEB = Platform.OS === "web";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChannelDef {
  id: string;
  name: string;
  shortName: string;
  description: string;
  tagline: string;
  category: string;
  color: string;
  bgColor: string;
  accentColor: string;
  tvmazeNetworkId: number | null;
  tmdbNetworkId: number | null;
}

interface ScheduleEpisode {
  id: number;
  name: string;
  season: number;
  number: number;
  airtime: string;
  airstamp: string;
  runtime: number;
  show: {
    id: number;
    name: string;
    genres: string[];
    image: { medium: string; original: string } | null;
    rating: { average: number | null };
    summary: string | null;
  };
}

interface ContentItem {
  tmdbId: number;
  type: "tv" | "movie";
  title: string;
  year: number;
  rating: number;
  poster: string | null;
  backdrop: string | null;
  overview: string;
  genreIds: number[];
}

interface PremiereItem {
  tmdbId: number;
  type: "tv" | "movie";
  title: string;
  year: number;
  rating: number;
  poster: string | null;
  backdrop: string | null;
  releaseDate: string | null;
  overview: string;
}

interface CarouselSection {
  id: string;
  title: string;
  items: ContentItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTime(airtime: string): Date {
  const [h, m] = airtime.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function formatTime(airtime: string): string {
  if (!airtime) return "";
  const [h, m] = airtime.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, "0")} ${period}`;
}

function formatTimeBR(airtime: string): string {
  if (!airtime) return "";
  return airtime.slice(0, 5);
}

function calcProgress(ep: ScheduleEpisode): number {
  const now = new Date();
  const start = parseTime(ep.airtime);
  const end = new Date(start.getTime() + (ep.runtime ?? 60) * 60 * 1000);
  if (now < start) return 0;
  if (now > end) return 1;
  return (now.getTime() - start.getTime()) / ((ep.runtime ?? 60) * 60 * 1000);
}

function isNowOrSoon(ep: ScheduleEpisode): "live" | "soon" | "past" | "future" {
  const now = new Date();
  const start = parseTime(ep.airtime);
  const end = new Date(start.getTime() + (ep.runtime ?? 60) * 60 * 1000);
  if (now > end) return "past";
  if (now >= start) return "live";
  const diff = (start.getTime() - now.getTime()) / 60000;
  if (diff <= 60) return "soon";
  return "future";
}

function stripHtml(html: string | null): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").trim();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PulsingDot({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (IS_WEB) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View
      style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, opacity: anim, marginRight: 4 }}
    />
  );
}

function LiveBadge({ color }: { color: string }) {
  return (
    <View style={[st.liveBadge, { backgroundColor: color + "22", borderColor: color + "55" }]}>
      <PulsingDot color={color} />
      <Text style={[st.liveBadgeText, { color }]}>AO VIVO</Text>
    </View>
  );
}

function ScheduleItem({
  ep,
  accent,
  isCurrentlyLive,
  onPress,
}: {
  ep: ScheduleEpisode;
  accent: string;
  isCurrentlyLive: boolean;
  onPress: (ep: ScheduleEpisode) => void;
}) {
  const status = isNowOrSoon(ep);
  const progress = isCurrentlyLive ? calcProgress(ep) : 0;

  return (
    <Pressable onPress={() => onPress(ep)} style={[st.schedItem, isCurrentlyLive && { borderColor: accent + "55" }]}>
      {/* Time column */}
      <View style={st.schedTime}>
        <Text style={[st.schedTimeText, isCurrentlyLive && { color: accent }]}>
          {formatTimeBR(ep.airtime)}
        </Text>
        {isCurrentlyLive && <LiveBadge color={accent} />}
        {status === "soon" && (
          <View style={[st.soonBadge, { backgroundColor: accent + "22", borderColor: accent + "44" }]}>
            <Text style={[st.soonText, { color: accent }]}>EM BREVE</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={st.schedContent}>
        <Text style={[st.schedShow, isCurrentlyLive && { color: "#fff" }]} numberOfLines={1}>
          {ep.show.name}
        </Text>
        {ep.name && ep.name !== ep.show.name && (
          <Text style={st.schedEp} numberOfLines={1}>
            {ep.season > 0 ? `T${ep.season}E${ep.number} · ` : ""}{ep.name}
          </Text>
        )}
        {ep.show.genres.length > 0 && (
          <Text style={st.schedGenre} numberOfLines={1}>{ep.show.genres.slice(0, 2).join(" · ")}</Text>
        )}
        {/* Progress bar for live */}
        {isCurrentlyLive && (
          <View style={st.progressBg}>
            <View style={[st.progressFill, { width: `${Math.round(progress * 100)}%` as any, backgroundColor: accent }]} />
          </View>
        )}
      </View>

      {/* Thumb */}
      {ep.show.image?.medium ? (
        <Image source={{ uri: ep.show.image.medium }} style={st.schedThumb} contentFit="cover" />
      ) : (
        <LinearGradient colors={[accent + "33", "#0a0a0a"]} style={st.schedThumb} />
      )}
    </Pressable>
  );
}

function ContentCard({
  item,
  onPress,
  cardWidth,
}: {
  item: ContentItem;
  onPress: (item: ContentItem) => void;
  cardWidth?: number;
}) {
  const cardStyle = cardWidth ? [st.contentCard, { width: cardWidth }] : st.contentCard;
  return (
    <TouchableOpacity onPress={() => onPress(item)} style={cardStyle} activeOpacity={0.8}>
      <View style={st.contentPoster}>
        {item.poster ? (
          <Image source={{ uri: item.poster }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : (
          <LinearGradient colors={["#1a1a2e", "#16213e"]} style={{ flex: 1 }} />
        )}
        <View style={[st.contentTypeBadge, { backgroundColor: item.type === "movie" ? "#e5091422" : "#3b82f622" }]}>
          <Text style={[st.contentTypeText, { color: item.type === "movie" ? "#e50914" : "#3b82f6" }]}>
            {item.type === "movie" ? "FILME" : "SÉRIE"}
          </Text>
        </View>
      </View>
      <Text style={st.contentTitle} numberOfLines={2}>{item.title}</Text>
      {item.rating > 0 && (
        <View style={st.contentRating}>
          <Feather name="star" size={9} color="#ffd700" />
          <Text style={st.contentRatingText}>{item.rating.toFixed(1)}</Text>
          <Text style={st.contentYear}>{item.year}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── ContentGrid — View-based grid (no nested FlatList) to avoid scroll deadlock
function ContentGrid({ items, onPress }: { items: ContentItem[]; onPress: (item: ContentItem) => void }) {
  const CARD_W = (W - 32 - 16) / 3; // 3 columns, 16px padding each side, 8px gaps
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 8 }}>
      {items.map((item) => (
        <ContentCard key={`cg-${item.tmdbId}-${item.type}`} item={item} onPress={onPress} cardWidth={CARD_W} />
      ))}
    </View>
  );
}

// ── CarouselCard — wider card for horizontal carousels ────────────────────────
const CAROUSEL_CARD_W = 110;
function CarouselCard({ item, onPress }: { item: ContentItem; onPress: (item: ContentItem) => void }) {
  return (
    <TouchableOpacity onPress={() => onPress(item)} style={{ width: CAROUSEL_CARD_W }} activeOpacity={0.8}>
      <View style={st.carouselPoster}>
        {item.poster ? (
          <Image source={{ uri: item.poster }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : (
          <LinearGradient colors={["#1a1a2e", "#16213e"]} style={{ flex: 1 }} />
        )}
        <View style={[
          st.carouselTypeBadge,
          { backgroundColor: item.type === "movie" ? "#e5091422" : "#3b82f622" },
        ]}>
          <Text style={[st.carouselTypeText, { color: item.type === "movie" ? "#e50914" : "#3b82f6" }]}>
            {item.type === "movie" ? "FILME" : "SÉRIE"}
          </Text>
        </View>
      </View>
      <Text style={st.carouselTitle} numberOfLines={2}>{item.title}</Text>
      {item.rating > 0 && (
        <View style={st.carouselMeta}>
          <Feather name="star" size={9} color="#ffd700" />
          <Text style={st.carouselRating}>{item.rating.toFixed(1)}</Text>
          <Text style={st.carouselYear}>{item.year}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── HorizontalCarousel ────────────────────────────────────────────────────────
function HorizontalCarousel({
  section,
  accent,
  onPress,
}: {
  section: CarouselSection;
  accent: string;
  onPress: (item: ContentItem) => void;
}) {
  if (section.items.length === 0) return null;
  return (
    <View style={st.carouselSection}>
      <View style={[st.sectionHeader, { marginBottom: 10 }]}>
        <View style={[st.sectionBar, { backgroundColor: accent }]} />
        <Text style={st.sectionTitle}>{section.title}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
      >
        {section.items.map((item) => (
          <CarouselCard key={`${section.id}-${item.tmdbId}-${item.type}`} item={item} onPress={onPress} />
        ))}
      </ScrollView>
    </View>
  );
}

function PremiereCard({
  item,
  accent,
  onPress,
}: {
  item: PremiereItem;
  accent: string;
  onPress: (item: PremiereItem) => void;
}) {
  const dateStr = item.releaseDate
    ? new Date(item.releaseDate + "T00:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
    : null;

  return (
    <TouchableOpacity onPress={() => onPress(item)} activeOpacity={0.8} style={st.premiereCard}>
      <View style={st.premierePosterWrap}>
        {item.backdrop ? (
          <Image source={{ uri: item.backdrop }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : item.poster ? (
          <Image source={{ uri: item.poster }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : (
          <LinearGradient colors={[accent + "44", "#111"]} style={{ flex: 1 }} />
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.85)"]}
          style={StyleSheet.absoluteFill}
        />
        {dateStr && (
          <View style={[st.premiereDate, { backgroundColor: accent }]}>
            <Text style={st.premiereDateText}>{dateStr}</Text>
          </View>
        )}
      </View>
      <Text style={st.premiereTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={st.premiereType}>{item.type === "movie" ? "🎬 Filme" : "📺 Série"}</Text>
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function TvChannelScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    channelId: string;
    channelJson?: string;
  }>();

  const channelId = params.channelId ?? "";
  const channel: ChannelDef | null = params.channelJson
    ? (() => { try { return JSON.parse(params.channelJson); } catch { return null; } })()
    : null;

  const accent = channel?.color ?? "#e50914";
  const bgColor = channel?.bgColor ?? "#0a0a0a";
  const accentColor = channel?.accentColor ?? accent;

  // State
  const [schedule, setSchedule] = useState<ScheduleEpisode[]>([]);
  const [schedLoading, setSchedLoading] = useState(true);
  const [content, setContent] = useState<{ shows: ContentItem[]; movies: ContentItem[] }>({ shows: [], movies: [] });
  const [contentLoading, setContentLoading] = useState(true);
  const [premieres, setPremieres] = useState<{ series: PremiereItem[]; movies: PremiereItem[] }>({ series: [], movies: [] });
  const [premiereLoading, setPremiereLoading] = useState(true);
  const [seriesCarousels, setSeriesCarousels] = useState<CarouselSection[]>([]);
  const [movieCarousels, setMovieCarousels] = useState<CarouselSection[]>([]);
  const [carouselLoading, setCarouselLoading] = useState(true);
  const [tab, setTab] = useState<"guide" | "series" | "movies" | "premieres">("guide");
  const scrollY = useRef(new Animated.Value(0)).current;

  // Favorites
  const [favorites, setFavorites] = useState<string[]>([]);
  const fav = isFavorite(channelId, favorites);

  useEffect(() => {
    loadFavorites().then(setFavorites).catch(() => {});
  }, []);

  const handleToggleFav = useCallback(async () => {
    const { favorites: next } = await toggleFavorite(channelId);
    setFavorites(next);
  }, [channelId]);

  // Load schedule
  useEffect(() => {
    tvApi.getChannelSchedule(channelId)
      .then((r) => { if (r.ok) setSchedule((r.episodes ?? []) as ScheduleEpisode[]); })
      .catch(() => {})
      .finally(() => setSchedLoading(false));
  }, [channelId]);

  // Load content
  useEffect(() => {
    tvApi.getChannelContent(channelId)
      .then((r) => { if (r.ok) setContent({ shows: (r.shows ?? []) as ContentItem[], movies: (r.movies ?? []) as ContentItem[] }); })
      .catch(() => {})
      .finally(() => setContentLoading(false));
  }, [channelId]);

  // Load premieres (channel-specific)
  useEffect(() => {
    tvApi.getChannelPremieres(channelId)
      .then((r) => { if (r.ok) setPremieres({ series: (r.series ?? []) as PremiereItem[], movies: (r.movies ?? []) as PremiereItem[] }); })
      .catch(() => {})
      .finally(() => setPremiereLoading(false));
  }, [channelId]);

  // Load carousels
  useEffect(() => {
    tvApi.getChannelCarousels(channelId)
      .then((r) => {
        if (r.ok) {
          setSeriesCarousels((r.seriesCarousels ?? []) as CarouselSection[]);
          setMovieCarousels((r.movieCarousels ?? []) as CarouselSection[]);
        }
      })
      .catch(() => {})
      .finally(() => setCarouselLoading(false));
  }, [channelId]);

  // Current + next program
  const now = new Date();
  const liveEp = schedule.find((ep) => {
    const start = parseTime(ep.airtime);
    const end = new Date(start.getTime() + (ep.runtime ?? 60) * 60 * 1000);
    return now >= start && now <= end;
  });
  const nextEp = schedule.find((ep) => {
    const start = parseTime(ep.airtime);
    return start > now;
  });

  const goToDetail = useCallback(
    (item: { tmdbId: number; type: string; title: string; poster?: string | null }) => {
      router.push({
        pathname: "/detail",
        params: {
          type: item.type,
          id: String(item.tmdbId),
          title: item.title,
          poster: item.poster ?? "",
        },
      });
    },
    [router]
  );

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const HERO_H = Math.round(H * 0.38);
  const topPad = IS_WEB ? 67 : insets.top;
  const bottomPad = IS_WEB ? 100 : insets.bottom + 80;

  return (
    <View style={[st.root, { backgroundColor: "#050505" }]}>
      <StatusBar style="light" />

      {/* Sticky header (shows on scroll) */}
      <Animated.View style={[st.stickyHeader, { opacity: headerOpacity, paddingTop: topPad }]}>
        <LinearGradient colors={[bgColor, "transparent"]} style={StyleSheet.absoluteFill} />
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Feather name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={st.stickyTitle} numberOfLines={1}>{channel?.shortName ?? channelId}</Text>
        <TouchableOpacity onPress={handleToggleFav} style={st.backBtn}>
          <Feather name="heart" size={18} color={fav ? accent : "rgba(255,255,255,0.45)"} />
        </TouchableOpacity>
      </Animated.View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: bottomPad }}
      >
        {/* ══ HERO ════════════════════════════════════════════════════════════ */}
        <View style={[st.hero, { height: HERO_H }]}>
          {/* Background gradient */}
          <LinearGradient
            colors={[bgColor, accent + "44", "#050505"]}
            locations={[0, 0.6, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* Live program backdrop */}
          {liveEp?.show.image?.original && (
            <Image
              source={{ uri: liveEp.show.image.original }}
              style={[StyleSheet.absoluteFill, { opacity: 0.18 }]}
              contentFit="cover"
            />
          )}
          <LinearGradient
            colors={["transparent", "rgba(5,5,5,0.92)"]}
            style={[StyleSheet.absoluteFill, { top: "40%" }]}
          />

          {/* Back button */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={[st.heroBack, { top: topPad + 8 }]}
          >
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>

          {/* Fav button */}
          <TouchableOpacity
            onPress={handleToggleFav}
            style={[st.heroFavBtn, { top: topPad + 8 }]}
          >
            <Feather
              name="heart"
              size={18}
              color={fav ? accent : "rgba(255,255,255,0.45)"}
            />
          </TouchableOpacity>

          {/* Channel identity */}
          <View style={st.heroContent}>
            {/* Channel badge */}
            <View style={[st.channelBadge, { backgroundColor: accent, shadowColor: accent }]}>
              <Text style={st.channelBadgeText}>{channel?.shortName ?? channelId.toUpperCase()}</Text>
            </View>
            <Text style={st.heroName}>{channel?.name ?? channelId}</Text>
            {channel?.tagline && <Text style={st.heroTagline}>{channel.tagline}</Text>}

            {/* Live program pill */}
            {liveEp && (
              <View style={[st.liveNowPill, { borderColor: accent + "55", backgroundColor: accent + "15" }]}>
                <PulsingDot color={accent} />
                <Text style={[st.liveNowText, { color: accent }]}>AO VIVO · </Text>
                <Text style={st.liveNowShow} numberOfLines={1}>{liveEp.show.name}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ══ CURRENT PROGRAM CARD ════════════════════════════════════════════ */}
        {(liveEp || nextEp) && (
          <View style={st.nowCard}>
            <LinearGradient
              colors={[bgColor + "cc", "#111"]}
              style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
            />
            <View style={st.nowCardInner}>
              {liveEp ? (
                <>
                  <View style={st.nowCardHeader}>
                    <LiveBadge color={accent} />
                    <Text style={st.nowCardTime}>{formatTimeBR(liveEp.airtime)} · {liveEp.runtime ?? 60} min</Text>
                  </View>
                  <Text style={st.nowCardTitle}>{liveEp.show.name}</Text>
                  {liveEp.name && liveEp.name !== liveEp.show.name && (
                    <Text style={st.nowCardEp}>
                      {liveEp.season > 0 ? `Temporada ${liveEp.season}, Ep ${liveEp.number} — ` : ""}
                      {liveEp.name}
                    </Text>
                  )}
                  {liveEp.show.genres.length > 0 && (
                    <Text style={st.nowCardGenre}>{liveEp.show.genres.slice(0, 3).join(" · ")}</Text>
                  )}
                  {liveEp.show.summary && (
                    <Text style={st.nowCardSummary} numberOfLines={2}>
                      {stripHtml(liveEp.show.summary)}
                    </Text>
                  )}
                  {/* Progress bar */}
                  <View style={st.progressBgLarge}>
                    <View
                      style={[
                        st.progressFillLarge,
                        { width: `${Math.round(calcProgress(liveEp) * 100)}%` as any, backgroundColor: accent },
                      ]}
                    />
                  </View>
                </>
              ) : nextEp ? (
                <>
                  <Text style={st.nextLabel}>A SEGUIR</Text>
                  <Text style={st.nowCardTitle}>{nextEp.show.name}</Text>
                  <Text style={st.nowCardTime}>{formatTimeBR(nextEp.airtime)}</Text>
                </>
              ) : null}
            </View>

            {/* Show thumbnail */}
            {(liveEp ?? nextEp)?.show.image?.medium && (
              <Image
                source={{ uri: (liveEp ?? nextEp)!.show.image!.medium }}
                style={st.nowCardThumb}
                contentFit="cover"
              />
            )}
          </View>
        )}

        {/* ══ TAB SELECTOR ═══════════════════════════════════════════════════ */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={st.tabsScroll}
          contentContainerStyle={st.tabsContent}
        >
          {(
            [
              { key: "guide", label: "Programação", icon: "clock" },
              { key: "series", label: "Séries", icon: "tv" },
              { key: "movies", label: "Filmes", icon: "film" },
              { key: "premieres", label: "Estreias", icon: "star" },
            ] as const
          ).map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[st.tabPill, tab === t.key && { backgroundColor: accent, borderColor: accent }]}
              activeOpacity={0.75}
            >
              <Feather name={t.icon as any} size={12} color={tab === t.key ? "#fff" : "rgba(255,255,255,0.45)"} />
              <Text style={[st.tabPillText, tab === t.key && { color: "#fff" }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ══ TAB CONTENT ════════════════════════════════════════════════════ */}

        {/* GUIDE */}
        {tab === "guide" && (
          <View style={st.section}>
            <View style={st.sectionHeader}>
              <View style={[st.sectionBar, { backgroundColor: accent }]} />
              <Feather name="clock" size={13} color={accent} />
              <Text style={st.sectionTitle}>Programação de Hoje</Text>
            </View>
            {schedLoading ? (
              <ActivityIndicator color={accent} style={{ marginTop: 24 }} />
            ) : schedule.length > 0 ? (
              <View style={st.schedList}>
                {schedule.map((ep) => {
                  const isLive = liveEp?.id === ep.id;
                  return (
                    <ScheduleItem
                      key={ep.id}
                      ep={ep}
                      accent={accent}
                      isCurrentlyLive={isLive}
                      onPress={(e) => {
                        if (e.show?.id) {
                          router.push({
                            pathname: "/detail",
                            params: { type: "tv", id: "0", title: e.show.name },
                          });
                        }
                      }}
                    />
                  );
                })}
              </View>
            ) : (
              /* No TVmaze data — show popular shows/movies from this channel as fallback */
              <>
                {(contentLoading) ? (
                  <ActivityIndicator color={accent} style={{ marginTop: 24 }} />
                ) : (content.shows.length === 0 && content.movies.length === 0) ? (
                  <View style={st.empty}>
                    <Feather name="tv" size={32} color="rgba(255,255,255,0.15)" />
                    <Text style={st.emptyText}>Grade não disponível para este canal</Text>
                    <Text style={st.emptySubText}>Veja as abas Séries e Filmes para o conteúdo do canal</Text>
                  </View>
                ) : (
                  <>
                    <View style={[st.noSchedBanner, { borderColor: accent + "44", backgroundColor: accent + "0d" }]}>
                      <Feather name="info" size={12} color={accent} />
                      <Text style={[st.noSchedBannerText, { color: accent }]}>
                        Grade de horários não disponível. Veja o que passa neste canal:
                      </Text>
                    </View>
                    {content.shows.length > 0 && (
                      <>
                        <View style={[st.sectionHeader, { marginTop: 12 }]}>
                          <Feather name="tv" size={12} color="rgba(255,255,255,0.5)" />
                          <Text style={[st.sectionTitle, { fontSize: 12, color: "rgba(255,255,255,0.5)" }]}>Séries</Text>
                        </View>
                        <ContentGrid items={content.shows.slice(0, 9)} onPress={goToDetail} />
                      </>
                    )}
                    {content.movies.length > 0 && (
                      <>
                        <View style={[st.sectionHeader, { marginTop: 12 }]}>
                          <Feather name="film" size={12} color="rgba(255,255,255,0.5)" />
                          <Text style={[st.sectionTitle, { fontSize: 12, color: "rgba(255,255,255,0.5)" }]}>Filmes</Text>
                        </View>
                        <ContentGrid items={content.movies.slice(0, 9)} onPress={goToDetail} />
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </View>
        )}

        {/* SERIES */}
        {tab === "series" && (
          <View style={st.section}>
            {carouselLoading ? (
              <ActivityIndicator color={accent} style={{ marginTop: 40 }} />
            ) : seriesCarousels.length === 0 ? (
              <View style={st.empty}>
                <Feather name="tv" size={32} color="rgba(255,255,255,0.15)" />
                <Text style={st.emptyText}>Nenhuma série encontrada</Text>
              </View>
            ) : (
              seriesCarousels.map((section) => (
                <HorizontalCarousel
                  key={section.id}
                  section={section}
                  accent={accent}
                  onPress={goToDetail}
                />
              ))
            )}
          </View>
        )}

        {/* MOVIES */}
        {tab === "movies" && (
          <View style={st.section}>
            {carouselLoading ? (
              <ActivityIndicator color={accent} style={{ marginTop: 40 }} />
            ) : movieCarousels.length === 0 ? (
              <View style={st.empty}>
                <Feather name="film" size={32} color="rgba(255,255,255,0.15)" />
                <Text style={st.emptyText}>Nenhum filme encontrado</Text>
              </View>
            ) : (
              movieCarousels.map((section) => (
                <HorizontalCarousel
                  key={section.id}
                  section={section}
                  accent={accent}
                  onPress={goToDetail}
                />
              ))
            )}
          </View>
        )}

        {/* PREMIERES */}
        {tab === "premieres" && (
          <View style={st.section}>
            {/* Series premieres */}
            <View style={st.sectionHeader}>
              <View style={[st.sectionBar, { backgroundColor: accent }]} />
              <Feather name="star" size={13} color={accent} />
              <Text style={st.sectionTitle}>Séries Estreando</Text>
            </View>
            {premiereLoading ? (
              <ActivityIndicator color={accent} style={{ marginTop: 24 }} />
            ) : premieres.series.length === 0 ? null : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10, marginBottom: 24 }}>
                {premieres.series.map((item) => (
                  <PremiereCard key={`ps-${item.tmdbId}`} item={item} accent={accent} onPress={goToDetail} />
                ))}
              </ScrollView>
            )}

            {/* Movie premieres */}
            <View style={st.sectionHeader}>
              <View style={[st.sectionBar, { backgroundColor: accentColor }]} />
              <Feather name="film" size={13} color={accentColor} />
              <Text style={st.sectionTitle}>Filmes Estreando</Text>
            </View>
            {premiereLoading ? (
              <ActivityIndicator color={accentColor} style={{ marginTop: 24 }} />
            ) : premieres.movies.length === 0 ? (
              <View style={st.empty}>
                <Text style={st.emptyText}>Nenhuma estreia encontrada</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10, marginBottom: 24 }}>
                {premieres.movies.map((item) => (
                  <PremiereCard key={`pm-${item.tmdbId}`} item={item} accent={accentColor} onPress={goToDetail} />
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* ══ CHANNEL DESCRIPTION ════════════════════════════════════════════ */}
        {channel?.description && (
          <View style={[st.descCard, { borderColor: accent + "22" }]}>
            <LinearGradient colors={[bgColor + "aa", "#111"]} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
            <Text style={[st.descTitle, { color: accent }]}>Sobre o Canal</Text>
            <Text style={st.descText}>{channel.description}</Text>
            <View style={st.descMeta}>
              <View style={[st.catBadge, { backgroundColor: accent + "22", borderColor: accent + "44" }]}>
                <Text style={[st.catText, { color: accent }]}>{channel.category.toUpperCase()}</Text>
              </View>
            </View>
          </View>
        )}
      </Animated.ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1 },

  // Sticky header
  stickyHeader: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 100,
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12,
  },
  stickyTitle: { flex: 1, fontSize: 16, fontWeight: "800", color: "#fff", textAlign: "center" },

  // Hero
  hero: { position: "relative", justifyContent: "flex-end" },
  heroBack: {
    position: "absolute", left: 16, zIndex: 10,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center", justifyContent: "center",
  },
  heroFavBtn: {
    position: "absolute", right: 16, zIndex: 10,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center", justifyContent: "center",
  },
  heroContent: { paddingHorizontal: 20, paddingBottom: 20 },
  channelBadge: {
    alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5,
    marginBottom: 10, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
  channelBadgeText: { fontSize: 13, fontWeight: "900", color: "#fff", letterSpacing: 0.5 },
  heroName: { fontSize: 28, fontWeight: "900", color: "#fff", letterSpacing: -0.5, marginBottom: 4 },
  heroTagline: { fontSize: 13, color: "rgba(255,255,255,0.55)", fontStyle: "italic", marginBottom: 12 },
  liveNowPill: {
    flexDirection: "row", alignItems: "center",
    alignSelf: "flex-start", borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  liveNowText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  liveNowShow: { fontSize: 11, fontWeight: "600", color: "#fff", flex: 1 },

  // Back
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },

  // Now card
  nowCard: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 16,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden", flexDirection: "row", alignItems: "stretch", minHeight: 110,
  },
  nowCardInner: { flex: 1, padding: 14 },
  nowCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  nowCardTime: { fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: "600" },
  nowCardTitle: { fontSize: 16, fontWeight: "800", color: "#fff", marginBottom: 3, lineHeight: 20 },
  nowCardEp: { fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 },
  nowCardGenre: { fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 6 },
  nowCardSummary: { fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 16, marginBottom: 6 },
  nowCardThumb: { width: 90, aspectRatio: 2 / 3, borderRadius: 0 },
  nextLabel: { fontSize: 9, fontWeight: "800", color: "rgba(255,255,255,0.35)", letterSpacing: 1, marginBottom: 6 },

  // Progress bars
  progressBg: { height: 2, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 1, marginTop: 6 },
  progressFill: { height: "100%", borderRadius: 1 },
  progressBgLarge: { height: 3, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 2, marginTop: 8 },
  progressFillLarge: { height: "100%", borderRadius: 2 },

  // Live badge
  liveBadge: {
    flexDirection: "row", alignItems: "center", borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  liveBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },

  // Tabs
  tabsScroll: { marginTop: 16 },
  tabsContent: { paddingHorizontal: 16, gap: 8 },
  tabPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  tabPillText: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.45)" },

  // Section
  section: { marginTop: 20 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, marginBottom: 14 },
  sectionBar: { width: 3, height: 18, borderRadius: 2 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#fff" },

  // Schedule
  schedList: { paddingHorizontal: 16, gap: 8 },
  schedItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    padding: 10, overflow: "hidden",
  },
  schedTime: { width: 54, alignItems: "center", gap: 4 },
  schedTimeText: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.45)" },
  soonBadge: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 4, paddingVertical: 1 },
  soonText: { fontSize: 7, fontWeight: "800", letterSpacing: 0.5 },
  schedContent: { flex: 1 },
  schedShow: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.7)", marginBottom: 2 },
  schedEp: { fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 2 },
  schedGenre: { fontSize: 9, color: "rgba(255,255,255,0.3)" },
  schedThumb: { width: 54, height: 70, borderRadius: 8 },

  // Content grid
  contentCard: { flex: 1 },
  contentPoster: {
    aspectRatio: 2 / 3, borderRadius: 10, overflow: "hidden",
    backgroundColor: "#111", marginBottom: 5,
  },
  contentTypeBadge: {
    position: "absolute", bottom: 5, left: 5, borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 2,
  },
  contentTypeText: { fontSize: 7, fontWeight: "800" },
  contentTitle: { fontSize: 10, fontWeight: "700", color: "#fff", lineHeight: 14 },
  contentRating: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  contentRatingText: { fontSize: 9, color: "rgba(255,255,255,0.55)", fontWeight: "600" },
  contentYear: { fontSize: 9, color: "rgba(255,255,255,0.3)", marginLeft: 4 },

  // Premieres
  premiereCard: { width: W * 0.55, borderRadius: 12, overflow: "hidden" },
  premierePosterWrap: { width: "100%", height: 120, borderRadius: 10, overflow: "hidden", marginBottom: 6 },
  premiereDate: {
    position: "absolute", top: 8, right: 8, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  premiereDateText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  premiereTitle: { fontSize: 12, fontWeight: "700", color: "#fff", lineHeight: 16 },
  premiereType: { fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 },

  // Description
  descCard: {
    marginHorizontal: 16, marginTop: 20, borderRadius: 14,
    borderWidth: 1, overflow: "hidden", padding: 16,
  },
  descTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 0.3, marginBottom: 8 },
  descText: { fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 20 },
  descMeta: { flexDirection: "row", gap: 8, marginTop: 12 },
  catBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  catText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },

  // Carousel
  carouselSection: { marginBottom: 28 },
  carouselPoster: {
    width: CAROUSEL_CARD_W,
    height: CAROUSEL_CARD_W * 1.5,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#111",
    marginBottom: 6,
  },
  carouselTypeBadge: {
    position: "absolute", bottom: 5, left: 5,
    borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2,
  },
  carouselTypeText: { fontSize: 7, fontWeight: "800" },
  carouselTitle: { fontSize: 11, fontWeight: "700", color: "#fff", lineHeight: 14 },
  carouselMeta: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  carouselRating: { fontSize: 9, color: "rgba(255,255,255,0.55)", fontWeight: "600" },
  carouselYear: { fontSize: 9, color: "rgba(255,255,255,0.3)", marginLeft: 3 },

  // Empty
  empty: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 14, color: "rgba(255,255,255,0.3)", fontWeight: "600" },
  emptySubText: { fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", paddingHorizontal: 32 },
  noSchedBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    borderWidth: 1, borderRadius: 10, padding: 10, marginHorizontal: 16, marginTop: 8, marginBottom: 4,
  },
  noSchedBannerText: { fontSize: 11, flex: 1, lineHeight: 16 },
});
