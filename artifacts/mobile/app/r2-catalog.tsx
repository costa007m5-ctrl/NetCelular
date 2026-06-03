import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import { r2Route } from "@/lib/r2-direct";

const UPLOADED_URLS_KEY = "r2_uploaded_urls_v1";

const RED = "#e50914";
const { width: W } = Dimensions.get("window");
const POSTER_W = (W - 48) / 3;
const POSTER_H = POSTER_W * 1.5;
const TMDB_IMG = (path: string | null, size = "w500") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

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
  id: string; r2Key: string; tmdbId: number; tmdbType: "movie" | "tv";
  title: string; label: string; season: number | null; episode: number | null;
}
interface TmdbSearchResult {
  id: number; title: string; poster_path: string | null; media_type: "movie" | "tv";
}

type Tab = "catalog" | "upload" | "manage";
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
      <View style={[styles.subHeader, { paddingTop: insets.top + 12 }]}>
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

function CatalogGrid({ onSelect, onRegister, onEdit }: {
  onSelect: (entry: CatalogEntry) => void;
  onRegister: (key: string) => void;
  onEdit: (entry: CatalogEntry) => void;
}) {
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
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const openMovie = async (entry: CatalogEntry) => {
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
            return (
              <Pressable style={({ pressed }) => [styles.posterCard, pressed && { opacity: 0.8 }]} onPress={() => entry.type === "movie" ? openMovie(entry) : onSelect(entry)}>
                <View style={styles.posterWrap}>
                  {poster ? <Image source={{ uri: poster }} style={styles.posterImg} contentFit="cover" /> : <View style={styles.posterPlaceholder}><Feather name="film" size={28} color="rgba(255,255,255,0.2)" /></View>}
                  <View style={[styles.typeBadge, { backgroundColor: entry.type === "tv" ? "#1a6bb5" : RED }]}>
                    <Text style={styles.typeBadgeText}>{entry.type === "tv" ? "SÉRIE" : "FILME"}</Text>
                  </View>
                  {isBusy && <View style={styles.posterLoading}><ActivityIndicator color="#fff" size="small" /></View>}
                  {/* Edit button overlay */}
                  <Pressable style={[styles.registerOverlay, { right: 28 }]} onPress={() => onEdit(entry)}>
                    <Feather name="edit-2" size={11} color="#fff" />
                  </Pressable>
                  {/* Register button overlay */}
                  <Pressable style={styles.registerOverlay} onPress={() => onRegister(entry.key)}>
                    <Feather name="link" size={12} color="#fff" />
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

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}>
        {/* Via URL */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Feather name="download-cloud" size={18} color={RED} />
            <Text style={styles.sectionTitle}>Baixar via URL para o R2</Text>
          </View>
          <Text style={styles.sectionHint}>Cole a URL do vídeo — o servidor baixa e envia para o R2. Sem limite de tamanho.</Text>

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
        </View>

        {/* Upload em lote */}
        <View style={[styles.sectionCard, { marginTop: 16 }]}>
          <View style={styles.sectionTitleRow}>
            <Feather name="list" size={18} color="#f59e0b" />
            <Text style={[styles.sectionTitle, { color: "#f59e0b" }]}>Upload em lote</Text>
          </View>
          <Text style={styles.sectionHint}>
            Cole as URLs (uma por linha). Escolha quais enviar e toque em iniciar.
          </Text>

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
                    return (
                      <Pressable
                        key={i}
                        onPress={() => !alreadyDone && toggleBulkSelect(i)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          marginBottom: 4,
                          borderRadius: 8,
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
                        </View>
                      </Pressable>
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
        </View>

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
    </>
  );
}

// ── Manage Panel ───────────────────────────────────────────────────────────────

function ManagePanel({ onRegister }: { onRegister: (key: string) => void }) {
  const insets = useSafeAreaInsets();
  const [path, setPath] = useState("");
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movingKey, setMovingKey] = useState<string | null>(null);
  const [movingName, setMovingName] = useState<string>("");
  const [showMovePicker, setShowMovePicker] = useState(false);

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

  return (
    <View style={{ flex: 1 }}>
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
              {/* Actions */}
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
  const [label, setLabel] = useState("Dublado 1080p");
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

          {/* Label */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Rótulo</Text>
          <TextInput
            style={styles.input}
            placeholder="Dublado 1080p"
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

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function R2CatalogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("catalog");
  const [catalogView, setCatalogView] = useState<CatalogView>({ screen: "catalog" });
  const [registerKey, setRegisterKey] = useState<string | null>(null);
  const [registerEp, setRegisterEp] = useState<number | undefined>(undefined);
  const [registered, setRegistered] = useState(0);
  const [editEntry, setEditEntry] = useState<CatalogEntry | null>(null);

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
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.headerTitle}>Acervo R2</Text>
            <Text style={styles.headerSub}>Cloudflare R2 · Gestão de conteúdo</Text>
          </View>
          <View style={styles.r2Badge}>
            <Feather name="cloud" size={13} color={RED} />
            <Text style={styles.r2BadgeText}>R2</Text>
          </View>
        </View>
      )}

      {/* Tab bar */}
      {catalogView.screen === "catalog" && (
        <View style={styles.tabBar}>
          {(["catalog", "upload", "manage"] as Tab[]).map((t) => (
            <Pressable key={t} style={[styles.tabItem, activeTab === t && styles.tabItemActive]} onPress={() => setActiveTab(t)}>
              <Feather
                name={t === "catalog" ? "grid" : t === "upload" ? "upload-cloud" : "folder"}
                size={14}
                color={activeTab === t ? RED : "rgba(255,255,255,0.4)"}
              />
              <Text style={[styles.tabLabel, activeTab === t && { color: RED }]}>
                {t === "catalog" ? "Catálogo" : t === "upload" ? "Upload" : "Gerenciar"}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Content */}
      {activeTab === "catalog" && catalogView.screen === "catalog" && (
        <CatalogGrid
          onSelect={(entry) => setCatalogView({ screen: "seasons", entry })}
          onRegister={openRegister}
          onEdit={(entry) => setEditEntry(entry)}
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
  tabItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: RED },
  tabLabel: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "600" },

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
