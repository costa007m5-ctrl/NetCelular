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

function ProgressBar({ value, color = RED }: { value: number; color?: string }) {
  const anim = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: value, duration: 300, useNativeDriver: false }).start();
  }, [value]);
  return (
    <View style={{ height: 4, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
      <Animated.View
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: color,
          width: anim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
        }}
      />
    </View>
  );
}

function ActiveDownloadCard({ item, onCancel }: { item: ActiveDownload; onCancel: () => void }) {
  const colors = useColors();
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
        <ProgressBar value={item.progress} />
      </View>
      <TouchableOpacity onPress={onCancel} style={{ padding: 8 }}>
        <Feather name="x" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>
    </View>
  );
}

function DownloadCard({ item, onDelete, colors }: { item: DownloadedContent; onDelete: () => void; colors: any }) {
  const router = useRouter();
  const days = downloadsManager.daysRemaining(item);
  const urgent = days <= 3;

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/detail", params: { type: item.type, id: String(item.tmdb_id), title: item.title } })
      }
      style={({ pressed }) => [sd.dlCard, { opacity: pressed ? 0.8 : 1, backgroundColor: colors.card, borderColor: colors.border + "50" }]}
    >
      {item.poster_path ? (
        <Image source={{ uri: item.poster_path }} style={sd.dlThumb} contentFit="cover" />
      ) : (
        <View style={[sd.dlThumb, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
          <Feather name="film" size={20} color={colors.mutedForeground} />
        </View>
      )}
      <View style={sd.dlInfo}>
        <Text style={[sd.dlTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 }}>
          <View style={[sd.typeBadge, { backgroundColor: item.type === "movie" ? "#1a1a6e" : "#1a3a1a" }]}>
            <Text style={sd.typeBadgeText}>{item.type === "movie" ? "FILME" : "SÉRIE"}</Text>
          </View>
          <Text style={{ color: "#22c55e", fontSize: 11, fontWeight: "600" }}>
            {downloadsManager.formatSize(item.size_mb)}
          </Text>
          {item.quality && (
            <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{item.quality.split(" ")[0]}</Text>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
          <Feather name="clock" size={10} color={urgent ? "#f87171" : colors.mutedForeground} />
          <Text style={[sd.dlExpiry, { color: urgent ? "#f87171" : colors.mutedForeground }]}>
            {days === 0 ? "Expira hoje" : `Expira em ${days} dia${days !== 1 ? "s" : ""}`}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: "center", justifyContent: "center", gap: 4 }}>
        <Feather name="check-circle" size={18} color="#22c55e" />
        <TouchableOpacity onPress={onDelete} style={{ padding: 8, marginTop: 4 }}>
          <Feather name="trash-2" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </Pressable>
  );
}

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
    Alert.alert("Remover download", `Remover "${item.title}" dos downloads?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: async () => { await downloadsManager.remove(item.key); load(); },
      },
    ]);
  };

  const handleCancelActive = (key: string) => {
    downloadsManager.cancelDownload(key);
  };

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

  const totalMb = downloads.reduce((s, i) => s + i.size_mb, 0);
  const activeMb = activeList.reduce((s, i) => s + Math.round((i.progress / 100) * i.size_mb), 0);
  const usedMb = totalMb + activeMb;
  const usedPct = Math.min(usedMb / MAX_STORAGE_MB, 1);
  const qualityIdx = QUALITY_OPTIONS.findIndex((q) => settings.downloadQuality?.includes(q.split(" ")[0].replace("(", "").replace(")", ""))) ?? 1;

  const bg = colors.background;

  return (
    <View style={[sd.container, { backgroundColor: bg }]}>
      <StatusBar style="auto" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={{ height: topPad + 10 }} />

        <View style={sd.headerRow}>
          <View>
            <Text style={[sd.headerTitle, { color: colors.foreground }]}>Downloads</Text>
            <Text style={[sd.headerSub, { color: colors.mutedForeground }]}>Assista sem internet</Text>
          </View>
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
            <View style={[sd.storageFill, { width: `${usedPct * 100}%` as any, backgroundColor: usedPct > 0.85 ? "#f87171" : RED }]} />
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
                      width: 18, height: 18, borderRadius: 9,
                      borderWidth: 2, borderColor: selected ? RED : colors.border,
                      backgroundColor: selected ? RED : "transparent",
                      alignItems: "center", justifyContent: "center",
                    }}>
                      {selected && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />}
                    </View>
                    <Text style={{ color: selected ? RED : colors.foreground, fontSize: 14, fontWeight: selected ? "700" : "500" }}>{q}</Text>
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
              <Text style={[sd.sectionCount, { color: colors.mutedForeground }]}>{activeList.length} ativo{activeList.length !== 1 ? "s" : ""}</Text>
            </View>
            <View style={{ paddingHorizontal: 20, gap: 10, marginBottom: 20 }}>
              {activeList.map((item) => (
                <ActiveDownloadCard key={item.key} item={item} onCancel={() => handleCancelActive(item.key)} />
              ))}
            </View>
          </>
        )}

        {/* Downloads list */}
        <View style={sd.sectionHeader}>
          <Text style={[sd.sectionTitle, { color: colors.foreground }]}>Meus Downloads</Text>
          <Text style={[sd.sectionCount, { color: colors.mutedForeground }]}>
            {downloads.length} {downloads.length === 1 ? "item" : "itens"}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={RED} style={{ marginTop: 32 }} />
        ) : downloads.length === 0 && activeList.length === 0 ? (
          <View style={sd.emptyWrap}>
            <Feather name="download" size={48} color={colors.border} />
            <Text style={[sd.emptyTitle, { color: colors.foreground }]}>Nenhum download</Text>
            <Text style={[sd.emptyDesc, { color: colors.mutedForeground }]}>
              Toque em "Download" na tela de um filme ou série.{"\n"}Downloads ficam disponíveis por 20 dias.
            </Text>
          </View>
        ) : (
          <>
            <View style={{ paddingHorizontal: 20, gap: 12, marginBottom: 16 }}>
              {downloads.map((item) => (
                <DownloadCard key={item.key} item={item} onDelete={() => handleDelete(item)} colors={colors} />
              ))}
            </View>
            {downloads.length > 0 && (
              <TouchableOpacity style={[sd.clearAllBtn, { borderColor: RED + "40", backgroundColor: RED + "09" }]} onPress={handleClearAll}>
                <Feather name="trash" size={13} color={RED} />
                <Text style={{ color: RED, fontSize: 13, fontWeight: "700" }}>Remover todos</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <View style={[sd.tipCard, { backgroundColor: "#06b6d411", borderColor: "#06b6d430" }]}>
          <Feather name="info" size={14} color="#06b6d4" />
          <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
            Downloads ficam disponíveis por 20 dias. Armazenamento máximo: {downloadsManager.formatSize(MAX_STORAGE_MB)}.
          </Text>
        </View>

        <View style={{ marginHorizontal: 20, alignItems: "center", paddingVertical: 16, gap: 8 }}>
          <Text style={[{ fontSize: 16, fontWeight: "700" }, { color: colors.foreground }]}>Adicionar mais conteúdo</Text>
          <Text style={[{ fontSize: 13 }, { color: colors.mutedForeground }]}>Encontre filmes e séries para baixar</Text>
          <Pressable style={[sd.browseBtn, { overflow: "hidden" }]} onPress={() => router.push("/(tabs)/descobrir")}>
            <LinearGradient colors={[RED, "#8b0000"]} style={StyleSheet.absoluteFill} />
            <Feather name="compass" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Explorar Catálogo</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const sd = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, marginBottom: 20,
  },
  headerTitle: { fontSize: 28, fontWeight: "800" },
  headerSub: { fontSize: 13, marginTop: 2 },
  headerAdd: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, alignItems: "center", justifyContent: "center",
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
  dlCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 16, padding: 14, borderWidth: 1,
  },
  dlThumb: { width: 56, height: 80, borderRadius: 10 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  dlInfo: { flex: 1, gap: 2 },
  dlTitle: { fontSize: 15, fontWeight: "700" },
  dlSub: { fontSize: 11 },
  dlExpiry: { fontSize: 10 },
  emptyWrap: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "800" },
  emptyDesc: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  clearAllBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginHorizontal: 20, marginBottom: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1,
  },
  tipCard: {
    marginHorizontal: 20, flexDirection: "row", gap: 10, padding: 14,
    borderRadius: 14, borderWidth: 1, marginBottom: 24,
  },
  browseBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginTop: 8,
  },
});
