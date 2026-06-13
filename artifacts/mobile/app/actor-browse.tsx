import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { api, tmdbItemToContent, type TmdbItem, type TmdbPerson, type TmdbPersonResult } from "@/lib/api";
import type { ContentItem } from "@/constants/content";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_W = 120;
const CARD_H = 180;
const PHOTO_SIZE = 110;

const TMDB_IMAGE = "https://image.tmdb.org/t/p/";

function posterUrl(path: string | null, size = "w342") {
  return path ? `${TMDB_IMAGE}${size}${path}` : null;
}

function ContentCardH({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <Pressable onPress={onPress} style={{ width: CARD_W, marginRight: 10 }}>
      <View style={styles.hCard}>
        {!imgErr && item.posterPath ? (
          <Image
            source={{ uri: item.posterPath }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <LinearGradient colors={["#1e1e1e", "#2a1a1a"]} style={StyleSheet.absoluteFill}>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Feather name="film" size={22} color="#444" />
            </View>
          </LinearGradient>
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.85)"]}
          style={styles.hCardGrad}
          locations={[0.5, 1]}
        />
        {item.rating > 0 && (
          <View style={styles.ratingBadge}>
            <Feather name="star" size={8} color="#f59e0b" />
            <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
          </View>
        )}
        <Text style={styles.hCardTitle} numberOfLines={2}>{item.title}</Text>
      </View>
    </Pressable>
  );
}

type LoadState = "loading" | "ready" | "error";

export default function ActorBrowseScreen() {
  const { name, color } = useLocalSearchParams<{ name: string; color: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;
  const accentColor = color ?? "#e50914";

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [person, setPerson] = useState<TmdbPerson | null>(null);
  const [personId, setPersonId] = useState<number | null>(null);
  const [profileUrl, setProfileUrl] = useState<string | null>(null);
  const [movies, setMovies] = useState<ContentItem[]>([]);
  const [tvShows, setTvShows] = useState<ContentItem[]>([]);
  const [showFullBio, setShowFullBio] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    setLoadState("loading");
    setPerson(null);
    setMovies([]);
    setTvShows([]);

    const load = async () => {
      try {
        // 1. Search for the person
        const results = await api.tmdb.searchPerson(name);
        if (cancelled || results.length === 0) {
          if (!cancelled) setLoadState("error");
          return;
        }
        const found = results[0];
        setPersonId(found.id);
        setProfileUrl(posterUrl(found.profile_path, "w185"));

        // 2. Load full details + credits in parallel
        const [details, movs, tv] = await Promise.all([
          api.tmdb.person(found.id),
          api.tmdb.personMovies(found.id),
          api.tmdb.personTv(found.id),
        ]);

        if (cancelled) return;
        setPerson(details);
        if (details.profile_path) setProfileUrl(posterUrl(details.profile_path, "w185"));
        setMovies(movs.slice(0, 30).map((m: TmdbItem) => tmdbItemToContent({ ...m, media_type: "movie" })));
        setTvShows(tv.slice(0, 30).map((t: TmdbItem) => tmdbItemToContent({ ...t, media_type: "tv" })));
        setLoadState("ready");
      } catch (e) {
        if (!cancelled) {
          console.error("actor-browse error:", e);
          setLoadState("error");
        }
      }
    };

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, retryKey]);

  const goToDetail = (item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"),
        id: String(item.tmdbId || item.id),
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
    if (sentences.length <= 3 || showFullBio) return bio;
    return sentences.slice(0, 3).join(". ") + ".";
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={[styles.headerWrap, { paddingTop: topPad + 8 }]}>
        <LinearGradient
          colors={[`${accentColor}25`, "transparent"]}
          style={StyleSheet.absoluteFill}
        />
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{name ?? "Ator"}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Content ────────────────────────────────────────────── */}
      {loadState === "loading" ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={[styles.loadingText, { color: "#888" }]}>
            Carregando filmografia...
          </Text>
        </View>
      ) : loadState === "error" ? (
        <View style={styles.centered}>
          <View style={[styles.errorIcon, { backgroundColor: `${accentColor}18` }]}>
            <Feather name="user-x" size={32} color={accentColor} />
          </View>
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>
            Ator não encontrado
          </Text>
          <Text style={[styles.errorSub, { color: "#888" }]}>
            Não conseguimos carregar as informações de {name}
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: accentColor }]}
            onPress={() => setRetryKey((k) => k + 1)}
          >
            <Feather name="refresh-cw" size={14} color="#fff" />
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
        >
          {/* ── Profile card ─────────────────────────────────── */}
          <View style={styles.profileCard}>
            <LinearGradient
              colors={[`${accentColor}22`, `${accentColor}06`, "transparent"]}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.profileRow}>
              {/* Photo */}
              <View style={[styles.photoWrap, { borderColor: `${accentColor}60` }]}>
                {profileUrl ? (
                  <Image
                    source={{ uri: profileUrl }}
                    style={styles.photo}
                    resizeMode="cover"
                  />
                ) : (
                  <LinearGradient colors={[`${accentColor}40`, `${accentColor}15`]} style={styles.photo}>
                    <Text style={[styles.initials, { color: accentColor }]}>
                      {(name ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2)}
                    </Text>
                  </LinearGradient>
                )}
              </View>

              {/* Info */}
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
                {person?.birthday && (
                  <View style={styles.metaRow}>
                    <Feather name="calendar" size={11} color="#666" />
                    <Text style={styles.metaText}>
                      {new Date(person.birthday).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                      {getAge(person.birthday) ? ` · ${getAge(person.birthday)} anos` : ""}
                    </Text>
                  </View>
                )}
                {person?.place_of_birth && (
                  <View style={styles.metaRow}>
                    <Feather name="map-pin" size={11} color="#666" />
                    <Text style={styles.metaText} numberOfLines={2}>{person.place_of_birth}</Text>
                  </View>
                )}
                {/* Stats */}
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={[styles.statNum, { color: accentColor }]}>{movies.length}+</Text>
                    <Text style={styles.statLabel}>Filmes</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={[styles.statNum, { color: accentColor }]}>{tvShows.length}+</Text>
                    <Text style={styles.statLabel}>Séries</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Bio */}
            {person?.biography ? (
              <View style={styles.bioWrap}>
                <Text style={styles.bioText}>
                  {truncateBio(person.biography)}
                </Text>
                {person.biography.split(". ").length > 3 && (
                  <TouchableOpacity onPress={() => setShowFullBio((v) => !v)}>
                    <Text style={[styles.bioToggle, { color: accentColor }]}>
                      {showFullBio ? "Ver menos" : "Ver mais"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
          </View>

          {/* ── Filmes ─────────────────────────────────────────── */}
          {movies.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.accent, { backgroundColor: accentColor }]} />
                <Feather name="film" size={15} color={colors.foreground} />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Filmes</Text>
                <Text style={[styles.sectionCount, { color: accentColor }]}>
                  {movies.length}
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hScroll}
                decelerationRate="fast"
              >
                {movies.map((item, idx) => (
                  <ContentCardH
                    key={`movie-${item.id}-${idx}`}
                    item={item}
                    onPress={() => goToDetail(item)}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* ── Séries ─────────────────────────────────────────── */}
          {tvShows.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.accent, { backgroundColor: accentColor }]} />
                <Feather name="tv" size={15} color={colors.foreground} />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Séries</Text>
                <Text style={[styles.sectionCount, { color: accentColor }]}>
                  {tvShows.length}
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hScroll}
                decelerationRate="fast"
              >
                {tvShows.map((item, idx) => (
                  <ContentCardH
                    key={`tv-${item.id}-${idx}`}
                    item={item}
                    onPress={() => goToDetail(item)}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Empty state if no credits */}
          {movies.length === 0 && tvShows.length === 0 && loadState === "ready" && (
            <View style={styles.emptyCredits}>
              <Feather name="film" size={32} color="#333" />
              <Text style={{ color: "#555", fontSize: 14, marginTop: 8 }}>
                Nenhum crédito encontrado
              </Text>
            </View>
          )}
        </ScrollView>
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
    paddingBottom: 12,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  loadingText: { fontSize: 13, fontWeight: "500", marginTop: 4 },
  errorIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  errorTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  errorSub: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 22,
    marginTop: 8,
  },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  profileCard: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 24,
    borderRadius: 18,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  profileRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  photoWrap: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    borderWidth: 2,
    overflow: "hidden",
    flexShrink: 0,
  },
  photo: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontSize: 32,
    fontWeight: "800",
  },
  profileInfo: {
    flex: 1,
    gap: 6,
  },
  actorName: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  deptBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deptText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
  },
  metaText: { color: "#666", fontSize: 11, flex: 1, lineHeight: 15 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 0,
  },
  statItem: { alignItems: "center", paddingHorizontal: 8 },
  statNum: { fontSize: 18, fontWeight: "800" },
  statLabel: { color: "#666", fontSize: 10, fontWeight: "600", marginTop: 1 },
  statDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.1)" },
  bioWrap: { marginTop: 14 },
  bioText: { color: "#aaa", fontSize: 13, lineHeight: 20 },
  bioToggle: { marginTop: 4, fontSize: 13, fontWeight: "600" },
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  accent: { width: 3, height: 18, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
  sectionCount: { fontSize: 13, fontWeight: "600", marginLeft: 2 },
  hScroll: { paddingHorizontal: 16 },
  hCard: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
  },
  hCardGrad: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "55%",
  },
  hCardTitle: {
    position: "absolute",
    bottom: 6,
    left: 5,
    right: 5,
    color: "#fff",
    fontSize: 9,
    fontWeight: "600",
    lineHeight: 12,
  },
  ratingBadge: {
    position: "absolute",
    top: 5,
    right: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ratingText: { color: "#f59e0b", fontSize: 8, fontWeight: "700" },
  emptyCredits: {
    alignItems: "center",
    paddingTop: 40,
  },
});
