import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
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

import { downloadsManager } from "@/lib/downloads";
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
import { searchDriveByTitle, getDriveSeasonEpisodes, DriveMatch } from "@/lib/gdrive-search";
import { DriveItem, parseEpisodeInfo } from "@/lib/gdrive-index";

interface RegistryItem {
  id: string; r2Key: string; tmdbId: number; tmdbType: "movie" | "tv";
  title: string; label: string; season: number | null; episode: number | null;
}

let WebView: any = null;
try { WebView = require("react-native-webview").WebView; } catch {}

const { width: W } = Dimensions.get("window");
const BACKDROP_H = Math.round(W * 0.58);
type Tab = "about" | "episodes" | "related" | "collection" | "details";

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
  fallbackImage,
  onPress,
  onGstreamPress,
  onR2Press,
}: {
  ep: TmdbEpisode;
  watched: boolean;
  current: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  fallbackImage?: string | null;
  onPress?: () => void;
  onGstreamPress?: () => void;
  onR2Press?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const thumbUri = !imgFailed && ep.still_path
    ? (TMDB_IMG(ep.still_path, "w500") ?? null)
    : null;

  // Use series backdrop as styled fallback when no episode still is available
  const showFallback = !thumbUri && fallbackImage;

  return (
    <View style={[styles.episodeRow, { backgroundColor: colors.card, borderColor: current ? colors.primary : colors.border }]}>
      {/* Thumbnail */}
      {thumbUri ? (
        <Image
          source={{ uri: thumbUri }}
          style={styles.episodeThumb}
          resizeMode="cover"
          onError={() => setImgFailed(true)}
        />
      ) : showFallback ? (
        <View style={[styles.episodeThumb, { overflow: "hidden" }]}>
          <Image
            source={{ uri: TMDB_IMG(fallbackImage!, "w500") ?? fallbackImage! }}
            style={[styles.episodeThumb, { position: "absolute", opacity: 0.45 }]}
            resizeMode="cover"
          />
          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
            <Feather name="play" size={16} color="rgba(255,255,255,0.8)" />
          </View>
        </View>
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

      {/* Play buttons column */}
      <View style={styles.epPlayCol}>
        {onPress && (
          <Pressable onPress={onPress} style={styles.epPlayBtn}>
            <Feather name="play-circle" size={28} color={current ? colors.primary : colors.foreground} />
          </Pressable>
        )}
        {onGstreamPress && (
          <Pressable onPress={onGstreamPress} style={[styles.epPlayBtn, { backgroundColor: "#7c3aed", borderRadius: 8, padding: 4, marginTop: 4 }]}>
            <Feather name="zap" size={16} color="#fff" />
          </Pressable>
        )}
        {onR2Press && (
          <Pressable onPress={onR2Press} style={[styles.epPlayBtn, { backgroundColor: "#e50914", borderRadius: 8, padding: 4, marginTop: onPress ? 4 : 0 }]}>
            <Feather name="play" size={16} color="#fff" />
          </Pressable>
        )}
      </View>
    </View>
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
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [collectionData, setCollectionData] = useState<{ id: number; name: string; parts: any[] } | null>(null);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const [trailerPlaying, setTrailerPlaying] = useState(true);
  const [trailerControlsVisible, setTrailerControlsVisible] = useState(true);
  const trailerWebViewRef = useRef<any>(null);
  const trailerHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userId = user?.id ?? "";
  const [inList, setInList] = useState(false);
  const [liked, setLiked] = useState<boolean | undefined>(undefined);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [driveMatches, setDriveMatches] = useState<DriveMatch[]>([]);
  const [driveEpisodeMap, setDriveEpisodeMap] = useState<Record<number, DriveItem>>({});
  const [driveSeasonItems, setDriveSeasonItems] = useState<DriveItem[]>([]);

  const [gstreamAvailable, setGstreamAvailable] = useState(false);
  const [gstreamLang, setGstreamLang] = useState<"dub" | "leg">("dub");
  const [gstreamMovieUrl, setGstreamMovieUrl] = useState<string | null>(null);
  const [gstreamResolving, setGstreamResolving] = useState(false);

  const [r2Items, setR2Items] = useState<RegistryItem[]>([]);
  // Episode numbers (parsed from R2 filenames) for the current season's folder item
  const [r2EpisodeNums, setR2EpisodeNums] = useState<Set<number>>(new Set());

  // Load R2 registry items for this title (non-blocking)
  useEffect(() => {
    if (!tmdbId) return;
    const loadR2 = async () => {
      try {
        const { apiGetRegistry } = await import("@/lib/r2-direct");
        const data = await apiGetRegistry();
        const items: RegistryItem[] = (data.items ?? []).filter(
          (i: RegistryItem) => i.tmdbId === tmdbId && i.tmdbType === type
        );
        setR2Items(items);
      } catch {}
    };
    loadR2();
  }, [tmdbId, type]);

  // When a season-level R2 item exists (episode=null), scan its folder to find
  // which specific episode files are uploaded — used to filter the episode list
  // and assign R2 play buttons only to episodes that actually exist in R2.
  useEffect(() => {
    if (type !== "tv") return;
    const seasonItem = r2Items.find(
      (i) => Number(i.season) === selectedSeason && i.episode == null
    );
    if (!seasonItem) { setR2EpisodeNums(new Set()); return; }

    const EP_REGEX = /[Ee](\d{1,4})/;
    const VIDEO_EXT = /\.(mp4|mkv|mov|avi|webm|m4v|ts|wmv|flv|ogv)$/i;

    const scanFolder = async () => {
      try {
        const { apiList } = await import("@/lib/r2-direct");
        const data = await apiList(seasonItem.r2Key, undefined, false, undefined);
        const files: { name: string }[] = data.files ?? [];
        const nums = new Set<number>();
        for (const f of files) {
          if (!VIDEO_EXT.test(f.name)) continue;
          const m = f.name.match(EP_REGEX);
          if (m) nums.add(parseInt(m[1], 10));
        }
        setR2EpisodeNums(nums);
      } catch {}
    };
    scanFolder();
  }, [r2Items, selectedSeason, type]);

  // Check GStream availability in background (non-blocking)
  useEffect(() => {
    if (!tmdbId) return;
    setGstreamAvailable(false);
    setGstreamMovieUrl(null);
    const check = async () => {
      try {
        if (type === "movie") {
          const r = await tmdbApi.gstream.checkMovie(tmdbId);
          if (r.movie) {
            setGstreamAvailable(true);
            setGstreamMovieUrl(r.url ?? null);
          }
        } else {
          const r = await tmdbApi.gstream.checkTv(tmdbId, 1, 1);
          if (r.available) {
            setGstreamAvailable(true);
            setGstreamLang(r.dub ? "dub" : "leg");
          }
        }
      } catch {}
    };
    check();
  }, [tmdbId, type]);

  // Search Drive for matching content by title
  useEffect(() => {
    const titleStr = params.title ? String(params.title) : "";
    if (!titleStr) return;
    searchDriveByTitle(titleStr).then(setDriveMatches).catch(() => {});
  }, [params.title]);

  // Load drive episodes for the selected season whenever the series match or season changes
  useEffect(() => {
    if (type !== "tv") return;
    const match = driveMatches.find((m) => m.isFolder);
    if (!match) {
      setDriveEpisodeMap({});
      setDriveSeasonItems([]);
      return;
    }
    getDriveSeasonEpisodes(match.drive, match.path, selectedSeason)
      .then((items) => {
        setDriveSeasonItems(items);
        const map: Record<number, DriveItem> = {};
        for (const item of items) {
          const info = parseEpisodeInfo(item.name);
          if (info.episode !== undefined) {
            map[info.episode] = item;
          }
        }
        setDriveEpisodeMap(map);
      })
      .catch(() => {
        setDriveEpisodeMap({});
        setDriveSeasonItems([]);
      });
  }, [type, driveMatches, selectedSeason]);

  useEffect(() => {
    if (!userId || !tmdbId || !isSupabaseConfigured) return;
    db.watchlist.isAdded(userId, tmdbId, type).then(setInList);
    db.ratings.get(userId, tmdbId, type).then((r) => setLiked(r?.liked));
    if (type === "tv") {
      db.progress.getForShow(userId, tmdbId, "tv").then(setWatchProgress);
    }
  }, [userId, tmdbId, type]);

  useEffect(() => {
    if (!tmdbId) return;
    downloadsManager.isDownloaded(type, tmdbId).then(setIsDownloaded);
  }, [tmdbId, type]);

  // Load details
  useEffect(() => {
    if (!tmdbId) return;
    setLoading(true);
    setLogoUrl(null);
    const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
    const fetchAll = async () => {
      try {
        const imagesPromise = fetch(
          `https://api.themoviedb.org/3/${type}/${tmdbId}/images?api_key=${TMDB_KEY}&include_image_language=pt,en,null`
        )
          .then((r) => r.json())
          .then((data) => {
            const logos: any[] = data.logos ?? [];
            const en = logos.find((l) => l.iso_639_1 === "en");
            const pt = logos.find((l) => l.iso_639_1 === "pt");
            const best = en ?? pt ?? logos[0] ?? null;
            if (best?.file_path) setLogoUrl(`https://image.tmdb.org/t/p/w500${best.file_path}`);
          })
          .catch(() => {});

        const videosPromise = fetch(
          `https://api.themoviedb.org/3/${type}/${tmdbId}/videos?api_key=${TMDB_KEY}&language=pt-BR`
        )
          .then((r) => r.json())
          .then((vd) => {
            const results: any[] = vd.results ?? [];
            const trailer =
              results.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ??
              results.find((v) => v.site === "YouTube" && v.type === "Trailer") ??
              results.find((v) => v.site === "YouTube" && v.type === "Teaser") ??
              results.find((v) => v.site === "YouTube");
            if (trailer?.key) setTrailerKey(trailer.key);
          })
          .catch(() => {});

        if (type === "movie") {
          const [det, sim, prov] = await Promise.all([
            tmdbApi.tmdb.movie(tmdbId),
            tmdbApi.tmdb.movieSimilar(tmdbId),
            tmdbApi.tmdb.providers("movie", tmdbId),
            videosPromise,
          ]);
          setDetails(det);
          setSimilar(sim.map(tmdbItemToContent));
          setProviders(prov?.flatrate ?? []);
          const colId = (det as any)?.belongs_to_collection?.id;
          if (colId) {
            setLoadingCollection(true);
            fetch(`https://api.themoviedb.org/3/collection/${colId}?api_key=8f0beb08cf016ec8de49e454e09879ec&language=pt-BR`)
              .then((r) => r.json())
              .then((d) => {
                const parts = (d.parts ?? []).sort((a: any, b: any) => {
                  const da = a.release_date ?? "";
                  const db = b.release_date ?? "";
                  return da < db ? -1 : da > db ? 1 : 0;
                });
                setCollectionData({ id: colId, name: d.name ?? "", parts });
              })
              .catch(() => {})
              .finally(() => setLoadingCollection(false));
          }
        } else {
          const [det, sim, prov] = await Promise.all([
            tmdbApi.tmdb.tv(tmdbId),
            tmdbApi.tmdb.tvSimilar(tmdbId),
            tmdbApi.tmdb.providers("tv", tmdbId),
            videosPromise,
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
        await imagesPromise;
      } catch (e) {
        console.warn("Detail fetch error:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [tmdbId, type]);

  // Translate a single text (en→pt-BR) via Google Translate unofficial endpoint
  const gtranslate = async (text: string): Promise<string> => {
    if (!text) return text;
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt-BR&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      if (!res.ok) return text;
      const json = await res.json();
      // Response format: [[[translated, original, ...], ...], ...]
      const parts: string[] = (json[0] as any[]).map((chunk: any[]) => chunk[0] ?? "");
      return parts.join("").trim() || text;
    } catch {
      return text;
    }
  };

  // Load episodes when season changes
  // 1. Fetch pt-BR from TMDB (via server)
  // 2. Fetch en-US for still_path fallback + real titles/overviews when pt-BR is generic
  // 3. Translate English text → Portuguese when pt-BR data is missing
  // 4. Deduplicate by episode_number; remove ep.0 (specials) and future episodes
  useEffect(() => {
    if (type !== "tv" || !tmdbId) return;
    setLoadingEpisodes(true);
    const TMDB_KEY_LOCAL = "8f0beb08cf016ec8de49e454e09879ec";

    const loadEps = async () => {
      try {
        // Always fetch both locales in parallel — en-US needed for still_path + real names
        const [ptData, enRes] = await Promise.all([
          tmdbApi.tmdb.tvSeason(tmdbId, selectedSeason),
          fetch(
            `https://api.themoviedb.org/3/tv/${tmdbId}/season/${selectedSeason}?api_key=${TMDB_KEY_LOCAL}&language=en-US`
          ).catch(() => null),
        ]);

        let episodes: TmdbEpisode[] = ptData.episodes ?? [];

        // ── 1. Deduplicate by episode_number ──────────────────────────────────
        const seen = new Set<number>();
        episodes = episodes.filter((ep) => {
          if (seen.has(ep.episode_number)) return false;
          seen.add(ep.episode_number);
          return true;
        });

        // ── 2. Remove special ep 0 and future unaired episodes ────────────────
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        episodes = episodes.filter((ep) => {
          if (ep.episode_number === 0) return false;
          if (ep.air_date) {
            const d = new Date(ep.air_date);
            if (!isNaN(d.getTime()) && d > today) return false;
          }
          return true;
        });

        // ── 3. Merge en-US: still_path fallback + English name/overview ───────
        let enEps: any[] = [];
        if (enRes?.ok) {
          try { enEps = (await enRes.json()).episodes ?? []; } catch {}
        }

        const GENERIC = /^Episódio\s*\d+$/i;
        const isGenericName = (n?: string) => !n || GENERIC.test(n);

        let merged = episodes.map((ep) => {
          const enEp = enEps.find((e: any) => e.episode_number === ep.episode_number);
          return {
            ...ep,
            // still_path: prefer pt-BR; fallback to en-US (pt-BR often has null)
            still_path: ep.still_path ?? enEp?.still_path ?? null,
            // name: keep pt if real; otherwise take en (will translate below)
            _enName: isGenericName(ep.name) && enEp?.name ? enEp.name : null,
            _enOverview: !ep.overview && enEp?.overview ? enEp.overview : null,
            name: isGenericName(ep.name) && enEp?.name ? enEp.name : ep.name,
            overview: !ep.overview && enEp?.overview ? enEp.overview : ep.overview,
          };
        });

        // ── 4. Translate English fallbacks → pt-BR ────────────────────────────
        const needsTranslation = merged.some((ep) => ep._enName || ep._enOverview);
        if (needsTranslation) {
          const translateQueue = merged.map(async (ep) => {
            const [translatedName, translatedOverview] = await Promise.all([
              ep._enName ? gtranslate(ep._enName) : Promise.resolve(null),
              ep._enOverview ? gtranslate(ep._enOverview) : Promise.resolve(null),
            ]);
            return {
              ...ep,
              name: translatedName ?? ep.name,
              overview: translatedOverview ?? ep.overview,
              _enName: undefined,
              _enOverview: undefined,
            };
          });
          const translated = await Promise.all(translateQueue);
          setEpisodeList(translated as TmdbEpisode[]);
        } else {
          setEpisodeList(merged.map(({ _enName, _enOverview, ...ep }) => ep) as TmdbEpisode[]);
        }
      } catch {
        setEpisodeList([]);
      } finally {
        setLoadingEpisodes(false);
      }
    };

    loadEps();
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
    const contentTitle = details.title ?? details.name ?? title;
    const deepLink = `netplay://detail?type=${type}&id=${tmdbId}&title=${encodeURIComponent(contentTitle)}`;
    const yearVal = (details.release_date ?? details.first_air_date ?? "").slice(0, 4);
    const yearStr = yearVal ? ` (${yearVal})` : "";
    const msg = `🎬 ${contentTitle}${yearStr}\n\nAssista no NETPLAY!\n${deepLink}`;
    try {
      await Share.share({ message: msg, url: deepLink, title: contentTitle });
    } catch {}
  };

  const handleDownload = async () => {
    if (isDownloaded) {
      Alert.alert(
        "Remover download",
        `Remover "${details?.title ?? details?.name}" dos downloads?`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Remover",
            style: "destructive",
            onPress: async () => {
              await downloadsManager.remove(`${type}_${tmdbId}`);
              setIsDownloaded(false);
            },
          },
        ]
      );
      return;
    }
    setDownloading(true);
    try {
      await downloadsManager.download({
        tmdb_id: tmdbId,
        type,
        title: details?.title ?? details?.name ?? "",
        poster_path: TMDB_IMG(details?.poster_path ?? null, "w500") ?? "",
        backdrop_path: TMDB_IMG(details?.backdrop_path ?? null, "w1280") ?? "",
      });
      setIsDownloaded(true);
      Alert.alert(
        "Download concluído!",
        `"${details?.title ?? details?.name}" está disponível offline por 20 dias.`,
        [{ text: "OK" }]
      );
    } catch {
      Alert.alert("Erro", "Não foi possível realizar o download. Tente novamente.");
    } finally {
      setDownloading(false);
    }
  };

  const handleIndicate = async () => {
    setIndicated(true);
    setUnavailableVisible(false);
    if (userId && details) {
      await db.contentRequests.add({
        user_id: userId,
        tmdb_id: tmdbId,
        type,
        title: details.title ?? details.name ?? params.title ?? "",
        poster_path: details.poster_path ?? undefined,
      });
    }
    Alert.alert(
      "Conteúdo indicado! 🎬",
      "Obrigado pela indicação! Assim que for adicionado ao catálogo você receberá uma notificação.",
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

  const goToGstreamPlayer = async (season = 1, episode = 1) => {
    setGstreamResolving(true);
    const baseParams = {
      type,
      id: String(tmdbId),
      season: String(season),
      episode: String(episode),
      title: details?.title ?? details?.name ?? "",
      posterPath: details?.poster_path ?? "",
      backdropPath: details?.backdrop_path ?? "",
      gstreamMode: "true",
      gstreamLang,
      totalSeasons: String((details as any)?.number_of_seasons ?? 1),
    };
    try {
      const resolved = await tmdbApi.gstream.resolveStream(type, tmdbId, season, episode, gstreamLang);
      router.push({
        pathname: "/player",
        params: resolved.m3u8
          ? { ...baseParams, directM3u8: resolved.m3u8, directReferer: resolved.embedUrl }
          : resolved.iframeUrl
          ? { ...baseParams, directEmbed: resolved.iframeUrl, directReferer: resolved.embedUrl }
          : { ...baseParams, ...(type === "movie" && gstreamMovieUrl ? { gstreamMovieUrl } : {}) },
      });
    } catch {
      router.push({
        pathname: "/player",
        params: { ...baseParams, ...(type === "movie" && gstreamMovieUrl ? { gstreamMovieUrl } : {}) },
      });
    } finally {
      setGstreamResolving(false);
    }
  };

  const goToR2Player = (item: RegistryItem, overrideSeason?: number, overrideEpisode?: number) => {
    const seasonVal = overrideSeason != null ? overrideSeason : item.season;
    const episodeVal = overrideEpisode != null ? overrideEpisode : item.episode;
    router.push({
      pathname: "/r2-player",
      params: {
        key: item.r2Key,
        title: details?.title ?? details?.name ?? item.title,
        label: item.label,
        backdropPath: details?.backdrop_path ?? "",
        posterPath: details?.poster_path ?? "",
        tmdbId: String(tmdbId),
        type,
        season: seasonVal != null ? String(seasonVal) : "",
        episode: episodeVal != null ? String(episodeVal) : "",
        r2ItemsJson: JSON.stringify(r2Items),
        watchSeason: watchProgress?.season != null ? String(watchProgress.season) : "",
        watchEpisode: watchProgress?.episode != null ? String(watchProgress.episode) : "",
        watchProgressRatio: watchProgress?.progress != null ? String(watchProgress.progress) : "",
      },
    });
  };

  const goToDriveEpisode = (ep: TmdbEpisode) => {
    const driveItem = driveEpisodeMap[ep.episode_number];
    if (!driveItem) return;
    const match = driveMatches.find((m) => m.isFolder)!;

    // Build playlist sorted by episode number
    const sorted = [...driveSeasonItems].sort((a, b) => {
      const ia = parseEpisodeInfo(a.name).episode ?? 999;
      const ib = parseEpisodeInfo(b.name).episode ?? 999;
      return ia - ib;
    });
    const playlist = sorted.map((item) => ({ name: item.name, link: item.link ?? "" }));
    const currentIndex = sorted.findIndex((item) => item.id === driveItem.id);

    router.push({
      pathname: "/gdrive-player",
      params: {
        fileName: driveItem.name,
        fileLink: driveItem.link ?? "",
        drive: String(match.drive),
        folderPath: match.path,
        playlist: JSON.stringify(playlist),
        currentIndex: String(Math.max(0, currentIndex)),
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
    ...(collectionData ? [{ key: "collection" as Tab, label: "COLEÇÃO" }] : []),
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
  const castList: any[] = ((details as any)?.credits?.cast ?? []).slice(0, 15);
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

      {/* ── TRAILER MODAL ─────────────────────────────── */}
      <Modal
        visible={showTrailerModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          setShowTrailerModal(false);
          setTrailerPlaying(true);
          setTrailerControlsVisible(true);
        }}
        statusBarTranslucent
      >
        <View style={styles.trailerModalContainer}>
          <StatusBar style="light" hidden />

          {/* ── Video area ── */}
          <View style={styles.trailerPlayerWrap}>
            {Platform.OS === "web" ? (
              <iframe
                src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1&controls=0&showinfo=0&iv_load_policy=3&enablejsapi=1&playsinline=1`}
                style={{ width: "100%", height: "100%", border: "none" } as any}
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            ) : WebView ? (
              <WebView
                ref={trailerWebViewRef}
                source={{
                  uri: `https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1&controls=0&showinfo=0&iv_load_policy=3&enablejsapi=1&playsinline=1`,
                }}
                allowsFullscreenVideo
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled
                style={{ flex: 1, backgroundColor: "#000" }}
                onMessage={(e: { nativeEvent: { data: string } }) => {
                  try {
                    const msg = JSON.parse(e.nativeEvent.data);
                    if (msg.type === "state") setTrailerPlaying(msg.playing);
                  } catch {}
                }}
                injectedJavaScript={`
                  (function() {
                    var css = document.createElement('style');
                    css.textContent = [
                      '.ytp-youtube-button{display:none!important}',
                      '.ytp-watermark{display:none!important}',
                      '.ytp-share-button{display:none!important}',
                      '.ytp-watch-later-button{display:none!important}',
                      '.ytp-title{display:none!important}',
                      '.ytp-title-channel-logo{display:none!important}',
                      '.ytp-channel-name{display:none!important}',
                      '.ytp-gradient-top{display:none!important}',
                      '.ytp-gradient-bottom{background:none!important}',
                      '.ytp-cards-button{display:none!important}',
                      '.ytp-chrome-top{display:none!important}',
                      'a[href*="youtube"]{pointer-events:none!important}',
                    ].join('');
                    document.head.appendChild(css);

                    function notifyState(playing) {
                      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
                        JSON.stringify({ type: 'state', playing: playing })
                      );
                    }

                    var bound = false;
                    var poll = setInterval(function() {
                      var vid = document.querySelector('video');
                      if (vid && !bound) {
                        bound = true;
                        vid.addEventListener('play', function(){ notifyState(true); });
                        vid.addEventListener('pause', function(){ notifyState(false); });
                        clearInterval(poll);
                      }
                      var els = document.querySelectorAll('.ytp-youtube-button,.ytp-watermark,.ytp-chrome-top,.ytp-title');
                      els.forEach(function(el){ el.style.display='none'; });
                    }, 400);

                    window._trailerToggle = function() {
                      var vid = document.querySelector('video');
                      if (!vid) return;
                      if (vid.paused) { vid.play(); } else { vid.pause(); }
                    };
                    window._trailerSeek = function(delta) {
                      var vid = document.querySelector('video');
                      if (vid) vid.currentTime = Math.max(0, vid.currentTime + delta);
                    };
                  })(); true;
                `}
              />
            ) : (
              <View style={styles.trailerFallback}>
                <Feather name="play-circle" size={56} color={colors.primary} style={{ marginBottom: 18 }} />
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 8, textAlign: "center" }}>
                  Player indisponível
                </Text>
              </View>
            )}

            {/* ── Custom controls overlay ── */}
            {WebView && Platform.OS !== "web" && (
              <Pressable
                style={styles.trailerOverlay}
                onPress={() => {
                  setTrailerControlsVisible((v) => {
                    if (!v) {
                      if (trailerHideTimer.current) clearTimeout(trailerHideTimer.current);
                      trailerHideTimer.current = setTimeout(() => setTrailerControlsVisible(false), 3500);
                    }
                    return !v;
                  });
                }}
              >
                {trailerControlsVisible && (
                  <>
                    {/* Top bar */}
                    <View style={styles.trailerCtrlTop}>
                      <TouchableOpacity
                        onPress={() => {
                          setShowTrailerModal(false);
                          setTrailerPlaying(true);
                          setTrailerControlsVisible(true);
                        }}
                        style={styles.trailerCtrlClose}
                      >
                        <Feather name="x" size={22} color="#fff" />
                      </TouchableOpacity>
                      <Text style={styles.trailerCtrlTitle} numberOfLines={1}>TRAILER</Text>
                      <View style={{ width: 44 }} />
                    </View>

                    {/* Center controls */}
                    <View style={styles.trailerCtrlCenter}>
                      <TouchableOpacity
                        style={styles.trailerSeekBtn}
                        onPress={() => trailerWebViewRef.current?.injectJavaScript("window._trailerSeek(-10); true;")}
                      >
                        <Feather name="rotate-ccw" size={26} color="#fff" />
                        <Text style={styles.trailerSeekLabel}>10</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.trailerPlayBtn}
                        onPress={() => {
                          trailerWebViewRef.current?.injectJavaScript("window._trailerToggle(); true;");
                          if (trailerHideTimer.current) clearTimeout(trailerHideTimer.current);
                          trailerHideTimer.current = setTimeout(() => setTrailerControlsVisible(false), 3500);
                        }}
                      >
                        <Feather name={trailerPlaying ? "pause" : "play"} size={32} color="#fff" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.trailerSeekBtn}
                        onPress={() => trailerWebViewRef.current?.injectJavaScript("window._trailerSeek(10); true;")}
                      >
                        <Feather name="rotate-cw" size={26} color="#fff" />
                        <Text style={styles.trailerSeekLabel}>10</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </Pressable>
            )}

            {/* Close button for web / no-WebView */}
            {(Platform.OS === "web" || !WebView) && (
              <TouchableOpacity
                style={styles.trailerWebClose}
                onPress={() => setShowTrailerModal(false)}
              >
                <Feather name="x" size={22} color="#fff" />
              </TouchableOpacity>
            )}
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

              {/* Logo or Title */}
              {logoUrl ? (
                <Image
                  source={{ uri: logoUrl }}
                  style={styles.titleLogo}
                  resizeMode="contain"
                />
              ) : (
                <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
              )}

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

              {/* ── Play buttons — auto-detect available sources ── */}
              {(() => {
                const resumeS = (type === "tv" && watchProgress?.season) ? watchProgress.season : 1;
                const resumeE = (type === "tv" && watchProgress?.episode) ? watchProgress.episode : 1;

                const hasR2 = type === "movie"
                  ? r2Items.some((i) => i.season == null && i.episode == null)
                  : r2Items.length > 0;

                const pressR2 = () => {
                  if (type === "movie") {
                    const item = r2Items.find((i) => i.season == null && i.episode == null);
                    if (item) goToR2Player(item);
                  } else {
                    const episodeItems = r2Items.filter((i) => i.episode != null);
                    const lastAdded = episodeItems[episodeItems.length - 1] ?? r2Items[0];
                    const resumeItem = (watchProgress?.season && watchProgress?.episode)
                      ? r2Items.find((i) => i.season === watchProgress.season && i.episode === watchProgress.episode) ?? lastAdded
                      : lastAdded;
                    if (resumeItem) goToR2Player(resumeItem);
                  }
                };

                const pressGstream = () => goToGstreamPlayer(resumeS, resumeE);
                const pressRegular = () => goToPlayer(resumeS, resumeE);

                const sources = [
                  hasR2 && { id: "r2", press: pressR2 },
                  gstreamAvailable && { id: "gstream", press: pressGstream },
                ].filter(Boolean) as { id: string; press: () => void }[];

                if (sources.length === 0) {
                  // Only regular player
                  return (
                    <Pressable
                      style={({ pressed }) => [styles.watchBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
                      onPress={pressRegular}
                      disabled={checking}
                    >
                      {checking ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="play" size={18} color="#fff" />}
                      <Text style={styles.watchBtnText}>{checking ? "Verificando..." : "ASSISTIR AGORA"}</Text>
                    </Pressable>
                  );
                }

                if (sources.length === 1) {
                  // Single special source — show as "ASSISTIR AGORA"
                  return (
                    <Pressable
                      style={({ pressed }) => [styles.watchBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
                      onPress={sources[0].press}
                      disabled={sources[0].id === "gstream" && gstreamResolving}
                    >
                      {sources[0].id === "gstream" && gstreamResolving
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Feather name="play" size={18} color="#fff" />}
                      <Text style={styles.watchBtnText}>
                        {sources[0].id === "gstream" && gstreamResolving ? "Buscando stream..." : "ASSISTIR AGORA"}
                      </Text>
                    </Pressable>
                  );
                }

                // Multiple sources — show individual buttons
                return (
                  <>
                    {hasR2 && (
                      <Pressable
                        style={({ pressed }) => [
                          styles.watchBtn,
                          { backgroundColor: colors.primary },
                          pressed && { opacity: 0.85 },
                        ]}
                        onPress={pressR2}
                      >
                        <Feather name={type === "tv" ? "tv" : "film"} size={18} color="#fff" />
                        <Text style={styles.watchBtnText}>ASSISTIR AGORA</Text>
                      </Pressable>
                    )}
                    {gstreamAvailable && (
                      <Pressable
                        disabled={gstreamResolving}
                        style={({ pressed }) => [
                          styles.watchBtn,
                          { backgroundColor: "#7c3aed", marginTop: 8 },
                          (pressed || gstreamResolving) && { opacity: 0.7 },
                        ]}
                        onPress={pressGstream}
                      >
                        <Feather name={gstreamResolving ? "loader" : "zap"} size={18} color="#fff" />
                        <Text style={styles.watchBtnText}>
                          {gstreamResolving
                            ? "Buscando stream..."
                            : `GSTREAM${type === "tv" ? `  ·  ${gstreamLang.toUpperCase()}` : ""}`}
                        </Text>
                      </Pressable>
                    )}
                  </>
                );
              })()}

              {/* Trailer button */}
              {trailerKey ? (
                <Pressable
                  style={({ pressed }) => [styles.trailerBtn, pressed && { opacity: 0.75 }]}
                  onPress={() => setShowTrailerModal(true)}
                >
                  <Feather name="play-circle" size={17} color="#fff" />
                  <Text style={styles.trailerBtnText}>ASSISTIR TRAILER</Text>
                </Pressable>
              ) : null}

              {/* Spacer after trailer button when present */}
              {trailerKey ? <View style={{ height: 20 }} /> : null}

              {/* Action row */}
              <View style={styles.actionRow}>
                <Pressable style={styles.actionBtn} onPress={toggleList}>
                  <Feather name={inList ? "check" : "plus"} size={20} color={inList ? colors.primary : colors.foreground} />
                  <Text style={[styles.actionLabel, { color: inList ? colors.primary : colors.mutedForeground }]}>
                    {inList ? "Na Lista" : "Minha Lista"}
                  </Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={handleDownload} disabled={downloading}>
                  {downloading ? (
                    <ActivityIndicator size="small" color="#4ade80" />
                  ) : (
                    <Feather name={isDownloaded ? "check-circle" : "download"} size={20} color={isDownloaded ? "#4ade80" : colors.foreground} />
                  )}
                  <Text style={[styles.actionLabel, { color: isDownloaded ? "#4ade80" : colors.mutedForeground }]}>
                    {downloading ? "Baixando..." : isDownloaded ? "Baixado" : "Download"}
                  </Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={() => handleLike(true)}>
                  <Feather name="thumbs-up" size={20} color={liked === true ? "#4caf50" : colors.foreground} />
                  <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>Gostei</Text>
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

                  {castList.length > 0 && (
                    <View style={{ marginTop: 20 }}>
                      <Text style={[styles.castHeading, { color: colors.foreground }]}>Elenco</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                        <View style={{ flexDirection: "row", gap: 12, paddingRight: 20 }}>
                          {castList.map((person: any) => (
                            <View key={person.id} style={styles.castItem}>
                              {person.profile_path ? (
                                <Image
                                  source={{ uri: `https://image.tmdb.org/t/p/w185${person.profile_path}` }}
                                  style={styles.castPhoto}
                                  resizeMode="cover"
                                />
                              ) : (
                                <View style={[styles.castPhoto, { backgroundColor: colors.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }]}>
                                  <Feather name="user" size={26} color={colors.mutedForeground} />
                                </View>
                              )}
                              <Text style={[styles.castName, { color: colors.foreground }]} numberOfLines={2}>{person.name}</Text>
                              {person.character ? (
                                <Text style={[styles.castCharacter, { color: colors.mutedForeground }]} numberOfLines={1}>{person.character}</Text>
                              ) : null}
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
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

                  {(() => {
                    // Per-episode registry items for this season (explicit entries)
                    const r2SpecificEps = r2Items.filter(
                      (i) => Number(i.season) === selectedSeason && i.episode != null
                    );
                    // Season-level registry item (episode=null) — exists when admin
                    // registered the whole season folder
                    const r2SeasonItem = r2Items.find(
                      (i) => Number(i.season) === selectedSeason && i.episode == null
                    );
                    // Whether we have a real file list from the season folder scan
                    const hasFolderScan = r2SeasonItem != null && r2EpisodeNums.size > 0;

                    // Build the episode list to display:
                    // 1. Per-episode registry entries → show only those episodes
                    // 2. Season folder with scanned files → show only scanned episodes
                    // 3. Season folder but scan pending/empty → show all TMDB episodes
                    // 4. No R2 at all → show all TMDB episodes
                    const displayedEpisodes =
                      r2SpecificEps.length > 0
                        ? episodeList.filter((ep) =>
                            r2SpecificEps.some((i) => Number(i.episode) === ep.episode_number)
                          )
                        : hasFolderScan
                        ? episodeList.filter((ep) => r2EpisodeNums.has(ep.episode_number))
                        : episodeList;

                    if (loadingEpisodes) {
                      return <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />;
                    }
                    if (displayedEpisodes.length === 0) {
                      return <Text style={{ color: colors.mutedForeground }}>Nenhum episódio encontrado.</Text>;
                    }
                    return displayedEpisodes.map((ep) => {
                      const { watched, current } = getEpisodeStatus(ep);

                      // R2 match priority:
                      // 1. Exact per-episode entry
                      // 2. Season folder item — only if this episode was found in the scan
                      // 3. Whole-series item — only if no season-specific data exists at all
                      const r2Ep =
                        r2Items.find((i) => Number(i.season) === selectedSeason && Number(i.episode) === ep.episode_number) ??
                        (r2SeasonItem && (hasFolderScan ? r2EpisodeNums.has(ep.episode_number) : true) ? r2SeasonItem : undefined) ??
                        (r2SpecificEps.length === 0 && !r2SeasonItem
                          ? r2Items.find((i) => i.season == null && i.episode == null)
                          : undefined);

                      return (
                        <EpisodeRow
                          key={ep.episode_number}
                          ep={ep}
                          watched={watched}
                          current={current}
                          colors={colors}
                          fallbackImage={details?.backdrop_path ?? details?.poster_path ?? null}
                          onPress={!r2Ep ? () => goToPlayer(selectedSeason, ep.episode_number) : undefined}
                          onGstreamPress={gstreamAvailable ? () => goToGstreamPlayer(selectedSeason, ep.episode_number) : undefined}
                          onR2Press={r2Ep ? () => goToR2Player(r2Ep, selectedSeason, ep.episode_number) : undefined}
                        />
                      );
                    });
                  })()}
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

              {activeTab === "collection" && (
                <View style={styles.tabContent}>
                  {loadingCollection ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
                  ) : !collectionData ? (
                    <Text style={{ color: colors.mutedForeground }}>Sem coleção disponível.</Text>
                  ) : (
                    <>
                      <Text style={[styles.collectionName, { color: colors.foreground }]}>
                        {collectionData.name}
                      </Text>
                      <Text style={[styles.collectionCount, { color: colors.mutedForeground }]}>
                        {collectionData.parts.length} filmes na coleção
                      </Text>
                      <View style={styles.collectionGrid}>
                        {collectionData.parts.map((part: any) => {
                          const poster = part.poster_path
                            ? `https://image.tmdb.org/t/p/w342${part.poster_path}`
                            : null;
                          const isCurrent = part.id === tmdbId;
                          const partYear = (part.release_date ?? "").slice(0, 4);
                          const partRating = part.vote_average
                            ? Math.round(part.vote_average * 10) / 10
                            : null;
                          return (
                            <Pressable
                              key={part.id}
                              style={[
                                styles.collectionItem,
                                { borderColor: isCurrent ? colors.primary : colors.border + "50" },
                                isCurrent && { backgroundColor: colors.primary + "12" },
                              ]}
                              onPress={() =>
                                !isCurrent &&
                                router.push({
                                  pathname: "/detail",
                                  params: { type: "movie", id: String(part.id), title: part.title },
                                })
                              }
                            >
                              <View style={styles.collectionPoster}>
                                {poster ? (
                                  <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                                ) : (
                                  <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card, alignItems: "center", justifyContent: "center" }]}>
                                    <Feather name="film" size={20} color={colors.border} />
                                  </View>
                                )}
                                {isCurrent && (
                                  <View style={styles.nowPlayingBadge}>
                                    <Feather name="play" size={8} color="#fff" />
                                  </View>
                                )}
                              </View>
                              <View style={styles.collectionInfo}>
                                <Text style={[styles.collectionTitle, { color: isCurrent ? colors.primary : colors.foreground }]} numberOfLines={2}>
                                  {part.title}
                                </Text>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                                  {partYear ? <Text style={[styles.collectionMeta, { color: colors.mutedForeground }]}>{partYear}</Text> : null}
                                  {partRating ? (
                                    <>
                                      <Text style={[styles.collectionMeta, { color: colors.mutedForeground }]}>·</Text>
                                      <Text style={[styles.collectionMeta, { color: "#f5c518", fontWeight: "700" }]}>⭐ {partRating}</Text>
                                    </>
                                  ) : null}
                                </View>
                                {isCurrent ? (
                                  <View style={[styles.currentBadge, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}>
                                    <Text style={[styles.currentBadgeTxt, { color: colors.primary }]}>Assistindo agora</Text>
                                  </View>
                                ) : (
                                  <Pressable
                                    style={[styles.collectionWatchBtn, { backgroundColor: colors.card, borderColor: colors.border + "60" }]}
                                    onPress={() => router.push({ pathname: "/detail", params: { type: "movie", id: String(part.id), title: part.title } })}
                                  >
                                    <Feather name="play" size={10} color={colors.foreground} />
                                    <Text style={[styles.collectionWatchTxt, { color: colors.foreground }]}>Ver detalhes</Text>
                                  </Pressable>
                                )}
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
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
  castHeading: { fontSize: 16, fontWeight: "700", marginBottom: 2 },
  castItem: { width: 80, alignItems: "center" },
  castPhoto: { width: 72, height: 72, borderRadius: 36 },
  castName: { fontSize: 11, fontWeight: "600", textAlign: "center", marginTop: 7, lineHeight: 14 },
  castCharacter: { fontSize: 10, textAlign: "center", marginTop: 2, lineHeight: 13 },
  title: { fontSize: 26, fontWeight: "900", letterSpacing: -0.5, marginBottom: 8, lineHeight: 32 },
  titleLogo: { width: "80%", height: 72, marginBottom: 10, alignSelf: "flex-start" },
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
  epPlayCol: { alignItems: "center", justifyContent: "flex-start", paddingTop: 10, paddingLeft: 4, gap: 6 },
  epPlayBtn: { padding: 2, alignItems: "center", justifyContent: "center" },
  epDriveBtn: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
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

  // Collection tab
  collectionName: { fontSize: 18, fontWeight: "800", marginBottom: 4, letterSpacing: -0.3 },
  collectionCount: { fontSize: 12, marginBottom: 18 },
  collectionGrid: { gap: 12 },
  collectionItem: {
    flexDirection: "row", alignItems: "flex-start",
    borderRadius: 14, borderWidth: 1,
    padding: 10, gap: 12, overflow: "hidden",
  },
  collectionPoster: {
    width: 70, height: 100, borderRadius: 10,
    overflow: "hidden", flexShrink: 0, backgroundColor: "#1a1a1a",
  },
  nowPlayingBadge: {
    position: "absolute", bottom: 6, right: 6,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "rgba(229,9,20,0.9)",
    alignItems: "center", justifyContent: "center",
  },
  collectionInfo: { flex: 1, paddingTop: 2, gap: 4 },
  collectionTitle: { fontSize: 14, fontWeight: "700", lineHeight: 18 },
  collectionMeta: { fontSize: 11 },
  currentBadge: {
    alignSelf: "flex-start", marginTop: 6,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  currentBadgeTxt: { fontSize: 10, fontWeight: "700" },
  collectionWatchBtn: {
    alignSelf: "flex-start", marginTop: 6,
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1,
  },
  collectionWatchTxt: { fontSize: 11, fontWeight: "600" },

  trailerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  trailerBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  trailerModalContainer: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
  },
  trailerPlayerWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    position: "relative",
  },
  trailerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  trailerCtrlTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  trailerCtrlClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  trailerCtrlTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1.5,
    textAlign: "center",
  },
  trailerCtrlCenter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 36,
    flex: 1,
  },
  trailerSeekBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  trailerSeekLabel: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    position: "absolute",
    bottom: -2,
    alignSelf: "center",
  },
  trailerPlayBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  trailerWebClose: {
    position: "absolute",
    top: 12,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  trailerFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
});
