import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import WebViewVideoPlayer from "@/components/WebViewVideoPlayer";
import { getApiBase } from "@/lib/api";

// ─── Xtream Codes ────────────────────────────────────────────────────────────
const HUBBY_HOST = "https://hubby.cx";

// Fontedecanais serve HTTPS:443, mas o redirect do hubby.cx no dispositivo gera
// http:// com :80 explícito. Faz upgrade de protocolo + remove porta :80.
// Confirmado pelo usuário: URL https:// do mesmo CDN funciona na web.
function fonteToHttps(url: string): string {
  if (!url.startsWith("http://")) return url;
  return url.replace(/^http:\/\//, "https://").replace(/:80(\/|$|\?)/, (_, s) => s ?? "");
}
const HUBBY_USER = "wowserver-vods";
const HUBBY_PASS = "fUT3Phipaq10huqAPastEmlbr";
const API_BASE = `${HUBBY_HOST}/player_api.php?username=${HUBBY_USER}&password=${HUBBY_PASS}`;

const HUBBY_COLOR = "#3b82f6";

function mkSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

function getVodStreamUrl(id: number | string, ext = "mp4") {
  return `${HUBBY_HOST}/movie/${HUBBY_USER}/${HUBBY_PASS}/${id}.${ext}`;
}

function getSeriesEpUrl(id: number | string, ext = "mp4") {
  return `${HUBBY_HOST}/series/${HUBBY_USER}/${HUBBY_PASS}/${id}.${ext}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface VodItem {
  stream_id: number;
  name: string;
  stream_icon: string;
  rating: string;
  added: string;
  category_id: string;
  container_extension: string;
  direct_source?: string;
}

interface SeriesItem {
  series_id: number;
  name: string;
  cover: string;
  rating: string;
  category_id: string;
  year: string;
  genre: string;
  last_modified: string;
}

interface Category {
  category_id: string;
  category_name: string;
  parent_id: number;
}

interface SeriesEpisode {
  id: string;
  episode_num: number;
  title: string;
  container_extension: string;
  info?: { plot?: string; duration?: string };
}

// ─── LinkTestResult ──────────────────────────────────────────────────────────
interface LinkResult {
  url: string;
  status: number | null;
  contentType: string | null;
  ok: boolean;
  latency: number | null;
  error?: string;
  redirectUrl?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function Admin2Screen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const colors = useColors();

  const topPad = Platform.OS === "web" ? 67 : top;

  type MainTab = "hubby";
  const [activeTab, setActiveTab] = useState<MainTab>("hubby");

  // ── Hubby sub-tabs ──────────────────────────────────────────────────────────
  type HubbySection = "teste" | "filmes" | "series";
  const [hSection, setHSection] = useState<HubbySection>("filmes");

  // ── Shared fetch state ──────────────────────────────────────────────────────
  const [vodItems, setVodItems] = useState<VodItem[]>([]);
  const [seriesItems, setSeriesItems] = useState<SeriesItem[]>([]);
  const [vodCats, setVodCats] = useState<Category[]>([]);
  const [seriesCats, setSeriesCats] = useState<Category[]>([]);

  const [vodLoading, setVodLoading] = useState(false);
  const [vodError, setVodError] = useState<string | null>(null);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);

  const [vodSearch, setVodSearch] = useState("");
  const [seriesSearch, setSeriesSearch] = useState("");
  const [vodCatFilter, setVodCatFilter] = useState("");
  const [seriesCatFilter, setSeriesCatFilter] = useState("");

  const [vodPage, setVodPage] = useState(1);
  const [seriesPage, setSeriesPage] = useState(1);
  const PAGE_SIZE = 60;

  // ── Edit / patches ──────────────────────────────────────────────────────────
  type HubbyEditTarget = { kind: "vod"; item: VodItem } | { kind: "series"; item: SeriesItem };
  const [editTarget, setEditTarget] = useState<HubbyEditTarget | null>(null);
  const [patches, setPatches] = useState<Record<string, { tmdbId?: number; tmdbType?: string; audioType?: string; posterPath?: string }>>({});

  // ── Bulk auto-link ───────────────────────────────────────────────────────────
  const [bulkLink, setBulkLink] = useState<{
    active: boolean; type: "vod" | "series";
    done: number; total: number; saved: number; current: string;
  } | null>(null);
  const bulkCancelRef = useRef(false);

  const runBulkLink = async (type: "vod" | "series", unlinked: Array<{ id: string | number; name: string; patchId: string }>) => {
    if (unlinked.length === 0) return;
    const base = getApiBase();
    const tmdbType = type === "vod" ? "movie" : "tv";
    bulkCancelRef.current = false;
    setBulkLink({ active: true, type, done: 0, total: unlinked.length, saved: 0, current: "" });
    let saved = 0;
    for (let i = 0; i < unlinked.length; i++) {
      if (bulkCancelRef.current) break;
      const { name, patchId } = unlinked[i];
      setBulkLink((prev) => prev ? { ...prev, done: i, current: name } : null);
      try {
        const res = await fetch(`${base}/r2/tmdb-search?q=${encodeURIComponent(name)}&type=${tmdbType}`);
        if (res.ok) {
          const data = await res.json();
          const hit = data.results?.[0];
          if (hit) {
            const body = { flix2Id: patchId, tmdbId: hit.id, tmdbType, ...(hit.poster_path ? { posterPath: hit.poster_path } : {}) };
            await fetch(`${base}/r2/flix2/item-patch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            saved++;
            setPatches((prev) => ({ ...prev, [patchId]: { ...prev[patchId], tmdbId: hit.id, tmdbType, posterPath: hit.poster_path ?? undefined } }));
          }
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 280));
    }
    setBulkLink((prev) => prev ? { ...prev, active: false, done: unlinked.length, saved } : null);
  };
  const hubbyPatchId = (t: HubbyEditTarget) =>
    t.kind === "vod" ? `hubby_vod_${t.item.stream_id}` : `hubby_ser_${t.item.series_id}`;

  const loadPatches = async () => {
    try {
      const base = getApiBase();
      const res = await fetch(`${base}/r2/flix2/item-patches`);
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, any> = {};
        for (const p of (data.patches ?? [])) map[String(p.flix2Id)] = p;
        setPatches(map);
        // Enrich patches that have tmdbId but no posterPath (background, one-time)
        const toEnrich = (data.patches ?? []).filter((p: any) => p.tmdbId && !p.posterPath);
        for (const p of toEnrich) {
          const type = p.tmdbType === "movie" ? "movie" : "tv";
          fetch(`${base}/tmdb/${type}/${p.tmdbId}`)
            .then((r) => r.json())
            .then((d) => {
              const pp: string | null = d?.poster_path ?? null;
              if (pp) {
                setPatches((prev) => ({ ...prev, [String(p.flix2Id)]: { ...prev[String(p.flix2Id)], posterPath: pp } }));
                fetch(`${base}/r2/flix2/item-patch`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ flix2Id: p.flix2Id, posterPath: pp }),
                }).catch(() => {});
              }
            })
            .catch(() => {});
        }
      }
    } catch {}
  };

  // ── Selected item detail ────────────────────────────────────────────────────
  const [selectedVod, setSelectedVod] = useState<VodItem | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<SeriesItem | null>(null);
  const [seriesEpisodes, setSeriesEpisodes] = useState<{ season: string; eps: SeriesEpisode[] }[]>([]);
  const [seriesEpLoading, setSeriesEpLoading] = useState(false);

  // ── Video player ────────────────────────────────────────────────────────────
  const [playerVisible, setPlayerVisible] = useState(false);
  const [playerUrl, setPlayerUrl] = useState("");
  const [playerTitle, setPlayerTitle] = useState("");
  const [playerError, setPlayerError] = useState<string | null>(null);

  // ── Link tester ─────────────────────────────────────────────────────────────
  const [linkInput, setLinkInput] = useState("");
  const [linkTesting, setLinkTesting] = useState(false);
  const [linkResults, setLinkResults] = useState<LinkResult[]>([]);

  // ── Video tester ─────────────────────────────────────────────────────────────
  const [videoInput, setVideoInput] = useState("");

  // ─── Data fetching ──────────────────────────────────────────────────────────
  const fetchVod = useCallback(async () => {
    if (vodLoading) return;
    setVodLoading(true);
    setVodError(null);
    try {
      const [catRes, vodRes] = await Promise.all([
        fetch(`${API_BASE}&action=get_vod_categories`, { signal: mkSignal(30000) }),
        fetch(`${API_BASE}&action=get_vod_streams`, { signal: mkSignal(60000) }),
      ]);
      if (!catRes.ok) throw new Error(`Categories: HTTP ${catRes.status}`);
      if (!vodRes.ok) throw new Error(`VOD: HTTP ${vodRes.status}`);
      const cats: Category[] = await catRes.json();
      const items: VodItem[] = await vodRes.json();
      setVodCats(cats);
      setVodItems(items);
    } catch (e: any) {
      setVodError(e.message ?? "Erro ao carregar filmes");
    } finally {
      setVodLoading(false);
    }
  }, [vodLoading]);

  const fetchSeries = useCallback(async () => {
    if (seriesLoading) return;
    setSeriesLoading(true);
    setSeriesError(null);
    try {
      const [catRes, serRes] = await Promise.all([
        fetch(`${API_BASE}&action=get_series_categories`, { signal: mkSignal(30000) }),
        fetch(`${API_BASE}&action=get_series`, { signal: mkSignal(60000) }),
      ]);
      if (!catRes.ok) throw new Error(`Categories: HTTP ${catRes.status}`);
      if (!serRes.ok) throw new Error(`Series: HTTP ${serRes.status}`);
      const cats: Category[] = await catRes.json();
      const items: SeriesItem[] = await serRes.json();
      setSeriesCats(cats);
      setSeriesItems(items);
    } catch (e: any) {
      setSeriesError(e.message ?? "Erro ao carregar séries");
    } finally {
      setSeriesLoading(false);
    }
  }, [seriesLoading]);

  const fetchSeriesEpisodes = useCallback(async (seriesId: number, attempt = 0) => {
    setSeriesEpLoading(true);
    if (attempt === 0) setSeriesEpisodes([]);
    try {
      // Estratégia: API proxy primeiro (funciona em todos os ambientes sem problema
      // de redirect HTTP). Fallback direto ao Xtream apenas no native se proxy falhar.
      let json: any;
      let proxyOk = false;
      try {
        const apiBase = getApiBase();
        const res = await fetch(`${apiBase}/r2/flix2/admin-series-info?seriesId=${seriesId}`, { signal: mkSignal(15000) });
        if (res.ok) { json = await res.json(); proxyOk = true; }
      } catch {}

      if (!proxyOk && Platform.OS !== "web") {
        // Fallback nativo: chama Xtream diretamente (sem CORS no native)
        const res = await fetch(`${API_BASE}&action=get_series_info&series_id=${seriesId}`, { signal: mkSignal(25000) });
        if (!res.ok) throw new Error(`Xtream HTTP ${res.status}`);
        json = await res.json();
      }

      if (!json) throw new Error("Sem dados do servidor");
      const eps = json.episodes ?? {};

      // Retry se episódios vazios — proxy pode ter retornado 200 com body vazio
      // por race condition de domain (initApiDomain ainda não terminou)
      if (Object.keys(eps).length === 0 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 3000));
        return fetchSeriesEpisodes(seriesId, attempt + 1);
      }

      const seasons: { season: string; eps: SeriesEpisode[] }[] = Object.entries(eps)
        .map(([s, epArr]) => ({ season: s, eps: epArr as SeriesEpisode[] }))
        .sort((a, b) => Number(a.season) - Number(b.season));
      setSeriesEpisodes(seasons);
    } catch (err: any) {
      console.error("[admin2] fetchSeriesEpisodes error:", err?.message ?? err);
      // Retry on network error (domain race condition)
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 3000));
        return fetchSeriesEpisodes(seriesId, attempt + 1);
      }
    } finally {
      setSeriesEpLoading(false);
    }
  }, []);

  // ── Load filmes on first visit ──────────────────────────────────────────────
  useEffect(() => {
    if (hSection === "filmes" && vodItems.length === 0 && !vodLoading) fetchVod();
    if (hSection === "series" && seriesItems.length === 0 && !seriesLoading) fetchSeries();
  }, [hSection]);

  useEffect(() => { loadPatches(); }, []);

  // ─── Filtered lists ─────────────────────────────────────────────────────────
  const filteredVod = vodItems.filter((v) => {
    const q = vodSearch.toLowerCase();
    const matchQ = !q || v.name?.toLowerCase().includes(q);
    const matchCat = !vodCatFilter || v.category_id === vodCatFilter;
    return matchQ && matchCat;
  });

  const filteredSeries = seriesItems.filter((s) => {
    const q = seriesSearch.toLowerCase();
    const matchQ = !q || s.name?.toLowerCase().includes(q);
    const matchCat = !seriesCatFilter || s.category_id === seriesCatFilter;
    return matchQ && matchCat;
  });

  const vodPageItems = filteredVod.slice(0, vodPage * PAGE_SIZE);
  const seriesPageItems = filteredSeries.slice(0, seriesPage * PAGE_SIZE);

  // ─── Link tester (via API proxy — avoids browser CORS) ─────────────────────
  const testLink = useCallback(async (url: string) => {
    if (!url.trim()) return;
    setLinkTesting(true);
    const result: LinkResult = {
      url: url.trim(),
      status: null, contentType: null, ok: false, latency: null,
    };
    try {
      const t = Date.now();
      // Sempre usa proxy do API server (evita problema de redirect HTTPS→HTTP no Android).
      // Fallback: HEAD direto apenas no native se o proxy não estiver disponível.
      const base = getApiBase();
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 15000);
      let usedProxy = false;
      try {
        const res = await fetch(
          `${base}/admin/check-link?url=${encodeURIComponent(url.trim())}`,
          { signal: ctrl.signal }
        );
        const json = await res.json().catch(() => null);
        if (json) {
          usedProxy = true;
          result.status = json.status;
          result.contentType = json.contentType;
          result.ok = !!json.ok;
          result.latency = json.latency ?? null;
          if (json.location) result.redirectUrl = json.location;
          if (json.error) result.error = json.error;
        }
      } catch {}

      if (!usedProxy && Platform.OS !== "web") {
        // Fallback nativo direto
        const ctrl2 = new AbortController();
        setTimeout(() => ctrl2.abort(), 15000);
        const res = await fetch(url.trim(), {
          method: "GET",
          signal: ctrl2.signal,
          headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36" },
        });
        result.status = res.status;
        result.contentType = res.headers.get("content-type");
        result.ok = res.ok;
        result.latency = Date.now() - t;
      } else if (!usedProxy) {
        result.error = "Proxy indisponível";
      }
    } catch (e: any) {
      result.error = e.message ?? "Falha na requisição";
    }
    setLinkResults((prev) => [result, ...prev.slice(0, 9)]);
    setLinkTesting(false);
  }, []);

  // ─── Open player ────────────────────────────────────────────────────────────
  // O servidor fontedecanais aceita HTTPS na porta 443, mas o redirect do hubby.cx
  // no dispositivo gera http:// com :80. Basta upgrade de protocolo — sem proxy.
  const openPlayer = useCallback(async (url: string, title: string) => {
    const base = getApiBase();
    let playUrl = url;
    const isHubbyCxStream = url.includes("hubby.cx/movie/") || url.includes("hubby.cx/series/") || url.includes("hubby.cx/live/");
    if (isHubbyCxStream) {
      // Para hubby.cx: tenta check-link para obter URL fontedecanais via redirect.
      // O servidor (IP datacenter) recebe 200 direto do hubby.cx — sem redirect.
      // Fallback: stream proxy (HTTPS) que serve o vídeo via servidor.
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(`${base}/admin/check-link?url=${encodeURIComponent(url)}`, { signal: ctrl.signal });
        if (res.ok) {
          const data = await res.json();
          if (data.location && data.location !== url) {
            playUrl = fonteToHttps(data.location);
          } else {
            playUrl = `${base}/stream/proxy?url=${encodeURIComponent(url)}`;
          }
        } else {
          playUrl = `${base}/stream/proxy?url=${encodeURIComponent(url)}`;
        }
      } catch {
        playUrl = `${base}/stream/proxy?url=${encodeURIComponent(url)}`;
      }
    }

    // O servidor fontedecanais suporta HTTPS:443 — upgrade direto http→https + remove :80.
    // Android 13+ ignora mixedContentMode="always"; proxy de servidor só como último recurso.
    if (Platform.OS !== "web" && playUrl.startsWith("http://")) {
      const upgraded = fonteToHttps(playUrl);
      // Se a URL parece ser de um CDN conhecido que suporta HTTPS, usa direto.
      // Caso contrário, stream proxy como segurança.
      const knownHttpsCdn = ["72yrci50ppqp71.com", "fontedecanais.me", "cineveo.lat"].some(
        (h) => upgraded.includes(h)
      );
      playUrl = knownHttpsCdn ? upgraded : `${base}/stream/proxy?url=${encodeURIComponent(playUrl)}`;
    }

    setPlayerError(null);
    setPlayerUrl(playUrl);
    setPlayerTitle(title);
    setPlayerVisible(true);
  }, []);

  const copyText = (t: string) => {
    if (Platform.OS === "web") {
      navigator.clipboard?.writeText(t).catch(() => {});
    } else {
      try { (require("react-native").Clipboard as any).setString(t); } catch {}
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 8 }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: HUBBY_COLOR }} />
          <Text style={s.headerTitle}>Admin 2.0</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Main tab bar — plain View (no ScrollView, avoids flex-expand bug on web) */}
      <View style={[s.tabsRow, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => setActiveTab("hubby")}
          style={[s.tab, activeTab === "hubby" && { borderBottomColor: HUBBY_COLOR, borderBottomWidth: 2 }]}
        >
          <Feather name="server" size={14} color={activeTab === "hubby" ? HUBBY_COLOR : colors.mutedForeground} />
          <Text style={[s.tabTxt, { color: activeTab === "hubby" ? HUBBY_COLOR : colors.mutedForeground }]}>
            Hubby
          </Text>
        </Pressable>
      </View>

      {/* ── HUBBY TAB ──────────────────────────────────────────────────────── */}
      {activeTab === "hubby" && (
        <View style={{ flex: 1 }}>
          {/* Hubby sub-tab bar */}
          <View style={[s.subTabRow, { borderBottomColor: colors.border }]}>
            {([
              { key: "filmes", icon: "film", label: `Filmes${vodItems.length > 0 ? ` (${vodItems.length.toLocaleString()})` : ""}` },
              { key: "series", icon: "tv", label: `Séries${seriesItems.length > 0 ? ` (${seriesItems.length.toLocaleString()})` : ""}` },
              { key: "teste", icon: "tool", label: "Testes" },
            ] as { key: HubbySection; icon: any; label: string }[]).map(({ key, icon, label }) => {
              const isActive = hSection === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    setHSection(key);
                    if (key === "filmes" && vodItems.length === 0) fetchVod();
                    if (key === "series" && seriesItems.length === 0) fetchSeries();
                  }}
                  style={[s.subTab, isActive && { borderBottomColor: HUBBY_COLOR, borderBottomWidth: 2 }]}
                >
                  <Feather name={icon} size={13} color={isActive ? HUBBY_COLOR : colors.mutedForeground} />
                  <Text style={[s.subTabTxt, { color: isActive ? HUBBY_COLOR : colors.mutedForeground }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* ── FILMES ───────────────────────────────────────────────────── */}
          {hSection === "filmes" && (
            <View style={{ flex: 1 }}>
              {vodLoading && vodItems.length === 0 ? (
                <View style={s.center}>
                  <ActivityIndicator size="large" color={HUBBY_COLOR} />
                  <Text style={[s.loadTxt, { color: colors.mutedForeground }]}>
                    Carregando catálogo hubby.cx…
                  </Text>
                </View>
              ) : vodError ? (
                <View style={s.center}>
                  <Feather name="alert-circle" size={32} color="#ef4444" />
                  <Text style={[s.errTxt, { color: "#ef4444" }]}>{vodError}</Text>
                  <Pressable onPress={fetchVod} style={[s.retryBtn, { backgroundColor: HUBBY_COLOR }]}>
                    <Text style={{ color: "#fff", fontWeight: "700" }}>Tentar novamente</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {/* Search + category filter */}
                  <View style={[s.filterRow, { backgroundColor: colors.background }]}>
                    <View style={[s.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Feather name="search" size={14} color={colors.mutedForeground} />
                      <TextInput
                        style={[s.searchInput, { color: colors.foreground }]}
                        placeholder="Buscar filme…"
                        placeholderTextColor={colors.mutedForeground}
                        value={vodSearch}
                        onChangeText={(t) => { setVodSearch(t); setVodPage(1); }}
                      />
                      {vodSearch.length > 0 && (
                        <Pressable onPress={() => setVodSearch("")}>
                          <Feather name="x" size={14} color={colors.mutedForeground} />
                        </Pressable>
                      )}
                    </View>
                  </View>

                  {/* Category pills */}
                  {vodCats.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 40 }}
                      contentContainerStyle={{ paddingHorizontal: 14, gap: 6, flexDirection: "row", alignItems: "center" }}>
                      <Pressable
                        onPress={() => { setVodCatFilter(""); setVodPage(1); }}
                        style={[s.pill, !vodCatFilter && { backgroundColor: HUBBY_COLOR }]}
                      >
                        <Text style={[s.pillTxt, { color: !vodCatFilter ? "#fff" : colors.mutedForeground }]}>
                          Todas ({vodItems.length.toLocaleString()})
                        </Text>
                      </Pressable>
                      {vodCats.slice(0, 30).map((cat) => (
                        <Pressable
                          key={cat.category_id}
                          onPress={() => { setVodCatFilter(cat.category_id); setVodPage(1); }}
                          style={[s.pill, vodCatFilter === cat.category_id && { backgroundColor: HUBBY_COLOR }]}
                        >
                          <Text style={[s.pillTxt, { color: vodCatFilter === cat.category_id ? "#fff" : colors.mutedForeground }]}>
                            {cat.category_name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}

                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 6 }}>
                    <Text style={[s.countTxt, { color: colors.mutedForeground, paddingHorizontal: 0, paddingVertical: 0 }]}>
                      {filteredVod.length.toLocaleString()} resultados
                      {vodCatFilter ? ` · ${vodCats.find(c => c.category_id === vodCatFilter)?.category_name}` : ""}
                      {(() => { const n = filteredVod.filter(i => !patches[`hubby_vod_${i.stream_id}`]?.tmdbId).length; return n > 0 ? ` · ${n} sem TMDB` : ""; })()}
                    </Text>
                    {!bulkLink?.active && filteredVod.some(i => !patches[`hubby_vod_${i.stream_id}`]?.tmdbId) && (
                      <Pressable
                        onPress={() => runBulkLink("vod", filteredVod.filter(i => !patches[`hubby_vod_${i.stream_id}`]?.tmdbId).map(i => ({ id: i.stream_id, name: i.name, patchId: `hubby_vod_${i.stream_id}` })))}
                        style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: "#f59e0b22", borderWidth: 1, borderColor: "#f59e0b55" }}
                      >
                        <Feather name="zap" size={11} color="#f59e0b" />
                        <Text style={{ color: "#f59e0b", fontSize: 11, fontWeight: "700" }}>Vincular Todos</Text>
                      </Pressable>
                    )}
                  </View>

                  <FlatList
                    data={vodPageItems}
                    keyExtractor={(item) => String(item.stream_id)}
                    numColumns={3}
                    style={{ flex: 1 }}
                    contentContainerStyle={s.flatGrid}
                    columnWrapperStyle={s.flatRow}
                    initialNumToRender={18}
                    maxToRenderPerBatch={18}
                    windowSize={5}
                    removeClippedSubviews
                    onEndReachedThreshold={0.4}
                    onEndReached={() => {
                      if (vodPageItems.length < filteredVod.length) setVodPage((p) => p + 1);
                    }}
                    ListFooterComponent={
                      vodPageItems.length < filteredVod.length ? (
                        <Pressable
                          onPress={() => setVodPage((p) => p + 1)}
                          style={[s.loadMoreBtn, { borderColor: HUBBY_COLOR, marginTop: 4 }]}
                        >
                          <Text style={{ color: HUBBY_COLOR, fontWeight: "700" }}>
                            + Carregar mais ({filteredVod.length - vodPageItems.length} restantes)
                          </Text>
                        </Pressable>
                      ) : <View style={{ height: 80 }} />
                    }
                    renderItem={({ item }) => {
                      const pid = `hubby_vod_${item.stream_id}`;
                      const patch = patches[pid];
                      const AC: Record<string, string> = { dublado: "#3b82f6", legendado: "#f59e0b", dual: "#10b981" };
                      const AL: Record<string, string> = { dublado: "DUB", legendado: "LEG", dual: "DUAL" };
                      return (
                        <View style={{ flex: 1, maxWidth: "33%" }}>
                          <Pressable
                            style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, maxWidth: "100%", flex: 1 }]}
                            onPress={() => setSelectedVod(item)}
                          >
                            <Image source={{ uri: patch?.posterPath ? `https://image.tmdb.org/t/p/w342${patch.posterPath}` : item.stream_icon }} style={s.cardPoster} contentFit="cover" onError={() => {}} />
                            {!patch?.tmdbId && (
                              <View style={{ position: "absolute", top: 4, left: 4, backgroundColor: "#f59e0bcc", borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1 }}>
                                <Text style={{ color: "#000", fontSize: 7, fontWeight: "800" }}>SEM TMDB</Text>
                              </View>
                            )}
                            <View style={s.cardInfo}>
                              <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{item.name}</Text>
                              {patch?.audioType ? (
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                                  <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3,
                                    backgroundColor: `${AC[patch.audioType] ?? "#888"}22`, borderWidth: 1, borderColor: `${AC[patch.audioType] ?? "#888"}44` }}>
                                    <Text style={{ color: AC[patch.audioType] ?? "#888", fontSize: 8, fontWeight: "700" }}>{AL[patch.audioType] ?? patch.audioType}</Text>
                                  </View>
                                  {patch.tmdbId && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#8b5cf6" }} />}
                                </View>
                              ) : item.rating ? (
                                <Text style={[s.cardSub, { color: HUBBY_COLOR }]}>⭐ {item.rating}</Text>
                              ) : null}
                              <Text style={[s.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                                ID: {item.stream_id} · {item.container_extension?.toUpperCase()}
                              </Text>
                            </View>
                          </Pressable>
                          <Pressable onPress={() => setEditTarget({ kind: "vod", item })}
                            style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11,
                              backgroundColor: "#8b5cf6ee", alignItems: "center", justifyContent: "center" }}>
                            <Feather name="edit-2" size={10} color="#fff" />
                          </Pressable>
                        </View>
                      );
                    }}
                  />
                </>
              )}
            </View>
          )}

          {/* ── SÉRIES ───────────────────────────────────────────────────── */}
          {hSection === "series" && (
            <View style={{ flex: 1 }}>
              {seriesLoading && seriesItems.length === 0 ? (
                <View style={s.center}>
                  <ActivityIndicator size="large" color={HUBBY_COLOR} />
                  <Text style={[s.loadTxt, { color: colors.mutedForeground }]}>
                    Carregando séries hubby.cx…
                  </Text>
                </View>
              ) : seriesError ? (
                <View style={s.center}>
                  <Feather name="alert-circle" size={32} color="#ef4444" />
                  <Text style={[s.errTxt, { color: "#ef4444" }]}>{seriesError}</Text>
                  <Pressable onPress={fetchSeries} style={[s.retryBtn, { backgroundColor: HUBBY_COLOR }]}>
                    <Text style={{ color: "#fff", fontWeight: "700" }}>Tentar novamente</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <View style={[s.filterRow, { backgroundColor: colors.background }]}>
                    <View style={[s.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Feather name="search" size={14} color={colors.mutedForeground} />
                      <TextInput
                        style={[s.searchInput, { color: colors.foreground }]}
                        placeholder="Buscar série…"
                        placeholderTextColor={colors.mutedForeground}
                        value={seriesSearch}
                        onChangeText={(t) => { setSeriesSearch(t); setSeriesPage(1); }}
                      />
                      {seriesSearch.length > 0 && (
                        <Pressable onPress={() => setSeriesSearch("")}>
                          <Feather name="x" size={14} color={colors.mutedForeground} />
                        </Pressable>
                      )}
                    </View>
                  </View>

                  {seriesCats.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 40 }}
                      contentContainerStyle={{ paddingHorizontal: 14, gap: 6, flexDirection: "row", alignItems: "center" }}>
                      <Pressable
                        onPress={() => { setSeriesCatFilter(""); setSeriesPage(1); }}
                        style={[s.pill, !seriesCatFilter && { backgroundColor: HUBBY_COLOR }]}
                      >
                        <Text style={[s.pillTxt, { color: !seriesCatFilter ? "#fff" : colors.mutedForeground }]}>
                          Todas ({seriesItems.length.toLocaleString()})
                        </Text>
                      </Pressable>
                      {seriesCats.slice(0, 30).map((cat) => (
                        <Pressable
                          key={cat.category_id}
                          onPress={() => { setSeriesCatFilter(cat.category_id); setSeriesPage(1); }}
                          style={[s.pill, seriesCatFilter === cat.category_id && { backgroundColor: HUBBY_COLOR }]}
                        >
                          <Text style={[s.pillTxt, { color: seriesCatFilter === cat.category_id ? "#fff" : colors.mutedForeground }]}>
                            {cat.category_name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}

                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 6 }}>
                    <Text style={[s.countTxt, { color: colors.mutedForeground, paddingHorizontal: 0, paddingVertical: 0 }]}>
                      {filteredSeries.length.toLocaleString()} resultados
                      {(() => { const n = filteredSeries.filter(i => !patches[`hubby_ser_${i.series_id}`]?.tmdbId).length; return n > 0 ? ` · ${n} sem TMDB` : ""; })()}
                    </Text>
                    {!bulkLink?.active && filteredSeries.some(i => !patches[`hubby_ser_${i.series_id}`]?.tmdbId) && (
                      <Pressable
                        onPress={() => runBulkLink("series", filteredSeries.filter(i => !patches[`hubby_ser_${i.series_id}`]?.tmdbId).map(i => ({ id: i.series_id, name: i.name, patchId: `hubby_ser_${i.series_id}` })))}
                        style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: "#f59e0b22", borderWidth: 1, borderColor: "#f59e0b55" }}
                      >
                        <Feather name="zap" size={11} color="#f59e0b" />
                        <Text style={{ color: "#f59e0b", fontSize: 11, fontWeight: "700" }}>Vincular Todos</Text>
                      </Pressable>
                    )}
                  </View>

                  <FlatList
                    data={seriesPageItems}
                    keyExtractor={(item) => String(item.series_id)}
                    numColumns={3}
                    style={{ flex: 1 }}
                    contentContainerStyle={s.flatGrid}
                    columnWrapperStyle={s.flatRow}
                    initialNumToRender={18}
                    maxToRenderPerBatch={18}
                    windowSize={5}
                    removeClippedSubviews
                    onEndReachedThreshold={0.4}
                    onEndReached={() => {
                      if (seriesPageItems.length < filteredSeries.length) setSeriesPage((p) => p + 1);
                    }}
                    ListFooterComponent={
                      seriesPageItems.length < filteredSeries.length ? (
                        <Pressable
                          onPress={() => setSeriesPage((p) => p + 1)}
                          style={[s.loadMoreBtn, { borderColor: HUBBY_COLOR, marginTop: 4 }]}
                        >
                          <Text style={{ color: HUBBY_COLOR, fontWeight: "700" }}>
                            + Carregar mais ({filteredSeries.length - seriesPageItems.length} restantes)
                          </Text>
                        </Pressable>
                      ) : <View style={{ height: 80 }} />
                    }
                    renderItem={({ item }) => {
                      const pid = `hubby_ser_${item.series_id}`;
                      const patch = patches[pid];
                      const AC: Record<string, string> = { dublado: "#3b82f6", legendado: "#f59e0b", dual: "#10b981" };
                      const AL: Record<string, string> = { dublado: "DUB", legendado: "LEG", dual: "DUAL" };
                      return (
                        <View style={{ flex: 1, maxWidth: "33%" }}>
                          <Pressable
                            style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, maxWidth: "100%", flex: 1 }]}
                            onPress={() => { setSelectedSeries(item); fetchSeriesEpisodes(item.series_id); }}
                          >
                            <Image source={{ uri: patch?.posterPath ? `https://image.tmdb.org/t/p/w342${patch.posterPath}` : item.cover }} style={s.cardPoster} contentFit="cover" onError={() => {}} />
                            {!patch?.tmdbId && (
                              <View style={{ position: "absolute", top: 4, left: 4, backgroundColor: "#f59e0bcc", borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1 }}>
                                <Text style={{ color: "#000", fontSize: 7, fontWeight: "800" }}>SEM TMDB</Text>
                              </View>
                            )}
                            <View style={s.cardInfo}>
                              <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{item.name}</Text>
                              {patch?.audioType ? (
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                                  <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3,
                                    backgroundColor: `${AC[patch.audioType] ?? "#888"}22`, borderWidth: 1, borderColor: `${AC[patch.audioType] ?? "#888"}44` }}>
                                    <Text style={{ color: AC[patch.audioType] ?? "#888", fontSize: 8, fontWeight: "700" }}>{AL[patch.audioType] ?? patch.audioType}</Text>
                                  </View>
                                  {patch.tmdbId && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#8b5cf6" }} />}
                                </View>
                              ) : item.rating ? (
                                <Text style={[s.cardSub, { color: HUBBY_COLOR }]}>⭐ {item.rating}</Text>
                              ) : null}
                              {item.year ? (
                                <Text style={[s.cardSub, { color: colors.mutedForeground }]}>{item.year}</Text>
                              ) : null}
                            </View>
                          </Pressable>
                          <Pressable onPress={() => setEditTarget({ kind: "series", item })}
                            style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11,
                              backgroundColor: "#8b5cf6ee", alignItems: "center", justifyContent: "center" }}>
                            <Feather name="edit-2" size={10} color="#fff" />
                          </Pressable>
                        </View>
                      );
                    }}
                  />
                </>
              )}
            </View>
          )}

          {/* ── TESTES ───────────────────────────────────────────────────── */}
          {hSection === "teste" && (
            <ScrollView contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: 80 }}>

              {/* Credenciais */}
              <View style={[s.infoCard, { backgroundColor: HUBBY_COLOR + "15", borderColor: HUBBY_COLOR + "40" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Feather name="server" size={15} color={HUBBY_COLOR} />
                  <Text style={{ color: HUBBY_COLOR, fontWeight: "700", fontSize: 13 }}>Credenciais Hubby</Text>
                </View>
                {[
                  { label: "Host", value: HUBBY_HOST },
                  { label: "Username", value: HUBBY_USER },
                  { label: "Password", value: HUBBY_PASS },
                  { label: "M3U", value: `${HUBBY_HOST}/get.php?username=${HUBBY_USER}&password=${HUBBY_PASS}&type=m3u_plus&output=ts` },
                ].map((row) => (
                  <Pressable
                    key={row.label}
                    onPress={() => copyText(row.value)}
                    style={{ flexDirection: "row", marginBottom: 6, gap: 8 }}
                  >
                    <Text style={{ color: HUBBY_COLOR, fontSize: 12, fontWeight: "600", width: 72 }}>{row.label}</Text>
                    <Text style={{ color: "#aaa", fontSize: 11, flex: 1, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                      numberOfLines={1}>{row.value}</Text>
                    <Feather name="copy" size={12} color={HUBBY_COLOR} />
                  </Pressable>
                ))}
              </View>

              {/* Teste de Link */}
              <View>
                <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>TESTE DE LINK</Text>
                <Text style={[s.sectionDesc, { color: colors.mutedForeground }]}>
                  Verifica acessibilidade de uma URL (HEAD request) — mostra status HTTP, Content-Type e redirect.
                </Text>
                <View style={[s.searchWrap, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 10 }]}>
                  <Feather name="link" size={14} color={colors.mutedForeground} />
                  <TextInput
                    style={[s.searchInput, { color: colors.foreground }]}
                    placeholder="https://hubby.cx/movie/…"
                    placeholderTextColor={colors.mutedForeground}
                    value={linkInput}
                    onChangeText={setLinkInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onSubmitEditing={() => testLink(linkInput)}
                  />
                </View>

                {/* Quick-fill buttons */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, marginBottom: 10 }}>
                  {[
                    { label: "Filme #1", url: getVodStreamUrl(644196) },
                    { label: "M3U", url: `${HUBBY_HOST}/get.php?username=${HUBBY_USER}&password=${HUBBY_PASS}&type=m3u_plus&output=ts` },
                    { label: "API Status", url: `${API_BASE}&action=get_server_info` },
                  ].map(({ label, url }) => (
                    <Pressable
                      key={label}
                      onPress={() => setLinkInput(url)}
                      style={[s.pill, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <Text style={[s.pillTxt, { color: colors.foreground }]}>{label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Pressable
                  onPress={() => testLink(linkInput)}
                  disabled={linkTesting || !linkInput.trim()}
                  style={[s.actionBtn, { backgroundColor: HUBBY_COLOR, opacity: linkInput.trim() ? 1 : 0.5 }]}
                >
                  {linkTesting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <><Feather name="wifi" size={15} color="#fff" /><Text style={s.actionBtnTxt}>Testar Link</Text></>
                  }
                </Pressable>

                {/* Results */}
                {linkResults.map((r, i) => (
                  <View key={i} style={[s.resultCard, {
                    backgroundColor: r.ok ? "#16a34a12" : "#ef444412",
                    borderColor: r.ok ? "#16a34a40" : "#ef444440",
                    marginTop: 10,
                  }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <Feather name={r.ok ? "check-circle" : "x-circle"} size={16} color={r.ok ? "#4ade80" : "#ef4444"} />
                      <Text style={{ color: r.ok ? "#4ade80" : "#ef4444", fontWeight: "700", fontSize: 13 }}>
                        {r.ok ? "Acessível" : "Falhou"} {r.status ? `· HTTP ${r.status}` : ""} {r.latency ? `· ${r.latency}ms` : ""}
                      </Text>
                    </View>
                    <Text style={{ color: "#aaa", fontSize: 11, marginBottom: 4 }} numberOfLines={2}>{r.url}</Text>
                    {r.contentType && (
                      <Text style={{ color: HUBBY_COLOR, fontSize: 11 }}>Content-Type: {r.contentType}</Text>
                    )}
                    {r.redirectUrl && (
                      <Text style={{ color: "#fbbf24", fontSize: 11, marginTop: 4 }} numberOfLines={2}>
                        → {r.redirectUrl}
                      </Text>
                    )}
                    {r.error && (
                      <Text style={{ color: "#ef4444", fontSize: 11, marginTop: 4 }}>{r.error}</Text>
                    )}
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                      <Pressable
                        onPress={() => copyText(r.url)}
                        style={[s.microBtn, { borderColor: colors.border }]}
                      >
                        <Feather name="copy" size={12} color={colors.mutedForeground} />
                        <Text style={[s.microBtnTxt, { color: colors.mutedForeground }]}>Copiar URL</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          // Sempre usa r.url (original, ex: hubby.cx). openPlayer envia para
                          // stream proxy (HTTPS) — servidor acessa hubby.cx diretamente (200,
                          // sem token expirado). Evitar r.redirectUrl cujo token expira em ~60s.
                          setVideoInput(r.url);
                          setHSection("teste");
                          openPlayer(r.url, "Teste de Vídeo");
                        }}
                        style={[s.microBtn, { borderColor: HUBBY_COLOR }]}
                      >
                        <Feather name="play" size={12} color={HUBBY_COLOR} />
                        <Text style={[s.microBtnTxt, { color: HUBBY_COLOR }]}>Testar Vídeo</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>

              {/* Teste de Vídeo */}
              <View>
                <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>TESTE DE VÍDEO</Text>
                <Text style={[s.sectionDesc, { color: colors.mutedForeground }]}>
                  Reproduz qualquer URL de stream diretamente no player WebView (funciona com HTTPS, HTTP, TS, MP4, HLS).
                </Text>
                <View style={[s.searchWrap, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 10 }]}>
                  <Feather name="play-circle" size={14} color={colors.mutedForeground} />
                  <TextInput
                    style={[s.searchInput, { color: colors.foreground }]}
                    placeholder="https://hubby.cx/movie/… ou http://…"
                    placeholderTextColor={colors.mutedForeground}
                    value={videoInput}
                    onChangeText={setVideoInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onSubmitEditing={() => videoInput.trim() && openPlayer(videoInput.trim(), "Teste de Vídeo")}
                  />
                </View>

                {/* Quick-fill buttons */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, marginBottom: 10 }}>
                  {[
                    { label: "HTTPS MP4", url: getVodStreamUrl(644196, "mp4") },
                    { label: "HTTPS TS", url: getVodStreamUrl(644196, "ts") },
                    { label: "HTTP:80", url: `http://hubby.cx:80/movie/${HUBBY_USER}/${HUBBY_PASS}/644196.mp4` },
                    { label: "Live .ts", url: `${HUBBY_HOST}/live/${HUBBY_USER}/${HUBBY_PASS}/1.ts` },
                  ].map(({ label, url }) => (
                    <Pressable
                      key={label}
                      onPress={() => setVideoInput(url)}
                      style={[s.pill, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <Text style={[s.pillTxt, { color: colors.foreground }]}>{label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Pressable
                  onPress={() => videoInput.trim() && openPlayer(videoInput.trim(), "Teste de Vídeo Hubby")}
                  disabled={!videoInput.trim()}
                  style={[s.actionBtn, { backgroundColor: HUBBY_COLOR, opacity: videoInput.trim() ? 1 : 0.5 }]}
                >
                  <Feather name="play" size={15} color="#fff" />
                  <Text style={s.actionBtnTxt}>Abrir no Player</Text>
                </Pressable>
              </View>

              {/* Xtream API Tester */}
              <View>
                <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>ENDPOINTS XTREAM CODES</Text>
                <View style={[s.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {[
                    { label: "Server Info", action: "get_server_info" },
                    { label: "VOD Cats", action: "get_vod_categories" },
                    { label: "Series Cats", action: "get_series_categories" },
                    { label: "Live Cats", action: "get_live_categories" },
                  ].map(({ label, action }) => (
                    <Pressable
                      key={action}
                      onPress={() => {
                        const url = `${API_BASE}&action=${action}`;
                        setLinkInput(url);
                        testLink(url);
                      }}
                      style={[s.endpointRow, { borderColor: colors.border }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 13 }}>{label}</Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                          numberOfLines={1}>
                          action={action}
                        </Text>
                      </View>
                      <Feather name="send" size={14} color={HUBBY_COLOR} />
                    </Pressable>
                  ))}
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {/* ── VOD DETAIL MODAL ─────────────────────────────────────────────── */}
      <Modal visible={!!selectedVod} transparent animationType="slide" onRequestClose={() => setSelectedVod(null)}>
        <View style={s.modalBg}>
          <View style={[s.modalSheet, { backgroundColor: colors.card }]}>
            {selectedVod && (
              <ScrollView>
                {/* Poster + title */}
                <View style={{ flexDirection: "row", gap: 14, marginBottom: 16, padding: 20 }}>
                  <Image
                    source={{ uri: selectedVod.stream_icon }}
                    style={{ width: 70, height: 104, borderRadius: 8, backgroundColor: "#111" }}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700", marginBottom: 4 }}>
                      {selectedVod.name}
                    </Text>
                    {selectedVod.rating ? (
                      <Text style={{ color: HUBBY_COLOR, fontSize: 12, marginBottom: 4 }}>⭐ {selectedVod.rating}</Text>
                    ) : null}
                    <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                      ID: {selectedVod.stream_id} · {selectedVod.container_extension?.toUpperCase()}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                      Cat: {vodCats.find(c => c.category_id === selectedVod.category_id)?.category_name ?? selectedVod.category_id}
                    </Text>
                  </View>
                  <Pressable onPress={() => setSelectedVod(null)}>
                    <Feather name="x" size={20} color={colors.mutedForeground} />
                  </Pressable>
                </View>

                {/* Stream URLs */}
                <View style={{ paddingHorizontal: 20, gap: 10 }}>
                  {[
                    { label: "HTTPS MP4", url: getVodStreamUrl(selectedVod.stream_id, "mp4") },
                    { label: "HTTPS TS", url: getVodStreamUrl(selectedVod.stream_id, "ts") },
                    { label: "HTTP:80 MP4", url: `http://hubby.cx:80/movie/${HUBBY_USER}/${HUBBY_PASS}/${selectedVod.stream_id}.mp4` },
                  ].map(({ label, url }) => (
                    <View key={label} style={[s.urlRow, { borderColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: HUBBY_COLOR, fontSize: 11, fontWeight: "700", marginBottom: 2 }}>{label}</Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                          numberOfLines={2}>{url}</Text>
                      </View>
                      <View style={{ gap: 6 }}>
                        <Pressable onPress={() => copyText(url)} style={s.iconBtn}>
                          <Feather name="copy" size={14} color={colors.mutedForeground} />
                        </Pressable>
                        <Pressable onPress={() => { openPlayer(url, selectedVod.name); setSelectedVod(null); }} style={[s.iconBtn, { backgroundColor: HUBBY_COLOR + "22" }]}>
                          <Feather name="play" size={14} color={HUBBY_COLOR} />
                        </Pressable>
                        <Pressable onPress={() => { setLinkInput(url); setHSection("teste"); testLink(url); setSelectedVod(null); }} style={s.iconBtn}>
                          <Feather name="wifi" size={14} color={colors.mutedForeground} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Play buttons */}
                <View style={{ padding: 20, gap: 10 }}>
                  <Pressable
                    onPress={() => { openPlayer(getVodStreamUrl(selectedVod.stream_id, "mp4"), selectedVod.name); setSelectedVod(null); }}
                    style={[s.actionBtn, { backgroundColor: HUBBY_COLOR }]}
                  >
                    <Feather name="play" size={16} color="#fff" />
                    <Text style={s.actionBtnTxt}>▶ Testar HTTPS MP4</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { openPlayer(getVodStreamUrl(selectedVod.stream_id, "ts"), selectedVod.name); setSelectedVod(null); }}
                    style={[s.actionBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: HUBBY_COLOR }]}
                  >
                    <Feather name="play" size={16} color={HUBBY_COLOR} />
                    <Text style={[s.actionBtnTxt, { color: HUBBY_COLOR }]}>▶ Testar HTTPS TS</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── SERIES DETAIL MODAL ───────────────────────────────────────────── */}
      <Modal visible={!!selectedSeries} transparent animationType="slide" onRequestClose={() => setSelectedSeries(null)}>
        <View style={s.modalBg}>
          <View style={[s.modalSheet, { backgroundColor: colors.card }]}>
            {selectedSeries && (
              <ScrollView>
                <View style={{ flexDirection: "row", gap: 14, marginBottom: 16, padding: 20 }}>
                  <Image
                    source={{ uri: selectedSeries.cover }}
                    style={{ width: 70, height: 104, borderRadius: 8, backgroundColor: "#111" }}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700", marginBottom: 4 }}>
                      {selectedSeries.name}
                    </Text>
                    {selectedSeries.year ? (
                      <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 2 }}>{selectedSeries.year}</Text>
                    ) : null}
                    {selectedSeries.genre ? (
                      <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 2 }}>{selectedSeries.genre}</Text>
                    ) : null}
                    {selectedSeries.rating ? (
                      <Text style={{ color: HUBBY_COLOR, fontSize: 12 }}>⭐ {selectedSeries.rating}</Text>
                    ) : null}
                  </View>
                  <Pressable onPress={() => setSelectedSeries(null)}>
                    <Feather name="x" size={20} color={colors.mutedForeground} />
                  </Pressable>
                </View>

                {/* Episodes */}
                <View style={{ paddingHorizontal: 20 }}>
                  {seriesEpLoading ? (
                    <View style={{ alignItems: "center", padding: 20 }}>
                      <ActivityIndicator size="small" color={HUBBY_COLOR} />
                      <Text style={{ color: "#aaa", fontSize: 12, marginTop: 8 }}>Carregando episódios…</Text>
                    </View>
                  ) : seriesEpisodes.length === 0 ? (
                    <Text style={{ color: "#aaa", fontSize: 13, textAlign: "center", padding: 20 }}>
                      Nenhum episódio encontrado
                    </Text>
                  ) : (
                    seriesEpisodes.map(({ season, eps }) => (
                      <View key={season} style={{ marginBottom: 16 }}>
                        <Text style={{ color: HUBBY_COLOR, fontWeight: "700", fontSize: 13, marginBottom: 8 }}>
                          Temporada {season} · {eps.length} ep.
                        </Text>
                        {eps.map((ep) => (
                          <View key={ep.id}
                            style={[s.epRow, { borderColor: colors.border }]}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
                                E{ep.episode_num} {ep.title ? `· ${ep.title}` : ""}
                              </Text>
                              {ep.info?.duration && (
                                <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{ep.info.duration}</Text>
                              )}
                            </View>
                            <View style={{ flexDirection: "row", gap: 8 }}>
                              <Pressable
                                onPress={() => copyText(getSeriesEpUrl(ep.id, ep.container_extension || "mp4"))}
                                style={s.iconBtn}
                              >
                                <Feather name="copy" size={13} color={colors.mutedForeground} />
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  openPlayer(
                                    getSeriesEpUrl(ep.id, ep.container_extension || "mp4"),
                                    `${selectedSeries.name} T${season}E${ep.episode_num}`
                                  );
                                  setSelectedSeries(null);
                                }}
                                style={[s.iconBtn, { backgroundColor: HUBBY_COLOR + "22" }]}
                              >
                                <Feather name="play" size={13} color={HUBBY_COLOR} />
                              </Pressable>
                            </View>
                          </View>
                        ))}
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── VIDEO PLAYER MODAL ────────────────────────────────────────────── */}
      <Modal visible={playerVisible} transparent animationType="fade" onRequestClose={() => setPlayerVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 14, paddingTop: topPad + 8, gap: 12 }}>
            <Pressable onPress={() => setPlayerVisible(false)}>
              <Feather name="x" size={24} color="#fff" />
            </Pressable>
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700", flex: 1 }} numberOfLines={1}>
              {playerTitle}
            </Text>
            <Pressable onPress={() => copyText(playerUrl)}>
              <Feather name="copy" size={18} color="#aaa" />
            </Pressable>
          </View>

          <View style={{ flex: 1 }}>
            {playerVisible && playerUrl ? (
              Platform.OS === "web" ? (
                // Web: use native HTML5 video — react-native-webview not supported in browser
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
                  {/* @ts-ignore — web-only JSX element */}
                  <video
                    src={playerUrl}
                    controls
                    autoPlay
                    style={{ width: "100%", height: "100%", maxHeight: 400, backgroundColor: "#000" }}
                    onError={(e: any) => console.warn("[Admin2 Web Player]", e)}
                  />
                </View>
              ) : (
                <>
                  <WebViewVideoPlayer
                    uri={playerUrl}
                    baseUrl={HUBBY_HOST}
                    shouldPlay
                    style={{ flex: 1 }}
                    onError={(err) => {
                      console.warn("[Admin2 Player]", err);
                      setPlayerError(typeof err === "string" ? err : JSON.stringify(err));
                    }}
                  />
                  {playerError ? (
                    <View style={{ position: "absolute", bottom: 80, left: 16, right: 16, backgroundColor: "#c00", borderRadius: 8, padding: 10 }}>
                      <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>⚠ Erro no player</Text>
                      <Text style={{ color: "#fdd", fontSize: 11, marginTop: 4 }}>{playerError}</Text>
                    </View>
                  ) : null}
                </>
              )
            ) : null}
          </View>

          <View style={{ padding: 16, gap: 8 }}>
            <Text style={{ color: "#aaa", fontSize: 11, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
              numberOfLines={2}>{playerUrl}</Text>
            <Pressable
              onPress={() => { testLink(playerUrl); setPlayerVisible(false); setHSection("teste"); }}
              style={[s.microBtn, { borderColor: HUBBY_COLOR, alignSelf: "flex-start" }]}
            >
              <Feather name="wifi" size={12} color={HUBBY_COLOR} />
              <Text style={[s.microBtnTxt, { color: HUBBY_COLOR }]}>Testar Link</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {editTarget && (
        <HubbyEditModal
          target={editTarget}
          patchId={hubbyPatchId(editTarget)}
          existingPatch={patches[hubbyPatchId(editTarget)] ?? null}
          seriesItems={seriesItems}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); loadPatches(); }}
        />
      )}

      {/* ── Bulk auto-link progress overlay ─────────────────────────────────── */}
      <Modal visible={!!bulkLink} transparent animationType="fade" statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: "#000000bb", justifyContent: "center", alignItems: "center", padding: 32 }}>
          <View style={{ width: "100%", backgroundColor: "#1a1a1a", borderRadius: 16, padding: 24, gap: 16, borderWidth: 1, borderColor: "#f59e0b44" }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Feather name="zap" size={18} color="#f59e0b" />
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }}>
                Vincular ao TMDB — {bulkLink?.type === "vod" ? "Filmes" : "Séries"}
              </Text>
            </View>

            {/* Progress bar */}
            {bulkLink && (
              <View style={{ gap: 8 }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: "#333", overflow: "hidden" }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: "#f59e0b", width: `${Math.round((bulkLink.done / Math.max(bulkLink.total, 1)) * 100)}%` }} />
                </View>
                <Text style={{ color: "#aaa", fontSize: 12 }}>
                  {bulkLink.done} / {bulkLink.total} processados · {bulkLink.saved} vinculados
                </Text>
                {bulkLink.current.length > 0 && (
                  <Text style={{ color: "#f59e0b", fontSize: 11 }} numberOfLines={1}>
                    ⟳ {bulkLink.current}
                  </Text>
                )}
              </View>
            )}

            {/* Finished state */}
            {bulkLink && !bulkLink.active && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#16a34a22", borderRadius: 8, padding: 10 }}>
                <Feather name="check-circle" size={16} color="#4ade80" />
                <Text style={{ color: "#4ade80", fontWeight: "700" }}>
                  Concluído! {bulkLink.saved} itens vinculados.
                </Text>
              </View>
            )}

            {/* Action buttons */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              {bulkLink?.active ? (
                <Pressable
                  onPress={() => { bulkCancelRef.current = true; }}
                  style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, backgroundColor: "#ef444422", borderWidth: 1, borderColor: "#ef444455" }}
                >
                  <Text style={{ color: "#ef4444", fontWeight: "700" }}>Cancelar</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => setBulkLink(null)}
                  style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, backgroundColor: "#f59e0b22", borderWidth: 1, borderColor: "#f59e0b55" }}
                >
                  <Text style={{ color: "#f59e0b", fontWeight: "700" }}>Fechar</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── HubbyEditModal — Vincular TMDB + Editar Áudio ───────────────────────────
interface TmdbHit { id: number; title?: string; name?: string; poster_path: string | null; release_date?: string; first_air_date?: string; vote_average: number; media_type?: string; }

function HubbyEditModal({
  target, patchId, existingPatch, seriesItems, onClose, onSaved,
}: {
  target: { kind: "vod"; item: VodItem } | { kind: "series"; item: SeriesItem };
  patchId: string;
  existingPatch: { tmdbId?: number; tmdbType?: string; audioType?: string; posterPath?: string } | null;
  seriesItems?: SeriesItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const itemName = target.kind === "vod" ? target.item.name : target.item.name;
  const isVod = target.kind === "vod";
  const isSeries = target.kind === "series";

  type AudioType = "dublado" | "legendado" | "dual" | null;
  const [audioType, setAudioType] = useState<AudioType>((existingPatch?.audioType as AudioType) ?? null);
  const [audioTypeTouched, setAudioTypeTouched] = useState(false);
  const [tmdbSearch, setTmdbSearch] = useState(itemName ?? "");
  const [tmdbResults, setTmdbResults] = useState<TmdbHit[]>([]);
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [selectedTmdb, setSelectedTmdb] = useState<TmdbHit | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poster field — initialized from existing patch (convert relative TMDB path → full URL)
  const initPoster = existingPatch?.posterPath
    ? (existingPatch.posterPath.startsWith("http")
        ? existingPatch.posterPath
        : `https://image.tmdb.org/t/p/w342${existingPatch.posterPath}`)
    : "";
  const [posterUrl, setPosterUrl] = useState<string>(initPoster);
  const [posterTouched, setPosterTouched] = useState(false);
  const [posterErr, setPosterErr] = useState(false);

  // Merge state
  const [mergeQ, setMergeQ] = useState("");
  const [mergeSelected, setMergeSelected] = useState<SeriesItem | null>(null);
  const [mergeLabel1, setMergeLabel1] = useState("Dublado");
  const [mergeLabel2, setMergeLabel2] = useState("Legendado");
  const [existingMerge, setExistingMerge] = useState<{ primaryId: string; secondaryId: string; primaryLabel: string; secondaryLabel: string } | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeMsg, setMergeMsg] = useState<string | null>(null);

  const mergeResults = mergeQ.trim()
    ? (seriesItems ?? []).filter(s =>
        s.name?.toLowerCase().includes(mergeQ.toLowerCase()) &&
        String(s.series_id) !== String(target.kind === "series" ? (target.item as SeriesItem).series_id : "")
      ).slice(0, 10)
    : [];

  const searchTmdb = async (q: string) => {
    if (!q.trim()) { setTmdbResults([]); return; }
    setTmdbLoading(true);
    try {
      const base = getApiBase();
      const type = isVod ? "movie" : "tv";
      const res = await fetch(`${base}/r2/tmdb-search?q=${encodeURIComponent(q)}&type=${type}`);
      const data = await res.json();
      setTmdbResults(data.results ?? []);
    } catch { setTmdbResults([]); }
    finally { setTmdbLoading(false); }
  };

  const handleSearch = (t: string) => {
    setTmdbSearch(t);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => searchTmdb(t), 600);
  };

  const loadExistingMerge = async () => {
    try {
      const base = getApiBase();
      const res = await fetch(`${base}/r2/flix2/series-merges`);
      if (res.ok) {
        const data = await res.json();
        const mine = (data.merges ?? []).find((m: any) => m.primaryId === patchId || m.secondaryId === patchId);
        if (mine) setExistingMerge(mine);
      }
    } catch {}
  };

  useEffect(() => {
    if (tmdbSearch.trim()) searchTmdb(tmdbSearch);
    if (isSeries) loadExistingMerge();
  }, []);

  const doMerge = async () => {
    if (!mergeSelected) return;
    setMerging(true); setMergeMsg(null);
    try {
      const base = getApiBase();
      const body = {
        primaryId: patchId,
        secondaryId: `hubby_ser_${mergeSelected.series_id}`,
        primaryLabel: mergeLabel1,
        secondaryLabel: mergeLabel2,
      };
      const res = await fetch(`${base}/r2/flix2/series-merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setExistingMerge(body);
      setMergeMsg("✓ Fundido com sucesso!");
    } catch (e: any) { setMergeMsg("Erro: " + (e.message ?? "falha")); }
    finally { setMerging(false); }
  };

  const removeMerge = async () => {
    try {
      const base = getApiBase();
      await fetch(`${base}/r2/flix2/series-merge`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryId: existingMerge?.primaryId ?? patchId }),
      });
      setExistingMerge(null);
      setMergeSelected(null);
      setMergeMsg(null);
    } catch {}
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const base = getApiBase();
      const body: any = { flix2Id: patchId };
      if (selectedTmdb) {
        body.tmdbId = selectedTmdb.id;
        body.tmdbType = isVod ? "movie" : "tv";
        // Use manually edited poster if touched, else TMDB poster from search result
        if (posterTouched && posterUrl.trim()) {
          body.posterPath = posterUrl.trim();
        } else if (selectedTmdb.poster_path) {
          body.posterPath = selectedTmdb.poster_path;
        }
      } else if (posterTouched && posterUrl.trim()) {
        // Saving only a manual poster URL (no TMDB re-link)
        body.posterPath = posterUrl.trim();
      }
      body.audioType = audioType;
      const res = await fetch(`${base}/r2/flix2/item-patch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMsg("✓ Salvo!");
      setTimeout(() => onSaved(), 700);
    } catch (e: any) { setMsg("Erro: " + (e.message ?? "falha")); }
    finally { setSaving(false); }
  };

  const AUDIO_OPTS: { value: AudioType; label: string; color: string }[] = [
    { value: "dublado", label: "DUB", color: "#3b82f6" },
    { value: "legendado", label: "LEG", color: "#f59e0b" },
    { value: "dual", label: "DUAL", color: "#10b981" },
  ];

  const hasChange = selectedTmdb !== null || audioTypeTouched || audioType !== (existingPatch?.audioType ?? null) || posterTouched;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: "#0f0f18", borderTopLeftRadius: 20, borderTopRightRadius: 20,
          maxHeight: "80%", borderTopWidth: 1, borderColor: "#8b5cf644" }}>

          {/* Handle */}
          <View style={{ alignItems: "center", paddingTop: 8 }}>
            <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)" }} />
          </View>

          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12,
            borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#8b5cf6", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>
                Editar · {isVod ? "Filme" : "Série"}
              </Text>
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700", marginTop: 1 }} numberOfLines={1}>{itemName}</Text>
              {existingPatch?.tmdbId && (
                <Text style={{ color: "#8b5cf6", fontSize: 10, marginTop: 1 }}>TMDB vinculado: {existingPatch.tmdbId}</Text>
              )}
            </View>
            <Pressable onPress={onClose} style={{ padding: 8, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.06)" }}>
              <Feather name="x" size={17} color="rgba(255,255,255,0.5)" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            {/* Áudio */}
            <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: "700",
              textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Tipo de Áudio</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {AUDIO_OPTS.map((opt) => (
                <Pressable key={opt.value} onPress={() => { setAudioTypeTouched(true); setAudioType(audioType === opt.value ? null : opt.value); }}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                    backgroundColor: audioType === opt.value ? `${opt.color}22` : "rgba(255,255,255,0.05)",
                    borderWidth: 1, borderColor: audioType === opt.value ? `${opt.color}66` : "rgba(255,255,255,0.1)" }}>
                  <Text style={{ color: audioType === opt.value ? opt.color : "rgba(255,255,255,0.4)",
                    fontSize: 13, fontWeight: "700" }}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* TMDB Search */}
            <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: "700",
              textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Vincular TMDB</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", paddingHorizontal: 12, marginBottom: 8 }}>
              {tmdbLoading
                ? <ActivityIndicator size="small" color="#8b5cf6" style={{ width: 14 }} />
                : <Feather name="search" size={13} color="rgba(255,255,255,0.35)" />}
              <TextInput style={{ flex: 1, color: "#fff", fontSize: 13, paddingVertical: 10 }}
                placeholder="Buscar no TMDB…" placeholderTextColor="rgba(255,255,255,0.3)"
                value={tmdbSearch} onChangeText={handleSearch} autoCorrect={false} />
            </View>

            {selectedTmdb && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10,
                backgroundColor: "#10b98120", borderWidth: 1, borderColor: "#10b98144", marginBottom: 10 }}>
                {selectedTmdb.poster_path && (
                  <Image source={{ uri: `https://image.tmdb.org/t/p/w92${selectedTmdb.poster_path}` }}
                    style={{ width: 36, height: 54, borderRadius: 5 }} contentFit="cover" />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#10b981", fontWeight: "700", fontSize: 13 }} numberOfLines={1}>
                    {selectedTmdb.title ?? selectedTmdb.name}
                  </Text>
                  <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>
                    ID {selectedTmdb.id}{(selectedTmdb.release_date || selectedTmdb.first_air_date)
                      ? ` · ${(selectedTmdb.release_date || selectedTmdb.first_air_date)!.slice(0, 4)}` : ""}
                    {selectedTmdb.vote_average > 0 ? ` · ★ ${selectedTmdb.vote_average.toFixed(1)}` : ""}
                  </Text>
                </View>
                <Pressable onPress={() => setSelectedTmdb(null)} style={{ padding: 6 }}>
                  <Feather name="x" size={14} color="rgba(255,255,255,0.4)" />
                </Pressable>
              </View>
            )}

            {tmdbResults.length > 0 && !selectedTmdb && (
              <View style={{ borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 12 }}>
                {tmdbResults.slice(0, 8).map((hit, i) => (
                  <Pressable key={hit.id} onPress={() => {
                    setSelectedTmdb(hit);
                    setTmdbResults([]);
                    // Auto-populate poster field with the selected TMDB poster
                    if (hit.poster_path && !posterTouched) {
                      setPosterUrl(`https://image.tmdb.org/t/p/w342${hit.poster_path}`);
                      setPosterErr(false);
                    }
                  }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10,
                      backgroundColor: "rgba(255,255,255,0.02)",
                      borderTopWidth: i > 0 ? 1 : 0, borderTopColor: "rgba(255,255,255,0.06)" }}>
                    {hit.poster_path ? (
                      <Image source={{ uri: `https://image.tmdb.org/t/p/w92${hit.poster_path}` }}
                        style={{ width: 28, height: 42, borderRadius: 4 }} contentFit="cover" />
                    ) : (
                      <View style={{ width: 28, height: 42, borderRadius: 4, backgroundColor: "#1a1a2a",
                        alignItems: "center", justifyContent: "center" }}>
                        <Feather name="film" size={12} color="rgba(255,255,255,0.2)" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }} numberOfLines={1}>
                        {hit.title ?? hit.name}
                      </Text>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>
                        ID {hit.id}{(hit.release_date || hit.first_air_date)
                          ? ` · ${(hit.release_date || hit.first_air_date)!.slice(0, 4)}` : ""}
                        {hit.vote_average > 0 ? ` · ★ ${hit.vote_average.toFixed(1)}` : ""}
                      </Text>
                    </View>
                    <Feather name="check-circle" size={15} color="rgba(139,92,246,0.5)" />
                  </Pressable>
                ))}
              </View>
            )}

            {/* ─── Cartaz (poster manual) ─── */}
            <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: "700",
              textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, marginTop: 4 }}>
              Cartaz (URL da imagem)
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
              {/* Preview thumbnail */}
              {posterUrl && !posterErr ? (
                <Image
                  source={{ uri: posterUrl }}
                  style={{ width: 46, height: 69, borderRadius: 6 }}
                  contentFit="cover"
                  onError={() => setPosterErr(true)}
                />
              ) : (
                <View style={{ width: 46, height: 69, borderRadius: 6,
                  backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center",
                  borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}>
                  <Feather name="image" size={16} color="rgba(255,255,255,0.2)" />
                </View>
              )}
              <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10,
                borderWidth: 1, borderColor: posterErr ? "rgba(248,113,113,0.5)" : "rgba(255,255,255,0.12)",
                paddingHorizontal: 12 }}>
                <TextInput
                  style={{ color: "#fff", fontSize: 11, paddingVertical: 10 }}
                  placeholder="https://image.tmdb.org/t/p/w342/..."
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  value={posterUrl}
                  onChangeText={(t) => { setPosterUrl(t); setPosterTouched(true); setPosterErr(false); }}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
              {posterUrl ? (
                <Pressable onPress={() => { setPosterUrl(""); setPosterTouched(true); setPosterErr(false); }}
                  style={{ padding: 6 }}>
                  <Feather name="x" size={14} color="rgba(255,255,255,0.4)" />
                </Pressable>
              ) : null}
            </View>

            {msg && (
              <View style={{ padding: 10, borderRadius: 8, marginBottom: 10,
                backgroundColor: msg.startsWith("Erro") ? "rgba(248,113,113,0.12)" : "rgba(34,197,94,0.12)",
                borderWidth: 1, borderColor: msg.startsWith("Erro") ? "rgba(248,113,113,0.3)" : "rgba(34,197,94,0.3)" }}>
                <Text style={{ color: msg.startsWith("Erro") ? "#f87171" : "#22c55e", fontSize: 12, fontWeight: "700" }}>{msg}</Text>
              </View>
            )}

            <Pressable onPress={save} disabled={saving || !hasChange}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                paddingVertical: 13, borderRadius: 12, backgroundColor: "#8b5cf6",
                opacity: (saving || !hasChange) ? 0.4 : 1 }}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="save" size={15} color="#fff" />}
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                {saving ? "Salvando…" : "Salvar"}
              </Text>
            </Pressable>

            {/* ─── Fundir Séries (apenas séries) ─── */}
            {isSeries && (
              <>
                <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginVertical: 16 }} />
                <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: "700",
                  textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Fundir Séries</Text>

                {existingMerge ? (
                  <View style={{ backgroundColor: "#8b5cf612", borderRadius: 12, borderWidth: 1,
                    borderColor: "#8b5cf633", padding: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <Feather name="git-merge" size={12} color="#8b5cf6" />
                      <Text style={{ color: "#8b5cf6", fontWeight: "700", fontSize: 12 }}>Fusão ativa</Text>
                    </View>
                    <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
                      Principal ({existingMerge.primaryLabel}): {existingMerge.primaryId}
                    </Text>
                    <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 2 }}>
                      Secundária ({existingMerge.secondaryLabel}): {existingMerge.secondaryId}
                    </Text>
                    <Pressable onPress={removeMerge}
                      style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 5,
                        paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, alignSelf: "flex-start",
                        backgroundColor: "rgba(248,113,113,0.1)", borderWidth: 1, borderColor: "rgba(248,113,113,0.25)" }}>
                      <Feather name="trash-2" size={11} color="#f87171" />
                      <Text style={{ color: "#f87171", fontSize: 11, fontWeight: "700" }}>Remover fusão</Text>
                    </Pressable>
                    {mergeMsg && (
                      <Text style={{ color: "#22c55e", fontSize: 11, marginTop: 6 }}>{mergeMsg}</Text>
                    )}
                  </View>
                ) : (
                  <>
                    {/* Presets de label */}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {([
                        { p: "Dublado", s: "Legendado" },
                        { p: "Legendado", s: "Dublado" },
                        { p: "PT-BR", s: "PT-PT" },
                      ] as { p: string; s: string }[]).map(pr => {
                        const active = mergeLabel1 === pr.p && mergeLabel2 === pr.s;
                        return (
                          <Pressable key={pr.p + pr.s}
                            onPress={() => { setMergeLabel1(pr.p); setMergeLabel2(pr.s); }}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
                              backgroundColor: active ? "#8b5cf622" : "rgba(255,255,255,0.04)",
                              borderColor: active ? "#8b5cf655" : "rgba(255,255,255,0.1)" }}>
                            <Text style={{ color: active ? "#8b5cf6" : "rgba(255,255,255,0.4)",
                              fontSize: 10, fontWeight: active ? "700" : "400" }}>
                              {pr.p} + {pr.s}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {/* Campo de busca local */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8,
                      backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10, borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.12)", paddingHorizontal: 12, marginBottom: 8 }}>
                      <Feather name="search" size={13} color="rgba(255,255,255,0.35)" />
                      <TextInput style={{ flex: 1, color: "#fff", fontSize: 13, paddingVertical: 10 }}
                        placeholder="Buscar série para fundir…" placeholderTextColor="rgba(255,255,255,0.3)"
                        value={mergeQ} onChangeText={setMergeQ} autoCorrect={false} />
                      {mergeQ.length > 0 && (
                        <Pressable onPress={() => setMergeQ("")} style={{ padding: 4 }}>
                          <Feather name="x" size={13} color="rgba(255,255,255,0.3)" />
                        </Pressable>
                      )}
                    </View>

                    {/* Série selecionada */}
                    {mergeSelected && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 8,
                        borderRadius: 8, backgroundColor: "#10b98115", borderWidth: 1,
                        borderColor: "#10b98133", marginBottom: 8 }}>
                        {mergeSelected.cover ? (
                          <Image source={{ uri: mergeSelected.cover }}
                            style={{ width: 28, height: 42, borderRadius: 3 }} contentFit="cover" />
                        ) : null}
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: "#10b981", fontWeight: "700", fontSize: 12 }} numberOfLines={1}>
                            {mergeSelected.name}
                          </Text>
                          <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>
                            ID {mergeSelected.series_id}
                          </Text>
                        </View>
                        <Pressable onPress={() => setMergeSelected(null)} style={{ padding: 4 }}>
                          <Feather name="x" size={13} color="rgba(255,255,255,0.4)" />
                        </Pressable>
                      </View>
                    )}

                    {/* Lista de resultados locais */}
                    {mergeResults.length > 0 && !mergeSelected && (
                      <View style={{ borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
                        overflow: "hidden", marginBottom: 8 }}>
                        {mergeResults.map((r, i) => (
                          <Pressable key={r.series_id}
                            onPress={() => { setMergeSelected(r); setMergeQ(""); }}
                            style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 8,
                              backgroundColor: "rgba(255,255,255,0.02)",
                              borderTopWidth: i > 0 ? 1 : 0, borderTopColor: "rgba(255,255,255,0.06)" }}>
                            {r.cover ? (
                              <Image source={{ uri: r.cover }}
                                style={{ width: 24, height: 36, borderRadius: 3 }} contentFit="cover" />
                            ) : (
                              <View style={{ width: 24, height: 36, borderRadius: 3, backgroundColor: "#1a1a2a",
                                alignItems: "center", justifyContent: "center" }}>
                                <Feather name="tv" size={10} color="rgba(255,255,255,0.2)" />
                              </View>
                            )}
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }} numberOfLines={1}>{r.name}</Text>
                              <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>
                                ID {r.series_id}{r.year ? ` · ${r.year}` : ""}
                              </Text>
                            </View>
                            <Feather name="plus-circle" size={14} color="rgba(139,92,246,0.55)" />
                          </Pressable>
                        ))}
                      </View>
                    )}

                    {mergeMsg && (
                      <Text style={{ color: "#f87171", fontSize: 11, marginBottom: 8 }}>{mergeMsg}</Text>
                    )}

                    <Pressable onPress={doMerge} disabled={!mergeSelected || merging}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                        paddingVertical: 11, borderRadius: 10, borderWidth: 1,
                        borderColor: "#8b5cf633", backgroundColor: "#8b5cf610",
                        opacity: (!mergeSelected || merging) ? 0.4 : 1 }}>
                      {merging
                        ? <ActivityIndicator color="#8b5cf6" size="small" />
                        : <Feather name="git-merge" size={13} color="#8b5cf6" />}
                      <Text style={{ color: "#8b5cf6", fontWeight: "700", fontSize: 13 }}>Confirmar Fusão</Text>
                    </Pressable>
                  </>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  tabsRow: {
    flexDirection: "row", paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 44,
  },
  tab: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  tabTxt: { fontSize: 12, fontWeight: "700" },
  subTabRow: {
    flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subTab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 10,
  },
  subTabTxt: { fontSize: 11, fontWeight: "700" },
  filterRow: {
    paddingHorizontal: 14, paddingVertical: 10, gap: 8,
  },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 13, padding: 0 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  pillTxt: { fontSize: 11, fontWeight: "600" },
  countTxt: { paddingHorizontal: 16, paddingBottom: 6, fontSize: 11 },
  grid: {
    padding: 12, flexDirection: "row", flexWrap: "wrap", gap: 10,
  },
  flatGrid: {
    padding: 10, paddingBottom: 20,
  },
  flatRow: {
    gap: 8, marginBottom: 8,
  },
  card: {
    flex: 1, borderRadius: 10, overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth, maxWidth: "33%",
  },
  cardPoster: { width: "100%", aspectRatio: 2 / 3, backgroundColor: "#111" },
  cardInfo: { padding: 8, gap: 2 },
  cardTitle: { fontSize: 11, fontWeight: "700", lineHeight: 14 },
  cardSub: { fontSize: 10 },
  loadMoreBtn: {
    width: "100%", padding: 14, borderRadius: 10, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  loadTxt: { fontSize: 13, textAlign: "center" },
  errTxt: { fontSize: 13, textAlign: "center" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 6 },
  sectionDesc: { fontSize: 12, marginBottom: 12, lineHeight: 17 },
  infoCard: {
    borderRadius: 10, borderWidth: 1, padding: 14,
  },
  actionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12, borderRadius: 10,
  },
  actionBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
  resultCard: { borderRadius: 10, borderWidth: 1, padding: 14 },
  microBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1,
  },
  microBtnTxt: { fontSize: 11, fontWeight: "600" },
  endpointRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  urlRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 8,
  },
  iconBtn: {
    width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "90%", paddingBottom: 32 },
  epRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 10,
  },
});
