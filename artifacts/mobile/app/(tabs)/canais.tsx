import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NetplayLoaderV29 from "@/components/NetplayLoaderV29";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { ProfileAvatarButton } from "@/components/ProfileAvatarButton";
import { AdminEditOverlay } from "@/components/AdminEditOverlay";
import { tvApi, TodayEpisode } from "@/lib/api";
import { loadFavorites, toggleFavorite, isFavorite } from "@/lib/tv-favorites";
import {
  liveTvApi,
  LiveChannel,
  LiveCategory,
  JogoEntry,
  getAccent,
  jogoStatus,
  formatJogoTime,
  jogoElapsedMin,
  calcProgress,
  calcRemaining,
  fakeViewers,
  CATEGORY_LABELS,
  MAIN_CATEGORIES,
} from "@/lib/live-tv-api";

const { width: W, height: H } = Dimensions.get("window");
const HERO_H = H * 0.36;
const TAB_CLEAR = Platform.OS === "web" ? 100 : 110;

// ── helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<number, string> = {
  0: "grid",
  1: "activity",
  2: "smile",
  3: "globe",
  4: "film",
  5: "radio",
  6: "tv",
  7: "star",
  9: "flag",
};

const CATEGORY_COLORS: Record<number, string> = {
  1: "#e30000",
  2: "#ff6600",
  3: "#006fd4",
  4: "#9900cc",
  5: "#0066cc",
  6: "#00aa44",
  7: "#f59e0b",
  9: "#22c55e",
};

function getCatColor(id: number): string {
  return CATEGORY_COLORS[id] ?? "#e50914";
}

// ── Pulsing dot ───────────────────────────────────────────────────────────────

function PulsingDot({ color = "#e30000", size = 7 }: { color?: string; size?: number }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: anim,
        marginRight: 4,
      }}
    />
  );
}

// ── Live badge ────────────────────────────────────────────────────────────────

function LiveBadge({ color = "#e30000", small = false }: { color?: string; small?: boolean }) {
  return (
    <View style={[styles.liveBadge, { backgroundColor: color + "22", borderColor: color + "55" }]}>
      <PulsingDot color={color} size={small ? 5 : 6} />
      <Text style={[styles.liveBadgeText, { color, fontSize: small ? 8 : 9 }]}>AO VIVO</Text>
    </View>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  subtitle,
  color = "#e50914",
  onSeeAll,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  color?: string;
  onSeeAll?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <View style={[styles.sectionIconBar, { backgroundColor: color }]} />
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name={icon as any} size={13} color={color} />
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
          {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {onSeeAll && (
        <Pressable onPress={onSeeAll} style={styles.seeAllBtn}>
          <Text style={[styles.seeAllText, { color }]}>Ver todos</Text>
          <Feather name="chevron-right" size={12} color={color} />
        </Pressable>
      )}
    </View>
  );
}

// ── Hero Banner ───────────────────────────────────────────────────────────────

function HeroBanner({
  channels,
  onPress,
}: {
  channels: LiveChannel[];
  onPress: (ch: LiveChannel) => void;
}) {
  const [idx, setIdx] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const featured = channels.slice(0, 6);
  const current = featured[idx];

  useEffect(() => {
    if (featured.length < 2) return;
    const t = setInterval(() => {
      Animated.sequence([
        Animated.timing(fade, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
      setIdx((i) => (i + 1) % featured.length);
    }, 5000);
    return () => clearInterval(t);
  }, [featured.length]);

  if (!current) return null;
  const accent = getAccent(current.id);

  return (
    <Pressable onPress={() => onPress(current)} style={styles.heroWrap}>
      <Animated.View style={{ flex: 1, opacity: fade }}>
        {current.preview ? (
          <Image source={{ uri: current.preview }} style={styles.heroBg} resizeMode="cover" />
        ) : (
          <View style={[styles.heroBg, { backgroundColor: accent + "22" }]} />
        )}
        <LinearGradient
          colors={["transparent", "rgba(5,5,8,0.6)", "rgba(5,5,8,0.98)"]}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[accent + "18", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.heroContent}>
          <View style={styles.heroMeta}>
            <LiveBadge color={accent} />
            <View style={[styles.viewersBadge]}>
              <Feather name="eye" size={9} color="rgba(255,255,255,0.55)" />
              <Text style={styles.viewersText}>{fakeViewers(current.id)} assistindo</Text>
            </View>
          </View>

          <View style={styles.heroBottom}>
            <View style={styles.heroLogoWrap}>
              {current.image ? (
                <Image
                  source={{ uri: current.image }}
                  style={styles.heroLogo}
                  resizeMode="contain"
                />
              ) : (
                <View style={[styles.heroLogoFallback, { backgroundColor: accent + "33" }]}>
                  <Feather name="tv" size={28} color={accent} />
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroName} numberOfLines={1}>
                {current.name}
              </Text>
              <Text style={styles.heroNow} numberOfLines={2}>
                Transmissão ao vivo em HD
              </Text>
            </View>
            <View style={[styles.heroPlayBtn, { backgroundColor: accent }]}>
              <Feather name="play" size={18} color="#fff" />
            </View>
          </View>

          {/* Dot indicators */}
          <View style={styles.heroDots}>
            {featured.map((_, i) => (
              <Pressable key={i} onPress={() => setIdx(i)}>
                <View
                  style={[
                    styles.heroDot,
                    i === idx && { backgroundColor: accent, width: 18 },
                  ]}
                />
              </Pressable>
            ))}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ── Featured Channel Card (horizontal carousel) ───────────────────────────────

function FeaturedCard({
  channel,
  epgTitle,
  progress,
  onPress,
}: {
  channel: LiveChannel;
  epgTitle?: string;
  progress?: number;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [imgErr, setImgErr] = useState(false);
  const accent = getAccent(channel.id);
  const CARD_W = W * 0.62;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() =>
        Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40 }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start()
      }
    >
      <Animated.View style={[styles.featCard, { width: CARD_W, transform: [{ scale }] }]}>
        {channel.preview && !imgErr ? (
          <Image
            source={{ uri: channel.preview }}
            style={styles.featCardBg}
            resizeMode="cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <View style={[styles.featCardBg, { backgroundColor: accent + "18" }]} />
        )}
        <LinearGradient
          colors={["transparent", "rgba(5,5,8,0.85)", "#050508"]}
          style={styles.featGradient}
        />

        <View style={styles.featTopRow}>
          <LiveBadge color={accent} small />
          <View style={[styles.hdTag]}>
            <Text style={styles.hdTagText}>HD</Text>
          </View>
        </View>

        <View style={styles.featBottom}>
          <View style={styles.featLogoRow}>
            {channel.image ? (
              <Image source={{ uri: channel.image }} style={styles.featLogo} resizeMode="contain" />
            ) : (
              <View style={[styles.featLogoFallback, { backgroundColor: accent + "22" }]}>
                <Feather name="tv" size={14} color={accent} />
              </View>
            )}
            <Text style={styles.featName} numberOfLines={1}>
              {channel.name}
            </Text>
          </View>
          {epgTitle && (
            <Text style={styles.featEpg} numberOfLines={1}>
              {epgTitle}
            </Text>
          )}
          {typeof progress === "number" && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: accent }]} />
            </View>
          )}
        </View>
        <AdminEditOverlay itemKey={channel.id} title={channel.name} type="movie" />
      </Animated.View>
    </Pressable>
  );
}

// ── Sport Match Card ──────────────────────────────────────────────────────────

function SportMatchCard({
  jogo,
  channel,
  onPress,
}: {
  jogo: JogoEntry;
  channel?: LiveChannel;
  onPress?: () => void;
}) {
  const status = jogoStatus(jogo.data.timer);
  const elapsed = jogoElapsedMin(jogo.data.timer);
  const accent = channel ? getAccent(channel.id) : "#e30000";

  return (
    <Pressable onPress={onPress} style={[styles.matchCard, { borderColor: accent + "30" }]}>
      <LinearGradient
        colors={[accent + "15", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.matchLeague}>
        <Feather name="award" size={9} color={accent} />
        <Text style={[styles.matchLeagueText, { color: accent }]}>{jogo.data.league}</Text>
        {status === "live" ? (
          <View style={styles.matchLiveChip}>
            <PulsingDot color="#e30000" size={5} />
            <Text style={styles.matchLiveText}>{elapsed}&apos;</Text>
          </View>
        ) : (
          <Text style={styles.matchTimeText}>{formatJogoTime(jogo.data.timer)}</Text>
        )}
      </View>

      <View style={styles.matchTeams}>
        <View style={styles.matchTeam}>
          {jogo.data.teams.home.image ? (
            <Image source={{ uri: jogo.data.teams.home.image }} style={styles.teamLogo} resizeMode="contain" />
          ) : (
            <View style={[styles.teamLogoFallback, { backgroundColor: accent + "22" }]}>
              <Feather name="shield" size={12} color={accent} />
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>
            {jogo.data.teams.home.name}
          </Text>
        </View>

        <View style={styles.vsContainer}>
          <Text style={[styles.vsText, status === "live" && { color: "#e30000" }]}>VS</Text>
          {status === "live" && (
            <View style={styles.liveChipSmall}>
              <Text style={styles.liveChipText}>LIVE</Text>
            </View>
          )}
        </View>

        <View style={styles.matchTeam}>
          {jogo.data.teams.away.image ? (
            <Image source={{ uri: jogo.data.teams.away.image }} style={styles.teamLogo} resizeMode="contain" />
          ) : (
            <View style={[styles.teamLogoFallback, { backgroundColor: accent + "22" }]}>
              <Feather name="shield" size={12} color={accent} />
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>
            {jogo.data.teams.away.name}
          </Text>
        </View>
      </View>

      {channel && (
        <View style={styles.matchChannelRow}>
          <Feather name="tv" size={9} color="rgba(255,255,255,0.35)" />
          <Text style={styles.matchChannelText}>{channel.name}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Category Pill ─────────────────────────────────────────────────────────────

function CategoryPill({
  label,
  active,
  catId,
  onPress,
}: {
  label: string;
  active: boolean;
  catId: number;
  onPress: () => void;
}) {
  const color = getCatColor(catId);
  const icon = CATEGORY_ICONS[catId] ?? "tv";
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        active && { backgroundColor: color, borderColor: color },
      ]}
    >
      <Feather
        name={icon as any}
        size={11}
        color={active ? "#fff" : "rgba(255,255,255,0.5)"}
      />
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ── Grid Channel Card ─────────────────────────────────────────────────────────

function GridCard({
  channel,
  onPress,
  size = "md",
}: {
  channel: LiveChannel;
  onPress: () => void;
  size?: "sm" | "md" | "lg";
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [imgErr, setImgErr] = useState(false);
  const accent = getAccent(channel.id);
  const CARD_W =
    size === "lg"
      ? (W - 48) / 2
      : size === "sm"
      ? (W - 52) / 4
      : (W - 52) / 3;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() =>
        Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 50 }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start()
      }
    >
      <Animated.View style={[styles.gridCard, { width: CARD_W, transform: [{ scale }] }]}>
        <View style={[styles.gridCardBg, { borderColor: accent + "30" }]}>
          <View style={styles.gridLiveTag}>
            <PulsingDot color={accent} size={4} />
          </View>
          {channel.image && !imgErr ? (
            <Image
              source={{ uri: channel.image }}
              style={styles.gridLogo}
              resizeMode="contain"
              onError={() => setImgErr(true)}
            />
          ) : (
            <View style={[styles.gridLogoFallback, { backgroundColor: accent + "22" }]}>
              <Feather name="tv" size={size === "sm" ? 14 : 20} color={accent} />
            </View>
          )}
          <LinearGradient
            colors={["transparent", accent + "18"]}
            style={styles.gridCardGlow}
          />
          <AdminEditOverlay itemKey={channel.id} title={channel.name} type="movie" />
        </View>
        <Text style={styles.gridCardName} numberOfLines={1}>
          {channel.name}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ── News Ticker ───────────────────────────────────────────────────────────────

function NewsChannelRow({
  channels,
  onPress,
}: {
  channels: LiveChannel[];
  onPress: (ch: LiveChannel) => void;
}) {
  if (!channels.length) return null;
  return (
    <View style={styles.newsRow}>
      <View style={styles.newsTicker}>
        <View style={[styles.newsLiveChip]}>
          <PulsingDot color="#e30000" />
          <Text style={styles.newsLiveText}>NOTÍCIAS</Text>
        </View>
        <View style={styles.newsTickerLine} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.newsScroll}>
        {channels.map((ch) => {
          const accent = getAccent(ch.id);
          return (
            <Pressable key={ch.id} onPress={() => onPress(ch)} style={styles.newsCard}>
              <View style={[styles.newsCardBg, { borderColor: accent + "30" }]}>
                {ch.image ? (
                  <Image source={{ uri: ch.image }} style={styles.newsLogo} resizeMode="contain" />
                ) : (
                  <Feather name="radio" size={16} color={accent} />
                )}
              </View>
              <Text style={styles.newsCardName} numberOfLines={1}>
                {ch.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Promo Banner Strip ────────────────────────────────────────────────────────

function PromoBannerStrip({ channels }: { channels: LiveChannel[] }) {
  const router = useRouter();
  const banners = channels.slice(0, 3);
  if (!banners.length) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.promoScroll}
    >
      {banners.map((ch, i) => {
        const accent = getAccent(ch.id);
        const labels = ["ESTREIA HOJE", "MAIS ASSISTIDO", "EM DESTAQUE"];
        return (
          <Pressable
            key={ch.id}
            onPress={() =>
              router.push({
                pathname: "/channel-detail" as never,
                params: {
                  channelId: ch.id,
                  channelName: ch.name,
                  channelImage: ch.image,
                  channelUrl: ch.url,
                },
              } as never)
            }
          >
            <View style={[styles.promoBanner, { borderColor: accent + "40" }]}>
              {ch.preview ? (
                <Image source={{ uri: ch.preview }} style={styles.promoBannerBg} resizeMode="cover" />
              ) : (
                <View style={[styles.promoBannerBg, { backgroundColor: accent + "15" }]} />
              )}
              <LinearGradient
                colors={[accent + "60", "rgba(5,5,8,0.92)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.promoBannerContent}>
                <View style={[styles.promoTag, { backgroundColor: accent }]}>
                  <Text style={styles.promoTagText}>{labels[i]}</Text>
                </View>
                <Text style={styles.promoBannerName} numberOfLines={1}>
                  {ch.name}
                </Text>
                <View style={styles.promoBannerRow}>
                  <Feather name="play-circle" size={12} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.promoBannerSub}>Assistir agora</Text>
                </View>
              </View>
              {ch.image ? (
                <Image source={{ uri: ch.image }} style={styles.promoBannerLogo} resizeMode="contain" />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── What's On Now row ─────────────────────────────────────────────────────────

function WhatsonCard({
  channel,
  onPress,
}: {
  channel: LiveChannel;
  onPress: () => void;
}) {
  const accent = getAccent(channel.id);
  const prog = calcProgress(new Date(Date.now() - Math.random() * 3600000).toISOString());
  const remaining = calcRemaining(new Date(Date.now() - Math.random() * 3600000).toISOString());

  return (
    <Pressable onPress={onPress} style={[styles.whatsonCard, { borderColor: accent + "25" }]}>
      <View style={[styles.whatsonImgWrap, { backgroundColor: accent + "15" }]}>
        {channel.image ? (
          <Image source={{ uri: channel.image }} style={styles.whatsonImg} resizeMode="contain" />
        ) : (
          <Feather name="tv" size={20} color={accent} />
        )}
      </View>
      <View style={styles.whatsonInfo}>
        <Text style={styles.whatsonName} numberOfLines={1}>
          {channel.name}
        </Text>
        <Text style={styles.whatsonProg} numberOfLines={1}>
          Transmissão ao vivo
        </Text>
        <View style={styles.whatsonProgressWrap}>
          <View style={styles.whatsonProgressBg}>
            <View style={[styles.whatsonProgressFill, { width: `${prog}%`, backgroundColor: accent }]} />
          </View>
          <Text style={[styles.whatsonRemaining, { color: accent }]}>{remaining}</Text>
        </View>
      </View>
      <Pressable
        onPress={onPress}
        style={[styles.whatsonPlay, { backgroundColor: accent + "20", borderColor: accent + "50" }]}
      >
        <Feather name="play" size={14} color={accent} />
      </Pressable>
    </Pressable>
  );
}

// ── Today Schedule Section ────────────────────────────────────────────────────

const SCHEDULE_CHANNELS = [
  { id: "globo",     name: "Globo",    color: "#e30000" },
  { id: "hbo",       name: "HBO",      color: "#888888" },
  { id: "espn",      name: "ESPN",     color: "#e30000" },
  { id: "discovery", name: "Discovery",color: "#013ea8" },
  { id: "natgeo",    name: "NatGeo",   color: "#f5c400" },
  { id: "cartoon",   name: "Cartoon",  color: "#00aaff" },
  { id: "disneych",  name: "Disney CH",color: "#006ed1" },
];

function EpStatusBadge({ status }: { status: TodayEpisode["status"] }) {
  if (status === "live") {
    return (
      <View style={epStyles.liveBadge}>
        <PulsingDot color="#e30000" size={5} />
        <Text style={[epStyles.badgeText, { color: "#e30000" }]}>AO VIVO</Text>
      </View>
    );
  }
  if (status === "past") {
    return (
      <View style={[epStyles.statusBadge, { backgroundColor: "rgba(255,255,255,0.05)" }]}>
        <Feather name="check" size={8} color="rgba(255,255,255,0.3)" />
        <Text style={[epStyles.badgeText, { color: "rgba(255,255,255,0.3)" }]}>JÁ PASSOU</Text>
      </View>
    );
  }
  return (
    <View style={[epStyles.statusBadge, { backgroundColor: "rgba(255,255,255,0.05)" }]}>
      <Feather name="clock" size={8} color="rgba(255,255,255,0.4)" />
      <Text style={[epStyles.badgeText, { color: "rgba(255,255,255,0.4)" }]}>EM BREVE</Text>
    </View>
  );
}

function EpisodeCard({ ep, accent }: { ep: TodayEpisode; accent: string }) {
  const isPast = ep.status === "past";
  const isLive = ep.status === "live";
  const img = ep.show.image?.medium;

  return (
    <View style={[epStyles.card, isLive && { borderColor: accent + "66" }, isPast && { opacity: 0.55 }]}>
      {isLive && (
        <LinearGradient
          colors={[accent + "18", "transparent"]}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={epStyles.timeCol}>
        <Text style={[epStyles.time, isLive && { color: accent }, isPast && { color: "rgba(255,255,255,0.3)" }]}>
          {ep.airtime ?? "--:--"}
        </Text>
        <Text style={epStyles.runtime}>{ep.runtime}min</Text>
      </View>
      <View style={epStyles.imgWrap}>
        {img ? (
          <Image source={{ uri: img }} style={epStyles.img} resizeMode="cover" />
        ) : (
          <View style={[epStyles.imgFallback, { backgroundColor: accent + "22" }]}>
            <Feather name="tv" size={14} color={accent} />
          </View>
        )}
        {isLive && (
          <View style={[epStyles.imgOverlay, { backgroundColor: accent + "44" }]}>
            <Feather name="play" size={10} color="#fff" />
          </View>
        )}
      </View>
      <View style={epStyles.info}>
        <Text style={[epStyles.showName, isPast && { color: "rgba(255,255,255,0.4)" }]} numberOfLines={1}>
          {ep.show.name}
        </Text>
        {ep.name && ep.name !== ep.show.name && (
          <Text style={epStyles.epName} numberOfLines={1}>{ep.name}</Text>
        )}
        <EpStatusBadge status={ep.status} />
      </View>
    </View>
  );
}

function TodayScheduleSection({
  byChannel,
}: {
  byChannel: Record<string, TodayEpisode[]>;
}) {
  const [sel, setSel] = useState(SCHEDULE_CHANNELS[0].id);
  const available = SCHEDULE_CHANNELS.filter((c) => byChannel[c.id]?.length);
  const activeCh = available.find((c) => c.id === sel) ?? available[0];
  const episodes = (activeCh ? byChannel[activeCh.id] : []) ?? [];

  if (!available.length) return null;

  const liveIdx = episodes.findIndex((e) => e.status === "live");
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (liveIdx > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: liveIdx * 76, animated: true });
      }, 400);
    }
  }, [liveIdx, sel]);

  return (
    <View style={{ marginBottom: 24 }}>
      <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <View style={{ width: 3, height: 20, borderRadius: 2, backgroundColor: "#e50914" }} />
          <Feather name="calendar" size={14} color="#e50914" />
          <View>
            <Text style={styles.sectionTitle}>Programação de Hoje</Text>
            <Text style={styles.sectionSubtitle}>O que passou, está passando e vai passar</Text>
          </View>
        </View>

        {/* Channel pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {available.map((ch) => {
            const isActive = ch.id === (activeCh?.id ?? "");
            return (
              <Pressable
                key={ch.id}
                onPress={() => setSel(ch.id)}
                style={[
                  epStyles.chPill,
                  isActive && { backgroundColor: ch.color + "22", borderColor: ch.color + "66" },
                ]}
              >
                <Text style={[epStyles.chPillText, isActive && { color: ch.color }]}>{ch.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Episode list */}
      <ScrollView
        ref={scrollRef}
        style={{ maxHeight: 320 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
        nestedScrollEnabled
      >
        {episodes.map((ep) => (
          <EpisodeCard key={ep.id} ep={ep} accent={activeCh?.color ?? "#e50914"} />
        ))}
        {episodes.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
            <Feather name="calendar" size={28} color="rgba(255,255,255,0.15)" />
            <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
              Sem programação disponível para hoje
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const epStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#111116",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  timeCol: { width: 46, alignItems: "center" },
  time: { fontSize: 13, fontWeight: "700", color: "#fff", textAlign: "center" },
  runtime: { fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2 },
  imgWrap: { width: 52, height: 52, borderRadius: 8, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
  imgFallback: {
    width: "100%", height: "100%", alignItems: "center", justifyContent: "center",
  },
  imgOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1, gap: 3 },
  showName: { fontSize: 13, fontWeight: "700", color: "#fff" },
  epName: { fontSize: 10, color: "rgba(255,255,255,0.45)" },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(227,0,0,0.12)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 8, fontWeight: "800", letterSpacing: 0.4 },
  chPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  chPillText: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.5)" },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CanaisScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [categories, setCategories] = useState<LiveCategory[]>([]);
  const [jogos, setJogos] = useState<JogoEntry[]>([]);
  const [selectedCat, setSelectedCat] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── TVmaze channel guide ──────────────────────────────────────────────────
  type TvChannel = {
    id: string; name: string; shortName: string; description: string; tagline: string;
    category: string; color: string; bgColor: string; accentColor: string;
    tvmazeNetworkId: number | null; tmdbNetworkId: number | null;
  };
  type TvGuideEp = { id: number; name: string; airtime: string; runtime: number; show: { id: number; name: string; genres: string[]; image: { medium: string } | null } };
  type TvGuideNetwork = { network: { id: number; name: string }; episodes: TvGuideEp[] };

  const [tvChannels, setTvChannels] = useState<TvChannel[]>([]);
  const [tvGuide, setTvGuide] = useState<Record<string, TvGuideNetwork>>({});
  const [tvGuideLoading, setTvGuideLoading] = useState(true);
  const [selectedTvCat, setSelectedTvCat] = useState<string>("all");
  const [tvFavorites, setTvFavorites] = useState<string[]>([]);
  const [todayByChannel, setTodayByChannel] = useState<Record<string, TodayEpisode[]>>({});

  useEffect(() => {
    loadFavorites().then(setTvFavorites).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      tvApi.getChannels(),
      tvApi.getGuide(),
    ])
      .then(([chRes, guideRes]) => {
        if (chRes.ok) setTvChannels(chRes.channels ?? []);
        if (guideRes.ok) setTvGuide(guideRes.byNetwork ?? {});
      })
      .catch(() => {})
      .finally(() => setTvGuideLoading(false));

    // Fetch today's full schedule (past + live + upcoming)
    tvApi.getTodaySchedule()
      .then((res) => { if (res.ok) setTodayByChannel(res.byChannel ?? {}); })
      .catch(() => {});
  }, []);

  const handleTvFavorite = useCallback(async (ch: TvChannel, e: any) => {
    e?.stopPropagation?.();
    const { favorites } = await toggleFavorite(ch.id);
    setTvFavorites(favorites);
  }, []);

  const favoriteChannels = tvChannels.filter((c) => isFavorite(c.id, tvFavorites));

  const goToTvChannel = useCallback(
    (ch: TvChannel) => {
      router.push({
        pathname: "/tv-channel",
        params: { channelId: ch.id, channelJson: JSON.stringify(ch) },
      } as never);
    },
    [router]
  );

  // Find current program for a channel via TVmaze network ID
  function getCurrentProgram(ch: TvChannel): TvGuideEp | null {
    if (!ch.tvmazeNetworkId) return null;
    const net = tvGuide[String(ch.tvmazeNetworkId)];
    if (!net) return null;
    const now = new Date();
    return net.episodes.find((ep) => {
      const [h, m] = ep.airtime.split(":").map(Number);
      const start = new Date(); start.setHours(h, m, 0, 0);
      const end = new Date(start.getTime() + (ep.runtime ?? 60) * 60000);
      return now >= start && now <= end;
    }) ?? null;
  }

  // Calculate live progress percentage (0–100) for a currently airing episode
  function getLiveProgress(ep: TvGuideEp): number {
    const [h, m] = ep.airtime.split(":").map(Number);
    const start = new Date(); start.setHours(h, m, 0, 0);
    const elapsed = (Date.now() - start.getTime()) / 60000; // minutes
    const total = ep.runtime ?? 60;
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  }

  // Returns a human-readable "Xmin restantes" string
  function getLiveTimeLeft(ep: TvGuideEp): string {
    const [h, m] = ep.airtime.split(":").map(Number);
    const start = new Date(); start.setHours(h, m, 0, 0);
    const leftMin = Math.round((start.getTime() + (ep.runtime ?? 60) * 60000 - Date.now()) / 60000);
    if (leftMin <= 0) return "encerra em breve";
    return `${leftMin}min restam`;
  }

  const TV_CATS = [
    { key: "all", label: "Todos" },
    { key: "aberta", label: "Aberta" },
    { key: "fechada", label: "Fechada" },
    { key: "news", label: "Notícias" },
    { key: "esporte", label: "Esporte" },
    { key: "infantil", label: "Infantil" },
  ];

  const filteredTvChannels = selectedTvCat === "all"
    ? tvChannels
    : tvChannels.filter((c) => c.category === selectedTvCat);

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, HERO_H * 0.6],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  useEffect(() => {
    Promise.all([
      liveTvApi.getChannels(),
      liveTvApi.getJogos().catch(() => [] as JogoEntry[]),
    ])
      .then(([data, matchData]) => {
        setChannels(data.channels ?? []);
        const cats = [
          { id: 0, name: "Todos" },
          ...(data.categories ?? []).filter((c) => c.id !== 0).sort((a, b) => a.id - b.id),
        ];
        setCategories(cats);
        setJogos(matchData);
      })
      .catch((e) => setError(e?.message ?? "Erro ao carregar canais"))
      .finally(() => setLoading(false));
  }, []);

  const goToChannel = useCallback(
    (ch: LiveChannel) => {
      router.push({
        pathname: "/channel-detail" as never,
        params: {
          channelId: ch.id,
          channelName: ch.name,
          channelImage: ch.image,
          channelUrl: ch.url,
        },
      } as never);
    },
    [router]
  );

  const {
    sportsChannels,
    newsChannels,
    kidsChannels,
    moviesChannels,
    openChannels,
    varietyChannels,
    docsChannels,
  } = useMemo(() => ({
    sportsChannels:  channels.filter((ch) => ch.categories?.includes(1)),
    newsChannels:    channels.filter((ch) => ch.categories?.includes(5)),
    kidsChannels:    channels.filter((ch) => ch.categories?.includes(2)),
    moviesChannels:  channels.filter((ch) => ch.categories?.includes(4)),
    openChannels:    channels.filter((ch) => ch.categories?.includes(6)),
    varietyChannels: channels.filter((ch) => ch.categories?.includes(7)),
    docsChannels:    channels.filter((ch) => ch.categories?.includes(3)),
  }), [channels]);

  const filtered = useMemo(
    () => selectedCat === 0
      ? channels
      : channels.filter((ch) => ch.categories?.includes(selectedCat)),
    [channels, selectedCat]
  );

  const { liveJogos, upcomingJogos, allSportJogos } = useMemo(() => {
    const live     = jogos.filter((j) => jogoStatus(j.data.timer) === "live");
    const upcoming = jogos.filter((j) => jogoStatus(j.data.timer) === "upcoming");
    return { liveJogos: live, upcomingJogos: upcoming, allSportJogos: [...live, ...upcoming].slice(0, 8) };
  }, [jogos]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}>
        <StatusBar style="light" />
        <NetplayLoaderV29 />
        <Text style={styles.loadingText}>Carregando canais ao vivo…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}>
        <StatusBar style="light" />
        <Feather name="wifi-off" size={52} color="rgba(255,255,255,0.15)" />
        <Text style={styles.errorTitle}>Sem sinal</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* ── Profile + Search top-right overlay (always touchable) ── */}
      <View
        style={[styles.topActions, { top: topInset + 8 }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.push("/buscar")}
          activeOpacity={0.75}
        >
          <Feather name="search" size={20} color="rgba(255,255,255,0.82)" />
        </TouchableOpacity>
        <ProfileAvatarButton />
      </View>

      {/* Sticky floating header */}
      <Animated.View
        style={[
          styles.stickyHeader,
          { paddingTop: topInset + 4, opacity: headerOpacity },
        ]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={["rgba(5,5,8,0.95)", "transparent"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.stickyHeaderContent}>
          <Feather name="tv" size={16} color="#e50914" />
          <Text style={styles.stickyHeaderTitle}>TV AO VIVO</Text>
          <View style={styles.stickyCount}>
            <Text style={styles.stickyCountText}>{channels.length}</Text>
          </View>
        </View>
      </Animated.View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: TAB_CLEAR }}
      >
        {/* ── Hero ── */}
        {channels.length > 0 && (
          <View style={{ marginBottom: 4 }}>
            <HeroBanner channels={sportsChannels.length > 0 ? sportsChannels : channels} onPress={goToChannel} />
          </View>
        )}

        {/* ── Category pills ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillsRow}
          contentContainerStyle={styles.pillsContent}
        >
          {categories.map((cat) => (
            <CategoryPill
              key={cat.id}
              label={cat.name}
              catId={cat.id}
              active={selectedCat === cat.id}
              onPress={() => setSelectedCat(cat.id)}
            />
          ))}
        </ScrollView>

        {selectedCat !== 0 ? (
          /* ── FILTERED VIEW ── */
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <SectionHeader
              icon={CATEGORY_ICONS[selectedCat] as any ?? "tv"}
              title={CATEGORY_LABELS[selectedCat] ?? "Canais"}
              subtitle={`${filtered.length} canais ao vivo`}
              color={getCatColor(selectedCat)}
            />
            <View style={styles.gridWrap}>
              {filtered.map((ch) => (
                <GridCard
                  key={ch.id}
                  channel={ch}
                  size="md"
                  onPress={() => goToChannel(ch)}
                />
              ))}
            </View>
          </View>
        ) : (
          /* ── FULL HOME VIEW ── */
          <>
            {/* ══════════════════════════════════════════════════════════════
                GRADE DE PROGRAMAÇÃO — TVmaze + TMDB
            ══════════════════════════════════════════════════════════════ */}
            <View style={{ marginBottom: 24 }}>
              {/* Section header */}
              <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ width: 3, height: 20, borderRadius: 2, backgroundColor: "#e50914" }} />
                    <Feather name="tv" size={14} color="#e50914" />
                    <View>
                      <Text style={styles.sectionTitle}>Grade de Programação</Text>
                      <Text style={styles.sectionSubtitle}>TV aberta e fechada • Pressione para ver programação completa</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* ── Meus Canais (favoritos) ── */}
              {favoriteChannels.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, marginBottom: 10 }}>
                    <Feather name="heart" size={12} color="#e50914" />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.7)" }}>
                      Meus Canais
                    </Text>
                    <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginLeft: 4 }}>
                      {favoriteChannels.length} favorito{favoriteChannels.length > 1 ? "s" : ""}
                    </Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
                  >
                    {favoriteChannels.map((ch) => {
                      const nowEp = getCurrentProgram(ch);
                      return (
                        <TouchableOpacity
                          key={`fav-${ch.id}`}
                          onPress={() => goToTvChannel(ch)}
                          activeOpacity={0.8}
                          style={[styles.tvMyCard, { borderColor: ch.color + "55" }]}
                        >
                          <LinearGradient
                            colors={[ch.bgColor || "#0a0a14", ch.color + "33"]}
                            style={StyleSheet.absoluteFill}
                          />
                          <View style={[styles.tvMyCardBar, { backgroundColor: ch.color }]} />
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <View style={[styles.tvMyBadge, { backgroundColor: ch.color }]}>
                              <Text style={styles.tvMyBadgeText} numberOfLines={1}>{ch.shortName}</Text>
                            </View>
                            <TouchableOpacity
                              onPress={(e) => handleTvFavorite(ch, e)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Feather name="heart" size={13} color={ch.color} />
                            </TouchableOpacity>
                          </View>
                          {nowEp ? (
                            <View style={{ marginTop: 6, flex: 1 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 2 }}>
                                <View style={[styles.tvLiveDot, { backgroundColor: ch.color }]} />
                                <Text style={[styles.tvLiveLabel, { color: ch.color }]}>AO VIVO</Text>
                                <Text style={[styles.tvLiveTimeLeft, { fontSize: 7 }]}>{getLiveTimeLeft(nowEp)}</Text>
                              </View>
                              <Text style={styles.tvMyShow} numberOfLines={2}>{nowEp.show.name}</Text>
                              <View style={[styles.tvProgressBar, { marginTop: 6 }]}>
                                <View style={[styles.tvProgressFill, { width: `${getLiveProgress(nowEp)}%` as any, backgroundColor: ch.color }]} />
                              </View>
                            </View>
                          ) : (
                            <Text style={[styles.tvNoGuide, { marginTop: 6 }]}>Sem programa{"\n"}agora</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Category filter pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 8, marginBottom: 12 }}
              >
                {TV_CATS.map((cat) => (
                  <TouchableOpacity
                    key={cat.key}
                    onPress={() => setSelectedTvCat(cat.key)}
                    style={[
                      styles.pill,
                      selectedTvCat === cat.key && {
                        backgroundColor: "#e5091422",
                        borderColor: "#e5091466",
                      },
                    ]}
                    activeOpacity={0.75}
                  >
                    <Text style={[
                      styles.pillText,
                      selectedTvCat === cat.key && { color: "#e50914" },
                    ]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Channel cards */}
              {tvGuideLoading ? (
                <ActivityIndicator color="#e50914" style={{ marginVertical: 20 }} />
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
                >
                  {filteredTvChannels.map((ch) => {
                    const nowEp = getCurrentProgram(ch);
                    return (
                      <TouchableOpacity
                        key={ch.id}
                        onPress={() => goToTvChannel(ch)}
                        activeOpacity={0.8}
                        style={[
                          styles.tvChannelCard,
                          { borderColor: ch.color + "33" },
                        ]}
                      >
                        {/* Card background gradient */}
                        <LinearGradient
                          colors={[ch.bgColor || "#0a0a14", ch.color + "22", "#0a0a14"]}
                          style={StyleSheet.absoluteFill}
                        />

                        {/* Channel color bar top */}
                        <View style={[styles.tvCardBar, { backgroundColor: ch.color }]} />

                        {/* Channel badge */}
                        <View style={[styles.tvCardBadge, { backgroundColor: ch.color }]}>
                          <Text style={styles.tvCardBadgeText} numberOfLines={1}>
                            {ch.shortName}
                          </Text>
                        </View>

                        {/* Channel name */}
                        <Text style={styles.tvCardName} numberOfLines={1}>{ch.name}</Text>

                        {/* Category label */}
                        <Text style={styles.tvCardCat}>{ch.category.toUpperCase()}</Text>

                        {/* Divider */}
                        <View style={styles.tvCardDivider} />

                        {/* Now playing */}
                        {nowEp ? (
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3 }}>
                              <View style={[styles.tvLiveDot, { backgroundColor: ch.color }]} />
                              <Text style={[styles.tvLiveLabel, { color: ch.color }]}>AO VIVO</Text>
                              <Text style={styles.tvLiveTimeLeft}>{getLiveTimeLeft(nowEp)}</Text>
                            </View>
                            <Text style={styles.tvNowShow} numberOfLines={1}>{nowEp.show.name}</Text>
                            {nowEp.name && nowEp.name !== nowEp.show.name && (
                              <Text style={styles.tvNowEp} numberOfLines={1}>{nowEp.name}</Text>
                            )}
                            {/* Live progress bar */}
                            <View style={styles.tvProgressBar}>
                              <View
                                style={[
                                  styles.tvProgressFill,
                                  { width: `${getLiveProgress(nowEp)}%` as any, backgroundColor: ch.color },
                                ]}
                              />
                            </View>
                          </View>
                        ) : (
                          <View style={{ flex: 1, justifyContent: "center" }}>
                            <Text style={styles.tvNoGuide}>Toque para ver{"\n"}a programação</Text>
                          </View>
                        )}

                        {/* Fav + Arrow row */}
                        <View style={styles.tvCardFooter}>
                          <TouchableOpacity
                            onPress={(e) => handleTvFavorite(ch, e)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={styles.tvCardHeart}
                          >
                            <Feather
                              name={isFavorite(ch.id, tvFavorites) ? "heart" : "heart"}
                              size={13}
                              color={isFavorite(ch.id, tvFavorites) ? ch.color : "rgba(255,255,255,0.25)"}
                            />
                          </TouchableOpacity>
                          <Feather name="chevron-right" size={14} color={ch.color} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* ── Programação de Hoje (TVmaze) ── */}
            {Object.keys(todayByChannel).length > 0 && (
              <TodayScheduleSection byChannel={todayByChannel} />
            )}

            {/* ── Ao Vivo Agora carousel ── */}
            {channels.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <View style={{ paddingHorizontal: 20 }}>
                  <SectionHeader
                    icon="zap"
                    title="Ao Vivo Agora"
                    subtitle="Transmissões em tempo real"
                    color="#e50914"
                  />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}
                >
                  {channels.slice(0, 10).map((ch, i) => (
                    <FeaturedCard
                      key={ch.id}
                      channel={ch}
                      progress={30 + (i * 7) % 55}
                      onPress={() => goToChannel(ch)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── Promo Banners ── */}
            {channels.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <View style={{ paddingHorizontal: 20 }}>
                  <SectionHeader icon="star" title="Em Destaque" color="#f59e0b" />
                </View>
                <PromoBannerStrip channels={moviesChannels.length > 0 ? moviesChannels : channels} />
              </View>
            )}

            {/* ── Sports Matches ── */}
            {allSportJogos.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <View style={{ paddingHorizontal: 20 }}>
                  <SectionHeader
                    icon="activity"
                    title="Esportes"
                    subtitle={liveJogos.length > 0 ? `${liveJogos.length} jogos ao vivo` : "Próximos jogos"}
                    color="#e30000"
                  />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.matchScroll}
                >
                  {allSportJogos.map((jogo, i) => {
                    const relatedCh = sportsChannels[i % Math.max(sportsChannels.length, 1)];
                    return (
                      <SportMatchCard
                        key={i}
                        jogo={jogo}
                        channel={relatedCh}
                        onPress={() => relatedCh && goToChannel(relatedCh)}
                      />
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* ── Sports channels grid ── */}
            {sportsChannels.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <View style={{ paddingHorizontal: 20 }}>
                  <SectionHeader
                    icon="activity"
                    title="Canais Esportivos"
                    subtitle={`${sportsChannels.length} canais`}
                    color="#e30000"
                  />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}
                >
                  {sportsChannels.slice(0, 12).map((ch) => (
                    <GridCard key={ch.id} channel={ch} size="sm" onPress={() => goToChannel(ch)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── What's on now (open channels) ── */}
            {openChannels.length > 0 && (
              <View style={{ marginBottom: 24, paddingHorizontal: 20 }}>
                <SectionHeader
                  icon="tv"
                  title="O Que Passa Agora"
                  subtitle="Canais abertos"
                  color="#00aa44"
                />
                {openChannels.slice(0, 5).map((ch) => (
                  <WhatsonCard key={ch.id} channel={ch} onPress={() => goToChannel(ch)} />
                ))}
              </View>
            )}

            {/* ── News channels ── */}
            {newsChannels.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <NewsChannelRow channels={newsChannels} onPress={goToChannel} />
              </View>
            )}

            {/* ── Movies & Series ── */}
            {moviesChannels.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <View style={{ paddingHorizontal: 20 }}>
                  <SectionHeader
                    icon="film"
                    title="Filmes & Séries"
                    subtitle={`${moviesChannels.length} canais`}
                    color="#9900cc"
                  />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}
                >
                  {moviesChannels.slice(0, 12).map((ch) => (
                    <GridCard key={ch.id} channel={ch} size="sm" onPress={() => goToChannel(ch)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── Kids ── */}
            {kidsChannels.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <View style={{ paddingHorizontal: 20 }}>
                  <SectionHeader
                    icon="smile"
                    title="Infantil"
                    subtitle={`${kidsChannels.length} canais`}
                    color="#ff6600"
                  />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}
                >
                  {kidsChannels.slice(0, 12).map((ch) => (
                    <GridCard key={ch.id} channel={ch} size="sm" onPress={() => goToChannel(ch)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── Variety ── */}
            {varietyChannels.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <View style={{ paddingHorizontal: 20 }}>
                  <SectionHeader
                    icon="star"
                    title="Variedades"
                    subtitle={`${varietyChannels.length} canais`}
                    color="#f59e0b"
                  />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}
                >
                  {varietyChannels.slice(0, 12).map((ch) => (
                    <GridCard key={ch.id} channel={ch} size="sm" onPress={() => goToChannel(ch)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── Docs ── */}
            {docsChannels.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <View style={{ paddingHorizontal: 20 }}>
                  <SectionHeader
                    icon="globe"
                    title="Documentários"
                    subtitle={`${docsChannels.length} canais`}
                    color="#006fd4"
                  />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}
                >
                  {docsChannels.slice(0, 12).map((ch) => (
                    <GridCard key={ch.id} channel={ch} size="sm" onPress={() => goToChannel(ch)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── All channels grid ── */}
            <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
              <SectionHeader
                icon="grid"
                title="Todos os Canais"
                subtitle={`${channels.length} canais disponíveis`}
                color="#e50914"
              />
              <View style={styles.gridWrap}>
                {channels.map((ch) => (
                  <GridCard
                    key={ch.id}
                    channel={ch}
                    size="md"
                    onPress={() => goToChannel(ch)}
                  />
                ))}
              </View>
            </View>
          </>
        )}
      </Animated.ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", gap: 12 },

  // ── Top-right avatar overlay
  topActions: {
    position: "absolute", right: 10, zIndex: 200,
    flexDirection: "row", alignItems: "center", gap: 0,
  },
  iconBtn: {
    width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20,
  },

  // ── Sticky header
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingBottom: 12,
  },
  stickyHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  stickyHeaderTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1,
    flex: 1,
  },
  stickyCount: {
    backgroundColor: "#e50914",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  stickyCountText: { fontSize: 11, fontWeight: "700", color: "#fff" },

  // ── Hero
  heroWrap: { width: W, height: HERO_H, overflow: "hidden" },
  heroBg: { ...StyleSheet.absoluteFillObject },
  heroContent: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "web" ? 80 : 56,
    paddingBottom: 16,
  },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  viewersBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  viewersText: { fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: "500" },
  heroBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  heroLogoWrap: {
    width: 56,
    height: 40,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroLogo: { width: "100%", height: "100%" },
  heroLogoFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  heroName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
    flex: 1,
  },
  heroNow: { fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 },
  heroPlayBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#e50914",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  heroDots: {
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
  },

  // ── Pills
  pillsRow: { maxHeight: 48 },
  pillsContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: "row",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  pillText: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.5)" },
  pillTextActive: { color: "#fff" },

  // ── Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionIconBar: { width: 3, height: 20, borderRadius: 2 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#fff", letterSpacing: -0.2 },
  sectionSubtitle: { fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 },
  seeAllBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { fontSize: 11, fontWeight: "600" },

  // ── Live badge
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    gap: 3,
  },
  liveBadgeText: { fontWeight: "800", letterSpacing: 0.5 },

  // ── Featured carousel
  carouselContent: { paddingHorizontal: 16, gap: 10 },
  featCard: {
    height: 170,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#111116",
  },
  featCardBg: { ...StyleSheet.absoluteFillObject },
  featGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "70%",
  },
  featTopRow: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hdTag: {
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  hdTagText: { fontSize: 8, fontWeight: "800", color: "rgba(255,255,255,0.7)", letterSpacing: 0.5 },
  featBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
  },
  featLogoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  featLogo: { width: 32, height: 24, borderRadius: 4 },
  featLogoFallback: {
    width: 32,
    height: 24,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  featName: { fontSize: 13, fontWeight: "700", color: "#fff", flex: 1 },
  featEpg: { fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 6 },
  progressBar: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 2 },

  // ── Match cards
  matchScroll: { paddingHorizontal: 16, gap: 10 },
  matchCard: {
    width: W * 0.56,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#111116",
    borderWidth: 1,
    overflow: "hidden",
  },
  matchLeague: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 12,
  },
  matchLeagueText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5, flex: 1 },
  matchLiveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(227,0,0,0.15)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  matchLiveText: { fontSize: 9, fontWeight: "800", color: "#e30000" },
  matchTimeText: { fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.4)" },
  matchTeams: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  matchTeam: { alignItems: "center", flex: 1, gap: 6 },
  teamLogo: { width: 34, height: 34, borderRadius: 4 },
  teamLogoFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  teamName: { fontSize: 10, fontWeight: "700", color: "#fff", textAlign: "center" },
  vsContainer: { alignItems: "center", gap: 4 },
  vsText: { fontSize: 12, fontWeight: "800", color: "rgba(255,255,255,0.3)", letterSpacing: 1 },
  liveChipSmall: {
    backgroundColor: "#e30000",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  liveChipText: { fontSize: 7, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
  matchChannelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    paddingTop: 8,
  },
  matchChannelText: { fontSize: 9, color: "rgba(255,255,255,0.35)" },

  // ── Grid
  gridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  gridCard: { alignItems: "center" },
  gridCardBg: {
    width: "100%",
    aspectRatio: 1.4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  gridLiveTag: {
    position: "absolute",
    top: 6,
    left: 6,
    zIndex: 1,
  },
  gridLogo: { width: "80%", height: "60%" },
  gridLogoFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  gridCardGlow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "40%",
  },
  gridCardName: {
    fontSize: 9,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    marginTop: 4,
  },

  // ── News
  newsRow: { marginBottom: 0 },
  newsTicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  newsLiveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(227,0,0,0.15)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(227,0,0,0.3)",
  },
  newsLiveText: { fontSize: 9, fontWeight: "900", color: "#e30000", letterSpacing: 1.5 },
  newsTickerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(227,0,0,0.2)",
  },
  newsScroll: { paddingHorizontal: 16, gap: 10 },
  newsCard: { alignItems: "center", width: 72 },
  newsCardBg: {
    width: 72,
    height: 50,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  newsLogo: { width: "85%", height: "75%" },
  newsCardName: {
    fontSize: 9,
    fontWeight: "600",
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    marginTop: 4,
  },

  // ── Promo banners
  promoScroll: { paddingHorizontal: 16, gap: 10 },
  promoBanner: {
    width: W * 0.72,
    height: 90,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    backgroundColor: "#111116",
  },
  promoBannerBg: { ...StyleSheet.absoluteFillObject },
  promoBannerContent: {
    flex: 1,
    padding: 12,
    justifyContent: "space-between",
  },
  promoTag: {
    alignSelf: "flex-start",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  promoTagText: { fontSize: 8, fontWeight: "900", color: "#fff", letterSpacing: 0.8 },
  promoBannerName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.2,
  },
  promoBannerRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  promoBannerSub: { fontSize: 10, color: "rgba(255,255,255,0.55)" },
  promoBannerLogo: {
    position: "absolute",
    right: 12,
    top: "50%",
    marginTop: -16,
    width: 48,
    height: 32,
  },

  // ── What's on now
  whatsonCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  whatsonImgWrap: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  whatsonImg: { width: "85%", height: "70%" },
  whatsonInfo: { flex: 1, gap: 3 },
  whatsonName: { fontSize: 13, fontWeight: "700", color: "#fff" },
  whatsonProg: { fontSize: 10, color: "rgba(255,255,255,0.45)" },
  whatsonProgressWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  whatsonProgressBg: {
    flex: 1,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  whatsonProgressFill: { height: "100%", borderRadius: 2 },
  whatsonRemaining: { fontSize: 9, fontWeight: "700" },
  whatsonPlay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },

  // ── TV Guide channel cards
  tvChannelCard: {
    width: W * 0.42,
    height: 178,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    padding: 12,
    justifyContent: "flex-start",
  },
  tvCardBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  tvCardBadge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
    marginTop: 4,
  },
  tvCardBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 0.3,
  },
  tvCardName: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
    marginBottom: 2,
  },
  tvCardCat: {
    fontSize: 8,
    fontWeight: "600",
    color: "rgba(255,255,255,0.3)",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  tvCardDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 8,
  },
  tvLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  tvLiveLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  tvLiveTimeLeft: {
    fontSize: 8,
    color: "rgba(255,255,255,0.35)",
    marginLeft: "auto" as any,
  },
  tvProgressBar: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    marginTop: 7,
    overflow: "hidden",
  },
  tvProgressFill: {
    height: "100%" as any,
    borderRadius: 2,
  },
  tvNowShow: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
    lineHeight: 15,
    marginTop: 2,
  },
  tvNowEp: {
    fontSize: 9,
    color: "rgba(255,255,255,0.45)",
    marginTop: 2,
  },
  tvNoGuide: {
    fontSize: 10,
    color: "rgba(255,255,255,0.3)",
    textAlign: "center",
    lineHeight: 15,
  },
  tvCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "auto" as any,
    paddingTop: 6,
  },
  tvCardHeart: {
    padding: 2,
  },

  // ── My Channels (favorites) row
  tvMyCard: {
    width: W * 0.38,
    height: 138,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    padding: 10,
  },
  tvMyCardBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  tvMyBadge: {
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  tvMyBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#fff",
  },
  tvMyShow: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
    lineHeight: 14,
  },

  // ── States
  loadingText: { color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 4 },
  errorTitle: { fontSize: 18, fontWeight: "800", color: "#fff", marginTop: 8 },
  errorText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
