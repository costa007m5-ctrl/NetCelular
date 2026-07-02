import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { useFollowedActors } from "@/hooks/useFollowedActors";
import { api, tmdbItemToContent, type TmdbItem, type TmdbPerson } from "@/lib/api";
import type { ContentItem } from "@/constants/content";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_PADDING = 16;
const GRID_GAP = 10;
const CARD_W = Math.floor((SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2);
const CARD_H = Math.floor(CARD_W * 1.5);
const PHOTO_SIZE = 100;
const TMDB_IMAGE = "https://image.tmdb.org/t/p/";

function posterUrl(path: string | null, size = "w342") {
  return path ? `${TMDB_IMAGE}${size}${path}` : null;
}

type Tab = "bio" | "filmes" | "series" | "embreve";

function ContentCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  const sc = useRef(new Animated.Value(1)).current;
  const pi = () => Animated.spring(sc, { toValue: 0.95, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1, useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[styles.card, { transform: [{ scale: sc }] }]}>
        {!imgErr && item.posterPath ? (
          <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" onError={() => setImgErr(true)} />
        ) : (
          <LinearGradient colors={["#1e1e1e", "#2a1a1a"]} style={StyleSheet.absoluteFill}>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Feather name="film" size={26} color="#444" />
            </View>
          </LinearGradient>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]}
          style={styles.cardGrad} locations={[0.45, 1]} />
        {item.rating > 0 && (
          <View style={styles.ratingBadge}>
            <Feather name="star" size={8} color="#f59e0b" />
            <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
          </View>
        )}
        <View style={styles.cardBottom}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          {item.year > 0 && (
            <Text style={styles.cardYear}>{item.year}</Text>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

function UpcomingCard({ item, onPress, accentColor }: { item: ContentItem; onPress: () => void; accentColor: string }) {
  const [imgErr, setImgErr] = useState(false);
  const sc = useRef(new Animated.Value(1)).current;
  const pi = () => Animated.spring(sc, { toValue: 0.95, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(sc, { toValue: 1, useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ paddingHorizontal: 16, marginBottom: 12 }}>
      <Animated.View style={[styles.upcomingCard, { borderColor: `${accentColor}30`, transform: [{ scale: sc }] }]}>
        {!imgErr && (item.backdropPath || item.posterPath) ? (
          <Image source={{ uri: item.backdropPath || item.posterPath }}
            style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
            contentFit="cover" cachePolicy="memory-disk" onError={() => setImgErr(true)} />
        ) : (
          <LinearGradient colors={[`${accentColor}25`, "#0a0810"]} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.88)"]}
          style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
          locations={[0.2, 1]}
        />
        <LinearGradient
          colors={[`${accentColor}30`, "transparent"]}
          style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        />
        <View style={styles.upcomingContent}>
          <View style={[styles.upcomingBadge, { backgroundColor: `${accentColor}25`, borderColor: `${accentColor}55` }]}>
            <Feather name="clock" size={10} color={accentColor} />
            <Text style={[styles.upcomingBadgeText, { color: accentColor }]}>EM BREVE</Text>
          </View>
          <Text style={styles.upcomingTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.upcomingMeta}>
            {item.type === "movie" ? "Filme" : "Série"}
            {item.year > 2024 ? ` · ${item.year}` : ""}
          </Text>
        </View>
        <View style={[styles.upcomingPlay, { backgroundColor: `${accentColor}cc` }]}>
          <Feather name="play" size={13} color="#fff" />
        </View>
      </Animated.View>
    </Pressable>
  );
}

type LoadState = "loading" | "ready" | "error";

export default function ActorBrowseScreen() {
  const { name, color } = useLocalSearchParams<{ name: string; color: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const accentColor = color ?? "#e50914";

  const { isFollowing, followActor, isNotifEnabled, toggleNotification } = useFollowedActors();
  const followed = isFollowing(name ?? "");
  const notifOn = isNotifEnabled(name ?? "");

  const actorObj = {
    name: name ?? "",
    initial: (name ?? "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
    color: accentColor,
  };

  const followScale = useRef(new Animated.Value(1)).current;
  const notifScale  = useRef(new Animated.Value(1)).current;

  const handleFollow = () => {
    Animated.sequence([
      Animated.timing(followScale, { toValue: 0.75, duration: 80, useNativeDriver: true }),
      Animated.spring(followScale, { toValue: 1, useNativeDriver: true, tension: 320, friction: 5 }),
    ]).start();
    followActor(actorObj);
  };

  const handleNotif = async () => {
    Animated.sequence([
      Animated.timing(notifScale, { toValue: 0.75, duration: 80, useNativeDriver: true }),
      Animated.spring(notifScale, { toValue: 1, useNativeDriver: true, tension: 320, friction: 5 }),
    ]).start();
    await toggleNotification(name ?? "");
  };

  const [activeTab, setActiveTab] = useState<Tab>("bio");
  const tabAnim = useRef(new Animated.Value(0)).current;
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [person, setPerson] = useState<TmdbPerson | null>(null);
  const [profileUrl, setProfileUrl] = useState<string | null>(null);
  const [movies, setMovies] = useState<ContentItem[]>([]);
  const [tvShows, setTvShows] = useState<ContentItem[]>([]);
  const [upcoming, setUpcoming] = useState<ContentItem[]>([]);
  const [showFullBio, setShowFullBio] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    setLoadState("loading");
    setPerson(null);
    setMovies([]);
    setTvShows([]);
    setUpcoming([]);

    const load = async () => {
      try {
        const results = await api.tmdb.searchPerson(name);
        if (cancelled || results.length === 0) {
          if (!cancelled) setLoadState("error");
          return;
        }
        const found = results[0];
        setProfileUrl(posterUrl(found.profile_path, "w185"));

        const [details, movs, tv] = await Promise.all([
          api.tmdb.person(found.id),
          api.tmdb.personMovies(found.id),
          api.tmdb.personTv(found.id),
        ]);

        if (cancelled) return;

        setPerson(details);
        if (details.profile_path) setProfileUrl(posterUrl(details.profile_path, "w342"));

        const today = new Date().toISOString().split("T")[0];

        const upcomingM = (movs as any[]).filter(
          (m: any) => m.release_date && m.release_date > today
        ).sort((a: any, b: any) => a.release_date.localeCompare(b.release_date));

        const upcomingT = (tv as any[]).filter(
          (t: any) => t.first_air_date && t.first_air_date > today
        ).sort((a: any, b: any) => a.first_air_date.localeCompare(b.first_air_date));

        const upcomingAll: ContentItem[] = [
          ...upcomingM.map((m: TmdbItem) => tmdbItemToContent({ ...m, media_type: "movie" })),
          ...upcomingT.map((t: TmdbItem) => tmdbItemToContent({ ...t, media_type: "tv" })),
        ].slice(0, 20);

        setUpcoming(upcomingAll);
        setMovies(
          (movs as any[])
            .filter((m: any) => !m.release_date || m.release_date <= today)
            .sort((a: any, b: any) => (b.popularity ?? 0) - (a.popularity ?? 0))
            .slice(0, 40)
            .map((m: TmdbItem) => tmdbItemToContent({ ...m, media_type: "movie" }))
        );
        setTvShows(
          (tv as any[])
            .filter((t: any) => !t.first_air_date || t.first_air_date <= today)
            .sort((a: any, b: any) => (b.popularity ?? 0) - (a.popularity ?? 0))
            .slice(0, 40)
            .map((t: TmdbItem) => tmdbItemToContent({ ...t, media_type: "tv" }))
        );

        setLoadState("ready");
      } catch (e) {
        if (!cancelled) { console.error("actor-browse error:", e); setLoadState("error"); }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [name, retryKey]);

  const switchTab = (tab: Tab) => {
    const idx = ["bio", "filmes", "series", "embreve"].indexOf(tab);
    Animated.spring(tabAnim, { toValue: idx, useNativeDriver: true, speed: 20, bounciness: 2 }).start();
    setActiveTab(tab);
  };

  const goToDetail = (item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"),
        id: String(item.tmdbId),
        flix2Id: String(item.id ?? ""),
        title: item.title,
        poster: item.posterPath ?? "",
      },
    });
  };

  const getAge = (birthday: string | null) => {
    if (!birthday) return null;
    const diff = Date.now() - new Date(birthday).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  };

  const truncateBio = (bio: string) => {
    if (!bio) return "";
    const sentences = bio.split(". ");
    if (sentences.length <= 4 || showFullBio) return bio;
    return sentences.slice(0, 4).join(". ") + ".";
  };

  const TABS: { id: Tab; label: string; icon: keyof typeof Feather.glyphMap; count?: number }[] = [
    { id: "bio",     label: "Bio",     icon: "user" },
    { id: "filmes",  label: "Filmes",  icon: "film",  count: movies.length  },
    { id: "series",  label: "Séries",  icon: "tv",    count: tvShows.length },
    { id: "embreve", label: "Em Breve",icon: "clock", count: upcoming.length },
  ];

  const indicatorX = tabAnim.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: [0, SCREEN_WIDTH / 4, SCREEN_WIDTH / 2, (SCREEN_WIDTH / 4) * 3],
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={[styles.headerWrap, { paddingTop: insets.top + 8 }]}>
        <LinearGradient colors={[`${accentColor}22`, "transparent"]} style={StyleSheet.absoluteFill} />
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{name ?? "Ator"}</Text>

        {/* Follow + notification buttons */}
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {followed && (
            <Animated.View style={{ transform: [{ scale: notifScale }] }}>
              <TouchableOpacity
                onPress={handleNotif}
                style={[styles.headerIconBtn, {
                  backgroundColor: notifOn ? `${accentColor}30` : "rgba(255,255,255,0.08)",
                  borderColor: notifOn ? `${accentColor}70` : "rgba(255,255,255,0.12)",
                }]}
              >
                <Feather name={notifOn ? "bell" : "bell-off"} size={16}
                  color={notifOn ? accentColor : "rgba(255,255,255,0.5)"} />
              </TouchableOpacity>
            </Animated.View>
          )}
          <Animated.View style={{ transform: [{ scale: followScale }] }}>
            <TouchableOpacity
              onPress={handleFollow}
              style={[styles.followHeaderBtn, {
                backgroundColor: followed ? accentColor : "rgba(255,255,255,0.08)",
                borderColor: followed ? accentColor : "rgba(255,255,255,0.18)",
              }]}
            >
              <Feather name={followed ? "user-check" : "user-plus"} size={14}
                color={followed ? "#fff" : "rgba(255,255,255,0.75)"} />
              <Text style={[styles.followHeaderText, { color: followed ? "#fff" : "rgba(255,255,255,0.75)" }]}>
                {followed ? "Seguindo" : "Seguir"}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>

      {/* ── Notification banner (shown when notif is on) ── */}
      {followed && notifOn && (
        <View style={[styles.notifBanner, { backgroundColor: `${accentColor}14`, borderColor: `${accentColor}30` }]}>
          <Feather name="bell" size={12} color={accentColor} />
          <Text style={[styles.notifBannerText, { color: accentColor }]}>
            Você receberá notificações de novos lançamentos de {name?.split(" ")[0]}
          </Text>
          <TouchableOpacity onPress={handleNotif} hitSlop={8}>
            <Feather name="x" size={12} color={`${accentColor}80`} />
          </TouchableOpacity>
        </View>
      )}

      {loadState === "loading" ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={[styles.loadingText, { color: "#888" }]}>Carregando informações...</Text>
        </View>
      ) : loadState === "error" ? (
        <View style={styles.centered}>
          <View style={[styles.errorIcon, { backgroundColor: `${accentColor}18` }]}>
            <Feather name="user-x" size={32} color={accentColor} />
          </View>
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>Ator não encontrado</Text>
          <Text style={[styles.errorSub, { color: "#888" }]}>
            Não conseguimos carregar as informações de {name}
          </Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: accentColor }]}
            onPress={() => setRetryKey((k) => k + 1)}>
            <Feather name="refresh-cw" size={14} color="#fff" />
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* ── Profile strip ────────────────────────────────────────── */}
          <View style={styles.profileStrip}>
            <LinearGradient
              colors={[`${accentColor}18`, `${accentColor}06`, "transparent"]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.profileRow}>
              <View style={[styles.photoWrap, { borderColor: `${accentColor}60` }]}>
                {profileUrl ? (
                  <Image source={{ uri: profileUrl }} style={styles.photo}
                    contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <LinearGradient colors={[`${accentColor}50`, `${accentColor}20`]} style={styles.photo}>
                    <Text style={[styles.initials, { color: accentColor }]}>
                      {(name ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </Text>
                  </LinearGradient>
                )}
              </View>

              <View style={styles.profileInfo}>
                <Text style={[styles.actorName, { color: colors.foreground }]} numberOfLines={2}>
                  {person?.name ?? name}
                </Text>
                {person?.known_for_department && (
                  <View style={[styles.deptBadge, { backgroundColor: `${accentColor}20`, borderColor: `${accentColor}40` }]}>
                    <Text style={[styles.deptText, { color: accentColor }]}>
                      {person.known_for_department === "Acting" ? "Ator / Atriz" : person.known_for_department}
                    </Text>
                  </View>
                )}
                {person?.place_of_birth ? (
                  <View style={styles.metaRow}>
                    <Feather name="map-pin" size={10} color="#555" />
                    <Text style={styles.metaText} numberOfLines={1}>{person.place_of_birth}</Text>
                  </View>
                ) : null}
                {person?.birthday ? (
                  <View style={styles.metaRow}>
                    <Feather name="calendar" size={10} color="#555" />
                    <Text style={styles.metaText}>
                      {new Date(person.birthday).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                      {getAge(person.birthday) ? ` · ${getAge(person.birthday)} anos` : ""}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.statsRow}>
                  {[
                    { val: movies.length, label: "Filmes" },
                    { val: tvShows.length, label: "Séries" },
                    { val: upcoming.length, label: "Em Breve" },
                  ].map((s, i) => (
                    <React.Fragment key={s.label}>
                      {i > 0 && <View style={styles.statDivider} />}
                      <View style={styles.statItem}>
                        <Text style={[styles.statNum, { color: accentColor }]}>{s.val}</Text>
                        <Text style={styles.statLabel}>{s.label}</Text>
                      </View>
                    </React.Fragment>
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* ── Tab bar ──────────────────────────────────────────────── */}
          <View style={[styles.tabBar, { borderBottomColor: "rgba(255,255,255,0.06)" }]}>
            <Animated.View style={[styles.tabIndicator, {
              backgroundColor: accentColor,
              width: SCREEN_WIDTH / 4,
              transform: [{ translateX: indicatorX }],
            }]} />
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={styles.tabBtn}
                  onPress={() => switchTab(tab.id)}
                  activeOpacity={0.7}
                >
                  <Feather name={tab.icon} size={14}
                    color={isActive ? accentColor : "rgba(255,255,255,0.35)"} />
                  <Text style={[styles.tabLabel, { color: isActive ? accentColor : "rgba(255,255,255,0.4)" }]}>
                    {tab.label}
                  </Text>
                  {tab.count !== undefined && tab.count > 0 && (
                    <View style={[styles.tabBadge, {
                      backgroundColor: isActive ? `${accentColor}30` : "rgba(255,255,255,0.07)",
                      borderColor: isActive ? `${accentColor}50` : "rgba(255,255,255,0.1)",
                    }]}>
                      <Text style={[styles.tabBadgeText, { color: isActive ? accentColor : "rgba(255,255,255,0.35)" }]}>
                        {tab.count}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Tab content ──────────────────────────────────────────── */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
          >
            {/* BIO TAB */}
            {activeTab === "bio" && (
              <View style={styles.tabContent}>
                {person?.biography ? (
                  <View style={styles.bioCard}>
                    <LinearGradient
                      colors={[`${accentColor}12`, "transparent"]}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.bioHeader}>
                      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
                      <Text style={[styles.bioTitle, { color: colors.foreground }]}>História</Text>
                    </View>
                    <Text style={styles.bioText}>{truncateBio(person.biography)}</Text>
                    {person.biography.split(". ").length > 4 && (
                      <TouchableOpacity onPress={() => setShowFullBio((v) => !v)} style={styles.bioToggleBtn}>
                        <Text style={[styles.bioToggle, { color: accentColor }]}>
                          {showFullBio ? "Ver menos" : "Ler tudo"}
                        </Text>
                        <Feather name={showFullBio ? "chevron-up" : "chevron-down"} size={13} color={accentColor} />
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <View style={styles.emptyBio}>
                    <Feather name="user" size={32} color="#333" />
                    <Text style={{ color: "#555", fontSize: 14, marginTop: 8, textAlign: "center" }}>
                      Biografia não disponível para {name}
                    </Text>
                  </View>
                )}

                {/* Quick stats cards */}
                <View style={styles.infoGrid}>
                  {person?.birthday ? (
                    <View style={[styles.infoCard, { borderColor: `${accentColor}20` }]}>
                      <Feather name="calendar" size={16} color={accentColor} />
                      <Text style={styles.infoCardLabel}>Nascimento</Text>
                      <Text style={[styles.infoCardValue, { color: colors.foreground }]}>
                        {new Date(person.birthday).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                      </Text>
                    </View>
                  ) : null}
                  {person?.place_of_birth ? (
                    <View style={[styles.infoCard, { borderColor: `${accentColor}20` }]}>
                      <Feather name="map-pin" size={16} color={accentColor} />
                      <Text style={styles.infoCardLabel}>Local de Nascimento</Text>
                      <Text style={[styles.infoCardValue, { color: colors.foreground }]} numberOfLines={2}>
                        {person.place_of_birth}
                      </Text>
                    </View>
                  ) : null}
                  {movies.length > 0 && (
                    <View style={[styles.infoCard, { borderColor: `${accentColor}20` }]}>
                      <Feather name="film" size={16} color={accentColor} />
                      <Text style={styles.infoCardLabel}>Filmes</Text>
                      <Text style={[styles.infoCardValue, { color: colors.foreground }]}>{movies.length}+</Text>
                    </View>
                  )}
                  {tvShows.length > 0 && (
                    <View style={[styles.infoCard, { borderColor: `${accentColor}20` }]}>
                      <Feather name="tv" size={16} color={accentColor} />
                      <Text style={styles.infoCardLabel}>Séries</Text>
                      <Text style={[styles.infoCardValue, { color: colors.foreground }]}>{tvShows.length}+</Text>
                    </View>
                  )}
                </View>

                {/* Top known movies preview */}
                {movies.slice(0, 6).length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <View style={[styles.accentBarSm, { backgroundColor: accentColor }]} />
                      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Filmes em Destaque</Text>
                      <TouchableOpacity onPress={() => switchTab("filmes")} style={styles.seeAllBtn}>
                        <Text style={[styles.seeAllText, { color: accentColor }]}>Ver todos</Text>
                        <Feather name="chevron-right" size={12} color={accentColor} />
                      </TouchableOpacity>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.hScroll} decelerationRate="fast">
                      {movies.slice(0, 6).map((item, idx) => (
                        <ContentCard key={`bio-mv-${item.id}-${idx}`} item={item} onPress={() => goToDetail(item)} />
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            {/* FILMES TAB */}
            {activeTab === "filmes" && (
              <View style={styles.tabContent}>
                {movies.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Feather name="film" size={40} color="#333" />
                    <Text style={styles.emptyText}>Nenhum filme encontrado</Text>
                  </View>
                ) : (
                  <View style={styles.gridWrap}>
                    {movies.map((item, idx) => (
                      <ContentCard key={`mv-${item.id}-${idx}`} item={item} onPress={() => goToDetail(item)} />
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* SÉRIES TAB */}
            {activeTab === "series" && (
              <View style={styles.tabContent}>
                {tvShows.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Feather name="tv" size={40} color="#333" />
                    <Text style={styles.emptyText}>Nenhuma série encontrada</Text>
                  </View>
                ) : (
                  <View style={styles.gridWrap}>
                    {tvShows.map((item, idx) => (
                      <ContentCard key={`tv-${item.id}-${idx}`} item={item} onPress={() => goToDetail(item)} />
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* EM BREVE TAB */}
            {activeTab === "embreve" && (
              <View style={styles.tabContent}>
                {upcoming.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Feather name="clock" size={40} color="#333" />
                    <Text style={styles.emptyText}>Nenhum lançamento previsto</Text>
                    <Text style={styles.emptySubText}>
                      Não há conteúdo futuro confirmado para {name} no momento
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.upcomingHeader}>
                      <Feather name="clock" size={14} color={accentColor} />
                      <Text style={[styles.upcomingHeaderText, { color: accentColor }]}>
                        {upcoming.length} título{upcoming.length !== 1 ? "s" : ""} em breve
                      </Text>
                    </View>
                    {upcoming.map((item, idx) => (
                      <UpcomingCard
                        key={`up-${item.id}-${idx}`}
                        item={item}
                        onPress={() => goToDetail(item)}
                        accentColor={accentColor}
                      />
                    ))}
                  </>
                )}
              </View>
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: "center", justifyContent: "center",
    borderRadius: 20,
  },
  headerTitle: {
    flex: 1, textAlign: "center",
    color: "#fff", fontSize: 17, fontWeight: "700", letterSpacing: -0.2,
  },
  centered: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: 12, paddingHorizontal: 32,
  },
  loadingText: { fontSize: 13, fontWeight: "500", marginTop: 4 },
  errorIcon: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  errorTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  errorSub: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  retryBtn: {
    flexDirection: "row", alignItems: "center",
    gap: 8, paddingHorizontal: 20, paddingVertical: 11,
    borderRadius: 22, marginTop: 8,
  },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  profileStrip: {
    paddingHorizontal: 16, paddingVertical: 14,
    overflow: "hidden",
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)",
  },
  profileRow: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  photoWrap: {
    width: PHOTO_SIZE, height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2, borderWidth: 2,
    overflow: "hidden", flexShrink: 0,
  },
  photo: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  initials: { fontSize: 28, fontWeight: "800" },
  profileInfo: { flex: 1, gap: 5 },
  actorName: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3, lineHeight: 22 },
  deptBadge: {
    alignSelf: "flex-start", borderWidth: 1,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  deptText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  metaRow: { flexDirection: "row", alignItems: "flex-start", gap: 5 },
  metaText: { color: "#666", fontSize: 10, flex: 1, lineHeight: 14 },
  statsRow: { flexDirection: "row", alignItems: "center", marginTop: 2, gap: 0 },
  statItem: { alignItems: "center", paddingHorizontal: 10 },
  statNum: { fontSize: 16, fontWeight: "800" },
  statLabel: { color: "#555", fontSize: 9, fontWeight: "600", marginTop: 1 },
  statDivider: { width: 1, height: 24, backgroundColor: "rgba(255,255,255,0.08)" },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    position: "relative",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0, height: 2,
    borderTopLeftRadius: 1, borderTopRightRadius: 1,
  },
  tabBtn: {
    flex: 1, paddingVertical: 10,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 4,
  },
  tabLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },
  tabBadge: {
    borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1,
    borderWidth: 1, marginLeft: 2,
  },
  tabBadgeText: { fontSize: 9, fontWeight: "700" },

  tabContent: { paddingTop: 16 },

  bioCard: {
    marginHorizontal: 16, marginBottom: 16,
    borderRadius: 16, padding: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  bioHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  bioTitle: { fontSize: 15, fontWeight: "700" },
  accentBar: { width: 3, height: 17, borderRadius: 2 },
  bioText: { color: "#aaa", fontSize: 13, lineHeight: 21 },
  bioToggleBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  bioToggle: { fontSize: 13, fontWeight: "600" },
  emptyBio: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 32 },

  infoGrid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: 16, gap: 10, marginBottom: 20,
  },
  infoCard: {
    flex: 1, minWidth: (SCREEN_WIDTH - 52) / 2,
    borderRadius: 12, padding: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, gap: 4,
  },
  infoCardLabel: { color: "#555", fontSize: 10, fontWeight: "600", marginTop: 2 },
  infoCardValue: { fontSize: 12, fontWeight: "700", lineHeight: 16 },

  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center",
    gap: 8, paddingHorizontal: 16, marginBottom: 12,
  },
  accentBarSm: { width: 3, height: 15, borderRadius: 2 },
  sectionTitle: { fontSize: 15, fontWeight: "700", flex: 1 },
  seeAllBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { fontSize: 12, fontWeight: "600" },
  hScroll: { paddingHorizontal: 16, gap: 10 },

  gridWrap: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: GRID_PADDING, gap: GRID_GAP,
  },
  card: {
    width: CARD_W, height: CARD_H,
    borderRadius: 12, overflow: "hidden",
    backgroundColor: "#1a1a1a",
  },
  cardGrad: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: "60%",
  },
  cardBottom: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: 8, gap: 2,
  },
  cardTitle: {
    color: "#fff", fontSize: 11, fontWeight: "700", lineHeight: 14,
  },
  cardYear: {
    color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: "500",
  },
  ratingBadge: {
    position: "absolute", top: 6, right: 6,
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "rgba(0,0,0,0.78)", paddingHorizontal: 5, paddingVertical: 3, borderRadius: 5,
  },
  ratingText: { color: "#f59e0b", fontSize: 9, fontWeight: "700" },

  upcomingHeader: {
    flexDirection: "row", alignItems: "center",
    gap: 6, paddingHorizontal: 16, marginBottom: 14,
  },
  upcomingHeaderText: { fontSize: 13, fontWeight: "700", letterSpacing: 0.2 },
  upcomingCard: {
    height: 150, borderRadius: 14, overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
  },
  upcomingContent: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: 14, gap: 3,
  },
  upcomingBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1, marginBottom: 4,
  },
  upcomingBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  upcomingTitle: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  upcomingMeta: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "600" },
  upcomingPlay: {
    position: "absolute", top: 12, right: 12,
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },

  emptyState: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32, gap: 10 },
  emptyText: { color: "#555", fontSize: 15, fontWeight: "600", textAlign: "center" },
  emptySubText: { color: "#444", fontSize: 13, textAlign: "center", lineHeight: 18 },

  headerIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  followHeaderBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 18, borderWidth: 1,
  },
  followHeaderText: { fontSize: 12, fontWeight: "700" },

  notifBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginTop: 2, marginBottom: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1,
  },
  notifBannerText: { flex: 1, fontSize: 11, fontWeight: "600", lineHeight: 15 },
});
