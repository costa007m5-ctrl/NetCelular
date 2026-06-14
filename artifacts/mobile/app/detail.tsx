import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Dimensions,
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
import { addCatalogWatch, removeCatalogWatch, isWatchingCatalog } from "@/lib/catalog-watch";
import type { ContentOverride, WatchProgress } from "@/lib/supabase";
import type { ContentItem } from "@/constants/content";
import { searchDriveByTitle, getDriveSeasonEpisodes, DriveMatch } from "@/lib/gdrive-search";
import { DriveItem, parseEpisodeInfo } from "@/lib/gdrive-index";

interface RegistryItem {
  id: string; r2Key: string; teraboxUrl?: string; flix2Url?: string;
  driveUrl?: string; driveDirectUrl?: string;
  driveFilePath?: string; driveNum?: number;
  tmdbId: number; tmdbType: "movie" | "tv";
  title: string; label: string; season: number | null; episode: number | null;
  quality?: string;
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
    </View>
  );
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
  const [unavailableVisible, setUnavailableVisible] = useState(false);
  const [indicated, setIndicated] = useState(false);
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

  const [r2Items, setR2Items] = useState<RegistryItem[]>([]);
  // Episode numbers (parsed from R2 filenames) for the current season's folder item
  const [r2EpisodeNums, setR2EpisodeNums] = useState<Set<number>>(new Set());
  const [srcSettings, setSrcSettings] = useState<SourceSettings>(DEFAULT_SRC);
  // Tracks if the R2/Flix2 lookup is still in progress (to avoid race on ASSISTIR AGORA)
  const [r2Loading, setR2Loading] = useState(true);
  // Tracks if the background Flix 2.0 lookup is still running (separate from r2Loading)
  const [flix2Loading, setFlix2Loading] = useState(false);
  // Admin-only: mismatched registry items (content exists but with a different tmdbId)
  const [adminDiagnostic, setAdminDiagnostic] = useState<{ count: number; ids: number[]; titles: string[] } | null>(null);
  const [fixingIds, setFixingIds] = useState(false);
  const [fixDone, setFixDone] = useState<number | null>(null);

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
          const flix2Raw = await r2Route<{ found: boolean; item: any }>(
            `/flix2/lookup?tmdbId=${tmdbId}&type=${flix2Type}&title=${encodeURIComponent(cleanTitle(params.title ?? ""))}${flix2StreamId}`
          );
          if (cancelled || !flix2Raw.found) return;
          const fi = flix2Raw.item;
          const flixItems: RegistryItem[] = [];

          if (fi?.stream_url) {
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
          } else if ((fi?.id ?? fi?.series_id) && (type === "tv" || resolvedType === "tv")) {
            // fi.id is set when the item was mapped by mapXtreamSeries;
            // fi.series_id is set when it's a raw Xtream catalog item (lookup returns raw items).
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
    return () => { cancelled = true; };
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
      const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
      const mediaType = type === "movie" ? "movie" : "tv";
      fetch(
        `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(titleQ)}&api_key=${TMDB_KEY}&language=pt-BR`
      )
        .then((r) => r.json())
        .then(async (data) => {
          const results: any[] = data.results ?? [];
          const hit =
            results.find((r: any) => r.media_type === mediaType) ??
            results[0];
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
            setSimilar(sim.map(tmdbItemToContent));
            // Propagate the resolved TMDB ID so episodes/seasons effects can run
            setResolvedTmdbId(hit.id);
            setResolvedType(hitType);
            // Build seasons list for TV shows
            if (hitType === "tv") {
              const numSeasons = (det as any).number_of_seasons ?? 1;
              setSeasons(Array.from({ length: numSeasons }, (_, i) => ({
                id: i + 1,
                season_number: i + 1,
                name: `Temporada ${i + 1}`,
                overview: "",
                episode_count: 0,
                poster_path: null,
                air_date: "",
              })));
            }
            // Also grab logo + trailer with found id
            fetch(
              `https://api.themoviedb.org/3/${hitType}/${hit.id}/images?api_key=${TMDB_KEY}&include_image_language=pt,en,null`
            )
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
            fetch(
              `https://api.themoviedb.org/3/${hitType}/${hit.id}/videos?api_key=${TMDB_KEY}&language=pt-BR`
            )
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
          } catch (e) {
            console.warn("[detail] TMDB title search fallback error:", e);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }
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
          let detWithOverview = det;
          if (!det.overview) {
            try {
              const enRes = await fetch(
                `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=8f0beb08cf016ec8de49e454e09879ec&language=en-US`
              );
              if (enRes.ok) {
                const enDet = await enRes.json();
                if (enDet.overview) detWithOverview = { ...det, overview: enDet.overview };
              }
            } catch {}
          }
          setDetails(detWithOverview);
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
          // If pt-BR overview is empty, fetch en-US and use it as fallback
          let detWithOverview = det;
          if (!det.overview) {
            try {
              const enRes = await fetch(
                `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=8f0beb08cf016ec8de49e454e09879ec&language=en-US`
              );
              if (enRes.ok) {
                const enDet = await enRes.json();
                if (enDet.overview) detWithOverview = { ...det, overview: enDet.overview };
              }
            } catch {}
          }
          setDetails(detWithOverview);
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
    const TMDB_KEY_LOCAL = "8f0beb08cf016ec8de49e454e09879ec";

    const loadEps = async () => {
      try {
        // Always fetch both locales in parallel — en-US needed for still_path + real names
        // tvSeason is wrapped in .catch so a server error does NOT reject the whole Promise.all
        // (en-US direct fetch acts as final fallback in that case)
        const [ptData, enRes] = await Promise.all([
          tmdbApi.tmdb.tvSeason(resolvedTmdbId, selectedSeason).catch(() => ({ episodes: [] } as any)),
          fetch(
            `https://api.themoviedb.org/3/tv/${resolvedTmdbId}/season/${selectedSeason}?api_key=${TMDB_KEY_LOCAL}&language=en-US`
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
                `https://api.themoviedb.org/3/tv/${resolvedTmdbId}/season/${selectedSeason}/episode/${ep.episode_number}/images?api_key=${TMDB_KEY_LOCAL}`
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
  const TMDB_KEY_EDIT = "8f0beb08cf016ec8de49e454e09879ec";

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
      const r = await fetch(
        `https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${TMDB_KEY_EDIT}&language=pt-BR`
      );
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
      const base = `https://api.themoviedb.org/3/search/${editSearchType}?api_key=${TMDB_KEY_EDIT}&language=pt-BR&query=${encodeURIComponent(q)}`;
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
        custom_title: editTitle.trim() || null,
        custom_overview: editOverviewMode === "manual" ? (editOverview.trim() || null) : null,
        overview_mode: editOverviewMode,
        poster_path: editPosterPath ?? null,
        backdrop_path: editBackdropPath ?? null,
        number_of_seasons: editSeasons ?? null,
        number_of_episodes: editEpisodes ?? null,
        vote_average: editVoteAverage ?? null,
      };
      const result = await db.contentOverrides.upsert(contentKey, payload, userId);
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

  const goToFlix2Player = (item: RegistryItem, overrideSeason?: number, overrideEpisode?: number) => {
    const seasonVal = overrideSeason != null ? overrideSeason : item.season;
    const episodeVal = overrideEpisode != null ? overrideEpisode : item.episode;
    const flix2Items = r2Items
      .filter((i) => isFlixItem(i))
      .map((i) => ({ id: i.id, flix2Url: i.flix2Url ?? "", title: i.title, label: i.label, season: i.season, episode: i.episode }));
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
        watchProgressRatio: watchProgress?.progress != null ? String(watchProgress.progress) : "",
      },
    });
  };

  const goToR2Player = (item: RegistryItem, overrideSeason?: number, overrideEpisode?: number, fallbackDriveItemId?: string, fallbackFlix2Url?: string) => {
    const seasonVal = overrideSeason != null ? overrideSeason : item.season;
    const episodeVal = overrideEpisode != null ? overrideEpisode : item.episode;
    router.push({
      pathname: "/r2-player",
      params: {
        key: item.r2Key ?? "",
        registryItemId: "",
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
        watchProgressRatio: watchProgress?.progress != null ? String(watchProgress.progress) : "",
      },
    });
  };

  const goToDrivePlayer = (item: RegistryItem, overrideSeason?: number, overrideEpisode?: number, fallbackFlix2Url?: string) => {
    const seasonVal = overrideSeason != null ? overrideSeason : item.season;
    const episodeVal = overrideEpisode != null ? overrideEpisode : item.episode;
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
    TMDB_IMG(contentOverride?.backdrop_path ?? null, "w1280") ||
    TMDB_IMG(details?.poster_path ?? null, "w780") ||
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
  // Poster e backdrop efetivos: prefere TMDB, cai no override salvo pelo admin
  const effectivePosterPath = details?.poster_path ?? contentOverride?.poster_path ?? null;
  const effectiveBackdropPath = details?.backdrop_path ?? contentOverride?.backdrop_path ?? null;
  const overview = contentOverride?.overview_mode === "manual"
    ? (contentOverride?.custom_overview ?? details?.overview ?? "")
    : (details?.overview ?? "");
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

                const pressR2 = () => {
                  if (type === "movie") {
                    const item = visibleItems.find((i) => !isDriveItem(i) && !isFlixItem(i) && i.season == null && i.episode == null);
                    if (item) goToR2Player(item);
                  } else {
                    const episodeItems = visibleItems.filter((i) => !isDriveItem(i) && !isFlixItem(i) && i.episode != null);
                    const lastAdded = episodeItems[episodeItems.length - 1] ?? visibleItems.find((i) => !isDriveItem(i) && !isFlixItem(i));
                    const resumeItem = (watchProgress?.season && watchProgress?.episode)
                      ? visibleItems.find((i) => !isDriveItem(i) && !isFlixItem(i) && i.season === watchProgress.season && i.episode === watchProgress.episode) ?? lastAdded
                      : lastAdded;
                    if (resumeItem) goToR2Player(resumeItem);
                  }
                };

                const pressFlix = () => {
                  const item = type === "movie"
                    ? visibleItems.find((i) => isFlixItem(i) && i.season == null && i.episode == null)
                    : visibleItems.find((i) => isFlixItem(i));
                  if (item) goToFlix2Player(item);
                };

                const pressDrive = () => {
                  const item = type === "movie"
                    ? visibleItems.find((i) => isDriveItem(i) && i.season == null && i.episode == null)
                    : visibleItems.find((i) => isDriveItem(i));
                  if (item) goToDrivePlayer(item);
                };

                // Flix 2.0 is primary — sources ordered: flix2, r2, drive
                const sources = [
                  hasFlix  && { id: "flix2",  press: pressFlix },
                  hasR2    && { id: "r2",      press: pressR2 },
                  hasDrive && { id: "drive",   press: pressDrive },
                ].filter(Boolean) as { id: string; press: () => void }[];

                const primaryPress = sources[0]?.press;

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
                        onPress={primaryPress}
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
                        onPress={pressFlix}
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
                        onPress={pressR2}
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
                        onPress={pressDrive}
                      >
                        <Feather name="cloud" size={18} color="#fff" />
                        <Text style={styles.watchBtnText}>ASSISTIR (DRIVE)</Text>
                      </Pressable>
                    )}
                    {flix2SearchingBadge}
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
                  {overview ? (
                    <Text style={[styles.description, { color: colors.foreground }]}>{overview}</Text>
                  ) : (
                    <Text style={{ color: colors.mutedForeground }}>Sem descrição disponível.</Text>
                  )}

                  {/* ── ADMIN: links de vídeo ─────────────────────────────── */}
                  {isAdmin && (() => {
                    const links: { id: string; label: string; source: string; url: string; color: string }[] = [];
                    for (const item of r2Items) {
                      const base = item.label || item.title || "Item";
                      if (item.flix2Url) links.push({ id: `${item.id}-flix2`, label: base, source: "Flix 2.0", url: item.flix2Url, color: "#8b5cf6" });
                      if (item.driveUrl) links.push({ id: `${item.id}-drive`, label: base, source: "Drive", url: item.driveUrl, color: "#16a34a" });
                      if (item.driveDirectUrl && item.driveDirectUrl !== item.driveUrl)
                        links.push({ id: `${item.id}-direct`, label: base, source: "Drive Direto", url: item.driveDirectUrl, color: "#0ea5e9" });
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

                  {castList.length > 0 && (
                    <View style={{ marginTop: 20 }}>
                      <Text style={[styles.castHeading, { color: colors.foreground }]}>Elenco</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                        <View style={{ flexDirection: "row", gap: 12, paddingRight: 20 }}>
                          {castList.map((person: any) => (
                            <View key={person.id} style={styles.castItem as any}>
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

                      const flixEpForRow = r2Items.find(
                        (i) => isFlixItem(i) && Number(i.season) === selectedSeason && Number(i.episode) === ep.episode_number
                      );
                      const driveEpForRow = r2Items.find(
                        (i) => isDriveItem(i) && Number(i.season) === selectedSeason && Number(i.episode) === ep.episode_number
                      );

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
                            if (!srcSettings.flix2) return undefined;
                            if (!flixEpForRow) return undefined;
                            return () => goToFlix2Player(flixEpForRow, selectedSeason, ep.episode_number);
                          })()}
                          onDrivePress={(() => {
                            if (!srcSettings.drive) return undefined;
                            if (!driveEpForRow) return undefined;
                            const flix2Url = flixEpForRow?.flix2Url;
                            return () => goToDrivePlayer(driveEpForRow, selectedSeason, ep.episode_number, flix2Url);
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
