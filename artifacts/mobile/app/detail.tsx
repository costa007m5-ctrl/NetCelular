import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { ContentCard } from "@/components/ContentCard";
import { api as tmdbApi, TMDB_IMG, tmdbItemToContent } from "@/lib/api";
import type { TmdbItem, TmdbEpisode, TmdbSeason } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import type { WatchProgress } from "@/lib/supabase";
import type { ContentItem } from "@/constants/content";

const { width: W } = Dimensions.get("window");
const BACKDROP_H = Math.round(W * 0.58);
type Tab = "about" | "episodes" | "related" | "details";

interface Provider {
  logo_path: string;
  provider_id: number;
  provider_name: string;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

function EpisodeRow({
  ep,
  watched,
  current,
  colors,
  onPress,
}: {
  ep: TmdbEpisode;
  watched: boolean;
  current: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  onPress: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      style={[styles.episodeRow, { backgroundColor: colors.card, borderColor: current ? colors.primary : colors.border }]}
      onPress={onPress}
    >
      {/* Thumbnail */}
      {ep.still_path ? (
        <Image
          source={{ uri: TMDB_IMG(ep.still_path, "w500") ?? "" }}
          style={styles.episodeThumb}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.episodeThumb, { backgroundColor: colors.border, alignItems: "center", justifyContent: "center" }]}>
          <Feather name="film" size={18} color={colors.mutedForeground} />
        </View>
      )}

      {/* Info */}
      <View style={styles.episodeInfo}>
        <View style={styles.epTopRow}>
          <Text style={[styles.episodeNum, { color: colors.mutedForeground }]}>
            Ep. {ep.episode_number}
          </Text>
          {ep.air_date ? (
            <Text style={[styles.epDate, { color: colors.mutedForeground }]}>
              {formatDate(ep.air_date)}
            </Text>
          ) : null}
        </View>

        <Text style={[styles.episodeName, { color: colors.foreground }]} numberOfLines={2}>
          {ep.name}
        </Text>

        <View style={styles.epMetaRow}>
          {ep.runtime ? (
            <View style={styles.epMetaItem}>
              <Feather name="clock" size={10} color={colors.mutedForeground} />
              <Text style={[styles.episodeMeta, { color: colors.mutedForeground }]}>
                {ep.runtime} min
              </Text>
            </View>
          ) : null}
          {watched && (
            <View style={styles.epMetaItem}>
              <Feather name="check-circle" size={10} color="#4ade80" />
              <Text style={[styles.episodeMeta, { color: "#4ade80" }]}>Assistido</Text>
            </View>
          )}
          {current && (
            <View style={styles.epMetaItem}>
              <Feather name="play" size={10} color={colors.primary} />
              <Text style={[styles.episodeMeta, { color: colors.primary }]}>Em andamento</Text>
            </View>
          )}
        </View>

        {ep.overview ? (
          <Pressable onPress={() => setExpanded((v) => !v)}>
            <Text
              style={[styles.epSynopsis, { color: colors.mutedForeground }]}
              numberOfLines={expanded ? undefined : 2}
            >
              {ep.overview}
            </Text>
            {ep.overview.length > 80 && (
              <Text style={[styles.epSynopsisToggle, { color: colors.primary }]}>
                {expanded ? "menos" : "mais"}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>

      {/* Play button */}
      <Pressable onPress={onPress} style={styles.epPlayBtn}>
        <Feather name="play-circle" size={30} color={current ? colors.primary : colors.foreground} />
      </Pressable>
    </Pressable>
  );
}

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
  const [providers, setProviders] = useState<Provider[]>([]);
  const [watchProgress, setWatchProgress] = useState<WatchProgress | null>(null);
  const [checking, setChecking] = useState(false);
  const [unavailableVisible, setUnavailableVisible] = useState(false);
  const [indicated, setIndicated] = useState(false);

  const userId = user?.id ?? "";
  const [inList, setInList] = useState(false);
  const [liked, setLiked] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!userId || !tmdbId || !isSupabaseConfigured) return;
    db.watchlist.isAdded(userId, tmdbId, type).then(setInList);
    db.ratings.get(userId, tmdbId, type).then((r) => setLiked(r?.liked));
    if (type === "tv") {
      db.progress.getForShow(userId, tmdbId, "tv").then(setWatchProgress);
    }
  }, [userId, tmdbId, type]);

  // Load details
  useEffect(() => {
    if (!tmdbId) return;
    setLoading(true);
    const fetchAll = async () => {
      try {
        if (type === "movie") {
          const [det, sim, prov] = await Promise.all([
            tmdbApi.tmdb.movie(tmdbId),
            tmdbApi.tmdb.movieSimilar(tmdbId),
            tmdbApi.tmdb.providers("movie", tmdbId),
          ]);
          setDetails(det);
          setSimilar(sim.map(tmdbItemToContent));
          setProviders(prov?.flatrate ?? []);
        } else {
          const [det, sim, prov] = await Promise.all([
            tmdbApi.tmdb.tv(tmdbId),
            tmdbApi.tmdb.tvSimilar(tmdbId),
            tmdbApi.tmdb.providers("tv", tmdbId),
          ]);
          setDetails(det);
          setSimilar(sim.map(tmdbItemToContent));
          setProviders(prov?.flatrate ?? []);
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
    if (inList) {
      await db.watchlist.remove(userId, tmdbId, type);
      setInList(false);
    } else {
      await db.watchlist.add({
        user_id: userId,
        tmdb_id: tmdbId,
        type,
        title: details.title ?? details.name ?? "",
        poster_path: TMDB_IMG(details.poster_path, "w500") ?? "",
        backdrop_path: TMDB_IMG(details.backdrop_path, "w1280") ?? undefined,
      });
      setInList(true);
    }
  };

  const handleLike = async (val: boolean) => {
    if (!userId) return;
    await db.ratings.set(userId, tmdbId, type, val);
    setLiked(val);
  };

  const handleShare = async () => {
    if (!details) return;
    try {
      await Share.share({ message: `Assista "${details.title ?? details.name}" no NETPLAY!` });
    } catch {}
  };

  const handleIndicate = () => {
    setIndicated(true);
    setUnavailableVisible(false);
    Alert.alert(
      "Conteúdo indicado! 🎬",
      "Obrigado pela indicação! Estamos trabalhando para disponibilizá-lo o mais rápido possível.",
      [{ text: "OK" }]
    );
  };

  const goToPlayer = async (season = 1, episode = 1) => {
    setChecking(true);
    try {
      const result = await tmdbApi.tmdb.checkAvailable(type, tmdbId, season, episode);
      if (!result.available) {
        setUnavailableVisible(true);
        return;
      }
    } catch {}
    finally {
      setChecking(false);
    }
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

  const getEpisodeStatus = (ep: TmdbEpisode): { watched: boolean; current: boolean } => {
    if (!watchProgress || watchProgress.season === undefined || watchProgress.episode === undefined) {
      return { watched: false, current: false };
    }
    const savedSeason = watchProgress.season;
    const savedEp = watchProgress.episode;

    if (selectedSeason < savedSeason) return { watched: true, current: false };
    if (selectedSeason > savedSeason) return { watched: false, current: false };
    if (ep.episode_number < savedEp) return { watched: true, current: false };
    if (ep.episode_number === savedEp) return { watched: false, current: true };
    return { watched: false, current: false };
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
  const title = details?.title ?? details?.name ?? params.title ?? "Carregando...";
  const year = (details?.release_date ?? details?.first_air_date ?? "").slice(0, 4);
  const rating = details?.vote_average ? Math.round(details.vote_average * 10) / 10 : null;
  const likePercent = rating ? Math.round((rating / 10) * 100) : null;
  const genreStr = details?.genres?.map((g) => g.name).join(" • ") ?? "";
  const runtime = (details as any)?.runtime;
  const numSeasons = (details as any)?.number_of_seasons;
  const overview = details?.overview ?? "";
  const topPad = Platform.OS === "web" ? 0 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* Not available modal */}
      <Modal
        visible={unavailableVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUnavailableVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="clock" size={40} color={colors.primary} style={{ marginBottom: 16 }} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Conteúdo Indisponível
            </Text>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              Este conteúdo ainda não está disponível no catálogo. Mas não se preocupe, estamos sempre expandindo nossa biblioteca!
            </Text>
            <TouchableOpacity
              style={[styles.indicateBtn, { backgroundColor: colors.primary }]}
              onPress={handleIndicate}
              disabled={indicated}
            >
              <Feather name="heart" size={16} color="#fff" />
              <Text style={styles.indicateBtnText}>
                {indicated ? "Indicado!" : "Indicar este conteúdo"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.closeModalBtn, { borderColor: colors.border }]}
              onPress={() => setUnavailableVisible(false)}
            >
              <Text style={[styles.closeModalText, { color: colors.mutedForeground }]}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
              {/* Provider logos */}
              {providers.length > 0 && (
                <View style={styles.providersRow}>
                  {providers.slice(0, 6).map((p) => (
                    <View key={p.provider_id} style={styles.providerItem}>
                      <Image
                        source={{ uri: `https://image.tmdb.org/t/p/w92${p.logo_path}` }}
                        style={styles.providerLogo}
                        resizeMode="cover"
                      />
                    </View>
                  ))}
                </View>
              )}

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
                style={({ pressed }) => [styles.watchBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
                onPress={() => goToPlayer(1, 1)}
                disabled={checking}
              >
                {checking ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="play" size={18} color="#fff" />
                )}
                <Text style={styles.watchBtnText}>
                  {checking ? "Verificando..." : "ASSISTIR AGORA"}
                </Text>
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
                              backgroundColor: selectedSeason === s.season_number ? colors.primary : colors.card,
                              borderColor: selectedSeason === s.season_number ? colors.primary : colors.border,
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
                    episodeList.map((ep) => {
                      const { watched, current } = getEpisodeStatus(ep);
                      return (
                        <EpisodeRow
                          key={ep.episode_number}
                          ep={ep}
                          watched={watched}
                          current={current}
                          colors={colors}
                          onPress={() => goToPlayer(selectedSeason, ep.episode_number)}
                        />
                      );
                    })
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
  providersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  providerItem: {
    borderRadius: 8,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  providerLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  title: { fontSize: 26, fontWeight: "900", letterSpacing: -0.5, marginBottom: 8, lineHeight: 32 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 8 },
  meta: { fontSize: 13 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 },
  ratingNum: { fontSize: 14, fontWeight: "600" },
  watchBtn: {
    borderRadius: 12,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 16,
  },
  watchBtnText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.5 },
  actionRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 28 },
  actionBtn: { alignItems: "center", gap: 6, minWidth: 60 },
  actionLabel: { fontSize: 10, fontWeight: "500", textAlign: "center" },
  tabsScroll: { marginBottom: 0 },
  tab: { paddingHorizontal: 14, paddingVertical: 12, marginRight: 4 },
  tabText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  tabDivider: { height: 1, marginBottom: 20 },
  tabContent: { paddingBottom: 8 },
  description: { fontSize: 15, lineHeight: 23, color: "#ccc" },
  seasonBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  seasonBtnText: { fontSize: 13, fontWeight: "600" },
  episodeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    overflow: "hidden",
    paddingRight: 10,
  },
  episodeThumb: { width: 110, height: 72, flexShrink: 0 },
  episodeInfo: { flex: 1, paddingVertical: 8, paddingLeft: 10, paddingRight: 4 },
  epTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  episodeNum: { fontSize: 11 },
  epDate: { fontSize: 10 },
  episodeName: { fontSize: 13, fontWeight: "600", lineHeight: 18, marginBottom: 4 },
  epMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  epMetaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  episodeMeta: { fontSize: 10, fontWeight: "500" },
  epSynopsis: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  epSynopsisToggle: { fontSize: 11, fontWeight: "600", marginTop: 1 },
  epPlayBtn: { paddingLeft: 4, paddingTop: 12, alignSelf: "flex-start" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  detailLabel: { fontSize: 13, flex: 1 },
  detailValue: { fontSize: 13, fontWeight: "500", flex: 2, textAlign: "right" },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalBox: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
  },
  modalTitle: { fontSize: 20, fontWeight: "800", marginBottom: 12, textAlign: "center" },
  modalDesc: { fontSize: 14, lineHeight: 20, textAlign: "center", marginBottom: 24 },
  indicateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
    justifyContent: "center",
    marginBottom: 12,
  },
  indicateBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  closeModalBtn: {
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  closeModalText: { fontSize: 14, fontWeight: "500" },
});
