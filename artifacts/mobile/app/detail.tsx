import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";

import { downloadsManager } from "@/lib/downloads";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getLocalProgress, clearLocalProgress } from "@/hooks/useWatchProgress";
import type { WatchEntry } from "@/hooks/useWatchProgress";
import { useColors } from "@/hooks/useColors";
import { ContentCard } from "@/components/ContentCard";
import { api as tmdbApi, TMDB_IMG, tmdbItemToContent, getApiBase } from "@/lib/api";
import type { TmdbItem, TmdbEpisode, TmdbSeason } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import { addCatalogWatch, removeCatalogWatch, isWatchingCatalog } from "@/lib/catalog-watch";
import type { ContentOverride, WatchProgress, ContentReport } from "@/lib/supabase";
import type { ContentItem } from "@/constants/content";
import { searchDriveByTitle, getDriveSeasonEpisodes, DriveMatch } from "@/lib/gdrive-search";
import { DriveItem, parseEpisodeInfo, listFolderAll, isVideo } from "@/lib/gdrive-index";

interface RegistryItem {
  id: string; r2Key: string; teraboxUrl?: string; flix2Url?: string;
  driveUrl?: string; driveDirectUrl?: string;
  driveFilePath?: string; driveNum?: number;
  tmdbId: number; tmdbType: "movie" | "tv";
  title: string; label: string; season: number | null; episode: number | null;
  quality?: string;
  exclusive?: boolean;
}

interface SourceSettings {
  r2: boolean; drive: boolean; flix2: boolean; regular: boolean;
}

const DEFAULT_SRC: SourceSettings = { r2: false, drive: true, flix2: true, regular: false };

// Um item é "Drive" se tiver driveUrl (link compartilhável) OU driveFilePath (registrado via navegador de pastas)
const isDriveItem = (i: RegistryItem) => !!i.driveUrl || i.driveFilePath != null;
const isFlixItem  = (i: RegistryItem) => !!i.flix2Url;

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
  onR2Press,
  onDrivePress,
  onFlixPress,
}: {
  ep: TmdbEpisode;
  watched: boolean;
  current: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  fallbackImage?: string | null;
  onPress?: () => void;
  onR2Press?: () => void;
  onDrivePress?: () => void;
  onFlixPress?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const thumbUri = !imgFailed && ep.still_path
    ? (TMDB_IMG(ep.still_path, "w500") ?? null)
    : null;

  // Use series backdrop as styled fallback when no episode still is available
  const showFallback = !thumbUri && fallbackImage;

  // Count available source types — when Flix 2.0 is the ONLY source, tapping the
  // thumbnail plays directly instead of showing a separate ⚡ button.
  const sourceCount = [onPress, onR2Press, onFlixPress, onDrivePress].filter(Boolean).length;
  const flixOnly = sourceCount === 1 && !!onFlixPress;

  const thumbSection = (
    <>
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
      {/* Single-source play overlay — shown directly on the thumbnail */}
      {flixOnly && (
        <View style={[StyleSheet.absoluteFill, { width: styles.episodeThumb.width, alignItems: "center", justifyContent: "center" }]}>
          <View style={{ backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 22, padding: 8 }}>
            <Feather name="play" size={20} color="#fff" />
          </View>
        </View>
      )}
    </>
  );

  return (
    <View style={[styles.episodeRow, { backgroundColor: colors.card, borderColor: current ? colors.primary : colors.border }]}>
      {/* Thumbnail — tappable when Flix 2.0 is the only source */}
      {flixOnly ? (
        <Pressable onPress={onFlixPress} style={{ position: "relative" }}>
          {thumbSection}
        </Pressable>
      ) : (
        <View style={{ position: "relative" }}>
          {thumbSection}
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

      {/* Play buttons column — only rendered when multiple sources exist */}
      {!flixOnly && (
        <View style={styles.epPlayCol}>
          {onPress && (
            <Pressable onPress={onPress} style={styles.epPlayBtn}>
              <Feather name="play-circle" size={28} color={current ? colors.primary : colors.foreground} />
            </Pressable>
          )}
          {onR2Press && (
            <Pressable onPress={onR2Press} style={[styles.epPlayBtn, { backgroundColor: "#e50914", borderRadius: 8, padding: 4, marginTop: onPress ? 4 : 0 }]}>
              <Feather name="play" size={16} color="#fff" />
            </Pressable>
          )}
          {onFlixPress && (
            <Pressable onPress={onFlixPress} style={[styles.epPlayBtn, { backgroundColor: "#8b5cf6", borderRadius: 8, padding: 4, marginTop: onR2Press || onPress ? 4 : 0 }]}>
              <Feather name="zap" size={14} color="#fff" />
            </Pressable>
          )}
          {onDrivePress && (
            <Pressable onPress={onDrivePress} style={[styles.epPlayBtn, { backgroundColor: "#16a34a", borderRadius: 8, padding: 4, marginTop: 4 }]}>
              <Feather name="cloud" size={14} color="#fff" />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

// Module-level cache — survives component unmount/remount on web (router.push → back).
// Keyed by "${type}_${tmdbId}". TTL of 5 minutes keeps data fresh enough.
type DetailsCache = { details: TmdbItem; similar: any[]; seasons: any[]; providers: any[]; ts: number };
const _detailsCache = new Map<string, DetailsCache>();
const DETAILS_CACHE_TTL = 5 * 60 * 1000;

/**
 * Filters a list of TMDB "similar" content items to only those
 * available in the Flix 2.0 catalog. Falls back to the original list
 * if the cache is not warm yet or fewer than 3 results remain.
 */
async function filterSimByAvailability(items: ContentItem[]): Promise<ContentItem[]> {
  try {
    // Build "id:encodedTitle" tokens so the server can check by TMDB id OR by title
    const tokens = items
      .filter((i) => i.tmdbId && i.tmdbId > 0)
      .map((i) => `${i.tmdbId}:${encodeURIComponent(i.title ?? "")}`)
      .join(",");
    if (!tokens) return items;
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${getApiBase()}/r2/flix2/check-ids?items=${tokens}`, { signal: ctrl.signal });
    if (!res.ok) return items;
    const data = await res.json();
    if (!data.cacheWarm) return items;
    const available = new Set<number>(data.available ?? []);
    if (available.size === 0) return items;
    const filtered = items.filter((i) => i.tmdbId && available.has(i.tmdbId));
    return filtered.length >= 3 ? filtered : items;
  } catch {
    return items;
  }
}

export default function DetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ type: string; id: string; flix2Id?: string; title?: string; tab?: string; poster?: string }>();
  // Remove anotações como [L], [HD], [Dublado] e ano (2026) do título antes de buscar no TMDB/Flix2
  const cleanTitle = (t: string) =>
    t.replace(/\s*\[[^\]]*\]/g, "").replace(/\s*\(\d{4}\)/g, "").trim();

  const type = (params.type ?? "movie") as "movie" | "tv";
  const tmdbId = Number(params.id ?? 0);

  const [details, setDetails] = useState<TmdbItem | null>(null);
  const [similar, setSimilar] = useState<ContentItem[]>([]);
  const [seasons, setSeasons] = useState<TmdbSeason[]>([]);
  // Images fetched directly from TMDB using the override's tmdb_id (bypasses server proxy)
  const [overridePoster, setOverridePoster] = useState<string | null>(null);
  const [overrideBackdrop, setOverrideBackdrop] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodeList, setEpisodeList] = useState<TmdbEpisode[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>(
    params.tab === "episodes" ? "episodes" : "about"
  );
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [watchProgress, setWatchProgress] = useState<WatchProgress | null>(null);
  const [localProgress, setLocalProgress] = useState<WatchEntry | null>(null);
  const [unavailableVisible, setUnavailableVisible] = useState(false);
  const [indicated, setIndicated] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState<ContentReport["reason"] | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [collectionData, setCollectionData] = useState<{ id: number; name: string; parts: any[] } | null>(null);
  const [loadingCollection, setLoadingCollection] = useState(false);
  // resolvedTmdbId starts as tmdbId (from params) but may be updated when a
  // Flix2-only item (tmdbId=0) is matched to a TMDB title-search result.
  // All effects that need a TMDB ID (episodes, new-ep badge) use this instead of tmdbId.
  const [resolvedTmdbId, setResolvedTmdbId] = useState(tmdbId);
  const [resolvedType, setResolvedType] = useState<"movie" | "tv">(type);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const [trailerPlaying, setTrailerPlaying] = useState(true);
  const [bannerMuted, setBannerMuted] = useState(true);
  const [bannerVideoUrl, setBannerVideoUrl] = useState<string | null>(null);
  const bannerVideoRef = useRef<any>(null);
  const bannerTrailerRef = useRef<any>(null);

  const [r2Items, setR2Items] = useState<RegistryItem[]>([]);
  // Episode numbers (parsed from R2 filenames) for the current season's folder item
  const [r2EpisodeNums, setR2EpisodeNums] = useState<Set<number>>(new Set());
  const [srcSettings, setSrcSettings] = useState<SourceSettings>(DEFAULT_SRC);
  // Tracks if the R2/Flix2 lookup is still in progress (to avoid race on ASSISTIR AGORA)
  const [r2Loading, setR2Loading] = useState(true);
  // Tracks if the background Flix 2.0 lookup is still running (separate from r2Loading)
  const [flix2Loading, setFlix2Loading] = useState(false);

  // Ref so the banner effect can read current localProgress without it being a dep
  // (avoids race condition where localProgress for new content fires effect with old r2Items)
  const localProgressRef = useRef<typeof localProgress>(null);
  React.useEffect(() => { localProgressRef.current = localProgress; }, [localProgress]);

  // Set banner video URL from: R2 server-proxy (priority 1) or Flix2 stream (priority 2)
  React.useEffect(() => {
    if (!r2Items.length) return;
    // Priority 1: R2 bucket items — proxy through API server (no R2 keys needed in app)
    const r2Item = r2Items.find((i) => !isDriveItem(i) && !isFlixItem(i) && i.r2Key);
    if (r2Item) {
      const streamUrl = `${getApiBase()}/r2/stream?key=${encodeURIComponent(r2Item.r2Key)}`;
      setBannerVideoUrl(streamUrl);
      return;
    }
    // Priority 1b: Drive items — build the stream URL from the item's stored path/URL.
    // Movie: item with no episode. Series: prefer continue-watching episode, then S01E01.
    const driveItem =
      r2Items.find((i) => isDriveItem(i) && !i.episode) ??
      (localProgressRef.current?.season != null && localProgressRef.current?.episode != null
        ? r2Items.find((i) => isDriveItem(i) && i.season === localProgressRef.current!.season && i.episode === localProgressRef.current!.episode)
        : undefined) ??
      r2Items.find((i) => isDriveItem(i) && i.season === 1 && i.episode === 1) ??
      r2Items.find((i) => isDriveItem(i) && i.season === 1);
    if (driveItem) {
      let cancelled = false;
      (async () => {
        try {
          const { drivePlayDirect } = await import("@/lib/r2-direct");
          const { url } = await drivePlayDirect(driveItem.id);
          if (!cancelled && url) setBannerVideoUrl(url);
        } catch {}
      })();
      return () => { cancelled = true; };
    }

    // Priority 2: Flix2 stream
    // For movies: item with no episode number.
    // For series: prefer the episode matching localProgress (continue watching),
    //             then S01E01, then first episode of S1.
    //             Web → server proxy (avoids CORS). Native → direct URL (device IP handles CDN token).
    const prog = localProgressRef.current;
    const flix2Item =
      // Movie-level item (no episode)
      r2Items.find((i) => isFlixItem(i) && i.flix2Url && !i.episode) ??
      // Continue watching: episode matching saved progress
      (prog?.season != null && prog?.episode != null
        ? r2Items.find((i) => isFlixItem(i) && i.flix2Url && i.season === prog.season && i.episode === prog.episode)
        : undefined) ??
      // Default: S01E01
      r2Items.find((i) => isFlixItem(i) && i.flix2Url && i.season === 1 && i.episode === 1) ??
      // Fallback: first episode of season 1
      r2Items.find((i) => isFlixItem(i) && i.flix2Url && i.season === 1);
    if (flix2Item?.flix2Url) {
      if (Platform.OS === "web") {
        setBannerVideoUrl(`${getApiBase()}/stream/proxy?url=${encodeURIComponent(flix2Item.flix2Url)}`);
      } else {
        // Native: play directly — device IP handles CDN token (hubby.cx/fontedecanais)
        setBannerVideoUrl(flix2Item.flix2Url);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r2Items.map((i) => i.id).join(",")]);

  // Always navigate to the dedicated player (flix2-player / r2-player / gdrive-player).
  // Web fullscreen on the banner <video> was removed because it shows the browser's
  // native controls without the NETPLAY custom player UI (episode panel, quality
  // selector, sleep timer, etc.). All platforms now use the fallback navigation.
  const tryBannerFullscreen = useCallback((_startRatio: number | undefined, fallback: () => void) => {
    fallback();
  }, []);
  const [showAddSrcModal, setShowAddSrcModal] = useState(false);
  const [addSrcUrl, setAddSrcUrl] = useState("");
  const [addSrcBusy, setAddSrcBusy] = useState(false);
  const [addSrcErr, setAddSrcErr] = useState<string | null>(null);
  const [trailerControlsVisible, setTrailerControlsVisible] = useState(true);
  const trailerWebViewRef = useRef<any>(null);
  const trailerHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [newEpisodeInfo, setNewEpisodeInfo] = useState<{ season: number; episode: number; episode_title: string | null; expires_at: string } | null>(null);

  const userId = user?.id ?? "";
  const isAdmin = user?.role === "admin" ||
    (user?.email ? ["admin@netplay.tv", "admin@netplay.com.br"].includes(user.email) : false);

  // Unique key for this piece of content used to store/retrieve admin overrides
  const normalizedTitleKey = `title_${(params.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 80)}`;
  const contentKey = tmdbId ? `${type}_${tmdbId}` : normalizedTitleKey;

  // Reset banner video when navigating to a different title
  React.useEffect(() => {
    setBannerVideoUrl(null);
  }, [contentKey]);

  // Admin content override state
  const [contentOverride, setContentOverride] = useState<ContentOverride | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTmdbId, setEditTmdbId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editOverview, setEditOverview] = useState("");
  const [editOverviewMode, setEditOverviewMode] = useState<"auto" | "manual">("auto");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [autoOverview, setAutoOverview] = useState<string>("");
  const [fetchingAutoOverview, setFetchingAutoOverview] = useState(false);
  const [editSearchQuery, setEditSearchQuery] = useState("");
  const [editSearchType, setEditSearchType] = useState<"movie" | "tv">("tv");
  const [editSearchResults, setEditSearchResults] = useState<Array<{ id: number; title: string; year: string; poster: string | null; overview: string }>>([]);
  const [editSearchLoading, setEditSearchLoading] = useState(false);
  const [editSelectedResult, setEditSelectedResult] = useState<{ id: number; title: string; poster: string | null } | null>(null);
  const [editPosterPath, setEditPosterPath] = useState<string | null>(null);
  const [editBackdropPath, setEditBackdropPath] = useState<string | null>(null);
  const [editSeasons, setEditSeasons] = useState<number | null>(null);
  const [editEpisodes, setEditEpisodes] = useState<number | null>(null);
  const [editVoteAverage, setEditVoteAverage] = useState<number | null>(null);

  const [editImdbId, setEditImdbId] = useState("");
  const [flix2LinkQuery, setFlix2LinkQuery] = useState("");
  const [flix2LinkCatalogType, setFlix2LinkCatalogType] = useState<"movies" | "series" | "animes">("movies");
  const [flix2LinkResults, setFlix2LinkResults] = useState<Array<{ id: string; title: string; year: number; poster: string; stream_url: string | null; catalogType: string }>>([]);
  const [flix2LinkLoading, setFlix2LinkLoading] = useState(false);
  const [flix2LinkSelected, setFlix2LinkSelected] = useState<{ id: string; title: string; poster: string; catalogType: string } | null>(null);
  const [flix2LinkBusy, setFlix2LinkBusy] = useState(false);
  const [flix2LinkDone, setFlix2LinkDone] = useState(false);

  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [convertingLinkId, setConvertingLinkId] = useState<string | null>(null);
  const [convertedLinks, setConvertedLinks] = useState<Record<string, string>>({});
  const [inList, setInList] = useState(false);
  const [liked, setLiked] = useState<boolean | undefined>(undefined);
  const [watchingCatalog, setWatchingCatalog] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [driveMatches, setDriveMatches] = useState<DriveMatch[]>([]);
  const [driveEpisodeMap, setDriveEpisodeMap] = useState<Record<number, DriveItem>>({});
  const [driveSeasonItems, setDriveSeasonItems] = useState<DriveItem[]>([]);
  // Synopsis from Flix 2.0 catalog item — used as fallback when TMDB overview is empty
  const [flix2Synopsis, setFlix2Synopsis] = useState("");
  // Guards against running the year-correction lookup more than once
  const flix2YearCorrectedRef = useRef(false);
  // Admin-only: mismatched registry items (content exists but with a different tmdbId)
  const [adminDiagnostic, setAdminDiagnostic] = useState<{ count: number; ids: number[]; titles: string[] } | null>(null);
  const [fixingIds, setFixingIds] = useState(false);
  const [fixDone, setFixDone] = useState<number | null>(null);
  const [exclusiveLoading, setExclusiveLoading] = useState(false);
  // ── Episode Mapper (admin: flat-folder Drive → R2 per-episode entries) ──
  const [showEpMapper, setShowEpMapper] = useState(false);
  const [epMapperFiles, setEpMapperFiles] = useState<{ name: string; relPath: string; link: string; season: number; episode: number; hidden?: boolean }[]>([]);
  const [epMapperLoading, setEpMapperLoading] = useState(false);
  const [epMapperSaving, setEpMapperSaving] = useState(false);
  const [epMapperSaved, setEpMapperSaved] = useState(0);
  const [epMapperSelectMode, setEpMapperSelectMode] = useState(false);
  const [epMapperSelected, setEpMapperSelected] = useState<Set<number>>(new Set());
  const [epMapperBulkSeason, setEpMapperBulkSeason] = useState("1");
  const [epMapperBulkStartEp, setEpMapperBulkStartEp] = useState("1");
  const [epMapperClearing, setEpMapperClearing] = useState(false);
  const [epMapperCleared, setEpMapperCleared] = useState<number | null>(null);

  // Load R2 registry items + source settings + Flix 2.0 live lookup
  // ─── Fase 1 (rápida): registry + settings → mostra botões imediatamente
  // ─── Fase 2 (lenta):  flix2/lookup roda em background e acrescenta itens
  useEffect(() => {
    // Allow items without a TMDB ID (tmdbId=0) to proceed — they can still be found
    // in Flix 2.0 by title. TMDB-specific calls (details, similar, etc.) have their
    // own guards and will skip automatically when tmdbId=0.
    const hasIdent = tmdbId || (params.title ?? "").trim() || (params.flix2Id ?? "").trim();
    if (!hasIdent) { setR2Loading(false); setFlix2Loading(false); return; }
    setFlix2Loading(false);  // reset ao navegar para novo título
    let cancelled = false;
    const loadR2 = async () => {
      try {
        const { r2Route } = await import("@/lib/r2-direct");

        // ── Fase 1: registro + settings (geralmente < 1s) ──────────────────
        // Usa r2Route("/registry") em vez de apiGetRegistry() diretamente,
        // pois no web (Chrome) requisições S3 diretas falham por CORS.
        const [data, settingsRaw] = await Promise.allSettled([
          r2Route<{ version: number; items: RegistryItem[] }>("/registry"),
          r2Route<SourceSettings>("/source-settings"),
        ]);
        if (cancelled) return;

        const allItems: RegistryItem[] = data.status === "fulfilled"
          ? (data.value.items ?? []) : [];

        // Filtro principal: tmdbId + type exato
        let registryItems = allItems.filter(
          (i: RegistryItem) => i.tmdbId === tmdbId && i.tmdbType === type
        );
        // Fallback 1: se não encontrou com type exato, tenta só pelo tmdbId
        // (acontece quando o conteúdo foi registrado com tipo movie/tv trocado)
        if (registryItems.length === 0) {
          registryItems = allItems.filter(
            (i: RegistryItem) => i.tmdbId === tmdbId
          );
        }

        // Guard: quando tmdbId=0 (conteúdo Flix2-only sem TMDB ID), o filtro acima
        // retorna TODOS os itens com tmdbId=0 — inclusive itens genéricos como
        // "Dublado HD" que foram salvos sem TMDB ID e contaminam TODOS os conteúdos
        // sem ID. Aplica sub-filtro por título para manter só itens que realmente
        // pertencem a este conteúdo.
        if (tmdbId === 0 && registryItems.length > 0 && (params.title ?? "").length >= 3) {
          const t0Norm = cleanTitle(String(params.title ?? "")).toLowerCase().replace(/[^a-z0-9]/g, "");
          const t0Words = t0Norm.match(/[a-z0-9]{5,}/g) ?? [];
          const matched = registryItems.filter((i: RegistryItem) => {
            const iNorm = cleanTitle(i.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
            if (!iNorm || iNorm.length < 3) return false;
            if (iNorm === t0Norm) return true;
            const minLen = Math.min(iNorm.length, t0Norm.length, 8);
            if (minLen >= 6 && iNorm.slice(0, minLen) === t0Norm.slice(0, minLen)) return true;
            const iWords = iNorm.match(/[a-z0-9]{5,}/g) ?? [];
            return t0Words.length > 0 && t0Words.some((w) => iWords.includes(w));
          });
          // Só aplica o sub-filtro se encontrou algum item com título correspondente.
          // Caso contrário mantém todos (conteúdo pode não ter título disponível ainda).
          if (matched.length > 0) registryItems = matched;
        }

        // Fallback 2: busca por título quando o tmdbId buscado é diferente do registrado
        // (acontece quando a home retorna tmdbId X mas o admin registrou com tmdbId Y)
        // Ex.: home usa ID 31499 mas admin registrou "A Lenda de Tarzan" como ID 2395.
        let titleFallbackIds: number[] = [];
        let titleFallbackTitles: string[] = [];
        if (registryItems.length === 0 && (params.title ?? "").length >= 3) {
          const titleRaw = cleanTitle(String(params.title ?? "")).toLowerCase();
          const titleNorm = titleRaw.replace(/[^a-z0-9]/g, "");
          // Palavras com 5+ chars para match semântico entre idiomas (ex: "tarzan" bate em PT e EN)
          const titleWords = titleNorm.match(/[a-z0-9]{5,}/g) ?? [];

          const byTitle = allItems.filter((i: RegistryItem) => {
            if (i.tmdbId === tmdbId) return false;
            // Clean the registry title too (remove [L], [D], year) before comparing
            const iNorm = cleanTitle(i.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
            if (iNorm.length < 3) return false;
            // Critério 1: normalized igual (mesmo título, mesmo idioma)
            if (iNorm === titleNorm) return true;
            // Critério 2: primeiros 8 chars iguais (prefixo parecido)
            const minLen = Math.min(iNorm.length, titleNorm.length, 8);
            if (minLen >= 6 && iNorm.slice(0, minLen) === titleNorm.slice(0, minLen)) return true;
            // Critério 3: palavra significativa em comum (5+ chars) — funciona entre idiomas
            // "The Legend of Tarzan" ↔ "A Lenda de Tarzan" → ambos têm "tarzan"
            const iWords = iNorm.match(/[a-z0-9]{5,}/g) ?? [];
            return titleWords.some((w) => iWords.includes(w));
          });
          if (byTitle.length > 0) {
            registryItems = byTitle;
            titleFallbackIds = [...new Set(byTitle.map((i: RegistryItem) => i.tmdbId))];
            titleFallbackTitles = [...new Set(byTitle.map((i: RegistryItem) => i.title))].slice(0, 3);
          }
        }

        // ── Diagnóstico para admin ──────────────────────────────────────────────
        if (titleFallbackIds.length > 0) {
          // Conteúdo encontrado via fallback de título — mismatch de ID detectado
          setAdminDiagnostic({ count: registryItems.length, ids: titleFallbackIds, titles: titleFallbackTitles });
        } else if (registryItems.length === 0) {
          // Nada encontrado de nenhuma forma — verifica mismatch parcial para diagnóstico
          const titleNorm = (params.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const mismatched = allItems.filter((i: RegistryItem) => {
            if (i.tmdbId === tmdbId) return false;
            const iNorm = (i.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
            return iNorm.length > 0 && titleNorm.length > 0 && (
              iNorm.includes(titleNorm.slice(0, 6)) || titleNorm.includes(iNorm.slice(0, 6))
            );
          });
          if (mismatched.length > 0) {
            const ids = [...new Set(mismatched.map((i: RegistryItem) => i.tmdbId))];
            const titles = [...new Set(mismatched.map((i: RegistryItem) => i.title))].slice(0, 3);
            setAdminDiagnostic({ count: mismatched.length, ids, titles });
          } else {
            setAdminDiagnostic(null);
          }
        } else {
          setAdminDiagnostic(null);
        }

        if (settingsRaw.status === "fulfilled") {
          setSrcSettings({ ...DEFAULT_SRC, ...settingsRaw.value });
        }

        // Dedup driveFilePath items by (season, episode) — when multiple entries exist for
        // the same S+E, prefer the one whose label matches the episode pattern (T1E01) over
        // quality/series labels (Dublado 1080p, etc). Ties broken by keeping the last one.
        {
          const EP_LABEL_RE = /^T\d+E\d+/i;
          const drivePathBest = new Map<string, { idx: number; epLabel: boolean }>();
          registryItems.forEach((item, idx) => {
            if (item.driveFilePath && !item.driveUrl) {
              const key = `s${item.season ?? "null"}e${item.episode ?? "null"}`;
              const epLabel = EP_LABEL_RE.test(item.label ?? "");
              const existing = drivePathBest.get(key);
              if (!existing || epLabel || !existing.epLabel) {
                drivePathBest.set(key, { idx, epLabel });
              }
            }
          });
          const keepIndices = new Set([...drivePathBest.values()].map((v) => v.idx));
          registryItems = registryItems.filter((item, idx) =>
            !(item.driveFilePath && !item.driveUrl) || keepIndices.has(idx)
          );
        }

        // For TV series pages: strip any Flix2 registry items that have no episode number.
        // These are spurious movie-level entries (e.g. "Dublado HD" with /movie/ URL)
        // that were saved to the registry in error — they show wrong content on series pages.
        if (type !== "movie") {
          registryItems = registryItems.filter(
            (i) => !isFlixItem(i) || i.episode != null
          );
        }

        setR2Items(registryItems);
        setR2Loading(false);  // fase 1 concluída — UI já pode mostrar botões

        // ── Fase 2: flix2/lookup (pode levar 5-20s, corre em background) ──
        // Roda SEMPRE (mesmo com R2/Drive) para descobrir fontes complementares.
        // Só pula se o registro já tem itens flix2 COM episódios específicos (episode != null).
        // Itens flix2 de nível de série (episode=null) NÃO contam — eles não fornecem
        // botões individuais por episódio, então ainda precisamos do lookup de episódios.
        // Problema real: quando tmdbId=0, o filtro i.tmdbId===0 pode trazer outras séries
        // sem TMDB ID (ex: "Pasárgada") que têm flix2Url mas episode=null, causando
        // alreadyHasFlix=true e bloqueando o lookup da série correta.
        const alreadyHasFlixEpisodes = registryItems.some(
          (i) => isFlixItem(i) && i.episode != null
        );
        if (alreadyHasFlixEpisodes) return;

        if (!cancelled) setFlix2Loading(true);
        try {
          const flix2Type = type === "movie" ? "movies" : "all";
          const flix2StreamId = params.flix2Id ? `&streamId=${encodeURIComponent(params.flix2Id)}` : "";
          // Normalize title before lookup: strip hyphens/underscores → spaces so
          // "Spider-Noir" and "Spider Noir" both reach the server as "Spider Noir"
          const lookupTitle = cleanTitle(params.title ?? "")
            .replace(/[-_]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          const flix2Raw = await r2Route<{ found: boolean; item: any }>(
            `/flix2/lookup?tmdbId=${tmdbId}&type=${flix2Type}&title=${encodeURIComponent(lookupTitle)}${flix2StreamId}`
          );
          if (cancelled) return;

          // ── Title-ownership guard ─────────────────────────────────────────────
          // The catalog has tmdb_id=0 for all items, so flix2 matches by TITLE.
          // When two TMDB films share the same title (e.g. "Mestres do Universo" 1987
          // vs 2026), the same catalog stream is returned for both. Guard: for films
          // with a known tmdbId, verify we are the highest-vote_count TMDB result for
          // this title. If not, treat flix2 as not-found → fall through to Veo/Phase 3.
          let flix2Authoritative = flix2Raw.found;
          if (flix2Authoritative && tmdbId > 0) {
            try {
              // Use type=multi so results always include the media_type field.
              // type=movie / type=tv endpoints return results WITHOUT media_type,
              // making it impossible to filter by type after the fact.
              const expectedMediaType = type === "movie" ? "movie" : "tv";
              const ownerResp = await fetch(
                `${getApiBase()}/tmdb/search?q=${encodeURIComponent(lookupTitle)}&type=multi`
              );
              if (ownerResp.ok) {
                const ownerData = await ownerResp.json();
                const candidates: any[] = (ownerData.results ?? []).filter(
                  (r: any) => r.media_type === expectedMediaType
                );
                const myResult = candidates.find((r: any) => r.id === tmdbId);
                if (myResult) {
                  const primaryHit = candidates.reduce((best: any, r: any) => {
                    if (!best) return r;
                    return (r.vote_count ?? 0) > (best.vote_count ?? 0) ? r : best;
                  }, null as any);
                  // If another film with more ratings is the canonical version of
                  // this title, the stream belongs to that other film — not us.
                  if (
                    primaryHit &&
                    primaryHit.id !== tmdbId &&
                    (primaryHit.vote_count ?? 0) > (myResult.vote_count ?? 0)
                  ) {
                    flix2Authoritative = false;
                  }
                }
              }
            } catch { /* keep flix2Authoritative=true on errors */ }
          }
          if (cancelled) return;
          // ── End title-ownership guard ─────────────────────────────────────────

          // ── Fase 3: Veo Play fallback ─────────────────────────────────────────
          // Se Flix 2.0 não encontrou nada (ou o match não é deste filme), tenta Veo.
          // Só mostra conteúdo que resolve para vod99.cineveo.lat (não fontedecanais).
          if (!flix2Authoritative) {
            try {
              const veoType = type === "movie" ? "movies" : "all";
              const veoRaw = await r2Route<{ found: boolean; item: any; contentType: string }>(
                `/veo/lookup?tmdbId=${tmdbId}&type=${veoType}&title=${encodeURIComponent(lookupTitle)}`
              );
              if (cancelled || !veoRaw.found) return;
              const vi = veoRaw.item;

              // Verifica CDN com o primeiro stream URL disponível
              const checkUrl: string | null =
                vi?.stream_url ||
                (Array.isArray(vi?.episodes) && vi.episodes.length > 0 ? vi.episodes[0]?.stream_url : null);
              if (!checkUrl) return;

              const cdnCheck = await r2Route<{ ok: boolean; cdnOk: boolean; cdnHost: string }>(
                `/veo/stream-check?streamUrl=${encodeURIComponent(checkUrl)}`
              );
              // fontedecanais não funciona no APK — silenciosamente ignora
              if (!cdnCheck.cdnOk) return;

              if (vi?.synopsis && !cancelled) setFlix2Synopsis(vi.synopsis);
              const veoItems: RegistryItem[] = [];

              if (vi?.stream_url) {
                veoItems.push({
                  id: `veo-auto-${tmdbId}`, r2Key: "", flix2Url: vi.stream_url,
                  tmdbId, tmdbType: type, title: vi.title ?? "",
                  label: `${vi.title ?? ""} · Veo`,
                  season: null, episode: null,
                });
              } else if (Array.isArray(vi?.episodes) && vi.episodes.length > 0) {
                for (const ep of vi.episodes as Array<{ season: number; episode: number; stream_url?: string }>) {
                  if (!ep?.stream_url) continue;
                  veoItems.push({
                    id: `veo-auto-${tmdbId}-s${ep.season}e${ep.episode}`, r2Key: "",
                    flix2Url: ep.stream_url, tmdbId, tmdbType: type,
                    title: vi.title ?? "",
                    label: `T${String(ep.season).padStart(2, "0")} E${String(ep.episode).padStart(2, "0")} · Veo`,
                    season: ep.season, episode: ep.episode,
                  });
                }
              }

              if (!cancelled && veoItems.length > 0) {
                setR2Items((prev) => [...prev, ...veoItems]);
              }
            } catch {}
            return;
          }
          // ── fim Fase 3 ────────────────────────────────────────────────────────

          const fi = flix2Raw.item;
          // Capture Flix2 synopsis — used as fallback when TMDB overview is empty
          if (fi?.synopsis && !cancelled) setFlix2Synopsis(fi.synopsis);
          const flixItems: RegistryItem[] = [];

          // Only accept a movie-style stream_url when the current page IS a movie.
          // For series pages the lookup may return a VOD item (fi.stream_url + fi.type=filme)
          // that is a same-name movie — or a series item with a stream_url AND episodes.
          // In both cases we must fall through to the episodes path, not create a
          // spurious movie-level entry (which shows as "Dublado HD" on every series).
          const fiIsMovie = (fi?.type ?? "").toLowerCase() === "filme" || (fi?.type ?? "").toLowerCase() === "movie";
          if (fi?.stream_url && type === "movie") {
            flixItems.push({
              id: `flix2-auto-${tmdbId}`, r2Key: "", flix2Url: fi.stream_url,
              tmdbId, tmdbType: type, title: fi.title ?? "", label: fi.title ?? "",
              season: null, episode: null,
            });
          } else if (Array.isArray(fi?.episodes) && fi.episodes.length > 0) {
            for (const ep of fi.episodes as Array<{ season: number; episode: number; stream_url?: string }>) {
              if (!ep?.stream_url) continue;
              flixItems.push({
                id: `flix2-auto-${tmdbId}-s${ep.season}e${ep.episode}`, r2Key: "",
                flix2Url: ep.stream_url, tmdbId, tmdbType: type,
                title: fi.title ?? "",
                label: `T${String(ep.season).padStart(2, "0")} E${String(ep.episode).padStart(2, "0")} · Flix 2.0`,
                season: ep.season, episode: ep.episode,
              });
            }
          } else if ((fi?.id ?? fi?.series_id) && !fiIsMovie && (type === "tv" || resolvedType === "tv" || fi?.type === "serie" || fi?.type === "series")) {
            // fi.id is set when the item was mapped by mapXtreamSeries;
            // fi.series_id is set when it's a raw Xtream catalog item (lookup returns raw items).
            // Guard: !fiIsMovie prevents using a movie's ID as a series ID (e.g. "Tintin" movie
            // matched for the animated series page → episode fetch would return wrong content).
            const seriesIdForEp = fi?.id ?? fi?.series_id;
            try {
              const epData = await r2Route<{
                found: boolean;
                episodes: Array<{ season: number; episode: number; stream_url: string }>;
                tryClientDirect?: boolean;
                directUrl?: string;
                streamBase?: string;
              }>(`/flix2/series-episodes?seriesId=${seriesIdForEp}`);

              let episodeList = epData.found ? epData.episodes : [];

              // ── Client-side direct fallback ──────────────────────────────────
              // The server couldn't fetch episodes (datacenter IP blocked by Xtream
              // provider). Retry directly from the user's device — residential IPs
              // are usually not blocked.
              if (!epData.found && epData.tryClientDirect && epData.directUrl && epData.streamBase) {
                try {
                  const ctrl = new AbortController();
                  const tid = setTimeout(() => ctrl.abort(), 15000);
                  let directRes: Response | null = null;
                  try { directRes = await fetch(epData.directUrl, { signal: ctrl.signal }); }
                  finally { clearTimeout(tid); }
                  if (directRes?.ok) {
                    const directData = await directRes.json() as any;
                    if (directData?.episodes && typeof directData.episodes === "object") {
                      const clientEps: Array<{ season: number; episode: number; stream_url: string; title?: string }> = [];
                      for (const [seasonStr, eps] of Object.entries(directData.episodes as Record<string, any[]>)) {
                        if (!Array.isArray(eps)) continue;
                        const season = Number(seasonStr);
                        for (const ep of eps) {
                          if (!ep?.id) continue;
                          const ext = ep.container_extension ?? "mp4";
                          clientEps.push({
                            season,
                            episode: Number(ep.episode_num ?? ep.episode ?? 1),
                            stream_url: `${epData.streamBase}${ep.id}.${ext}`,
                            title: ep.title ?? ep.name ?? undefined,
                          });
                        }
                      }
                      clientEps.sort((a, b) => a.season - b.season || a.episode - b.episode);
                      if (clientEps.length > 0) episodeList = clientEps;
                    }
                  }
                } catch {}
              }

              for (const ep of episodeList) {
                if (!ep?.stream_url) continue;
                flixItems.push({
                  id: `flix2-auto-${tmdbId}-s${ep.season}e${ep.episode}`, r2Key: "",
                  flix2Url: ep.stream_url, tmdbId, tmdbType: type,
                  title: fi.title ?? "",
                  label: `T${String(ep.season).padStart(2, "0")} E${String(ep.episode).padStart(2, "0")} · Flix 2.0`,
                  season: ep.season, episode: ep.episode,
                });
              }
            } catch {}
          }

          if (!cancelled && flixItems.length > 0) {
            setR2Items((prev) => [...prev, ...flixItems]);
          }
        } catch {}
        finally { if (!cancelled) setFlix2Loading(false); }
      } catch {} finally {
        if (!cancelled) setR2Loading(false);
      }
    };
    loadR2();
    // Reset year-correction guard whenever we navigate to a new title
    flix2YearCorrectedRef.current = false;
    return () => { cancelled = true; };
  }, [tmdbId, type]);

  // ── Year-correction: after TMDB details load, re-run flix2 lookup with the
  // exact release year so same-name different-year titles (e.g. "O Rei Leão"
  // 1994 animated vs 2019 live-action) return the correct catalog entry.
  // Only runs once per title (ref guard) and only after the initial lookup finished.
  useEffect(() => {
    if (flix2YearCorrectedRef.current || flix2Loading || !details) return;
    const releaseDate = (details as any)?.release_date ?? (details as any)?.first_air_date ?? "";
    const detYear = parseInt(releaseDate.substring(0, 4)) || 0;
    if (!detYear) return;
    // Only run year-correction when flix2-auto items are present.
    // veo-auto items also have flix2Url but are already correct — don't overwrite them.
    const hasFlix2AutoItems = r2Items.some((i) => i.id.startsWith("flix2-auto-"));
    if (!hasFlix2AutoItems) return;

    flix2YearCorrectedRef.current = true;

    const correctYear = async () => {
      try {
        const flix2Type = type === "movie" ? "movies" : "all";
        const lookupTitle = cleanTitle(params.title ?? "").replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();

        // ── Ownership validation ────────────────────────────────────────────────
        // When a detail page has a known tmdbId (non-zero) and Flix2 items were
        // injected via title-match (catalog tmdb_id=0 for all items), the stream may
        // belong to a DIFFERENT film that shares the same title (e.g. classic vs remake).
        // Only check for recent films (<2000 votes) where title collision is likely.
        if (tmdbId > 0 && detYear >= 2020) {
          const myVoteCount: number = (details as any)?.vote_count ?? Infinity;
          if (myVoteCount < 2000) {
            try {
              const searchType = type === "movie" ? "movie" : "tv";
              const searchResp = await fetch(
                `${getApiBase()}/tmdb/search?q=${encodeURIComponent(lookupTitle)}&type=${searchType}`
              );
              if (searchResp.ok) {
                const searchData = await searchResp.json();
                const candidates = (searchData.results ?? []).filter(
                  (r: any) => r.media_type === searchType
                );
                const primaryHit = candidates.reduce((best: any, r: any) => {
                  if (!best) return r;
                  return (r.vote_count ?? 0) > (best.vote_count ?? 0) ? r : best;
                }, null as any);
                // If there's a more-established film (higher vote_count) with the same
                // title that ISN'T us, this stream belongs to that other film — remove it.
                if (
                  primaryHit &&
                  primaryHit.id !== tmdbId &&
                  (primaryHit.vote_count ?? 0) > myVoteCount
                ) {
                  // Remove wrongly-injected flix2 items for this film
                  setR2Items((prev) => prev.filter((i) => !i.id.startsWith("flix2-auto-")));

                  // Try Veo as fallback — it may have the correct stream for this newer film.
                  // Phase 3 was originally skipped because flix2 returned found:true (title match).
                  try {
                    const veoType = type === "movie" ? "movies" : "all";
                    const veoRaw = await r2Route<{ found: boolean; item: any; contentType: string }>(
                      `/veo/lookup?tmdbId=${tmdbId}&type=${veoType}&title=${encodeURIComponent(lookupTitle)}`
                    );
                    if (veoRaw.found && veoRaw.item) {
                      const vi = veoRaw.item;
                      const checkUrl: string | null =
                        vi?.stream_url ||
                        (Array.isArray(vi?.episodes) && vi.episodes.length > 0 ? vi.episodes[0]?.stream_url : null);
                      if (checkUrl) {
                        const cdnCheck = await r2Route<{ ok: boolean; cdnOk: boolean; cdnHost: string }>(
                          `/veo/stream-check?streamUrl=${encodeURIComponent(checkUrl)}`
                        );
                        if (cdnCheck.cdnOk) {
                          if (vi?.synopsis) setFlix2Synopsis(vi.synopsis);
                          const veoItems: RegistryItem[] = [];
                          if (vi?.stream_url) {
                            veoItems.push({
                              id: `veo-auto-${tmdbId}`, r2Key: "", flix2Url: vi.stream_url,
                              tmdbId, tmdbType: type, title: vi.title ?? "",
                              label: `${vi.title ?? ""} · Veo`,
                              season: null, episode: null,
                            });
                          } else if (Array.isArray(vi?.episodes) && vi.episodes.length > 0) {
                            for (const ep of vi.episodes as Array<{ season: number; episode: number; stream_url?: string }>) {
                              if (!ep?.stream_url) continue;
                              veoItems.push({
                                id: `veo-auto-${tmdbId}-s${ep.season}e${ep.episode}`, r2Key: "",
                                flix2Url: ep.stream_url, tmdbId, tmdbType: type,
                                title: vi.title ?? "",
                                label: `T${String(ep.season).padStart(2,"0")} E${String(ep.episode).padStart(2,"0")} · Veo`,
                                season: ep.season, episode: ep.episode,
                              });
                            }
                          }
                          if (veoItems.length > 0) {
                            setR2Items((prev) => [...prev.filter((i) => !i.id.startsWith("veo-auto-")), ...veoItems]);
                          }
                        }
                      }
                    }
                  } catch {}
                  return;
                }
              }
            } catch {}
          }
        }
        // ── End ownership validation ────────────────────────────────────────────

        const corrected = await r2Route<{ found: boolean; item: any }>(
          `/flix2/lookup?tmdbId=${tmdbId}&type=${flix2Type}&title=${encodeURIComponent(lookupTitle)}&year=${detYear}`
        );
        if (!corrected.found || !corrected.item) return;
        const fi = corrected.item;
        if (fi.synopsis) setFlix2Synopsis(fi.synopsis);

        // Build the corrected items list
        const flixItems: RegistryItem[] = [];
        const fiIsMovieYC = (fi?.type ?? "").toLowerCase() === "filme" || (fi?.type ?? "").toLowerCase() === "movie";
        if (fi?.stream_url && type === "movie") {
          flixItems.push({
            id: `flix2-auto-${tmdbId}`, r2Key: "", flix2Url: fi.stream_url,
            tmdbId, tmdbType: type, title: fi.title ?? "", label: fi.title ?? "",
            season: null, episode: null,
          });
        } else if ((fi?.id ?? fi?.series_id) && !fiIsMovieYC && (type === "tv" || fi?.type === "serie" || fi?.type === "series")) {
          const seriesIdForEp = fi?.id ?? fi?.series_id;
          const epData = await r2Route<{
            found: boolean;
            episodes: Array<{ season: number; episode: number; stream_url: string }>;
          }>(`/flix2/series-episodes?seriesId=${seriesIdForEp}`).catch(() => ({ found: false, episodes: [] }));
          for (const ep of (epData.found ? epData.episodes : [])) {
            if (!ep?.stream_url) continue;
            flixItems.push({
              id: `flix2-auto-${tmdbId}-s${ep.season}e${ep.episode}`, r2Key: "",
              flix2Url: ep.stream_url, tmdbId, tmdbType: type,
              title: fi.title ?? "",
              label: `T${String(ep.season).padStart(2, "0")} E${String(ep.episode).padStart(2, "0")} · Flix 2.0`,
              season: ep.season, episode: ep.episode,
            });
          }
        }

        if (flixItems.length > 0) {
          // Replace old flix2-auto items with the year-corrected ones
          setR2Items((prev) => [
            ...prev.filter((i) => !i.id.startsWith("flix2-auto-")),
            ...flixItems,
          ]);
        }
      } catch {}
    };
    correctYear();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details, flix2Loading]);

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

  // ── Resolve Xtream "get_series_info" placeholder URLs ─────────────────────
  // When an admin registers a series using a player_api.php?action=get_series_info&series_id=X
  // URL as flix2Url, the player would receive an API query URL instead of a stream URL.
  // Detect these, extract the series_id, fetch real per-episode stream URLs, and replace
  // the placeholder items with actual per-episode RegistryItems.
  useEffect(() => {
    if (type !== "tv") return;
    const placeholders = r2Items.filter(
      (i) => i.flix2Url && i.flix2Url.includes("action=get_series_info") && i.episode == null
    );
    if (placeholders.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const { r2Route } = await import("@/lib/r2-direct");
        for (const placeholder of placeholders) {
          if (cancelled) break;
          // Extract series_id from the URL
          const urlObj = new URL(placeholder.flix2Url!);
          const seriesId = urlObj.searchParams.get("series_id");
          if (!seriesId) continue;

          const epData = await r2Route<{
            found: boolean;
            episodes: Array<{ season: number; episode: number; stream_url: string }>;
          }>(`/flix2/series-episodes?seriesId=${seriesId}`).catch(() => ({ found: false, episodes: [] }));

          if (!epData.found || epData.episodes.length === 0) continue;
          const newItems: RegistryItem[] = epData.episodes
            .filter((ep) => !!ep.stream_url)
            .map((ep) => ({
              id: `flix2-resolved-${placeholder.id}-s${ep.season}e${ep.episode}`,
              r2Key: "",
              flix2Url: ep.stream_url,
              tmdbId: placeholder.tmdbId,
              tmdbType: placeholder.tmdbType,
              title: placeholder.title,
              label: `T${String(ep.season).padStart(2, "0")} E${String(ep.episode).padStart(2, "0")} · Flix 2.0`,
              season: ep.season,
              episode: ep.episode,
            }));

          if (!cancelled && newItems.length > 0) {
            setR2Items((prev) => [
              ...prev.filter((i) => i.id !== placeholder.id),
              ...newItems,
            ]);
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r2Items.map((i) => i.id).join(","), type]);

  // Extend seasons list when Flix2 loads episodes for seasons beyond what TMDB reported.
  // e.g. TMDB says 2 seasons but Flix2 has T13 episodes → add T3…T13 tabs automatically.
  useEffect(() => {
    if (type !== "tv") return;
    const flix2EpItems = r2Items.filter(
      (i) => i.flix2Url && i.episode != null && i.season != null && Number(i.season) > 0
    );
    if (flix2EpItems.length === 0) return;
    const maxFlix2Season = Math.max(...flix2EpItems.map((i) => Number(i.season)));
    setSeasons((prev) => {
      const currentMax = prev.length > 0 ? Math.max(...prev.map((s) => s.season_number)) : 0;
      if (maxFlix2Season <= currentMax) return prev;
      const extra: TmdbSeason[] = [];
      for (let s = currentMax + 1; s <= maxFlix2Season; s++) {
        extra.push({
          id: s,
          season_number: s,
          name: `Temporada ${s}`,
          overview: "",
          episode_count: 0,
          poster_path: null,
          air_date: "",
        });
      }
      return [...prev, ...extra];
    });
  }, [r2Items, type]);

  // Search Drive for matching content by title
  useEffect(() => {
    const titleStr = params.title ? String(params.title) : "";
    if (!titleStr) return;
    searchDriveByTitle(titleStr).then(setDriveMatches).catch(() => {});
  }, [params.title]);

  // Load drive episodes for the selected season whenever the series match or season changes.
  // Supports two folder layouts:
  //   a) Season subfolders: "Temporada 1/", "S2/" etc. — handled by getDriveSeasonEpisodes.
  //   b) Flat sequential folder: all episodes numbered 1-N in one folder, split across seasons.
  //      Detected when fetched items have no season info (parseEpisodeInfo returns season=undefined).
  //      In this case we divide by the total number of seasons (from TMDB) and slice by offset.
  useEffect(() => {
    if (type !== "tv") return;
    const match = driveMatches.find((m) => m.isFolder);
    if (!match) {
      setDriveEpisodeMap({});
      setDriveSeasonItems([]);
      return;
    }
    const numSeas = seasons.filter((s) => s.season_number > 0).length;

    getDriveSeasonEpisodes(match.drive, match.path, selectedSeason)
      .then(async (items) => {
        // Detect flat-folder mode: items have no season tag OR season > 1 is empty
        const hasNoSeasonTag = items.some((v) => parseEpisodeInfo(v.name).season === undefined);
        const isFlatFolder =
          (hasNoSeasonTag && numSeas > 1) ||
          (items.length === 0 && selectedSeason > 1 && numSeas > 1);

        let seasonItems = items;
        let episodeOffset = 0;

        if (isFlatFolder) {
          // For flat folders, season 1 call returns ALL items → use that as the full list.
          const allItems =
            selectedSeason === 1
              ? items
              : await getDriveSeasonEpisodes(match.drive, match.path, 1);

          const allSorted = allItems
            .map((v) => ({ item: v, ep: parseEpisodeInfo(v.name).episode ?? 0 }))
            .filter((x) => x.ep > 0)
            .sort((a, b) => a.ep - b.ep);

          if (allSorted.length > 0 && numSeas > 0) {
            // Prefer real TMDB episode_count per season (now populated from API).
            // Cumulative offset = sum of episode_count for all seasons before this one.
            const tmdbCounts = seasons
              .filter((s) => s.season_number > 0)
              .sort((a, b) => a.season_number - b.season_number);
            const allHaveCounts = tmdbCounts.length > 0 && tmdbCounts.every((s) => (s.episode_count ?? 0) > 0);

            let start: number;
            let end: number;

            if (allHaveCounts) {
              // Precise offset: sum of episode_count for seasons before selectedSeason
              start = tmdbCounts
                .filter((s) => s.season_number < selectedSeason)
                .reduce((sum, s) => sum + (s.episode_count ?? 0), 0);
              const thisCount = tmdbCounts.find((s) => s.season_number === selectedSeason)?.episode_count ?? 0;
              end = Math.min(start + thisCount, allSorted.length);
            } else {
              // Fallback: equal split when TMDB counts aren't available
              const perSeason = Math.ceil(allSorted.length / numSeas);
              start = (selectedSeason - 1) * perSeason;
              end = Math.min(start + perSeason, allSorted.length);
            }

            seasonItems = allSorted.slice(start, end).map((x) => x.item);
            episodeOffset = start; // sequential ep# minus offset = within-season ep#
          }
        }

        setDriveSeasonItems(seasonItems);
        const map: Record<number, DriveItem> = {};
        for (let idx = 0; idx < seasonItems.length; idx++) {
          const item = seasonItems[idx];
          const info = parseEpisodeInfo(item.name);
          if (info.episode !== undefined) {
            // Flat folder: remap from global sequential ep# to within-season ep#
            const epNum = episodeOffset > 0 ? info.episode - episodeOffset : info.episode;
            if (epNum > 0) map[epNum] = item;
          } else {
            // No ep info in filename → use position within season (1-based)
            map[idx + 1] = item;
          }
        }
        setDriveEpisodeMap(map);
      })
      .catch(() => {
        setDriveEpisodeMap({});
        setDriveSeasonItems([]);
      });
  }, [type, driveMatches, selectedSeason, seasons]);

  useEffect(() => {
    if (!userId || !tmdbId || !isSupabaseConfigured) return;
    db.watchlist.isAdded(userId, tmdbId, type).then(setInList);
    db.ratings.get(userId, tmdbId, type).then((r) => setLiked(r?.liked));
    if (type === "tv") {
      db.progress.getForShow(userId, tmdbId, "tv").then(setWatchProgress);
    }
  }, [userId, tmdbId, type]);

  // Load local AsyncStorage progress every time this screen gains focus.
  // Strategy: try "${type}_${tmdbId}" first (normal case). If not found (or tmdbId=0),
  // fall back to params.flix2Id which carries the raw contentId when navigating
  // from the Continue Watching row (goTo sends flix2Id = item.id = e.contentId).
  useFocusEffect(
    useCallback(() => {
      const isValidEntry = (e: WatchEntry | null): e is WatchEntry =>
        !!e && e.progress > 0.02 && e.progress < 0.95;

      const primaryId = tmdbId ? `${type}_${tmdbId}` : null;
      // flix2Id holds e.contentId (e.g. "tv_100240") when coming from Continue Watching
      const fallbackId = (() => {
        const f = String(params.flix2Id ?? "");
        return f && f !== "undefined" && f.includes("_") ? f : null;
      })();

      if (!primaryId && !fallbackId) {
        setLocalProgress(null);
        return;
      }

      (async () => {
        if (primaryId) {
          const entry = await getLocalProgress(primaryId);
          if (isValidEntry(entry)) { setLocalProgress(entry); return; }
        }
        // Primary not found (or tmdbId=0) — try fallback contentId
        if (fallbackId && fallbackId !== primaryId) {
          const entry = await getLocalProgress(fallbackId);
          if (isValidEntry(entry)) { setLocalProgress(entry); return; }
        }
        setLocalProgress(null);
      })();
    }, [type, tmdbId, params.flix2Id])
  );

  // Load content override (applies to ALL users; only admins can edit it)
  // Falls back to title-based key so overrides saved without a TMDB ID are still
  // found when the user navigates from a screen that passes a real tmdbId.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const applyOverride = (ov: ContentOverride | null) => {
      setContentOverride(ov);
      if (ov?.tmdb_id && ov.tmdb_id !== resolvedTmdbId) setResolvedTmdbId(ov.tmdb_id);
      if (ov?.tmdb_type && (ov.tmdb_type === "movie" || ov.tmdb_type === "tv") && ov.tmdb_type !== resolvedType) {
        setResolvedType(ov.tmdb_type as "movie" | "tv");
      }
    };
    if (!contentKey) return;
    db.contentOverrides.get(contentKey).then(async (ov) => {
      // If nothing found under the tmdbId-based key, try the title-based fallback
      // (handles overrides saved when the TMDB ID was not yet known)
      if (!ov && contentKey !== normalizedTitleKey && normalizedTitleKey.length > 7) {
        const byTitle = await db.contentOverrides.get(normalizedTitleKey).catch(() => null);
        applyOverride(byTitle);
      } else {
        applyOverride(ov);
      }
    }).catch(() => {});
  }, [contentKey, normalizedTitleKey]);

  // When override has a tmdb_id, fetch poster+backdrop via server proxy.
  useEffect(() => {
    const id = contentOverride?.tmdb_id;
    if (!id) { setOverridePoster(null); setOverrideBackdrop(null); return; }
    const mediaType: string = contentOverride?.tmdb_type ?? (type === "movie" ? "movie" : "tv");
    fetch(`${getApiBase()}/tmdb/${mediaType}/${id}/lang/pt-BR`)
      .then((r) => r.json())
      .then((d) => {
        setOverridePoster(d?.poster_path ?? null);
        setOverrideBackdrop(d?.backdrop_path ?? null);
      })
      .catch(() => {});
  }, [contentOverride?.tmdb_id, contentOverride?.tmdb_type, type]);

  useEffect(() => {
    if (!tmdbId) return;
    downloadsManager.isDownloaded(type, tmdbId).then(setIsDownloaded);
    isWatchingCatalog(tmdbId, type).then(setWatchingCatalog);
  }, [tmdbId, type]);

  // Load details
  useEffect(() => {
    if (!tmdbId) {
      // tmdbId=0 — try to find metadata via TMDB search by title (Flix2-only items)
      // Strip annotations like [L], [HD], (2026) before searching so TMDB can find the show
      const titleQ = cleanTitle((params.title ?? "").trim());
      if (!titleQ) { setLoading(false); return; }
      setLoading(true);
      setLogoUrl(null);
      const mediaType = type === "movie" ? "movie" : "tv";
      fetch(
        `${getApiBase()}/tmdb/search?q=${encodeURIComponent(titleQ)}&type=multi`
      )
        .then((r) => r.json())
        .then(async (data) => {
          const results: any[] = data.results ?? [];

          // Pick best TMDB match:
          // 1. Prefer results that match the expected media_type
          // 2. Among same-title exact matches, prefer highest vote_count —
          //    IPTV catalogs serve established/classic content that has accumulated
          //    more ratings over time vs newly-released films with the same name.
          const normQ = titleQ.toLowerCase().trim();
          const typeMatches = results.filter((r: any) => r.media_type === mediaType);
          const pool = typeMatches.length > 0 ? typeMatches : results;

          const exactPool = pool.filter((r: any) =>
            (r.title ?? r.name ?? "").toLowerCase().trim() === normQ
          );
          const candidatePool = exactPool.length > 0 ? exactPool : pool;

          const hit = candidatePool.reduce((best: any, r: any) => {
            if (!best) return r;
            // Among candidates, prefer the one with most community ratings (vote_count).
            // This consistently picks classic/established films over same-titled new releases.
            return (r.vote_count ?? 0) > (best.vote_count ?? 0) ? r : best;
          }, null as any) ?? pool[0];
          if (!hit?.id) return;
          const hitType: "movie" | "tv" =
            hit.media_type === "movie" ? "movie" : "tv";
          try {
            const [det, sim] = await Promise.all([
              hitType === "movie"
                ? tmdbApi.tmdb.movie(hit.id)
                : tmdbApi.tmdb.tv(hit.id),
              hitType === "movie"
                ? tmdbApi.tmdb.movieSimilar(hit.id)
                : tmdbApi.tmdb.tvSimilar(hit.id),
            ]);
            setDetails(det);
            const simItems0 = sim.map(tmdbItemToContent);
            setSimilar(simItems0);
            filterSimByAvailability(simItems0).then((f) => setSimilar(f)).catch(() => {});
            // Propagate the resolved TMDB ID so episodes/seasons effects can run
            setResolvedTmdbId(hit.id);
            setResolvedType(hitType);
            // Build seasons list for TV shows
            if (hitType === "tv") {
              const numSeasons = (det as any).number_of_seasons ?? 1;
              const tmdbSeasons: any[] = (det as any).seasons ?? [];
              setSeasons(Array.from({ length: numSeasons }, (_, i) => {
                const tmdbS = tmdbSeasons.find((s: any) => s.season_number === i + 1);
                return {
                  id: i + 1,
                  season_number: i + 1,
                  name: tmdbS?.name ?? `Temporada ${i + 1}`,
                  overview: tmdbS?.overview ?? "",
                  episode_count: tmdbS?.episode_count ?? 0,
                  poster_path: tmdbS?.poster_path ?? null,
                  air_date: tmdbS?.air_date ?? "",
                };
              }));
            }
            // Also grab logo + trailer with found id (via server proxy)
            fetch(`${getApiBase()}/tmdb/${hitType}/${hit.id}/images`)
              .then((r) => r.json())
              .then((img) => {
                const logos: any[] = img.logos ?? [];
                const best =
                  logos.find((l) => l.iso_639_1 === "en") ??
                  logos.find((l) => l.iso_639_1 === "pt") ??
                  logos[0] ??
                  null;
                if (best?.file_path)
                  setLogoUrl(`https://image.tmdb.org/t/p/w500${best.file_path}`);
              })
              .catch(() => {});
            // Extract trailer from det.videos (already included via append_to_response)
            const detVids: any[] = (det as any).videos?.results ?? [];
            const detTrailer =
              detVids.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ??
              detVids.find((v) => v.site === "YouTube" && v.type === "Trailer") ??
              detVids.find((v) => v.site === "YouTube" && v.type === "Teaser") ??
              detVids.find((v) => v.site === "YouTube");
            if (detTrailer?.key) setTrailerKey(detTrailer.key);
            // Fallback: fetch videos separately if det had none
            if (!detTrailer) {
              fetch(`${getApiBase()}/tmdb/${hitType}/${hit.id}/videos`)
                .then((r) => r.json())
                .then((vd) => {
                  const vids: any[] = vd.results ?? [];
                  const trailer =
                    vids.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ??
                    vids.find((v) => v.site === "YouTube" && v.type === "Trailer") ??
                    vids.find((v) => v.site === "YouTube" && v.type === "Teaser") ??
                    vids.find((v) => v.site === "YouTube");
                  if (trailer?.key) setTrailerKey(trailer.key);
                })
                .catch(() => {});
            }
          } catch (e) {
            console.warn("[detail] TMDB title search fallback error:", e);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }
    // On web, expo-router unmounts this screen on router.push (e.g. to flix2-player).
    // On router.back() the component re-mounts and all effects run again, causing a
    // full reload. The module-level cache avoids this: if we have fresh data for this
    // content, apply it immediately without showing the loading spinner.
    const cacheKey = `${type}_${tmdbId}`;
    const cachedEntry = _detailsCache.get(cacheKey);
    if (cachedEntry && Date.now() - cachedEntry.ts < DETAILS_CACHE_TTL) {
      setDetails(cachedEntry.details);
      setSimilar(cachedEntry.similar);
      filterSimByAvailability(cachedEntry.similar).then((f) => setSimilar(f)).catch(() => {});
      setSeasons(cachedEntry.seasons);
      setProviders(cachedEntry.providers);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLogoUrl(null);
    const fetchAll = async () => {
      try {
        // Fetch logos via server proxy (no TMDB key in mobile)
        const imagesPromise = fetch(`${getApiBase()}/tmdb/${type}/${tmdbId}/images`)
          .then((r) => r.json())
          .then((data) => {
            const logos: any[] = data.logos ?? [];
            const en = logos.find((l) => l.iso_639_1 === "en");
            const pt = logos.find((l) => l.iso_639_1 === "pt");
            const best = en ?? pt ?? logos[0] ?? null;
            if (best?.file_path) setLogoUrl(`https://image.tmdb.org/t/p/w500${best.file_path}`);
          })
          .catch(() => {});

        // Helper: pick best YouTube trailer from a videos result array
        const pickTrailer = (vids: any[]): any =>
          vids.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ??
          vids.find((v) => v.site === "YouTube" && v.type === "Trailer") ??
          vids.find((v) => v.site === "YouTube" && v.type === "Teaser") ??
          vids.find((v) => v.site === "YouTube") ??
          null;

        if (type === "movie") {
          const [det, sim, prov] = await Promise.all([
            tmdbApi.tmdb.movie(tmdbId),
            tmdbApi.tmdb.movieSimilar(tmdbId),
            tmdbApi.tmdb.providers("movie", tmdbId),
          ]);
          // Extract trailer from det.videos (server already appends it via append_to_response)
          const trailer = pickTrailer((det as any).videos?.results ?? []);
          if (trailer?.key) setTrailerKey(trailer.key);
          // Fallback: fetch separately if det had no videos
          if (!trailer) {
            fetch(`${getApiBase()}/tmdb/movie/${tmdbId}/videos`)
              .then((r) => r.json())
              .then((vd) => { const t = pickTrailer(vd.results ?? []); if (t?.key) setTrailerKey(t.key); })
              .catch(() => {});
          }
          let detWithOverview = det;
          if (!det.overview) {
            try {
              const enRes = await fetch(`${getApiBase()}/tmdb/movie/${tmdbId}/lang/en-US`);
              if (enRes.ok) {
                const enDet = await enRes.json();
                if (enDet.overview) detWithOverview = { ...det, overview: enDet.overview };
              }
            } catch {}
          }
          setDetails(detWithOverview);
          const simItemsM = sim.map(tmdbItemToContent);
          setSimilar(simItemsM);
          filterSimByAvailability(simItemsM).then((f) => setSimilar(f)).catch(() => {});
          setProviders(prov?.flatrate ?? []);
          _detailsCache.set(cacheKey, { details: detWithOverview, similar: simItemsM, seasons: [], providers: prov?.flatrate ?? [], ts: Date.now() });
          const colId = (det as any)?.belongs_to_collection?.id;
          if (colId) {
            setLoadingCollection(true);
            fetch(`${getApiBase()}/tmdb/collection/${colId}`)
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
          ]);
          // Extract trailer from det.videos (server already appends it via append_to_response)
          const trailer = pickTrailer((det as any).videos?.results ?? []);
          if (trailer?.key) setTrailerKey(trailer.key);
          if (!trailer) {
            fetch(`${getApiBase()}/tmdb/tv/${tmdbId}/videos`)
              .then((r) => r.json())
              .then((vd) => { const t = pickTrailer(vd.results ?? []); if (t?.key) setTrailerKey(t.key); })
              .catch(() => {});
          }
          // If pt-BR overview is empty, fetch en-US via server proxy
          let detWithOverview = det;
          if (!det.overview) {
            try {
              const enRes = await fetch(`${getApiBase()}/tmdb/tv/${tmdbId}/lang/en-US`);
              if (enRes.ok) {
                const enDet = await enRes.json();
                if (enDet.overview) detWithOverview = { ...det, overview: enDet.overview };
              }
            } catch {}
          }
          setDetails(detWithOverview);
          const simItemsTV = sim.map(tmdbItemToContent);
          setSimilar(simItemsTV);
          filterSimByAvailability(simItemsTV).then((f) => setSimilar(f)).catch(() => {});
          setProviders(prov?.flatrate ?? []);
          const numSeasons = (det as any).number_of_seasons ?? 1;
          const tmdbSeasons: any[] = (det as any).seasons ?? [];
          const seasonList: TmdbSeason[] = Array.from({ length: numSeasons }, (_, i) => {
            const tmdbS = tmdbSeasons.find((s: any) => s.season_number === i + 1);
            return {
              id: i + 1,
              season_number: i + 1,
              name: tmdbS?.name ?? `Temporada ${i + 1}`,
              overview: tmdbS?.overview ?? "",
              episode_count: tmdbS?.episode_count ?? 0,
              poster_path: tmdbS?.poster_path ?? null,
              air_date: tmdbS?.air_date ?? "",
            };
          });
          setSeasons(seasonList);
          _detailsCache.set(cacheKey, { details: detWithOverview, similar: simItemsTV, seasons: seasonList, providers: prov?.flatrate ?? [], ts: Date.now() });
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

  useEffect(() => {
    if (resolvedType !== "tv" || !resolvedTmdbId) return;
    db.newEpisodes.get(resolvedTmdbId).then((ep) => {
      if (ep) {
        const now = new Date();
        const expires = new Date(ep.expires_at);
        if (expires > now) setNewEpisodeInfo(ep);
      }
    }).catch(() => {});
  }, [resolvedTmdbId, resolvedType]);

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
    if (resolvedType !== "tv" || !resolvedTmdbId) return;
    setLoadingEpisodes(true);

    const loadEps = async () => {
      try {
        // Always fetch both locales in parallel — en-US needed for still_path + real names
        // tvSeason is wrapped in .catch so a server error does NOT reject the whole Promise.all
        // (en-US server proxy acts as final fallback in that case)
        const [ptData, enRes] = await Promise.all([
          tmdbApi.tmdb.tvSeason(resolvedTmdbId, selectedSeason).catch(() => ({ episodes: [] } as any)),
          fetch(
            `${getApiBase()}/tmdb/tv/${resolvedTmdbId}/season/${selectedSeason}/lang/en-US`
          ).catch(() => null),
        ]);

        // ── 0. Prefer pt-BR; fall back to en-US when server lacks TMDB key ─────
        let enEps: any[] = [];
        if (enRes?.ok) {
          try { enEps = (await enRes.json()).episodes ?? []; } catch {}
        }

        let episodes: TmdbEpisode[] = ptData.episodes ?? [];
        // If the server-side TMDB route failed (no API key configured),
        // use the en-US episodes (fetched directly with the hardcoded key) as base.
        if (episodes.length === 0 && enEps.length > 0) {
          episodes = enEps as TmdbEpisode[];
        }

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

        const GENERIC = /^Episódio\s*\d+$/i;
        const isGenericName = (n?: string) => !n || GENERIC.test(n);
        // needsNameTranslation: either it's a placeholder "Episódio N" OR
        // TMDB returned the same string in pt-BR and en-US (= no real translation exists)
        const needsNameTranslation = (ptName: string | undefined, enName: string | undefined) =>
          isGenericName(ptName) || (!!enName && !!ptName && ptName === enName);

        let merged = episodes.map((ep) => {
          const enEp = enEps.find((e: any) => e.episode_number === ep.episode_number);
          const shouldTranslateName = needsNameTranslation(ep.name, enEp?.name);
          return {
            ...ep,
            // still_path: prefer pt-BR; fallback to en-US (pt-BR often has null)
            still_path: ep.still_path ?? enEp?.still_path ?? null,
            // name: if no real PT-BR translation, use EN name and flag for auto-translation
            _enName: shouldTranslateName && enEp?.name ? enEp.name : null,
            _enOverview: !ep.overview && enEp?.overview ? enEp.overview : null,
            name: shouldTranslateName && enEp?.name ? enEp.name : ep.name,
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
          merged = await Promise.all(translateQueue);
        } else {
          merged = merged.map(({ _enName, _enOverview, ...ep }) => ep) as typeof merged;
        }

        // ── 5. Batch-fetch episode stills for episodes that still have null still_path ──
        // TMDB pt-BR often returns null still_path for older seasons of Brazilian shows.
        // Fetch /tv/{id}/season/{s}/episode/{e}/images for each missing ep in parallel,
        // then merge the best-rated still into the episode before updating state once.
        const needsStills = merged.filter((ep: any) => !ep.still_path);
        if (needsStills.length > 0 && needsStills.length <= 30 && resolvedTmdbId) {
          const stillResults = await Promise.allSettled(
            needsStills.map((ep: any) =>
              fetch(
                `${getApiBase()}/tmdb/tv/${resolvedTmdbId}/season/${selectedSeason}/episode/${ep.episode_number}/images`
              )
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null)
            )
          );
          const stillsMap: Record<number, string> = {};
          needsStills.forEach((ep: any, idx: number) => {
            const res = stillResults[idx];
            if (res.status === "fulfilled" && res.value) {
              const stills: any[] = res.value.stills ?? [];
              const best = stills.sort((a: any, b: any) => b.vote_average - a.vote_average)[0];
              if (best?.file_path) stillsMap[ep.episode_number] = best.file_path;
            }
          });
          if (Object.keys(stillsMap).length > 0) {
            merged = merged.map((ep: any) =>
              ep.still_path || !stillsMap[ep.episode_number]
                ? ep
                : { ...ep, still_path: stillsMap[ep.episode_number] }
            );
          }
        }

        setEpisodeList(merged as TmdbEpisode[]);
      } catch {
        setEpisodeList([]);
      } finally {
        setLoadingEpisodes(false);
      }
    };

    loadEps();
  }, [resolvedTmdbId, resolvedType, selectedSeason]);

  // Extend episode list when Flix2 has more episodes than TMDB reported for this season.
  // e.g. TMDB says 5 eps for T1 but Flix2 has 17 → adds synthetic eps 6-17 automatically.
  // Uses functional setEpisodeList so it always sees the latest TMDB-loaded episodes.
  useEffect(() => {
    if (resolvedType !== "tv") return;
    const flix2EpsForSeason = r2Items.filter(
      (i) => i.flix2Url && Number(i.season) === selectedSeason && i.episode != null
    );
    if (flix2EpsForSeason.length === 0) return;
    setEpisodeList((prev) => {
      const existingNums = new Set(prev.map((ep) => ep.episode_number));
      const toAdd: TmdbEpisode[] = [];
      for (const fi of flix2EpsForSeason) {
        const epNum = Number(fi.episode);
        if (!existingNums.has(epNum)) {
          toAdd.push({
            id: -(selectedSeason * 10000 + epNum), // synthetic negative ID to avoid TMDB clash
            episode_number: epNum,
            season_number: selectedSeason,
            name: `Episódio ${epNum}`,
            overview: "",
            still_path: null,
            air_date: "",
            runtime: null,
            vote_average: 0,
          });
        }
      }
      if (toAdd.length === 0) return prev;
      toAdd.sort((a, b) => a.episode_number - b.episode_number);
      return [...prev, ...toAdd];
    });
  }, [r2Items, selectedSeason, resolvedType]);

  // Declaradas cedo pois são usadas em toggleList, handleShare e callbacks abaixo
  const effectivePosterPath = details?.poster_path ?? contentOverride?.poster_path ?? overridePoster ?? null;
  const effectiveBackdropPath = details?.backdrop_path ?? contentOverride?.backdrop_path ?? overrideBackdrop ?? null;

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
        poster_path: TMDB_IMG(effectivePosterPath, "w500") ?? "",
        backdrop_path: TMDB_IMG(effectiveBackdropPath, "w1280") ?? undefined,
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
      let streamUrl: string | undefined;
      if (Platform.OS !== "web") {
        try {
          const r2Item = r2Items.find((i) => !isDriveItem(i) && !isFlixItem(i) && i.r2Key);
          if (r2Item?.r2Key) {
            const { apiSignedUrl } = await import("@/lib/r2-direct");
            const signed = await apiSignedUrl(r2Item.r2Key, 86400);
            streamUrl = signed.url;
          }
        } catch {}
      }
      const result = await downloadsManager.download({
        tmdb_id: tmdbId,
        type,
        title: details?.title ?? details?.name ?? "",
        poster_path: TMDB_IMG(effectivePosterPath, "w500") ?? "",
        backdrop_path: TMDB_IMG(effectiveBackdropPath, "w1280") ?? "",
        streamUrl,
      });
      if (result.error) {
        Alert.alert("Erro", result.error);
        return;
      }
      setIsDownloaded(true);
      Alert.alert(
        "Download concluído!",
        streamUrl
          ? `"${details?.title ?? details?.name}" foi baixado e está disponível offline por 20 dias.`
          : `"${details?.title ?? details?.name}" está disponível offline por 20 dias.`,
        [{ text: "OK" }]
      );
    } catch {
      Alert.alert("Erro", "Não foi possível realizar o download. Tente novamente.");
    } finally {
      setDownloading(false);
    }
  };

  const handleReport = async () => {
    if (!reportReason) return;
    setReportBusy(true);
    const reasonLabels: Record<ContentReport["reason"], string> = {
      wrong_content: "Conteúdo incorreto (vídeo errado)",
      not_working: "Não está funcionando",
      wrong_audio_sub: "Áudio/legenda errado",
      other: "Outro problema",
    };
    try {
      if (userId && details) {
        await db.contentReports.add({
          user_id: userId,
          tmdb_id: tmdbId,
          type,
          title: details.title ?? details.name ?? params.title ?? "",
          poster_path: effectivePosterPath ?? undefined,
          reason: reportReason,
          reason_label: reasonLabels[reportReason],
        });
      }
    } catch {
      // silently ignore DB errors — still show confirmation to user
    } finally {
      setReportBusy(false);
      setReportDone(true);
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
        poster_path: effectivePosterPath ?? undefined,
      });
    }
    Alert.alert(
      "Conteúdo indicado! 🎬",
      "Obrigado pela indicação! Assim que for adicionado ao catálogo você receberá uma notificação.",
      [{ text: "OK" }]
    );
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
        posterPath: effectivePosterPath ?? "",
        backdropPath: effectiveBackdropPath ?? "",
      },
    });
  };

  const convertFlix2Link = async (linkId: string, url: string) => {
    setConvertingLinkId(linkId);
    const FLIX2_HDRS = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Referer": "https://nixplay.lat/",
      "Origin": "https://nixplay.lat",
    };
    let resolved = url;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(url, { method: "HEAD", headers: FLIX2_HDRS, redirect: "manual", signal: ctrl.signal });
      clearTimeout(t);
      const loc = resp.headers.get("location") ?? resp.headers.get("Location");
      if (loc && loc !== url) resolved = loc;
    } catch {}
    if (resolved === url) {
      try {
        const ctrl2 = new AbortController();
        const t2 = setTimeout(() => ctrl2.abort(), 8000);
        const resp2 = await fetch(url, { method: "GET", headers: { ...FLIX2_HDRS, Range: "bytes=0-0" }, signal: ctrl2.signal });
        clearTimeout(t2);
        if (resp2.url && resp2.url !== url) resolved = resp2.url;
      } catch {}
    }
    setConvertingLinkId(null);
    if (resolved !== url) {
      setConvertedLinks(prev => ({ ...prev, [linkId]: resolved }));
    } else {
      Alert.alert("Converter Link", "Não foi possível resolver este link. Use o Link Tester para testar estratégias alternativas.");
    }
  };

  const fixMismatchedIds = async () => {
    if (!adminDiagnostic || adminDiagnostic.ids.length === 0) return;
    setFixingIds(true);
    setFixDone(null);
    try {
      const { r2Route } = await import("@/lib/r2-direct");
      const res = await r2Route<{ ok: boolean; updated: number }>("/registry/remap-tmdb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromIds: adminDiagnostic.ids, toId: tmdbId, toType: type }),
      });
      setFixDone(res.updated);
      setAdminDiagnostic(null);
      // Recarrega os itens do registro para refletir a correção
      const { apiGetRegistry } = await import("@/lib/r2-direct");
      const data = await apiGetRegistry();
      const allItems: RegistryItem[] = data.items ?? [];
      const updated = allItems.filter(
        (i: RegistryItem) => i.tmdbId === tmdbId && i.tmdbType === type
      );
      setR2Items(updated);
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Falha ao corrigir IDs");
    } finally {
      setFixingIds(false);
    }
  };

  // ─── Admin content-override handlers ───────────────────────────────────────

  const openEditModal = () => {
    const existingId = contentOverride?.tmdb_id?.toString() ?? (tmdbId ? String(tmdbId) : "");
    const mediaType: "movie" | "tv" = contentOverride?.tmdb_type === "movie" ? "movie" : (type === "movie" ? "movie" : "tv");
    setEditTmdbId(existingId);
    setEditTitle(contentOverride?.custom_title ?? "");
    setEditOverview(contentOverride?.custom_overview ?? "");
    setEditOverviewMode(contentOverride?.overview_mode ?? "auto");
    setAutoOverview(details?.overview ?? "");
    setEditErr(null);
    setEditSearchQuery("");
    setEditSearchResults([]);
    setEditSelectedResult(null);
    setEditSearchType(mediaType);
    setEditPosterPath(contentOverride?.poster_path ?? null);
    setEditBackdropPath(contentOverride?.backdrop_path ?? null);
    setEditSeasons(contentOverride?.number_of_seasons ?? null);
    setEditEpisodes(contentOverride?.number_of_episodes ?? null);
    setEditVoteAverage(contentOverride?.vote_average ?? null);
    setEditImdbId(contentOverride?.imdb_id ?? "");
    setFlix2LinkQuery("");
    setFlix2LinkCatalogType(type === "movie" ? "movies" : "series");
    setFlix2LinkResults([]);
    setFlix2LinkSelected(null);
    setFlix2LinkBusy(false);
    setFlix2LinkDone(false);
    setShowEditModal(true);
    // Auto-busca dados do TMDB se já tem ID (para popular poster/backdrop mesmo que não estejam salvos)
    if (existingId) {
      fetchAutoOverviewForId(existingId, mediaType);
    }
  };

  const fetchAutoOverviewForId = async (idStr: string, forceType?: "movie" | "tv") => {
    const id = parseInt(idStr, 10);
    if (!id) { setAutoOverview(""); return; }
    setFetchingAutoOverview(true);
    try {
      const mediaType = forceType ?? editSearchType;
      const r = await fetch(`${getApiBase()}/tmdb/${mediaType}/${id}/lang/pt-BR`);
      const data = r.ok ? await r.json() : null;
      if (data) {
        setAutoOverview((data.overview as string) ?? "");
        setEditPosterPath(data.poster_path ?? null);
        setEditBackdropPath(data.backdrop_path ?? null);
        setEditSeasons(data.number_of_seasons ?? null);
        setEditEpisodes(data.number_of_episodes ?? null);
        setEditVoteAverage(data.vote_average ?? null);
      } else {
        setAutoOverview("");
      }
    } catch {
      setAutoOverview("");
    } finally {
      setFetchingAutoOverview(false);
    }
  };

  const tmdbNameSearch = async () => {
    const q = editSearchQuery.trim();
    if (!q) return;
    setEditSearchLoading(true);
    setEditSearchResults([]);
    try {
      const base = `${getApiBase()}/tmdb/search?q=${encodeURIComponent(q)}&type=${editSearchType}`;
      const [r1, r2] = await Promise.all([fetch(`${base}&page=1`), fetch(`${base}&page=2`)]);
      const [d1, d2] = await Promise.all([r1.ok ? r1.json() : null, r2.ok ? r2.json() : null]);
      const combined = [...(d1?.results ?? []), ...(d2?.results ?? [])].slice(0, 40);
      const results = combined.map((item: any) => ({
        id: item.id,
        title: item.title ?? item.name ?? "",
        year: (item.release_date ?? item.first_air_date ?? "").slice(0, 4),
        poster: item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : null,
        overview: item.overview ?? "",
      }));
      setEditSearchResults(results);
      if (results.length === 0) setEditErr("Nenhum resultado encontrado. Tente outro nome.");
      else setEditErr(null);
    } catch {
      setEditErr("Erro ao buscar no TMDB.");
    } finally {
      setEditSearchLoading(false);
    }
  };

  const selectSearchResult = (result: { id: number; title: string; year: string; poster: string | null; overview: string }) => {
    setEditSelectedResult({ id: result.id, title: result.title, poster: result.poster });
    setEditTmdbId(String(result.id));
    setAutoOverview(result.overview);
    setEditSearchResults([]);
    setEditSearchQuery(result.title);
    setEditErr(null);
    // Buscar dados completos (poster_path real, backdrop, temporadas, etc.)
    fetchAutoOverviewForId(String(result.id));
  };

  const saveContentOverride = async () => {
    if (!userId) { setEditErr("É necessário estar logado."); return; }
    setEditBusy(true);
    setEditErr(null);
    try {
      const overrideTmdbId = editTmdbId ? parseInt(editTmdbId, 10) : null;
      const payload: Partial<Omit<ContentOverride, "content_key" | "id">> = {
        tmdb_id: overrideTmdbId || null,
        tmdb_type: editSearchType,
        imdb_id: editImdbId.trim() || null,
        custom_title: editTitle.trim() || null,
        custom_overview: editOverviewMode === "manual" ? (editOverview.trim() || null) : null,
        overview_mode: editOverviewMode,
        poster_path: editPosterPath ?? null,
        backdrop_path: editBackdropPath ?? null,
        number_of_seasons: editSeasons ?? null,
        number_of_episodes: editEpisodes ?? null,
        vote_average: editVoteAverage ?? null,
      };
      let result = await db.contentOverrides.upsert(contentKey, payload, userId);
      // If the imdb_id column doesn't exist yet in Supabase, retry without it
      if (result.error && result.error.toLowerCase().includes("imdb_id")) {
        const { imdb_id: _dropped, ...payloadWithoutImdb } = payload as any;
        result = await db.contentOverrides.upsert(contentKey, payloadWithoutImdb, userId);
      }
      if (result.error) { setEditErr(result.error); return; }
      const fresh = await db.contentOverrides.get(contentKey);
      setContentOverride(fresh);
      if (fresh?.tmdb_id && fresh.tmdb_id !== resolvedTmdbId) {
        setResolvedTmdbId(fresh.tmdb_id);
      }
      setShowEditModal(false);
    } catch (e: any) {
      setEditErr(e?.message ?? "Erro ao salvar. Verifique se a tabela content_overrides existe no Supabase.");
    } finally {
      setEditBusy(false);
    }
  };

  const [fetchingImdbData, setFetchingImdbData] = useState(false);
  const [imdbFoundResult, setImdbFoundResult] = useState<{ id: number; title: string; poster: string | null; mediaType: "movie" | "tv" } | null>(null);

  const searchByImdbId = async () => {
    const raw = editImdbId.trim();
    if (!raw) return;
    const imdbId = raw.startsWith("tt") ? raw : `tt${raw}`;
    setFetchingImdbData(true);
    setEditErr(null);
    setImdbFoundResult(null);
    try {
      const r = await fetch(`${getApiBase()}/tmdb/find/${imdbId}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const movieHit = (data.movie_results ?? [])[0];
      const tvHit = (data.tv_results ?? [])[0];
      const hit = movieHit ?? tvHit;
      if (!hit) { setEditErr("Nenhum título encontrado para esse ID IMDB."); return; }
      const isMovie = !!movieHit;
      const mediaType: "movie" | "tv" = isMovie ? "movie" : "tv";
      const foundTmdbId = String(hit.id);
      const foundTitle = hit.title ?? hit.name ?? "";
      const foundPoster = hit.poster_path ? `https://image.tmdb.org/t/p/w185${hit.poster_path}` : null;
      setEditTmdbId(foundTmdbId);
      setEditSearchType(mediaType);
      setEditImdbId(imdbId);
      setAutoOverview(hit.overview ?? "");
      setEditPosterPath(hit.poster_path ?? null);
      setEditBackdropPath(hit.backdrop_path ?? null);
      setEditVoteAverage(hit.vote_average ?? null);
      setEditTitle(foundTitle);
      setEditSelectedResult({ id: hit.id, title: foundTitle, poster: foundPoster });
      setEditSearchResults([]);
      setEditErr(null);
      setImdbFoundResult({ id: hit.id, title: foundTitle, poster: foundPoster, mediaType });
      fetchAutoOverviewForId(foundTmdbId, mediaType);
    } catch (e: any) {
      setEditErr("Erro ao buscar ID IMDB: " + (e?.message ?? "ID inválido"));
    } finally {
      setFetchingImdbData(false);
    }
  };

  const flix2LinkSearch = async () => {
    const q = flix2LinkQuery.trim();
    if (!q) return;
    setFlix2LinkLoading(true);
    setFlix2LinkResults([]);
    setFlix2LinkSelected(null);
    setFlix2LinkDone(false);
    try {
      const { r2Route } = await import("@/lib/r2-direct");
      const data = await r2Route<{ results: any[]; total: number }>(
        `/flix2/search?q=${encodeURIComponent(q)}&type=${flix2LinkCatalogType}&limit=30`
      );
      const capturedCatalogType = flix2LinkCatalogType;
      const results = (data.results ?? []).map((item: any) => ({
        id: String(item.id),
        title: item.title ?? item.name ?? "",
        year: item.year ?? 0,
        poster: item.poster ?? "",
        stream_url: item.stream_url ?? null,
        catalogType: capturedCatalogType,
      }));
      setFlix2LinkResults(results);
      if (results.length === 0) setEditErr("Nenhum resultado no Flix 2.0. Tente outro nome.");
      else setEditErr(null);
    } catch (e: any) {
      setEditErr("Erro ao buscar no Flix 2.0: " + (e?.message ?? ""));
    } finally {
      setFlix2LinkLoading(false);
    }
  };

  const saveNewFlix2Link = async () => {
    if (!flix2LinkSelected) return;
    // Capture selected at call time to avoid stale closure
    const selected = flix2LinkSelected;
    setFlix2LinkBusy(true);
    setEditErr(null);
    try {
      const { r2Route, apiGetRegistry } = await import("@/lib/r2-direct");
      const { flix2Url } = await r2Route<{ flix2Url: string }>(
        `/flix2/build-url?streamId=${selected.id}&catalogType=${selected.catalogType}`
      );
      const title = details?.title ?? details?.name ?? selected.title;
      await r2Route("/flix2/replace-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbId: tmdbId,
          tmdbType: type,
          newFlix2Url: flix2Url,
          title,
        }),
      });

      // Fix: registry stores tmdbId as number — must compare with Number()
      const numericId = Number(tmdbId) || 0;
      const reg = await apiGetRegistry();
      const freshRegistry = (reg.items ?? []).filter(
        (i: RegistryItem) => i.tmdbId === numericId && i.tmdbType === type
      );

      // ── For series: fetch episodes from the new seriesId immediately ──────
      // Extract series_id from the flix2Url so we can call series-episodes
      // and build per-episode items without needing to close+reopen the screen.
      const seriesIdMatch = flix2Url.match(/[?&]series_id=(\d+)/);
      const newSeriesId = seriesIdMatch?.[1] ?? null;

      let episodeItems: RegistryItem[] = [];
      if ((type === "tv" || resolvedType === "tv") && newSeriesId) {
        try {
          const epData = await r2Route<{
            found: boolean;
            episodes: Array<{ season: number; episode: number; stream_url: string }>;
            tryClientDirect?: boolean;
            directUrl?: string;
            streamBase?: string;
          }>(`/flix2/series-episodes?seriesId=${newSeriesId}`);

          let episodeList = epData.found ? epData.episodes : [];

          // Client-side direct fallback (same as initial load flow)
          if (!epData.found && epData.tryClientDirect && epData.directUrl && epData.streamBase) {
            try {
              const ctrl = new AbortController();
              const tid = setTimeout(() => ctrl.abort(), 15000);
              let directRes: Response | null = null;
              try { directRes = await fetch(epData.directUrl, { signal: ctrl.signal }); }
              finally { clearTimeout(tid); }
              if (directRes?.ok) {
                const directData = await directRes.json() as any;
                if (directData?.episodes && typeof directData.episodes === "object") {
                  const clientEps: Array<{ season: number; episode: number; stream_url: string }> = [];
                  for (const [seasonStr, eps] of Object.entries(directData.episodes as Record<string, any[]>)) {
                    if (!Array.isArray(eps)) continue;
                    const season = Number(seasonStr);
                    for (const ep of eps as any[]) {
                      if (!ep?.id) continue;
                      const ext = ep.container_extension ?? "mp4";
                      clientEps.push({ season, episode: Number(ep.episode_num ?? ep.episode ?? 1), stream_url: `${epData.streamBase}${ep.id}.${ext}` });
                    }
                  }
                  clientEps.sort((a, b) => a.season - b.season || a.episode - b.episode);
                  if (clientEps.length > 0) episodeList = clientEps;
                }
              }
            } catch {}
          }

          for (const ep of episodeList) {
            if (!ep?.stream_url) continue;
            episodeItems.push({
              id: `flix2-auto-${tmdbId}-s${ep.season}e${ep.episode}`,
              r2Key: "", flix2Url: ep.stream_url, tmdbId: numericId, tmdbType: type as "movie" | "tv",
              title: selected.title,
              label: `T${String(ep.season).padStart(2, "0")} E${String(ep.episode).padStart(2, "0")} · Flix 2.0`,
              season: ep.season, episode: ep.episode,
            } as any);
          }

          // ── Persist all episode links to R2 registry (single write) ──────────
          if (episodeItems.length > 0) {
            try {
              await r2Route("/flix2/register-bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  tmdbId: numericId,
                  tmdbType: type,
                  title: selected.title,
                  items: episodeItems.map((ep: any) => ({
                    flix2Url: ep.flix2Url,
                    label: ep.label,
                    season: ep.season,
                    episode: ep.episode,
                  })),
                }),
              });
            } catch {
              // Non-fatal: items are still shown in UI from memory
            }
          }
        } catch {}
      }

      // If it's a movie or no episodes found, add a series-level virtual item
      const seriesLevelItem: RegistryItem | null = (episodeItems.length === 0) ? {
        id: `flix2-auto-${tmdbId}`,
        r2Key: "", flix2Url, tmdbId: numericId, tmdbType: type as "movie" | "tv",
        title: selected.title, label: selected.title + " · Flix 2.0",
        season: null, episode: null, addedAt: new Date().toISOString(),
      } as any : null;

      setR2Items((prev) => {
        // Keep veo items (auto-generated but from a different source)
        const veoItems = prev.filter(i => i.id.startsWith("veo-auto-"));
        // Use freshRegistry for real registry items (has updated flix2Url)
        // Add per-episode items (or series-level fallback)
        const autoItems = episodeItems.length > 0 ? episodeItems : (seriesLevelItem ? [seriesLevelItem] : []);
        return [...freshRegistry, ...veoItems, ...autoItems];
      });

      setFlix2LinkDone(true);
      setFlix2LinkResults([]);
    } catch (e: any) {
      setEditErr("Erro ao aplicar link: " + (e?.message ?? ""));
    } finally {
      setFlix2LinkBusy(false);
    }
  };

  const deleteContentOverride = async () => {
    setEditBusy(true);
    try {
      await db.contentOverrides.remove(contentKey);
      setContentOverride(null);
      setShowEditModal(false);
    } catch {
      setEditErr("Erro ao remover override");
    } finally {
      setEditBusy(false);
    }
  };
  // ────────────────────────────────────────────────────────────────────────────

  const submitAddSource = async () => {
    const url = addSrcUrl.trim();
    if (!url) { setAddSrcErr("Cole uma URL válida"); return; }
    const isDrive = url.includes("drive.google.com") || url.includes("drive.usercontent.google.com");
    const isFlix2 = url.includes("nixplay.lat") || url.includes("cineveo.lat");
    if (!isDrive && !isFlix2) {
      setAddSrcErr("URL inválida — cole um link do Google Drive ou Flix2 (nixplay.lat)");
      return;
    }
    setAddSrcBusy(true);
    setAddSrcErr(null);
    try {
      const { r2Route, apiGetRegistry } = await import("@/lib/r2-direct");
      const title = details?.title ?? details?.name ?? "";
      if (isDrive) {
        await r2Route("/drive/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driveUrl: url, tmdbId, tmdbType: type, title, label: title }),
        });
      } else {
        await r2Route("/flix2/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flix2Url: url, tmdbId, tmdbType: type, title, label: title }),
        });
      }
      setShowAddSrcModal(false);
      setAddSrcUrl("");
      // Atualiza registry na tela sem precisar recarregar
      const reg = await apiGetRegistry();
      const fresh = (reg.items ?? []).filter(
        (i: RegistryItem) => i.tmdbId === tmdbId && i.tmdbType === type
      );
      setR2Items(fresh);
    } catch (e: any) {
      setAddSrcErr(e.message ?? "Erro ao salvar");
    } finally {
      setAddSrcBusy(false);
    }
  };

  const goToFlix2Player = useCallback((item: RegistryItem, overrideSeason?: number, overrideEpisode?: number, overrideRatio?: number) => {
    const seasonVal = overrideSeason != null ? overrideSeason : item.season;
    const episodeVal = overrideEpisode != null ? overrideEpisode : item.episode;
    const flix2Items = r2Items
      .filter((i) => isFlixItem(i))
      .map((i) => ({ id: i.id, flix2Url: i.flix2Url ?? "", title: i.title, label: i.label, season: i.season, episode: i.episode }));
    const resolvedRatio = overrideRatio != null ? overrideRatio : (watchProgress?.progress ?? (localProgress?.progress ?? null));
    router.push({
      pathname: "/flix2-player",
      params: {
        flix2Url: item.flix2Url ?? "",
        title: details?.title ?? details?.name ?? item.title,
        episodeName: item.label,
        backdropPath: effectiveBackdropPath ?? "",
        posterPath: effectivePosterPath ?? "",
        tmdbId: String(tmdbId),
        type,
        season: seasonVal != null ? String(seasonVal) : "",
        episode: episodeVal != null ? String(episodeVal) : "",
        flix2ItemsJson: JSON.stringify(flix2Items),
        watchSeason: watchProgress?.season != null ? String(watchProgress.season) : "",
        watchEpisode: watchProgress?.episode != null ? String(watchProgress.episode) : "",
        watchProgressRatio: resolvedRatio != null ? String(resolvedRatio) : "",
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r2Items, watchProgress, localProgress, details, effectiveBackdropPath, effectivePosterPath, tmdbId, type, router]);

  const goToR2Player = useCallback((item: RegistryItem, overrideSeason?: number, overrideEpisode?: number, fallbackDriveItemId?: string, fallbackFlix2Url?: string, overrideRatio?: number) => {
    const seasonVal = overrideSeason != null ? overrideSeason : item.season;
    const episodeVal = overrideEpisode != null ? overrideEpisode : item.episode;
    const resolvedRatio = overrideRatio != null ? overrideRatio : (watchProgress?.progress ?? (localProgress?.progress ?? null));
    router.push({
      pathname: "/r2-player",
      params: {
        key: item.r2Key ?? "",
        registryItemId: "",
        teraboxItemId: item.teraboxUrl ? item.id : "",
        flix2ItemUrl: item.flix2Url ?? "",
        fallbackDriveItemId: fallbackDriveItemId ?? "",
        fallbackFlix2Url: fallbackFlix2Url ?? "",
        title: details?.title ?? details?.name ?? item.title,
        label: item.label,
        backdropPath: effectiveBackdropPath ?? "",
        posterPath: effectivePosterPath ?? "",
        tmdbId: String(tmdbId),
        type,
        season: seasonVal != null ? String(seasonVal) : "",
        episode: episodeVal != null ? String(episodeVal) : "",
        r2ItemsJson: JSON.stringify(r2Items),
        watchSeason: watchProgress?.season != null ? String(watchProgress.season) : "",
        watchEpisode: watchProgress?.episode != null ? String(watchProgress.episode) : "",
        watchProgressRatio: resolvedRatio != null ? String(resolvedRatio) : "",
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r2Items, watchProgress, localProgress, details, effectiveBackdropPath, effectivePosterPath, tmdbId, type, router]);

  const goToDrivePlayer = (item: RegistryItem, overrideSeason?: number, overrideEpisode?: number, fallbackFlix2Url?: string, overrideRatio?: number) => {
    const seasonVal = overrideSeason != null ? overrideSeason : item.season;
    const episodeVal = overrideEpisode != null ? overrideEpisode : item.episode;
    const resolvedRatio = overrideRatio != null ? overrideRatio : (watchProgress?.progress ?? (localProgress?.progress ?? null));
    router.push({
      pathname: "/r2-player",
      params: {
        driveItemId: item.id,
        key: "",
        fallbackFlix2Url: fallbackFlix2Url ?? "",
        fallbackDriveItemId: "",
        title: details?.title ?? details?.name ?? item.title,
        label: item.label,
        backdropPath: effectiveBackdropPath ?? "",
        posterPath: effectivePosterPath ?? "",
        tmdbId: String(tmdbId),
        type,
        season: seasonVal != null ? String(seasonVal) : "",
        episode: episodeVal != null ? String(episodeVal) : "",
        r2ItemsJson: JSON.stringify(r2Items),
        watchSeason: watchProgress?.season != null ? String(watchProgress.season) : "",
        watchEpisode: watchProgress?.episode != null ? String(watchProgress.episode) : "",
        watchProgressRatio: resolvedRatio != null ? String(resolvedRatio) : "",
      },
    });
  };

  const goToDriveEpisode = (ep: TmdbEpisode) => {
    const driveItem = driveEpisodeMap[ep.episode_number];
    if (!driveItem) return;
    const match = driveMatches.find((m) => m.isFolder);
    if (!match) return;

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

  // ── Admin: abrir mapper de episódios para pasta flat do Drive ──────────
  const openEpMapper = async () => {
    const folderMatch = driveMatches.find((m) => m.isFolder);
    if (!folderMatch) return;
    setShowEpMapper(true);
    setEpMapperLoading(true);
    setEpMapperFiles([]);
    try {
      // Recursively collect all video files from the folder and its subfolders.
      // This fixes cases where episodes live inside a subfolder (e.g. "Até o 39/")
      // instead of directly in the series root folder.
      type FileWithRel = { item: DriveItem; relPath: string };
      async function collectAllVideos(drive: 0 | 1, path: string, relPrefix: string): Promise<FileWithRel[]> {
        const items = await listFolderAll(drive, path);
        const results: FileWithRel[] = [];
        const subfolderPromises: Promise<FileWithRel[]>[] = [];
        for (const item of items) {
          const rel = relPrefix ? `${relPrefix}/${item.name}` : item.name;
          if (isVideo(item)) {
            results.push({ item, relPath: rel });
          } else if (item.mimeType === "application/vnd.google-apps.folder") {
            // Recurse into subfolders (season folders, grouped folders, etc.)
            subfolderPromises.push(collectAllVideos(drive, `${path}/${item.name}`, rel));
          }
        }
        const nested = await Promise.all(subfolderPromises);
        for (const group of nested) results.push(...group);
        return results;
      }

      const allWithRel = await collectAllVideos(folderMatch.drive, folderMatch.path, "");
      allWithRel.sort((a, b) => a.relPath.localeCompare(b.relPath, undefined, { numeric: true }));
      const allFiles = allWithRel;

      // Compute TMDB-based season offsets for flat-folder remapping
      const tmdbCounts = seasons.filter((s) => s.season_number > 0).sort((a, b) => a.season_number - b.season_number);
      const allHaveCounts = tmdbCounts.length > 0 && tmdbCounts.every((s) => (s.episode_count ?? 0) > 0);
      const numSeas = tmdbCounts.length || 1;

      const mapped = allFiles.map(({ item, relPath }, idx) => {
        const info = parseEpisodeInfo(item.name);
        let season = info.season ?? 1;
        let episode = info.episode ?? (idx + 1);

        // Flat folder: no season in filename → remap by TMDB counts or equal split
        if (info.season === undefined && numSeas > 1) {
          const globalEp = episode;
          if (allHaveCounts) {
            let offset = 0;
            for (const s of tmdbCounts) {
              const cnt = s.episode_count ?? 0;
              if (globalEp <= offset + cnt) {
                season = s.season_number;
                episode = globalEp - offset;
                break;
              }
              offset += cnt;
            }
          } else {
            const perSeason = Math.ceil(allFiles.length / numSeas);
            season = Math.min(numSeas, Math.ceil(globalEp / perSeason));
            episode = globalEp - (season - 1) * perSeason;
          }
        }
        return { name: item.name, relPath, link: item.link ?? "", season, episode };
      });
      // Deduplicate: mark later items with the same S+E as hidden automatically
      const seenSeasonEp = new Set<string>();
      const deduped = mapped.map((f) => {
        const key = `${f.season}x${f.episode}`;
        if (seenSeasonEp.has(key)) return { ...f, hidden: true };
        seenSeasonEp.add(key);
        return f;
      });
      setEpMapperFiles(deduped);
    } finally {
      setEpMapperLoading(false);
    }
  };

  const saveEpMapping = async () => {
    const folderMatch = driveMatches.find((m) => m.isFolder);
    if (!folderMatch || !tmdbId) return;
    setEpMapperSaving(true);
    setEpMapperSaved(0);
    const visibleFiles = epMapperFiles.filter((f) => !f.hidden);
    try {
      const { r2Route } = await import("@/lib/r2-direct");
      let saved = 0;
      for (const file of visibleFiles) {
        const filePath = `${folderMatch.path}/${file.relPath}`;
        await r2Route("/drive/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driveNum: folderMatch.drive,
            driveFilePath: filePath,
            tmdbId: Number(tmdbId),
            tmdbType: "tv",
            title: (details as any)?.title ?? (details as any)?.name ?? title ?? "",
            label: `T${file.season}E${String(file.episode).padStart(2, "0")}`,
            season: file.season,
            episode: file.episode,
          }),
        }).catch(() => {});
        saved++;
        setEpMapperSaved(saved);
      }
      // Reload registry after saving
      setShowEpMapper(false);
      setR2Items([]);
    } finally {
      setEpMapperSaving(false);
    }
  };

  const clearEpMapping = async () => {
    if (!tmdbId) return;
    setEpMapperClearing(true);
    setEpMapperCleared(null);
    try {
      const { r2Route } = await import("@/lib/r2-direct");
      // Find all driveFilePath entries for this series in the current registry
      const reg = await r2Route<{ version: number; items: RegistryItem[] }>("/registry");
      const toDelete = (reg?.items ?? []).filter(
        (i) => i.tmdbId === Number(tmdbId) && i.tmdbType === "tv" && i.driveFilePath != null
      );
      await Promise.all(
        toDelete.map((i) =>
          r2Route(`/registry/${i.id}`, { method: "DELETE" }).catch(() => {})
        )
      );
      setEpMapperCleared(toDelete.length);
      // Update local r2Items to reflect deletions
      const deletedIds = new Set(toDelete.map((i) => i.id));
      setR2Items((prev) => prev.filter((i) => !deletedIds.has(i.id)));
    } finally {
      setEpMapperClearing(false);
    }
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

  if (!tmdbId && !(params.title ?? "").trim()) {
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

  // Fallback chain: TMDB backdrop → override backdrop → TMDB poster → override poster → nav-param poster
  const backdropUri =
    TMDB_IMG(details?.backdrop_path ?? null, "w1280") ||
    TMDB_IMG(overrideBackdrop, "w1280") ||
    TMDB_IMG(contentOverride?.backdrop_path ?? null, "w1280") ||
    TMDB_IMG(details?.poster_path ?? null, "w780") ||
    TMDB_IMG(overridePoster, "w780") ||
    TMDB_IMG(contentOverride?.poster_path ?? null, "w780") ||
    params.poster ||
    null;
  const title = contentOverride?.custom_title ?? details?.title ?? details?.name ?? params.title ?? "Carregando...";
  const isLegendado = /\[L\]/i.test(params.title ?? "");
  const year = (details?.release_date ?? details?.first_air_date ?? "").slice(0, 4);
  const rawRating = details?.vote_average ?? contentOverride?.vote_average ?? null;
  const rating = rawRating ? Math.round(rawRating * 10) / 10 : null;
  const likePercent = rating ? Math.round((rating / 10) * 100) : null;
  const genreStr = details?.genres?.map((g) => g.name).join(" • ") ?? "";
  const runtime = (details as any)?.runtime;
  const numSeasons = (details as any)?.number_of_seasons ?? contentOverride?.number_of_seasons ?? null;
  // effectivePosterPath e effectiveBackdropPath declaradas acima (antes de toggleList)
  // Fallback chain: manual override → TMDB overview → Flix2 synopsis (for shows with no PT-BR translation yet)
  const overview = contentOverride?.overview_mode === "manual"
    ? (contentOverride?.custom_overview ?? details?.overview ?? flix2Synopsis)
    : (details?.overview || flix2Synopsis);
  const castList: any[] = ((details as any)?.credits?.cast ?? []).slice(0, 15);
  const topPad = Platform.OS === "web" ? 0 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* ── MODAL: Conteúdo Errado ── */}
      <Modal
        visible={reportModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setReportModalVisible(false); setReportDone(false); }}
      >
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setReportModalVisible(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: "#1a1a1a", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36, gap: 16 }}>
            {reportDone ? (
              <View style={{ alignItems: "center", gap: 12, paddingVertical: 16 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(34,197,94,0.15)", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="check-circle" size={28} color="#4ade80" />
                </View>
                <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700", textAlign: "center" }}>Obrigado pelo feedback!</Text>
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, textAlign: "center", lineHeight: 20 }}>Nosso time vai revisar e corrigir o conteúdo em breve.</Text>
                <Pressable onPress={() => { setReportModalVisible(false); }} style={{ marginTop: 8, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)" }}>
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Fechar</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(239,68,68,0.15)", alignItems: "center", justifyContent: "center" }}>
                    <Feather name="alert-triangle" size={18} color="#f87171" />
                  </View>
                  <View>
                    <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Reportar Problema</Text>
                    <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }} numberOfLines={1}>{details?.title ?? details?.name ?? ""}</Text>
                  </View>
                </View>

                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>Qual é o problema?</Text>

                {(
                  [
                    { key: "wrong_content" as const, icon: "shuffle", label: "Conteúdo incorreto", desc: "O vídeo que está tocando não é o correto" },
                    { key: "not_working" as const, icon: "wifi-off", label: "Não está funcionando", desc: "O vídeo não carrega ou dá erro" },
                    { key: "wrong_audio_sub" as const, icon: "mic-off", label: "Áudio/legenda errado", desc: "Idioma, dublagem ou legenda incorretos" },
                    { key: "other" as const, icon: "more-horizontal", label: "Outro problema", desc: "Qualquer outro problema com este conteúdo" },
                  ] as { key: ContentReport["reason"]; icon: string; label: string; desc: string }[]
                ).map((opt) => {
                  const isSelected = reportReason === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setReportReason(opt.key)}
                      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: 1.5, backgroundColor: isSelected ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.04)", borderColor: isSelected ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.1)" }, pressed && { opacity: 0.7 }]}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isSelected ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }}>
                        <Feather name={opt.icon as any} size={17} color={isSelected ? "#f87171" : "rgba(255,255,255,0.5)"} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: isSelected ? "#fca5a5" : "#fff", fontWeight: "600", fontSize: 14 }}>{opt.label}</Text>
                        <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 1 }}>{opt.desc}</Text>
                      </View>
                      {isSelected && <Feather name="check-circle" size={18} color="#f87171" />}
                    </Pressable>
                  );
                })}

                <Pressable
                  onPress={handleReport}
                  disabled={!reportReason || reportBusy}
                  style={({ pressed }) => [{ paddingVertical: 14, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, backgroundColor: reportReason ? "#dc2626" : "rgba(255,255,255,0.08)" }, (pressed || reportBusy || !reportReason) && { opacity: 0.6 }]}
                >
                  {reportBusy
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <>
                        <Feather name="send" size={15} color={reportReason ? "#fff" : "rgba(255,255,255,0.3)"} />
                        <Text style={{ color: reportReason ? "#fff" : "rgba(255,255,255,0.3)", fontWeight: "700", fontSize: 15 }}>Enviar Reporte</Text>
                      </>}
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

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

      {/* ── Admin: adicionar fonte ─────────────────────────────────────── */}
      <Modal
        visible={showAddSrcModal}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowAddSrcModal(false); setAddSrcUrl(""); setAddSrcErr(null); }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", padding: 24 }}
            onPress={() => { setShowAddSrcModal(false); setAddSrcUrl(""); setAddSrcErr(null); }}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{ backgroundColor: "#111", borderRadius: 16, padding: 20, gap: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Feather name="plus-circle" size={18} color={colors.primary} />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Adicionar fonte</Text>
              </View>
              <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }} numberOfLines={1}>
                {details?.title ?? details?.name}
              </Text>
              <TextInput
                style={{ backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 10, padding: 12, color: "#fff", fontSize: 14, borderWidth: 1, borderColor: addSrcErr ? "#ef4444" : "rgba(255,255,255,0.12)" }}
                placeholder="URL do Google Drive ou Flix2 (nixplay.lat)"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={addSrcUrl}
                onChangeText={(t) => { setAddSrcUrl(t); setAddSrcErr(null); }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {addSrcErr ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Feather name="alert-circle" size={13} color="#ef4444" />
                  <Text style={{ color: "#ef4444", fontSize: 12, flex: 1 }}>{addSrcErr}</Text>
                </View>
              ) : (
                <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
                  Drive: drive.google.com/… • Flix2: nixplay.lat/…
                </Text>
              )}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 2 }}>
                <Pressable
                  onPress={() => { setShowAddSrcModal(false); setAddSrcUrl(""); setAddSrcErr(null); }}
                  style={({ pressed }) => [{ flex: 1, padding: 13, borderRadius: 10, alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)" }, pressed && { opacity: 0.7 }]}
                >
                  <Text style={{ color: "rgba(255,255,255,0.6)", fontWeight: "600" }}>Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={submitAddSource}
                  disabled={addSrcBusy}
                  style={({ pressed }) => [{ flex: 1, padding: 13, borderRadius: 10, alignItems: "center", backgroundColor: colors.primary }, pressed && { opacity: 0.8 }, addSrcBusy && { opacity: 0.6 }]}
                >
                  {addSrcBusy
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={{ color: "#fff", fontWeight: "700" }}>Salvar</Text>}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Admin: Edit Content Metadata Modal ─────────────────────────────── */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.80)", justifyContent: "flex-end" }}
            onPress={() => setShowEditModal(false)}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <ScrollView
                style={{ backgroundColor: "#111", borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderBottomWidth: 0, borderColor: "rgba(234,179,8,0.25)" }}
                contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 36 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Header */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Feather name="edit-2" size={16} color="#fbbf24" />
                    <Text style={{ color: "#fbbf24", fontWeight: "700", fontSize: 16 }}>Editar Conteúdo</Text>
                    <View style={{ paddingHorizontal: 7, paddingVertical: 2, backgroundColor: "rgba(234,179,8,0.15)", borderRadius: 6, borderWidth: 1, borderColor: "rgba(234,179,8,0.35)" }}>
                      <Text style={{ color: "#fbbf24", fontSize: 10, fontWeight: "700" }}>ADMIN</Text>
                    </View>
                  </View>
                  <Pressable onPress={() => setShowEditModal(false)} hitSlop={12}>
                    <Feather name="x" size={20} color="rgba(255,255,255,0.5)" />
                  </Pressable>
                </View>

                <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
                  Chave: <Text style={{ color: "rgba(255,255,255,0.45)", fontFamily: "monospace" }}>{contentKey}</Text>
                </Text>

                {/* ── Seção 1: Pesquisar por nome ── */}
                <View style={{ gap: 8 }}>
                  <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600" }}>Pesquisar no TMDB por nome</Text>

                  {/* Tipo: Série / Filme */}
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {(["tv", "movie"] as const).map((t) => (
                      <Pressable
                        key={t}
                        onPress={() => { setEditSearchType(t); setEditSearchResults([]); }}
                        style={({ pressed }) => [{ flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: "center", borderWidth: 1, backgroundColor: editSearchType === t ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.05)", borderColor: editSearchType === t ? "rgba(139,92,246,0.6)" : "rgba(255,255,255,0.1)" }, pressed && { opacity: 0.7 }]}
                      >
                        <Text style={{ color: editSearchType === t ? "#c4b5fd" : "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "600" }}>
                          {t === "tv" ? "📺 Série" : "🎬 Filme"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Campo de busca + botão */}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TextInput
                      style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
                      placeholder="Ex: MasterChef Brasil…"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={editSearchQuery}
                      onChangeText={setEditSearchQuery}
                      onSubmitEditing={tmdbNameSearch}
                      returnKeyType="search"
                      autoCorrect={false}
                    />
                    <Pressable
                      onPress={tmdbNameSearch}
                      disabled={editSearchLoading || !editSearchQuery.trim()}
                      style={({ pressed }) => [{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(139,92,246,0.2)", borderWidth: 1, borderColor: "rgba(139,92,246,0.5)", justifyContent: "center", alignItems: "center" }, (pressed || !editSearchQuery.trim()) && { opacity: 0.5 }]}
                    >
                      {editSearchLoading
                        ? <ActivityIndicator size={16} color="#c4b5fd" />
                        : <Feather name="search" size={16} color="#c4b5fd" />}
                    </Pressable>
                  </View>

                  {/* Resultados da busca — altura limitada com scroll interno */}
                  {editSearchResults.length > 0 && (
                    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", overflow: "hidden" }}>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 }}>
                        Toque para selecionar ({editSearchResults.length} resultados):
                      </Text>
                      <ScrollView
                        style={{ maxHeight: 260 }}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator
                        contentContainerStyle={{ padding: 8, paddingTop: 0, gap: 6 }}
                      >
                        {editSearchResults.map((res) => (
                          <Pressable
                            key={res.id}
                            onPress={() => selectSearchResult(res)}
                            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: 10, backgroundColor: editSelectedResult?.id === res.id ? "rgba(234,179,8,0.12)" : "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: editSelectedResult?.id === res.id ? "rgba(234,179,8,0.4)" : "rgba(255,255,255,0.07)" }, pressed && { opacity: 0.7 }]}
                          >
                            {res.poster ? (
                              <Image source={{ uri: res.poster }} style={{ width: 38, height: 56, borderRadius: 5, backgroundColor: "#222" }} resizeMode="cover" />
                            ) : (
                              <View style={{ width: 38, height: 56, borderRadius: 5, backgroundColor: "#222", alignItems: "center", justifyContent: "center" }}>
                                <Feather name="film" size={16} color="rgba(255,255,255,0.3)" />
                              </View>
                            )}
                            <View style={{ flex: 1, gap: 3 }}>
                              <Text style={{ color: editSelectedResult?.id === res.id ? "#fbbf24" : "#fff", fontWeight: "600", fontSize: 13 }} numberOfLines={2}>{res.title}</Text>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                {res.year ? <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{res.year}</Text> : null}
                                <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>ID: {res.id}</Text>
                              </View>
                              {res.overview ? (
                                <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, lineHeight: 15 }} numberOfLines={2}>{res.overview}</Text>
                              ) : null}
                            </View>
                            {editSelectedResult?.id === res.id && (
                              <Feather name="check-circle" size={18} color="#fbbf24" />
                            )}
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Card do resultado selecionado */}
                  {editSelectedResult && editSearchResults.length === 0 && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, backgroundColor: "rgba(234,179,8,0.08)", borderWidth: 1, borderColor: "rgba(234,179,8,0.3)" }}>
                      {editSelectedResult.poster ? (
                        <Image source={{ uri: editSelectedResult.poster }} style={{ width: 34, height: 50, borderRadius: 4, backgroundColor: "#222" }} resizeMode="cover" />
                      ) : null}
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: "#fbbf24", fontWeight: "700", fontSize: 13 }} numberOfLines={1}>{editSelectedResult.title}</Text>
                        <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>ID: {editSelectedResult.id}</Text>
                      </View>
                      <Feather name="check-circle" size={16} color="#fbbf24" />
                    </View>
                  )}
                </View>

                {/* ── Seção 2: ID TMDB manual ── */}
                <View style={{ gap: 6 }}>
                  <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600" }}>ID TMDB (auto ou manual)</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TextInput
                      style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 14, borderWidth: 1, borderColor: editTmdbId ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.12)" }}
                      placeholder={tmdbId ? String(tmdbId) : "Ex: 205212"}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={editTmdbId}
                      onChangeText={setEditTmdbId}
                      keyboardType="numeric"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Pressable
                      onPress={() => fetchAutoOverviewForId(editTmdbId)}
                      disabled={!editTmdbId || fetchingAutoOverview}
                      style={({ pressed }) => [{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(59,130,246,0.15)", borderWidth: 1, borderColor: "rgba(59,130,246,0.4)", justifyContent: "center", alignItems: "center" }, (pressed || !editTmdbId) && { opacity: 0.5 }]}
                    >
                      {fetchingAutoOverview
                        ? <ActivityIndicator size={14} color="#60a5fa" />
                        : <Feather name="refresh-cw" size={15} color="#60a5fa" />}
                    </Pressable>
                  </View>
                  <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
                    Digite um ID e toque ↺ para recarregar a prévia da sinopse.
                  </Text>
                </View>

                {/* ── Seção 2b: ID IMDB manual ── */}
                <View style={{ gap: 6 }}>
                  <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600" }}>Buscar por ID IMDB</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TextInput
                      style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 14, borderWidth: 1, borderColor: editImdbId ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.12)" }}
                      placeholder="Ex: tt1234567"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={editImdbId}
                      onChangeText={(v) => { setEditImdbId(v); if (!v.trim()) setImdbFoundResult(null); }}
                      onSubmitEditing={searchByImdbId}
                      returnKeyType="search"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="default"
                    />
                    <Pressable
                      onPress={searchByImdbId}
                      disabled={!editImdbId.trim() || fetchingImdbData}
                      style={({ pressed }) => [{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(245,158,11,0.15)", borderWidth: 1, borderColor: "rgba(245,158,11,0.45)", justifyContent: "center", alignItems: "center", gap: 4, flexDirection: "row" }, (pressed || !editImdbId.trim() || fetchingImdbData) && { opacity: 0.5 }]}
                    >
                      {fetchingImdbData
                        ? <ActivityIndicator size={14} color="#fbbf24" />
                        : <>
                            <Feather name="search" size={14} color="#fbbf24" />
                            <Text style={{ color: "#fbbf24", fontSize: 12, fontWeight: "600" }}>Buscar</Text>
                          </>}
                    </Pressable>
                  </View>
                  {/* Card de resultado da busca por IMDB */}
                  {imdbFoundResult && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, backgroundColor: "rgba(245,158,11,0.08)", borderWidth: 1, borderColor: "rgba(245,158,11,0.35)" }}>
                      {imdbFoundResult.poster ? (
                        <Image source={{ uri: imdbFoundResult.poster }} style={{ width: 42, height: 62, borderRadius: 6, backgroundColor: "#222" }} resizeMode="cover" />
                      ) : (
                        <View style={{ width: 42, height: 62, borderRadius: 6, backgroundColor: "#222", alignItems: "center", justifyContent: "center" }}>
                          <Feather name="film" size={18} color="rgba(255,255,255,0.3)" />
                        </View>
                      )}
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={{ color: "#fbbf24", fontWeight: "700", fontSize: 14 }} numberOfLines={2}>{imdbFoundResult.title}</Text>
                        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
                          {imdbFoundResult.mediaType === "movie" ? "🎬 Filme" : "📺 Série"} · TMDB ID: {imdbFoundResult.id}
                        </Text>
                        <Text style={{ color: "rgba(245,158,11,0.7)", fontSize: 11 }}>✓ Cartaz, sinopse e dados carregados</Text>
                      </View>
                      <Feather name="check-circle" size={18} color="#fbbf24" />
                    </View>
                  )}
                  <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
                    Digite o ID IMDB (ex: tt0120338) e toque Buscar — cartaz, sinopse, temporadas e mais serão preenchidos automaticamente.
                  </Text>
                </View>

                {/* ── Seção 3: Nome personalizado ── */}
                <View style={{ gap: 6 }}>
                  <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600" }}>Nome (deixe vazio = usar TMDB)</Text>
                  <TextInput
                    style={{ backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
                    placeholder={details?.title ?? details?.name ?? "Nome personalizado…"}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={editTitle}
                    onChangeText={setEditTitle}
                    autoCorrect={false}
                  />
                </View>

                {/* ── Seção 4: Sinopse ── */}
                <View style={{ gap: 8 }}>
                  <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600" }}>Sinopse</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={() => setEditOverviewMode("auto")}
                      style={({ pressed }) => [{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", borderWidth: 1, backgroundColor: editOverviewMode === "auto" ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)", borderColor: editOverviewMode === "auto" ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.10)" }, pressed && { opacity: 0.7 }]}
                    >
                      <Text style={{ color: editOverviewMode === "auto" ? "#4ade80" : "rgba(255,255,255,0.45)", fontSize: 13, fontWeight: "600" }}>🤖 Automático</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setEditOverviewMode("manual")}
                      style={({ pressed }) => [{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", borderWidth: 1, backgroundColor: editOverviewMode === "manual" ? "rgba(234,179,8,0.15)" : "rgba(255,255,255,0.05)", borderColor: editOverviewMode === "manual" ? "rgba(234,179,8,0.5)" : "rgba(255,255,255,0.10)" }, pressed && { opacity: 0.7 }]}
                    >
                      <Text style={{ color: editOverviewMode === "manual" ? "#fbbf24" : "rgba(255,255,255,0.45)", fontSize: 13, fontWeight: "600" }}>✏️ Manual</Text>
                    </Pressable>
                  </View>

                  {editOverviewMode === "auto" ? (
                    <View style={{ backgroundColor: "rgba(34,197,94,0.06)", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "rgba(34,197,94,0.2)", gap: 4 }}>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Prévia (TMDB):</Text>
                      {fetchingAutoOverview
                        ? <ActivityIndicator size={14} color="#4ade80" style={{ alignSelf: "flex-start", marginTop: 4 }} />
                        : <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 18 }} numberOfLines={5}>
                            {autoOverview || (details?.overview ?? "Nenhuma sinopse disponível.")}
                          </Text>
                      }
                    </View>
                  ) : (
                    <TextInput
                      style={{ backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 13, lineHeight: 20, borderWidth: 1, borderColor: "rgba(234,179,8,0.3)", minHeight: 100, textAlignVertical: "top" }}
                      placeholder="Digite a sinopse personalizada…"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={editOverview}
                      onChangeText={setEditOverview}
                      multiline
                      autoCorrect={false}
                    />
                  )}
                </View>

                {/* ── Seção 5: Modificar Link de Vídeo (Flix 2.0) ── */}
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Feather name="link" size={13} color="#f97316" />
                    <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600" }}>Modificar Link de Vídeo (Flix 2.0)</Text>
                  </View>

                  {/* Tipo: Filme / Série / Anime */}
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {(["movies", "series", "animes"] as const).map((ct) => (
                      <Pressable
                        key={ct}
                        onPress={() => { setFlix2LinkCatalogType(ct); setFlix2LinkResults([]); setFlix2LinkSelected(null); }}
                        style={({ pressed }) => [{ flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: "center", borderWidth: 1, backgroundColor: flix2LinkCatalogType === ct ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.05)", borderColor: flix2LinkCatalogType === ct ? "rgba(249,115,22,0.55)" : "rgba(255,255,255,0.1)" }, pressed && { opacity: 0.7 }]}
                      >
                        <Text style={{ color: flix2LinkCatalogType === ct ? "#fb923c" : "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: "600" }}>
                          {ct === "movies" ? "🎬 Filme" : ct === "series" ? "📺 Série" : "🎌 Anime"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Campo de busca + botão */}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TextInput
                      style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
                      placeholder="Nome do conteúdo no Flix 2.0…"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={flix2LinkQuery}
                      onChangeText={setFlix2LinkQuery}
                      onSubmitEditing={flix2LinkSearch}
                      returnKeyType="search"
                      autoCorrect={false}
                    />
                    <Pressable
                      onPress={flix2LinkSearch}
                      disabled={flix2LinkLoading || !flix2LinkQuery.trim()}
                      style={({ pressed }) => [{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(249,115,22,0.15)", borderWidth: 1, borderColor: "rgba(249,115,22,0.5)", justifyContent: "center", alignItems: "center" }, (pressed || !flix2LinkQuery.trim()) && { opacity: 0.5 }]}
                    >
                      {flix2LinkLoading
                        ? <ActivityIndicator size={16} color="#fb923c" />
                        : <Feather name="search" size={16} color="#fb923c" />}
                    </Pressable>
                  </View>

                  {/* Resultados da busca */}
                  {flix2LinkResults.length > 0 && (
                    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "rgba(249,115,22,0.15)", backgroundColor: "rgba(249,115,22,0.04)", overflow: "hidden" }}>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 }}>
                        Toque para selecionar ({flix2LinkResults.length} resultados):
                      </Text>
                      <ScrollView
                        style={{ maxHeight: 240 }}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="always"
                        showsVerticalScrollIndicator
                        contentContainerStyle={{ padding: 8, paddingTop: 0, gap: 6 }}
                      >
                        {flix2LinkResults.map((res, idx) => {
                          const isSelected = flix2LinkSelected?.id === res.id && flix2LinkSelected?.catalogType === res.catalogType;
                          return (
                            <TouchableOpacity
                              key={`${idx}_${res.id}`}
                              activeOpacity={0.7}
                              onPress={() => setFlix2LinkSelected({ id: res.id, title: res.title, poster: res.poster, catalogType: res.catalogType })}
                              style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: 10, backgroundColor: isSelected ? "rgba(249,115,22,0.12)" : "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: isSelected ? "rgba(249,115,22,0.45)" : "rgba(255,255,255,0.07)" }}
                            >
                              {res.poster ? (
                                <Image source={{ uri: res.poster }} style={{ width: 36, height: 52, borderRadius: 5, backgroundColor: "#222" }} resizeMode="cover" />
                              ) : (
                                <View style={{ width: 36, height: 52, borderRadius: 5, backgroundColor: "#222", alignItems: "center", justifyContent: "center" }}>
                                  <Feather name="film" size={15} color="rgba(255,255,255,0.3)" />
                                </View>
                              )}
                              <View style={{ flex: 1, gap: 3 }}>
                                <Text style={{ color: isSelected ? "#fb923c" : "#fff", fontWeight: "600", fontSize: 13 }} numberOfLines={2}>{res.title}</Text>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                  {res.year > 0 && <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{res.year}</Text>}
                                  <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>ID: {res.id}</Text>
                                </View>
                              </View>
                              {isSelected && <Feather name="check-circle" size={18} color="#fb923c" />}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}

                  {/* Card do item selecionado */}
                  {flix2LinkSelected && flix2LinkResults.length === 0 && !flix2LinkDone && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, backgroundColor: "rgba(249,115,22,0.08)", borderWidth: 1, borderColor: "rgba(249,115,22,0.3)" }}>
                      {flix2LinkSelected.poster ? (
                        <Image source={{ uri: flix2LinkSelected.poster }} style={{ width: 32, height: 46, borderRadius: 4, backgroundColor: "#222" }} resizeMode="cover" />
                      ) : null}
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: "#fb923c", fontWeight: "700", fontSize: 13 }} numberOfLines={1}>{flix2LinkSelected.title}</Text>
                        <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>ID: {flix2LinkSelected.id} · {flix2LinkSelected.catalogType}</Text>
                      </View>
                      <Feather name="check-circle" size={16} color="#fb923c" />
                    </View>
                  )}

                  {/* Sucesso */}
                  {flix2LinkDone && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(34,197,94,0.08)", padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "rgba(34,197,94,0.3)" }}>
                      <Feather name="check-circle" size={16} color="#4ade80" />
                      <Text style={{ color: "#4ade80", fontSize: 13, fontWeight: "600" }}>Link atualizado com sucesso!</Text>
                    </View>
                  )}

                  {/* Botão Aplicar Link */}
                  {flix2LinkSelected && !flix2LinkDone && (
                    <Pressable
                      onPress={saveNewFlix2Link}
                      disabled={flix2LinkBusy}
                      style={({ pressed }) => [{ paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: "#ea580c", flexDirection: "row", justifyContent: "center", gap: 7 }, (pressed || flix2LinkBusy) && { opacity: 0.7 }]}
                    >
                      {flix2LinkBusy
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <>
                            <Feather name="link" size={15} color="#fff" />
                            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Aplicar Link Selecionado</Text>
                          </>}
                    </Pressable>
                  )}
                </View>

                {/* Erro */}
                {editErr ? (
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "rgba(239,68,68,0.08)", padding: 10, borderRadius: 8, borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" }}>
                    <Feather name="alert-circle" size={14} color="#f87171" style={{ marginTop: 1 }} />
                    <Text style={{ color: "#f87171", fontSize: 12, flex: 1, lineHeight: 17 }}>{editErr}</Text>
                  </View>
                ) : null}

                {/* Botões */}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {contentOverride && (
                    <Pressable
                      onPress={deleteContentOverride}
                      disabled={editBusy}
                      style={({ pressed }) => [{ paddingVertical: 13, paddingHorizontal: 14, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.4)" }, (pressed || editBusy) && { opacity: 0.6 }]}
                    >
                      <Feather name="trash-2" size={16} color="#f87171" />
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => setShowEditModal(false)}
                    style={({ pressed }) => [{ flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: "center", backgroundColor: "rgba(255,255,255,0.07)" }, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={{ color: "rgba(255,255,255,0.6)", fontWeight: "600" }}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    onPress={saveContentOverride}
                    disabled={editBusy}
                    style={({ pressed }) => [{ flex: 2, paddingVertical: 13, borderRadius: 10, alignItems: "center", backgroundColor: "#ca8a04" }, (pressed || editBusy) && { opacity: 0.7 }]}
                  >
                    {editBusy
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Salvar</Text>}
                  </Pressable>
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Episode Mapper Modal ──────────────────────────────────── */}
      <Modal
        visible={showEpMapper}
        transparent
        animationType="slide"
        onRequestClose={() => !epMapperSaving && setShowEpMapper(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.88)" }}>
          {/* Header */}
          <View style={{ paddingTop: 56, paddingHorizontal: 18, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#16a34a33" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Feather name="git-branch" size={16} color="#16a34a" />
              <View>
                <Text style={{ color: "#16a34a", fontWeight: "700", fontSize: 15 }}>MAPEAR EPISÓDIOS → R2</Text>
                <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 1 }}>Afeta todos os usuários via banco de dados</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {!epMapperSaving && !epMapperLoading && epMapperFiles.length > 0 && (
                <Pressable
                  onPress={() => {
                    setEpMapperSelectMode((v) => !v);
                    setEpMapperSelected(new Set());
                  }}
                  hitSlop={8}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: epMapperSelectMode ? "rgba(22,163,74,0.2)" : "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: epMapperSelectMode ? "#16a34a" : "rgba(255,255,255,0.15)" }}
                >
                  <Text style={{ color: epMapperSelectMode ? "#16a34a" : "rgba(255,255,255,0.6)", fontWeight: "700", fontSize: 12 }}>
                    {epMapperSelectMode ? "✓ Selecionando" : "Selecionar"}
                  </Text>
                </Pressable>
              )}
              {!epMapperSaving && (
                <Pressable onPress={() => { setShowEpMapper(false); setEpMapperSelectMode(false); setEpMapperSelected(new Set()); }} hitSlop={12}>
                  <Feather name="x" size={22} color="rgba(255,255,255,0.5)" />
                </Pressable>
              )}
            </View>
          </View>

          {/* Bulk action toolbar — only when in select mode */}
          {epMapperSelectMode && !epMapperLoading && (
            <View style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "rgba(22,163,74,0.06)", borderBottomWidth: 1, borderBottomColor: "rgba(22,163,74,0.15)", gap: 10 }}>
              {/* Select all / clear row */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable
                  onPress={() => {
                    const visibleIndices = epMapperFiles.map((_, i) => i).filter((i) => !epMapperFiles[i].hidden);
                    const allSelected = visibleIndices.every((i) => epMapperSelected.has(i));
                    if (allSelected) {
                      setEpMapperSelected(new Set());
                    } else {
                      setEpMapperSelected(new Set(visibleIndices));
                    }
                  }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(22,163,74,0.1)", borderWidth: 1, borderColor: "rgba(22,163,74,0.25)" }}
                >
                  <Feather name="check-square" size={13} color="#16a34a" />
                  <Text style={{ color: "#16a34a", fontSize: 12, fontWeight: "600" }}>Todos</Text>
                </Pressable>
                <Pressable
                  onPress={() => setEpMapperSelected(new Set())}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
                >
                  <Feather name="square" size={13} color="rgba(255,255,255,0.45)" />
                  <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: "600" }}>Limpar</Text>
                </Pressable>
                <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginLeft: 4 }}>
                  {epMapperSelected.size} selecionado{epMapperSelected.size !== 1 ? "s" : ""}
                </Text>
              </View>

              {/* Season + start-ep + Renumerar */}
              {epMapperSelected.size > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ alignItems: "center", gap: 3, flex: 1 }}>
                    <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "600" }}>TEMPORADA</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <Pressable onPress={() => setEpMapperBulkSeason((v) => String(Math.max(1, Number(v) - 1)))} style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: "rgba(22,163,74,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(22,163,74,0.3)" }}>
                        <Feather name="minus" size={12} color="#16a34a" />
                      </Pressable>
                      <TextInput
                        value={epMapperBulkSeason}
                        onChangeText={(t) => setEpMapperBulkSeason(t.replace(/[^0-9]/g, "") || "1")}
                        keyboardType="number-pad"
                        style={{ color: "#fff", fontWeight: "800", fontSize: 16, minWidth: 28, textAlign: "center", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 6, paddingVertical: 3 }}
                      />
                      <Pressable onPress={() => setEpMapperBulkSeason((v) => String(Number(v) + 1))} style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: "rgba(22,163,74,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(22,163,74,0.3)" }}>
                        <Feather name="plus" size={12} color="#16a34a" />
                      </Pressable>
                    </View>
                  </View>
                  <View style={{ alignItems: "center", gap: 3, flex: 1 }}>
                    <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "600" }}>EP INICIAL</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <Pressable onPress={() => setEpMapperBulkStartEp((v) => String(Math.max(1, Number(v) - 1)))} style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: "rgba(22,163,74,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(22,163,74,0.3)" }}>
                        <Feather name="minus" size={12} color="#16a34a" />
                      </Pressable>
                      <TextInput
                        value={epMapperBulkStartEp}
                        onChangeText={(t) => setEpMapperBulkStartEp(t.replace(/[^0-9]/g, "") || "1")}
                        keyboardType="number-pad"
                        style={{ color: "#fff", fontWeight: "800", fontSize: 16, minWidth: 28, textAlign: "center", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 6, paddingVertical: 3 }}
                      />
                      <Pressable onPress={() => setEpMapperBulkStartEp((v) => String(Number(v) + 1))} style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: "rgba(22,163,74,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(22,163,74,0.3)" }}>
                        <Feather name="plus" size={12} color="#16a34a" />
                      </Pressable>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => {
                      const season = Math.max(1, Number(epMapperBulkSeason) || 1);
                      const startEp = Math.max(1, Number(epMapperBulkStartEp) || 1);
                      // Get selected indices in list order, excluding hidden
                      const sortedSelected = [...epMapperSelected]
                        .filter((i) => !epMapperFiles[i]?.hidden)
                        .sort((a, b) => a - b);
                      setEpMapperFiles((prev) => {
                        const next = [...prev];
                        sortedSelected.forEach((idx, offset) => {
                          next[idx] = { ...next[idx], season, episode: startEp + offset };
                        });
                        // Re-run deduplication
                        const seen = new Set<string>();
                        return next.map((f) => {
                          if (f.hidden) return f;
                          const key = `${f.season}x${f.episode}`;
                          if (seen.has(key)) return { ...f, hidden: true };
                          seen.add(key);
                          return f;
                        });
                      });
                      setEpMapperSelected(new Set());
                      setEpMapperSelectMode(false);
                    }}
                    style={({ pressed }) => ({
                      flex: 1.4, paddingVertical: 10, borderRadius: 10, alignItems: "center", justifyContent: "center",
                      backgroundColor: "#16a34a", gap: 4,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Feather name="hash" size={13} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>Renumerar</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* File list */}
          {epMapperLoading ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
              <ActivityIndicator size="large" color="#16a34a" />
              <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Carregando arquivos da pasta...</Text>
            </View>
          ) : (
            <FlatList
              data={epMapperFiles}
              keyExtractor={(_, i) => String(i)}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 14, gap: 8 }}
              ListHeaderComponent={
                epMapperFiles.length > 0 ? (() => {
                  const visibleCount = epMapperFiles.filter((f) => !f.hidden).length;
                  const hiddenCount = epMapperFiles.length - visibleCount;
                  return (
                    <View style={{ marginBottom: 6, gap: 2 }}>
                      <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
                        {epMapperFiles.length} arquivo{epMapperFiles.length !== 1 ? "s" : ""} encontrado{epMapperFiles.length !== 1 ? "s" : ""}. Ajuste T e Ep conforme necessário.
                      </Text>
                      {hiddenCount > 0 && (
                        <Text style={{ color: "rgba(249,115,22,0.7)", fontSize: 11 }}>
                          {hiddenCount} oculto{hiddenCount !== 1 ? "s" : ""} (duplicata{hiddenCount !== 1 ? "s" : ""}) — não {hiddenCount !== 1 ? "serão salvos" : "será salvo"}.
                        </Text>
                      )}
                    </View>
                  );
                })() : null
              }
              renderItem={({ item, index }) => {
                const isInvalid = !item.hidden && (item.episode <= 0 || item.season <= 0);
                const isHidden = !!item.hidden;
                const isSelected = epMapperSelected.has(index);
                const cardBg = isHidden
                  ? "rgba(255,255,255,0.02)"
                  : isSelected ? "rgba(22,163,74,0.08)"
                  : isInvalid ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.05)";
                const cardBorder = isHidden
                  ? "rgba(255,255,255,0.08)"
                  : isSelected ? "#16a34a"
                  : isInvalid ? "rgba(239,68,68,0.45)" : "rgba(22,163,74,0.2)";
                return (
                <Pressable
                  onPress={epMapperSelectMode && !isHidden ? () => {
                    setEpMapperSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(index)) next.delete(index); else next.add(index);
                      return next;
                    });
                  } : undefined}
                >
                <View style={{ backgroundColor: cardBg, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: cardBorder, gap: 8, opacity: isHidden ? 0.4 : 1 }}>
                  {/* Filename row + action buttons */}
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                    {/* Checkbox in select mode */}
                    {epMapperSelectMode && !isHidden && (
                      <View style={{ width: 18, height: 18, borderRadius: 5, borderWidth: 2, borderColor: isSelected ? "#16a34a" : "rgba(255,255,255,0.25)", backgroundColor: isSelected ? "#16a34a" : "transparent", alignItems: "center", justifyContent: "center", marginTop: 0 }}>
                        {isSelected && <Feather name="check" size={11} color="#fff" />}
                      </View>
                    )}
                    {isInvalid && !epMapperSelectMode && <Feather name="alert-triangle" size={13} color="#ef4444" style={{ marginTop: 1 }} />}
                    {isHidden && <Feather name="eye-off" size={13} color="rgba(255,255,255,0.4)" style={{ marginTop: 1 }} />}
                    <Text style={{ color: isHidden ? "rgba(255,255,255,0.35)" : isInvalid ? "#fca5a5" : "rgba(255,255,255,0.75)", fontSize: 11, fontFamily: "monospace", flex: 1, textDecorationLine: isHidden ? "line-through" : "none" }} numberOfLines={2}>{item.name}</Text>
                    {/* Hide toggle — hidden in select mode */}
                    {!epMapperSelectMode && (
                    <Pressable
                      onPress={() => setEpMapperFiles((prev) => prev.map((f, i) => i === index ? { ...f, hidden: !f.hidden } : f))}
                      hitSlop={8}
                      style={{ padding: 4, borderRadius: 6, backgroundColor: isHidden ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)", marginLeft: 2 }}
                    >
                      <Feather name={isHidden ? "eye" : "eye-off"} size={14} color={isHidden ? "rgba(255,255,255,0.5)" : "rgba(255,165,0,0.7)"} />
                    </Pressable>
                    )}
                    {/* Delete — hidden in select mode */}
                    {!epMapperSelectMode && (
                    <Pressable
                      onPress={() => setEpMapperFiles((prev) => prev.filter((_, i) => i !== index))}
                      hitSlop={8}
                      style={{ padding: 4, borderRadius: 6, backgroundColor: "rgba(239,68,68,0.08)", marginLeft: 2 }}
                    >
                      <Feather name="trash-2" size={14} color="rgba(239,68,68,0.7)" />
                    </Pressable>
                    )}
                  </View>
                  {isInvalid && (
                    <Text style={{ color: "#ef4444", fontSize: 10, fontWeight: "700", letterSpacing: 0.3 }}>
                      ⚠ Ep ou temporada inválida — ajuste antes de salvar
                    </Text>
                  )}
                  {isHidden && (
                    <Text style={{ color: "rgba(255,165,0,0.5)", fontSize: 10, fontWeight: "600" }}>
                      OCULTO — não será salvo no R2
                    </Text>
                  )}
                  {/* Season + Episode row (disabled when hidden) */}
                  {!isHidden && (
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    {/* Season */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginBottom: 4, fontWeight: "600" }}>TEMPORADA</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Pressable
                          onPress={() => setEpMapperFiles((prev) => prev.map((f, i) => i === index ? { ...f, season: Math.max(1, f.season - 1) } : f))}
                          style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: "rgba(22,163,74,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(22,163,74,0.3)" }}
                        >
                          <Feather name="minus" size={13} color="#16a34a" />
                        </Pressable>
                        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15, minWidth: 24, textAlign: "center" }}>{item.season}</Text>
                        <Pressable
                          onPress={() => setEpMapperFiles((prev) => prev.map((f, i) => i === index ? { ...f, season: f.season + 1 } : f))}
                          style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: "rgba(22,163,74,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(22,163,74,0.3)" }}
                        >
                          <Feather name="plus" size={13} color="#16a34a" />
                        </Pressable>
                      </View>
                    </View>
                    {/* Episode */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginBottom: 4, fontWeight: "600" }}>EPISÓDIO</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Pressable
                          onPress={() => setEpMapperFiles((prev) => prev.map((f, i) => i === index ? { ...f, episode: Math.max(1, f.episode - 1) } : f))}
                          style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: "rgba(22,163,74,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(22,163,74,0.3)" }}
                        >
                          <Feather name="minus" size={13} color="#16a34a" />
                        </Pressable>
                        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15, minWidth: 24, textAlign: "center" }}>{item.episode}</Text>
                        <Pressable
                          onPress={() => setEpMapperFiles((prev) => prev.map((f, i) => i === index ? { ...f, episode: f.episode + 1 } : f))}
                          style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: "rgba(22,163,74,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(22,163,74,0.3)" }}
                        >
                          <Feather name="plus" size={13} color="#16a34a" />
                        </Pressable>
                      </View>
                    </View>
                    {/* Badge */}
                    <View style={{ backgroundColor: isInvalid ? "rgba(239,68,68,0.12)" : "rgba(22,163,74,0.12)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: isInvalid ? "rgba(239,68,68,0.35)" : "rgba(22,163,74,0.3)", alignItems: "center" }}>
                      <Text style={{ color: isInvalid ? "#ef4444" : "#16a34a", fontWeight: "800", fontSize: 13 }}>T{item.season}</Text>
                      <Text style={{ color: isInvalid ? "#ef4444" : "#16a34a", fontWeight: "800", fontSize: 13 }}>E{String(item.episode).padStart(2, "0")}</Text>
                    </View>
                  </View>
                  )}
                </View>
                </Pressable>
                );
              }}
            />
          )}

          {/* Save footer */}
          {!epMapperLoading && epMapperFiles.length > 0 && (() => {
            const epMapperVisible = epMapperFiles.filter((f) => !f.hidden);
            return (
            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: "rgba(22,163,74,0.2)", gap: 10 }}>
              {/* Status messages */}
              {epMapperSaving && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator size="small" color="#16a34a" />
                  <Text style={{ color: "#16a34a", fontSize: 12 }}>
                    Salvando {epMapperSaved}/{epMapperVisible.length} no R2...
                  </Text>
                </View>
              )}
              {epMapperClearing && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator size="small" color="#f97316" />
                  <Text style={{ color: "#f97316", fontSize: 12 }}>Removendo mapeamentos anteriores...</Text>
                </View>
              )}
              {epMapperCleared !== null && !epMapperClearing && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(249,115,22,0.08)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Feather name="check-circle" size={13} color="#f97316" />
                  <Text style={{ color: "#f97316", fontSize: 12 }}>
                    {epMapperCleared === 0 ? "Nenhum mapeamento anterior encontrado." : `${epMapperCleared} entrada${epMapperCleared !== 1 ? "s" : ""} removida${epMapperCleared !== 1 ? "s" : ""} do R2.`}
                  </Text>
                </View>
              )}

              {/* Limpar button */}
              <Pressable
                onPress={clearEpMapping}
                disabled={epMapperClearing || epMapperSaving}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                  backgroundColor: "rgba(249,115,22,0.1)", borderRadius: 10,
                  paddingVertical: 11, borderWidth: 1, borderColor: "rgba(249,115,22,0.35)",
                  opacity: (epMapperClearing || epMapperSaving) ? 0.5 : pressed ? 0.7 : 1,
                })}
              >
                {epMapperClearing
                  ? <ActivityIndicator size="small" color="#f97316" />
                  : <Feather name="trash-2" size={14} color="#f97316" />}
                <Text style={{ color: "#f97316", fontWeight: "700", fontSize: 13 }}>
                  Limpar Mapeamentos Anteriores do R2
                </Text>
              </Pressable>

              {/* Salvar button */}
              <Pressable
                onPress={saveEpMapping}
                disabled={epMapperSaving || epMapperClearing}
                style={({ pressed }) => ({
                  backgroundColor: (epMapperSaving || epMapperClearing) ? "#16a34a55" : "#16a34a",
                  borderRadius: 12, paddingVertical: 14,
                  alignItems: "center", justifyContent: "center",
                  flexDirection: "row", gap: 8,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                {epMapperSaving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Feather name="save" size={16} color="#fff" />}
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                  {epMapperSaving ? "Salvando..." : `Salvar ${epMapperVisible.length} episódio${epMapperVisible.length !== 1 ? "s" : ""} no R2`}
                </Text>
              </Pressable>
            </View>
            );
          })()}
        </View>
      </Modal>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Backdrop / Banner Preview */}
        <View style={{ height: BACKDROP_H + topPad }}>
          {/* Layer 1: Static backdrop/gradient — always visible, prevents black flash */}
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

          {/* Layer 2: Stream video — overlays backdrop once buffered, no black flash */}
          {bannerVideoUrl && (
            Platform.OS === "web" ? (
              <video
                ref={bannerVideoRef}
                src={bannerVideoUrl}
                autoPlay
                muted={bannerMuted}
                playsInline
                loop
                style={{
                  position: "absolute", top: 0, left: 0,
                  width: "100%", height: "100%",
                  objectFit: "cover", pointerEvents: "none",
                } as any}
              />
            ) : WebView ? (
              // Native: embed stream in a minimal HTML page so the browser engine
              // follows CDN redirects (HTTPS→HTTP) that RN's fetch layer blocks
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <WebView
                  ref={bannerVideoRef}
                  source={{
                    html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;background:transparent;overflow:hidden}html,body{width:100%;height:100%;background:transparent}video{width:100%;height:100%;object-fit:cover}</style></head><body><video src="${bannerVideoUrl.replace(/"/g, "&quot;")}" autoplay muted playsinline loop preload="auto"></video></body></html>`,
                  }}
                  style={StyleSheet.absoluteFill}
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                  scrollEnabled={false}
                  backgroundColor="transparent"
                />
              </View>
            ) : null
          )}

          {/* Gradient overlay */}
          <LinearGradient
            colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.55)", colors.background]}
            style={[StyleSheet.absoluteFill]}
          />

          {/* Top bar: back + share */}
          <View style={[styles.topBar, { paddingTop: topPad + 8 }]}>
            <Pressable onPress={() => router.back()} style={styles.circleBtn}>
              <Feather name="arrow-left" size={20} color="#fff" />
            </Pressable>
            <Pressable onPress={handleShare} style={styles.circleBtn}>
              <Feather name="share-2" size={20} color="#fff" />
            </Pressable>
          </View>

          {/* Mute/unmute pill — bottom right when video is playing */}
          {bannerVideoUrl && (
            <Pressable
              onPress={() => {
                const newMuted = !bannerMuted;
                setBannerMuted(newMuted);
                if (Platform.OS === "web" && bannerVideoRef.current) {
                  // Web <video> element — direct property
                  bannerVideoRef.current.muted = newMuted;
                } else if (bannerVideoRef.current?.injectJavaScript) {
                  // Native WebView — inject JS to mute/unmute the <video> inside
                  bannerVideoRef.current.injectJavaScript(
                    `(function(){ var v=document.querySelector('video'); if(v) v.muted=${newMuted}; })(); true;`
                  );
                }
              }}
              style={{ position: "absolute", bottom: 14, right: 14, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.60)", borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" }}
            >
              <Feather name={bannerMuted ? "volume-x" : "volume-2"} size={14} color="#fff" />
            </Pressable>
          )}
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
              {isLegendado && (
                <View style={styles.legBadge}>
                  <Feather name="align-left" size={11} color="#93c5fd" />
                  <Text style={styles.legBadgeText}>LEGENDADO</Text>
                </View>
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

                function fmtMs(ms: number): string {
                  if (!ms || ms < 1000) return "";
                  const totalSec = Math.floor(ms / 1000);
                  const h = Math.floor(totalSec / 3600);
                  const m = Math.floor((totalSec % 3600) / 60);
                  if (h > 0 && m > 0) return `${h}h ${m}min`;
                  if (h > 0) return `${h}h`;
                  if (m < 1) return "< 1min";
                  return `${m}min`;
                }

                const watchedMs = localProgress?.positionMs ?? 0;
                const totalMs   = localProgress?.durationMs ?? 0;
                const remainMs  = Math.max(0, totalMs - watchedMs);

                // Only items allowed by global source settings
                const visibleItems = r2Items.filter((i) => {
                  if (isDriveItem(i)) return srcSettings.drive;
                  if (isFlixItem(i))  return srcSettings.flix2;
                  return srcSettings.r2;
                });

                const hasR2 = srcSettings.r2 && (type === "movie"
                  ? visibleItems.some((i) => !isDriveItem(i) && !isFlixItem(i) && i.season == null && i.episode == null)
                  : visibleItems.some((i) => !isDriveItem(i) && !isFlixItem(i)));

                const hasDrive = srcSettings.drive && (type === "movie"
                  ? visibleItems.some((i) => isDriveItem(i) && i.season == null && i.episode == null)
                  : visibleItems.some((i) => isDriveItem(i)));

                const hasFlix = srcSettings.flix2 && (type === "movie"
                  ? visibleItems.some((i) => isFlixItem(i) && i.season == null && i.episode == null)
                  : visibleItems.some((i) => isFlixItem(i)));

                // Generic helpers that accept a ratio override (for continue/restart)
                const pressR2WithRatio = (ratio?: number) => {
                  if (type === "movie") {
                    const item = visibleItems.find((i) => !isDriveItem(i) && !isFlixItem(i) && i.season == null && i.episode == null);
                    if (item) goToR2Player(item, undefined, undefined, undefined, undefined, ratio);
                  } else {
                    const episodeItems = visibleItems.filter((i) => !isDriveItem(i) && !isFlixItem(i) && i.episode != null);
                    const lastAdded = episodeItems[episodeItems.length - 1] ?? visibleItems.find((i) => !isDriveItem(i) && !isFlixItem(i));
                    const resumeItem = (watchProgress?.season && watchProgress?.episode)
                      ? visibleItems.find((i) => !isDriveItem(i) && !isFlixItem(i) && i.season === watchProgress.season && i.episode === watchProgress.episode) ?? lastAdded
                      : lastAdded;
                    if (resumeItem) goToR2Player(resumeItem, undefined, undefined, undefined, undefined, ratio);
                  }
                };

                const pressFlixWithRatio = (ratio?: number) => {
                  const item = type === "movie"
                    ? visibleItems.find((i) => isFlixItem(i) && i.season == null && i.episode == null)
                    : visibleItems.find((i) => isFlixItem(i));
                  if (item) goToFlix2Player(item, undefined, undefined, ratio);
                };

                const pressDriveWithRatio = (ratio?: number) => {
                  const item = type === "movie"
                    ? visibleItems.find((i) => isDriveItem(i) && i.season == null && i.episode == null)
                    : visibleItems.find((i) => isDriveItem(i));
                  if (item) goToDrivePlayer(item, undefined, undefined, undefined, ratio);
                };

                const pressR2    = () => pressR2WithRatio();
                const pressFlix  = () => pressFlixWithRatio();
                const pressDrive = () => pressDriveWithRatio();

                // Flix 2.0 is primary — sources ordered: flix2, r2, drive
                const sources = [
                  hasFlix  && { id: "flix2",  press: pressFlix,  pressWith: pressFlixWithRatio },
                  hasR2    && { id: "r2",      press: pressR2,    pressWith: pressR2WithRatio },
                  hasDrive && { id: "drive",   press: pressDrive, pressWith: pressDriveWithRatio },
                ].filter(Boolean) as { id: string; press: () => void; pressWith: (r?: number) => void }[];

                const primaryPress = sources[0]?.press;

                // ── Continue watching shown FIRST, before any source-loading spinners ──
                // This ensures the CONTINUAR button is visible even while R2/Flix2 loads.
                const hasLocalProgress = !!localProgress && localProgress.progress > 0.02 && localProgress.progress < 0.95;
                if (hasLocalProgress) {
                  const watchedMs = localProgress!.positionMs ?? 0;
                  const totalMs   = localProgress!.durationMs ?? 0;
                  const remainMs  = Math.max(0, totalMs - watchedMs);
                  const sourcesReady = !r2Loading && sources.length > 0;
                  return (
                    <View style={{ marginBottom: 4 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                          {localProgress!.season != null && localProgress!.episode != null
                            ? `T${localProgress!.season}·E${localProgress!.episode}  •  ${fmtMs(watchedMs) || `${Math.round(localProgress!.progress * 100)}%`} assistidos`
                            : `${fmtMs(watchedMs) || `${Math.round(localProgress!.progress * 100)}%`} assistidos`}
                        </Text>
                        {remainMs > 0 && (
                          <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "600" }}>
                            {fmtMs(remainMs)} restantes
                          </Text>
                        )}
                      </View>
                      <View style={{ height: 2, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden", marginBottom: 14 }}>
                        <View style={{ height: 2, borderRadius: 1, backgroundColor: "#e50914", width: `${Math.min((localProgress!.progress) * 100, 100)}%` as any }} />
                      </View>
                      {sourcesReady ? (
                        <>
                          <Pressable
                            style={({ pressed }) => [styles.watchBtn, { backgroundColor: colors.primary, marginBottom: 10 }, pressed && { opacity: 0.85 }]}
                            onPress={() => tryBannerFullscreen(localProgress!.progress, () => sources[0]?.pressWith(localProgress!.progress))}
                          >
                            <Feather name="play" size={18} color="#fff" />
                            <Text style={styles.watchBtnText}>CONTINUAR</Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, marginBottom: 8 }, pressed && { opacity: 0.6 }]}
                            onPress={() => {
                              clearLocalProgress(localProgress!.contentId);
                              setLocalProgress(null);
                              tryBannerFullscreen(0, () => sources[0]?.pressWith(0));
                            }}
                          >
                            <Feather name="rotate-ccw" size={13} color="rgba(255,255,255,0.45)" />
                            <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, fontWeight: "600" }}>Começar do início</Text>
                          </Pressable>
                        </>
                      ) : (
                        <View style={{ height: 48, borderRadius: 10, backgroundColor: "rgba(229,9,20,0.08)", borderWidth: 1, borderColor: "rgba(229,9,20,0.2)", justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 8 }}>
                          <ActivityIndicator size="small" color="#e50914" />
                          <Text style={{ color: "rgba(229,9,20,0.7)", fontSize: 12, fontWeight: "500" }}>
                            {flix2Loading ? "Buscando fonte para continuar…" : "Verificando fontes…"}
                          </Text>
                        </View>
                      )}
                      {flix2Loading && !hasFlix && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: "rgba(139,92,246,0.10)", borderWidth: 1, borderColor: "rgba(139,92,246,0.25)", alignSelf: "flex-start", marginTop: 8 }}>
                          <ActivityIndicator size={10} color="#8b5cf6" />
                          <Text style={{ color: "#a78bfa", fontSize: 11, fontWeight: "600" }}>Flix 2.0 buscando…</Text>
                        </View>
                      )}
                    </View>
                  );
                }

                if (r2Loading) {
                  return (
                    <View style={{ height: 48, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)", justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 8 }}>
                      <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" />
                      <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Verificando fontes…</Text>
                    </View>
                  );
                }

                // Flix 2.0 still loading but no other sources yet → show non-blocking indicator
                if (sources.length === 0 && flix2Loading) {
                  return (
                    <View style={{ height: 48, borderRadius: 10, backgroundColor: "rgba(139,92,246,0.07)", borderWidth: 1, borderColor: "rgba(139,92,246,0.2)", justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 8 }}>
                      <ActivityIndicator size="small" color="#8b5cf6" />
                      <Text style={{ color: "#a78bfa", fontSize: 12, fontWeight: "500" }}>Buscando via Flix 2.0…</Text>
                    </View>
                  );
                }

                if (sources.length === 0) {
                  return (
                    <View style={{ gap: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
                        <Feather name="slash" size={15} color={colors.mutedForeground} />
                        <Text style={{ color: colors.mutedForeground, fontSize: 13, fontWeight: "500" }}>
                          Conteúdo indisponível no momento
                        </Text>
                      </View>
                      {user?.role === "admin" && (
                        <>
                          <View style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "rgba(234,179,8,0.08)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(234,179,8,0.25)", gap: 4 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Feather name="info" size={13} color="#eab308" />
                              <Text style={{ color: "#eab308", fontSize: 12, fontWeight: "700" }}>Diagnóstico Admin</Text>
                            </View>
                            <Text style={{ color: "rgba(234,179,8,0.8)", fontSize: 11 }}>
                              {"TMDB ID desta tela: "}<Text style={{ fontWeight: "700" }}>{tmdbId}</Text>
                            </Text>
                            {fixDone != null && (
                              <Text style={{ color: "#4ade80", fontSize: 11, fontWeight: "700", marginTop: 2 }}>
                                ✓ {fixDone} item(s) corrigido(s) com sucesso! Recarregue a tela.
                              </Text>
                            )}
                            {adminDiagnostic ? (
                              <>
                                <Text style={{ color: "#f87171", fontSize: 11, fontWeight: "600", marginTop: 2 }}>
                                  ⚠️ Conteúdo registrado com ID diferente!
                                </Text>
                                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>
                                  ID no registro: <Text style={{ color: "#fbbf24", fontWeight: "700" }}>{adminDiagnostic.ids.join(", ")}</Text>
                                  {"  →  ID desta tela: "}<Text style={{ color: "#4ade80", fontWeight: "700" }}>{tmdbId}</Text>
                                </Text>
                                <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>
                                  {adminDiagnostic.titles.join(" / ")}
                                </Text>
                              </>
                            ) : fixDone == null ? (
                              <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 }}>
                                Nenhum item no registro — use "Adicionar fonte" para vincular Drive/R2.
                              </Text>
                            ) : null}
                          </View>
                          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                            <Pressable
                              onPress={() => { setAddSrcUrl(""); setAddSrcErr(null); setShowAddSrcModal(true); }}
                              style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }, pressed && { opacity: 0.7 }]}
                            >
                              <Feather name="plus-circle" size={14} color={colors.primary} />
                              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>Adicionar fonte</Text>
                            </Pressable>
                            {adminDiagnostic && adminDiagnostic.ids.length > 0 && (
                              <Pressable
                                onPress={fixMismatchedIds}
                                disabled={fixingIds}
                                style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, backgroundColor: fixingIds ? "rgba(34,197,94,0.05)" : "rgba(34,197,94,0.15)", borderWidth: 1, borderColor: "rgba(34,197,94,0.5)" }, (pressed || fixingIds) && { opacity: 0.6 }]}
                              >
                                {fixingIds
                                  ? <ActivityIndicator size={13} color="#4ade80" />
                                  : <Feather name="tool" size={14} color="#4ade80" />
                                }
                                <Text style={{ color: "#4ade80", fontSize: 13, fontWeight: "700" }}>
                                  {fixingIds ? "Corrigindo…" : `Usar ID ${tmdbId}`}
                                </Text>
                              </Pressable>
                            )}
                            <Pressable
                              onPress={() => router.push({ pathname: "/r2-catalog", params: { initialSearch: params.title ?? "" } } as any)}
                              style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "rgba(139,92,246,0.12)", borderWidth: 1, borderColor: "rgba(139,92,246,0.35)" }, pressed && { opacity: 0.7 }]}
                            >
                              <Feather name="archive" size={14} color="#a78bfa" />
                              <Text style={{ color: "#a78bfa", fontSize: 13, fontWeight: "600" }}>Admin Catalog</Text>
                            </Pressable>
                            <Pressable
                              onPress={openEditModal}
                              style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, backgroundColor: contentOverride ? "rgba(234,179,8,0.18)" : "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: contentOverride ? "rgba(234,179,8,0.5)" : "rgba(255,255,255,0.12)" }, pressed && { opacity: 0.7 }]}
                            >
                              <Feather name="edit-2" size={14} color={contentOverride ? "#fbbf24" : colors.foreground} />
                              <Text style={{ color: contentOverride ? "#fbbf24" : colors.foreground, fontSize: 13, fontWeight: "600" }}>
                                {contentOverride ? "Editar Override" : "Editar Conteúdo"}
                              </Text>
                            </Pressable>
                          </View>
                        </>
                      )}
                    </View>
                  );
                }

                // Helper: small "Flix 2.0 buscando…" pill shown alongside existing sources
                const flix2SearchingBadge = flix2Loading && !hasFlix ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: "rgba(139,92,246,0.10)", borderWidth: 1, borderColor: "rgba(139,92,246,0.25)", alignSelf: "flex-start", marginTop: 8 }}>
                    <ActivityIndicator size={10} color="#8b5cf6" />
                    <Text style={{ color: "#a78bfa", fontSize: 11, fontWeight: "600" }}>Flix 2.0 buscando…</Text>
                  </View>
                ) : null;

                if (sources.length === 1) {
                  // Single source — show as "ASSISTIR AGORA"
                  return (
                    <>
                      <Pressable
                        style={({ pressed }) => [styles.watchBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
                        onPress={() => tryBannerFullscreen(0, primaryPress!)}
                      >
                        <Feather name="play" size={18} color="#fff" />
                        <Text style={styles.watchBtnText}>ASSISTIR AGORA</Text>
                      </Pressable>
                      {flix2SearchingBadge}
                    </>
                  );
                }

                // Multiple sources — mostra todos os servidores disponíveis
                return (
                  <>
                    {hasFlix && (
                      <Pressable
                        style={({ pressed }) => [styles.watchBtn, { backgroundColor: "#7c3aed" }, pressed && { opacity: 0.85 }]}
                        onPress={() => tryBannerFullscreen(0, pressFlix)}
                      >
                        <Feather name="play" size={18} color="#fff" />
                        <Text style={styles.watchBtnText}>ASSISTIR (FLIX 2.0)</Text>
                      </Pressable>
                    )}
                    {hasR2 && (
                      <Pressable
                        style={({ pressed }) => [
                          styles.watchBtn,
                          { backgroundColor: hasFlix ? "rgba(255,255,255,0.10)" : colors.primary, marginTop: hasFlix ? 8 : 0, borderWidth: hasFlix ? 1 : 0, borderColor: "rgba(255,255,255,0.15)" },
                          pressed && { opacity: 0.85 },
                        ]}
                        onPress={() => tryBannerFullscreen(0, pressR2)}
                      >
                        <Feather name={type === "tv" ? "tv" : "film"} size={18} color="#fff" />
                        <Text style={styles.watchBtnText}>{hasFlix ? "ASSISTIR (R2)" : "ASSISTIR AGORA"}</Text>
                      </Pressable>
                    )}
                    {hasDrive && (
                      <Pressable
                        style={({ pressed }) => [
                          styles.watchBtn,
                          { backgroundColor: "#16a34a", marginTop: (hasFlix || hasR2) ? 8 : 0 },
                          pressed && { opacity: 0.85 },
                        ]}
                        onPress={() => tryBannerFullscreen(0, pressDrive)}
                      >
                        <Feather name="cloud" size={18} color="#fff" />
                        <Text style={styles.watchBtnText}>ASSISTIR (DRIVE)</Text>
                      </Pressable>
                    )}
                    {flix2SearchingBadge}
                  </>
                );
              })()}

              {/* Action row — Trailer moved here as icon */}
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
                {trailerKey ? (
                  <Pressable style={styles.actionBtn} onPress={() => setShowTrailerModal(true)}>
                    <Feather name="play-circle" size={20} color={colors.foreground} />
                    <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>Trailer</Text>
                  </Pressable>
                ) : (
                  <Pressable style={styles.actionBtn} onPress={handleShare}>
                    <Feather name="share-2" size={20} color={colors.foreground} />
                    <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>Compartilhar</Text>
                  </Pressable>
                )}
                {isAdmin && (
                  <Pressable style={styles.actionBtn} onPress={openEditModal}>
                    <View style={{ position: "relative" }}>
                      <Feather name="edit-2" size={20} color={contentOverride ? "#fbbf24" : colors.foreground} />
                      {contentOverride && (
                        <View style={{ position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: "#fbbf24" }} />
                      )}
                    </View>
                    <Text style={[styles.actionLabel, { color: contentOverride ? "#fbbf24" : colors.mutedForeground }]}>Editar</Text>
                  </Pressable>
                )}
                {trailerKey && (
                  <Pressable style={styles.actionBtn} onPress={handleShare}>
                    <Feather name="share-2" size={20} color={colors.foreground} />
                    <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>Compartilhar</Text>
                  </Pressable>
                )}
              </View>

              {/* Tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
                {tabs.map((t) => (
                  <Pressable
                    key={t.key}
                    onPress={() => setActiveTab(t.key)}
                    style={[styles.tab, activeTab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <Text
                        style={[
                          styles.tabText,
                          { color: activeTab === t.key ? colors.foreground : colors.mutedForeground },
                        ]}
                      >
                        {t.label}
                      </Text>
                      {t.key === "episodes" && newEpisodeInfo && (
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#e50914", marginBottom: 6 }} />
                      )}
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={[styles.tabDivider, { backgroundColor: colors.border }]} />

              {/* Tab content */}
              {activeTab === "about" && (
                <View style={styles.tabContent}>
                  {newEpisodeInfo && type === "tv" && (
                    <Pressable
                      onPress={() => setActiveTab("episodes")}
                      style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#e5091412", borderWidth: 1, borderColor: "#e5091440", borderRadius: 12, padding: 12, marginBottom: 16 }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#e5091425", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 18 }}>📺</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: "#e50914", letterSpacing: 0.8, marginBottom: 2 }}>NOVO EPISÓDIO</Text>
                        <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "600" }}>
                          T{newEpisodeInfo.season}:E{newEpisodeInfo.episode}
                          {newEpisodeInfo.episode_title ? ` — ${newEpisodeInfo.episode_title}` : ""}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={16} color="#e50914" />
                    </Pressable>
                  )}
                  {/* ── EXCLUSIVO NETPLAY badge ─────────────────────────── */}
                  {r2Items.some(i => i.exclusive) && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5,
                        backgroundColor: "rgba(229,9,20,0.12)", borderWidth: 1, borderColor: "rgba(229,9,20,0.4)",
                        borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                        <Text style={{ fontSize: 10, fontWeight: "900", color: "#e50914", letterSpacing: 1.2 }}>✦ EXCLUSIVO NETPLAY</Text>
                      </View>
                      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Só aqui</Text>
                    </View>
                  )}

                  {overview ? (
                    <Text style={[styles.description, { color: colors.foreground }]}>{overview}</Text>
                  ) : (
                    <Text style={{ color: colors.mutedForeground }}>Sem descrição disponível.</Text>
                  )}

                  {/* ── Botão Conteúdo Errado ── */}
                  {!reportDone ? (
                    <Pressable
                      onPress={() => { setReportReason(null); setReportModalVisible(true); }}
                      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.07)" }, pressed && { opacity: 0.7 }]}
                    >
                      <Feather name="alert-triangle" size={12} color="#f87171" />
                      <Text style={{ color: "#f87171", fontSize: 12, fontWeight: "600" }}>Conteúdo Errado</Text>
                    </Pressable>
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: "rgba(34,197,94,0.35)", backgroundColor: "rgba(34,197,94,0.07)" }}>
                      <Feather name="check-circle" size={12} color="#4ade80" />
                      <Text style={{ color: "#4ade80", fontSize: 12, fontWeight: "600" }}>Problema reportado!</Text>
                    </View>
                  )}

                  {/* ── ADMIN: links de vídeo ─────────────────────────────── */}
                  {isAdmin && (() => {
                    const links: { id: string; label: string; source: string; url: string; color: string }[] = [];
                    // Dedup driveFilePath items by (season, episode) in display — keeps only
                    // the last entry per S+E so admin sees one clean entry per episode.
                    const drivePathSeenDisplay = new Set<string>();
                    const dedupedR2Items = [...r2Items].reverse(); // reverse so last-added is first checked
                    const visibleDrivePaths = new Set<string>(
                      dedupedR2Items
                        .filter((i) => i.driveFilePath && !i.driveUrl)
                        .reduce<string[]>((acc, i) => {
                          const key = `s${i.season ?? "null"}e${i.episode ?? "null"}`;
                          if (!drivePathSeenDisplay.has(key)) { drivePathSeenDisplay.add(key); acc.push(i.id); }
                          return acc;
                        }, [])
                    );
                    for (const item of r2Items) {
                      const base = item.label || item.title || "Item";
                      if (item.flix2Url) links.push({ id: `${item.id}-flix2`, label: base, source: "Flix 2.0", url: item.flix2Url, color: "#8b5cf6" });
                      if (item.driveUrl) links.push({ id: `${item.id}-drive`, label: base, source: "Drive", url: item.driveUrl, color: "#16a34a" });
                      if (item.driveDirectUrl && item.driveDirectUrl !== item.driveUrl)
                        links.push({ id: `${item.id}-direct`, label: base, source: "Drive Direto", url: item.driveDirectUrl, color: "#0ea5e9" });
                      if (item.driveFilePath && !item.driveUrl && visibleDrivePaths.has(item.id))
                        links.push({ id: `${item.id}-path`, label: base, source: "Drive Pasta", url: item.driveFilePath, color: "#16a34a" });
                      if (item.teraboxUrl) links.push({ id: `${item.id}-tera`, label: base, source: "TeraBox", url: item.teraboxUrl, color: "#f97316" });
                    }
                    const isLoading = r2Loading || flix2Loading;
                    return (
                      <View style={styles.adminLinksBox}>
                        <View style={styles.adminLinksHeader}>
                          <Feather name="shield" size={13} color="#e50914" />
                          <Text style={styles.adminLinksTitle}>LINKS · ADMIN</Text>
                          {isLoading && <ActivityIndicator size={11} color="#e50914" style={{ marginLeft: 6 }} />}
                        </View>
                        {links.length === 0 && !isLoading && (
                          <Text style={styles.adminLinksEmpty}>Nenhum link registrado para este título.</Text>
                        )}
                        {links.map((lk) => {
                          const wasCopied = copiedLinkId === lk.id;
                          const isConverting = convertingLinkId === lk.id;
                          const convertedUrl = convertedLinks[lk.id];
                          const isNixplay = lk.url.includes("nixplay.lat") || lk.url.includes("cineveo.lat");
                          const wasCopiedConverted = copiedLinkId === lk.id + "-converted";
                          return (
                            <View key={lk.id} style={styles.adminLinkRow}>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                  <View style={[styles.adminLinkBadge, { backgroundColor: lk.color + "22", borderColor: lk.color + "44" }]}>
                                    <Text style={[styles.adminLinkBadgeText, { color: lk.color }]}>{lk.source}</Text>
                                  </View>
                                  <Text style={[styles.adminLinkLabel, { color: colors.foreground }]} numberOfLines={1}>{lk.label}</Text>
                                </View>
                                <Text style={[styles.adminLinkUrl, { color: colors.mutedForeground }]} numberOfLines={2} selectable>{lk.url}</Text>
                                {convertedUrl ? (
                                  <View style={{ marginTop: 6, borderTopWidth: 1, borderTopColor: "#22c55e22", paddingTop: 5 }}>
                                    <Text style={{ fontSize: 9, color: "#22c55e", fontWeight: "700", letterSpacing: 0.5, marginBottom: 2 }}>URL CONVERTIDA</Text>
                                    <Text style={[styles.adminLinkUrl, { color: "#22c55e" }]} numberOfLines={2} selectable>{convertedUrl}</Text>
                                    <Pressable
                                      onPress={() => {
                                        if (Platform.OS === "web") {
                                          (navigator as any).clipboard?.writeText(convertedUrl).catch(() => {});
                                        } else {
                                          Clipboard.setString(convertedUrl);
                                        }
                                        setCopiedLinkId(lk.id + "-converted");
                                        setTimeout(() => setCopiedLinkId(null), 2000);
                                      }}
                                      style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, alignSelf: "flex-start", backgroundColor: wasCopiedConverted ? "#22c55e15" : "#22c55e10", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: wasCopiedConverted ? "#22c55e55" : "#22c55e25" }}
                                    >
                                      <Feather name={wasCopiedConverted ? "check" : "copy"} size={11} color="#22c55e" />
                                      <Text style={{ fontSize: 10, color: "#22c55e", fontWeight: "600" }}>{wasCopiedConverted ? "Copiado!" : "Copiar URL CDN"}</Text>
                                    </Pressable>
                                  </View>
                                ) : null}
                              </View>
                              <View style={{ flexDirection: "column", gap: 6, alignItems: "center" }}>
                                <Pressable
                                  onPress={() => {
                                    if (Platform.OS === "web") {
                                      (navigator as any).clipboard?.writeText(lk.url).catch(() => {});
                                    } else {
                                      Clipboard.setString(lk.url);
                                    }
                                    setCopiedLinkId(lk.id);
                                    setTimeout(() => setCopiedLinkId(null), 2000);
                                  }}
                                  style={[styles.adminCopyBtn, { borderColor: wasCopied ? "#22c55e55" : colors.border, backgroundColor: wasCopied ? "#22c55e15" : colors.card }]}
                                >
                                  <Feather name={wasCopied ? "check" : "copy"} size={14} color={wasCopied ? "#22c55e" : colors.mutedForeground} />
                                </Pressable>
                                {isNixplay && !convertedUrl && (
                                  <Pressable
                                    onPress={() => convertFlix2Link(lk.id, lk.url)}
                                    disabled={isConverting}
                                    style={{ width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#8b5cf615", borderWidth: 1, borderColor: "#8b5cf640" }}
                                  >
                                    {isConverting
                                      ? <ActivityIndicator size={12} color="#8b5cf6" />
                                      : <Feather name="zap" size={13} color="#8b5cf6" />}
                                  </Pressable>
                                )}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })()}

                  {/* ── ADMIN: Mapear Episódios Drive (pasta flat → R2 por episódio) ─── */}
                  {isAdmin && type === "tv" && driveMatches.some((m) => m.isFolder) && (
                    <Pressable
                      onPress={openEpMapper}
                      style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#16a34a18", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#16a34a44", marginBottom: 12 }}
                    >
                      <Feather name="git-branch" size={14} color="#16a34a" />
                      <Text style={{ color: "#16a34a", fontWeight: "700", fontSize: 12, letterSpacing: 0.4 }}>MAPEAR EPISÓDIOS → R2</Text>
                      <Text style={{ color: "#16a34a88", fontSize: 11, marginLeft: "auto" }}>Salva para todos os usuários</Text>
                    </Pressable>
                  )}

                  {/* ── ADMIN: Exclusivo NETPLAY toggle ─────────────────── */}
                  {isAdmin && r2Items.length > 0 && (() => {
                    const isExclusive = r2Items.some(i => i.exclusive);
                    const toggleExclusive = async () => {
                      setExclusiveLoading(true);
                      try {
                        const { r2Route } = await import("@/lib/r2-direct");
                        const newVal = !isExclusive;
                        await Promise.all(r2Items.map(item =>
                          r2Route(`/registry/${item.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ item: { ...item, exclusive: newVal } }),
                          }).catch(() => {})
                        ));
                        setR2Items(prev => prev.map(i => ({ ...i, exclusive: newVal })));
                      } finally {
                        setExclusiveLoading(false);
                      }
                    };
                    return (
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                        backgroundColor: isExclusive ? "rgba(229,9,20,0.08)" : "rgba(255,255,255,0.04)",
                        borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
                        borderWidth: 1, borderColor: isExclusive ? "rgba(229,9,20,0.25)" : "rgba(255,255,255,0.08)",
                        marginBottom: 12 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: isExclusive ? "#e50914" : colors.mutedForeground, letterSpacing: 0.5 }}>
                            ✦ EXCLUSIVO NETPLAY
                          </Text>
                          {exclusiveLoading && <ActivityIndicator size={11} color="#e50914" />}
                        </View>
                        <Switch
                          value={isExclusive}
                          onValueChange={toggleExclusive}
                          disabled={exclusiveLoading}
                          trackColor={{ false: "rgba(255,255,255,0.1)", true: "rgba(229,9,20,0.5)" }}
                          thumbColor={isExclusive ? "#e50914" : "rgba(255,255,255,0.4)"}
                          ios_backgroundColor="rgba(255,255,255,0.1)"
                        />
                      </View>
                    );
                  })()}

                  {castList.length > 0 && (
                    <View style={{ marginTop: 20 }}>
                      <Text style={[styles.castHeading, { color: colors.foreground }]}>Elenco</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                        <View style={{ flexDirection: "row", gap: 12, paddingRight: 20 }}>
                          {castList.map((person: any) => (
                            <Pressable
                              key={person.id}
                              style={({ pressed }) => [styles.castItem as any, { opacity: pressed ? 0.7 : 1 }]}
                              onPress={() =>
                                router.push({
                                  pathname: "/actor-browse",
                                  params: { name: person.name, color: colors.accentPurple ?? "#8b5cf6" },
                                })
                              }
                            >
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
                            </Pressable>
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
                    // Separate flix2 from R2/Drive per-episode items
                    const r2OnlySpecificEps = r2SpecificEps.filter((i) => !isFlixItem(i) && !isDriveItem(i));
                    const flix2SpecificEps  = r2SpecificEps.filter(isFlixItem);
                    const driveSpecificEps  = r2SpecificEps.filter(isDriveItem);

                    // Season-level registry item (episode=null) — exists when admin
                    // registered the whole season folder (always non-flix2)
                    const r2SeasonItem = r2Items.find(
                      (i) => Number(i.season) === selectedSeason && i.episode == null && !isFlixItem(i)
                    );
                    // Whether we have a real file list from the season folder scan
                    const hasFolderScan = r2SeasonItem != null && r2EpisodeNums.size > 0;

                    // Build the episode list to display (union of all available sources):
                    // 1. R2 per-episode entries OR flix2/drive entries → union of all covered episodes
                    // 2. Season folder with scanned files + any flix2 → union
                    // 3. Season folder only → show scanned episodes
                    // 4. Only flix2 → show flix2 episodes
                    // 5. No sources → show all TMDB episodes
                    // 6. TMDB failed entirely but registry has episodes → synthesize from registry
                    const hasAnyPerEpSource = r2OnlySpecificEps.length > 0 || flix2SpecificEps.length > 0 || driveSpecificEps.length > 0;
                    const allRegistryEpsForSeason = [...r2OnlySpecificEps, ...flix2SpecificEps, ...driveSpecificEps]
                      .filter((i, idx, arr) => arr.findIndex((x) => Number(x.episode) === Number(i.episode)) === idx)
                      .sort((a, b) => (Number(a.episode) || 0) - (Number(b.episode) || 0));
                    const syntheticEpisodes: TmdbEpisode[] = allRegistryEpsForSeason.map((i) => ({
                      id: Number(i.episode) || 0,
                      episode_number: Number(i.episode) || 0,
                      season_number: selectedSeason,
                      name: `Episódio ${i.episode}`,
                      overview: "",
                      still_path: null,
                      air_date: "",
                      vote_average: 0,
                      runtime: null,
                    }));
                    const displayedEpisodes = hasAnyPerEpSource
                      ? (episodeList.length > 0
                          ? episodeList.filter((ep) =>
                              r2OnlySpecificEps.some((i) => Number(i.episode) === ep.episode_number) ||
                              flix2SpecificEps.some((i) => Number(i.episode) === ep.episode_number) ||
                              driveSpecificEps.some((i) => Number(i.episode) === ep.episode_number) ||
                              (hasFolderScan && r2EpisodeNums.has(ep.episode_number))
                            )
                          : syntheticEpisodes)
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

                      // R2 match priority (excludes flix2 and drive — those have their own buttons):
                      // 1. Exact per-episode R2 entry
                      // 2. Season folder item — only if this episode was found in the scan
                      // 3. Whole-series R2 item — only if no season-specific data exists at all
                      const r2Ep =
                        r2Items.find((i) => !isFlixItem(i) && !isDriveItem(i) && Number(i.season) === selectedSeason && Number(i.episode) === ep.episode_number) ??
                        (r2SeasonItem && (hasFolderScan ? r2EpisodeNums.has(ep.episode_number) : true) ? r2SeasonItem : undefined) ??
                        (r2OnlySpecificEps.length === 0 && !r2SeasonItem
                          ? r2Items.find((i) => !isFlixItem(i) && !isDriveItem(i) && i.season == null && i.episode == null)
                          : undefined);

                      // Per-episode flix/drive match (exact registry entry for this episode)
                      const flixEpForRow = r2Items.find(
                        (i) => isFlixItem(i) && Number(i.season) === selectedSeason && Number(i.episode) === ep.episode_number
                      );
                      const driveEpForRow = r2Items.find(
                        (i) => isDriveItem(i) && Number(i.season) === selectedSeason && Number(i.episode) === ep.episode_number
                      );
                      // Fallback resolution:
                      // Flix: prefer exact episode match → series-level item (season=null, episode=null).
                      //   On a TV page, skip items whose flix2Url is a movie path (/movie/ or
                      //   get_vod_info) — these are movie-level items wrongly associated with a
                      //   series (e.g. a Tintin movie item registered on the Tintin TV series).
                      //   Do NOT fall back to per-episode items from other seasons.
                      const isFlixMovieUrl = (url: string) =>
                        url.includes("/movie/") || url.includes("get_vod_info");
                      const anyFlixItem = flixEpForRow ?? r2Items.find(
                        (i) => isFlixItem(i) && i.season == null && i.episode == null &&
                               (type !== "tv" || !isFlixMovieUrl(i.flix2Url ?? ""))
                      );
                      // Drive: prefer exact episode match → season-level drive item for current
                      //   season → series-level drive item. Do NOT fall back to drive items from
                      //   other seasons (that was causing Drive button to vanish when I restricted
                      //   the fallback too hard in a previous fix).
                      const anyDriveItem = driveEpForRow
                        ?? r2Items.find((i) => isDriveItem(i) && Number(i.season) === selectedSeason && i.episode == null)
                        ?? r2Items.find((i) => isDriveItem(i) && i.season == null && i.episode == null);
                      const anyFlixUrl   = anyFlixItem?.flix2Url;

                      return (
                        <EpisodeRow
                          key={ep.episode_number}
                          ep={ep}
                          watched={watched}
                          current={current}
                          colors={colors}
                          fallbackImage={effectiveBackdropPath ?? effectivePosterPath ?? null}
                          onPress={undefined}
                          onR2Press={srcSettings.r2 && r2Ep && !isDriveItem(r2Ep) && !isFlixItem(r2Ep) ? () => goToR2Player(r2Ep, selectedSeason, ep.episode_number) : undefined}
                          onFlixPress={(() => {
                            if (!srcSettings.flix2 || !anyFlixItem) return undefined;
                            return () => goToFlix2Player(anyFlixItem, selectedSeason, ep.episode_number);
                          })()}
                          onDrivePress={(() => {
                            if (!srcSettings.drive) return undefined;
                            // 1. Exact per-episode Drive registry entry
                            if (driveEpForRow) return () => goToDrivePlayer(driveEpForRow, selectedSeason, ep.episode_number, anyFlixUrl);
                            // 2. Drive folder scan episode map — use same r2-player as main button,
                            //    with season/episode override so it navigates to the right file.
                            //    Falls back to gdrive-player only when no registry item exists at all.
                            if (driveEpisodeMap[ep.episode_number]) {
                              if (anyDriveItem) return () => goToDrivePlayer(anyDriveItem, selectedSeason, ep.episode_number, anyFlixUrl);
                              return () => goToDriveEpisode(ep);
                            }
                            // 3. Series-level Drive entry — player will navigate to episode via override
                            if (anyDriveItem) return () => goToDrivePlayer(anyDriveItem, selectedSeason, ep.episode_number, anyFlixUrl);
                            return undefined;
                          })()}
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
  legBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(59,130,246,0.18)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.55)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legBadgeText: {
    color: "#93c5fd",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
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
  adminLinksBox: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#e5091430",
    borderRadius: 12,
    backgroundColor: "#e5091408",
    padding: 14,
    gap: 10,
  },
  adminLinksHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  adminLinksTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#e50914",
  },
  adminLinksEmpty: {
    fontSize: 12,
    color: "#888",
    fontStyle: "italic",
  },
  adminLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5091420",
  },
  adminLinkBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  adminLinkBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  adminLinkLabel: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  adminLinkUrl: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  adminCopyBtn: {
    width: 36,
    height: 36,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
