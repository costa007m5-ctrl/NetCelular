import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { ContentCard } from "@/components/ContentCard";
import { api as convexApi } from "@/convex/_generated/api";
import { api as tmdbApi, TMDB_IMG, tmdbItemToContent } from "@/lib/api";
import type { TmdbItem, TmdbEpisode, TmdbSeason } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { isConvexConfigured } from "@/lib/convex-client";
import type { ContentItem } from "@/constants/content";

const { width: W } = Dimensions.get("window");
const BACKDROP_H = Math.round(W * 0.58);
type Tab = "about" | "episodes" | "related" | "details";

export default function DetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ type: string; id: string; title?: string }>();

  const type = (params.type ?? "movie") as "movie" | "tv";
  const tmdbId = Number(params.id ?? 0);

  const [details, setDetails] = useState<TmdbItem | null>(null);
  const [similar, setSimilar] = useState<ContentItem[]>([]);
  const [seasons, setSeasons] = useState<TmdbSeason[]>([]);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodeList, setEpisodeList] = useState<TmdbEpisode[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("about");
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  // Convex state
  const userId = user?.id ?? "";
  const inListRaw = useQuery(
    isConvexConfigured && userId ? convexApi.watchlist.isAdded : "skip",
    isConvexConfigured && userId ? { userId, tmdbId, type } : "skip"
  );
  const ratingRaw = useQuery(
    isConvexConfigured && userId ? convexApi.ratings.getRating : "skip",
    isConvexConfigured && userId ? { userId, tmdbId, type } : "skip"
  );
  const addToList = useMutation(convexApi.watchlist.add);
  const removeFromList = useMutation(convexApi.watchlist.remove);
  const setRating = useMutation(convexApi.ratings.setRating);

  const inList = Boolean(inListRaw);
  const liked = ratingRaw?.liked;

  // Load details
  useEffect(() => {
    if (!tmdbId) return;
    setLoading(true);
    const fetchAll = async () => {
      try {
        if (type === "movie") {
          const [det, sim] = await Promise.all([
            tmdbApi.tmdb.movie(tmdbId),
            tmdbApi.tmdb.movieSimilar(tmdbId),
          ]);
          setDetails(det);
          setSimilar(sim.map(tmdbItemToContent));
        } else {
          const [det, sim] = await Promise.all([
            tmdbApi.tmdb.tv(tmdbId),
            tmdbApi.tmdb.tvSimilar(tmdbId),
          ]);
          setDetails(det);
          setSimilar(sim.map(tmdbItemToContent));
          const numSeasons = (det as any).number_of_seasons ?? 1;
          const seasonList: TmdbSeason[] = Array.from({ length: numSeasons }, (_, i) => ({
            id: i + 1,
            season_number: i + 1,
            name: `Temporada ${i + 1}`,
            overview: "",
            episode_count: 0,
            poster_path: null,
            air_date: "",
          }));
          setSeasons(seasonList);
        }
      } catch (e) {
        console.warn("Detail fetch error:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [tmdbId, type]);

  // Load episodes when season changes
  useEffect(() => {
    if (type !== "tv" || !tmdbId) return;
    setLoadingEpisodes(true);
    tmdbApi.tmdb
      .tvSeason(tmdbId, selectedSeason)
      .then((s) => setEpisodeList(s.episodes ?? []))
      .catch(() => setEpisodeList([]))
      .finally(() => setLoadingEpisodes(false));
  }, [tmdbId, type, selectedSeason]);

  const toggleList = async () => {
    if (!userId || !details) return;
    const args = {
      userId,
      tmdbId,
      type,
      title: details.title ?? details.name ?? "",
      posterPath: TMDB_IMG(details.poster_path, "w500") ?? "",
      backdropPath: TMDB_IMG(details.backdrop_path, "w1280") ?? undefined,
    };
    if (inList) await removeFromList({ userId, tmdbId, type });
    else await addToList(args);
  };

  const handleLike = async (val: boolean) => {
    if (!userId) return;
    await setRating({ userId, tmdbId, type, liked: val });
  };

  const handleShare = async () => {
    if (!details) return;
    try {
      await Share.share({ message: `Assista "${details.title ?? details.name}" no NETPLAY!` });
    } catch {}
  };

  const goToPlayer = (season = 1, episode = 1) => {
    router.push({
      pathname: "/player",
      params: {
        type,
        id: String(tmdbId),
        season: String(season),
        episode: String(episode),
        title: details?.title ?? details?.name ?? "",
        posterPath: details?.poster_path ?? "",
        backdropPath: details?.backdrop_path ?? "",
      },
    });
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "about", label: "SOBRE" },
    ...(type === "tv" ? [{ key: "episodes" as Tab, label: "EPISÓDIOS" }] : []),
    { key: "related", label: "RELACIONADOS" },
    { key: "details", label: "DETALHES" },
  ];

  if (!tmdbId) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtnAbs}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={styles.centered}>
          <Text style={{ color: colors.mutedForeground }}>ID inválido</Text>
        </View>
      </View>
    );
  }

  const backdropUri = details ? TMDB_IMG(details.backdrop_path, "w1280") : null;
  const posterUri = details ? TMDB_IMG(details.poster_path, "w500") : null;
  const title = details?.title ?? details?.name ?? params.title ?? "Carregando...";
  const year = (details?.release_date ?? details?.first_air_date ?? "").slice(0, 4);
  const rating = details?.vote_average ? Math.round(details.vote_average * 10) / 10 : null;
  const likePercent = rating ? Math.round((rating / 10) * 100) : null;
  const genreStr = details?.genres?.map((g) => g.name).join(" • ") ?? "";
  const runtime = (details as any)?.runtime;
  const numSeasons = (details as any)?.number_of_seasons;
  const overview = details?.overview ?? "";
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Backdrop */}
        <View style={{ height: BACKDROP_H + topPad }}>
          {backdropUri && !imgError ? (
            <Image
              source={{ uri: backdropUri }}
              style={[StyleSheet.absoluteFill, { height: BACKDROP_H + topPad }]}
              resizeMode="cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <LinearGradient colors={["#1a0000", "#141414"]} style={[StyleSheet.absoluteFill]} />
          )}
          <LinearGradient
            colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.7)", colors.background]}
            style={[StyleSheet.absoluteFill]}
          />
          {/* Back & Share buttons */}
          <View style={[styles.topBar, { paddingTop: topPad + 8 }]}>
            <Pressable onPress={() => router.back()} style={styles.circleBtn}>
              <Feather name="arrow-left" size={20} color="#fff" />
            </Pressable>
            <Pressable onPress={handleShare} style={styles.circleBtn}>
              <Feather name="share-2" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <>
              {/* Badge */}
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={styles.badgeText}>CATÁLOGO PREMIUM</Text>
              </View>

              {/* Title */}
              <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>

              {/* Meta row */}
              <View style={styles.metaRow}>
                {genreStr ? (
                  <Text style={[styles.meta, { color: colors.mutedForeground }]}>{genreStr}</Text>
                ) : null}
                {year ? (
                  <Text style={[styles.meta, { color: colors.mutedForeground }]}>• {year}</Text>
                ) : null}
                {runtime ? (
                  <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                    • {Math.floor(runtime / 60)}h {runtime % 60}min
                  </Text>
                ) : null}
                {numSeasons ? (
                  <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                    • {numSeasons} temporada{numSeasons > 1 ? "s" : ""}
                  </Text>
                ) : null}
              </View>

              {/* Rating row */}
              {rating ? (
                <View style={styles.ratingRow}>
                  <Feather name="star" size={14} color="#f5c518" />
                  <Text style={[styles.ratingNum, { color: colors.foreground }]}>{rating}</Text>
                  {likePercent ? (
                    <>
                      <Feather name="thumbs-up" size={14} color="#4caf50" style={{ marginLeft: 12 }} />
                      <Text style={[styles.ratingNum, { color: colors.foreground }]}>{likePercent}%</Text>
                    </>
                  ) : null}
                </View>
              ) : null}

              {/* Watch button */}
              <Pressable
                style={({ pressed }) => [styles.watchBtn, pressed && { opacity: 0.85 }]}
                onPress={() => goToPlayer(1, 1)}
              >
                <Feather name="play" size={18} color="#fff" />
                <Text style={styles.watchBtnText}>ASSISTIR AGORA</Text>
              </Pressable>

              {/* Action row */}
              <View style={styles.actionRow}>
                <Pressable style={styles.actionBtn} onPress={toggleList}>
                  <Feather name={inList ? "check" : "plus"} size={20} color={inList ? colors.primary : colors.foreground} />
                  <Text style={[styles.actionLabel, { color: inList ? colors.primary : colors.mutedForeground }]}>
                    {inList ? "Na Lista" : "Minha Lista"}
                  </Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={() => handleLike(true)}>
                  <Feather name="thumbs-up" size={20} color={liked === true ? "#4caf50" : colors.foreground} />
                  <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>Gostei</Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={() => handleLike(false)}>
                  <Feather name="thumbs-down" size={20} color={liked === false ? colors.primary : colors.foreground} />
                  <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>Não gostei</Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={handleShare}>
                  <Feather name="share-2" size={20} color={colors.foreground} />
                  <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>Compartilhar</Text>
                </Pressable>
              </View>

              {/* Tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
                {tabs.map((t) => (
                  <Pressable
                    key={t.key}
                    onPress={() => setActiveTab(t.key)}
                    style={[styles.tab, activeTab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        { color: activeTab === t.key ? colors.foreground : colors.mutedForeground },
                      ]}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={[styles.tabDivider, { backgroundColor: colors.border }]} />

              {/* Tab content */}
              {activeTab === "about" && (
                <View style={styles.tabContent}>
                  {overview ? (
                    <Text style={[styles.description, { color: colors.foreground }]}>{overview}</Text>
                  ) : (
                    <Text style={{ color: colors.mutedForeground }}>Sem descrição disponível.</Text>
                  )}
                </View>
              )}

              {activeTab === "episodes" && type === "tv" && (
                <View style={styles.tabContent}>
                  {/* Season selector */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: "row", gap: 8, paddingRight: 16 }}>
                      {seasons.map((s) => (
                        <Pressable
                          key={s.season_number}
                          onPress={() => setSelectedSeason(s.season_number)}
                          style={[
                            styles.seasonBtn,
                            {
                              backgroundColor:
                                selectedSeason === s.season_number ? colors.primary : colors.card,
                              borderColor:
                                selectedSeason === s.season_number ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.seasonBtnText,
                              { color: selectedSeason === s.season_number ? "#fff" : colors.foreground },
                            ]}
                          >
                            T{s.season_number}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>

                  {loadingEpisodes ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
                  ) : episodeList.length === 0 ? (
                    <Text style={{ color: colors.mutedForeground }}>Nenhum episódio encontrado.</Text>
                  ) : (
                    episodeList.map((ep) => (
                      <Pressable
                        key={ep.episode_number}
                        style={[styles.episodeRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={() => goToPlayer(selectedSeason, ep.episode_number)}
                      >
                        {ep.still_path ? (
                          <Image
                            source={{ uri: TMDB_IMG(ep.still_path, "w500") ?? "" }}
                            style={styles.episodeThumb}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={[styles.episodeThumb, { backgroundColor: colors.border, alignItems: "center", justifyContent: "center" }]}>
                            <Feather name="film" size={20} color={colors.mutedForeground} />
                          </View>
                        )}
                        <View style={styles.episodeInfo}>
                          <Text style={[styles.episodeNum, { color: colors.mutedForeground }]}>
                            Ep. {ep.episode_number}
                          </Text>
                          <Text style={[styles.episodeName, { color: colors.foreground }]} numberOfLines={2}>
                            {ep.name}
                          </Text>
                          {ep.runtime ? (
                            <Text style={[styles.episodeMeta, { color: colors.border }]}>
                              {ep.runtime} min
                            </Text>
                          ) : null}
                        </View>
                        <Feather name="play-circle" size={28} color={colors.primary} />
                      </Pressable>
                    ))
                  )}
                </View>
              )}

              {activeTab === "related" && (
                <View style={styles.tabContent}>
                  {similar.length === 0 ? (
                    <Text style={{ color: colors.mutedForeground }}>Nenhum título relacionado.</Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: "row", gap: 10, paddingRight: 20 }}>
                        {similar.slice(0, 12).map((item) => (
                          <ContentCard
                            key={item.id}
                            item={item}
                            width={110}
                            height={160}
                            onPress={() =>
                              router.push({
                                pathname: "/detail",
                                params: { type: item.mediaType ?? "movie", id: String(item.tmdbId) },
                              })
                            }
                          />
                        ))}
                      </View>
                    </ScrollView>
                  )}
                </View>
              )}

              {activeTab === "details" && (
                <View style={styles.tabContent}>
                  {[
                    { label: "Título original", value: (details as any)?.original_title ?? (details as any)?.original_name },
                    { label: "Tipo", value: type === "movie" ? "Filme" : "Série" },
                    { label: "Ano", value: year },
                    { label: "Avaliação TMDB", value: rating ? `${rating}/10` : null },
                    { label: "Gêneros", value: genreStr },
                    { label: "Duração", value: runtime ? `${Math.floor(runtime / 60)}h ${runtime % 60}min` : null },
                    { label: "Temporadas", value: numSeasons ? String(numSeasons) : null },
                    { label: "Total episódios", value: (details as any)?.number_of_episodes ? String((details as any).number_of_episodes) : null },
                  ]
                    .filter((r) => r.value)
                    .map((r) => (
                      <View key={r.label} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
                        <Text style={[styles.detailValue, { color: colors.foreground }]}>{r.value}</Text>
                      </View>
                    ))}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  backBtnAbs: {
    position: "absolute",
    top: 60,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex: 10,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoSection: { paddingHorizontal: 20, paddingTop: 8 },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  title: { fontSize: 26, fontWeight: "900", letterSpacing: -0.5, marginBottom: 8, lineHeight: 32 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 8 },
  meta: { fontSize: 13 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 },
  ratingNum: { fontSize: 14, fontWeight: "600" },
  watchBtn: {
    backgroundColor: "#e50914",
    borderRadius: 12,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 16,
  },
  watchBtnText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.5 },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 28,
  },
  actionBtn: { alignItems: "center", gap: 6, minWidth: 60 },
  actionLabel: { fontSize: 10, fontWeight: "500", textAlign: "center" },
  tabsScroll: { marginBottom: 0 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginRight: 4,
  },
  tabText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  tabDivider: { height: 1, marginBottom: 20 },
  tabContent: { paddingBottom: 8 },
  description: { fontSize: 15, lineHeight: 23, color: "#ccc" },
  seasonBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  seasonBtnText: { fontSize: 13, fontWeight: "600" },
  episodeRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    overflow: "hidden",
    gap: 12,
    paddingRight: 14,
  },
  episodeThumb: { width: 110, height: 70 },
  episodeInfo: { flex: 1 },
  episodeNum: { fontSize: 11, marginBottom: 2 },
  episodeName: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  episodeMeta: { fontSize: 11, marginTop: 3 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  detailLabel: { fontSize: 13, flex: 1 },
  detailValue: { fontSize: 13, fontWeight: "500", flex: 2, textAlign: "right" },
});
