import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import { r2Route, teraboxResolve, extractTitleAndYear } from "@/lib/r2-direct";
import { getApiDomainDisplay, getApiBase } from "@/lib/api";
import { listFolder, isFolder as driveIsFolder, isVideo as driveIsVideo, getStreamUrl, formatSize as driveFormatSize, DRIVE_ROOTS, DriveItem, parseEpisodeInfo } from "@/lib/gdrive-index";

const UPLOADED_URLS_KEY = "r2_uploaded_urls_v1";

const RED = "#e50914";
const { width: W } = Dimensions.get("window");
const POSTER_W = (W - 48) / 3;
const POSTER_H = POSTER_W * 1.5;
const TMDB_IMG = (path: string | null, size = "w500") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

async function fetchTmdbById(id: number): Promise<TmdbSearchResult | null> {
  for (const type of ["movie", "tv"] as const) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`${TMDB_BASE_URL}/${type}/${id}?api_key=${TMDB_KEY}&language=pt-BR`, { signal: ctrl.signal });
      clearTimeout(tid);
      if (!res.ok) continue;
      const d = await res.json();
      const title: string = type === "movie" ? (d.title ?? d.original_title ?? "") : (d.name ?? d.original_name ?? "");
      if (!title) continue;
      return { id: d.id, title, poster_path: d.poster_path ?? null, media_type: type };
    } catch {}
  }
  return null;
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface SeasonInfo { number: number; prefix: string; label: string }
interface TmdbMatch {
  id: number; title: string; poster_path: string | null;
  backdrop_path: string | null; overview: string; vote_average: number;
  media_type: "movie" | "tv";
}
interface CatalogEntry {
  key: string; name: string; type: "movie" | "tv" | "unknown";
  seasons: SeasonInfo[]; tmdb: TmdbMatch | null;
}
interface Episode {
  key: string; name: string; size: number;
  lastModified: string | null; episode: number | null;
}
interface FileItem {
  type: "file" | "folder"; key: string; name: string;
  size?: number; isVideo?: boolean; fileType?: string;
}
interface Job {
  status: "queued" | "downloading" | "uploading" | "done" | "error";
  progress: number; downloaded: number; total: number; error?: string; key?: string;
}
interface RegistryItem {
  id: string; r2Key: string; teraboxUrl?: string; fileIndex?: number;
  tmdbId: number; tmdbType: "movie" | "tv";
  title: string; label: string; season: number | null; episode: number | null;
  r2Folder?: string; quality?: string;
}
interface TmdbSearchResult {
  id: number; title: string; poster_path: string | null; media_type: "movie" | "tv";
}

type Tab = "catalog" | "upload" | "manage" | "terabox" | "flix2";
type UploadMode = "url" | "gdrive" | "terabox" | "local" | "drive";
type MediaKind = "tv" | "movie";
type CatalogView =
  | { screen: "catalog" }
  | { screen: "seasons"; entry: CatalogEntry }
  | { screen: "episodes"; entry: CatalogEntry; season: SeasonInfo };

// ── API helpers ────────────────────────────────────────────────────────────────

function mkAbort(ms = 60000): [AbortSignal, () => void] {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  return [ctrl.signal, () => clearTimeout(tid)];
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  return r2Route<T>(path, options);
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  return r2Route<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function formatBytes(bytes: number): string {
  if (!bytes) return "";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

// ── Episode List ───────────────────────────────────────────────────────────────

function EpisodeList({ entry, season, onBack, onRegister }: {
  entry: CatalogEntry; season: SeasonInfo;
  onBack: () => void; onRegister: (key: string, ep?: number) => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ episodes: Episode[] }>(`/episodes?prefix=${encodeURIComponent(season.prefix)}`)
      .then((d) => setEpisodes(d.episodes))
      .catch(() => {})
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
    } finally { setOpening(null); }
  };

  return (
    <View style={styles.subScreen}>
      <View style={[styles.subHeader, { paddingTop: (Platform.OS === "web" ? 0 : insets.top) + 12 }]}>
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
      ) : (
        <FlatList
          data={episodes}
          keyExtractor={(ep) => ep.key}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 100 }}
          ListEmptyComponent={<View style={[styles.center, { paddingTop: 60 }]}><Text style={styles.dim}>Nenhum episódio</Text></View>}
          renderItem={({ item: ep }) => (
            <View style={styles.epRow}>
              <View style={styles.epNumBadge}>
                {opening === ep.key ? <ActivityIndicator color={RED} size="small" /> : <Text style={styles.epNum}>{ep.episode ?? "?"}</Text>}
              </View>
              <Pressable style={{ flex: 1 }} onPress={() => openEpisode(ep)}>
                <Text style={styles.epName} numberOfLines={2}>{ep.name.replace(/\.[^.]+$/, "")}</Text>
                {ep.size > 0 && <Text style={styles.epMeta}>{formatBytes(ep.size)}</Text>}
              </Pressable>
              <Pressable onPress={() => openEpisode(ep)} style={{ padding: 8 }}>
                <Feather name="play-circle" size={22} color={RED} />
              </Pressable>
              <Pressable onPress={() => onRegister(ep.key, ep.episode ?? undefined)} style={{ padding: 8 }}>
                <Feather name="link" size={18} color="rgba(255,255,255,0.4)" />
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

// ── Season List ────────────────────────────────────────────────────────────────

function SeasonList({ entry, onBack, onSelectSeason, onEdit }: {
  entry: CatalogEntry; onBack: () => void; onSelectSeason: (s: SeasonInfo) => void;
  onEdit: (entry: CatalogEntry) => void;
}) {
  const insets = useSafeAreaInsets();
  const [registering, setRegistering] = useState<string | null>(null);
  const [registered, setRegisteredSeasons] = useState<Set<string>>(new Set());
  const [registerQuality, setRegisterQuality] = useState("1080p");

  // Carrega quais temporadas já estão registradas no R2
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { r2Route } = await import("@/lib/r2-direct");
        const reg = await r2Route<{ version: number; items: any[] }>("/registry");
        if (cancelled) return;
        const prefixSet = new Set(
          (reg.items ?? [])
            .filter((i: any) => entry.seasons.some((s) => s.prefix === i.r2Key))
            .map((i: any) => i.r2Key as string)
        );
        setRegisteredSeasons(prefixSet);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [entry]);

  const quickRegisterSeason = async (s: SeasonInfo) => {
    if (!entry.tmdb) {
      Alert.alert("Sem TMDB", "Vincule o título ao TMDB primeiro (botão de editar) para poder registrar automaticamente.");
      return;
    }
    setRegistering(s.prefix);
    try {
      await apiPost("/registry/add", {
        item: {
          r2Key: s.prefix,
          tmdbId: entry.tmdb.id,
          tmdbType: entry.tmdb.media_type,
          title: entry.tmdb.title,
          label: s.label,
          season: s.number,
          episode: null,
          quality: registerQuality,
        },
      });
      setRegisteredSeasons((prev) => new Set([...prev, s.prefix]));
      Alert.alert("Registrado!", `Temporada ${s.number} registrada. Todos os episódios desta temporada já aparecem com botão R2 no app.`);
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Falha ao registrar");
    } finally {
      setRegistering(null);
    }
  };

  return (
    <View style={styles.subScreen}>
      {entry.tmdb?.backdrop_path && (
        <>
          <Image source={{ uri: TMDB_IMG(entry.tmdb.backdrop_path, "w1280") ?? "" }} style={styles.detailBackdrop} contentFit="cover" />
          <View style={styles.backdropGrad} />
        </>
      )}
      <View style={[styles.subHeader, { paddingTop: (Platform.OS === "web" ? 0 : insets.top) + 12 }]}>
        <Pressable onPress={onBack} style={styles.iconBtn}><Feather name="arrow-left" size={22} color="#fff" /></Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => onEdit(entry)} style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 8, marginRight: 4 }]}>
          <Feather name="edit-2" size={17} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        <View style={styles.detailMeta}>
          {entry.tmdb?.poster_path && (
            <Image source={{ uri: TMDB_IMG(entry.tmdb.poster_path, "w500") ?? "" }} style={styles.detailPoster} contentFit="cover" />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.detailTitle}>{entry.tmdb?.title ?? entry.name}</Text>
            {entry.tmdb?.vote_average ? <Text style={styles.detailRating}>⭐ {entry.tmdb.vote_average.toFixed(1)}</Text> : null}
            {entry.tmdb?.overview ? <Text style={styles.detailOverview} numberOfLines={4}>{entry.tmdb.overview}</Text> : null}
          </View>
        </View>
        {/* Quality selector for quick-register */}
        <Text style={[styles.seasonHeader, { marginBottom: 4 }]}>Qualidade (para registrar)</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, marginBottom: 12 }}>
          {["4K", "1080p", "720p", "480p", "360p"].map((q) => {
            const qColors: Record<string, string> = { "4K": "#a78bfa", "1080p": "#60a5fa", "720p": "#34d399", "480p": "#f59e0b", "360p": "#fb923c" };
            const isActive = registerQuality === q;
            return (
              <Pressable
                key={q}
                onPress={() => setRegisterQuality(q)}
                style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5,
                  borderColor: isActive ? (qColors[q] ?? RED) : "rgba(255,255,255,0.15)",
                  backgroundColor: isActive ? `${qColors[q] ?? RED}22` : "transparent" }}
              >
                <Text style={{ color: isActive ? (qColors[q] ?? RED) : "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "600" }}>{q}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.seasonHeader}>Temporadas</Text>
        {entry.seasons.length === 0 ? (
          <Pressable
            style={({ pressed }) => [styles.seasonRow, pressed && { opacity: 0.7 }]}
            onPress={() => onSelectSeason({ number: 1, prefix: entry.key, label: "Todos os episódios" })}
          >
            <View style={styles.seasonIcon}><Feather name="play" size={20} color={RED} /></View>
            <Text style={styles.seasonLabel}>Ver todos os episódios</Text>
            <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.4)" />
          </Pressable>
        ) : (
          entry.seasons.map((s) => {
            const isRegistering = registering === s.prefix;
            const isRegistered = registered.has(s.prefix);
            return (
              <View key={s.prefix} style={styles.seasonRow}>
                <Pressable style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 12 }} onPress={() => onSelectSeason(s)}>
                  <View style={styles.seasonIcon}><Feather name="tv" size={20} color={RED} /></View>
                  <Text style={styles.seasonLabel}>{s.label}</Text>
                  <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.4)" />
                </Pressable>
                <Pressable
                  onPress={() => quickRegisterSeason(s)}
                  disabled={isRegistering}
                  style={[
                    styles.registerSeasonBtn,
                    isRegistered && { backgroundColor: "rgba(74,222,128,0.15)", borderColor: "#4ade80" },
                  ]}
                >
                  {isRegistering ? (
                    <ActivityIndicator size="small" color={RED} />
                  ) : (
                    <Feather name={isRegistered ? "check" : "cloud"} size={15} color={isRegistered ? "#4ade80" : "rgba(255,255,255,0.6)"} />
                  )}
                  <Text style={[styles.registerSeasonBtnText, isRegistered && { color: "#4ade80" }]}>
                    {isRegistered ? "Registrado" : "Registrar"}
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ── Catalog Grid ───────────────────────────────────────────────────────────────

function CatalogGrid({ onSelect, onRegister, onEdit, initialSearch }: {
  onSelect: (entry: CatalogEntry) => void;
  onRegister: (key: string) => void;
  onEdit: (entry: CatalogEntry) => void;
  initialSearch?: string;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forceRefreshing, setForceRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch ?? "");
  const [opening, setOpening] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setError(null);
    if (!refresh) setLoading(true);
    try {
      const path = refresh ? "/catalog?refresh=true" : "/catalog";
      const data = await apiFetch<{ catalog: CatalogEntry[] }>(path);
      setEntries(data.catalog);
    } catch (e: any) {
      setError(e.message ?? "Erro ao carregar catálogo");
    } finally { setLoading(false); setRefreshing(false); setForceRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const isTeraboxEntry = (entry: CatalogEntry) => entry.key.startsWith("__tb__/");

  const handleDelete = (entry: CatalogEntry) => {
    const title = entry.tmdb?.title ?? entry.name;
    Alert.alert(
      "Deletar conteúdo",
      `Remover "${title}" do catálogo?\n\nEsta ação não pode ser desfeita.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Deletar",
          style: "destructive",
          onPress: async () => {
            setDeletingKey(entry.key);
            try {
              const qs = `prefix=${encodeURIComponent(entry.key)}${entry.tmdb?.id ? `&tmdbId=${entry.tmdb.id}` : ""}`;
              await apiFetch(`/catalog-entry?${qs}`, { method: "DELETE" });
              setEntries((prev) => prev.filter((e) => e.key !== entry.key));
            } catch (e: any) {
              Alert.alert("Erro ao deletar", e.message ?? "Falha ao remover conteúdo");
            } finally { setDeletingKey(null); }
          },
        },
      ]
    );
  };

  const openTeraboxEntry = (entry: CatalogEntry) => {
    if (!entry.tmdb?.id) return;
    router.push({
      pathname: "/detail",
      params: { type: entry.type, id: String(entry.tmdb.id), title: entry.tmdb.title ?? entry.name },
    });
  };

  const openMovie = async (entry: CatalogEntry) => {
    if (isTeraboxEntry(entry)) { openTeraboxEntry(entry); return; }
    setOpening(entry.key);
    try {
      const data = await apiFetch<{ files: FileItem[] }>(`/list?prefix=${encodeURIComponent(entry.key)}&delimiter=/`);
      const vid = data.files.find((f) => f.isVideo);
      if (!vid) { setError("Nenhum arquivo de vídeo nesta pasta"); return; }
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
    } catch (e: any) { setError(e.message); }
    finally { setOpening(null); }
  };

  const filtered = search ? entries.filter((e) => (e.tmdb?.title ?? e.name).toLowerCase().includes(search.toLowerCase())) : entries;

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator color={RED} size="large" />
      <Text style={[styles.dim, { marginTop: 12 }]}>Carregando e buscando no TMDB…</Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchRow}>
        <Feather name="search" size={15} color="rgba(255,255,255,0.4)" />
        <TextInput style={styles.searchInput} placeholder="Buscar título..." placeholderTextColor="rgba(255,255,255,0.3)" value={search} onChangeText={setSearch} />
        {search.length > 0 && <Pressable onPress={() => setSearch("")}><Feather name="x" size={15} color="rgba(255,255,255,0.4)" /></Pressable>}
        <Pressable
          onPress={() => { if (!forceRefreshing) { setForceRefreshing(true); load(true); } }}
          style={{ marginLeft: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: forceRefreshing ? "rgba(229,9,20,0.15)" : "rgba(255,255,255,0.06)", flexDirection: "row", alignItems: "center", gap: 5 }}
          hitSlop={8}
        >
          {forceRefreshing
            ? <ActivityIndicator size={14} color={RED} />
            : <Feather name="refresh-cw" size={14} color={entries.length === 0 ? RED : "rgba(255,255,255,0.45)"} />}
          {!forceRefreshing && entries.length > 0 && (
            <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: "600" }}>{entries.length}</Text>
          )}
        </Pressable>
      </View>
      {error ? (
        <View style={styles.center}>
          <Feather name="cloud-off" size={40} color="rgba(255,255,255,0.3)" />
          <Text style={[styles.dim, { marginTop: 12 }]}>{error}</Text>
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={RED} />}
          ListEmptyComponent={<View style={[styles.center, { paddingTop: 60 }]}><Text style={styles.dim}>Nenhum título</Text></View>}
          renderItem={({ item: entry }) => {
            const poster = entry.tmdb?.poster_path ? TMDB_IMG(entry.tmdb.poster_path) : null;
            const isBusy = opening === entry.key;
            const isTB = isTeraboxEntry(entry);
            const onPressEntry = () => {
              if (isTB) { openTeraboxEntry(entry); return; }
              if (entry.type === "movie") { openMovie(entry); } else { onSelect(entry); }
            };
            return (
              <Pressable style={({ pressed }) => [styles.posterCard, pressed && { opacity: 0.8 }]} onPress={onPressEntry}>
                <View style={styles.posterWrap}>
                  {poster ? <Image source={{ uri: poster }} style={styles.posterImg} contentFit="cover" /> : <View style={styles.posterPlaceholder}><Feather name="film" size={28} color="rgba(255,255,255,0.2)" /></View>}
                  <View style={[styles.typeBadge, { backgroundColor: entry.type === "tv" ? "#1a6bb5" : RED }]}>
                    <Text style={styles.typeBadgeText}>{entry.type === "tv" ? "SÉRIE" : "FILME"}</Text>
                  </View>
                  {isTB && (
                    <View style={{ position: "absolute", top: 6, right: 6, backgroundColor: "#f59e0b", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 }}>
                      <Text style={{ color: "#000", fontSize: 8, fontWeight: "900" }}>TB</Text>
                    </View>
                  )}
                  {(isBusy || deletingKey === entry.key) && <View style={styles.posterLoading}><ActivityIndicator color="#fff" size="small" /></View>}
                  {!isTB && (
                    <>
                      <Pressable style={[styles.registerOverlay, { right: 28 }]} onPress={() => onEdit(entry)}>
                        <Feather name="edit-2" size={11} color="#fff" />
                      </Pressable>
                      <Pressable style={styles.registerOverlay} onPress={() => onRegister(entry.key)}>
                        <Feather name="link" size={12} color="#fff" />
                      </Pressable>
                    </>
                  )}
                  <Pressable
                    style={[styles.registerOverlay, { left: 0, right: "auto" as any, backgroundColor: "rgba(180,20,20,0.82)" }]}
                    onPress={() => handleDelete(entry)}
                  >
                    <Feather name="trash-2" size={11} color="#fff" />
                  </Pressable>
                </View>
                <Text style={styles.posterTitle} numberOfLines={2}>{entry.tmdb?.title ?? entry.name}</Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

// ── Folder Picker Modal ────────────────────────────────────────────────────────

function FolderPickerModal({ onSelect, onClose }: {
  onSelect: (prefix: string) => void; onClose: () => void;
}) {
  const [path, setPath] = useState("");
  const [folders, setFolders] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (prefix: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ folders: FileItem[] }>(`/list?prefix=${encodeURIComponent(prefix)}&delimiter=/&noFallback=true`);
      setFolders(data.folders);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(""); }, []);

  const navigate = (folder: FileItem) => {
    setPath(folder.key);
    setCreating(false);
    load(folder.key);
  };

  const goUp = () => {
    const parts = path.replace(/\/$/, "").split("/");
    parts.pop();
    const newPath = parts.length && parts[0] ? `${parts.join("/")}/` : "";
    setPath(newPath);
    setCreating(false);
    load(newPath);
  };

  const createFolder = async () => {
    const n = newName.trim();
    if (!n) return;
    const fullPrefix = path ? `${path}${n}/` : `${n}/`;
    setSaving(true);
    try {
      await apiPost("/mkdir", { prefix: fullPrefix });
      setNewName("");
      setCreating(false);
      await load(path);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const pathParts = path ? path.replace(/\/$/, "").split("/") : [];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalWrap, { backgroundColor: "#0d0d0d" }]}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Escolher pasta</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Pressable
              onPress={() => { setCreating((v) => !v); setNewName(""); }}
              style={{ backgroundColor: creating ? `${RED}30` : "rgba(255,255,255,0.08)", borderRadius: 8, padding: 6 }}
            >
              <Feather name={creating ? "minus" : "plus"} size={18} color={creating ? RED : "#fff"} />
            </Pressable>
            <Pressable onPress={onClose}><Feather name="x" size={22} color="rgba(255,255,255,0.6)" /></Pressable>
          </View>
        </View>

        {/* Inline create folder form */}
        {creating && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 10 }}>
            <Feather name="folder-plus" size={16} color="#f59e0b" />
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0, paddingVertical: 8 }]}
              placeholder={path ? `Nova subpasta em "${path.replace(/\/$/, "").split("/").pop()}"` : "Nome da nova pasta"}
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={newName}
              onChangeText={setNewName}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              onSubmitEditing={createFolder}
              returnKeyType="done"
            />
            <Pressable
              style={{ backgroundColor: RED, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}
              onPress={createFolder}
              disabled={saving || !newName.trim()}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Criar</Text>}
            </Pressable>
          </View>
        )}

        {/* Breadcrumb */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.breadcrumb}
          contentContainerStyle={{ alignItems: "center", paddingHorizontal: 12, gap: 4 }}>
          <Pressable onPress={() => { setPath(""); setCreating(false); load(""); }} style={styles.breadcrumbItem}>
            <Feather name="home" size={13} color={RED} />
          </Pressable>
          {pathParts.map((p, i) => (
            <React.Fragment key={i}>
              <Text style={styles.breadcrumbSep}>/</Text>
              <Pressable onPress={() => {
                const np = pathParts.slice(0, i + 1).join("/") + "/";
                setPath(np); setCreating(false); load(np);
              }} style={styles.breadcrumbItem}>
                <Text style={styles.breadcrumbText} numberOfLines={1}>{p}</Text>
              </Pressable>
            </React.Fragment>
          ))}
        </ScrollView>

        {error && <View style={[styles.errorBox, { marginHorizontal: 16, marginBottom: 8 }]}><Text style={styles.errorBoxText}>{error}</Text></View>}

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={RED} /></View>
        ) : (
          <FlatList
            data={folders}
            keyExtractor={(f) => f.key}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
            ListHeaderComponent={path ? (
              <Pressable style={styles.upRow} onPress={goUp}>
                <Feather name="corner-left-up" size={16} color="rgba(255,255,255,0.5)" />
                <Text style={styles.upText}>.. (pasta acima)</Text>
              </Pressable>
            ) : null}
            ListEmptyComponent={
              <View style={[styles.center, { paddingTop: 40 }]}>
                <Feather name="folder" size={32} color="rgba(255,255,255,0.15)" />
                <Text style={[styles.dim, { marginTop: 12 }]}>Nenhuma subpasta aqui</Text>
                <Pressable onPress={() => setCreating(true)} style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Feather name="plus-circle" size={14} color={RED} />
                  <Text style={{ color: RED, fontSize: 13 }}>Criar pasta aqui</Text>
                </Pressable>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable style={styles.fileRow} onPress={() => navigate(item)}>
                <Feather name="folder" size={18} color="#f59e0b" />
                <Text style={[styles.fileName, { flex: 1, marginLeft: 10 }]}>{item.name}</Text>
                <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.3)" />
              </Pressable>
            )}
          />
        )}

        {/* Fixed confirm button at bottom */}
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" }}>
          <Pressable
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
              backgroundColor: RED, borderRadius: 12, paddingVertical: 15 }}
            onPress={() => { onSelect(path); onClose(); }}
          >
            <Feather name="check" size={20} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
              {path ? `Confirmar: ${path.replace(/\/$/, "").split("/").pop()}` : "Usar pasta raiz"}
            </Text>
          </Pressable>
          {path && (
            <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, textAlign: "center", marginTop: 6 }} numberOfLines={1}>
              📁 {path.replace(/\/$/, "")}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Upload Panel ───────────────────────────────────────────────────────────────

interface BulkJobItem {
  url: string;
  jobId: string | null;
  status: "queued" | "downloading" | "uploading" | "done" | "error";
  progress: number;
  key: string;
  error?: string;
}

function UploadPanel() {
  const insets = useSafeAreaInsets();
  const [uploadMode, setUploadMode] = useState<UploadMode>("url");

  // ── URL / bulk state ──
  const [url, setUrl] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("");
  const [fileName, setFileName] = useState("");
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bulk upload state
  const [bulkUrls, setBulkUrls] = useState("");
  const [bulkParsed, setBulkParsed] = useState<{ url: string; selected: boolean }[]>([]);
  const [bulkFolder, setBulkFolder] = useState("");
  const [showBulkFolderPicker, setShowBulkFolderPicker] = useState(false);
  const [bulkJobs, setBulkJobs] = useState<BulkJobItem[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const bulkPollRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [uploadedUrls, setUploadedUrls] = useState<Set<string>>(new Set());

  // ── Google Drive state ──
  const [gdriveUrl, setGdriveUrl] = useState("");
  const [gdriveFolder, setGdriveFolder] = useState("");
  const [showGdriveFolderPicker, setShowGdriveFolderPicker] = useState(false);
  const [gdriveResolved, setGdriveResolved] = useState<{ directUrl: string; name: string } | null>(null);
  const [gdriveFileName, setGdriveFileName] = useState("");
  const [gdriveLoading, setGdriveLoading] = useState(false);
  const [gdriveJob, setGdriveJob] = useState<Job | null>(null);
  const [gdriveJobId, setGdriveJobId] = useState<string | null>(null);
  const [gdriveError, setGdriveError] = useState<string | null>(null);
  const [gdriveSuccess, setGdriveSuccess] = useState<string | null>(null);
  const gdrivePollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── TeraBox link → R2 state ──
  const [teraUrl, setTeraUrl] = useState("");
  const [teraFolder, setTeraFolder] = useState("");
  const [showTeraFolderPicker, setShowTeraFolderPicker] = useState(false);
  const [teraFiles, setTeraFiles] = useState<any[]>([]);
  const [teraSelected, setTeraSelected] = useState<Set<number>>(new Set());
  const [teraLoading, setTeraLoading] = useState(false);
  const [teraError, setTeraError] = useState<string | null>(null);
  const [teraJobs, setTeraJobs] = useState<BulkJobItem[]>([]);
  const [teraRunning, setTeraRunning] = useState(false);
  const teraPollRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Batch media kind + per-item title override ──
  const [batchMediaKind, setBatchMediaKind] = useState<MediaKind>("tv");
  const [batchItemTitles, setBatchItemTitles] = useState<Record<number, string>>({});
  const [singleMediaKind, setSingleMediaKind] = useState<MediaKind>("tv");

  // ── Drive Index browser state ──
  type DriveNavEntry = { drive: 0 | 1; path: string; name: string };
  const [driveNav, setDriveNav] = useState<DriveNavEntry[]>([]);
  const [driveItems, setDriveItems] = useState<DriveItem[]>([]);
  const [drivePageToken, setDrivePageToken] = useState<string | null>(null);
  const [drivePageLoading, setDrivePageLoading] = useState(false);
  const [driveBrowseLoading, setDriveBrowseLoading] = useState(false);
  const [driveBrowseError, setDriveBrowseError] = useState<string | null>(null);
  const [driveSelectedIds, setDriveSelectedIds] = useState<Set<string>>(new Set());
  const [driveSelectedMap, setDriveSelectedMap] = useState<Map<string, DriveItem>>(new Map());
  const [driveDestFolder, setDriveDestFolder] = useState("");
  const [showDriveDestPicker, setShowDriveDestPicker] = useState(false);
  const [driveJobs, setDriveJobs] = useState<BulkJobItem[]>([]);
  const [driveRunning, setDriveRunning] = useState(false);
  const drivePollRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Local file upload state ──
  const [localFile, setLocalFile] = useState<{ name: string; uri: string; size: number; mimeType: string } | null>(null);
  const [localFolder, setLocalFolder] = useState("");
  const [showLocalFolderPicker, setShowLocalFolderPicker] = useState(false);
  const [localFileName, setLocalFileName] = useState("");
  const [localUploading, setLocalUploading] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);

  // Load previously uploaded URLs from storage
  useEffect(() => {
    AsyncStorage.getItem(UPLOADED_URLS_KEY)
      .then((val) => { if (val) setUploadedUrls(new Set(JSON.parse(val) as string[])); })
      .catch(() => {});
  }, []);

  const markUrlAsUploaded = async (url: string) => {
    setUploadedUrls((prev) => {
      const next = new Set(prev);
      next.add(url);
      AsyncStorage.setItem(UPLOADED_URLS_KEY, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  };

  const stopPoll = () => { if (pollRef.current) clearTimeout(pollRef.current); };

  // ── Google Drive helpers ──
  const resolveGdrive = async () => {
    const u = gdriveUrl.trim();
    if (!u) { setGdriveError("Cole o link do Google Drive"); return; }
    setGdriveLoading(true);
    setGdriveError(null);
    setGdriveResolved(null);
    setGdriveJob(null);
    setGdriveSuccess(null);
    try {
      const r = await apiPost<{ directUrl: string; fileId: string; name: string }>("/gdrive-resolve", { url: u });
      setGdriveResolved(r);
      setGdriveFileName(r.name);
    } catch (e: any) { setGdriveError(e.message ?? "Erro ao resolver link"); }
    finally { setGdriveLoading(false); }
  };

  const startGdriveDownload = async () => {
    if (!gdriveResolved) return;
    const fn = gdriveFileName.trim() || gdriveResolved.name;
    const folderBase = gdriveFolder ? (gdriveFolder.endsWith("/") ? gdriveFolder : `${gdriveFolder}/`) : "";
    const key = `${folderBase}${fn}`;
    setGdriveLoading(true);
    setGdriveError(null);
    setGdriveSuccess(null);
    setGdriveJob(null);
    try {
      const r = await apiPost<{ jobId: string }>("/download-url", { url: gdriveResolved.directUrl, key });
      setGdriveJobId(r.jobId);
      const poll = async () => {
        try {
          const j = await apiFetch<Job>(`/job/${r.jobId}`);
          setGdriveJob(j);
          if (j.status === "done") {
            setGdriveSuccess(`✅ Enviado: ${j.key ?? key}`);
            setGdriveLoading(false);
            setGdriveUrl("");
            setGdriveResolved(null);
            setGdriveFileName("");
          } else if (j.status === "error") {
            setGdriveError(j.error ?? "Falha no download");
            setGdriveLoading(false);
          } else {
            gdrivePollRef.current = setTimeout(poll, 1200);
          }
        } catch { gdrivePollRef.current = setTimeout(poll, 2000); }
      };
      poll();
    } catch (e: any) { setGdriveError(e.message ?? "Erro"); setGdriveLoading(false); }
  };

  // ── TeraBox link → R2 helpers ──
  const resolveTeraBox = async () => {
    const u = teraUrl.trim();
    if (!u) { setTeraError("Cole o link do TeraBox"); return; }
    setTeraLoading(true);
    setTeraError(null);
    setTeraFiles([]);
    setTeraSelected(new Set());
    setTeraJobs([]);
    try {
      const r = await teraboxResolve(u);
      setTeraFiles(r.list ?? []);
      const allIdxs = new Set((r.list ?? []).map((_: any, i: number) => i));
      setTeraSelected(allIdxs);
    } catch (e: any) { setTeraError(e.message ?? "Erro ao resolver link TeraBox"); }
    finally { setTeraLoading(false); }
  };

  const startTeraDownload = async () => {
    const toUpload = teraFiles.filter((_, i) => teraSelected.has(i));
    if (toUpload.length === 0) return;
    const folderBase = teraFolder ? (teraFolder.endsWith("/") ? teraFolder : `${teraFolder}/`) : "__auto__";
    const initial: BulkJobItem[] = toUpload.map((f) => ({
      url: f.fast_dlink, jobId: null, status: "queued", progress: 0, key: folderBase,
    }));
    setTeraJobs(initial);
    setTeraRunning(true);

    const runOne = async (idx: number, file: any): Promise<void> => {
      try {
        const r = await apiPost<{ jobId: string; key: string }>("/download-url", {
          url: file.fast_dlink,
          key: `${folderBase === "__auto__" ? "" : folderBase}${file.name}`,
        });
        setTeraJobs((prev) => { const n = [...prev]; n[idx] = { ...n[idx], jobId: r.jobId, status: "downloading", key: r.key }; return n; });
        await new Promise<void>((resolve) => {
          const poll = async () => {
            try {
              const j = await apiFetch<Job>(`/job/${r.jobId}`);
              setTeraJobs((prev) => { const n = [...prev]; n[idx] = { ...n[idx], status: j.status, progress: j.progress, key: j.key ?? n[idx].key, error: j.error }; return n; });
              if (j.status === "done" || j.status === "error") resolve();
              else { const t = setTimeout(poll, 1500); teraPollRefs.current.set(r.jobId, t); }
            } catch { const t = setTimeout(poll, 2500); teraPollRefs.current.set(r.jobId, t); }
          };
          poll();
        });
      } catch (e: any) {
        setTeraJobs((prev) => { const n = [...prev]; n[idx] = { ...n[idx], status: "error", error: e.message }; return n; });
      }
    };

    let cursor = 0;
    const worker = async () => { while (cursor < toUpload.length) { const i = cursor++; await runOne(i, toUpload[i]); } };
    await Promise.all(Array.from({ length: Math.min(3, toUpload.length) }, worker));
    setTeraRunning(false);
  };

  // ── Local file upload helpers ──
  const pickLocalFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["video/*", "application/octet-stream"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setLocalFile({ name: asset.name, uri: asset.uri, size: asset.size ?? 0, mimeType: asset.mimeType ?? "application/octet-stream" });
      setLocalFileName(asset.name);
      setLocalError(null);
      setLocalSuccess(null);
    } catch (e: any) { setLocalError(e.message ?? "Erro ao abrir arquivo"); }
  };

  const startLocalUpload = async () => {
    if (!localFile) return;
    const fn = localFileName.trim() || localFile.name;
    const folderBase = localFolder ? (localFolder.endsWith("/") ? localFolder : `${localFolder}/`) : "";
    const key = `${folderBase}${fn}`;
    setLocalUploading(true);
    setLocalProgress(0);
    setLocalError(null);
    setLocalSuccess(null);
    try {
      const apiBase = (await import("@/lib/r2-direct")).r2Base();
      const uploadResult = await FileSystem.uploadAsync(`${apiBase}/upload`, localFile.uri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "file",
        parameters: { key },
        mimeType: localFile.mimeType,
      });
      if (uploadResult.status >= 200 && uploadResult.status < 300) {
        setLocalSuccess(`✅ Enviado: ${key}`);
        setLocalFile(null);
        setLocalFileName("");
        setLocalFolder("");
      } else {
        const body = JSON.parse(uploadResult.body || "{}");
        setLocalError(body.error ?? `HTTP ${uploadResult.status}`);
      }
    } catch (e: any) { setLocalError(e.message ?? "Erro no upload"); }
    finally { setLocalUploading(false); }
  };

  // ── Bulk upload ──
  const stopBulkPoll = (id: string) => {
    const t = bulkPollRefs.current.get(id);
    if (t) { clearTimeout(t); bulkPollRefs.current.delete(id); }
  };

  const onBulkUrlsChange = (v: string) => {
    setBulkUrls(v);
    const parsed = v
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("http://") || l.startsWith("https://"))
      .map((url) => ({ url, selected: !uploadedUrls.has(url) }));
    setBulkParsed(parsed);
  };

  const toggleBulkSelect = (idx: number) => {
    setBulkParsed((prev) => prev.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item));
  };

  const toggleBulkAll = () => {
    const allSelected = bulkParsed.every((p) => p.selected);
    setBulkParsed((prev) => prev.map((item) => ({ ...item, selected: !allSelected })));
  };

  const startBulkDownload = async () => {
    const lines = bulkParsed.filter((p) => p.selected).map((p) => p.url);
    if (lines.length === 0) return;

    if (!bulkFolder) {
      Alert.alert(
        "Pasta de destino não selecionada",
        "Sem pasta selecionada os arquivos irão para a raiz do bucket de forma desorganizada.\n\nDeseja continuar mesmo assim?",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Continuar", style: "destructive", onPress: () => executeBulkDownload(lines, "") },
        ]
      );
      return;
    }
    executeBulkDownload(lines, bulkFolder);
  };

  const executeBulkDownload = async (lines: string[], folder: string) => {
    const folderBase = folder
      ? (folder.endsWith("/") ? folder : `${folder}/`)
      : "";
    // Key sent to API: folder path if set, else "__auto__" (server auto-detects filename)
    const baseKey = folderBase || "__auto__";
    // Initialize job list
    const initial: BulkJobItem[] = lines.map((u) => ({
      url: u, jobId: null, status: "queued", progress: 0, key: folderBase,
    }));
    setBulkJobs(initial);
    setBulkRunning(true);

    // Controlled concurrency: max 5 active downloads at a time.
    // Each worker awaits job COMPLETION before picking the next URL,
    // so exactly ≤5 server-side jobs run simultaneously.
    const MAX_CONCURRENT = 5;
    let cursor = 0;

    // Runs one full download cycle (POST + poll until done/error) and resolves only when finished.
    const runOne = async (idx: number, u: string): Promise<void> => {
      try {
        const r = await apiPost<{ jobId: string; key: string }>("/download-url", {
          url: u,
          key: baseKey,
        });
        setBulkJobs((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], jobId: r.jobId, status: "downloading", key: r.key };
          return next;
        });

        // Inline poll loop — awaits until job finishes (done or error).
        // Only then does this Promise resolve, freeing the worker slot.
        await new Promise<void>((resolve) => {
          const poll = async () => {
            try {
              const j = await apiFetch<Job>(`/job/${r.jobId}`);
              setBulkJobs((prev) => {
                const next = [...prev];
                next[idx] = {
                  ...next[idx],
                  status: j.status,
                  progress: j.progress,
                  key: j.key ?? next[idx].key,
                  error: j.error,
                };
                return next;
              });
              if (j.status === "done") {
                markUrlAsUploaded(u);
                resolve();
              } else if (j.status === "error") {
                resolve();
              } else {
                const t = setTimeout(poll, 1500);
                bulkPollRefs.current.set(r.jobId, t);
              }
            } catch {
              const t = setTimeout(poll, 2500);
              bulkPollRefs.current.set(r.jobId, t);
            }
          };
          poll();
        });
      } catch (e: any) {
        setBulkJobs((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], status: "error", error: e.message ?? "Erro" };
          return next;
        });
      }
    };

    // Each worker processes one URL at a time and immediately picks the next
    // once the current one finishes — keeps exactly ≤5 running at all times.
    const worker = async () => {
      while (cursor < lines.length) {
        const idx = cursor++;
        await runOne(idx, lines[idx]);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT, lines.length) }, worker)
    );
    setBulkRunning(false);
  };

  const clearBulk = () => {
    bulkPollRefs.current.forEach((t) => clearTimeout(t));
    bulkPollRefs.current.clear();
    setBulkJobs([]);
    setBulkUrls("");
    setBulkParsed([]);
  };

  // Auto-detect filename from URL — only if it looks like a real video file path
  const VIDEO_EXT = /\.(mp4|mkv|mov|avi|webm|m4v|ts|wmv|flv|ogv)$/i;
  const onUrlChange = (v: string) => {
    setUrl(v);
    if (!fileName) {
      try {
        const urlPath = new URL(v.trim()).pathname;
        const auto = urlPath.split("/").pop() ?? "";
        if (VIDEO_EXT.test(auto)) setFileName(auto);
        // Non-video URLs (like download.aspx): leave filename empty for user to fill
      } catch {}
    }
  };

  const destKey = selectedFolder
    ? `${selectedFolder.endsWith("/") ? selectedFolder : `${selectedFolder}/`}${fileName.trim()}`
    : fileName.trim();

  const startDownload = async () => {
    const u = url.trim();
    const fn = fileName.trim();
    if (!u) { setJobError("Informe a URL do vídeo"); return; }
    if (!fn) { setJobError("Informe o nome do arquivo (ex: E01.mp4)"); return; }
    const k = destKey;
    setDownloading(true);
    setJob(null);
    setJobError(null);
    setSuccess(null);
    try {
      const r = await apiPost<{ jobId: string }>("/download-url", { url: u, key: k });
      const poll = async () => {
        try {
          const j = await apiFetch<Job>(`/job/${r.jobId}`);
          setJob(j);
          if (j.status === "done") {
            setSuccess(`✅ Upload concluído: ${j.key ?? k}`);
            setDownloading(false);
            setUrl("");
            setFileName("");
            setSelectedFolder("");
          } else if (j.status === "error") {
            setJobError(j.error ?? "Falha no download");
            setDownloading(false);
          } else {
            pollRef.current = setTimeout(poll, 1200);
          }
        } catch { pollRef.current = setTimeout(poll, 2000); }
      };
      poll();
    } catch (e: any) {
      setJobError(e.message ?? "Erro");
      setDownloading(false);
    }
  };

  const createFolder = async () => {
    const n = folderName.trim();
    if (!n) return;
    setCreatingFolder(true);
    try {
      await apiPost("/mkdir", { prefix: n });
      setSuccess(`📁 Pasta "${n}" criada`);
      setFolderName("");
    } catch (e: any) {
      setJobError(e.message ?? "Erro ao criar pasta");
    } finally { setCreatingFolder(false); }
  };

  useEffect(() => () => {
    stopPoll();
    bulkPollRefs.current.forEach((t) => clearTimeout(t));
  }, []);

  const progress = job?.progress ?? 0;
  const downloaded = job?.downloaded ?? 0;
  const total = job?.total ?? 0;

  // ── Drive Index helpers ──────────────────────────────────────────────────────

  const driveCurrentEntry = driveNav.length > 0 ? driveNav[driveNav.length - 1] : null;

  const loadDriveFolder = async (drive: 0 | 1, path: string, pageToken = "") => {
    if (pageToken) {
      setDrivePageLoading(true);
    } else {
      setDriveBrowseLoading(true);
      setDriveItems([]);
    }
    setDriveBrowseError(null);
    try {
      const result = await listFolder(drive, path, pageToken);
      if (!result) { setDriveBrowseError("Não foi possível carregar a pasta"); return; }
      if (pageToken) {
        setDriveItems((prev) => [...prev, ...result.data.files]);
      } else {
        setDriveItems(result.data.files);
      }
      setDrivePageToken(result.nextPageToken);
    } catch { setDriveBrowseError("Erro ao carregar pasta"); }
    finally { setDriveBrowseLoading(false); setDrivePageLoading(false); }
  };

  const driveNavPush = (drive: 0 | 1, path: string, name: string) => {
    setDriveNav((prev) => [...prev, { drive, path, name }]);
    loadDriveFolder(drive, path);
  };

  const driveNavPop = () => {
    if (driveNav.length === 0) return;
    const next = driveNav.slice(0, -1);
    setDriveNav(next);
    if (next.length > 0) {
      const entry = next[next.length - 1];
      loadDriveFolder(entry.drive, entry.path);
    } else {
      setDriveItems([]);
      setDrivePageToken(null);
    }
  };

  const toggleDriveItem = (item: DriveItem) => {
    const id = item.id;
    setDriveSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) { n.delete(id); } else { n.add(id); }
      return n;
    });
    setDriveSelectedMap((prev) => {
      const m = new Map(prev);
      if (m.has(id)) { m.delete(id); } else { m.set(id, item); }
      return m;
    });
  };

  const selectAllDriveVideos = () => {
    const videos = driveItems.filter(driveIsVideo);
    const allSel = videos.every((v) => driveSelectedIds.has(v.id));
    if (allSel) {
      setDriveSelectedIds((prev) => { const n = new Set(prev); videos.forEach((v) => n.delete(v.id)); return n; });
      setDriveSelectedMap((prev) => { const m = new Map(prev); videos.forEach((v) => m.delete(v.id)); return m; });
    } else {
      setDriveSelectedIds((prev) => { const n = new Set(prev); videos.forEach((v) => n.add(v.id)); return n; });
      setDriveSelectedMap((prev) => { const m = new Map(prev); videos.forEach((v) => m.set(v.id, v)); return m; });
    }
  };

  const clearDriveSelection = () => {
    setDriveSelectedIds(new Set());
    setDriveSelectedMap(new Map());
    setDriveJobs([]);
  };

  const startDriveUpload = async () => {
    const items = Array.from(driveSelectedMap.values()).filter(driveIsVideo);
    if (items.length === 0) return;
    const folderBase = driveDestFolder ? (driveDestFolder.endsWith("/") ? driveDestFolder : `${driveDestFolder}/`) : "";
    const initial: BulkJobItem[] = items.map((item) => ({
      url: getStreamUrl(item),
      jobId: null,
      status: "queued",
      progress: 0,
      key: `${folderBase}${item.name}`,
    }));
    setDriveJobs(initial);
    setDriveRunning(true);

    const runOne = async (idx: number, item: DriveItem): Promise<void> => {
      const streamUrl = getStreamUrl(item);
      const key = `${folderBase}${item.name}`;
      try {
        const r = await apiPost<{ jobId: string; key: string }>("/download-url", { url: streamUrl, key });
        setDriveJobs((prev) => { const n = [...prev]; n[idx] = { ...n[idx], jobId: r.jobId, status: "downloading", key: r.key }; return n; });
        await new Promise<void>((resolve) => {
          const poll = async () => {
            try {
              const j = await apiFetch<Job>(`/job/${r.jobId}`);
              setDriveJobs((prev) => { const n = [...prev]; n[idx] = { ...n[idx], status: j.status, progress: j.progress, key: j.key ?? n[idx].key, error: j.error }; return n; });
              if (j.status === "done" || j.status === "error") resolve();
              else { const t = setTimeout(poll, 1500); drivePollRefs.current.set(r.jobId, t); }
            } catch { const t = setTimeout(poll, 2500); drivePollRefs.current.set(r.jobId, t); }
          };
          poll();
        });
      } catch (e: any) {
        setDriveJobs((prev) => { const n = [...prev]; n[idx] = { ...n[idx], status: "error", error: e.message }; return n; });
      }
    };

    let cursor = 0;
    const worker = async () => { while (cursor < items.length) { const i = cursor++; await runOne(i, items[i]); } };
    await Promise.all(Array.from({ length: Math.min(3, items.length) }, worker));
    setDriveRunning(false);
  };

  const UPLOAD_MODES: { id: UploadMode; label: string; icon: string; color: string }[] = [
    { id: "url", label: "URL", icon: "link", color: RED },
    { id: "drive", label: "Drive Index", icon: "hard-drive", color: "#8b5cf6" },
    { id: "gdrive", label: "Google Drive", icon: "cloud", color: "#1a73e8" },
    { id: "terabox", label: "TeraBox", icon: "package", color: "#f59e0b" },
    { id: "local", label: "Armazenamento", icon: "smartphone", color: "#10b981" },
  ];

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}>

        {/* Mode selector */}
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 16 }}>
          {UPLOAD_MODES.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => setUploadMode(m.id)}
              style={{
                flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 10,
                backgroundColor: uploadMode === m.id ? `${m.color}20` : "rgba(255,255,255,0.05)",
                borderWidth: 1, borderColor: uploadMode === m.id ? m.color : "rgba(255,255,255,0.08)",
              }}
            >
              <Feather name={m.icon as any} size={17} color={uploadMode === m.id ? m.color : "rgba(255,255,255,0.35)"} />
              <Text style={{ color: uploadMode === m.id ? m.color : "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: "700", marginTop: 5, textAlign: "center" }} numberOfLines={1}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Google Drive section ── */}
        {uploadMode === "gdrive" && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <Feather name="cloud" size={18} color="#1a73e8" />
              <Text style={[styles.sectionTitle, { color: "#1a73e8" }]}>Google Drive → R2</Text>
            </View>
            <Text style={styles.sectionHint}>Cole o link de compartilhamento do Google Drive. O servidor resolve e baixa diretamente para o R2.</Text>

            <Text style={styles.fieldLabel}>Link do Google Drive</Text>
            <TextInput
              style={[styles.input, gdriveLoading && { opacity: 0.5 }]}
              placeholder="https://drive.google.com/file/d/ID/view"
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={gdriveUrl}
              onChangeText={(v) => { setGdriveUrl(v); setGdriveResolved(null); setGdriveError(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!gdriveLoading}
              multiline
            />

            {!gdriveResolved ? (
              <Pressable style={[styles.actionBtn, { backgroundColor: "#1a73e8" }, gdriveLoading && { opacity: 0.5 }]} onPress={resolveGdrive} disabled={gdriveLoading}>
                {gdriveLoading ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="search" size={16} color="#fff" />}
                <Text style={styles.actionBtnText}>{gdriveLoading ? "Resolvendo…" : "Resolver link"}</Text>
              </Pressable>
            ) : (
              <>
                <View style={{ marginTop: 12, backgroundColor: "rgba(26,115,232,0.1)", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "rgba(26,115,232,0.3)" }}>
                  <Text style={{ color: "#93c5fd", fontSize: 11, marginBottom: 6 }}>✅ Link resolvido</Text>
                  <Text style={styles.fieldLabel}>Nome do arquivo</Text>
                  <TextInput
                    style={[styles.input, gdriveLoading && { opacity: 0.5 }]}
                    value={gdriveFileName}
                    onChangeText={setGdriveFileName}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!gdriveLoading}
                  />
                  <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Pasta de destino</Text>
                  <Pressable
                    style={[styles.input, { flexDirection: "row", alignItems: "center", gap: 10 }, gdriveLoading && { opacity: 0.5 }]}
                    onPress={() => !gdriveLoading && setShowGdriveFolderPicker(true)}
                  >
                    <Feather name="folder" size={16} color={gdriveFolder ? "#f59e0b" : "rgba(255,255,255,0.25)"} />
                    <Text style={{ flex: 1, color: gdriveFolder ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 14 }} numberOfLines={1}>
                      {gdriveFolder ? gdriveFolder.replace(/\/$/, "") : "Toque para escolher pasta…"}
                    </Text>
                  </Pressable>
                </View>

                {gdriveJob && (
                  <View style={styles.progressWrap}>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${gdriveJob.progress}%` as any, backgroundColor: "#1a73e8" }]} />
                    </View>
                    <Text style={styles.progressText}>
                      {gdriveJob.status === "downloading" ? "Baixando do Drive…" : "Enviando para R2…"}{" "}
                      {gdriveJob.progress > 0 ? `${gdriveJob.progress}%` : ""}
                    </Text>
                  </View>
                )}

                <Pressable style={[styles.actionBtn, { backgroundColor: "#1a73e8" }, gdriveLoading && { opacity: 0.5 }]} onPress={startGdriveDownload} disabled={gdriveLoading}>
                  {gdriveLoading ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="upload-cloud" size={16} color="#fff" />}
                  <Text style={styles.actionBtnText}>{gdriveLoading ? "Enviando…" : "Enviar para R2"}</Text>
                </Pressable>
              </>
            )}

            {gdriveError && <View style={styles.errorBox}><Feather name="alert-circle" size={14} color="#f87171" /><Text style={styles.errorBoxText}>{gdriveError}</Text></View>}
            {gdriveSuccess && <View style={[styles.errorBox, { borderColor: "#22c55e40", backgroundColor: "#22c55e10" }]}><Text style={[styles.errorBoxText, { color: "#4ade80" }]}>{gdriveSuccess}</Text></View>}
          </View>
        )}

        {/* ── TeraBox link → R2 section ── */}
        {uploadMode === "terabox" && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <Feather name="package" size={18} color="#f59e0b" />
              <Text style={[styles.sectionTitle, { color: "#f59e0b" }]}>TeraBox → R2</Text>
            </View>
            <Text style={styles.sectionHint}>Cole um link do TeraBox. O servidor resolve via API e baixa o vídeo direto para o R2.</Text>

            <Text style={styles.fieldLabel}>Link do TeraBox</Text>
            <TextInput
              style={[styles.input, (teraLoading || teraRunning) && { opacity: 0.5 }]}
              placeholder="https://1024terabox.com/s/..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={teraUrl}
              onChangeText={(v) => { setTeraUrl(v); setTeraFiles([]); setTeraError(null); setTeraJobs([]); }}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!teraLoading && !teraRunning}
              multiline
            />

            {teraFiles.length === 0 ? (
              <Pressable style={[styles.actionBtn, { backgroundColor: "#92400e" }, (teraLoading) && { opacity: 0.5 }]} onPress={resolveTeraBox} disabled={teraLoading}>
                {teraLoading ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="search" size={16} color="#fff" />}
                <Text style={styles.actionBtnText}>{teraLoading ? "Resolvendo via API…" : "Resolver TeraBox"}</Text>
              </Pressable>
            ) : (
              <>
                <Text style={styles.fieldLabel}>{teraFiles.length} arquivo{teraFiles.length > 1 ? "s" : ""} encontrado{teraFiles.length > 1 ? "s" : ""}</Text>
                {teraFiles.map((f, i) => {
                  const sel = teraSelected.has(i);
                  const tj = teraJobs[i];
                  return (
                    <Pressable
                      key={i}
                      onPress={() => !teraRunning && setTeraSelected((prev) => {
                        const n = new Set(prev);
                        n.has(i) ? n.delete(i) : n.add(i);
                        return n;
                      })}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, marginBottom: 4, borderRadius: 8, backgroundColor: sel ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: sel ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.07)" }}
                    >
                      <Feather name={tj?.status === "done" ? "check-circle" : sel ? "check-square" : "square"} size={18} color={tj?.status === "done" ? "#4ade80" : sel ? "#f59e0b" : "rgba(255,255,255,0.3)"} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }} numberOfLines={1}>{f.name}</Text>
                        <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 2 }}>{f.quality ?? ""}{f.quality && f.duration ? "  ·  " : ""}{f.duration ?? ""}{f.size_formatted ? `  ·  ${f.size_formatted}` : ""}</Text>
                        {tj && tj.status !== "queued" && tj.status !== "done" && (
                          <View style={[styles.progressBar, { marginTop: 4 }]}>
                            <View style={[styles.progressFill, { width: `${tj.progress}%` as any, backgroundColor: "#f59e0b" }]} />
                          </View>
                        )}
                        {tj?.status === "error" && <Text style={{ color: "#f87171", fontSize: 10, marginTop: 2 }}>❌ {tj.error}</Text>}
                      </View>
                    </Pressable>
                  );
                })}

                <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Pasta de destino</Text>
                <Pressable
                  style={[styles.input, { flexDirection: "row", alignItems: "center", gap: 10 }, teraRunning && { opacity: 0.5 }]}
                  onPress={() => !teraRunning && setShowTeraFolderPicker(true)}
                >
                  <Feather name="folder" size={16} color={teraFolder ? "#f59e0b" : "rgba(255,255,255,0.25)"} />
                  <Text style={{ flex: 1, color: teraFolder ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 14 }} numberOfLines={1}>
                    {teraFolder ? teraFolder.replace(/\/$/, "") : "Toque para escolher pasta…"}
                  </Text>
                </Pressable>

                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <Pressable
                    style={[styles.actionBtn, { flex: 1, backgroundColor: "#92400e" }, (teraRunning || teraSelected.size === 0) && { opacity: 0.4 }]}
                    onPress={startTeraDownload}
                    disabled={teraRunning || teraSelected.size === 0}
                  >
                    {teraRunning ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="upload-cloud" size={16} color="#fff" />}
                    <Text style={styles.actionBtnText}>{teraRunning ? `Enviando ${teraJobs.filter(j => j.status === "done").length}/${teraJobs.length}…` : `Enviar ${teraSelected.size} para R2`}</Text>
                  </Pressable>
                  {!teraRunning && (
                    <Pressable style={[styles.actionBtn, { paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.08)" }]} onPress={() => { setTeraFiles([]); setTeraJobs([]); setTeraUrl(""); }}>
                      <Feather name="x" size={16} color="rgba(255,255,255,0.6)" />
                    </Pressable>
                  )}
                </View>
              </>
            )}

            {teraError && <View style={styles.errorBox}><Feather name="alert-circle" size={14} color="#f87171" /><Text style={styles.errorBoxText}>{teraError}</Text></View>}
          </View>
        )}

        {/* ── Local file upload section ── */}
        {uploadMode === "local" && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <Feather name="smartphone" size={18} color="#10b981" />
              <Text style={[styles.sectionTitle, { color: "#10b981" }]}>Armazenamento → R2</Text>
            </View>
            <Text style={styles.sectionHint}>Selecione um vídeo do armazenamento do dispositivo. O arquivo será enviado direto para o R2.</Text>

            <Pressable
              style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 12, borderWidth: 2, borderColor: localFile ? "#10b981" : "rgba(255,255,255,0.1)", borderStyle: "dashed", backgroundColor: localFile ? "rgba(16,185,129,0.07)" : "rgba(255,255,255,0.04)", marginBottom: 12 }}
              onPress={pickLocalFile}
              disabled={localUploading}
            >
              <Feather name={localFile ? "file-text" : "folder-plus"} size={28} color={localFile ? "#10b981" : "rgba(255,255,255,0.3)"} />
              <View style={{ flex: 1 }}>
                {localFile ? (
                  <>
                    <Text style={{ color: "#10b981", fontSize: 13, fontWeight: "700" }} numberOfLines={1}>{localFile.name}</Text>
                    <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 }}>{formatBytes(localFile.size)}  ·  {localFile.mimeType}</Text>
                  </>
                ) : (
                  <>
                    <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: "600" }}>Toque para selecionar arquivo</Text>
                    <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 2 }}>Vídeos: mp4, mkv, mov, avi…</Text>
                  </>
                )}
              </View>
              {localFile && <Feather name="refresh-cw" size={16} color="rgba(255,255,255,0.4)" />}
            </Pressable>

            {localFile && (
              <>
                <Text style={styles.fieldLabel}>Nome do arquivo no R2</Text>
                <TextInput
                  style={[styles.input, localUploading && { opacity: 0.5 }]}
                  value={localFileName}
                  onChangeText={setLocalFileName}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!localUploading}
                />

                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Pasta de destino</Text>
                <Pressable
                  style={[styles.input, { flexDirection: "row", alignItems: "center", gap: 10 }, localUploading && { opacity: 0.5 }]}
                  onPress={() => !localUploading && setShowLocalFolderPicker(true)}
                >
                  <Feather name="folder" size={16} color={localFolder ? "#f59e0b" : "rgba(255,255,255,0.25)"} />
                  <Text style={{ flex: 1, color: localFolder ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 14 }} numberOfLines={1}>
                    {localFolder ? localFolder.replace(/\/$/, "") : "Toque para escolher pasta…"}
                  </Text>
                </Pressable>

                <View style={{ marginTop: 10, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 10 }}>
                  <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginBottom: 2 }}>Caminho no R2:</Text>
                  <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "monospace" }} numberOfLines={2}>
                    {`${localFolder ? (localFolder.endsWith("/") ? localFolder : `${localFolder}/`) : ""}${localFileName || localFile.name}` || "—"}
                  </Text>
                </View>

                {localUploading && (
                  <View style={styles.progressWrap}>
                    <ActivityIndicator color="#10b981" style={{ marginBottom: 6 }} />
                    <Text style={styles.progressText}>Enviando arquivo para R2…</Text>
                  </View>
                )}

                <Pressable style={[styles.actionBtn, { backgroundColor: "#10b981" }, localUploading && { opacity: 0.5 }]} onPress={startLocalUpload} disabled={localUploading}>
                  {localUploading ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="upload" size={16} color="#fff" />}
                  <Text style={styles.actionBtnText}>{localUploading ? "Enviando…" : "Enviar para R2"}</Text>
                </Pressable>
              </>
            )}

            {localError && <View style={styles.errorBox}><Feather name="alert-circle" size={14} color="#f87171" /><Text style={styles.errorBoxText}>{localError}</Text></View>}
            {localSuccess && <View style={[styles.errorBox, { borderColor: "#22c55e40", backgroundColor: "#22c55e10" }]}><Text style={[styles.errorBoxText, { color: "#4ade80" }]}>{localSuccess}</Text></View>}
          </View>
        )}

        {/* ── Drive Index browser section ── */}
        {uploadMode === "drive" && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <Feather name="hard-drive" size={18} color="#8b5cf6" />
              <Text style={[styles.sectionTitle, { color: "#8b5cf6" }]}>Drive Index → R2</Text>
            </View>
            <Text style={styles.sectionHint}>Navegue nas pastas do Drive Index, selecione arquivos ou pastas inteiras e envie direto para o R2.</Text>

            {/* Breadcrumb */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Pressable onPress={() => { setDriveNav([]); setDriveItems([]); setDrivePageToken(null); }}>
                  <Text style={{ color: driveNav.length === 0 ? "#8b5cf6" : "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: "700" }}>Drive Index</Text>
                </Pressable>
                {driveNav.map((entry, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Feather name="chevron-right" size={12} color="rgba(255,255,255,0.3)" />
                    <Pressable onPress={() => {
                      const next = driveNav.slice(0, i + 1);
                      setDriveNav(next);
                      loadDriveFolder(entry.drive, entry.path);
                    }}>
                      <Text style={{ color: i === driveNav.length - 1 ? "#8b5cf6" : "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: "700" }}>{entry.name}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>

            {/* Root level: show Drive roots */}
            {driveNav.length === 0 && (
              <View>
                {DRIVE_ROOTS.map((root) => (
                  <View key={root.drive} style={{ marginBottom: 10 }}>
                    <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" }}>
                      {root.icon} {root.name}
                    </Text>
                    {root.folders.map((folder) => (
                      <Pressable
                        key={folder}
                        onPress={() => driveNavPush(root.drive, folder, folder)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginBottom: 4, borderRadius: 10, backgroundColor: "rgba(139,92,246,0.08)", borderWidth: 1, borderColor: "rgba(139,92,246,0.2)" }}
                      >
                        <Feather name="folder" size={18} color="#8b5cf6" />
                        <Text style={{ flex: 1, color: "#fff", fontSize: 14, fontWeight: "600" }}>{folder}</Text>
                        <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.3)" />
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
            )}

            {/* Folder contents */}
            {driveNav.length > 0 && (
              <>
                {/* Back button */}
                <Pressable onPress={driveNavPop} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, marginBottom: 8 }}>
                  <Feather name="arrow-left" size={16} color="rgba(255,255,255,0.5)" />
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Voltar</Text>
                </Pressable>

                {driveBrowseLoading ? (
                  <View style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
                    <ActivityIndicator color="#8b5cf6" size="large" />
                    <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Carregando pasta…</Text>
                  </View>
                ) : driveBrowseError ? (
                  <View style={styles.errorBox}><Feather name="alert-circle" size={14} color="#f87171" /><Text style={styles.errorBoxText}>{driveBrowseError}</Text></View>
                ) : (
                  <>
                    {/* Select all videos row */}
                    {driveItems.filter(driveIsVideo).length > 0 && (
                      <Pressable
                        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.04)" }}
                        onPress={selectAllDriveVideos}
                      >
                        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                          {driveItems.filter(driveIsVideo).every((v) => driveSelectedIds.has(v.id))
                            ? "Desmarcar todos os vídeos"
                            : `Selecionar todos os vídeos (${driveItems.filter(driveIsVideo).length})`}
                        </Text>
                        <Feather
                          name={driveItems.filter(driveIsVideo).every((v) => driveSelectedIds.has(v.id)) ? "check-square" : "square"}
                          size={16}
                          color="#8b5cf6"
                        />
                      </Pressable>
                    )}

                    {driveItems.length === 0 && (
                      <View style={{ alignItems: "center", paddingVertical: 20 }}>
                        <Feather name="inbox" size={28} color="rgba(255,255,255,0.15)" />
                        <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginTop: 8 }}>Pasta vazia</Text>
                      </View>
                    )}

                    {driveItems.map((item) => {
                      const isDir = driveIsFolder(item);
                      const isVid = driveIsVideo(item);
                      const selected = driveSelectedIds.has(item.id);
                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => {
                            if (isDir) {
                              const newPath = driveCurrentEntry
                                ? `${driveCurrentEntry.path}/${item.name}`
                                : item.name;
                              driveNavPush(driveCurrentEntry!.drive, newPath, item.name);
                            } else if (isVid) {
                              toggleDriveItem(item);
                            }
                          }}
                          style={{
                            flexDirection: "row", alignItems: "center", gap: 10,
                            paddingVertical: 10, paddingHorizontal: 10, marginBottom: 3, borderRadius: 8,
                            backgroundColor: selected ? "rgba(139,92,246,0.12)" : isDir ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.05)",
                            borderWidth: 1,
                            borderColor: selected ? "rgba(139,92,246,0.35)" : "rgba(255,255,255,0.06)",
                          }}
                        >
                          {isVid ? (
                            <Feather name={selected ? "check-square" : "square"} size={18} color={selected ? "#8b5cf6" : "rgba(255,255,255,0.3)"} />
                          ) : (
                            <Feather name="folder" size={18} color="#f59e0b" />
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: isVid ? (selected ? "#e9d5ff" : "#fff") : "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: isDir ? "600" : "400" }} numberOfLines={1}>{item.name}</Text>
                            {isVid && item.size && (
                              <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 1 }}>{driveFormatSize(item.size)}</Text>
                            )}
                          </View>
                          {isDir && <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.3)" />}
                        </Pressable>
                      );
                    })}

                    {/* Load more */}
                    {drivePageToken && (
                      <Pressable
                        onPress={() => driveCurrentEntry && loadDriveFolder(driveCurrentEntry.drive, driveCurrentEntry.path, drivePageToken)}
                        style={{ alignItems: "center", padding: 12, marginTop: 4, borderRadius: 8, borderWidth: 1, borderColor: "rgba(139,92,246,0.3)", backgroundColor: "rgba(139,92,246,0.07)" }}
                        disabled={drivePageLoading}
                      >
                        {drivePageLoading ? <ActivityIndicator color="#8b5cf6" size="small" /> : <Text style={{ color: "#8b5cf6", fontSize: 13, fontWeight: "600" }}>Carregar mais…</Text>}
                      </Pressable>
                    )}
                  </>
                )}
              </>
            )}

            {/* Selection summary + upload controls */}
            {driveSelectedIds.size > 0 && (
              <View style={{ marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: "rgba(139,92,246,0.1)", borderWidth: 1, borderColor: "rgba(139,92,246,0.3)" }}>
                <Text style={{ color: "#c4b5fd", fontSize: 12, fontWeight: "700", marginBottom: 10 }}>
                  {driveSelectedIds.size} arquivo{driveSelectedIds.size > 1 ? "s" : ""} selecionado{driveSelectedIds.size > 1 ? "s" : ""}
                </Text>

                <Text style={styles.fieldLabel}>Pasta de destino no R2</Text>
                <Pressable
                  style={[styles.input, { flexDirection: "row", alignItems: "center", gap: 10 }, driveRunning && { opacity: 0.5 }]}
                  onPress={() => !driveRunning && setShowDriveDestPicker(true)}
                >
                  <Feather name="folder" size={16} color={driveDestFolder ? "#f59e0b" : "rgba(255,255,255,0.25)"} />
                  <Text style={{ flex: 1, color: driveDestFolder ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 14 }} numberOfLines={1}>
                    {driveDestFolder ? driveDestFolder.replace(/\/$/, "") : "Toque para escolher pasta…"}
                  </Text>
                  {driveDestFolder ? (
                    <Pressable onPress={() => setDriveDestFolder("")}><Feather name="x" size={14} color="rgba(255,255,255,0.4)" /></Pressable>
                  ) : (
                    <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.3)" />
                  )}
                </Pressable>

                {/* Job progress list */}
                {driveJobs.length > 0 && (
                  <View style={{ marginTop: 10, gap: 4 }}>
                    <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginBottom: 4 }}>
                      {driveJobs.filter(j => j.status === "done").length} concluídos · {driveJobs.filter(j => j.status === "error").length} com erro · {driveJobs.filter(j => j.status !== "done" && j.status !== "error").length} em andamento
                    </Text>
                    {driveJobs.map((dj, i) => {
                      const isDone = dj.status === "done";
                      const isErr = dj.status === "error";
                      return (
                        <View key={i} style={{ backgroundColor: isDone ? "rgba(34,197,94,0.07)" : isErr ? "rgba(248,113,113,0.07)" : "rgba(255,255,255,0.04)", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: isDone ? "rgba(34,197,94,0.2)" : isErr ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.06)" }}>
                          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginBottom: 2 }} numberOfLines={1}>{dj.key.split("/").pop()}</Text>
                          {!isDone && !isErr && (
                            <View style={[styles.progressBar, { marginTop: 3 }]}>
                              <View style={[styles.progressFill, { width: `${dj.progress}%` as any, backgroundColor: "#8b5cf6" }]} />
                            </View>
                          )}
                          {isDone && <Text style={{ color: "#4ade80", fontSize: 10 }}>✅ Enviado</Text>}
                          {isErr && <Text style={{ color: "#f87171", fontSize: 10 }}>❌ {dj.error}</Text>}
                        </View>
                      );
                    })}
                  </View>
                )}

                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <Pressable
                    style={[styles.actionBtn, { flex: 1, backgroundColor: "#7c3aed" }, (driveRunning || driveSelectedIds.size === 0) && { opacity: 0.4 }]}
                    onPress={startDriveUpload}
                    disabled={driveRunning || driveSelectedIds.size === 0}
                  >
                    {driveRunning ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="upload-cloud" size={16} color="#fff" />}
                    <Text style={styles.actionBtnText}>
                      {driveRunning
                        ? `Enviando ${driveJobs.filter(j => j.status === "done").length}/${driveJobs.length}…`
                        : `Enviar ${driveSelectedIds.size} para R2`}
                    </Text>
                  </Pressable>
                  {!driveRunning && (
                    <Pressable
                      style={[styles.actionBtn, { paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.08)" }]}
                      onPress={clearDriveSelection}
                    >
                      <Feather name="x" size={16} color="rgba(255,255,255,0.6)" />
                    </Pressable>
                  )}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Via URL */}
        {uploadMode === "url" && <View style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Feather name="download-cloud" size={18} color={RED} />
            <Text style={styles.sectionTitle}>Baixar via URL para o R2</Text>
          </View>
          <Text style={styles.sectionHint}>Cole a URL do vídeo — o servidor baixa e envia para o R2. Sem limite de tamanho.</Text>

          {/* Media kind selector */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 14, marginTop: 4 }}>
            {([["tv", "📺", "Série / Anime"], ["movie", "🎬", "Filme"]] as const).map(([kind, icon, label]) => (
              <Pressable
                key={kind}
                onPress={() => setSingleMediaKind(kind)}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 10, backgroundColor: singleMediaKind === kind ? (kind === "movie" ? "rgba(251,191,36,0.15)" : "rgba(229,9,20,0.12)") : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: singleMediaKind === kind ? (kind === "movie" ? "#fbbf24" : RED) : "rgba(255,255,255,0.08)" }}
              >
                <Text style={{ fontSize: 14 }}>{icon}</Text>
                <Text style={{ color: singleMediaKind === kind ? (kind === "movie" ? "#fbbf24" : "#f87171") : "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "700" }}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>URL do vídeo</Text>
          <TextInput
            style={[styles.input, downloading && { opacity: 0.5 }]}
            placeholder="https://exemplo.com/video.mp4"
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={url}
            onChangeText={onUrlChange}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!downloading}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Folder picker */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Pasta de destino</Text>
          <Pressable
            style={[styles.input, { flexDirection: "row", alignItems: "center", gap: 10 }, downloading && { opacity: 0.5 }]}
            onPress={() => !downloading && setShowFolderPicker(true)}
          >
            <Feather name="folder" size={16} color={selectedFolder ? "#f59e0b" : "rgba(255,255,255,0.25)"} />
            <Text style={{ flex: 1, color: selectedFolder ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 14 }} numberOfLines={1}>
              {selectedFolder ? selectedFolder.replace(/\/$/, "") : "Toque para escolher pasta…"}
            </Text>
            {selectedFolder ? (
              <Pressable onPress={() => setSelectedFolder("")}>
                <Feather name="x" size={14} color="rgba(255,255,255,0.4)" />
              </Pressable>
            ) : (
              <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.3)" />
            )}
          </Pressable>

          {/* Filename */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Nome do arquivo</Text>
          <TextInput
            style={[styles.input, downloading && { opacity: 0.5 }]}
            placeholder="E01.mp4"
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={fileName}
            onChangeText={setFileName}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!downloading}
          />

          {/* Full path preview */}
          {(selectedFolder || fileName) && (
            <View style={{ marginTop: 8, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 10 }}>
              <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginBottom: 2 }}>Caminho completo:</Text>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "monospace" }} numberOfLines={2}>
                {destKey || "—"}
              </Text>
            </View>
          )}

          {/* Progress */}
          {downloading && job && (
            <View style={styles.progressWrap}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
              </View>
              <Text style={styles.progressText}>
                {job.status === "downloading" ? "Baixando fonte…" : "Enviando para R2…"}{" "}
                {progress > 0 ? `${progress}%` : ""}
                {total > 0 ? `  (${formatBytes(downloaded)} / ${formatBytes(total)})` : downloaded > 0 ? `  ${formatBytes(downloaded)}` : ""}
              </Text>
            </View>
          )}
          {downloading && !job && <ActivityIndicator color={RED} style={{ marginVertical: 12 }} />}

          {jobError && (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color="#f87171" />
              <Text style={styles.errorBoxText}>{jobError}</Text>
            </View>
          )}
          {success && (
            <View style={[styles.errorBox, { borderColor: "#22c55e40", backgroundColor: "#22c55e10" }]}>
              <Text style={[styles.errorBoxText, { color: "#4ade80" }]}>{success}</Text>
            </View>
          )}

          <Pressable
            style={[styles.actionBtn, downloading && { opacity: 0.5 }]}
            onPress={startDownload}
            disabled={downloading}
          >
            {downloading ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="download-cloud" size={16} color="#fff" />}
            <Text style={styles.actionBtnText}>{downloading ? "Enviando…" : "Baixar e enviar para R2"}</Text>
          </Pressable>
        </View>}

        {/* Upload em lote */}
        {uploadMode === "url" && <View style={[styles.sectionCard, { marginTop: 16 }]}>
          <View style={styles.sectionTitleRow}>
            <Feather name="list" size={18} color="#f59e0b" />
            <Text style={[styles.sectionTitle, { color: "#f59e0b" }]}>Upload em lote</Text>
          </View>
          <Text style={styles.sectionHint}>
            Cole as URLs (uma por linha). Escolha quais enviar e toque em iniciar.
          </Text>

          {/* Batch media kind selector */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12, marginTop: 4 }}>
            {([["tv", "📺", "Série / Anime"], ["movie", "🎬", "Filmes"]] as const).map(([kind, icon, label]) => (
              <Pressable
                key={kind}
                onPress={() => { setBatchMediaKind(kind); setBatchItemTitles({}); }}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 10, backgroundColor: batchMediaKind === kind ? (kind === "movie" ? "rgba(251,191,36,0.15)" : "rgba(245,158,11,0.12)") : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: batchMediaKind === kind ? (kind === "movie" ? "#fbbf24" : "#f59e0b") : "rgba(255,255,255,0.08)" }}
              >
                <Text style={{ fontSize: 14 }}>{icon}</Text>
                <Text style={{ color: batchMediaKind === kind ? (kind === "movie" ? "#fbbf24" : "#f59e0b") : "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "700" }}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {batchMediaKind === "movie" && (
            <View style={{ marginBottom: 10, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: "rgba(251,191,36,0.07)", borderWidth: 1, borderColor: "rgba(251,191,36,0.2)" }}>
              <Text style={{ color: "#fde68a", fontSize: 11 }}>🎬 Modo filmes — cada URL pode ter um título manual para identificação no catálogo.</Text>
            </View>
          )}

          {/* Text input — only shown before upload starts */}
          {bulkJobs.length === 0 && (
            <>
              <Text style={styles.fieldLabel}>URLs (uma por linha)</Text>
              <TextInput
                style={[styles.input, { height: 130, textAlignVertical: "top" }, bulkRunning && { opacity: 0.5 }]}
                placeholder={"https://exemplo.com/ep01.aspx\nhttps://exemplo.com/ep02.aspx\nhttps://exemplo.com/ep03.aspx"}
                placeholderTextColor="rgba(255,255,255,0.2)"
                value={bulkUrls}
                onChangeText={onBulkUrlsChange}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                editable={!bulkRunning}
              />

              {/* Parsed URL selection list */}
              {bulkParsed.length > 0 && (
                <View style={{ marginTop: 10 }}>
                  {/* Header with count + select all */}
                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}
                    onPress={toggleBulkAll}
                  >
                    <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                      {bulkParsed.filter((p) => p.selected).length} de {bulkParsed.length} selecionadas
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ color: "#f59e0b", fontSize: 12 }}>
                        {bulkParsed.every((p) => p.selected) ? "Desmarcar todas" : "Selecionar todas"}
                      </Text>
                      <Feather
                        name={bulkParsed.every((p) => p.selected) ? "check-square" : "square"}
                        size={16}
                        color="#f59e0b"
                      />
                    </View>
                  </Pressable>

                  {/* Checkbox list */}
                  {bulkParsed.map((item, i) => {
                    const alreadyDone = uploadedUrls.has(item.url);
                    const customTitle = batchItemTitles[i] ?? "";
                    return (
                      <View key={i} style={{ marginBottom: 6 }}>
                        <Pressable
                          onPress={() => !alreadyDone && toggleBulkSelect(i)}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                            paddingVertical: 8,
                            paddingHorizontal: 10,
                            borderRadius: batchMediaKind === "movie" ? 10 : 8,
                            borderBottomLeftRadius: batchMediaKind === "movie" ? 0 : 8,
                            borderBottomRightRadius: batchMediaKind === "movie" ? 0 : 8,
                            backgroundColor: alreadyDone
                              ? "rgba(229,9,20,0.08)"
                              : item.selected
                                ? "rgba(245,158,11,0.1)"
                                : "rgba(255,255,255,0.04)",
                            borderWidth: 1,
                            borderColor: alreadyDone
                              ? "rgba(229,9,20,0.35)"
                              : item.selected
                                ? "rgba(245,158,11,0.3)"
                                : "rgba(255,255,255,0.06)",
                          }}
                        >
                          <Feather
                            name={alreadyDone ? "check-circle" : item.selected ? "check-square" : "square"}
                            size={18}
                            color={alreadyDone ? "#e50914" : item.selected ? "#f59e0b" : "rgba(255,255,255,0.3)"}
                          />
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                color: alreadyDone ? "#f87171" : item.selected ? "#fff" : "rgba(255,255,255,0.35)",
                                fontSize: 11,
                              }}
                              numberOfLines={1}
                            >
                              {item.url.replace(/^https?:\/\//, "").slice(0, 60)}
                            </Text>
                            {alreadyDone && (
                              <Text style={{ color: "#e50914", fontSize: 10, marginTop: 1 }}>Já enviado ao servidor</Text>
                            )}
                            {batchMediaKind === "movie" && customTitle ? (
                              <Text style={{ color: "#fbbf24", fontSize: 10, marginTop: 2 }}>🎬 {customTitle}</Text>
                            ) : null}
                          </View>
                        </Pressable>
                        {/* Per-item title input in movie mode */}
                        {batchMediaKind === "movie" && (
                          <TextInput
                            style={{
                              backgroundColor: "rgba(251,191,36,0.06)",
                              borderWidth: 1,
                              borderTopWidth: 0,
                              borderColor: item.selected ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.06)",
                              borderBottomLeftRadius: 8,
                              borderBottomRightRadius: 8,
                              paddingHorizontal: 10,
                              paddingVertical: 7,
                              color: "#fde68a",
                              fontSize: 12,
                            }}
                            placeholder="Título do filme (opcional — para catálogo)"
                            placeholderTextColor="rgba(251,191,36,0.3)"
                            value={customTitle}
                            onChangeText={(v) => setBatchItemTitles((prev) => ({ ...prev, [i]: v }))}
                            autoCapitalize="words"
                            autoCorrect={false}
                          />
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {/* Pasta de destino */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Pasta de destino</Text>
          <Pressable
            style={[styles.input, { flexDirection: "row", alignItems: "center", gap: 10 }, bulkRunning && { opacity: 0.5 }]}
            onPress={() => !bulkRunning && setShowBulkFolderPicker(true)}
          >
            <Feather name="folder" size={16} color={bulkFolder ? "#f59e0b" : "rgba(255,255,255,0.25)"} />
            <Text style={{ flex: 1, color: bulkFolder ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 14 }} numberOfLines={1}>
              {bulkFolder ? bulkFolder.replace(/\/$/, "") : "Toque para escolher pasta…"}
            </Text>
            {bulkFolder ? (
              <Pressable onPress={() => setBulkFolder("")}>
                <Feather name="x" size={14} color="rgba(255,255,255,0.4)" />
              </Pressable>
            ) : (
              <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.3)" />
            )}
          </Pressable>

          {/* Job progress list (during/after upload) */}
          {bulkJobs.length > 0 && (
            <View style={{ marginTop: 12, gap: 6 }}>
              <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginBottom: 4 }}>
                {bulkJobs.filter((j) => j.status === "done").length} concluídos · {bulkJobs.filter((j) => j.status === "error").length} com erro · {bulkJobs.filter((j) => j.status !== "done" && j.status !== "error").length} em andamento
              </Text>
              {bulkJobs.map((bj, i) => {
                const shortUrl = bj.url.replace(/^https?:\/\//, "").slice(0, 55);
                const shortKey = bj.key ? bj.key.split("/").pop() || bj.key : "";
                const isDone = bj.status === "done";
                const isErr = bj.status === "error";
                return (
                  <View
                    key={i}
                    style={{
                      backgroundColor: isDone ? "rgba(34,197,94,0.07)" : isErr ? "rgba(248,113,113,0.07)" : "rgba(255,255,255,0.05)",
                      borderRadius: 8,
                      padding: 10,
                      borderWidth: 1,
                      borderColor: isDone ? "rgba(34,197,94,0.2)" : isErr ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.06)",
                    }}
                  >
                    <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginBottom: 3 }} numberOfLines={1}>{shortUrl}</Text>
                    {isDone && shortKey ? (
                      <Text style={{ color: "#4ade80", fontSize: 11 }} numberOfLines={1}>✅ {shortKey}</Text>
                    ) : isErr ? (
                      <Text style={{ color: "#f87171", fontSize: 11 }}>❌ {bj.error}</Text>
                    ) : (
                      <View>
                        <View style={[styles.progressBar, { marginBottom: 3 }]}>
                          <View style={[styles.progressFill, { width: `${bj.progress}%` as any, backgroundColor: "#f59e0b" }]} />
                        </View>
                        <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>
                          {bj.status === "queued" ? "Na fila…" : bj.status === "downloading" ? `Baixando… ${bj.progress}%` : `Enviando… ${bj.progress}%`}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Buttons */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
            <Pressable
              style={[
                styles.actionBtn,
                { flex: 1, backgroundColor: "#92400e" },
                (bulkRunning || bulkParsed.filter((p) => p.selected).length === 0) && { opacity: 0.4 },
              ]}
              onPress={startBulkDownload}
              disabled={bulkRunning || bulkParsed.filter((p) => p.selected).length === 0}
            >
              {bulkRunning
                ? <ActivityIndicator color="#fff" size="small" />
                : <Feather name="download-cloud" size={16} color="#fff" />}
              <Text style={styles.actionBtnText}>
                {bulkRunning
                  ? `Enviando ${bulkJobs.filter((j) => j.status === "done").length}/${bulkJobs.length}…`
                  : bulkParsed.filter((p) => p.selected).length > 0
                    ? `Enviar ${bulkParsed.filter((p) => p.selected).length} arquivo${bulkParsed.filter((p) => p.selected).length > 1 ? "s" : ""}`
                    : "Selecione URLs acima"}
              </Text>
            </Pressable>
            {(bulkJobs.length > 0 || bulkParsed.length > 0) && !bulkRunning && (
              <Pressable
                style={[styles.actionBtn, { paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.08)" }]}
                onPress={clearBulk}
              >
                <Feather name="trash-2" size={16} color="rgba(255,255,255,0.6)" />
              </Pressable>
            )}
          </View>
        </View>}

        {/* Nova pasta */}
        <View style={[styles.sectionCard, { marginTop: 16 }]}>
          <View style={styles.sectionTitleRow}>
            <Feather name="folder-plus" size={18} color={RED} />
            <Text style={styles.sectionTitle}>Criar nova pasta</Text>
          </View>
          <Text style={styles.sectionHint}>Crie a estrutura antes de enviar os vídeos. Use "/" para sub-pastas.</Text>

          <Text style={styles.fieldLabel}>Nome da pasta</Text>
          <TextInput
            style={styles.input}
            placeholder="Série X/Temporada 1"
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={folderName}
            onChangeText={setFolderName}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Pressable style={[styles.actionBtn, { backgroundColor: "#1d4ed8" }]} onPress={createFolder} disabled={creatingFolder}>
            {creatingFolder ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="folder-plus" size={16} color="#fff" />}
            <Text style={styles.actionBtnText}>Criar pasta</Text>
          </Pressable>
        </View>
      </ScrollView>

      {showFolderPicker && (
        <FolderPickerModal
          onSelect={(prefix) => setSelectedFolder(prefix)}
          onClose={() => setShowFolderPicker(false)}
        />
      )}
      {showBulkFolderPicker && (
        <FolderPickerModal
          onSelect={(prefix) => setBulkFolder(prefix)}
          onClose={() => setShowBulkFolderPicker(false)}
        />
      )}
      {showGdriveFolderPicker && (
        <FolderPickerModal
          onSelect={(prefix) => setGdriveFolder(prefix)}
          onClose={() => setShowGdriveFolderPicker(false)}
        />
      )}
      {showTeraFolderPicker && (
        <FolderPickerModal
          onSelect={(prefix) => setTeraFolder(prefix)}
          onClose={() => setShowTeraFolderPicker(false)}
        />
      )}
      {showLocalFolderPicker && (
        <FolderPickerModal
          onSelect={(prefix) => setLocalFolder(prefix)}
          onClose={() => setShowLocalFolderPicker(false)}
        />
      )}
      {showDriveDestPicker && (
        <FolderPickerModal
          onSelect={(prefix) => setDriveDestFolder(prefix)}
          onClose={() => setShowDriveDestPicker(false)}
        />
      )}
    </>
  );
}

// ── TeraBox API Tab ─────────────────────────────────────────────────────────────

interface TeraBoxFile {
  name: string; size: number; size_formatted: string; type: string;
  quality: string; duration: string; fast_dlink: string; stream_url: string;
  fast_stream_url: Record<string, string>; thumbnail: string; fs_id: number; file_path: string;
  // Added for multi-URL batch resolve:
  _sourceUrl?: string;
  _fileIndexInAlbum?: number;
}

const TB_COLOR = "#f59e0b";

interface TmdbResult {
  id: number; title: string; poster_path: string | null;
  media_type: "movie" | "tv"; year?: string;
}

function TBFileChip({ f, qColor }: { f: TeraBoxFile; qColor: string }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {f.quality ? <View style={{ backgroundColor: `${qColor}20`, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: `${qColor}50` }}><Text style={{ color: qColor, fontSize: 10, fontWeight: "700" }}>{f.quality}</Text></View> : null}
      {f.duration ? <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>⏱ {f.duration}</Text> : null}
      {f.size_formatted ? <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>💾 {f.size_formatted}</Text> : null}
    </View>
  );
}

function TeraBoxRegisterTab() {
  const insets = useSafeAreaInsets();

  const [mediaKind, setMediaKind] = useState<"movie" | "tv">("tv");

  const [inputUrl, setInputUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [resolveProgress, setResolveProgress] = useState<{ done: number; total: number } | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [files, setFiles] = useState<TeraBoxFile[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [parsedEps, setParsedEps] = useState<Array<{ season: number; episode: number } | null>>([]);

  const [tmdbQuery, setTmdbQuery] = useState("");
  const [tmdbSearching, setTmdbSearching] = useState(false);
  const [tmdbResults, setTmdbResults] = useState<TmdbResult[]>([]);
  const [tmdbError, setTmdbError] = useState<string | null>(null);
  const [selectedTmdb, setSelectedTmdb] = useState<TmdbResult | null>(null);
  const [tmdbIdInput, setTmdbIdInput] = useState("");
  const [searchingById, setSearchingById] = useState(false);

  const [r2Folder, setR2Folder] = useState("");
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveResults, setSaveResults] = useState<Array<{ success: boolean; error?: string } | null>>([]);
  const [allDone, setAllDone] = useState(false);

  // Direct registration (no resolve needed)
  const [directMode, setDirectMode] = useState(false);
  const [directSeason, setDirectSeason] = useState("");
  const [directEpisode, setDirectEpisode] = useState("");
  const [directSaving, setDirectSaving] = useState(false);
  const [directDone, setDirectDone] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);

  // ── Episode inline editing ──
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editSeason, setEditSeason] = useState("");
  const [editEp, setEditEp] = useState("");
  // ── Bulk season assignment ──
  const [bulkSeasonInput, setBulkSeasonInput] = useState("");
  // ── Season-folder splitting ──
  const [splitBySeasons, setSplitBySeasons] = useState(false);
  // ── Per-URL season map (when multiple URLs resolved) ──
  const [urlSeasonMap, setUrlSeasonMap] = useState<Record<string, string>>({});
  const [showUrlSeasonPanel, setShowUrlSeasonPanel] = useState(false);
  // ── Detected subfolders count (from TeraBox API) ──
  const [detectedFolderCount, setDetectedFolderCount] = useState(0);

  const qualityColors: Record<string, string> = { "4K": "#a78bfa", "1080p": "#60a5fa", "720p": "#34d399", "480p": "#f59e0b", "360p": "#fb923c" };

  const parseEpisode = (filename: string): { season: number; episode: number } | null => {
    // SxxExx: S01E01
    let m = filename.match(/[Ss](\d{1,2})[Ee](\d{1,3})/);
    if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };
    // NxNN: 3x01, 1x09 (common in Brazilian naming)
    m = filename.match(/\b(\d{1,2})[xX](\d{1,3})\b/);
    if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };
    return null;
  };

  const parseEpOnly = (filename: string): number | null => {
    // Extract just episode number for bulk season assignment
    const m =
      filename.match(/[Ee]p?(\d{1,3})/i) ??
      filename.match(/[Ee]pisodio\s*(\d{1,3})/i) ??
      filename.match(/\b(\d{1,3})\b/);
    return m ? parseInt(m[1], 10) : null;
  };

  const guessTitle = (filename: string): string =>
    filename
      .replace(/^\([^)]+\)\s*/g, "")
      .replace(/[Ss]\d{1,2}[Ee]\d{1,3}.*/g, "")
      .replace(/\.\d{3,4}p.*/gi, "")
      .replace(/\s*\d{3,4}p.*/gi, "")
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const allSelected = files.length > 0 && selected.size === files.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(files.map((_, i) => i)));
  };

  const resolve = async () => {
    // Support multiple URLs — one per line
    const urls = inputUrl.split(/\n+/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (urls.length === 0) { setResolveError("Cole um ou mais links do TeraBox (um por linha)"); return; }
    setLoading(true);
    setResolveError(null);
    setResolveProgress({ done: 0, total: urls.length });
    setFiles([]);
    setSelected(new Set());
    setParsedEps([]);
    setSelectedTmdb(null);
    setTmdbResults([]);
    setSaveResults([]);
    setAllDone(false);
    try {
      const allFiles: TeraBoxFile[] = [];
      const errors: string[] = [];
      let totalFolders = 0;
      for (let ui = 0; ui < urls.length; ui++) {
        try {
          const r = await teraboxResolve(urls[ui]);
          const list = r.list ?? [];
          totalFolders += (r as any).total_folders ?? 0;
          list.forEach((f, idx) => {
            allFiles.push({ ...(f as any), _sourceUrl: urls[ui], _fileIndexInAlbum: idx });
          });
        } catch (e: any) {
          errors.push(`URL ${ui + 1}: ${e.message ?? "Erro"}`);
        }
        setResolveProgress({ done: ui + 1, total: urls.length });
      }
      setDetectedFolderCount(totalFolders);
      if (allFiles.length === 0) {
        setResolveError(errors.length > 0 ? errors.join(" | ") : "Nenhum arquivo encontrado nos links");
        return;
      }
      if (errors.length > 0) setResolveError(`Alguns links falharam: ${errors.join(" | ")}`);
      setFiles(allFiles);
      setSelected(new Set(allFiles.map((_, i) => i)));
      const parsed = allFiles.map((f) => parseEpisode(f.name));
      setParsedEps(parsed);
      setSaveResults(new Array(allFiles.length).fill(null));
      const guess = guessTitle(allFiles[0].name);
      setTmdbQuery(guess);
    } catch (e: any) { setResolveError(e.message ?? "Erro na API TeraBox"); }
    finally { setLoading(false); setResolveProgress(null); }
  };

  const searchTmdb = async () => {
    const q = tmdbQuery.trim();
    if (!q) return;
    setTmdbSearching(true);
    setTmdbError(null);
    setTmdbResults([]);
    setSelectedTmdb(null);
    try {
      const r = await apiFetch<{ results: any[] }>(`/tmdb-search?q=${encodeURIComponent(q)}&type=multi`);
      const results: TmdbResult[] = (r.results ?? [])
        .filter((x: any) => x.media_type === "movie" || x.media_type === "tv")
        .slice(0, 8)
        .map((x: any) => ({
          id: x.id,
          title: x.media_type === "movie" ? (x.title ?? x.name) : (x.name ?? x.title),
          poster_path: x.poster_path ?? null,
          media_type: x.media_type,
          year: (x.release_date ?? x.first_air_date ?? "").slice(0, 4),
        }));
      setTmdbResults(results);
      if (results.length === 0) setTmdbError("Nenhum resultado encontrado");
    } catch (e: any) { setTmdbError(e.message ?? "Erro TMDB"); }
    finally { setTmdbSearching(false); }
  };

  const searchTmdbById = async () => {
    const id = parseInt(tmdbIdInput.trim(), 10);
    if (!id) { setTmdbError("Digite um ID numérico válido"); return; }
    setSearchingById(true);
    setTmdbError(null);
    setTmdbResults([]);
    try {
      const result = await fetchTmdbById(id);
      if (result) {
        selectTmdb(result as TmdbResult);
        setTmdbIdInput("");
      } else {
        setTmdbError(`ID ${id} não encontrado no TMDB`);
      }
    } catch (e: any) { setTmdbError(e.message ?? "Erro"); }
    finally { setSearchingById(false); }
  };

  const selectTmdb = (t: TmdbResult) => {
    setSelectedTmdb(t);
    setMediaKind(t.media_type);
    setTmdbResults([]);
    if (!r2Folder && !newFolderName) setNewFolderName(t.title);
  };

  const createR2Folder = async () => {
    const n = newFolderName.trim();
    if (!n) return;
    const fullPath = `${n}/`;
    setCreatingFolder(true);
    try {
      await apiPost("/mkdir", { prefix: fullPath });
      setR2Folder(fullPath);
      setNewFolderName("");
    } catch (e: any) { Alert.alert("Erro", e.message ?? "Erro ao criar pasta"); }
    finally { setCreatingFolder(false); }
  };

  const registerAll = async () => {
    if (!selectedTmdb) { Alert.alert("TMDB", "Selecione um título no TMDB primeiro"); return; }
    if (files.length === 0) { Alert.alert("Sem arquivos", "Resolva um link TeraBox primeiro"); return; }
    const toRegister = Array.from(selected).sort((a, b) => a - b);
    if (toRegister.length === 0) { Alert.alert("Selecione", "Selecione ao menos um arquivo"); return; }
    setSaving(true);
    const results = new Array(files.length).fill(null) as Array<{ success: boolean; error?: string } | null>;
    for (const idx of toRegister) {
      const ep = parsedEps[idx];
      const s = ep ? String(ep.season).padStart(2, "0") : null;
      const e2 = ep ? String(ep.episode).padStart(2, "0") : null;
      const labelStr = mediaKind === "tv" && s && e2 ? `T${s} E${e2}` : selectedTmdb.title;
      try {
        await apiPost("/terabox/register", {
          teraboxUrl: files[idx]?._sourceUrl ?? inputUrl.trim(),
          fileIndex: files[idx]?._fileIndexInAlbum ?? idx,
          fileName: files[idx]?.name,
          tmdbId: selectedTmdb.id,
          tmdbType: mediaKind,
          title: selectedTmdb.title,
          label: labelStr,
          season: mediaKind === "tv" && ep ? ep.season : null,
          episode: mediaKind === "tv" && ep ? ep.episode : null,
          r2Folder: getEffectiveFolder(idx),
        });
        results[idx] = { success: true };
      } catch (e: any) {
        results[idx] = { success: false, error: e.message ?? "Erro" };
      }
      setSaveResults([...results]);
    }
    setSaving(false);
    setAllDone(true);
  };

  // ── Apply inline edit to a single file ──
  const applyEpEdit = (idx: number) => {
    const s = editSeason.trim() ? parseInt(editSeason, 10) : null;
    const e = editEp.trim() ? parseInt(editEp, 10) : null;
    setParsedEps((prev) => {
      const n = [...prev];
      const cur = n[idx];
      if (s !== null || e !== null) {
        n[idx] = { season: s ?? cur?.season ?? 1, episode: e ?? cur?.episode ?? 1 };
      }
      return n;
    });
    setEditingIdx(null);
    setEditSeason("");
    setEditEp("");
  };

  // ── Apply inline edit season to ALL selected files ──
  const applyEpEditToAll = (idx: number) => {
    const s = editSeason.trim() ? parseInt(editSeason, 10) : null;
    if (!s) { applyEpEdit(idx); return; }
    setParsedEps((prev) => prev.map((ep, i) => {
      if (!selected.has(i)) return ep;
      const epNum = ep?.episode ?? parseEpOnly(files[i]?.name ?? "") ?? 0;
      return { season: s, episode: epNum };
    }));
    setEditingIdx(null);
    setEditSeason("");
    setEditEp("");
  };

  // ── Apply bulk season to selected or all files ──
  const applyBulkSeason = (mode: "selected" | "all") => {
    const s = parseInt(bulkSeasonInput.trim(), 10);
    if (!s || s < 1) return;
    setParsedEps((prev) => prev.map((ep, i) => {
      if (mode === "selected" && !selected.has(i)) return ep;
      const epNum = ep?.episode ?? parseEpOnly(files[i]?.name ?? "") ?? 0;
      return { season: s, episode: epNum };
    }));
    setBulkSeasonInput("");
  };

  // ── Apply URL-season map to parsedEps ──
  const applyUrlSeasonMap = () => {
    const urlKeys = Object.keys(urlSeasonMap);
    if (urlKeys.length === 0) return;
    setParsedEps((prev) => prev.map((ep, i) => {
      const srcUrl = files[i]?._sourceUrl;
      if (!srcUrl) return ep;
      const seasonStr = urlSeasonMap[srcUrl];
      if (!seasonStr) return ep;
      const s = parseInt(seasonStr, 10);
      if (!s || s < 1) return ep;
      const epNum = ep?.episode ?? parseEpOnly(files[i]?.name ?? "") ?? 0;
      return { season: s, episode: epNum };
    }));
    setShowUrlSeasonPanel(false);
  };

  // ── Get effective R2 folder for a file (split-by-seasons) ──
  const getEffectiveFolder = (idx: number): string | undefined => {
    if (!splitBySeasons || mediaKind !== "tv") return r2Folder || undefined;
    const ep = parsedEps[idx];
    if (!ep?.season) return r2Folder || undefined;
    const base = r2Folder ? (r2Folder.endsWith("/") ? r2Folder : `${r2Folder}/`) : "";
    return `${base}Temporada ${ep.season}/`;
  };

  const reset = () => {
    setInputUrl(""); setFiles([]); setSelected(new Set()); setParsedEps([]);
    setResolveError(null); setResolveProgress(null); setSelectedTmdb(null); setTmdbResults([]); setTmdbQuery("");
    setR2Folder(""); setNewFolderName(""); setSaveResults([]); setAllDone(false);
    setDirectMode(false); setDirectSeason(""); setDirectEpisode("");
    setDirectDone(false); setDirectError(null);
    setEditingIdx(null); setEditSeason(""); setEditEp("");
    setBulkSeasonInput(""); setSplitBySeasons(false);
    setUrlSeasonMap({}); setShowUrlSeasonPanel(false);
    setDetectedFolderCount(0);
  };

  const registerDirect = async () => {
    const u = inputUrl.trim();
    if (!u) { setDirectError("Cole o link do TeraBox acima"); return; }
    if (!selectedTmdb) { setDirectError("Pesquise e selecione um título do TMDB"); return; }
    setDirectSaving(true);
    setDirectError(null);
    setDirectDone(false);
    try {
      const s = directSeason ? parseInt(directSeason, 10) : null;
      const e = directEpisode ? parseInt(directEpisode, 10) : null;
      const padS = s !== null ? String(s).padStart(2, "0") : null;
      const padE = e !== null ? String(e).padStart(2, "0") : null;
      const label = mediaKind === "tv" && padS && padE
        ? `T${padS} E${padE}`
        : selectedTmdb.title;
      await apiPost("/terabox/register", {
        teraboxUrl: u,
        fileIndex: 0,
        tmdbId: selectedTmdb.id,
        tmdbType: mediaKind,
        title: selectedTmdb.title,
        label,
        season: mediaKind === "tv" ? s : null,
        episode: mediaKind === "tv" ? e : null,
      });
      setDirectDone(true);
    } catch (e: any) { setDirectError(e.message ?? "Erro ao registrar"); }
    finally { setDirectSaving(false); }
  };

  const successCount = saveResults.filter((r) => r?.success).length;
  const failCount = saveResults.filter((r) => r && !r.success).length;

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 80 }}>

        {/* ── Tipo de mídia — sempre visível ── */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
          {(["tv", "movie"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setMediaKind(t)}
              style={{
                flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center",
                backgroundColor: mediaKind === t
                  ? (t === "tv" ? "rgba(26,107,181,0.25)" : `${RED}22`)
                  : "rgba(255,255,255,0.06)",
                borderWidth: 2,
                borderColor: mediaKind === t ? (t === "tv" ? "#1a6bb5" : RED) : "rgba(255,255,255,0.1)",
              }}
            >
              <Text style={{ fontSize: 24 }}>{t === "tv" ? "📺" : "🎬"}</Text>
              <Text style={{
                color: mediaKind === t ? (t === "tv" ? "#60a5fa" : RED) : "rgba(255,255,255,0.45)",
                fontWeight: "700", fontSize: 14, marginTop: 4,
              }}>{t === "tv" ? "Série" : "Filme"}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Link + Resolver ── */}
        <View style={[styles.sectionCard, { borderColor: "rgba(245,158,11,0.2)", marginBottom: 12 }]}>
          <View style={styles.sectionTitleRow}>
            <Feather name="link" size={14} color={TB_COLOR} />
            <Text style={[styles.sectionTitle, { color: TB_COLOR, fontSize: 13 }]}>Links do TeraBox</Text>
          </View>
          <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginBottom: 6 }}>
            Cole um ou mais links (um por linha). Sem limite de arquivos.
          </Text>
          <TextInput
            style={[styles.input, { minHeight: 72 }, loading && { opacity: 0.5 }]}
            placeholder={"https://1024terabox.com/s/...\nhttps://1024terabox.com/s/...\nhttps://1024terabox.com/s/..."}
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={inputUrl}
            onChangeText={(v) => { setInputUrl(v); if (files.length > 0) reset(); }}
            autoCapitalize="none" autoCorrect={false} editable={!loading} multiline
          />
          {resolveProgress && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
              <ActivityIndicator color={TB_COLOR} size="small" />
              <Text style={{ color: TB_COLOR, fontSize: 12 }}>
                Resolvendo {resolveProgress.done}/{resolveProgress.total} links…
              </Text>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <Pressable
              style={[styles.actionBtn, { flex: 1, backgroundColor: TB_COLOR }, loading && { opacity: 0.5 }]}
              onPress={resolve} disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="search" size={15} color="#fff" />}
              <Text style={styles.actionBtnText}>{loading ? "Consultando API…" : "Resolver TeraBox"}</Text>
            </Pressable>
            {files.length > 0 && !saving && (
              <Pressable style={[styles.actionBtn, { paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.08)" }]} onPress={reset}>
                <Feather name="refresh-cw" size={15} color="rgba(255,255,255,0.6)" />
              </Pressable>
            )}
          </View>
          {resolveError && (
            <View>
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={13} color="#f87171" />
                <Text style={styles.errorBoxText}>{resolveError}</Text>
              </View>
              {!directMode && (
                <Pressable
                  onPress={() => setDirectMode(true)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, padding: 12,
                    backgroundColor: "rgba(245,158,11,0.12)", borderRadius: 10, borderWidth: 1,
                    borderColor: `${TB_COLOR}44` }}
                >
                  <Feather name="zap" size={14} color={TB_COLOR} />
                  <Text style={{ color: TB_COLOR, fontSize: 13, fontWeight: "600" }}>Registrar Direto (sem resolver)</Text>
                </Pressable>
              )}
            </View>
          )}
          {!resolveError && !files.length && (
            <Pressable
              onPress={() => setDirectMode((v) => !v)}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, padding: 10,
                backgroundColor: directMode ? `${TB_COLOR}18` : "rgba(255,255,255,0.04)", borderRadius: 10,
                borderWidth: 1, borderColor: directMode ? `${TB_COLOR}55` : "rgba(255,255,255,0.08)" }}
            >
              <Feather name="zap" size={13} color={directMode ? TB_COLOR : "rgba(255,255,255,0.35)"} />
              <Text style={{ color: directMode ? TB_COLOR : "rgba(255,255,255,0.45)", fontSize: 12 }}>
                {directMode ? "Modo Direto ativo" : "Registrar Direto (sem resolver)"}
              </Text>
            </Pressable>
          )}

          {/* ── Folder detection hint ── */}
          {detectedFolderCount > 0 && files.length > 0 && (
            <View style={{ marginTop: 10, padding: 12, backgroundColor: "rgba(245,158,11,0.1)", borderRadius: 10,
              borderWidth: 1, borderColor: `${TB_COLOR}44` }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Feather name="folder" size={14} color={TB_COLOR} />
                <Text style={{ color: TB_COLOR, fontSize: 13, fontWeight: "700" }}>
                  {detectedFolderCount} subpasta{detectedFolderCount > 1 ? "s" : ""} detectada{detectedFolderCount > 1 ? "s" : ""}
                </Text>
              </View>
              <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, lineHeight: 16 }}>
                Este link contém subpastas (ex: temporadas). Cole cada link de subpasta numa linha separada acima para processar os arquivos de cada pasta individualmente. Use "Atribuir temporada por link" para mapear cada URL a uma temporada.
              </Text>
            </View>
          )}
        </View>

        {/* ── Registrar Direto (no-resolve mode) ── */}
        {directMode && files.length === 0 && (
          <View style={[styles.sectionCard, { borderColor: `${TB_COLOR}44`, marginBottom: 12 }]}>
            <View style={styles.sectionTitleRow}>
              <Feather name="zap" size={14} color={TB_COLOR} />
              <Text style={[styles.sectionTitle, { color: TB_COLOR, fontSize: 13 }]}>Registrar Direto</Text>
            </View>
            <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginBottom: 12 }}>
              Salva o link no registry sem verificar. O player resolve na hora do play.
            </Text>

            {/* TMDB search */}
            <Text style={styles.fieldLabel}>Buscar título no TMDB</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Nome do filme ou série…"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={tmdbQuery}
                onChangeText={setTmdbQuery}
                onSubmitEditing={searchTmdb}
                returnKeyType="search"
              />
              <Pressable
                onPress={searchTmdb}
                style={[styles.actionBtn, { paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.08)" }, tmdbSearching && { opacity: 0.5 }]}
                disabled={tmdbSearching}
              >
                {tmdbSearching ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="search" size={15} color="rgba(255,255,255,0.7)" />}
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
                backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 8, borderWidth: 1,
                borderColor: "rgba(255,255,255,0.1)", paddingLeft: 10, paddingRight: 4 }}>
                <Feather name="hash" size={13} color="rgba(255,255,255,0.35)" />
                <TextInput
                  style={{ flex: 1, color: "#fff", fontSize: 13, paddingVertical: 9 }}
                  placeholder="ID do TMDB (ex: 950)"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  keyboardType="number-pad"
                  value={tmdbIdInput}
                  onChangeText={setTmdbIdInput}
                  onSubmitEditing={searchTmdbById}
                  returnKeyType="search"
                />
              </View>
              <Pressable
                onPress={searchTmdbById}
                style={[styles.actionBtn, { paddingHorizontal: 14, backgroundColor: "rgba(229,9,20,0.18)", borderWidth: 1, borderColor: "rgba(229,9,20,0.35)" }, searchingById && { opacity: 0.5 }]}
                disabled={searchingById}
              >
                {searchingById ? <ActivityIndicator size="small" color={RED} /> : <Feather name="crosshair" size={15} color={RED} />}
              </Pressable>
            </View>
            {tmdbError && <Text style={{ color: "#f87171", fontSize: 11, marginBottom: 8 }}>{tmdbError}</Text>}
            {tmdbResults.map((t) => (
              <Pressable key={t.id} onPress={() => selectTmdb(t)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8,
                  borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" }}>
                <Feather name="film" size={14} color="rgba(255,255,255,0.4)" />
                <Text style={{ color: "#fff", fontSize: 13, flex: 1 }}>{t.title}</Text>
                <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{t.year} · {t.media_type}</Text>
              </Pressable>
            ))}
            {selectedTmdb && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 10,
                backgroundColor: "rgba(255,255,255,0.06)", padding: 10, borderRadius: 8 }}>
                <Feather name="check-circle" size={14} color="#4ade80" />
                <Text style={{ color: "#4ade80", fontSize: 13, flex: 1 }} numberOfLines={1}>{selectedTmdb.title} ({selectedTmdb.year})</Text>
                <Pressable onPress={() => { setSelectedTmdb(null); setTmdbResults([]); }}>
                  <Feather name="x" size={14} color="rgba(255,255,255,0.4)" />
                </Pressable>
              </View>
            )}

            {/* Season / Episode (TV only) */}
            {mediaKind === "tv" && (
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Temporada</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="1"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    keyboardType="number-pad"
                    value={directSeason}
                    onChangeText={setDirectSeason}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Episódio</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="1"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    keyboardType="number-pad"
                    value={directEpisode}
                    onChangeText={setDirectEpisode}
                  />
                </View>
              </View>
            )}

            {directError && <View style={styles.errorBox}><Feather name="alert-circle" size={13} color="#f87171" /><Text style={styles.errorBoxText}>{directError}</Text></View>}
            {directDone && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(74,222,128,0.12)",
                padding: 12, borderRadius: 8, marginTop: 8 }}>
                <Feather name="check-circle" size={16} color="#4ade80" />
                <Text style={{ color: "#4ade80", fontSize: 14, fontWeight: "600" }}>Link registrado com sucesso!</Text>
              </View>
            )}
            {!directDone && (
              <Pressable
                onPress={registerDirect}
                style={[styles.actionBtn, { marginTop: 10, backgroundColor: TB_COLOR }, (directSaving || !selectedTmdb) && { opacity: 0.5 }]}
                disabled={directSaving || !selectedTmdb}
              >
                {directSaving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="bookmark" size={15} color="#fff" />}
                <Text style={styles.actionBtnText}>{directSaving ? "Salvando…" : "Salvar no Registry"}</Text>
              </Pressable>
            )}
            {directDone && (
              <Pressable onPress={reset} style={[styles.actionBtn, { marginTop: 8, backgroundColor: "rgba(255,255,255,0.08)" }]}>
                <Feather name="plus" size={15} color="rgba(255,255,255,0.7)" />
                <Text style={[styles.actionBtnText, { color: "rgba(255,255,255,0.7)" }]}>Registrar outro</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ── Arquivos com Selecionar Tudo ── */}
        {files.length > 0 && (
          <View style={[styles.sectionCard, { borderColor: "rgba(245,158,11,0.2)", marginBottom: 12 }]}>
            {/* Header row */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <Feather name="package" size={14} color={TB_COLOR} style={{ marginRight: 6 }} />
              <Text style={[styles.sectionTitle, { flex: 1, fontSize: 13, color: TB_COLOR }]}>
                {files.length} arquivo{files.length > 1 ? "s" : ""}
              </Text>
              <Pressable
                onPress={toggleAll}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 5,
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                  backgroundColor: allSelected ? `${TB_COLOR}22` : "rgba(255,255,255,0.07)",
                  borderWidth: 1, borderColor: allSelected ? `${TB_COLOR}44` : "rgba(255,255,255,0.12)",
                }}
              >
                <Feather name={allSelected ? "check-square" : "square"} size={14} color={allSelected ? TB_COLOR : "rgba(255,255,255,0.4)"} />
                <Text style={{ color: allSelected ? TB_COLOR : "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "700" }}>
                  {allSelected ? "Desmarcar Tudo" : "Selecionar Tudo"}
                </Text>
              </Pressable>
            </View>

            {/* ── Bulk season assignment (TV only) ── */}
            {mediaKind === "tv" && !saving && (
              <View style={{ backgroundColor: "rgba(26,107,181,0.1)", borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: "rgba(26,107,181,0.25)" }}>
                <Text style={{ color: "#60a5fa", fontSize: 11, fontWeight: "700", marginBottom: 8 }}>Definir temporada em massa</Text>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <TextInput
                    style={[styles.input, { flex: 1, paddingVertical: 7 }]}
                    placeholder="Nº da temporada"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    keyboardType="number-pad"
                    value={bulkSeasonInput}
                    onChangeText={setBulkSeasonInput}
                    returnKeyType="done"
                  />
                  <Pressable
                    onPress={() => applyBulkSeason("selected")}
                    disabled={!bulkSeasonInput.trim()}
                    style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
                      backgroundColor: bulkSeasonInput.trim() ? "rgba(26,107,181,0.4)" : "rgba(255,255,255,0.07)",
                      borderWidth: 1, borderColor: "rgba(26,107,181,0.35)" }}
                  >
                    <Text style={{ color: bulkSeasonInput.trim() ? "#60a5fa" : "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: "700" }}>Selecionados</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => applyBulkSeason("all")}
                    disabled={!bulkSeasonInput.trim()}
                    style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
                      backgroundColor: bulkSeasonInput.trim() ? "rgba(26,107,181,0.6)" : "rgba(255,255,255,0.07)",
                      borderWidth: 1, borderColor: "rgba(26,107,181,0.35)" }}
                  >
                    <Text style={{ color: bulkSeasonInput.trim() ? "#93c5fd" : "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: "700" }}>Todos</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* ── Per-URL season map (when multiple source URLs) ── */}
            {mediaKind === "tv" && !saving && (() => {
              const uniqueUrls = [...new Set(files.map((f) => f._sourceUrl).filter(Boolean))] as string[];
              return uniqueUrls.length > 1 ? (
                <View style={{ marginBottom: 10 }}>
                  <Pressable
                    onPress={() => setShowUrlSeasonPanel((v) => !v)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 10,
                      backgroundColor: showUrlSeasonPanel ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.05)",
                      borderRadius: 10, borderWidth: 1, borderColor: showUrlSeasonPanel ? `${TB_COLOR}44` : "rgba(255,255,255,0.1)" }}
                  >
                    <Feather name="layers" size={13} color={showUrlSeasonPanel ? TB_COLOR : "rgba(255,255,255,0.45)"} />
                    <Text style={{ color: showUrlSeasonPanel ? TB_COLOR : "rgba(255,255,255,0.55)", fontSize: 12, flex: 1, fontWeight: "600" }}>
                      Atribuir temporada por link ({uniqueUrls.length} links)
                    </Text>
                    <Feather name={showUrlSeasonPanel ? "chevron-up" : "chevron-down"} size={13} color="rgba(255,255,255,0.35)" />
                  </Pressable>
                  {showUrlSeasonPanel && (
                    <View style={{ marginTop: 8, backgroundColor: "rgba(245,158,11,0.07)", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: `${TB_COLOR}22` }}>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginBottom: 10 }}>
                        Atribua uma temporada a cada link. Os episódios serão preservados.
                      </Text>
                      {uniqueUrls.map((url, ui) => {
                        const fileCount = files.filter((f) => f._sourceUrl === url).length;
                        const shortUrl = url.length > 38 ? url.slice(0, 18) + "…" + url.slice(-16) : url;
                        return (
                          <View key={ui} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 10 }} numberOfLines={1}>{shortUrl}</Text>
                              <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>{fileCount} arquivo{fileCount > 1 ? "s" : ""}</Text>
                            </View>
                            <TextInput
                              style={[styles.input, { width: 72, paddingVertical: 6, textAlign: "center" }]}
                              placeholder="T?"
                              placeholderTextColor="rgba(255,255,255,0.2)"
                              keyboardType="number-pad"
                              value={urlSeasonMap[url] ?? ""}
                              onChangeText={(v) => setUrlSeasonMap((prev) => ({ ...prev, [url]: v }))}
                            />
                          </View>
                        );
                      })}
                      <Pressable
                        onPress={applyUrlSeasonMap}
                        style={{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center",
                          paddingVertical: 10, backgroundColor: TB_COLOR, borderRadius: 8, marginTop: 4 }}
                      >
                        <Feather name="check" size={14} color="#fff" />
                        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Aplicar mapeamento</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ) : null;
            })()}

            {/* ── File list ── */}
            {files.map((f, i) => {
              const sel = selected.has(i);
              const ep = parsedEps[i];
              const result = saveResults[i];
              const qColor = qualityColors[f.quality] ?? "rgba(255,255,255,0.4)";
              const isEditing = editingIdx === i;
              return (
                <View key={i} style={{ borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" }}>
                  <Pressable
                    onPress={() => !saving && setSelected((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                    style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10 }}
                  >
                    {result?.success
                      ? <Feather name="check-circle" size={18} color="#4ade80" style={{ marginTop: 2 }} />
                      : result && !result.success
                        ? <Feather name="x-circle" size={18} color="#f87171" style={{ marginTop: 2 }} />
                        : <Feather name={sel ? "check-square" : "square"} size={18} color={sel ? TB_COLOR : "rgba(255,255,255,0.25)"} style={{ marginTop: 2 }} />}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600", marginBottom: 4 }} numberOfLines={2}>{f.name}</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
                        {f.quality && (
                          <View style={{ backgroundColor: `${qColor}20`, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: `${qColor}50` }}>
                            <Text style={{ color: qColor, fontSize: 10, fontWeight: "700" }}>{f.quality}</Text>
                          </View>
                        )}
                        {ep && mediaKind === "tv" && (
                          <Pressable
                            onPress={() => {
                              if (isEditing) { setEditingIdx(null); return; }
                              setEditingIdx(i);
                              setEditSeason(String(ep.season));
                              setEditEp(String(ep.episode));
                            }}
                            style={{ flexDirection: "row", alignItems: "center", gap: 4,
                              backgroundColor: isEditing ? "rgba(26,107,181,0.45)" : "rgba(26,107,181,0.25)",
                              borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2,
                              borderWidth: 1, borderColor: isEditing ? "#60a5fa" : "rgba(26,107,181,0.5)" }}
                          >
                            <Text style={{ color: "#60a5fa", fontSize: 10, fontWeight: "700" }}>T{String(ep.season).padStart(2, "0")} E{String(ep.episode).padStart(2, "0")}</Text>
                            <Feather name="edit-2" size={9} color="#60a5fa" />
                          </Pressable>
                        )}
                        {!ep && mediaKind === "tv" && !saving && (
                          <Pressable
                            onPress={() => { setEditingIdx(i); setEditSeason(""); setEditEp(""); }}
                            style={{ flexDirection: "row", alignItems: "center", gap: 4,
                              backgroundColor: isEditing ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.06)",
                              borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2,
                              borderWidth: 1, borderColor: isEditing ? `${TB_COLOR}66` : "rgba(255,255,255,0.1)" }}
                          >
                            <Feather name="plus" size={9} color={isEditing ? TB_COLOR : "rgba(255,255,255,0.4)"} />
                            <Text style={{ color: isEditing ? TB_COLOR : "rgba(255,255,255,0.4)", fontSize: 10 }}>S×E</Text>
                          </Pressable>
                        )}
                        {f.size_formatted && <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>{f.size_formatted}</Text>}
                        {splitBySeasons && mediaKind === "tv" && ep?.season && (
                          <View style={{ backgroundColor: "rgba(245,158,11,0.12)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: "rgba(245,158,11,0.3)" }}>
                            <Text style={{ color: TB_COLOR, fontSize: 9, fontWeight: "700" }}>📁 T{ep.season}</Text>
                          </View>
                        )}
                      </View>
                      {result && !result.success && <Text style={{ color: "#f87171", fontSize: 10, marginTop: 3 }}>❌ {result.error}</Text>}
                      {result?.success && <Text style={{ color: "#4ade80", fontSize: 10, marginTop: 3 }}>✅ Registrado!</Text>}
                    </View>
                  </Pressable>

                  {/* ── Inline episode editor ── */}
                  {isEditing && !saving && (
                    <View style={{ backgroundColor: "rgba(26,107,181,0.12)", borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: "rgba(26,107,181,0.3)" }}>
                      <Text style={{ color: "#60a5fa", fontSize: 11, fontWeight: "700", marginBottom: 8 }}>Editar temporada / episódio</Text>
                      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, marginBottom: 4 }}>Temporada</Text>
                          <TextInput
                            style={[styles.input, { paddingVertical: 8 }]}
                            placeholder="1"
                            placeholderTextColor="rgba(255,255,255,0.2)"
                            keyboardType="number-pad"
                            value={editSeason}
                            onChangeText={setEditSeason}
                            autoFocus
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, marginBottom: 4 }}>Episódio</Text>
                          <TextInput
                            style={[styles.input, { paddingVertical: 8 }]}
                            placeholder="1"
                            placeholderTextColor="rgba(255,255,255,0.2)"
                            keyboardType="number-pad"
                            value={editEp}
                            onChangeText={setEditEp}
                          />
                        </View>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable
                          onPress={() => applyEpEdit(i)}
                          style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                            paddingVertical: 9, backgroundColor: "rgba(26,107,181,0.5)", borderRadius: 8,
                            borderWidth: 1, borderColor: "rgba(26,107,181,0.6)" }}
                        >
                          <Feather name="check" size={13} color="#60a5fa" />
                          <Text style={{ color: "#60a5fa", fontWeight: "700", fontSize: 12 }}>Este arquivo</Text>
                        </Pressable>
                        {selected.size > 1 && (
                          <Pressable
                            onPress={() => applyEpEditToAll(i)}
                            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                              paddingVertical: 9, backgroundColor: "rgba(26,107,181,0.3)", borderRadius: 8,
                              borderWidth: 1, borderColor: "rgba(26,107,181,0.5)" }}
                          >
                            <Feather name="layers" size={13} color="#93c5fd" />
                            <Text style={{ color: "#93c5fd", fontWeight: "700", fontSize: 12 }}>Selecionados (T{editSeason||"?"})</Text>
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => { setEditingIdx(null); setEditSeason(""); setEditEp(""); }}
                          style={{ paddingHorizontal: 14, paddingVertical: 9, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 8 }}
                        >
                          <Feather name="x" size={14} color="rgba(255,255,255,0.4)" />
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── TMDB ── */}
        {files.length > 0 && (
          <View style={[styles.sectionCard, { borderColor: "rgba(245,158,11,0.2)", marginBottom: 12 }]}>
            <View style={styles.sectionTitleRow}>
              <Feather name="database" size={14} color={TB_COLOR} />
              <Text style={[styles.sectionTitle, { color: TB_COLOR, fontSize: 13 }]}>Vincular TMDB</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Buscar filme ou série..."
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={tmdbQuery}
                onChangeText={setTmdbQuery}
                onSubmitEditing={searchTmdb}
                returnKeyType="search"
                autoCapitalize="words"
              />
              <Pressable style={[styles.actionBtn, { paddingHorizontal: 14, backgroundColor: "rgba(245,158,11,0.2)", marginTop: 0 }]} onPress={searchTmdb} disabled={tmdbSearching}>
                {tmdbSearching ? <ActivityIndicator color={TB_COLOR} size="small" /> : <Feather name="search" size={15} color={TB_COLOR} />}
              </Pressable>
            </View>
            {tmdbError && <View style={styles.errorBox}><Text style={styles.errorBoxText}>{tmdbError}</Text></View>}
            {tmdbResults.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                {tmdbResults.map((t) => (
                  <Pressable key={t.id} onPress={() => selectTmdb(t)} style={{ width: 80, marginRight: 10, alignItems: "center" }}>
                    {t.poster_path ? (
                      <Image source={{ uri: TMDB_IMG(t.poster_path, "w185") ?? "" }} style={{ width: 70, height: 105, borderRadius: 7, borderWidth: 2, borderColor: "rgba(255,255,255,0.1)" }} />
                    ) : (
                      <View style={{ width: 70, height: 105, borderRadius: 7, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }}>
                        <Feather name="film" size={22} color="rgba(255,255,255,0.3)" />
                      </View>
                    )}
                    <Text style={{ color: "#fff", fontSize: 10, textAlign: "center", marginTop: 3 }} numberOfLines={2}>{t.title}</Text>
                    <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, textAlign: "center" }}>{t.media_type === "tv" ? "Série" : "Filme"} {t.year}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {selectedTmdb && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, backgroundColor: "rgba(245,158,11,0.07)", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "rgba(245,158,11,0.2)" }}>
                {selectedTmdb.poster_path
                  ? <Image source={{ uri: TMDB_IMG(selectedTmdb.poster_path, "w185") ?? "" }} style={{ width: 42, height: 63, borderRadius: 5 }} />
                  : <Feather name="film" size={22} color={TB_COLOR} />}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: TB_COLOR, fontWeight: "700", fontSize: 13 }}>{selectedTmdb.title}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{selectedTmdb.media_type === "tv" ? "Série" : "Filme"} · {selectedTmdb.year}</Text>
                </View>
                <Pressable onPress={() => { setSelectedTmdb(null); setTmdbResults([]); }}>
                  <Feather name="x" size={15} color="rgba(255,255,255,0.4)" />
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* ── Pasta no R2 ── */}
        {files.length > 0 && (
          <View style={[styles.sectionCard, { borderColor: "rgba(245,158,11,0.2)", marginBottom: 12 }]}>
            <View style={styles.sectionTitleRow}>
              <Feather name="folder" size={14} color={TB_COLOR} />
              <Text style={[styles.sectionTitle, { color: TB_COLOR, fontSize: 13 }]}>Pasta no R2 <Text style={{ color: "rgba(255,255,255,0.3)", fontWeight: "400", fontSize: 11 }}>(opcional)</Text></Text>
            </View>
            <Pressable
              style={[styles.input, { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }]}
              onPress={() => setShowFolderPicker(true)}
            >
              <Feather name="folder" size={15} color={r2Folder ? "#f59e0b" : "rgba(255,255,255,0.25)"} />
              <Text style={{ flex: 1, color: r2Folder ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 13 }} numberOfLines={1}>
                {r2Folder ? r2Folder.replace(/\/$/, "") : "Selecionar pasta existente…"}
              </Text>
              {r2Folder
                ? <Pressable onPress={() => setR2Folder("")}><Feather name="x" size={13} color="rgba(255,255,255,0.4)" /></Pressable>
                : <Feather name="chevron-right" size={13} color="rgba(255,255,255,0.3)" />}
            </Pressable>
            <Text style={styles.fieldLabel}>Ou criar nova pasta</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={selectedTmdb ? selectedTmdb.title : "Nome da pasta…"}
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={newFolderName}
                onChangeText={setNewFolderName}
                autoCapitalize="none" autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={createR2Folder}
              />
              <Pressable
                style={[styles.actionBtn, { paddingHorizontal: 14, backgroundColor: "#f59e0b22", borderWidth: 1, borderColor: "#f59e0b44", marginTop: 0 }, (creatingFolder || !newFolderName.trim()) && { opacity: 0.4 }]}
                onPress={createR2Folder}
                disabled={creatingFolder || !newFolderName.trim()}
              >
                {creatingFolder ? <ActivityIndicator color="#f59e0b" size="small" /> : <Feather name="folder-plus" size={15} color="#f59e0b" />}
              </Pressable>
            </View>
            {r2Folder && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, backgroundColor: "rgba(245,158,11,0.1)", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "rgba(245,158,11,0.25)" }}>
                <Feather name="check-circle" size={13} color="#f59e0b" />
                <Text style={{ color: "#f59e0b", fontSize: 12, fontWeight: "600" }} numberOfLines={1}>📁 {r2Folder.replace(/\/$/, "")}</Text>
              </View>
            )}

            {/* ── Split-by-seasons toggle (TV only) ── */}
            {mediaKind === "tv" && (
              <View style={{ marginTop: 12 }}>
                <Pressable
                  onPress={() => setSplitBySeasons((v) => !v)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12,
                    backgroundColor: splitBySeasons ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.04)",
                    borderRadius: 10, borderWidth: 1,
                    borderColor: splitBySeasons ? `${TB_COLOR}55` : "rgba(255,255,255,0.1)" }}
                >
                  <Feather name="git-branch" size={14} color={splitBySeasons ? TB_COLOR : "rgba(255,255,255,0.35)"} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: splitBySeasons ? TB_COLOR : "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "600" }}>
                      Dividir em subpastas por temporada
                    </Text>
                    <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 2 }}>
                      {splitBySeasons
                        ? `Cada arquivo vai para ${r2Folder ? `${r2Folder.replace(/\/$/, "")}/` : ""}Temporada N/`
                        : "Ativa: cada temporada vai para uma subpasta separada"}
                    </Text>
                  </View>
                  <View style={{ width: 36, height: 20, borderRadius: 10,
                    backgroundColor: splitBySeasons ? TB_COLOR : "rgba(255,255,255,0.15)",
                    justifyContent: "center", paddingHorizontal: 2 }}>
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff",
                      alignSelf: splitBySeasons ? "flex-end" : "flex-start" }} />
                  </View>
                </Pressable>

                {splitBySeasons && (() => {
                  const seasonSet = new Set<number>();
                  parsedEps.forEach((ep, i) => { if (selected.has(i) && ep?.season) seasonSet.add(ep.season); });
                  const seasons = [...seasonSet].sort((a, b) => a - b);
                  if (seasons.length === 0) return null;
                  const base = r2Folder ? (r2Folder.endsWith("/") ? r2Folder : `${r2Folder}/`) : "";
                  return (
                    <View style={{ marginTop: 8, backgroundColor: "rgba(245,158,11,0.07)", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: `${TB_COLOR}22` }}>
                      <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginBottom: 6 }}>Pastas que serão criadas:</Text>
                      {seasons.map((s) => {
                        const count = parsedEps.filter((ep, i) => selected.has(i) && ep?.season === s).length;
                        return (
                          <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <Feather name="folder" size={12} color={TB_COLOR} />
                            <Text style={{ color: TB_COLOR, fontSize: 11, fontWeight: "600", flex: 1 }}>
                              {base}Temporada {s}/
                            </Text>
                            <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>{count} ep.</Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}
              </View>
            )}
          </View>
        )}

        {/* ── Botão Registrar ── */}
        {files.length > 0 && selectedTmdb && !allDone && (
          <Pressable
            style={[styles.actionBtn, { backgroundColor: "#22c55e", marginBottom: 16 }, (saving || selected.size === 0) && { opacity: 0.5 }]}
            onPress={registerAll}
            disabled={saving || selected.size === 0}
          >
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="bookmark" size={16} color="#fff" />}
            <Text style={styles.actionBtnText}>
              {saving
                ? `Registrando ${saveResults.filter((r) => r !== null).length}/${selected.size}…`
                : `Registrar ${selected.size} arquivo${selected.size > 1 ? "s" : ""} (sem baixar)`}
            </Text>
          </Pressable>
        )}

        {/* ── Resultado ── */}
        {allDone && (
          <View style={{ backgroundColor: successCount > 0 ? "rgba(34,197,94,0.1)" : "rgba(248,113,113,0.1)", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: successCount > 0 ? "rgba(34,197,94,0.3)" : "rgba(248,113,113,0.3)" }}>
            <Text style={{ color: successCount > 0 ? "#4ade80" : "#f87171", fontWeight: "700", fontSize: 14, marginBottom: 4 }}>
              {successCount > 0 ? `✅ ${successCount} registrado${successCount > 1 ? "s" : ""}!` : "❌ Falhou"}
              {failCount > 0 ? `  ·  ${failCount} erro${failCount > 1 ? "s" : ""}` : ""}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
              {successCount > 0 ? "Links salvos no registro — aparecem como fontes no app." : "Verifique os erros acima e tente novamente."}
            </Text>
            <Pressable onPress={reset} style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Feather name="plus-circle" size={14} color={TB_COLOR} />
              <Text style={{ color: TB_COLOR, fontSize: 13, fontWeight: "600" }}>Registrar outro link</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {showFolderPicker && (
        <FolderPickerModal
          onSelect={(prefix) => { setR2Folder(prefix); setShowFolderPicker(false); }}
          onClose={() => setShowFolderPicker(false)}
        />
      )}
    </>
  );
}

function TeraBoxUploadTab() {
  const insets = useSafeAreaInsets();
  const [inputUrl, setInputUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [resolveProgress, setResolveProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<TeraBoxFile[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [destFolder, setDestFolder] = useState("");
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [jobs, setJobs] = useState<BulkJobItem[]>([]);
  const [running, setRunning] = useState(false);
  const pollRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const resolve = async () => {
    const urls = inputUrl.split(/\n+/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (urls.length === 0) { setError("Cole um ou mais links do TeraBox (um por linha)"); return; }
    setLoading(true);
    setError(null);
    setResolveProgress({ done: 0, total: urls.length });
    setFiles([]);
    setSelected(new Set());
    setJobs([]);
    try {
      const allFiles: TeraBoxFile[] = [];
      const errors: string[] = [];
      for (let ui = 0; ui < urls.length; ui++) {
        try {
          const r = await teraboxResolve(urls[ui]);
          const list = r.list ?? [];
          list.forEach((f, idx) => {
            allFiles.push({ ...(f as any), _sourceUrl: urls[ui], _fileIndexInAlbum: idx });
          });
        } catch (e: any) {
          errors.push(`URL ${ui + 1}: ${e.message ?? "Erro"}`);
        }
        setResolveProgress({ done: ui + 1, total: urls.length });
      }
      if (errors.length > 0) setError(`Alguns links falharam: ${errors.join(" | ")}`);
      setFiles(allFiles);
      setSelected(new Set(allFiles.map((_, i) => i)));
    } catch (e: any) { setError(e.message ?? "Erro na API TeraBox"); }
    finally { setLoading(false); setResolveProgress(null); }
  };

  const sendToR2 = async () => {
    const toUpload = files.filter((_, i) => selected.has(i));
    if (toUpload.length === 0) return;
    const folderBase = destFolder ? (destFolder.endsWith("/") ? destFolder : `${destFolder}/`) : "";
    const initial: BulkJobItem[] = toUpload.map((f) => ({ url: f.fast_dlink, jobId: null, status: "queued", progress: 0, key: `${folderBase}${f.name}` }));
    setJobs(initial);
    setRunning(true);
    const runOne = async (idx: number, file: TeraBoxFile): Promise<void> => {
      try {
        const r = await apiPost<{ jobId: string; key: string }>("/download-url", { url: file.fast_dlink, key: `${folderBase}${file.name}` });
        setJobs((prev) => { const n = [...prev]; n[idx] = { ...n[idx], jobId: r.jobId, status: "downloading", key: r.key }; return n; });
        await new Promise<void>((res) => {
          const poll = async () => {
            try {
              const j = await apiFetch<Job>(`/job/${r.jobId}`);
              setJobs((prev) => { const n = [...prev]; n[idx] = { ...n[idx], status: j.status, progress: j.progress, key: j.key ?? n[idx].key, error: j.error }; return n; });
              if (j.status === "done" || j.status === "error") res();
              else { const t = setTimeout(poll, 1500); pollRefs.current.set(r.jobId, t); }
            } catch { const t = setTimeout(poll, 2500); pollRefs.current.set(r.jobId, t); }
          };
          poll();
        });
      } catch (e: any) { setJobs((prev) => { const n = [...prev]; n[idx] = { ...n[idx], status: "error", error: e.message }; return n; }); }
    };
    let cursor = 0;
    const worker = async () => { while (cursor < toUpload.length) { const i = cursor++; await runOne(i, toUpload[i]); } };
    await Promise.all(Array.from({ length: Math.min(3, toUpload.length) }, worker));
    setRunning(false);
  };

  const reset = () => {
    pollRefs.current.forEach((t) => clearTimeout(t)); pollRefs.current.clear();
    setFiles([]); setJobs([]); setInputUrl(""); setSelected(new Set()); setError(null);
  };

  const qualityColors: Record<string, string> = { "4K": "#a78bfa", "1080p": "#60a5fa", "720p": "#34d399", "480p": "#f59e0b", "360p": "#fb923c" };

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}>
        <View style={[styles.sectionCard, { borderColor: "rgba(245,158,11,0.15)" }]}>
          <View style={styles.sectionTitleRow}>
            <Feather name="upload-cloud" size={15} color={TB_COLOR} />
            <Text style={[styles.sectionTitle, { color: TB_COLOR }]}>Download → R2</Text>
          </View>
          <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 10 }}>Baixa os arquivos do TeraBox diretamente para o seu bucket R2 (ocupa espaço).</Text>
          <Text style={styles.fieldLabel}>Links do TeraBox (um por linha)</Text>
          <TextInput
            style={[styles.input, { minHeight: 72 }, loading && { opacity: 0.5 }]}
            placeholder={"https://1024terabox.com/s/...\nhttps://1024terabox.com/s/...\nhttps://1024terabox.com/s/..."}
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={inputUrl}
            onChangeText={(v) => { setInputUrl(v); if (files.length > 0) reset(); }}
            autoCapitalize="none" autoCorrect={false} editable={!loading && !running} multiline
          />
          {resolveProgress && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
              <ActivityIndicator color={TB_COLOR} size="small" />
              <Text style={{ color: TB_COLOR, fontSize: 12 }}>Resolvendo {resolveProgress.done}/{resolveProgress.total} links…</Text>
            </View>
          )}
          <Pressable style={[styles.actionBtn, { backgroundColor: TB_COLOR }, (loading || running) && { opacity: 0.5 }]} onPress={resolve} disabled={loading || running}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="search" size={16} color="#fff" />}
            <Text style={styles.actionBtnText}>{loading ? "Consultando API…" : "Resolver TeraBox"}</Text>
          </Pressable>
          {error && <View style={styles.errorBox}><Feather name="alert-circle" size={14} color="#f87171" /><Text style={styles.errorBoxText}>{error}</Text></View>}
        </View>

        {files.length > 0 && (
          <View style={[styles.sectionCard, { marginTop: 14, borderColor: "rgba(245,158,11,0.15)" }]}>
            <View style={styles.sectionTitleRow}>
              <Feather name="package" size={16} color={TB_COLOR} />
              <Text style={[styles.sectionTitle, { color: TB_COLOR }]}>{files.length} arquivo{files.length > 1 ? "s" : ""} encontrado{files.length > 1 ? "s" : ""}</Text>
            </View>
            {files.map((f, i) => {
              const sel = selected.has(i);
              const j = jobs[i];
              const qColor = qualityColors[f.quality] ?? "rgba(255,255,255,0.4)";
              return (
                <Pressable key={i} onPress={() => !running && setSelected((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                  style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" }}>
                  <Feather name={j?.status === "done" ? "check-circle" : sel ? "check-square" : "square"} size={20} color={j?.status === "done" ? "#4ade80" : sel ? TB_COLOR : "rgba(255,255,255,0.25)"} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600", marginBottom: 4 }} numberOfLines={2}>{f.name}</Text>
                    <TBFileChip f={f} qColor={qColor} />
                    {j && j.status !== "queued" && (
                      <View style={{ marginTop: 6 }}>
                        {j.status === "done" ? (
                          <Text style={{ color: "#4ade80", fontSize: 11 }}>✅ Salvo: {(j.key || "").split("/").pop()}</Text>
                        ) : j.status === "error" ? (
                          <Text style={{ color: "#f87171", fontSize: 11 }}>❌ {j.error}</Text>
                        ) : (
                          <>
                            <View style={[styles.progressBar, { marginBottom: 3 }]}>
                              <View style={[styles.progressFill, { width: `${j.progress}%` as any, backgroundColor: TB_COLOR }]} />
                            </View>
                            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>{j.status === "downloading" ? `Baixando… ${j.progress}%` : `Enviando… ${j.progress}%`}</Text>
                          </>
                        )}
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Pasta de destino no R2</Text>
            <Pressable style={[styles.input, { flexDirection: "row", alignItems: "center", gap: 10 }, running && { opacity: 0.5 }]} onPress={() => !running && setShowFolderPicker(true)}>
              <Feather name="folder" size={16} color={destFolder ? TB_COLOR : "rgba(255,255,255,0.25)"} />
              <Text style={{ flex: 1, color: destFolder ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 14 }} numberOfLines={1}>{destFolder ? destFolder.replace(/\/$/, "") : "Toque para escolher pasta…"}</Text>
              {destFolder && <Pressable onPress={() => setDestFolder("")}><Feather name="x" size={14} color="rgba(255,255,255,0.4)" /></Pressable>}
            </Pressable>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Pressable style={[styles.actionBtn, { flex: 1, backgroundColor: TB_COLOR }, (running || selected.size === 0) && { opacity: 0.4 }]} onPress={sendToR2} disabled={running || selected.size === 0}>
                {running ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="upload-cloud" size={16} color="#fff" />}
                <Text style={styles.actionBtnText}>{running ? `Enviando ${jobs.filter((j) => j.status === "done").length}/${jobs.length}…` : `Enviar ${selected.size} para R2`}</Text>
              </Pressable>
              {!running && <Pressable style={[styles.actionBtn, { paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.08)" }]} onPress={reset}><Feather name="refresh-cw" size={16} color="rgba(255,255,255,0.6)" /></Pressable>}
            </View>
          </View>
        )}
      </ScrollView>
      {showFolderPicker && <FolderPickerModal onSelect={(prefix) => setDestFolder(prefix)} onClose={() => setShowFolderPicker(false)} />}
    </>
  );
}

function TeraBoxTestTab() {
  const insets = useSafeAreaInsets();
  const [inputUrl, setInputUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{ url: string; name: string; quality?: string; duration?: string; size?: string } | null>(null);
  const [files, setFiles] = useState<TeraBoxFile[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const resolveTerabox = async () => {
    const u = inputUrl.trim();
    if (!u) { setError("Cole um link do TeraBox ou URL direta"); return; }
    setLoading(true);
    setError(null);
    setResolved(null);
    setFiles([]);
    try {
      const r = await teraboxResolve(u);
      const list = r.list ?? [];
      if (list.length === 0) { setError("Nenhum arquivo encontrado"); return; }
      setFiles(list as any[]);
      const f = list[0];
      const streamUrl = f.fast_dlink ?? f.stream_url;
      if (!streamUrl) { setError("URL de stream não disponível para este arquivo"); return; }
      setResolved({ url: streamUrl, name: f.name, quality: f.quality, duration: f.duration, size: f.size_formatted });
      setSelectedIdx(0);
    } catch (e: any) { setError(e.message ?? "Erro ao resolver"); }
    finally { setLoading(false); }
  };

  const testDirect = () => {
    const u = inputUrl.trim();
    if (!u) { setError("Cole uma URL de vídeo"); return; }
    setResolved({ url: u, name: u.split("/").pop() ?? "Vídeo" });
    setFiles([]);
    setError(null);
  };

  const selectFile = (idx: number) => {
    const f = files[idx];
    const streamUrl = f.fast_dlink ?? f.stream_url;
    if (!streamUrl) { setError("URL de stream não disponível para este arquivo"); return; }
    setSelectedIdx(idx);
    setResolved({ url: streamUrl, name: f.name, quality: f.quality, duration: f.duration, size: f.size_formatted });
  };

  const qualityColors: Record<string, string> = { "4K": "#a78bfa", "1080p": "#60a5fa", "720p": "#34d399", "480p": "#f59e0b", "360p": "#fb923c" };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}>
      <View style={[styles.sectionCard, { borderColor: "rgba(245,158,11,0.15)" }]}>
        <View style={styles.sectionTitleRow}>
          <Feather name="play-circle" size={15} color={TB_COLOR} />
          <Text style={[styles.sectionTitle, { color: TB_COLOR }]}>Testar Vídeo</Text>
        </View>
        <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 10 }}>Cole um link do TeraBox ou uma URL direta de vídeo para testar a reprodução.</Text>
        <TextInput
          style={[styles.input, loading && { opacity: 0.5 }]}
          placeholder="https://1024terabox.com/s/... ou URL direta"
          placeholderTextColor="rgba(255,255,255,0.25)"
          value={inputUrl}
          onChangeText={(v) => { setInputUrl(v); setResolved(null); setFiles([]); setError(null); }}
          autoCapitalize="none" autoCorrect={false} editable={!loading} multiline
        />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Pressable style={[styles.actionBtn, { flex: 1, backgroundColor: TB_COLOR }, loading && { opacity: 0.5 }]} onPress={resolveTerabox} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="search" size={16} color="#fff" />}
            <Text style={styles.actionBtnText}>{loading ? "Resolvendo…" : "Resolver TeraBox"}</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, { paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.08)" }]} onPress={testDirect}>
            <Feather name="play" size={16} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>
        {error && <View style={styles.errorBox}><Feather name="alert-circle" size={14} color="#f87171" /><Text style={styles.errorBoxText}>{error}</Text></View>}
      </View>

      {files.length > 1 && (
        <View style={[styles.sectionCard, { marginTop: 12, borderColor: "rgba(245,158,11,0.15)" }]}>
          <View style={styles.sectionTitleRow}>
            <Feather name="list" size={14} color={TB_COLOR} />
            <Text style={[styles.sectionTitle, { color: TB_COLOR }]}>Selecionar arquivo</Text>
          </View>
          {files.map((f, i) => {
            const qColor = qualityColors[f.quality] ?? "rgba(255,255,255,0.4)";
            return (
              <Pressable key={i} onPress={() => selectFile(i)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" }}>
                <Feather name={selectedIdx === i ? "check-circle" : "circle"} size={18} color={selectedIdx === i ? TB_COLOR : "rgba(255,255,255,0.25)"} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }} numberOfLines={1}>{f.name}</Text>
                  <TBFileChip f={f} qColor={qColor} />
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {resolved && (
        <View style={[styles.sectionCard, { marginTop: 12, borderColor: "rgba(74,222,128,0.2)" }]}>
          <View style={styles.sectionTitleRow}>
            <Feather name="check-circle" size={15} color="#4ade80" />
            <Text style={[styles.sectionTitle, { color: "#4ade80" }]}>URL Resolvida</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {resolved.quality && <View style={{ backgroundColor: `${qualityColors[resolved.quality] ?? "rgba(255,255,255,0.1)"}20`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: `${qualityColors[resolved.quality] ?? "rgba(255,255,255,0.1)"}50` }}><Text style={{ color: qualityColors[resolved.quality] ?? "#fff", fontSize: 11, fontWeight: "700" }}>{resolved.quality}</Text></View>}
            {resolved.duration && <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>⏱ {resolved.duration}</Text>}
            {resolved.size && <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>💾 {resolved.size}</Text>}
          </View>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 4 }} numberOfLines={1}>{resolved.name}</Text>
          <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, marginBottom: 14 }} numberOfLines={2}>{resolved.url}</Text>

          <View style={{ borderRadius: 10, overflow: "hidden", backgroundColor: "#000", height: 200, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            {Platform.OS === "web" ? (
              <video
                src={resolved.url}
                controls
                autoPlay={false}
                style={{ width: "100%", height: "100%", objectFit: "contain" } as any}
              />
            ) : (
              <View style={{ alignItems: "center", gap: 10 }}>
                <Feather name="play-circle" size={40} color={TB_COLOR} />
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>URL pronta para reprodução</Text>
                <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>Abra no player do app</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function TeraBoxPanel() {
  const [subTab, setSubTab] = useState<"register" | "upload" | "test">("register");

  const subTabs = [
    { id: "register" as const, label: "Registrar", icon: "bookmark" as const },
    { id: "upload" as const, label: "Upload R2", icon: "upload-cloud" as const },
    { id: "test" as const, label: "Testar", icon: "play-circle" as const },
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)", alignItems: "center" }}>
        <Feather name="zap" size={12} color={TB_COLOR} />
        <Text style={{ color: TB_COLOR, fontWeight: "700", fontSize: 11, flex: 1 }}>TeraBox API Pro</Text>
        {subTabs.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setSubTab(t.id)}
            style={{
              flexDirection: "row", alignItems: "center", gap: 4,
              paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
              backgroundColor: subTab === t.id ? `${TB_COLOR}22` : "rgba(255,255,255,0.06)",
              borderWidth: 1, borderColor: subTab === t.id ? `${TB_COLOR}55` : "rgba(255,255,255,0.08)",
            }}
          >
            <Feather name={t.icon} size={12} color={subTab === t.id ? TB_COLOR : "rgba(255,255,255,0.4)"} />
            <Text style={{ color: subTab === t.id ? TB_COLOR : "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: subTab === t.id ? "700" : "400" }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {subTab === "register" && <TeraBoxRegisterTab />}
      {subTab === "upload" && <TeraBoxUploadTab />}
      {subTab === "test" && <TeraBoxTestTab />}
    </View>
  );
}

// ── Drive Register Modal (registra um arquivo do Drive no registry) ────────────

// ── FolderBulkModal — registrar pasta inteira com intensificação ──────────────

type FolderBulkTarget = { drive: 0 | 1; path: string; name: string };
type BulkScanItem = { filePath: string; fileName: string; size?: string; season?: number; episode?: number };

function FolderBulkModal({ target, onClose, onDone }: {
  target: FolderBulkTarget;
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  const [contentType, setContentType] = useState<"movie" | "series" | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanItems, setScanItems] = useState<BulkScanItem[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  // Selection state: paths of selected items
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  // Registration mode: "bulk" = one TMDB for all, "unit" = each file its own TMDB
  const [regMode, setRegMode] = useState<"bulk" | "unit">("bulk");

  // Procura o título nas pastas pai (do mais interno para o mais externo)
  // Ex: "Filmes/A Era do Gelo 2 (2006)/Dublado - 1080p" → "A Era do Gelo 2"
  const bestFolderTitle = (() => {
    const segments = target.path.split("/").filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const { title } = extractTitleAndYear(segments[i]);
      if (title && title.length > 2) return title;
    }
    return target.name;
  })();
  const [q, setQ] = useState(bestFolderTitle);
  const [searching, setSearching] = useState(false);
  const [tmdbResults, setTmdbResults] = useState<TmdbSearchResult[]>([]);
  const [selectedTmdb, setSelectedTmdb] = useState<TmdbSearchResult | null>(null);
  const [tmdbIdInputBulk, setTmdbIdInputBulk] = useState("");
  const [searchingByIdBulk, setSearchingByIdBulk] = useState(false);
  const [label, setLabel] = useState("Dublado 1080p");

  // Per-unit TMDB links: filePath → TmdbSearchResult
  const [unitLinks, setUnitLinks] = useState<Map<string, TmdbSearchResult>>(new Map());
  const [unitSearchPath, setUnitSearchPath] = useState<string | null>(null);
  const [unitQ, setUnitQ] = useState("");
  const [unitSearching, setUnitSearching] = useState(false);
  const [unitResults, setUnitResults] = useState<TmdbSearchResult[]>([]);

  const [registering, setRegistering] = useState(false);
  const [regProgress, setRegProgress] = useState(0);
  const [regDone, setRegDone] = useState<number | null>(null);

  const scan = async (type: "movie" | "series") => {
    setContentType(type);
    setScanning(true);
    setScanItems([]);
    setScanError(null);
    setSelectedTmdb(null);
    setTmdbResults([]);
    setRegDone(null);
    setUnitLinks(new Map());
    setUnitSearchPath(null);
    setRegMode("bulk");
    try {
      const data = await apiPost<{ items: BulkScanItem[] }>("/drive/scan-folder", {
        drive: target.drive,
        path: target.path,
        type,
      });
      setScanItems(data.items);
      setSelectedPaths(new Set(data.items.map((i) => i.filePath)));
    } catch (e: any) {
      setScanError(e.message ?? "Erro ao escanear pasta");
    } finally {
      setScanning(false);
    }
  };

  const toggleItem = (filePath: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath); else next.add(filePath);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedPaths.size === scanItems.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(scanItems.map((i) => i.filePath)));
    }
  };

  const searchTmdb = async () => {
    if (!q.trim()) return;
    setSearching(true);
    setTmdbResults([]);
    try {
      const mediaType = contentType === "series" ? "tv" : "movie";
      const { title: cleanQ } = extractTitleAndYear(q);
      const searchQ = cleanQ || q;
      const data = await apiFetch<{ results: TmdbSearchResult[] }>(
        `/tmdb-search?q=${encodeURIComponent(searchQ)}&type=${mediaType}`
      );
      setTmdbResults(data.results);
    } catch (e: any) {
      setScanError(e.message);
    } finally {
      setSearching(false);
    }
  };

  const searchTmdbByIdBulk = async () => {
    const id = parseInt(tmdbIdInputBulk.trim(), 10);
    if (!id) return;
    setSearchingByIdBulk(true);
    try {
      const result = await fetchTmdbById(id);
      if (result) {
        setSelectedTmdb(result);
        setTmdbResults([]);
        setTmdbIdInputBulk("");
      } else {
        setScanError(`ID ${id} não encontrado no TMDB`);
      }
    } catch (e: any) { setScanError(e.message ?? "Erro"); }
    finally { setSearchingByIdBulk(false); }
  };

  const searchUnitTmdb = async (_filePath: string, qText: string) => {
    if (!qText.trim()) return;
    setUnitSearching(true);
    setUnitResults([]);
    try {
      const { title: cleanQ } = extractTitleAndYear(qText);
      const searchQ = cleanQ || qText;
      const data = await apiFetch<{ results: TmdbSearchResult[] }>(
        `/tmdb-search?q=${encodeURIComponent(searchQ)}&type=movie`
      );
      setUnitResults(data.results);
    } catch {
    } finally {
      setUnitSearching(false);
    }
  };

  const registerAll = async () => {
    const itemsToRegister = scanItems.filter((i) => selectedPaths.has(i.filePath));
    if (itemsToRegister.length === 0) return;

    if (regMode === "bulk" && !selectedTmdb) return;
    if (regMode === "unit" && unitLinks.size === 0) return;

    setRegistering(true);
    setRegProgress(0);
    setRegDone(null);
    let done = 0;
    let errors = 0;

    for (const item of itemsToRegister) {
      const tmdb = regMode === "unit" ? (unitLinks.get(item.filePath) ?? null) : selectedTmdb;
      if (!tmdb) { errors++; setRegProgress(Math.round(((done + errors) / itemsToRegister.length) * 100)); continue; }
      try {
        await apiPost("/drive/register", {
          driveFilePath: item.filePath,
          driveNum: target.drive,
          tmdbId: tmdb.id,
          tmdbType: tmdb.media_type,
          title: tmdb.title,
          label,
          season: item.season ?? null,
          episode: item.episode ?? null,
        });
        done++;
      } catch { errors++; }
      setRegProgress(Math.round(((done + errors) / itemsToRegister.length) * 100));
    }
    setRegistering(false);
    setRegDone(done);
    if (done > 0) onDone(done);
  };

  const bySeason = useMemo(() => {
    if (contentType !== "series" || scanItems.length === 0) return null;
    const map = new Map<number, BulkScanItem[]>();
    for (const item of scanItems) {
      const s = item.season ?? 1;
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(item);
    }
    return map;
  }, [scanItems, contentType]);

  const GREEN = "#22c55e";
  const RED_CONTENT = "#e50914";
  const selectedCount = scanItems.filter((i) => selectedPaths.has(i.filePath)).length;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.88)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#070f07", borderTopLeftRadius: 22, borderTopRightRadius: 22,
            borderWidth: 1, borderColor: "rgba(34,197,94,0.25)", maxHeight: "92%", padding: 18 }}>

            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
              <Feather name="folder" size={17} color={GREEN} />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15, marginLeft: 8, flex: 1 }}>Registrar pasta</Text>
              <Pressable onPress={onClose}>
                <Feather name="x" size={20} color="rgba(255,255,255,0.5)" />
              </Pressable>
            </View>
            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginBottom: 16 }} numberOfLines={2}>
              📂 {target.path}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* ── Step 1: tipo de conteúdo ── */}
              {!contentType && !scanning && (
                <View>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 14, textAlign: "center" }}>
                    Qual o tipo de conteúdo desta pasta?
                  </Text>
                  <View style={{ flexDirection: "row", gap: 12, marginBottom: 10 }}>
                    <Pressable onPress={() => scan("movie")}
                      style={{ flex: 1, alignItems: "center", paddingVertical: 20, borderRadius: 14,
                        backgroundColor: "rgba(229,9,20,0.09)", borderWidth: 1, borderColor: "rgba(229,9,20,0.35)", gap: 10 }}>
                      <Feather name="film" size={30} color={RED_CONTENT} />
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>🎬 Filmes</Text>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textAlign: "center", paddingHorizontal: 8 }}>
                        Cada vídeo é um filme individual
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => scan("series")}
                      style={{ flex: 1, alignItems: "center", paddingVertical: 20, borderRadius: 14,
                        backgroundColor: "rgba(34,197,94,0.08)", borderWidth: 1, borderColor: "rgba(34,197,94,0.3)", gap: 10 }}>
                      <Feather name="tv" size={30} color={GREEN} />
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>📺 Séries</Text>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textAlign: "center", paddingHorizontal: 8 }}>
                        Detecta temporadas e episódios
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* ── Scanning ── */}
              {scanning && (
                <View style={{ alignItems: "center", paddingVertical: 44, gap: 14 }}>
                  <ActivityIndicator size="large" color={GREEN} />
                  <Text style={{ color: GREEN, fontWeight: "700", fontSize: 15 }}>Escaneando pasta…</Text>
                  <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, textAlign: "center" }}>
                    {contentType === "series"
                      ? "Detectando temporadas e episódios automaticamente"
                      : "Listando arquivos de vídeo"}
                  </Text>
                </View>
              )}

              {/* ── Erro ── */}
              {!scanning && scanError && (
                <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 12, borderRadius: 10,
                  backgroundColor: "rgba(248,113,113,0.1)", borderWidth: 1, borderColor: "rgba(248,113,113,0.3)", marginBottom: 12 }}>
                  <Feather name="alert-circle" size={14} color="#f87171" style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#fca5a5", fontSize: 12 }}>{scanError}</Text>
                    <Pressable onPress={() => { setContentType(null); setScanError(null); }} style={{ marginTop: 8 }}>
                      <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>↩ Tentar novamente</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* ── Pasta vazia ── */}
              {!scanning && contentType && scanItems.length === 0 && !scanError && (
                <View style={{ alignItems: "center", paddingVertical: 34, gap: 12 }}>
                  <Feather name="inbox" size={36} color="rgba(255,255,255,0.1)" />
                  <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Nenhum vídeo encontrado nesta pasta</Text>
                  <Pressable onPress={() => { setContentType(null); setScanItems([]); }}
                    style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.07)" }}>
                    <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Tentar outro tipo</Text>
                  </Pressable>
                </View>
              )}

              {/* ── Resultados + registro ── */}
              {!scanning && contentType && scanItems.length > 0 && regDone === null && (
                <>
                  {/* Badge de tipo + botão alterar + seleção */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5,
                      borderRadius: 20, borderWidth: 1,
                      backgroundColor: contentType === "series" ? "rgba(34,197,94,0.1)" : "rgba(229,9,20,0.1)",
                      borderColor: contentType === "series" ? "rgba(34,197,94,0.35)" : "rgba(229,9,20,0.35)" }}>
                      <Feather name={contentType === "series" ? "tv" : "film"} size={12}
                        color={contentType === "series" ? GREEN : RED_CONTENT} />
                      <Text style={{ color: contentType === "series" ? GREEN : RED_CONTENT, fontSize: 12, fontWeight: "700" }}>
                        {selectedCount}/{scanItems.length} selecionado{scanItems.length !== 1 ? "s" : ""}
                      </Text>
                    </View>
                    <Pressable onPress={toggleAll}
                      style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.07)" }}>
                      <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
                        {selectedCount === scanItems.length ? "Desmarcar todos" : "Marcar todos"}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => { setContentType(null); setScanItems([]); setSelectedTmdb(null); setUnitLinks(new Map()); }}
                      style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.05)" }}>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>↩ Alterar</Text>
                    </Pressable>
                  </View>

                  {/* ── Modo de Registro (apenas para filmes) ── */}
                  {contentType === "movie" && (
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                      <Pressable onPress={() => { setRegMode("bulk"); setUnitLinks(new Map()); setUnitSearchPath(null); }}
                        style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, gap: 4,
                          backgroundColor: regMode === "bulk" ? "rgba(229,9,20,0.15)" : "rgba(255,255,255,0.04)",
                          borderWidth: 1, borderColor: regMode === "bulk" ? "rgba(229,9,20,0.5)" : "rgba(255,255,255,0.08)" }}>
                        <Feather name="layers" size={16} color={regMode === "bulk" ? RED_CONTENT : "rgba(255,255,255,0.4)"} />
                        <Text style={{ color: regMode === "bulk" ? "#fff" : "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: "700" }}>
                          Todos juntos
                        </Text>
                        <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, textAlign: "center" }}>
                          Um TMDB para todos
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => { setRegMode("unit"); setSelectedTmdb(null); setTmdbResults([]); }}
                        style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, gap: 4,
                          backgroundColor: regMode === "unit" ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.04)",
                          borderWidth: 1, borderColor: regMode === "unit" ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.08)" }}>
                        <Feather name="target" size={16} color={regMode === "unit" ? "#8b5cf6" : "rgba(255,255,255,0.4)"} />
                        <Text style={{ color: regMode === "unit" ? "#fff" : "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: "700" }}>
                          Por Unidade
                        </Text>
                        <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, textAlign: "center" }}>
                          TMDB individual por arquivo
                        </Text>
                      </Pressable>
                    </View>
                  )}

                  {/* Preview — séries por temporada com checkboxes */}
                  {contentType === "series" && bySeason && (
                    <View style={{ marginBottom: 16, borderRadius: 10, borderWidth: 1, borderColor: "rgba(34,197,94,0.15)", overflow: "hidden" }}>
                      {Array.from(bySeason.entries()).map(([season, eps]) => (
                        <View key={season}>
                          <View style={{ backgroundColor: "rgba(34,197,94,0.09)", paddingHorizontal: 12, paddingVertical: 7,
                            flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Feather name="layers" size={13} color={GREEN} />
                            <Text style={{ color: GREEN, fontWeight: "700", fontSize: 12 }}>
                              Temporada {season} — {eps.length} episódio{eps.length !== 1 ? "s" : ""}
                            </Text>
                          </View>
                          {eps.slice(0, 3).map((ep, i) => (
                            <Pressable key={i} onPress={() => toggleItem(ep.filePath)}
                              style={{ paddingHorizontal: 12, paddingVertical: 7,
                              borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)",
                              flexDirection: "row", alignItems: "center", gap: 8,
                              backgroundColor: selectedPaths.has(ep.filePath) ? "rgba(34,197,94,0.04)" : "transparent" }}>
                              <Feather name={selectedPaths.has(ep.filePath) ? "check-square" : "square"} size={14}
                                color={selectedPaths.has(ep.filePath) ? GREEN : "rgba(255,255,255,0.25)"} />
                              <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, width: 36 }}>
                                {ep.episode != null ? `E${String(ep.episode).padStart(2, "0")}` : `#${i + 1}`}
                              </Text>
                              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, flex: 1 }} numberOfLines={1}>
                                {ep.fileName}
                              </Text>
                              {ep.size && (
                                <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{ep.size}</Text>
                              )}
                            </Pressable>
                          ))}
                          {eps.length > 3 && (
                            <View style={{ paddingHorizontal: 12, paddingVertical: 6,
                              borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" }}>
                              <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>+ {eps.length - 3} episódios…</Text>
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Preview — filmes lista plana com checkboxes (bulk) */}
                  {contentType === "movie" && regMode === "bulk" && (
                    <View style={{ marginBottom: 16, borderRadius: 10, borderWidth: 1, borderColor: "rgba(229,9,20,0.15)", overflow: "hidden" }}>
                      {scanItems.slice(0, 6).map((item, i) => (
                        <Pressable key={i} onPress={() => toggleItem(item.filePath)}
                          style={{ paddingHorizontal: 12, paddingVertical: 9,
                            borderTopWidth: i > 0 ? 1 : 0, borderTopColor: "rgba(255,255,255,0.05)",
                            flexDirection: "row", alignItems: "center", gap: 8,
                            backgroundColor: selectedPaths.has(item.filePath) ? "rgba(229,9,20,0.06)" : "transparent" }}>
                          <Feather name={selectedPaths.has(item.filePath) ? "check-square" : "square"} size={14}
                            color={selectedPaths.has(item.filePath) ? RED_CONTENT : "rgba(255,255,255,0.25)"} />
                          <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, flex: 1 }} numberOfLines={1}>
                            {item.fileName}
                          </Text>
                          {item.size && <Text style={{ color: "rgba(255,255,255,0.28)", fontSize: 10 }}>{item.size}</Text>}
                        </Pressable>
                      ))}
                      {scanItems.length > 6 && (
                        <View style={{ paddingHorizontal: 12, paddingVertical: 6,
                          borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" }}>
                          <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>+ {scanItems.length - 6} arquivos…</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Preview — Por Unidade: cada arquivo com TMDB individual */}
                  {contentType === "movie" && regMode === "unit" && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginBottom: 10, textAlign: "center" }}>
                        Toque em um arquivo para vinculá-lo individualmente ao TMDB
                      </Text>
                      {scanItems.map((item, i) => {
                        const linked = unitLinks.get(item.filePath);
                        const isSearching = unitSearchPath === item.filePath;
                        return (
                          <View key={i} style={{ marginBottom: 8, borderRadius: 10, borderWidth: 1,
                            borderColor: linked ? "rgba(139,92,246,0.35)" : selectedPaths.has(item.filePath) ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
                            backgroundColor: linked ? "rgba(139,92,246,0.06)" : "rgba(255,255,255,0.02)", overflow: "hidden" }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10 }}>
                              <Pressable onPress={() => toggleItem(item.filePath)}>
                                <Feather name={selectedPaths.has(item.filePath) ? "check-square" : "square"} size={14}
                                  color={selectedPaths.has(item.filePath) ? "#8b5cf6" : "rgba(255,255,255,0.25)"} />
                              </Pressable>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }} numberOfLines={1}>
                                  {item.fileName}
                                </Text>
                                {linked && (
                                  <Text style={{ color: "#a78bfa", fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                                    🎬 {linked.title}
                                  </Text>
                                )}
                              </View>
                              <Pressable
                                onPress={() => {
                                  if (isSearching) { setUnitSearchPath(null); setUnitResults([]); }
                                  else { const { title: autoQ } = extractTitleAndYear(item.fileName); setUnitSearchPath(item.filePath); setUnitQ(autoQ || item.fileName.replace(/\.[^.]+$/, "").replace(/[._-]/g, " ")); setUnitResults([]); }
                                }}
                                style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6,
                                  backgroundColor: linked ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.07)" }}>
                                <Text style={{ color: linked ? "#a78bfa" : "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "700" }}>
                                  {linked ? "✏️ Alterar" : "🔍 Vincular"}
                                </Text>
                              </Pressable>
                              {linked && (
                                <Pressable onPress={() => { setUnitLinks((m) => { const n = new Map(m); n.delete(item.filePath); return n; }); }}>
                                  <Feather name="x" size={13} color="rgba(255,255,255,0.3)" />
                                </Pressable>
                              )}
                            </View>
                            {isSearching && (
                              <View style={{ padding: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)" }}>
                                <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
                                  <TextInput
                                    style={{ flex: 1, backgroundColor: "#111", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
                                      borderRadius: 6, padding: 7, color: "#fff", fontSize: 12 }}
                                    value={unitQ}
                                    onChangeText={setUnitQ}
                                    placeholder="Buscar no TMDB…"
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                    autoFocus
                                    onSubmitEditing={() => searchUnitTmdb(item.filePath, unitQ)}
                                    returnKeyType="search"
                                  />
                                  <Pressable onPress={() => searchUnitTmdb(item.filePath, unitQ)} disabled={unitSearching}
                                    style={{ paddingHorizontal: 10, borderRadius: 6, backgroundColor: "#374151",
                                      alignItems: "center", justifyContent: "center" }}>
                                    {unitSearching
                                      ? <ActivityIndicator size="small" color="#fff" />
                                      : <Feather name="search" size={13} color="#fff" />}
                                  </Pressable>
                                </View>
                                {unitResults.map((r) => (
                                  <Pressable key={r.id}
                                    onPress={() => {
                                      setUnitLinks((m) => new Map(m).set(item.filePath, r));
                                      setSelectedPaths((prev) => { const n = new Set(prev); n.add(item.filePath); return n; });
                                      setUnitSearchPath(null);
                                      setUnitResults([]);
                                    }}
                                    style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 7, marginBottom: 3, borderRadius: 6,
                                      backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
                                    {r.poster_path
                                      ? <Image source={{ uri: `https://image.tmdb.org/t/p/w92${r.poster_path}` }} style={{ width: 22, height: 32, borderRadius: 3 }} />
                                      : <View style={{ width: 22, height: 32, borderRadius: 3, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }}>
                                          <Feather name="film" size={10} color="rgba(255,255,255,0.3)" />
                                        </View>}
                                    <Text style={{ color: "#fff", fontSize: 11, flex: 1 }} numberOfLines={1}>{r.title}</Text>
                                    <Feather name="chevron-right" size={12} color="rgba(255,255,255,0.3)" />
                                  </Pressable>
                                ))}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* TMDB search — apenas no modo bulk */}
                  {regMode === "bulk" && (
                    <>
                      <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: "700",
                        textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                        Vincular ao TMDB
                      </Text>

                      {!selectedTmdb ? (
                        <>
                          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                            <TextInput
                              style={{ flex: 1, backgroundColor: "#111", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
                                borderRadius: 8, padding: 10, color: "#fff", fontSize: 13 }}
                              value={q}
                              onChangeText={setQ}
                              placeholder={contentType === "series" ? "Nome da série…" : "Nome do filme ou coleção…"}
                              placeholderTextColor="rgba(255,255,255,0.3)"
                              onSubmitEditing={searchTmdb}
                              returnKeyType="search"
                            />
                            <Pressable onPress={searchTmdb} disabled={searching}
                              style={{ paddingHorizontal: 14, borderRadius: 8, backgroundColor: "#374151",
                                alignItems: "center", justifyContent: "center" }}>
                              {searching
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Feather name="search" size={15} color="#fff" />}
                            </Pressable>
                          </View>
                          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8, alignItems: "center" }}>
                            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
                              backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 8, borderWidth: 1,
                              borderColor: "rgba(255,255,255,0.1)", paddingLeft: 10, paddingRight: 4 }}>
                              <Feather name="hash" size={13} color="rgba(255,255,255,0.35)" />
                              <TextInput
                                style={{ flex: 1, color: "#fff", fontSize: 13, paddingVertical: 9 }}
                                placeholder="ID do TMDB (ex: 1396)"
                                placeholderTextColor="rgba(255,255,255,0.25)"
                                keyboardType="number-pad"
                                value={tmdbIdInputBulk}
                                onChangeText={setTmdbIdInputBulk}
                                onSubmitEditing={searchTmdbByIdBulk}
                                returnKeyType="search"
                              />
                            </View>
                            <Pressable onPress={searchTmdbByIdBulk} disabled={searchingByIdBulk}
                              style={{ paddingHorizontal: 14, borderRadius: 8, backgroundColor: "rgba(229,9,20,0.18)",
                                borderWidth: 1, borderColor: "rgba(229,9,20,0.35)", alignItems: "center", justifyContent: "center",
                                height: 42, opacity: searchingByIdBulk ? 0.5 : 1 }}>
                              {searchingByIdBulk
                                ? <ActivityIndicator size="small" color={RED} />
                                : <Feather name="crosshair" size={15} color={RED} />}
                            </Pressable>
                          </View>

                          {tmdbResults.map((r) => (
                            <Pressable key={r.id}
                              onPress={() => { setSelectedTmdb(r); setTmdbResults([]); }}
                              style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, marginBottom: 4, borderRadius: 8,
                                backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
                              {r.poster_path ? (
                                <Image source={{ uri: `https://image.tmdb.org/t/p/w92${r.poster_path}` }}
                                  style={{ width: 30, height: 44, borderRadius: 4 }} />
                              ) : (
                                <View style={{ width: 30, height: 44, borderRadius: 4, backgroundColor: "#1a1a1a",
                                  alignItems: "center", justifyContent: "center" }}>
                                  <Feather name="film" size={12} color="rgba(255,255,255,0.3)" />
                                </View>
                              )}
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }} numberOfLines={1}>{r.title}</Text>
                                <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>
                                  {r.media_type === "tv" ? "📺 Série" : "🎬 Filme"}
                                </Text>
                              </View>
                              <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.3)" />
                            </Pressable>
                          ))}
                        </>
                      ) : (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginBottom: 14, borderRadius: 10,
                          backgroundColor: "rgba(34,197,94,0.08)", borderWidth: 1, borderColor: "rgba(34,197,94,0.25)" }}>
                          {selectedTmdb.poster_path && (
                            <Image source={{ uri: `https://image.tmdb.org/t/p/w92${selectedTmdb.poster_path}` }}
                              style={{ width: 34, height: 50, borderRadius: 5 }} />
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: "#4ade80", fontSize: 13, fontWeight: "700" }} numberOfLines={1}>
                              {selectedTmdb.title}
                            </Text>
                            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
                              {selectedTmdb.media_type === "tv" ? "📺 Série" : "🎬 Filme"}
                            </Text>
                          </View>
                          <Pressable onPress={() => setSelectedTmdb(null)}>
                            <Feather name="x" size={16} color="rgba(255,255,255,0.4)" />
                          </Pressable>
                        </View>
                      )}

                      {/* Label */}
                      {selectedTmdb && !registering && (
                        <View style={{ marginBottom: 14 }}>
                          <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: "700",
                            textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                            Qualidade / Label
                          </Text>
                          <TextInput
                            style={{ backgroundColor: "#111", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
                              borderRadius: 8, padding: 10, color: "#fff", fontSize: 13 }}
                            value={label}
                            onChangeText={setLabel}
                            placeholder="Dublado 1080p"
                            placeholderTextColor="rgba(255,255,255,0.3)"
                          />
                        </View>
                      )}
                    </>
                  )}

                  {/* Label (modo unit) */}
                  {regMode === "unit" && unitLinks.size > 0 && !registering && (
                    <View style={{ marginBottom: 14 }}>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: "700",
                        textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                        Qualidade / Label
                      </Text>
                      <TextInput
                        style={{ backgroundColor: "#111", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
                          borderRadius: 8, padding: 10, color: "#fff", fontSize: 13 }}
                        value={label}
                        onChangeText={setLabel}
                        placeholder="Dublado 1080p"
                        placeholderTextColor="rgba(255,255,255,0.3)"
                      />
                    </View>
                  )}

                  {/* Progress bar */}
                  {registering && (
                    <View style={{ marginBottom: 12 }}>
                      <View style={{ height: 5, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
                        <View style={{ height: 5, width: `${regProgress}%` as any, backgroundColor: GREEN, borderRadius: 3 }} />
                      </View>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 5, textAlign: "center" }}>
                        {regProgress}% — registrando arquivos…
                      </Text>
                    </View>
                  )}

                  {/* Register button */}
                  {(regMode === "bulk" ? selectedTmdb != null : unitLinks.size > 0) && (
                    <Pressable onPress={registerAll}
                      disabled={registering || selectedCount === 0}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
                        padding: 14, borderRadius: 12, marginBottom: 20,
                        backgroundColor: registering ? "rgba(34,197,94,0.15)" : regMode === "unit" ? "#6d28d9" : "#16a34a",
                        opacity: (registering || selectedCount === 0) ? 0.5 : 1 }}>
                      {registering
                        ? <><ActivityIndicator size="small" color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Registrando…</Text></>
                        : regMode === "unit"
                          ? <><Feather name="target" size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Registrar {unitLinks.size} vinculado{unitLinks.size !== 1 ? "s" : ""}</Text></>
                          : <><Feather name="cloud" size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Registrar {selectedCount} arquivo{selectedCount !== 1 ? "s" : ""}</Text></>
                      }
                    </Pressable>
                  )}
                </>
              )}

              {/* ── Concluído ── */}
              {regDone !== null && (
                <View style={{ alignItems: "center", paddingVertical: 32, gap: 14 }}>
                  <Feather name="check-circle" size={48} color={GREEN} />
                  <Text style={{ color: GREEN, fontWeight: "700", fontSize: 20 }}>Concluído!</Text>
                  <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, textAlign: "center", lineHeight: 20 }}>
                    {regDone} arquivo{regDone !== 1 ? "s" : ""} registrado{regDone !== 1 ? "s" : ""} com sucesso no Drive Registry
                  </Text>
                  <Pressable onPress={onClose}
                    style={{ paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12, backgroundColor: "#16a34a", marginTop: 4 }}>
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Fechar</Text>
                  </Pressable>
                </View>
              )}

            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function DriveRegisterModal({ item, driveNum, driveFilePath, onClose, onDone }: {
  item: DriveItem; driveNum?: number; driveFilePath?: string; onClose: () => void; onDone: () => void;
}) {
  const parsed = parseEpisodeInfo(item.name);
  const { title: autoTitle } = extractTitleAndYear(item.name);
  const [q, setQ] = useState(autoTitle || parsed.seriesTitle || item.name.replace(/\.[^.]+$/, "").replace(/[._]/g, " ").trim());
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TmdbSearchResult[]>([]);
  const [selected, setSelected] = useState<TmdbSearchResult | null>(null);
  const [label, setLabel] = useState("Dublado 1080p");
  const [season, setSeason] = useState(parsed.season != null ? String(parsed.season) : "");
  const [ep, setEp] = useState(parsed.episode != null ? String(parsed.episode) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tmdbIdInputDrive, setTmdbIdInputDrive] = useState("");
  const [searchingByIdDrive, setSearchingByIdDrive] = useState(false);

  const search = async () => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const { title: cleanQ } = extractTitleAndYear(q);
      const searchQ = cleanQ || q;
      const data = await apiFetch<{ results: TmdbSearchResult[] }>(`/tmdb-search?q=${encodeURIComponent(searchQ)}&type=multi`);
      setResults(data.results);
    } catch (e: any) { setError(e.message); }
    finally { setSearching(false); }
  };

  const searchByIdDrive = async () => {
    const id = parseInt(tmdbIdInputDrive.trim(), 10);
    if (!id) { setError("Digite um ID numérico válido"); return; }
    setSearchingByIdDrive(true);
    setError(null);
    try {
      const result = await fetchTmdbById(id);
      if (result) {
        setSelected(result);
        setResults([]);
        setTmdbIdInputDrive("");
      } else {
        setError(`ID ${id} não encontrado no TMDB`);
      }
    } catch (e: any) { setError(e.message ?? "Erro"); }
    finally { setSearchingByIdDrive(false); }
  };

  const save = async () => {
    if (!selected) { setError("Selecione um título"); return; }
    setSaving(true); setError(null);
    try {
      await apiPost("/drive/register", {
        driveUrl: `https://drive.google.com/file/d/${item.id}/view`,
        tmdbId: selected.id,
        tmdbType: selected.media_type,
        title: selected.title,
        label,
        season: season ? parseInt(season, 10) : null,
        episode: ep ? parseInt(ep, 10) : null,
        driveNum: driveNum,
        driveFilePath: driveFilePath,
      });
      onDone();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#0f0f0f", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "90%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
              <Feather name="cloud" size={17} color="#22c55e" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15, marginLeft: 8, flex: 1 }}>Registrar no Drive</Text>
              <Pressable onPress={onClose}><Feather name="x" size={20} color="rgba(255,255,255,0.5)" /></Pressable>
            </View>
            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginBottom: 14 }} numberOfLines={2}>📁 {item.name}</Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Buscar título no TMDB</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <TextInput style={[styles.input, { flex: 1 }]} value={q} onChangeText={setQ}
                placeholder="Nome do filme ou série…" placeholderTextColor="rgba(255,255,255,0.3)"
                onSubmitEditing={search} returnKeyType="search" />
              <Pressable onPress={search} disabled={searching}
                style={{ paddingHorizontal: 14, borderRadius: 8, backgroundColor: "#374151", alignItems: "center", justifyContent: "center" }}>
                {searching ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="search" size={15} color="#fff" />}
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
                backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 8, borderWidth: 1,
                borderColor: "rgba(255,255,255,0.1)", paddingLeft: 10, paddingRight: 4 }}>
                <Feather name="hash" size={13} color="rgba(255,255,255,0.35)" />
                <TextInput
                  style={{ flex: 1, color: "#fff", fontSize: 13, paddingVertical: 9 }}
                  placeholder="ID do TMDB (ex: 950)"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  keyboardType="number-pad"
                  value={tmdbIdInputDrive}
                  onChangeText={setTmdbIdInputDrive}
                  onSubmitEditing={searchByIdDrive}
                  returnKeyType="search"
                />
              </View>
              <Pressable onPress={searchByIdDrive} disabled={searchingByIdDrive}
                style={{ paddingHorizontal: 14, borderRadius: 8, backgroundColor: "rgba(229,9,20,0.18)",
                  borderWidth: 1, borderColor: "rgba(229,9,20,0.35)", alignItems: "center", justifyContent: "center",
                  height: 42, opacity: searchingByIdDrive ? 0.5 : 1 }}>
                {searchingByIdDrive
                  ? <ActivityIndicator size="small" color={RED} />
                  : <Feather name="crosshair" size={15} color={RED} />}
              </Pressable>
            </View>

            {results.map((r) => (
              <Pressable key={r.id} onPress={() => { setSelected(r); setResults([]); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, marginBottom: 4, borderRadius: 8,
                  backgroundColor: selected?.id === r.id ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)",
                  borderWidth: 1, borderColor: selected?.id === r.id ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.07)" }}>
                {r.poster_path ? (
                  <Image source={{ uri: `https://image.tmdb.org/t/p/w92${r.poster_path}` }} style={{ width: 32, height: 48, borderRadius: 4 }} />
                ) : (
                  <View style={{ width: 32, height: 48, borderRadius: 4, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }}>
                    <Feather name="film" size={14} color="rgba(255,255,255,0.3)" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }} numberOfLines={1}>{r.title}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{r.media_type === "tv" ? "Série" : "Filme"}</Text>
                </View>
                {selected?.id === r.id && <Feather name="check-circle" size={16} color="#22c55e" />}
              </Pressable>
            ))}

            {selected && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, marginBottom: 8, borderRadius: 8,
                backgroundColor: "rgba(34,197,94,0.08)", borderWidth: 1, borderColor: "rgba(34,197,94,0.2)" }}>
                <Feather name="check-circle" size={14} color="#4ade80" />
                <Text style={{ color: "#4ade80", fontSize: 12, flex: 1 }} numberOfLines={1}>{selected.title} ({selected.media_type === "tv" ? "Série" : "Filme"})</Text>
                <Pressable onPress={() => setSelected(null)}><Feather name="x" size={14} color="rgba(255,255,255,0.4)" /></Pressable>
              </View>
            )}

            {selected?.media_type === "tv" && (
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Temporada</Text>
                  <TextInput style={styles.input} value={season} onChangeText={setSeason}
                    placeholder="1" placeholderTextColor="rgba(255,255,255,0.3)" keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Episódio</Text>
                  <TextInput style={styles.input} value={ep} onChangeText={setEp}
                    placeholder="1" placeholderTextColor="rgba(255,255,255,0.3)" keyboardType="numeric" />
                </View>
              </View>
            )}

            <View style={{ marginBottom: 16 }}>
              <Text style={styles.fieldLabel}>Qualidade / Label</Text>
              <TextInput style={styles.input} value={label} onChangeText={setLabel}
                placeholder="Dublado 1080p" placeholderTextColor="rgba(255,255,255,0.3)" />
            </View>

            {error && (
              <View style={[styles.errorBox, { marginBottom: 12 }]}>
                <Feather name="alert-circle" size={13} color="#f87171" />
                <Text style={styles.errorBoxText}>{error}</Text>
              </View>
            )}

            <Pressable onPress={save} disabled={saving || !selected}
              style={[styles.actionBtn, { justifyContent: "center", marginBottom: 8,
                backgroundColor: saving || !selected ? "#1f2937" : "#16a34a",
                opacity: saving || !selected ? 0.6 : 1 }]}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="save" size={15} color="#fff" />}
              <Text style={styles.actionBtnText}>{saving ? "Salvando…" : "Salvar no Registry"}</Text>
            </Pressable>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Manage Panel ───────────────────────────────────────────────────────────────

interface SourceSettings {
  r2: boolean; drive: boolean; flix2: boolean; gstream: boolean; regular: boolean;
}
const DEFAULT_SRC_SETTINGS: SourceSettings = { r2: true, drive: true, flix2: true, gstream: true, regular: true };

function ManagePanel({ onRegister }: { onRegister: (key: string) => void }) {
  const insets = useSafeAreaInsets();
  const [path, setPath] = useState("");
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movingKey, setMovingKey] = useState<string | null>(null);
  const [movingName, setMovingName] = useState<string>("");
  const [showMovePicker, setShowMovePicker] = useState(false);

  // ── Global source settings ───────────────────────────────────────────────────
  const [srcSettings, setSrcSettings] = useState<SourceSettings>(DEFAULT_SRC_SETTINGS);
  const [srcSaving, setSrcSaving] = useState(false);
  const [srcSaved, setSrcSaved] = useState(false);

  useEffect(() => {
    apiFetch<SourceSettings>("/source-settings").then((data) => {
      setSrcSettings({ ...DEFAULT_SRC_SETTINGS, ...data });
    }).catch(() => {});
  }, []);

  const saveSrcSettings = async (next: SourceSettings) => {
    setSrcSaving(true);
    setSrcSaved(false);
    try {
      await apiPost("/source-settings", next);
      setSrcSaved(true);
      setTimeout(() => setSrcSaved(false), 2500);
    } catch {}
    finally { setSrcSaving(false); }
  };

  const toggleSrc = (key: keyof SourceSettings) => {
    const next = { ...srcSettings, [key]: !srcSettings[key] };
    setSrcSettings(next);
    saveSrcSettings(next);
  };

  const [driveJobId, setDriveJobId] = useState<string | null>(null);
  const [driveJobStatus, setDriveJobStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [driveJobProgress, setDriveJobProgress] = useState(0);
  const [driveJobMessage, setDriveJobMessage] = useState("");

  // ── Drive browser state (Acervo Drive → navegar pastas) ──
  type MgNavEntry = { drive: 0 | 1; path: string; name: string };
  const [mgDriveOpen, setMgDriveOpen] = useState(false);
  const [mgDriveNav, setMgDriveNav] = useState<MgNavEntry[]>([]);
  const [mgDriveItems, setMgDriveItems] = useState<DriveItem[]>([]);
  const [mgDriveLoading, setMgDriveLoading] = useState(false);
  const [mgDriveError, setMgDriveError] = useState<string | null>(null);
  const [mgDrivePageToken, setMgDrivePageToken] = useState<string | null>(null);
  const [mgDriveRegisterItem, setMgDriveRegisterItem] = useState<DriveItem | null>(null);
  const [mgDriveRegisterCtx, setMgDriveRegisterCtx] = useState<{ driveNum: number; filePath: string } | null>(null);
  const [folderBulkTarget, setFolderBulkTarget] = useState<FolderBulkTarget | null>(null);

  // ── Remap history ────────────────────────────────────────────────────────────
  interface RemapEntry { id: string; doneAt: string; fromIds: number[]; toId: number; toType: string; titles: string[]; updated: number }
  const [remapHistory, setRemapHistory] = useState<RemapEntry[]>([]);
  const [remapLoading, setRemapLoading] = useState(false);
  const [remapOpen, setRemapOpen] = useState(false);

  const loadRemapHistory = async () => {
    setRemapLoading(true);
    try {
      const data = await apiFetch<{ entries: RemapEntry[] }>("/registry/remap-history");
      setRemapHistory(data.entries ?? []);
    } catch {}
    finally { setRemapLoading(false); }
  };

  useEffect(() => { loadRemapHistory(); }, []);

  useEffect(() => {
    if (!driveJobId || driveJobStatus !== "running") return;
    const interval = setInterval(async () => {
      try {
        const data = await apiFetch<Job>(`/job/${driveJobId}`);
        setDriveJobProgress(data.progress);
        if (data.status === "done") {
          setDriveJobStatus("done");
          setDriveJobMessage(data.key ?? "Extração concluída!");
        } else if (data.status === "error") {
          setDriveJobStatus("error");
          setDriveJobMessage(data.error ?? "Erro na extração");
        } else {
          setDriveJobMessage(
            data.key ? `${data.key} (${data.downloaded}/${data.total})` : `${data.downloaded}/${data.total} processados`
          );
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [driveJobId, driveJobStatus]);

  const startDriveExtraction = async () => {
    try {
      setDriveJobStatus("running");
      setDriveJobProgress(0);
      setDriveJobMessage("Iniciando extração...");
      const data = await apiPost<{ jobId: string }>("/drive/extract-all", {});
      setDriveJobId(data.jobId);
    } catch (e: any) {
      setDriveJobStatus("error");
      setDriveJobMessage(e.message ?? "Erro ao iniciar");
    }
  };

  // ── Drive browser helpers ────────────────────────────────────────────────────

  const loadMgFolder = async (drive: 0 | 1, folderPath: string, pageToken = "") => {
    if (!pageToken) { setMgDriveLoading(true); setMgDriveItems([]); }
    setMgDriveError(null);
    try {
      const result = await listFolder(drive, folderPath, pageToken);
      if (!result) { setMgDriveError("Não foi possível carregar a pasta"); return; }
      if (pageToken) setMgDriveItems((prev) => [...prev, ...result.data.files]);
      else setMgDriveItems(result.data.files);
      setMgDrivePageToken(result.nextPageToken);
    } catch { setMgDriveError("Erro ao carregar pasta"); }
    finally { setMgDriveLoading(false); }
  };

  const mgNavPush = (drive: 0 | 1, folderPath: string, name: string) => {
    setMgDriveNav((prev) => [...prev, { drive, path: folderPath, name }]);
    loadMgFolder(drive, folderPath);
  };

  const mgNavPop = () => {
    if (mgDriveNav.length === 0) return;
    const next = mgDriveNav.slice(0, -1);
    setMgDriveNav(next);
    if (next.length > 0) { const e = next[next.length - 1]; loadMgFolder(e.drive, e.path); }
    else { setMgDriveItems([]); setMgDrivePageToken(null); }
  };

  const mgCurrent = mgDriveNav.length > 0 ? mgDriveNav[mgDriveNav.length - 1] : null;

  const load = useCallback(async (prefix: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ folders: FileItem[]; files: FileItem[] }>(
        `/list?prefix=${encodeURIComponent(prefix)}&delimiter=/&noFallback=true`
      );
      setItems([...data.folders, ...data.files]);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(""); }, []);

  const navigate = (folder: FileItem) => {
    const newPath = folder.key;
    setPath(newPath);
    load(newPath);
  };

  const goUp = () => {
    const parts = path.replace(/\/$/, "").split("/");
    parts.pop();
    const newPath = parts.length ? `${parts.join("/")}/` : "";
    setPath(newPath);
    load(newPath);
  };

  const deleteItem = (item: FileItem) => {
    Alert.alert("Deletar", `Deletar "${item.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Deletar", style: "destructive", onPress: async () => {
          try {
            await apiFetch(`/delete?key=${encodeURIComponent(item.key)}`, { method: "DELETE" });
            load(path);
          } catch (e: any) { setError(e.message); }
        },
      },
    ]);
  };

  const doMove = async (destFolder: string) => {
    if (!movingKey) return;
    const filename = movingKey.split("/").pop() ?? movingKey;
    const dst = destFolder
      ? `${destFolder.endsWith("/") ? destFolder : `${destFolder}/`}${filename}`
      : filename;
    try {
      await apiPost("/move", { src: movingKey, dst });
      setMovingKey(null);
      setMovingName("");
      load(path);
    } catch (e: any) { setError(e.message); }
  };

  const pathParts = path ? path.replace(/\/$/, "").split("/") : [];

  const SRC_ROWS: { key: keyof SourceSettings; label: string; color: string; icon: string; desc: string }[] = [
    { key: "r2",      label: "R2 Storage",   color: "#f97316", icon: "cloud",       desc: "Vídeos enviados diretamente para o bucket R2" },
    { key: "drive",   label: "Google Drive",  color: "#1a73e8", icon: "hard-drive",  desc: "Conteúdos via Google Drive" },
    { key: "flix2",   label: "Flix 2.0",      color: "#8b5cf6", icon: "zap",         desc: "Catálogo nixplay.lat (Flix 2.0)" },
    { key: "gstream", label: "GStream",       color: "#7c3aed", icon: "radio",       desc: "Stream embed via GStream" },
    { key: "regular", label: "Player Regular",color: "#e50914", icon: "play-circle", desc: "Player IPTV padrão do app" },
  ];

  const DRIVE_PANEL_H = Math.round(Dimensions.get("window").height * 0.58);

  return (
    <View style={{ flex: 1 }}>

      {/* ══════════ ROOT STATE (path === "") ══════════════════════════════════ */}
      {path === "" && (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 60 }}>

          {/* ── Fontes de vídeo (on/off global) ── */}
          <View style={{ marginHorizontal: 12, marginTop: 10, marginBottom: 2, borderRadius: 12, borderWidth: 1,
            borderColor: "rgba(229,9,20,0.25)", backgroundColor: "#0d0007", overflow: "hidden" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8,
              paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 }}>
              <Feather name="toggle-right" size={15} color="#e50914" />
              <Text style={{ color: "#e50914", fontWeight: "700", fontSize: 14, flex: 1 }}>
                Fontes de Vídeo
              </Text>
              {srcSaving && <ActivityIndicator size="small" color="#e50914" />}
              {srcSaved && !srcSaving && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Feather name="check-circle" size={13} color="#4ade80" />
                  <Text style={{ color: "#4ade80", fontSize: 11, fontWeight: "600" }}>Salvo</Text>
                </View>
              )}
            </View>
            <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, paddingHorizontal: 14, paddingBottom: 8 }}>
              Desativar uma fonte oculta os botões de play para TODOS os usuários imediatamente.
            </Text>
            {SRC_ROWS.map(({ key, label, color, icon, desc }) => (
              <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 10,
                paddingHorizontal: 14, paddingVertical: 10,
                borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" }}>
                <View style={{ width: 30, height: 30, borderRadius: 8,
                  backgroundColor: srcSettings[key] ? `${color}22` : "rgba(255,255,255,0.04)",
                  alignItems: "center", justifyContent: "center" }}>
                  <Feather name={icon as any} size={14} color={srcSettings[key] ? color : "rgba(255,255,255,0.25)"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: srcSettings[key] ? "#fff" : "rgba(255,255,255,0.4)",
                    fontWeight: "600", fontSize: 13 }}>{label}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 1 }} numberOfLines={1}>
                    {desc}
                  </Text>
                </View>
                <Switch
                  value={srcSettings[key]}
                  onValueChange={() => toggleSrc(key)}
                  trackColor={{ false: "rgba(255,255,255,0.1)", true: `${color}66` }}
                  thumbColor={srcSettings[key] ? color : "rgba(255,255,255,0.4)"}
                  ios_backgroundColor="rgba(255,255,255,0.1)"
                />
              </View>
            ))}
            <View style={{ height: 8 }} />
          </View>

          {/* ── Acervo Drive: extração em background ── */}
          <View style={{ marginHorizontal: 12, marginTop: 10, marginBottom: 2, borderRadius: 12, borderWidth: 1,
            borderColor: driveJobStatus === "done" ? "#16a34a55" : driveJobStatus === "error" ? "#f8717155" : "#22c55e25",
            backgroundColor: "#061409", overflow: "hidden" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }}>
              <Feather name="cloud" size={15} color="#22c55e" />
              <Text style={{ color: "#22c55e", fontWeight: "700", fontSize: 13, flex: 1 }}>Acervo Drive</Text>
              {driveJobStatus === "running" && <ActivityIndicator size="small" color="#22c55e" />}
              {driveJobStatus === "done" && <Feather name="check-circle" size={14} color="#4ade80" />}
              {driveJobStatus === "error" && <Feather name="alert-circle" size={14} color="#f87171" />}
            </View>
            {driveJobMessage ? (
              <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, paddingHorizontal: 12, paddingBottom: 4 }} numberOfLines={2}>
                {driveJobMessage}
              </Text>
            ) : (
              <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, paddingHorizontal: 12, paddingBottom: 4 }}>
                Resolve links do Drive e armazena URLs no R2 como backup (sem subir o vídeo)
              </Text>
            )}
            {driveJobStatus === "running" && driveJobProgress > 0 && (
              <View style={{ height: 3, backgroundColor: "rgba(255,255,255,0.08)", marginHorizontal: 12, borderRadius: 2, marginBottom: 6 }}>
                <View style={{ height: 3, width: `${driveJobProgress}%` as any, backgroundColor: "#22c55e", borderRadius: 2 }} />
              </View>
            )}
            <Pressable
              onPress={startDriveExtraction}
              disabled={driveJobStatus === "running"}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                margin: 10, marginTop: 2, padding: 10, borderRadius: 8,
                backgroundColor: driveJobStatus === "running" ? "rgba(34,197,94,0.1)" : "#16a34a",
                opacity: driveJobStatus === "running" ? 0.6 : 1 }}
            >
              <Feather name={driveJobStatus === "running" ? "loader" : "download-cloud"} size={14} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                {driveJobStatus === "running"
                  ? `Extraindo… ${driveJobProgress}%`
                  : driveJobStatus === "done"
                  ? "Extrair novamente"
                  : "Extrair todos os conteúdos do Drive"}
              </Text>
            </Pressable>
            {/* Navegar Drive button */}
            <Pressable
              onPress={() => { setMgDriveOpen((v) => !v); if (!mgDriveOpen) { setMgDriveNav([]); setMgDriveItems([]); } }}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                marginHorizontal: 10, marginBottom: 10, padding: 9, borderRadius: 8,
                backgroundColor: mgDriveOpen ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.05)",
                borderWidth: 1, borderColor: mgDriveOpen ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.1)" }}
            >
              <Feather name="folder" size={14} color={mgDriveOpen ? "#4ade80" : "rgba(255,255,255,0.5)"} />
              <Text style={{ color: mgDriveOpen ? "#4ade80" : "rgba(255,255,255,0.5)", fontWeight: "600", fontSize: 13 }}>
                {mgDriveOpen ? "Fechar navegador" : "Navegar pastas do Drive"}
              </Text>
              <Feather name={mgDriveOpen ? "chevron-up" : "chevron-down"} size={14} color={mgDriveOpen ? "#4ade80" : "rgba(255,255,255,0.4)"} />
            </Pressable>
          </View>

          {/* ── Drive browser panel ── */}
          {mgDriveOpen && (
            <View style={{ marginHorizontal: 12, marginTop: 8, marginBottom: 8, borderRadius: 12, borderWidth: 1,
              borderColor: "rgba(34,197,94,0.2)", backgroundColor: "#040d06", height: DRIVE_PANEL_H }}>

              {/* Header + breadcrumb trail */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}>
                <Feather name="hard-drive" size={14} color="#22c55e" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Pressable onPress={() => { setMgDriveNav([]); setMgDriveItems([]); setMgDrivePageToken(null); }}>
                      <Text style={{ color: mgDriveNav.length === 0 ? "#4ade80" : "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "700" }}>Drive</Text>
                    </Pressable>
                    {mgDriveNav.map((entry, i) => (
                      <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Feather name="chevron-right" size={11} color="rgba(255,255,255,0.25)" />
                        <Pressable onPress={() => {
                          const next = mgDriveNav.slice(0, i + 1);
                          setMgDriveNav(next);
                          loadMgFolder(entry.drive, entry.path);
                        }}>
                          <Text style={{ color: i === mgDriveNav.length - 1 ? "#4ade80" : "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "600" }} numberOfLines={1}>{entry.name}</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>

              <View style={{ height: 1, backgroundColor: "rgba(34,197,94,0.12)", marginHorizontal: 12, marginBottom: 8 }} />

              {/* Root level — Drive roots */}
              {mgDriveNav.length === 0 && (
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled>
                  <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginBottom: 10 }}>
                    Selecione uma pasta raiz para navegar e registrar conteúdos no Drive
                  </Text>
                  {DRIVE_ROOTS.map((root) => (
                    <View key={root.drive} style={{ marginBottom: 12 }}>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>
                        {root.icon} {root.name}
                      </Text>
                      {root.folders.map((folder) => (
                        <Pressable key={folder} onPress={() => mgNavPush(root.drive, folder, folder)}
                          style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, marginBottom: 4, borderRadius: 8,
                            backgroundColor: "rgba(34,197,94,0.06)", borderWidth: 1, borderColor: "rgba(34,197,94,0.15)" }}>
                          <Feather name="folder" size={17} color="#22c55e" />
                          <Text style={{ flex: 1, color: "#fff", fontSize: 13, fontWeight: "600" }}>{folder}</Text>
                          <Feather name="chevron-right" size={15} color="rgba(255,255,255,0.25)" />
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </ScrollView>
              )}

              {/* Folder contents */}
              {mgDriveNav.length > 0 && (
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled>
                  {/* Back */}
                  <Pressable onPress={mgNavPop} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, marginBottom: 6 }}>
                    <Feather name="arrow-left" size={15} color="rgba(255,255,255,0.45)" />
                    <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Voltar</Text>
                  </Pressable>

                  {mgDriveLoading ? (
                    <View style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
                      <ActivityIndicator color="#22c55e" size="large" />
                      <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>Carregando pasta…</Text>
                    </View>
                  ) : mgDriveError ? (
                    <View style={styles.errorBox}><Feather name="alert-circle" size={13} color="#f87171" /><Text style={styles.errorBoxText}>{mgDriveError}</Text></View>
                  ) : mgDriveItems.length === 0 ? (
                    <View style={{ alignItems: "center", paddingVertical: 20 }}>
                      <Feather name="inbox" size={26} color="rgba(255,255,255,0.12)" />
                      <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 8 }}>Pasta vazia</Text>
                    </View>
                  ) : (
                    <>
                      {mgDriveItems.map((item) => {
                        const isDir = driveIsFolder(item);
                        const isVid = driveIsVideo(item);
                        const folderPath = mgCurrent ? `${mgCurrent.path}/${item.name}` : item.name;

                        if (isDir) {
                          return (
                            <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 3 }}>
                              <Pressable
                                onPress={() => mgNavPush(mgCurrent!.drive, folderPath, item.name)}
                                style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10,
                                  paddingVertical: 9, paddingHorizontal: 10, borderRadius: 8,
                                  backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" }}>
                                <Feather name="folder" size={16} color="#f59e0b" />
                                <Text style={{ flex: 1, color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
                                  {item.name}
                                </Text>
                                <Feather name="chevron-right" size={13} color="rgba(255,255,255,0.25)" />
                              </Pressable>
                              <Pressable
                                onPress={() => setFolderBulkTarget({ drive: mgCurrent!.drive, path: folderPath, name: item.name })}
                                style={{ paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8,
                                  backgroundColor: "rgba(34,197,94,0.07)", borderWidth: 1, borderColor: "rgba(34,197,94,0.25)" }}>
                                <Text style={{ color: "#4ade80", fontSize: 11, fontWeight: "700" }}>📂 Usar</Text>
                              </Pressable>
                            </View>
                          );
                        }

                        return (
                          <Pressable key={item.id}
                            onPress={() => {
                              if (isVid) {
                                setMgDriveRegisterItem(item);
                                setMgDriveRegisterCtx({ driveNum: mgCurrent!.drive, filePath: folderPath });
                              }
                            }}
                            style={{ flexDirection: "row", alignItems: "center", gap: 10,
                              paddingVertical: 9, paddingHorizontal: 10, marginBottom: 3, borderRadius: 8,
                              backgroundColor: isVid ? "rgba(34,197,94,0.05)" : "rgba(255,255,255,0.03)",
                              borderWidth: 1, borderColor: isVid ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.06)" }}>
                            <Feather name={isVid ? "film" : "file"} size={16} color={isVid ? "#22c55e" : "rgba(255,255,255,0.3)"} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: isVid ? "#e2fbe8" : "rgba(255,255,255,0.5)", fontSize: 12 }} numberOfLines={1}>
                                {item.name}
                              </Text>
                              {isVid && item.size && (
                                <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 1 }}>{driveFormatSize(item.size)}</Text>
                              )}
                            </View>
                            {isVid && (
                              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: "rgba(34,197,94,0.15)" }}>
                                <Text style={{ color: "#4ade80", fontSize: 10, fontWeight: "700" }}>+ Registrar</Text>
                              </View>
                            )}
                          </Pressable>
                        );
                      })}
                      {mgDrivePageToken && (
                        <Pressable onPress={() => loadMgFolder(mgCurrent!.drive, mgCurrent!.path, mgDrivePageToken)}
                          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                            marginTop: 8, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: "rgba(34,197,94,0.2)" }}>
                          <Feather name="more-horizontal" size={14} color="#22c55e" />
                          <Text style={{ color: "#22c55e", fontSize: 12, fontWeight: "600" }}>Carregar mais</Text>
                        </Pressable>
                      )}
                    </>
                  )}
                </ScrollView>
              )}
            </View>
          )}

          {/* ── Histórico de Remapeamentos ── */}
          <View style={{ marginHorizontal: 12, marginTop: 10, marginBottom: 2, borderRadius: 12, borderWidth: 1,
            borderColor: "rgba(234,179,8,0.25)", backgroundColor: "#0c0b00", overflow: "hidden" }}>
            <Pressable
              onPress={() => { setRemapOpen((v) => !v); if (!remapOpen && remapHistory.length === 0) loadRemapHistory(); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 12 }}>
              <Feather name="clock" size={15} color="#eab308" />
              <Text style={{ color: "#eab308", fontWeight: "700", fontSize: 14, flex: 1 }}>
                Histórico de Correções de ID
              </Text>
              {remapLoading && <ActivityIndicator size="small" color="#eab308" />}
              {!remapLoading && (
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: "rgba(234,179,8,0.15)" }}>
                  <Text style={{ color: "#eab308", fontSize: 11, fontWeight: "700" }}>{remapHistory.length}</Text>
                </View>
              )}
              <Feather name={remapOpen ? "chevron-up" : "chevron-down"} size={14} color="rgba(234,179,8,0.5)" />
            </Pressable>
            {remapOpen && (
              <View style={{ borderTopWidth: 1, borderTopColor: "rgba(234,179,8,0.12)" }}>
                {remapHistory.length === 0 ? (
                  <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, textAlign: "center", padding: 16 }}>
                    Nenhuma correção de ID registrada ainda.
                  </Text>
                ) : (
                  remapHistory.map((entry, idx) => {
                    const date = new Date(entry.doneAt);
                    const dateStr = `${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
                    return (
                      <View key={entry.id} style={{ paddingHorizontal: 14, paddingVertical: 10,
                        borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: "rgba(255,255,255,0.05)" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
                            backgroundColor: entry.toType === "tv" ? "rgba(59,130,246,0.2)" : "rgba(168,85,247,0.2)" }}>
                            <Text style={{ color: entry.toType === "tv" ? "#60a5fa" : "#c084fc", fontSize: 10, fontWeight: "700" }}>
                              {entry.toType === "tv" ? "SÉRIE" : "FILME"}
                            </Text>
                          </View>
                          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: "rgba(34,197,94,0.15)" }}>
                            <Text style={{ color: "#4ade80", fontSize: 10, fontWeight: "700" }}>
                              {entry.updated} item{entry.updated !== 1 ? "s" : ""} corrigido{entry.updated !== 1 ? "s" : ""}
                            </Text>
                          </View>
                          <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, marginLeft: "auto" }}>{dateStr}</Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            {entry.fromIds.map((id) => (
                              <View key={id} style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" }}>
                                <Text style={{ color: "#f87171", fontSize: 10, fontWeight: "700" }}>{id}</Text>
                              </View>
                            ))}
                          </View>
                          <Feather name="arrow-right" size={11} color="rgba(255,255,255,0.3)" />
                          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: "rgba(34,197,94,0.15)", borderWidth: 1, borderColor: "rgba(34,197,94,0.3)" }}>
                            <Text style={{ color: "#4ade80", fontSize: 10, fontWeight: "700" }}>{entry.toId}</Text>
                          </View>
                        </View>
                        {entry.titles.length > 0 && (
                          <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 3 }} numberOfLines={1}>
                            {entry.titles.join(" · ")}
                          </Text>
                        )}
                      </View>
                    );
                  })
                )}
                <Pressable onPress={loadRemapHistory}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
                    margin: 10, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: "rgba(234,179,8,0.2)" }}>
                  <Feather name="refresh-cw" size={12} color="rgba(234,179,8,0.6)" />
                  <Text style={{ color: "rgba(234,179,8,0.6)", fontSize: 12 }}>Atualizar histórico</Text>
                </Pressable>
              </View>
            )}
          </View>

        </ScrollView>
      )}
      {/* ══════════ END ROOT STATE ══════════════════════════════════════════ */}

      {/* ── Modals (rendered outside ScrollView, always accessible) ── */}
      {mgDriveRegisterItem && (
        <DriveRegisterModal
          item={mgDriveRegisterItem}
          driveNum={mgDriveRegisterCtx?.driveNum}
          driveFilePath={mgDriveRegisterCtx?.filePath}
          onClose={() => { setMgDriveRegisterItem(null); setMgDriveRegisterCtx(null); }}
          onDone={() => { setMgDriveRegisterItem(null); setMgDriveRegisterCtx(null); Alert.alert("✅ Registrado", "Conteúdo adicionado ao Drive Registry!"); }}
        />
      )}
      {folderBulkTarget && (
        <FolderBulkModal
          target={folderBulkTarget}
          onClose={() => setFolderBulkTarget(null)}
          onDone={(count) => {
            setFolderBulkTarget(null);
            Alert.alert("✅ Pasta registrada!", `${count} arquivo${count !== 1 ? "s" : ""} adicionado${count !== 1 ? "s" : ""} ao Drive Registry.`);
          }}
        />
      )}

      {/* ══════════ R2 FILE BROWSER STATE (path !== "") ══════════════════════ */}
      {path !== "" && (
        <>
          {/* Breadcrumb */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.breadcrumb} contentContainerStyle={{ alignItems: "center", paddingHorizontal: 12, gap: 4 }}>
            <Pressable onPress={() => { setPath(""); load(""); }} style={styles.breadcrumbItem}>
              <Feather name="home" size={13} color={RED} />
            </Pressable>
            {pathParts.map((p, i) => (
              <React.Fragment key={i}>
                <Text style={styles.breadcrumbSep}>/</Text>
                <Pressable onPress={() => {
                  const np = pathParts.slice(0, i + 1).join("/") + "/";
                  setPath(np); load(np);
                }} style={styles.breadcrumbItem}>
                  <Text style={styles.breadcrumbText} numberOfLines={1}>{p}</Text>
                </Pressable>
              </React.Fragment>
            ))}
          </ScrollView>

          {/* Move banner */}
          {movingKey && (
            <View style={styles.moveBox}>
              <Text style={styles.moveTitle} numberOfLines={1}>Mover: {movingName || movingKey.split("/").pop()}</Text>
              <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginBottom: 10 }}>
                Escolha a pasta de destino abaixo
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  style={[styles.actionBtn, { flex: 1, backgroundColor: "#374151" }]}
                  onPress={() => { setMovingKey(null); setMovingName(""); }}
                >
                  <Text style={styles.actionBtnText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, { flex: 1, backgroundColor: "#1d4ed8" }]}
                  onPress={() => setShowMovePicker(true)}
                >
                  <Feather name="folder" size={14} color="#fff" />
                  <Text style={styles.actionBtnText}>Escolher pasta</Text>
                </Pressable>
              </View>
            </View>
          )}
          {showMovePicker && (
            <FolderPickerModal
              onSelect={(folder) => { setShowMovePicker(false); doMove(folder); }}
              onClose={() => setShowMovePicker(false)}
            />
          )}

          {error && (
            <View style={[styles.errorBox, { margin: 12 }]}>
              <Text style={styles.errorBoxText}>{error}</Text>
            </View>
          )}

          {loading ? (
            <View style={styles.center}><ActivityIndicator color={RED} size="large" /></View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(i) => i.key}
              contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 100 }}
              ListHeaderComponent={
                path ? (
                  <Pressable style={styles.upRow} onPress={goUp}>
                    <Feather name="corner-left-up" size={16} color="rgba(255,255,255,0.5)" />
                    <Text style={styles.upText}>.. (pasta acima)</Text>
                  </Pressable>
                ) : null
              }
              ListEmptyComponent={<View style={[styles.center, { paddingTop: 40 }]}><Text style={styles.dim}>Pasta vazia</Text></View>}
              renderItem={({ item }) => {
                const KNOWN_NON_VIDEO = /\.(jpg|jpeg|png|gif|webp|txt|json|pdf|doc|docx|html|css|js|xml|zip|rar|keep)$/i;
                const looksLikeVideo = item.isVideo || (item.type === "file" && (item.size ?? 0) > 5_000_000 && !KNOWN_NON_VIDEO.test(item.name));
                return (
                  <View style={styles.fileRow}>
                    <Feather
                      name={item.type === "folder" ? "folder" : looksLikeVideo ? "film" : "file"}
                      size={18}
                      color={item.type === "folder" ? "#f59e0b" : looksLikeVideo ? RED : "rgba(255,255,255,0.4)"}
                    />
                    <Pressable style={{ flex: 1, marginLeft: 10 }} onPress={() => item.type === "folder" ? navigate(item) : undefined}>
                      <Text style={styles.fileName} numberOfLines={2}>{item.name}</Text>
                      {item.size ? <Text style={styles.fileMeta}>{formatBytes(item.size)}</Text> : null}
                    </Pressable>
                    {looksLikeVideo && (
                      <Pressable onPress={() => onRegister(item.key)} style={styles.fileAction}>
                        <Feather name="link" size={15} color="#60a5fa" />
                      </Pressable>
                    )}
                    <Pressable onPress={() => { setMovingKey(item.key); setMovingName(item.name); }} style={styles.fileAction}>
                      <Feather name="move" size={15} color="rgba(255,255,255,0.4)" />
                    </Pressable>
                    {item.type === "file" && (
                      <Pressable onPress={() => deleteItem(item)} style={styles.fileAction}>
                        <Feather name="trash-2" size={15} color="#f87171" />
                      </Pressable>
                    )}
                  </View>
                );
              }}
            />
          )}
        </>
      )}
    </View>
  );
}

// ── Register Modal ─────────────────────────────────────────────────────────────

function RegisterModal({ r2Key, episode, onClose, onDone }: {
  r2Key: string; episode?: number; onClose: () => void; onDone: () => void;
}) {
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TmdbSearchResult[]>([]);
  const [selected, setSelected] = useState<TmdbSearchResult | null>(null);
  const [label, setLabel] = useState("Dublado");
  const [quality, setQuality] = useState("1080p");
  const [season, setSeason] = useState("");
  const [ep, setEp] = useState(episode != null ? String(episode) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const data = await apiFetch<{ results: TmdbSearchResult[] }>(`/tmdb-search?q=${encodeURIComponent(q)}&type=multi`);
      setResults(data.results);
    } catch (e: any) { setError(e.message); }
    finally { setSearching(false); }
  };

  const save = async () => {
    if (!selected) { setError("Selecione um título"); return; }
    setSaving(true);
    try {
      await apiPost("/registry/add", {
        item: {
          r2Key,
          tmdbId: selected.id,
          tmdbType: selected.media_type,
          title: selected.title,
          label: label.trim() || "Padrão",
          season: season ? Number(season) : null,
          episode: ep ? Number(ep) : null,
          quality: quality,
        },
      });
      onDone();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalWrap, { backgroundColor: "#111" }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Registrar como Play Option</Text>
          <Pressable onPress={onClose}><Feather name="x" size={22} color="rgba(255,255,255,0.6)" /></Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
          <Text style={styles.dim} numberOfLines={2}>Arquivo: {r2Key}</Text>

          {/* TMDB search */}
          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Buscar título no TMDB</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Nome do filme ou série..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={q}
              onChangeText={setQ}
              onSubmitEditing={search}
              returnKeyType="search"
            />
            <Pressable style={[styles.actionBtn, { paddingHorizontal: 14 }]} onPress={search} disabled={searching}>
              {searching ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="search" size={16} color="#fff" />}
            </Pressable>
          </View>

          {/* Results */}
          {results.map((r) => (
            <Pressable
              key={r.id}
              style={[styles.tmdbResult, selected?.id === r.id && { borderColor: RED, backgroundColor: `${RED}18` }]}
              onPress={() => { setSelected(r); setResults([]); }}
            >
              {r.poster_path ? (
                <Image source={{ uri: TMDB_IMG(r.poster_path, "w92") ?? "" }} style={styles.tmdbPoster} contentFit="cover" />
              ) : (
                <View style={[styles.tmdbPoster, { backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }]}>
                  <Feather name="film" size={16} color="rgba(255,255,255,0.3)" />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.tmdbTitle}>{r.title}</Text>
                <Text style={styles.dim}>{r.media_type === "tv" ? "Série" : "Filme"}</Text>
              </View>
              {selected?.id === r.id && <Feather name="check-circle" size={18} color={RED} />}
            </Pressable>
          ))}

          {selected && (
            <View style={[styles.tmdbResult, { borderColor: RED, backgroundColor: `${RED}15` }]}>
              {selected.poster_path ? (
                <Image source={{ uri: TMDB_IMG(selected.poster_path, "w92") ?? "" }} style={styles.tmdbPoster} contentFit="cover" />
              ) : (
                <View style={[styles.tmdbPoster, { backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }]}>
                  <Feather name="film" size={16} color="rgba(255,255,255,0.3)" />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.tmdbTitle}>{selected.title}</Text>
                <Text style={[styles.dim, { color: RED }]}>{selected.media_type === "tv" ? "Série" : "Filme"} · Selecionado</Text>
              </View>
              <Pressable onPress={() => setSelected(null)}><Feather name="x" size={16} color="rgba(255,255,255,0.4)" /></Pressable>
            </View>
          )}

          {/* If TV, season + episode */}
          {selected?.media_type === "tv" && (
            <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Temporada</Text>
                <TextInput style={styles.input} placeholder="1" placeholderTextColor="rgba(255,255,255,0.25)" value={season} onChangeText={setSeason} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Episódio</Text>
                <TextInput style={styles.input} placeholder="1" placeholderTextColor="rgba(255,255,255,0.25)" value={ep} onChangeText={setEp} keyboardType="number-pad" />
              </View>
            </View>
          )}

          {/* Quality */}
          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Qualidade</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
            {["4K", "1080p", "720p", "480p", "360p"].map((q) => {
              const qColors: Record<string, string> = { "4K": "#a78bfa", "1080p": "#60a5fa", "720p": "#34d399", "480p": "#f59e0b", "360p": "#fb923c" };
              const isActive = quality === q;
              return (
                <Pressable
                  key={q}
                  onPress={() => setQuality(q)}
                  style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5,
                    borderColor: isActive ? (qColors[q] ?? RED) : "rgba(255,255,255,0.15)",
                    backgroundColor: isActive ? `${qColors[q] ?? RED}22` : "transparent" }}
                >
                  <Text style={{ color: isActive ? (qColors[q] ?? RED) : "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "700" }}>{q}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Label */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Rótulo</Text>
          <TextInput
            style={styles.input}
            placeholder="Dublado"
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={label}
            onChangeText={setLabel}
          />

          {error && <View style={[styles.errorBox, { marginTop: 12 }]}><Text style={styles.errorBoxText}>{error}</Text></View>}

          <Pressable style={[styles.actionBtn, { marginTop: 20 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="link" size={16} color="#fff" />}
            <Text style={styles.actionBtnText}>Registrar como opção de play</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Edit Entry Modal ───────────────────────────────────────────────────────────

function EditEntryModal({ entry, onClose, onDone }: {
  entry: CatalogEntry; onClose: () => void; onDone: (newName: string) => void;
}) {
  const [displayName, setDisplayName] = useState(entry.tmdb?.title ?? entry.name);
  const [folderName, setFolderName] = useState(entry.name);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TmdbSearchResult[]>([]);
  const [selected, setSelected] = useState<TmdbSearchResult | null>(
    entry.tmdb ? { id: entry.tmdb.id, title: entry.tmdb.title, poster_path: entry.tmdb.poster_path, media_type: entry.tmdb.media_type } : null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  const search = async () => {
    if (!q.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const data = await apiFetch<{ results: TmdbSearchResult[] }>(`/tmdb-search?q=${encodeURIComponent(q)}&type=multi`);
      setResults(data.results);
    } catch (e: any) { setError(e.message); }
    finally { setSearching(false); }
  };

  const save = async () => {
    const newFolder = folderName.trim();
    const newDisplay = displayName.trim();
    if (!newFolder) { setError("Nome da pasta não pode estar vazio"); return; }
    setSaving(true);
    setError(null);
    try {
      // entry.key is the full R2 prefix, e.g. "séries animadas/A lenda de Tarzan/"
      // entry.name is just the last segment, e.g. "A lenda de Tarzan"
      const oldFullPrefix = entry.key; // full path with trailing slash
      const parentPath = oldFullPrefix.slice(0, oldFullPrefix.length - entry.name.length - 1); // e.g. "séries animadas/"

      // Build the new full prefix using the parent path + new folder name
      const newFullPrefix = parentPath + newFolder + "/";

      // 1. If folder name changed, rename the actual folder in R2 (using full paths)
      if (newFolder !== entry.name) {
        setProgress("Renomeando pasta no R2…");
        await apiPost("/rename-folder", { oldPrefix: oldFullPrefix, newPrefix: newFullPrefix });
      }

      // 2. Save TMDB override + display name in catalog-meta (using full prefix as key)
      setProgress("Salvando metadados…");
      await apiPost("/catalog-meta", {
        prefix: newFullPrefix,
        tmdbId: selected?.id,
        tmdbType: selected?.media_type,
        displayName: newDisplay !== newFolder ? newDisplay : undefined,
      });

      onDone(newDisplay || newFolder);
    } catch (e: any) { setError(e.message ?? "Erro ao salvar"); }
    finally { setSaving(false); setProgress(""); }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalWrap, { backgroundColor: "#111" }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Editar entrada</Text>
          <Pressable onPress={onClose}><Feather name="x" size={22} color="rgba(255,255,255,0.6)" /></Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
          {/* Folder (real R2 key) */}
          <Text style={styles.fieldLabel}>Nome da pasta no R2</Text>
          <TextInput
            style={styles.input}
            value={folderName}
            onChangeText={setFolderName}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor="rgba(255,255,255,0.25)"
          />
          <Text style={[styles.dim, { fontSize: 11, textAlign: "left", marginTop: 4, marginBottom: 16 }]}>
            ⚠️ Alterar renomeia a pasta real no R2 e move todos os arquivos
          </Text>

          {/* Display name (shown to users, TMDB-based) */}
          <Text style={styles.fieldLabel}>Nome exibido (título)</Text>
          <TextInput
            style={[styles.input, { marginBottom: 16 }]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholderTextColor="rgba(255,255,255,0.25)"
          />

          {/* TMDB search */}
          <Text style={[styles.fieldLabel]}>Série / Filme no TMDB</Text>
          {selected && (
            <View style={[styles.tmdbResult, { borderColor: RED, backgroundColor: `${RED}15`, marginBottom: 10 }]}>
              {selected.poster_path ? (
                <Image source={{ uri: TMDB_IMG(selected.poster_path, "w92") ?? "" }} style={styles.tmdbPoster} contentFit="cover" />
              ) : (
                <View style={[styles.tmdbPoster, { backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }]}>
                  <Feather name="film" size={16} color="rgba(255,255,255,0.3)" />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.tmdbTitle}>{selected.title}</Text>
                <Text style={[styles.dim, { color: RED }]}>{selected.media_type === "tv" ? "Série" : "Filme"} · ID {selected.id}</Text>
              </View>
              <Pressable onPress={() => setSelected(null)}><Feather name="x" size={16} color="rgba(255,255,255,0.4)" /></Pressable>
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Buscar no TMDB…"
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={q}
              onChangeText={setQ}
              onSubmitEditing={search}
              returnKeyType="search"
            />
            <Pressable style={[styles.actionBtn, { paddingHorizontal: 14, marginTop: 0 }]} onPress={search} disabled={searching}>
              {searching ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="search" size={16} color="#fff" />}
            </Pressable>
          </View>

          {results.map((r) => (
            <Pressable
              key={r.id}
              style={[styles.tmdbResult, { marginTop: 8 }, selected?.id === r.id && { borderColor: RED, backgroundColor: `${RED}18` }]}
              onPress={() => { setSelected(r); setResults([]); setDisplayName(r.title); }}
            >
              {r.poster_path ? (
                <Image source={{ uri: TMDB_IMG(r.poster_path, "w92") ?? "" }} style={styles.tmdbPoster} contentFit="cover" />
              ) : (
                <View style={[styles.tmdbPoster, { backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }]}>
                  <Feather name="film" size={16} color="rgba(255,255,255,0.3)" />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.tmdbTitle}>{r.title}</Text>
                <Text style={styles.dim}>{r.media_type === "tv" ? "Série" : "Filme"} · ID {r.id}</Text>
              </View>
              {selected?.id === r.id && <Feather name="check-circle" size={18} color={RED} />}
            </Pressable>
          ))}

          {error && <View style={[styles.errorBox, { marginTop: 12 }]}><Text style={styles.errorBoxText}>{error}</Text></View>}
          {progress ? <Text style={[styles.dim, { marginTop: 10, textAlign: "center" }]}>{progress}</Text> : null}

          <Pressable style={[styles.actionBtn, { marginTop: 20 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="save" size={16} color="#fff" />}
            <Text style={styles.actionBtnText}>{saving ? "Salvando…" : "Salvar"}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Flix 2.0 Panel ─────────────────────────────────────────────────────────────

const FLIX2_COLOR = "#8b5cf6";

interface Flix2Episode {
  id_link: number;
  season: number;
  episode: number;
  language: string;
  quality: string;
  stream_url: string;
}

interface Flix2Item {
  id: number;
  tmdb_id: number;
  title: string;
  type: "filme" | "serie" | "anime";
  poster: string;
  backdrop: string;
  year: string;
  genres: string;
  synopsis: string;
  episodes_count: number;
  stream_url?: string;
  episodes?: Flix2Episode[];
}

type Flix2Type = "movies" | "series" | "animes";

function Flix2Panel() {
  const [subType, setSubType] = useState<Flix2Type>("movies");
  const [items, setItems] = useState<Flix2Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState(""); // the committed query sent to server
  const [searching, setSearching] = useState(false);  // debounce in-flight indicator
  const [registerTarget, setRegisterTarget] = useState<Flix2Item | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [buildJobId, setBuildJobId] = useState<string | null>(null);
  const [buildProgress, setBuildProgress] = useState<{
    status: "running" | "done" | "error";
    currentType: string;
    typesDone: string[];
    pagesScanned: number;
    totalPages: number;
    summary: Record<string, number>;
    error?: string;
  } | null>(null);
  const [indexStatus, setIndexStatus] = useState<Record<string, { exists: boolean; count: number; ageMs: number | null }> | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Cache warm-up status ──────────────────────────────────────────────────
  type WarmTypeInfo = {
    status: "idle" | "running" | "done" | "error";
    pagesLoaded: number;
    totalPages: number;
    itemCount: number;
    cachedAt: number | null;
    errorMsg?: string;
  };
  const [warmStatus, setWarmStatus] = useState<{
    types: Record<string, WarmTypeInfo>;
    allWarm: boolean;
    anyRunning: boolean;
  } | null>(null);
  const warmPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Cache performance stats ───────────────────────────────────────────────
  type CacheStatEntry = { hits: number; misses: number; entries?: number; totalItems?: number; hitRate: number };
  const [cacheStats, setCacheStats] = useState<{
    ok: boolean;
    uptime: number;
    serverStartedAt: number;
    caches: Record<string, CacheStatEntry>;
  } | null>(null);

  const loadIndexStatus = async () => {
    setStatusLoading(true);
    try {
      const data = await apiFetch<{ ok: boolean; status: Record<string, { exists: boolean; count: number; ageMs: number | null }> }>(
        "/flix2/index-status"
      );
      if (data.ok) setIndexStatus(data.status);
    } catch {}
    finally { setStatusLoading(false); }
  };

  const fetchWarmStatus = async () => {
    try {
      const data = await apiFetch<{
        ok: boolean;
        types: Record<string, WarmTypeInfo>;
        allWarm: boolean;
        anyRunning: boolean;
      }>("/flix2/warm-status");
      if (data.ok) setWarmStatus(data);
    } catch {}
  };

  const fetchCacheStats = async () => {
    try {
      const d = await apiFetch<any>("/flix2/stats");
      if (d.ok) setCacheStats(d);
    } catch {}
  };

  // Poll warm status on mount; keep polling while warm-up is in progress
  useEffect(() => {
    fetchWarmStatus();
    warmPollRef.current = setInterval(async () => {
      try {
        const data = await apiFetch<{
          ok: boolean;
          types: Record<string, WarmTypeInfo>;
          allWarm: boolean;
          anyRunning: boolean;
        }>("/flix2/warm-status");
        if (data.ok) {
          setWarmStatus(data);
          if (!data.anyRunning && warmPollRef.current) {
            clearInterval(warmPollRef.current);
            warmPollRef.current = setInterval(async () => {
              try {
                const d = await apiFetch<any>("/flix2/warm-status");
                if (d.ok) setWarmStatus(d);
              } catch {}
            }, 60000); // slow poll when idle
          }
        }
      } catch {}
    }, 3000);
    return () => { if (warmPollRef.current) clearInterval(warmPollRef.current); };
  }, []);

  useEffect(() => { loadIndexStatus(); }, []);
  useEffect(() => {
    fetchCacheStats();
    const id = setInterval(fetchCacheStats, 10_000);
    return () => clearInterval(id);
  }, []);

  const startBuild = async () => {
    setBuildProgress(null);
    setBuildJobId(null);
    try {
      const data = await apiFetch<{ ok: boolean; jobId: string }>(
        "/flix2/build-index?type=all",
        { method: "POST" }
      );
      if (data.ok && data.jobId) {
        setBuildJobId(data.jobId);
      }
    } catch (e: any) {
      setBuildProgress({ status: "error", currentType: "", typesDone: [], pagesScanned: 0, totalPages: 0, summary: {}, error: e.message });
    }
  };

  // Poll progress while job is running
  useEffect(() => {
    if (!buildJobId) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const data = await apiFetch<any>(`/flix2/build-progress?jobId=${buildJobId}`);
        setBuildProgress(data);
        if (data.status === "done" || data.status === "error") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setBuildJobId(null);
          loadIndexStatus();
        }
      } catch {}
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [buildJobId]);

  const fetchItems = async (type: Flix2Type, pg: number, append = false) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const data = await apiFetch<{ success: boolean; pagination: any; data: Flix2Item[] }>(
        `/flix2/catalog?type=${type}&page=${pg}`
      );
      if (!data.success) { setError("Erro ao carregar conteúdo"); return; }
      setTotalPages(data.pagination?.total_pages ?? 1);
      setTotalItems(data.pagination?.total_items ?? 0);
      setPage(pg);
      if (append) setItems((prev) => [...prev, ...data.data]);
      else setItems(data.data);
    } catch (e: any) { setError(e.message ?? "Erro de rede"); }
    finally { setLoading(false); setLoadingMore(false); }
  };


  const runSearch = async (type: Flix2Type, q: string) => {
    setLoading(true);
    setError(null);
    setItems([]);
    setPage(1);
    setTotalPages(1);
    setTotalItems(0);
    try {
      const data = await apiFetch<{ results: Flix2Item[]; total: number; pagesScanned: number; totalPages: number }>(
        `/flix2/search?q=${encodeURIComponent(q)}&type=${type}&limit=80&maxPages=120`
      );
      setItems(data.results ?? []);
      setTotalItems(data.total ?? 0);
      setTotalPages(0); // 0 = search mode, hide load-more
    } catch (e: any) { setError(e.message ?? "Erro de rede"); }
    finally { setLoading(false); setSearching(false); }
  };

  useEffect(() => {
    setItems([]);
    setPage(1);
    setSearch("");
    setSearchQuery("");
    fetchItems(subType, 1, false);
  }, [subType]);

  // Debounced search: fires 700ms after user stops typing → hits /flix2/search
  const handleSearchChange = (text: string) => {
    setSearch(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) {
      setSearchQuery("");
      setSearching(false);
      setItems([]);
      setPage(1);
      fetchItems(subType, 1, false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      const q = text.trim();
      setSearchQuery(q);
      runSearch(subType, q);
    }, 700);
  };

  const loadMore = () => {
    if (loadingMore || loading || page >= totalPages || totalPages === 0) return;
    fetchItems(subType, page + 1, true);
  };

  const filtered = items;

  const TABS: { id: Flix2Type; label: string; icon: string }[] = [
    { id: "movies", label: "Filmes", icon: "film" },
    { id: "series", label: "Séries", icon: "tv" },
    { id: "animes", label: "Animes", icon: "star" },
  ];

  return (
    <View style={{ flex: 1 }}>
      {/* Sub-tab bar */}
      <View style={{ backgroundColor: "#0a0a0a", paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          {TABS.map((t) => (
            <Pressable key={t.id} onPress={() => setSubType(t.id)}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
                paddingVertical: 8, borderRadius: 10,
                backgroundColor: subType === t.id ? `${FLIX2_COLOR}22` : "rgba(255,255,255,0.05)",
                borderWidth: 1, borderColor: subType === t.id ? `${FLIX2_COLOR}55` : "rgba(255,255,255,0.08)" }}>
              <Feather name={t.icon as any} size={13} color={subType === t.id ? FLIX2_COLOR : "rgba(255,255,255,0.4)"} />
              <Text style={{ color: subType === t.id ? FLIX2_COLOR : "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: subType === t.id ? "700" : "400" }}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {/* ── Cache Warm-up Status Panel ── */}
        {(() => {
          if (!warmStatus) return null;
          const WARM_LABELS: Record<string, string> = { movies: "Filmes", series: "Séries", animes: "Animes" };
          const WARM_PAGES: Record<string, number> = { movies: 821, series: 377, animes: 849 };
          const types = ["series", "animes", "movies"];

          const dot = (status: string) => {
            if (status === "done") return <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#22c55e" }} />;
            if (status === "running") return <ActivityIndicator size="small" color="#f59e0b" style={{ width: 7, height: 7 }} />;
            if (status === "error") return <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#f87171" }} />;
            return <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "rgba(255,255,255,0.2)" }} />;
          };

          const borderColor = warmStatus.allWarm
            ? "rgba(34,197,94,0.2)"
            : warmStatus.anyRunning
              ? "rgba(245,158,11,0.3)"
              : "rgba(255,255,255,0.07)";

          return (
            <View style={{ marginBottom: 6, borderRadius: 12, borderWidth: 1, borderColor,
              backgroundColor: "rgba(255,255,255,0.02)", overflow: "hidden" }}>
              {/* Header */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Feather name="database" size={11} color={warmStatus.allWarm ? "#22c55e" : warmStatus.anyRunning ? "#f59e0b" : "rgba(255,255,255,0.3)"} />
                  <Text style={{ color: warmStatus.allWarm ? "#22c55e" : warmStatus.anyRunning ? "#f59e0b" : "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "700" }}>
                    {warmStatus.allWarm ? "Cache Quente — busca cobre todo o catálogo" : warmStatus.anyRunning ? "Aquecendo cache…" : "Cache de Busca"}
                  </Text>
                </View>
                <Pressable onPress={fetchWarmStatus} style={{ padding: 4 }}>
                  <Feather name="refresh-cw" size={10} color="rgba(255,255,255,0.25)" />
                </Pressable>
              </View>

              {/* Per-type rows */}
              {types.map((t) => {
                const info: WarmTypeInfo = warmStatus.types[t] ?? { status: "idle", pagesLoaded: 0, totalPages: 0, itemCount: 0, cachedAt: null };
                const total = info.totalPages > 0 ? info.totalPages : WARM_PAGES[t] ?? 0;
                const pct = total > 0 ? Math.min(100, Math.round((info.pagesLoaded / total) * 100)) : 0;
                const ageMin = info.cachedAt ? Math.round((Date.now() - info.cachedAt) / 60000) : null;
                return (
                  <View key={t} style={{ paddingHorizontal: 10, paddingBottom: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: info.status === "running" ? 4 : 0 }}>
                      {dot(info.status)}
                      <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "600", width: 44 }}>
                        {WARM_LABELS[t]}
                      </Text>
                      {info.status === "done" ? (
                        <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, flex: 1 }}>
                          {info.itemCount.toLocaleString()} títulos
                          {ageMin !== null && ageMin < 60 ? ` · há ${ageMin}min` : ageMin !== null ? ` · há ${Math.round(ageMin / 60)}h` : ""}
                        </Text>
                      ) : info.status === "running" ? (
                        <Text style={{ color: "#f59e0b", fontSize: 9, flex: 1 }}>
                          {info.pagesLoaded.toLocaleString()} / {total.toLocaleString()} pág · {pct}%
                        </Text>
                      ) : info.status === "error" ? (
                        <Text style={{ color: "#f87171", fontSize: 9, flex: 1 }}>Erro · {info.errorMsg ?? "falha"}</Text>
                      ) : (
                        <Text style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, flex: 1 }}>Aguardando…</Text>
                      )}
                    </View>
                    {info.status === "running" && total > 0 && (
                      <View style={{ height: 2, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.06)", marginLeft: 14 }}>
                        <View style={{ height: 2, borderRadius: 1, width: `${pct}%`, backgroundColor: "#f59e0b" }} />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })()}

        {/* ── Cache Performance Panel ── */}
        {cacheStats && (() => {
          const CACHE_LABELS: Record<string, string> = {
            page: "Páginas", full: "Catálogo", episodes: "Episódios",
            streamUrl: "Stream URL", lookup: "Busca",
          };
          const cacheKeys = ["page", "full", "episodes", "streamUrl", "lookup"];
          const allHits  = cacheKeys.reduce((s, k) => s + (cacheStats.caches[k]?.hits  ?? 0), 0);
          const allTotal = cacheKeys.reduce((s, k) => s + ((cacheStats.caches[k]?.hits ?? 0) + (cacheStats.caches[k]?.misses ?? 0)), 0);
          const overallRate = allTotal > 0 ? Math.round((allHits / allTotal) * 1000) / 10 : 0;
          const rateColor = (r: number) => r >= 90 ? "#22c55e" : r >= 70 ? "#f59e0b" : r > 0 ? "#f87171" : "rgba(255,255,255,0.2)";
          const uptimeMin = Math.round(cacheStats.uptime / 60000);

          return (
            <View style={{ marginBottom: 6, borderRadius: 12, borderWidth: 1,
              borderColor: "rgba(255,255,255,0.07)", backgroundColor: "rgba(255,255,255,0.02)", overflow: "hidden" }}>
              {/* Header */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Feather name="zap" size={11} color="rgba(255,255,255,0.35)" />
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "700" }}>
                    Performance do Cache
                  </Text>
                  {overallRate > 0 && (
                    <View style={{ backgroundColor: rateColor(overallRate) + "33", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                      <Text style={{ color: rateColor(overallRate), fontSize: 9, fontWeight: "700" }}>{overallRate}% hits</Text>
                    </View>
                  )}
                </View>
                <Pressable onPress={fetchCacheStats} style={{ padding: 4 }}>
                  <Feather name="refresh-cw" size={10} color="rgba(255,255,255,0.25)" />
                </Pressable>
              </View>
              {/* Uptime / totals */}
              <Text style={{ color: "rgba(255,255,255,0.2)", fontSize: 8, paddingHorizontal: 10, paddingBottom: 5 }}>
                uptime {uptimeMin < 60 ? `${uptimeMin}min` : `${Math.round(uptimeMin / 60)}h`}
                {" · "}{allTotal.toLocaleString()} reqs
              </Text>
              {/* Per-cache rows */}
              {cacheKeys.map((k) => {
                const c = cacheStats.caches[k];
                if (!c) return null;
                const total = c.hits + c.misses;
                const color = rateColor(c.hitRate);
                return (
                  <View key={k} style={{ paddingHorizontal: 10, paddingBottom: 7 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 9, fontWeight: "600", width: 62 }}>
                        {CACHE_LABELS[k]}
                      </Text>
                      <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, flex: 1 }}>
                        {c.hits.toLocaleString()} hits · {c.misses.toLocaleString()} miss
                        {c.entries != null ? ` · ${c.entries} ent.` : ""}
                      </Text>
                      <Text style={{ color: color, fontSize: 9, fontWeight: "700", width: 36, textAlign: "right" }}>
                        {total > 0 ? `${c.hitRate}%` : "--"}
                      </Text>
                    </View>
                    {total > 0 && (
                      <View style={{ height: 2, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.06)" }}>
                        <View style={{ height: 2, borderRadius: 1, width: `${Math.max(1, c.hitRate)}%`, backgroundColor: color }} />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })()}

        {/* ── Auto-Sync panel ── */}
        {(() => {
          const isRunning = !!buildJobId || buildProgress?.status === "running";
          const isDone = buildProgress?.status === "done";
          const isError = buildProgress?.status === "error";
          const allIndexed = indexStatus && ["movies","series","animes"].every(t => indexStatus[t]?.exists);
          const totalCount = indexStatus ? Object.values(indexStatus).reduce((s, v) => s + (v.count ?? 0), 0) : 0;
          const oldestAgeMs = indexStatus ? Math.max(...Object.values(indexStatus).map(v => v.ageMs ?? 0)) : 0;
          const ageHours = Math.round(oldestAgeMs / 3600000);

          const progressPct = buildProgress && buildProgress.totalPages > 0
            ? Math.round((buildProgress.pagesScanned / buildProgress.totalPages) * 100)
            : 0;

          const TYPE_LABELS: Record<string, string> = { movies: "Filmes", series: "Séries", animes: "Animes" };

          return (
            <View style={{ marginBottom: 6, borderRadius: 12, borderWidth: 1,
              borderColor: isRunning ? `${FLIX2_COLOR}55` : allIndexed ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.1)",
              backgroundColor: isRunning ? `${FLIX2_COLOR}0d` : "rgba(255,255,255,0.03)",
              overflow: "hidden" }}>

              {/* Status row */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10 }}>
                {statusLoading
                  ? <ActivityIndicator size="small" color={FLIX2_COLOR} />
                  : isRunning
                    ? <ActivityIndicator size="small" color={FLIX2_COLOR} />
                    : isDone || allIndexed
                      ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" }} />
                      : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#f59e0b" }} />
                }

                <View style={{ flex: 1 }}>
                  {isRunning && buildProgress ? (
                    <>
                      <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
                        Sincronizando {TYPE_LABELS[buildProgress.currentType] ?? buildProgress.currentType}…
                        {buildProgress.typesDone.length > 0 && ` (${buildProgress.typesDone.map(t => TYPE_LABELS[t]).join(", ")} ✓)`}
                      </Text>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 1 }}>
                        {buildProgress.pagesScanned.toLocaleString()} / {buildProgress.totalPages.toLocaleString()} páginas · {progressPct}%
                      </Text>
                    </>
                  ) : isRunning ? (
                    <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>Iniciando sincronização…</Text>
                  ) : isDone ? (
                    <>
                      <Text style={{ color: "#22c55e", fontSize: 11, fontWeight: "700" }}>Índice atualizado!</Text>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 1 }}>
                        {Object.entries(buildProgress!.summary)
                          .map(([t, n]) => `${TYPE_LABELS[t] ?? t}: ${n >= 0 ? n.toLocaleString() : "erro"}`)
                          .join(" · ")}
                      </Text>
                    </>
                  ) : isError ? (
                    <Text style={{ color: "#f87171", fontSize: 11 }}>Erro: {buildProgress?.error}</Text>
                  ) : allIndexed ? (
                    <>
                      <Text style={{ color: "#22c55e", fontSize: 11, fontWeight: "700" }}>
                        {totalCount.toLocaleString()} títulos indexados
                      </Text>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 1 }}>
                        {ageHours < 1 ? "Atualizado há pouco" : `Atualizado há ${ageHours}h`}
                        {indexStatus && ` · ${Object.entries(indexStatus).map(([t,v]) => `${TYPE_LABELS[t]}: ${v.count.toLocaleString()}`).join(" · ")}`}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ color: "#f59e0b", fontSize: 11, fontWeight: "700" }}>Catálogo não indexado</Text>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 1 }}>
                        Sincronize para ativar botão "Assistir" em todo o app
                      </Text>
                    </>
                  )}
                </View>

                <Pressable
                  onPress={() => !isRunning && startBuild()}
                  style={{ flexDirection: "row", alignItems: "center", gap: 5,
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                    backgroundColor: isRunning ? "rgba(255,255,255,0.05)" : `${FLIX2_COLOR}22`,
                    borderWidth: 1, borderColor: isRunning ? "rgba(255,255,255,0.08)" : `${FLIX2_COLOR}55`,
                    opacity: isRunning ? 0.5 : 1 }}>
                  <Feather name={isRunning ? "loader" : "refresh-cw"} size={12} color={FLIX2_COLOR} />
                  <Text style={{ color: FLIX2_COLOR, fontSize: 11, fontWeight: "700" }}>
                    {isRunning ? "Em curso" : allIndexed ? "Reindexar" : "Sincronizar"}
                  </Text>
                </Pressable>
              </View>

              {/* Progress bar */}
              {isRunning && buildProgress && buildProgress.totalPages > 0 && (
                <View style={{ height: 2, backgroundColor: "rgba(255,255,255,0.06)" }}>
                  <View style={{ height: 2, width: `${progressPct}%`, backgroundColor: FLIX2_COLOR, borderRadius: 2 }} />
                </View>
              )}
            </View>
          );
        })()}
      </View>

      {/* Search bar */}
      <View style={{ paddingHorizontal: 12, paddingBottom: 8, paddingTop: 4, backgroundColor: "#0a0a0a" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.06)",
          borderRadius: 10, borderWidth: 1,
          borderColor: search ? `${FLIX2_COLOR}55` : "rgba(255,255,255,0.1)",
          paddingLeft: 12, paddingRight: 6 }}>
          {searching
            ? <ActivityIndicator size="small" color={FLIX2_COLOR} style={{ width: 14 }} />
            : <Feather name="search" size={14} color={search ? FLIX2_COLOR : "rgba(255,255,255,0.4)"} />}
          <TextInput
            style={{ flex: 1, color: "#fff", fontSize: 13, paddingVertical: 10 }}
            placeholder="Buscar em todo o catálogo…"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={search}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <Pressable onPress={() => handleSearchChange("")} style={{ padding: 6 }}>
              <Feather name="x" size={14} color="rgba(255,255,255,0.4)" />
            </Pressable>
          )}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          {totalItems > 0 ? (
            <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>
              {searchQuery
                ? `${totalItems.toLocaleString()} resultado${totalItems !== 1 ? "s" : ""} para "${searchQuery}"`
                : `${totalItems.toLocaleString()} títulos · ${totalPages} página${totalPages !== 1 ? "s" : ""}`}
            </Text>
          ) : <View />}
          {searchQuery && !searching && !loading && (
            <Pressable onPress={() => handleSearchChange("")}>
              <Text style={{ color: FLIX2_COLOR, fontSize: 10, fontWeight: "600" }}>Limpar busca</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator size="large" color={FLIX2_COLOR} />
          <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            {searchQuery ? `Buscando "${searchQuery}"…` : "Carregando catálogo…"}
          </Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 }}>
          <Feather name="wifi-off" size={40} color="rgba(255,255,255,0.2)" />
          <Text style={{ color: "#f87171", fontSize: 14, textAlign: "center" }}>{error}</Text>
          <Pressable
            onPress={() => searchQuery ? runSearch(subType, searchQuery) : fetchItems(subType, 1, false)}
            style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: FLIX2_COLOR }}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 64, gap: 12 }}>
              <Feather name="inbox" size={40} color="rgba(255,255,255,0.15)" />
              <Text style={{ color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
                {searchQuery ? `Nenhum resultado para "${searchQuery}"` : "Nenhum resultado"}
              </Text>
            </View>
          ) : (
            filtered.map((item) => (
              <Flix2Card key={item.id} item={item} onRegister={() => setRegisterTarget(item)} />
            ))
          )}

          {/* Load more */}
          {page < totalPages && (
            <Pressable
              onPress={loadMore}
              disabled={loadingMore}
              style={{ marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: "center",
                backgroundColor: "rgba(139,92,246,0.12)", borderWidth: 1, borderColor: `${FLIX2_COLOR}44` }}>
              {loadingMore
                ? <ActivityIndicator size="small" color={FLIX2_COLOR} />
                : <Text style={{ color: FLIX2_COLOR, fontWeight: "700", fontSize: 13 }}>
                    Carregar mais (pág. {page + 1}/{totalPages})
                  </Text>}
            </Pressable>
          )}
        </ScrollView>
      )}

      {registerTarget && (
        <Flix2RegisterModal item={registerTarget} onClose={() => setRegisterTarget(null)} onDone={() => setRegisterTarget(null)} />
      )}
    </View>
  );
}

function Flix2Card({ item, onRegister }: { item: Flix2Item; onRegister: () => void }) {
  const isMovie = item.type === "filme";
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)", alignItems: "flex-start" }}>
      {/* Poster */}
      <View style={{ width: 64, height: 96, borderRadius: 8, overflow: "hidden", backgroundColor: "#1a1a1a", flexShrink: 0 }}>
        {item.poster ? (
          <Image source={{ uri: item.poster }} style={{ width: 64, height: 96 }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Feather name={isMovie ? "film" : "tv"} size={24} color="rgba(255,255,255,0.2)" />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14, lineHeight: 19 }} numberOfLines={2}>{item.title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 }}>
          <Text style={{ color: FLIX2_COLOR, fontSize: 11, fontWeight: "700" }}>{item.year}</Text>
          <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" }} />
          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>
            {isMovie ? "Filme" : item.type === "anime" ? "Anime" : `Série · ${item.episodes_count} ep`}
          </Text>
          {item.tmdb_id > 0 && (
            <>
              <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" }} />
              <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>TMDB {item.tmdb_id}</Text>
            </>
          )}
        </View>
        {item.genres ? (
          <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 4 }} numberOfLines={1}>{item.genres}</Text>
        ) : null}
        {item.synopsis ? (
          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginTop: 5, lineHeight: 16 }} numberOfLines={2}>{item.synopsis}</Text>
        ) : null}
        <Pressable onPress={onRegister}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingHorizontal: 12, paddingVertical: 7,
            borderRadius: 8, backgroundColor: `${FLIX2_COLOR}20`, borderWidth: 1, borderColor: `${FLIX2_COLOR}44`, alignSelf: "flex-start" }}>
          <Feather name="plus-circle" size={13} color={FLIX2_COLOR} />
          <Text style={{ color: FLIX2_COLOR, fontSize: 12, fontWeight: "700" }}>
            {isMovie ? "Registrar" : `Registrar (${item.episodes_count} ep)`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Flix2RegisterModal({ item, onClose, onDone }: { item: Flix2Item; onClose: () => void; onDone: () => void }) {
  const isMovie = item.type === "filme";
  const episodes = item.episodes ?? [];

  const [label, setLabel] = useState("Dublado HD");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEps, setSelectedEps] = useState<Set<number>>(
    new Set(episodes.map((_, i) => i))
  );

  const tmdbType = isMovie ? "movie" : "tv";

  const toggleEp = (i: number) => {
    setSelectedEps((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  };

  const toggleAll = () => {
    if (selectedEps.size === episodes.length) setSelectedEps(new Set());
    else setSelectedEps(new Set(episodes.map((_, i) => i)));
  };

  const register = async () => {
    setSaving(true);
    setError(null);
    setProgress(0);
    try {
      if (isMovie) {
        await apiPost("/flix2/register", {
          flix2Url: item.stream_url,
          tmdbId: item.tmdb_id,
          tmdbType,
          title: item.title,
          label,
          season: null,
          episode: null,
        });
        setProgress(100);
      } else {
        const toReg = episodes.filter((_, i) => selectedEps.has(i));
        for (let i = 0; i < toReg.length; i++) {
          const ep = toReg[i];
          await apiPost("/flix2/register", {
            flix2Url: ep.stream_url,
            tmdbId: item.tmdb_id,
            tmdbType,
            title: item.title,
            label: `T${String(ep.season).padStart(2, "0")} E${String(ep.episode).padStart(2, "0")} · ${label}`,
            season: ep.season,
            episode: ep.episode,
          });
          setProgress(Math.round(((i + 1) / toReg.length) * 100));
        }
      }
      setDone(true);
    } catch (e: any) { setError(e.message ?? "Erro ao registrar"); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.88)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#0f0f0f", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "90%" }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14, gap: 10 }}>
              <View style={{ width: 40, height: 60, borderRadius: 6, overflow: "hidden", backgroundColor: "#1a1a1a", flexShrink: 0 }}>
                {item.poster ? <Image source={{ uri: item.poster }} style={{ width: 40, height: 60 }} contentFit="cover" /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }} numberOfLines={2}>{item.title}</Text>
                <Text style={{ color: FLIX2_COLOR, fontSize: 12 }}>{item.year} · {isMovie ? "Filme" : `${episodes.length} episódios`}</Text>
              </View>
              <Pressable onPress={onClose}><Feather name="x" size={20} color="rgba(255,255,255,0.5)" /></Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {done ? (
                <View style={{ alignItems: "center", paddingVertical: 32, gap: 12 }}>
                  <Feather name="check-circle" size={48} color="#4ade80" />
                  <Text style={{ color: "#4ade80", fontWeight: "700", fontSize: 18 }}>Registrado!</Text>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, textAlign: "center" }}>
                    {isMovie ? "Filme adicionado ao registry" : `${selectedEps.size} episódios registrados`}
                  </Text>
                  <Pressable onPress={onDone} style={{ paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12, backgroundColor: "#16a34a" }}>
                    <Text style={{ color: "#fff", fontWeight: "700" }}>Fechar</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {/* Label */}
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                    Qualidade / Label
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                    {["Dublado HD", "Dublado 4K", "Legendado HD", "Legendado 4K"].map((l) => (
                      <Pressable key={l} onPress={() => setLabel(l)}
                        style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
                          backgroundColor: label === l ? `${FLIX2_COLOR}22` : "rgba(255,255,255,0.06)",
                          borderWidth: 1, borderColor: label === l ? `${FLIX2_COLOR}55` : "rgba(255,255,255,0.1)" }}>
                        <Text style={{ color: label === l ? FLIX2_COLOR : "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: label === l ? "700" : "400" }}>
                          {l}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Series episode selector */}
                  {!isMovie && episodes.length > 0 && (
                    <>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>
                          Episódios ({selectedEps.size}/{episodes.length})
                        </Text>
                        <Pressable onPress={toggleAll}
                          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.07)" }}>
                          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
                            {selectedEps.size === episodes.length ? "Desmarcar todos" : "Marcar todos"}
                          </Text>
                        </Pressable>
                      </View>
                      <View style={{ borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 14 }}>
                        {episodes.map((ep, i) => (
                          <Pressable key={i} onPress={() => toggleEp(i)}
                            style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10,
                              borderTopWidth: i > 0 ? 1 : 0, borderTopColor: "rgba(255,255,255,0.05)",
                              backgroundColor: selectedEps.has(i) ? `${FLIX2_COLOR}0a` : "transparent" }}>
                            <Feather name={selectedEps.has(i) ? "check-square" : "square"} size={14}
                              color={selectedEps.has(i) ? FLIX2_COLOR : "rgba(255,255,255,0.25)"} />
                            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, width: 52 }}>
                              T{String(ep.season).padStart(2, "0")} E{String(ep.episode).padStart(2, "0")}
                            </Text>
                            <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, flex: 1 }} numberOfLines={1}>
                              {ep.language} · {ep.quality}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Save progress */}
                  {saving && (
                    <View style={{ marginBottom: 12, gap: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <ActivityIndicator size="small" color={FLIX2_COLOR} />
                        <Text style={{ color: FLIX2_COLOR, fontSize: 13 }}>Registrando… {progress}%</Text>
                      </View>
                      <View style={{ height: 4, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                        <View style={{ height: 4, backgroundColor: FLIX2_COLOR, borderRadius: 2, width: `${progress}%` as any }} />
                      </View>
                    </View>
                  )}

                  {error && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8,
                      backgroundColor: "rgba(248,113,113,0.1)", marginBottom: 10 }}>
                      <Feather name="alert-circle" size={14} color="#f87171" />
                      <Text style={{ color: "#f87171", fontSize: 12, flex: 1 }}>{error}</Text>
                    </View>
                  )}

                  <Pressable onPress={register} disabled={saving || (!isMovie && selectedEps.size === 0)}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                      paddingVertical: 14, borderRadius: 12, backgroundColor: FLIX2_COLOR,
                      opacity: (saving || (!isMovie && selectedEps.size === 0)) ? 0.5 : 1 }}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="download-cloud" size={16} color="#fff" />}
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                      {saving ? "Registrando…" : isMovie ? "Registrar Filme" : `Registrar ${selectedEps.size} episódios`}
                    </Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function R2CatalogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { initialSearch } = useLocalSearchParams<{ initialSearch?: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("catalog");
  const [catalogView, setCatalogView] = useState<CatalogView>({ screen: "catalog" });
  const [registerKey, setRegisterKey] = useState<string | null>(null);
  const [registerEp, setRegisterEp] = useState<number | undefined>(undefined);
  const [registered, setRegistered] = useState(0);
  const [editEntry, setEditEntry] = useState<CatalogEntry | null>(null);
  const [apiDomain, setApiDomain] = useState<string>(() => getApiDomainDisplay());

  useEffect(() => {
    const interval = setInterval(() => setApiDomain(getApiDomainDisplay()), 5000);
    return () => clearInterval(interval);
  }, []);

  if (!user || user.role !== "admin") {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: "#000" }]}>
        <Feather name="lock" size={48} color="rgba(255,255,255,0.2)" />
        <Text style={[styles.dim, { marginTop: 16 }]}>Acesso restrito a administradores</Text>
      </View>
    );
  }

  const openRegister = (key: string, ep?: number) => {
    setRegisterKey(key);
    setRegisterEp(ep);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* Header */}
      {catalogView.screen === "catalog" && (
        <View style={[styles.header, { paddingTop: (Platform.OS === "web" ? 0 : insets.top) + 12 }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.headerTitle}>Acervo R2</Text>
            <Text style={styles.headerSub}>Cloudflare R2 · Gestão de conteúdo</Text>
            <Pressable
              onPress={() => Alert.alert(
                "API Server",
                `Domínio ativo:\n${getApiBase() ?? "(não configurado)"}`,
                [{ text: "OK" }]
              )}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}
            >
              <View style={{
                width: 6, height: 6, borderRadius: 3,
                backgroundColor: getApiBase() ? "#22c55e" : "#f59e0b"
              }} />
              <Text numberOfLines={1} style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>
                {apiDomain}
              </Text>
            </Pressable>
          </View>
          <View style={styles.r2Badge}>
            <Feather name="cloud" size={13} color={RED} />
            <Text style={styles.r2BadgeText}>R2</Text>
          </View>
        </View>
      )}

      {/* Tab bar */}
      {catalogView.screen === "catalog" && (
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
          {([
            { id: "catalog", icon: "grid", label: "Catálogo" },
            { id: "upload", icon: "upload-cloud", label: "Upload" },
            { id: "manage", icon: "folder", label: "Gerenciar" },
            { id: "terabox", icon: "package", label: "TeraBox" },
            { id: "flix2", icon: "zap", label: "Flix 2.0" },
          ] as { id: Tab; icon: string; label: string }[]).map((t) => (
            <Pressable key={t.id} style={[styles.tabItem, activeTab === t.id && styles.tabItemActive]} onPress={() => setActiveTab(t.id)}>
              <Feather
                name={t.icon as any}
                size={14}
                color={activeTab === t.id
                  ? t.id === "terabox" ? "#f59e0b" : t.id === "flix2" ? "#8b5cf6" : RED
                  : "rgba(255,255,255,0.4)"}
              />
              <Text style={[styles.tabLabel, activeTab === t.id && {
                color: t.id === "terabox" ? "#f59e0b" : t.id === "flix2" ? "#8b5cf6" : RED,
              }]} numberOfLines={1}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Content */}
      <View style={{ flex: 1 }}>
        {activeTab === "catalog" && catalogView.screen === "catalog" && (
          <CatalogGrid
            onSelect={(entry) => setCatalogView({ screen: "seasons", entry })}
            onRegister={openRegister}
            onEdit={(entry) => setEditEntry(entry)}
            initialSearch={initialSearch}
          />
        )}

        {activeTab === "catalog" && catalogView.screen === "seasons" && (
          <SeasonList
            entry={(catalogView as any).entry}
            onBack={() => setCatalogView({ screen: "catalog" })}
            onSelectSeason={(season) => setCatalogView({ screen: "episodes", entry: (catalogView as any).entry, season })}
            onEdit={(e) => setEditEntry(e)}
          />
        )}

        {activeTab === "catalog" && catalogView.screen === "episodes" && (
          <EpisodeList
            entry={(catalogView as any).entry}
            season={(catalogView as any).season}
            onBack={() => setCatalogView({ screen: "seasons", entry: (catalogView as any).entry })}
            onRegister={openRegister}
          />
        )}

        {activeTab === "upload" && <UploadPanel />}
        {activeTab === "manage" && <ManagePanel onRegister={openRegister} />}
        {activeTab === "terabox" && <TeraBoxPanel />}
        {activeTab === "flix2" && <Flix2Panel />}
      </View>

      {/* Register modal */}
      {registerKey && (
        <RegisterModal
          r2Key={registerKey}
          episode={registerEp}
          onClose={() => { setRegisterKey(null); setRegisterEp(undefined); }}
          onDone={() => {
            setRegisterKey(null);
            setRegisterEp(undefined);
            setRegistered((v) => v + 1);
          }}
        />
      )}

      {/* Edit entry modal */}
      {editEntry && (
        <EditEntryModal
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onDone={(_newName) => {
            setEditEntry(null);
            setRegistered((v) => v + 1);
            setCatalogView({ screen: "catalog" });
          }}
        />
      )}

      {/* Success toast */}
      {registered > 0 && (
        <View style={styles.toast}>
          <Feather name="check-circle" size={16} color="#4ade80" />
          <Text style={styles.toastText}>Salvo! Atualize o catálogo para ver as mudanças.</Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  dim: { color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 1 },
  r2Badge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${RED}18`, borderWidth: 1, borderColor: `${RED}40`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  r2BadgeText: { color: RED, fontSize: 12, fontWeight: "800" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  tabItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, paddingHorizontal: 4 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: RED },
  tabLabel: { color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: "600" },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginVertical: 10, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, color: "#fff", fontSize: 14 },

  posterCard: { width: POSTER_W },
  posterWrap: { width: POSTER_W, height: POSTER_H, borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)", marginBottom: 5 },
  posterImg: { width: "100%", height: "100%" },
  posterPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  posterLoading: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  typeBadge: { position: "absolute", top: 6, left: 6, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  typeBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  registerOverlay: { position: "absolute", bottom: 6, right: 6, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 12, padding: 4 },
  posterTitle: { color: "#fff", fontSize: 11, fontWeight: "600", lineHeight: 15 },

  actionBtn: { backgroundColor: RED, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, paddingHorizontal: 20, borderRadius: 10, marginTop: 12 },
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
  seasonRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  seasonIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(229,9,20,0.15)", alignItems: "center", justifyContent: "center" },
  seasonLabel: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "600" },
  registerSeasonBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.06)" },
  registerSeasonBtnText: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "600" },

  epRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  epNumBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  epNum: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "700" },
  epName: { color: "#fff", fontSize: 13, fontWeight: "500" },
  epMeta: { color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 },

  sectionCard: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  sectionTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  sectionHint: { color: "rgba(255,255,255,0.4)", fontSize: 12, lineHeight: 18, marginBottom: 14 },
  fieldLabel: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "600", marginBottom: 6, letterSpacing: 0.5 },
  input: { backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, color: "#fff", fontSize: 14 },
  progressWrap: { marginTop: 12 },
  progressBar: { height: 6, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: RED, borderRadius: 3 },
  progressText: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 6 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(248,113,113,0.1)", borderWidth: 1, borderColor: "rgba(248,113,113,0.3)", borderRadius: 10, padding: 12, marginTop: 10 },
  errorBoxText: { color: "#f87171", fontSize: 13, flex: 1 },

  breadcrumb: { maxHeight: 40, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  breadcrumbItem: { paddingHorizontal: 6, paddingVertical: 8 },
  breadcrumbSep: { color: "rgba(255,255,255,0.2)", fontSize: 12 },
  breadcrumbText: { color: "rgba(255,255,255,0.6)", fontSize: 12 },

  moveBox: { backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 12, padding: 14, margin: 12 },
  moveTitle: { color: "#fff", fontSize: 13, fontWeight: "600", marginBottom: 10 },

  upRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  upText: { color: "rgba(255,255,255,0.4)", fontSize: 14 },

  fileRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  fileName: { color: "#fff", fontSize: 13, fontWeight: "500" },
  fileMeta: { color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 },
  fileAction: { padding: 8 },

  modalWrap: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  modalTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },

  tmdbResult: { flexDirection: "row", alignItems: "center", padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 10, marginTop: 8, backgroundColor: "rgba(255,255,255,0.04)" },
  tmdbPoster: { width: 44, height: 64, borderRadius: 6 },
  tmdbTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },

  toast: { position: "absolute", bottom: 30, left: 20, right: 20, backgroundColor: "#111827", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#22c55e40" },
  toastText: { color: "#4ade80", fontSize: 13, flex: 1 },
});
