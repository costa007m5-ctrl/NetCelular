import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  downloadsManager,
  subscribeDownloads,
  getActiveDownloads,
  MAX_STORAGE_MB,
  type DownloadedContent,
  type ActiveDownload,
} from "@/lib/downloads";
import {
  getSettings,
  updateSetting,
  type UserSettings,
  DEFAULT_SETTINGS,
} from "@/lib/user-settings";

const { width: SW } = Dimensions.get("window");
const QUALITY_OPTIONS = ["Padrão (480p)", "Boa (720p)", "Ótima (1080p)"];
const RED = "#e50914";
const GREEN = "#22c55e";

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseSeriesTitle(title: string): { seriesTitle: string; epLabel: string } {
  const sep = title.indexOf(" — Ep.");
  if (sep > 0) return { seriesTitle: title.slice(0, sep), epLabel: title.slice(sep + 4) };
  return { seriesTitle: title, epLabel: "" };
}

type SeasonGroup = { season: number; episodes: DownloadedContent[] };
type SeriesGroup = {
  tmdb_id: number;
  seriesTitle: string;
  poster_path: string;
  backdrop_path: string;
  seasons: SeasonGroup[];
  totalSize: number;
  minExpiry: number;
};

function groupBySeries(items: DownloadedContent[]): SeriesGroup[] {
  const map = new Map<number, SeriesGroup>();
  for (const item of items) {
    if (!map.has(item.tmdb_id)) {
      const { seriesTitle } = parseSeriesTitle(item.title);
      map.set(item.tmdb_id, {
        tmdb_id: item.tmdb_id,
        seriesTitle,
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        seasons: [],
        totalSize: 0,
        minExpiry: Infinity,
      });
    }
    const group = map.get(item.tmdb_id)!;
    const seasonNum = item.season ?? 1;
    let season = group.seasons.find((s) => s.season === seasonNum);
    if (!season) {
      season = { season: seasonNum, episodes: [] };
      group.seasons.push(season);
    }
    season.episodes.push(item);
    group.totalSize += item.size_mb;
    const days = downloadsManager.daysRemaining(item);
    if (days < group.minExpiry) group.minExpiry = days;
  }
  for (const g of map.values()) {
    g.seasons.sort((a, b) => a.season - b.season);
    for (const s of g.seasons) {
      s.episodes.sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
    }
  }
  return Array.from(map.values());
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ExpiryBar({ days, maxDays = 20 }: { days: number; maxDays?: number }) {
  const pct = Math.min(days / maxDays, 1);
  const color = days <= 3 ? "#f87171" : days <= 7 ? "#f59e0b" : GREEN;
  const anim = useRef(new Animated.Value(pct)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 400, useNativeDriver: false }).start();
  }, [pct]);
  return (
    <View style={{ height: 3, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden", marginTop: 5 }}>
      <Animated.View
        style={{
          height: 3, borderRadius: 2, backgroundColor: color,
          width: anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
        }}
      />
    </View>
  );
}

function ActiveDownloadCard({ item, onCancel }: { item: ActiveDownload; onCancel: () => void }) {
  const colors = useColors();
  const progAnim = useRef(new Animated.Value(item.progress)).current;
  useEffect(() => {
    Animated.timing(progAnim, { toValue: item.progress, duration: 300, useNativeDriver: false }).start();
  }, [item.progress]);

  return (
    <View style={[sd.dlCard, { backgroundColor: colors.card, borderColor: colors.border + "50" }]}>
      {item.poster_path ? (
        <Image source={{ uri: item.poster_path }} style={sd.dlThumb} contentFit="cover" />
      ) : (
        <View style={[sd.dlThumb, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
          <Feather name="download" size={20} color={colors.mutedForeground} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[sd.dlTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
          <Text style={[sd.dlSub, { color: RED }]}>{item.progress}%</Text>
          <Text style={[sd.dlSub, { color: colors.mutedForeground }]}>·</Text>
          <Text style={[sd.dlSub, { color: colors.mutedForeground }]}>
            {item.speed_mb > 0 ? `${item.speed_mb} MB/s` : "Iniciando..."}
          </Text>
          <Text style={[sd.dlSub, { color: colors.mutedForeground }]}>·</Text>
          <Text style={[sd.dlSub, { color: colors.mutedForeground }]}>
            {downloadsManager.formatSize(item.size_mb)}
          </Text>
        </View>
        <View style={{ height: 4, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
          <Animated.View
            style={{
              height: 4, borderRadius: 2, backgroundColor: RED,
              width: progAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
            }}
          />
        </View>
      </View>
      <TouchableOpacity onPress={onCancel} style={{ padding: 8 }}>
        <Feather name="x" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>
    </View>
  );
}

function MovieCard({
  item,
  colors,
  onDelete,
  onPlay,
}: {
  item: DownloadedContent;
  colors: any;
  onDelete: () => void;
  onPlay: () => void;
}) {
  const days = downloadsManager.daysRemaining(item);
  const urgent = days <= 3;

  return (
    <View style={[sd.movieCard, { backgroundColor: colors.card, borderColor: colors.border + "50" }]}>
      <Pressable onPress={onPlay} style={{ position: "relative" }}>
        {item.poster_path ? (
          <Image source={{ uri: item.poster_path }} style={sd.moviePoster} contentFit="cover" />
        ) : (
          <View style={[sd.moviePoster, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
            <Feather name="film" size={22} color={colors.mutedForeground} />
          </View>
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.85)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={sd.moviePlayOverlay}>
          <View style={[sd.playCircle, { backgroundColor: "rgba(229,9,20,0.92)" }]}>
            <Feather name="play" size={14} color="#fff" />
          </View>
        </View>
      </Pressable>
      <View style={sd.movieInfo}>
        <Text style={[sd.movieTitle, { color: colors.foreground }]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
          <Text style={{ color: GREEN, fontSize: 11, fontWeight: "700" }}>
            {downloadsManager.formatSize(item.size_mb)}
          </Text>
          {item.quality && (
            <View style={[sd.qualityBadge, { backgroundColor: colors.muted }]}>
              <Text style={{ color: colors.mutedForeground, fontSize: 9, fontWeight: "700" }}>
                {item.quality.split("(")[1]?.replace(")", "") ?? item.quality}
              </Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 }}>
          <Feather name="clock" size={9} color={urgent ? "#f87171" : colors.mutedForeground} />
          <Text style={{ color: urgent ? "#f87171" : colors.mutedForeground, fontSize: 10 }}>
            {days === 0 ? "Expira hoje" : `${days}d`}
          </Text>
        </View>
        <ExpiryBar days={days} />
        <TouchableOpacity onPress={onDelete} style={{ marginTop: 8, alignSelf: "flex-start" }}>
          <Feather name="trash-2" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function EpisodeRow({
  ep,
  colors,
  onPlay,
  onDelete,
}: {
  ep: DownloadedContent;
  colors: any;
  onPlay: () => void;
  onDelete: () => void;
}) {
  const days = downloadsManager.daysRemaining(ep);
  const urgent = days <= 3;
  const { epLabel } = parseSeriesTitle(ep.title);
  const epTitle = epLabel.replace(/^Ep\. \d+:\s*/, "").trim() || `Episódio ${ep.episode}`;

  return (
    <View style={[sd.epRow, { borderColor: colors.border + "30" }]}>
      <Pressable onPress={onPlay} style={[sd.epThumbWrap, { backgroundColor: colors.muted }]}>
        {ep.poster_path ? (
          <Image source={{ uri: ep.poster_path }} style={sd.epThumb} contentFit="cover" />
        ) : (
          <View style={[sd.epThumb, { alignItems: "center", justifyContent: "center" }]}>
            <Feather name="film" size={14} color={colors.mutedForeground} />
          </View>
        )}
        <View style={sd.epPlayOverlay}>
          <Feather name="play" size={10} color="#fff" />
        </View>
      </Pressable>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={[sd.epNumBadge, { backgroundColor: RED + "22" }]}>
            <Text style={{ color: RED, fontSize: 9, fontWeight: "800" }}>
              E{String(ep.episode ?? 0).padStart(2, "0")}
            </Text>
          </View>
          <Text style={[sd.epTitle, { color: colors.foreground }]} numberOfLines={1}>
            {epTitle}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
          <Text style={{ color: GREEN, fontSize: 10, fontWeight: "700" }}>
            {downloadsManager.formatSize(ep.size_mb)}
          </Text>
          <View style={{ flex: 1 }}>
            <ExpiryBar days={days} />
          </View>
          <Text style={{ color: urgent ? "#f87171" : colors.mutedForeground, fontSize: 9 }}>
            {days === 0 ? "hoje" : `${days}d`}
          </Text>
        </View>
      </View>
      <TouchableOpacity onPress={onDelete} style={{ padding: 8 }}>
        <Feather name="trash-2" size={14} color={colors.mutedForeground + "aa"} />
      </TouchableOpacity>
    </View>
  );
}

function SeasonSection({
  season,
  colors,
  onPlay,
  onDelete,
}: {
  season: SeasonGroup;
  colors: any;
  onPlay: (ep: DownloadedContent) => void;
  onDelete: (ep: DownloadedContent) => void;
}) {
  const [open, setOpen] = useState(true);
  const rotate = useRef(new Animated.Value(open ? 1 : 0)).current;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    Animated.spring(rotate, { toValue: next ? 1 : 0, useNativeDriver: true, speed: 24 }).start();
  };
  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] });

  return (
    <View>
      <Pressable onPress={toggle} style={[sd.seasonHeader, { borderColor: colors.border + "30" }]}>
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
        </Animated.View>
        <Text style={[sd.seasonLabel, { color: colors.foreground }]}>
          Temporada {season.season}
        </Text>
        <Text style={[sd.seasonCount, { color: colors.mutedForeground }]}>
          {season.episodes.length} ep.
        </Text>
      </Pressable>
      {open && (
        <View style={[sd.episodeList, { borderColor: colors.border + "20" }]}>
          {season.episodes.map((ep) => (
            <EpisodeRow
              key={ep.key}
              ep={ep}
              colors={colors}
              onPlay={() => onPlay(ep)}
              onDelete={() => onDelete(ep)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function SeriesGroupCard({
  group,
  colors,
  onPlayEp,
  onDeleteEp,
  onDeleteAll,
}: {
  group: SeriesGroup;
  colors: any;
  onPlayEp: (ep: DownloadedContent) => void;
  onDeleteEp: (ep: DownloadedContent) => void;
  onDeleteAll: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const totalEps = group.seasons.reduce((s, se) => s + se.episodes.length, 0);

  return (
    <View style={[sd.seriesCard, { backgroundColor: colors.card, borderColor: colors.border + "40" }]}>
      <Pressable onPress={() => setExpanded((v) => !v)}>
        <View style={sd.seriesHeader}>
          {group.poster_path ? (
            <Image source={{ uri: group.poster_path }} style={sd.seriesPoster} contentFit="cover" />
          ) : (
            <View style={[sd.seriesPoster, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
              <Feather name="tv" size={18} color={colors.mutedForeground} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[sd.seriesTitle, { color: colors.foreground }]} numberOfLines={2}>
              {group.seriesTitle}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
              <View style={[sd.typeBadge, { backgroundColor: "#1a3a1a" }]}>
                <Text style={sd.typeBadgeText}>SÉRIE</Text>
              </View>
              <Text style={{ color: GREEN, fontSize: 11, fontWeight: "700" }}>
                {downloadsManager.formatSize(group.totalSize)}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                {totalEps} ep · {group.seasons.length} temp.
              </Text>
            </View>
            {group.minExpiry !== Infinity && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 }}>
                <Feather
                  name="clock"
                  size={9}
                  color={group.minExpiry <= 3 ? "#f87171" : colors.mutedForeground}
                />
                <Text style={{ color: group.minExpiry <= 3 ? "#f87171" : colors.mutedForeground, fontSize: 10 }}>
                  {group.minExpiry === 0
                    ? "Algum ep. expira hoje"
                    : `Próx. expiração em ${group.minExpiry}d`}
                </Text>
              </View>
            )}
          </View>
          <View style={{ alignItems: "center", gap: 8 }}>
            <Feather
              name={expanded ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.mutedForeground}
            />
            <TouchableOpacity onPress={onDeleteAll} style={{ padding: 6 }}>
              <Feather name="trash-2" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>

      {expanded && (
        <View style={[sd.seasonsWrap, { borderTopColor: colors.border + "30" }]}>
          {group.seasons.map((s) => (
            <SeasonSection
              key={s.season}
              season={s}
              colors={colors}
              onPlay={onPlayEp}
              onDelete={onDeleteEp}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function DownloadsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [downloads, setDownloads] = useState<DownloadedContent[]>([]);
  const [activeList, setActiveList] = useState<ActiveDownload[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [showQuality, setShowQuality] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const all = await downloadsManager.getAll();
    setDownloads(all);
    setActiveList(getActiveDownloads());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    getSettings().then(setSettings);
    const unsub = subscribeDownloads(() => {
      setActiveList(getActiveDownloads());
      downloadsManager.getAll().then(setDownloads);
    });
    return unsub;
  }, [load]);

  const handleDelete = (item: DownloadedContent) => {
    Alert.alert(
      "Remover download",
      `Remover "${item.title}" dos downloads?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => { await downloadsManager.remove(item.key); load(); },
        },
      ]
    );
  };

  const handleDeleteSeries = (group: SeriesGroup) => {
    const total = group.seasons.reduce((s, se) => s + se.episodes.length, 0);
    Alert.alert(
      "Remover série",
      `Remover ${total} episódio${total !== 1 ? "s" : ""} de "${group.seriesTitle}" dos downloads?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover tudo",
          style: "destructive",
          onPress: async () => {
            for (const se of group.seasons)
              for (const ep of se.episodes)
                await downloadsManager.remove(ep.key);
            load();
          },
        },
      ]
    );
  };

  const handleCancelActive = (key: string) => downloadsManager.cancelDownload(key);

  const handleClearAll = () => {
    Alert.alert("Limpar downloads", "Remover todos os downloads salvos?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover tudo",
        style: "destructive",
        onPress: async () => {
          for (const d of downloads) await downloadsManager.remove(d.key);
          load();
        },
      },
    ]);
  };

  const updateDownloadSetting = async <K extends keyof UserSettings>(key: K, val: UserSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
    await updateSetting(key, val);
  };

  const goToDetail = (item: DownloadedContent, tab?: "episodes") => {
    router.push({
      pathname: "/detail",
      params: {
        type: item.type,
        id: String(item.tmdb_id),
        title: item.title,
        ...(tab ? { tab } : {}),
      },
    });
  };

  const movies = downloads.filter((d) => d.type === "movie" || (!d.season && !d.episode));
  const tvEpisodes = downloads.filter((d) => d.type === "tv" && (d.season != null || d.episode != null));
  const seriesGroups = groupBySeries(tvEpisodes);

  const totalMb = downloads.reduce((s, i) => s + i.size_mb, 0);
  const activeMb = activeList.reduce((s, i) => s + Math.round((i.progress / 100) * i.size_mb), 0);
  const usedMb = totalMb + activeMb;
  const usedPct = Math.min(usedMb / MAX_STORAGE_MB, 1);

  return (
    <View style={[sd.container, { backgroundColor: colors.background }]}>
      <StatusBar style="auto" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={{ height: topPad + 10 }} />

        {/* Header */}
        <View style={sd.headerRow}>
          <View>
            <Text style={[sd.headerTitle, { color: colors.foreground }]}>Downloads</Text>
            <Text style={[sd.headerSub, { color: colors.mutedForeground }]}>Assista sem internet</Text>
          </View>
          {downloads.length > 0 && (
            <TouchableOpacity
              onPress={handleClearAll}
              style={[sd.clearAllTopBtn, { borderColor: RED + "40", backgroundColor: RED + "09" }]}
            >
              <Feather name="trash" size={13} color={RED} />
              <Text style={{ color: RED, fontSize: 12, fontWeight: "700" }}>Limpar</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Storage card */}
        <View style={[sd.storageCard, { backgroundColor: colors.card, borderColor: colors.primary + "30" }]}>
          <View style={sd.storageRow}>
            <View style={[sd.storageIcon, { backgroundColor: RED + "22" }]}>
              <Feather name="hard-drive" size={20} color={RED} />
            </View>
            <View style={sd.storageInfo}>
              <Text style={[sd.storageTitle, { color: colors.foreground }]}>Armazenamento</Text>
              <Text style={[sd.storageUsed, { color: colors.mutedForeground }]}>
                {downloadsManager.formatSize(usedMb)} de {downloadsManager.formatSize(MAX_STORAGE_MB)} utilizados
              </Text>
            </View>
            <Text style={[sd.storagePct, { color: usedPct > 0.85 ? "#f87171" : RED }]}>
              {Math.round(usedPct * 100)}%
            </Text>
          </View>
          <View style={[sd.storageBg, { backgroundColor: colors.muted }]}>
            <View
              style={[
                sd.storageFill,
                {
                  width: `${usedPct * 100}%` as any,
                  backgroundColor: usedPct > 0.85 ? "#f87171" : RED,
                },
              ]}
            />
          </View>
          {usedPct > 0.85 && (
            <Text style={{ color: "#f87171", fontSize: 11, marginTop: 8 }}>
              ⚠️ Armazenamento quase cheio. Remova downloads para liberar espaço.
            </Text>
          )}
        </View>

        {/* Settings card */}
        <View style={[sd.settingsCard, { backgroundColor: colors.card, borderColor: colors.border + "50" }]}>
          <Pressable style={sd.settingRow} onPress={() => updateDownloadSetting("wifiOnly", !settings.wifiOnly)}>
            <View style={[sd.settingIcon, { backgroundColor: "#06b6d422" }]}>
              <Feather name="wifi" size={16} color="#06b6d4" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[sd.settingLabel, { color: colors.foreground }]}>Somente via Wi-Fi</Text>
              <Text style={[sd.settingHint, { color: colors.mutedForeground }]}>
                {settings.wifiOnly ? "Downloads pausados em dados móveis" : "Downloads em qualquer rede"}
              </Text>
            </View>
            <View style={[sd.toggle, settings.wifiOnly && { backgroundColor: RED }]}>
              <View style={[sd.toggleKnob, settings.wifiOnly && sd.toggleKnobOn]} />
            </View>
          </Pressable>

          <View style={[sd.sep, { backgroundColor: colors.border + "40" }]} />

          <Pressable style={sd.settingRow} onPress={() => updateDownloadSetting("smartDownload", !settings.smartDownload)}>
            <View style={[sd.settingIcon, { backgroundColor: "#22c55e22" }]}>
              <Feather name="zap" size={16} color="#22c55e" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[sd.settingLabel, { color: colors.foreground }]}>Download Inteligente</Text>
              <Text style={[sd.settingHint, { color: colors.mutedForeground }]}>
                {settings.smartDownload ? "Prioriza qualidade x espaço disponível" : "Usa sempre a qualidade selecionada"}
              </Text>
            </View>
            <View style={[sd.toggle, settings.smartDownload && { backgroundColor: RED }]}>
              <View style={[sd.toggleKnob, settings.smartDownload && sd.toggleKnobOn]} />
            </View>
          </Pressable>

          <View style={[sd.sep, { backgroundColor: colors.border + "40" }]} />

          <Pressable style={sd.settingRow} onPress={() => setShowQuality((v) => !v)}>
            <View style={[sd.settingIcon, { backgroundColor: "#f59e0b22" }]}>
              <Feather name="sliders" size={16} color="#f59e0b" />
            </View>
            <Text style={[sd.settingLabel, { color: colors.foreground }]}>Qualidade de Download</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                {settings.downloadQuality?.split("(")[1]?.replace(")", "") ?? "720p"}
              </Text>
              <Feather name={showQuality ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
            </View>
          </Pressable>

          {showQuality && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 2 }}>
              {QUALITY_OPTIONS.map((q) => {
                const selected = settings.downloadQuality === q;
                return (
                  <Pressable
                    key={q}
                    onPress={() => { updateDownloadSetting("downloadQuality", q); setShowQuality(false); }}
                    style={({ pressed }) => [{
                      flexDirection: "row" as const, alignItems: "center" as const, gap: 10,
                      paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8,
                      backgroundColor: pressed ? RED + "15" : "transparent",
                    }]}
                  >
                    <View style={{
                      width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                      borderColor: selected ? RED : colors.border,
                      backgroundColor: selected ? RED : "transparent",
                      alignItems: "center", justifyContent: "center",
                    }}>
                      {selected && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />}
                    </View>
                    <Text style={{ color: selected ? RED : colors.foreground, fontSize: 14, fontWeight: selected ? "700" : "500" }}>
                      {q}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Active downloads */}
        {activeList.length > 0 && (
          <>
            <View style={sd.sectionHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator size="small" color={RED} />
                <Text style={[sd.sectionTitle, { color: colors.foreground }]}>Baixando</Text>
              </View>
              <Text style={[sd.sectionCount, { color: colors.mutedForeground }]}>
                {activeList.length} ativo{activeList.length !== 1 ? "s" : ""}
              </Text>
            </View>
            <View style={{ paddingHorizontal: 20, gap: 10, marginBottom: 20 }}>
              {activeList.map((item) => (
                <ActiveDownloadCard key={item.key} item={item} onCancel={() => handleCancelActive(item.key)} />
              ))}
            </View>
          </>
        )}

        {/* Empty state */}
        {loading ? (
          <ActivityIndicator color={RED} style={{ marginTop: 32 }} />
        ) : downloads.length === 0 && activeList.length === 0 ? (
          <View style={sd.emptyWrap}>
            <View style={[sd.emptyIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="download-cloud" size={36} color={colors.mutedForeground} />
            </View>
            <Text style={[sd.emptyTitle, { color: colors.foreground }]}>Nenhum download</Text>
            <Text style={[sd.emptyDesc, { color: colors.mutedForeground }]}>
              Toque em ↓ ao lado de um episódio ou no botão "Download" na tela de um filme.{"\n"}
              Disponíveis por 20 dias.
            </Text>
          </View>
        ) : (
          <>
            {/* Series section */}
            {seriesGroups.length > 0 && (
              <>
                <View style={sd.sectionHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Feather name="tv" size={15} color={colors.foreground} />
                    <Text style={[sd.sectionTitle, { color: colors.foreground }]}>Séries</Text>
                  </View>
                  <Text style={[sd.sectionCount, { color: colors.mutedForeground }]}>
                    {seriesGroups.length} série{seriesGroups.length !== 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 20, gap: 12, marginBottom: 20 }}>
                  {seriesGroups.map((group) => (
                    <SeriesGroupCard
                      key={group.tmdb_id}
                      group={group}
                      colors={colors}
                      onPlayEp={(ep) => goToDetail(ep, "episodes")}
                      onDeleteEp={handleDelete}
                      onDeleteAll={() => handleDeleteSeries(group)}
                    />
                  ))}
                </View>
              </>
            )}

            {/* Movies section */}
            {movies.length > 0 && (
              <>
                <View style={sd.sectionHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Feather name="film" size={15} color={colors.foreground} />
                    <Text style={[sd.sectionTitle, { color: colors.foreground }]}>Filmes</Text>
                  </View>
                  <Text style={[sd.sectionCount, { color: colors.mutedForeground }]}>
                    {movies.length} {movies.length === 1 ? "filme" : "filmes"}
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 8 }}
                  style={{ marginBottom: 20 }}
                >
                  {movies.map((item) => (
                    <MovieCard
                      key={item.key}
                      item={item}
                      colors={colors}
                      onPlay={() => goToDetail(item)}
                      onDelete={() => handleDelete(item)}
                    />
                  ))}
                </ScrollView>
              </>
            )}
          </>
        )}

        {/* Tip + Browse */}
        <View style={[sd.tipCard, { backgroundColor: "#06b6d411", borderColor: "#06b6d430" }]}>
          <Feather name="info" size={14} color="#06b6d4" />
          <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
            Downloads ficam disponíveis por 20 dias. Armazenamento máximo: {downloadsManager.formatSize(MAX_STORAGE_MB)}.
          </Text>
        </View>

        <View style={{ marginHorizontal: 20, alignItems: "center", paddingVertical: 16, gap: 8 }}>
          <Text style={[{ fontSize: 16, fontWeight: "700" }, { color: colors.foreground }]}>Adicionar mais conteúdo</Text>
          <Text style={[{ fontSize: 13 }, { color: colors.mutedForeground }]}>Encontre filmes e séries para baixar</Text>
          <Pressable
            style={[sd.browseBtn, { overflow: "hidden" }]}
            onPress={() => router.push("/(tabs)/descobrir" as any)}
          >
            <LinearGradient colors={[RED, "#8b0000"]} style={StyleSheet.absoluteFill} />
            <Feather name="compass" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Explorar Catálogo</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sd = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, marginBottom: 20,
  },
  headerTitle: { fontSize: 28, fontWeight: "800" },
  headerSub: { fontSize: 13, marginTop: 2 },
  clearAllTopBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
  },
  storageCard: {
    marginHorizontal: 20, borderRadius: 18, padding: 18,
    borderWidth: 1, marginBottom: 16,
  },
  storageRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  storageIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  storageInfo: { flex: 1 },
  storageTitle: { fontSize: 15, fontWeight: "700" },
  storageUsed: { fontSize: 12, marginTop: 2 },
  storagePct: { fontSize: 16, fontWeight: "800" },
  storageBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  storageFill: { height: 6, borderRadius: 3 },
  settingsCard: {
    marginHorizontal: 20, borderRadius: 18, overflow: "hidden",
    borderWidth: 1, marginBottom: 20,
  },
  settingRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  settingIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  settingLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
  settingHint: { fontSize: 11, marginTop: 1 },
  toggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", padding: 2,
  },
  toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.5)" },
  toggleKnobOn: { backgroundColor: "#fff", alignSelf: "flex-end" },
  sep: { height: 1, marginLeft: 62 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: "800" },
  sectionCount: { fontSize: 13 },
  // Series card
  seriesCard: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  seriesHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  seriesPoster: { width: 56, height: 80, borderRadius: 10 },
  seriesTitle: { fontSize: 15, fontWeight: "700" },
  seasonsWrap: { borderTopWidth: 1, paddingTop: 4, paddingBottom: 8 },
  seasonHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1,
  },
  seasonLabel: { flex: 1, fontSize: 13, fontWeight: "700" },
  seasonCount: { fontSize: 11 },
  episodeList: { borderBottomWidth: 0 },
  // Episode row
  epRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1,
  },
  epThumbWrap: { width: 52, height: 36, borderRadius: 8, overflow: "hidden", position: "relative" },
  epThumb: { width: 52, height: 36 },
  epPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  epNumBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  epTitle: { fontSize: 12, fontWeight: "600", flex: 1 },
  // Movie card
  movieCard: {
    width: 140, borderRadius: 14, borderWidth: 1, overflow: "hidden",
  },
  moviePoster: { width: 140, height: 100 },
  moviePlayOverlay: {
    position: "absolute", bottom: 8, right: 8,
  },
  playCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  movieInfo: { padding: 10 },
  movieTitle: { fontSize: 12, fontWeight: "700" },
  qualityBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  // Shared
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  dlCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 16, padding: 14, borderWidth: 1,
  },
  dlThumb: { width: 56, height: 80, borderRadius: 10 },
  dlInfo: { flex: 1, gap: 2 },
  dlTitle: { fontSize: 15, fontWeight: "700" },
  dlSub: { fontSize: 11 },
  emptyWrap: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 32, gap: 14 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800" },
  emptyDesc: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  tipCard: {
    marginHorizontal: 20, flexDirection: "row", gap: 10, padding: 14,
    borderRadius: 14, borderWidth: 1, marginBottom: 24,
  },
  browseBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginTop: 8,
  },
});
