import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import { getApiBase } from "@/lib/api";

const RED = "#e50914";
const { width: W } = Dimensions.get("window");
const POSTER_W = (W - 48) / 3;
const POSTER_H = POSTER_W * 1.5;
const TMDB_IMG = (path: string | null, size = "w500") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

interface SeasonInfo { number: number; prefix: string; label: string }
interface TmdbMatch {
  id: number; title: string; poster_path: string | null;
  backdrop_path: string | null; overview: string; vote_average: number;
  release_date?: string; first_air_date?: string; media_type: "movie" | "tv";
}
interface CatalogEntry {
  key: string; name: string; type: "movie" | "tv" | "unknown";
  seasons: SeasonInfo[]; tmdb: TmdbMatch | null;
}
interface Episode {
  key: string; name: string; size: number;
  lastModified: string | null; episode: number | null;
}

async function apiFetch<T>(path: string): Promise<T> {
  const base = getApiBase();
  if (!base) throw new Error("API não configurada");
  const res = await fetch(`${base}/r2${path}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

function EpisodeList({
  entry, season, onBack,
}: { entry: CatalogEntry; season: SeasonInfo; onBack: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ episodes: Episode[] }>(`/episodes?prefix=${encodeURIComponent(season.prefix)}`)
      .then((d) => setEpisodes(d.episodes))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [season.prefix]);

  const openEpisode = async (ep: Episode) => {
    setOpening(ep.key);
    try {
      router.push({
        pathname: "/r2-player",
        params: {
          key: ep.key,
          title: entry.tmdb?.title ?? entry.name,
          episodeName: ep.name.replace(/\.[^.]+$/, ""),
          season: String(season.number),
          episode: String(ep.episode ?? ""),
          backdropPath: entry.tmdb?.backdrop_path ?? "",
          posterPath: entry.tmdb?.poster_path ?? "",
          tmdbId: String(entry.tmdb?.id ?? ""),
          type: "tv",
        },
      });
    } finally {
      setOpening(null);
    }
  };

  return (
    <View style={[styles.subScreen]}>
      <View style={[styles.subHeader, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={onBack} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.subTitle} numberOfLines={1}>{entry.tmdb?.title ?? entry.name}</Text>
          <Text style={styles.subSeason}>{season.label}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={RED} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={40} color="rgba(255,255,255,0.3)" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={episodes}
          keyExtractor={(ep) => ep.key}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 100 }}
          ListEmptyComponent={
            <View style={[styles.center, { paddingTop: 60 }]}>
              <Text style={styles.errorText}>Nenhum episódio encontrado</Text>
            </View>
          }
          renderItem={({ item: ep }) => (
            <Pressable
              style={({ pressed }) => [styles.epRow, pressed && { opacity: 0.7 }]}
              onPress={() => openEpisode(ep)}
            >
              <View style={styles.epNumBadge}>
                {opening === ep.key ? (
                  <ActivityIndicator color={RED} size="small" />
                ) : (
                  <Text style={styles.epNum}>{ep.episode ?? "?"}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.epName} numberOfLines={2}>
                  {ep.name.replace(/\.[^.]+$/, "")}
                </Text>
                {ep.size > 0 && <Text style={styles.epMeta}>{formatBytes(ep.size)}</Text>}
              </View>
              <Feather name="play-circle" size={22} color={RED} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function SeasonList({
  entry, onBack, onSelectSeason,
}: { entry: CatalogEntry; onBack: () => void; onSelectSeason: (s: SeasonInfo) => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.subScreen}>
      {entry.tmdb?.backdrop_path && (
        <>
          <Image
            source={{ uri: TMDB_IMG(entry.tmdb.backdrop_path, "w1280") ?? "" }}
            style={styles.detailBackdrop}
            contentFit="cover"
          />
          <View style={styles.backdropGrad} />
        </>
      )}

      <View style={[styles.subHeader, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={onBack} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        <View style={styles.detailMeta}>
          {entry.tmdb?.poster_path && (
            <Image
              source={{ uri: TMDB_IMG(entry.tmdb.poster_path, "w500") ?? "" }}
              style={styles.detailPoster}
              contentFit="cover"
            />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.detailTitle}>{entry.tmdb?.title ?? entry.name}</Text>
            {entry.tmdb?.vote_average ? (
              <Text style={styles.detailRating}>⭐ {entry.tmdb.vote_average.toFixed(1)}</Text>
            ) : null}
            {entry.tmdb?.overview ? (
              <Text style={styles.detailOverview} numberOfLines={4}>{entry.tmdb.overview}</Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.seasonHeader}>Temporadas</Text>
        {entry.seasons.map((s) => (
          <Pressable
            key={s.prefix}
            style={({ pressed }) => [styles.seasonRow, pressed && { opacity: 0.7 }]}
            onPress={() => onSelectSeason(s)}
          >
            <View style={styles.seasonIcon}>
              <Feather name="tv" size={20} color={RED} />
            </View>
            <Text style={styles.seasonLabel}>{s.label}</Text>
            <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.4)" />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function CatalogGrid({ onSelect }: { onSelect: (entry: CatalogEntry) => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setError(null);
    if (!refresh) setLoading(true);
    try {
      const path = refresh ? "/catalog?refresh=true" : "/catalog";
      const data = await apiFetch<{ catalog: CatalogEntry[] }>(path);
      setEntries(data.catalog);
    } catch (e: any) {
      setError(e.message ?? "Erro ao carregar catálogo");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const openMovie = async (entry: CatalogEntry) => {
    setOpening(entry.key);
    try {
      const data = await apiFetch<{ files: { key: string; isVideo: boolean }[] }>(
        `/list?prefix=${encodeURIComponent(entry.key)}&delimiter=/`
      );
      const vid = data.files.find((f) => f.isVideo);
      if (!vid) {
        setError("Nenhum arquivo de vídeo encontrado nesta pasta");
        return;
      }
      router.push({
        pathname: "/r2-player",
        params: {
          key: vid.key,
          title: entry.tmdb?.title ?? entry.name,
          backdropPath: entry.tmdb?.backdrop_path ?? "",
          posterPath: entry.tmdb?.poster_path ?? "",
          tmdbId: String(entry.tmdb?.id ?? ""),
          type: "movie",
        },
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOpening(null);
    }
  };

  const filtered = search
    ? entries.filter((e) =>
        (e.tmdb?.title ?? e.name).toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator color={RED} size="large" />
      <Text style={[styles.errorText, { marginTop: 12, color: "rgba(255,255,255,0.4)" }]}>
        Carregando catálogo e buscando no TMDB…
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchRow}>
        <Feather name="search" size={15} color="rgba(255,255,255,0.4)" />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar título..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Feather name="x" size={15} color="rgba(255,255,255,0.4)" />
          </Pressable>
        )}
      </View>

      {error ? (
        <View style={styles.center}>
          <Feather name="cloud-off" size={40} color="rgba(255,255,255,0.3)" />
          <Text style={[styles.errorText, { marginTop: 12 }]}>{error}</Text>
          <Pressable style={[styles.actionBtn, { marginTop: 20 }]} onPress={() => load()}>
            <Text style={styles.actionBtnText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => e.key}
          numColumns={3}
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 100 }}
          columnWrapperStyle={{ gap: 6, marginBottom: 6 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={RED}
            />
          }
          ListEmptyComponent={
            <View style={[styles.center, { paddingTop: 60 }]}>
              <Text style={styles.errorText}>Nenhum título no catálogo R2</Text>
            </View>
          }
          renderItem={({ item: entry }) => {
            const poster = entry.tmdb?.poster_path ? TMDB_IMG(entry.tmdb.poster_path) : null;
            const displayTitle = entry.tmdb?.title ?? entry.name;
            const isBusy = opening === entry.key;
            return (
              <Pressable
                style={({ pressed }) => [styles.posterCard, pressed && { opacity: 0.8 }]}
                onPress={() => entry.type === "movie" ? openMovie(entry) : onSelect(entry)}
              >
                <View style={styles.posterWrap}>
                  {poster ? (
                    <Image source={{ uri: poster }} style={styles.posterImg} contentFit="cover" />
                  ) : (
                    <View style={styles.posterPlaceholder}>
                      <Feather name="film" size={28} color="rgba(255,255,255,0.2)" />
                    </View>
                  )}
                  <View style={[styles.typeBadge, { backgroundColor: entry.type === "tv" ? "#1a6bb5" : RED }]}>
                    <Text style={styles.typeBadgeText}>{entry.type === "tv" ? "SÉRIE" : "FILME"}</Text>
                  </View>
                  {isBusy && (
                    <View style={styles.posterLoading}>
                      <ActivityIndicator color="#fff" size="small" />
                    </View>
                  )}
                </View>
                <Text style={styles.posterTitle} numberOfLines={2}>{displayTitle}</Text>
                {entry.tmdb?.vote_average ? (
                  <Text style={styles.posterRating}>⭐ {entry.tmdb.vote_average.toFixed(1)}</Text>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

type CatalogView =
  | { screen: "catalog" }
  | { screen: "seasons"; entry: CatalogEntry }
  | { screen: "episodes"; entry: CatalogEntry; season: SeasonInfo };

export default function R2CatalogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [view, setView] = useState<CatalogView>({ screen: "catalog" });

  if (!user || user.role !== "admin") {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: "#000" }]}>
        <Feather name="lock" size={48} color="rgba(255,255,255,0.2)" />
        <Text style={[styles.errorText, { marginTop: 16 }]}>Acesso restrito a administradores</Text>
      </View>
    );
  }

  return (
    <View style={[{ flex: 1, backgroundColor: "#000" }]}>
      {view.screen === "catalog" && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.headerTitle}>Catálogo R2</Text>
            <Text style={styles.headerSub}>Cloudflare R2 · Acervo exclusivo</Text>
          </View>
          <View style={[styles.r2Badge]}>
            <Feather name="cloud" size={14} color={RED} />
            <Text style={styles.r2BadgeText}>R2</Text>
          </View>
        </View>
      )}

      {view.screen === "catalog" && (
        <CatalogGrid onSelect={(entry) => setView({ screen: "seasons", entry })} />
      )}

      {view.screen === "seasons" && (
        <SeasonList
          entry={(view as any).entry}
          onBack={() => setView({ screen: "catalog" })}
          onSelectSeason={(season) =>
            setView({ screen: "episodes", entry: (view as any).entry, season })
          }
        />
      )}

      {view.screen === "episodes" && (
        <EpisodeList
          entry={(view as any).entry}
          season={(view as any).season}
          onBack={() => setView({ screen: "seasons", entry: (view as any).entry })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { color: "rgba(255,255,255,0.45)", fontSize: 14, textAlign: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 2 },
  r2Badge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${RED}18`, borderWidth: 1, borderColor: `${RED}40`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  r2BadgeText: { color: RED, fontSize: 12, fontWeight: "800" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginVertical: 10, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, color: "#fff", fontSize: 14 },
  posterCard: { width: POSTER_W },
  posterWrap: { width: POSTER_W, height: POSTER_H, borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)", marginBottom: 5 },
  posterImg: { width: "100%", height: "100%" },
  posterPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  posterLoading: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  typeBadge: { position: "absolute", top: 6, left: 6, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  typeBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  posterTitle: { color: "#fff", fontSize: 11, fontWeight: "600", lineHeight: 15 },
  posterRating: { color: "rgba(255,255,255,0.45)", fontSize: 10, marginTop: 2 },
  actionBtn: { backgroundColor: RED, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  subScreen: { flex: 1, backgroundColor: "#000" },
  subHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12 },
  subTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  subSeason: { color: "rgba(255,255,255,0.45)", fontSize: 13 },

  detailBackdrop: { position: "absolute", top: 0, left: 0, right: 0, height: 220 },
  backdropGrad: { position: "absolute", top: 0, left: 0, right: 0, height: 300, backgroundColor: "rgba(0,0,0,0.55)" },
  detailMeta: { flexDirection: "row", gap: 14, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20, marginTop: 60 },
  detailPoster: { width: 90, height: 135, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.1)" },
  detailTitle: { color: "#fff", fontSize: 18, fontWeight: "800", marginBottom: 4 },
  detailRating: { color: "#f5a623", fontSize: 13, marginBottom: 8 },
  detailOverview: { color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 19 },
  seasonHeader: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "700", letterSpacing: 1, paddingHorizontal: 16, marginBottom: 8 },
  seasonRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  seasonIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(229,9,20,0.15)", alignItems: "center", justifyContent: "center" },
  seasonLabel: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "600" },

  epRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  epNumBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  epNum: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "700" },
  epName: { color: "#fff", fontSize: 13, fontWeight: "500" },
  epMeta: { color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 },
});
