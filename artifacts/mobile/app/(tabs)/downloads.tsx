import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { downloadsManager, type DownloadedContent } from "@/lib/downloads";

const { width: SW } = Dimensions.get("window");
const BG = "#050505";
const RED = "#e50914";
const GLASS = "rgba(255,255,255,0.05)";
const GLASS_B = "rgba(255,255,255,0.09)";

const QUALITY_OPTIONS = ["Padrão (480p)", "Boa (720p)", "Ótima (1080p)"];

function DownloadCard({ item, onDelete }: { item: DownloadedContent; onDelete: () => void }) {
  const router = useRouter();
  const days = downloadsManager.daysRemaining(item);
  const urgent = days <= 3;

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/detail", params: { type: item.type, id: String(item.tmdb_id), title: item.title } })
      }
      style={({ pressed }) => [s.dlCard, { opacity: pressed ? 0.8 : 1 }]}
    >
      {item.poster_path ? (
        <Image source={{ uri: item.poster_path }} style={s.dlThumb} contentFit="cover" />
      ) : (
        <View style={[s.dlThumb, { backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }]}>
          <Feather name="film" size={24} color="#444" />
        </View>
      )}
      <View style={s.dlInfo}>
        <Text style={s.dlTitle} numberOfLines={1}>{item.title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
          <View style={[s.typeBadge, { backgroundColor: item.type === "movie" ? "#1a1a6e" : "#1a3a1a" }]}>
            <Text style={s.typeBadgeText}>{item.type === "movie" ? "FILME" : "SÉRIE"}</Text>
          </View>
          <Text style={s.dlSize}>{downloadsManager.formatSize(item.size_mb)} · Offline</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
          <Feather name="clock" size={10} color={urgent ? "#f87171" : "rgba(255,255,255,0.35)"} />
          <Text style={[s.dlExpiry, urgent && { color: "#f87171" }]}>
            {days === 0 ? "Expira hoje" : `Expira em ${days} dia${days !== 1 ? "s" : ""}`}
          </Text>
        </View>
      </View>
      <View style={s.dlActions}>
        <Feather name="check-circle" size={18} color="#22c55e" />
        <TouchableOpacity onPress={onDelete} style={{ padding: 8, marginTop: 4 }}>
          <Feather name="trash-2" size={16} color="rgba(255,255,255,0.3)" />
        </TouchableOpacity>
      </View>
    </Pressable>
  );
}

export default function DownloadsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [quality, setQuality] = useState(1);
  const [showQuality, setShowQuality] = useState(false);
  const [smartDownload, setSmartDownload] = useState(true);
  const [wifiOnly, setWifiOnly] = useState(true);
  const [downloads, setDownloads] = useState<DownloadedContent[]>([]);
  const [loading, setLoading] = useState(true);
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const load = useCallback(async () => {
    setLoading(true);
    const all = await downloadsManager.getAll();
    setDownloads(all);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (item: DownloadedContent) => {
    Alert.alert("Remover download", `Remover "${item.title}" dos downloads?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover", style: "destructive",
        onPress: async () => { await downloadsManager.remove(item.key); load(); },
      },
    ]);
  };

  const totalMb = downloads.reduce((s, i) => s + i.size_mb, 0);
  const MAX_MB = 10240;
  const usedPct = Math.min(totalMb / MAX_MB, 1);

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={{ height: topPad + 10 }} />

        <View style={s.headerRow}>
          <View>
            <Text style={s.headerTitle}>Downloads</Text>
            <Text style={s.headerSub}>Assista sem internet</Text>
          </View>
          <Pressable style={s.headerAdd} onPress={() => router.push("/(tabs)/search")}>
            <Feather name="plus" size={20} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>

        {/* Storage card */}
        <View style={s.storageCard}>
          <LinearGradient colors={["#1a0000", "#0a0000"]} style={StyleSheet.absoluteFill} />
          <View style={s.storageRow}>
            <View style={s.storageIcon}>
              <Feather name="hard-drive" size={20} color={RED} />
            </View>
            <View style={s.storageInfo}>
              <Text style={s.storageTitle}>Armazenamento</Text>
              <Text style={s.storageUsed}>
                {downloadsManager.formatSize(totalMb)} de {downloadsManager.formatSize(MAX_MB)} utilizados
              </Text>
            </View>
            <Text style={s.storagePct}>{Math.round(usedPct * 100)}%</Text>
          </View>
          <View style={s.storageBg}>
            <View style={[s.storageFill, { width: `${usedPct * 100}%` as any }]} />
          </View>
        </View>

        {/* Settings card */}
        <View style={s.settingsCard}>
          <Pressable style={s.settingRow} onPress={() => setWifiOnly(v => !v)}>
            <View style={[s.settingIcon, { backgroundColor: "#06b6d422" }]}>
              <Feather name="wifi" size={16} color="#06b6d4" />
            </View>
            <Text style={s.settingLabel}>Somente via Wi-Fi</Text>
            <View style={[s.toggle, wifiOnly && s.toggleOn]}>
              <View style={[s.toggleKnob, wifiOnly && s.toggleKnobOn]} />
            </View>
          </Pressable>
          <View style={s.sep} />
          <Pressable style={s.settingRow} onPress={() => setSmartDownload(v => !v)}>
            <View style={[s.settingIcon, { backgroundColor: "#22c55e22" }]}>
              <Feather name="zap" size={16} color="#22c55e" />
            </View>
            <Text style={s.settingLabel}>Download Inteligente</Text>
            <View style={[s.toggle, smartDownload && s.toggleOn]}>
              <View style={[s.toggleKnob, smartDownload && s.toggleKnobOn]} />
            </View>
          </Pressable>
          <View style={s.sep} />
          <Pressable style={s.settingRow} onPress={() => setShowQuality(v => !v)}>
            <View style={[s.settingIcon, { backgroundColor: "#f59e0b22" }]}>
              <Feather name="sliders" size={16} color="#f59e0b" />
            </View>
            <Text style={s.settingLabel}>Qualidade de Download</Text>
            <View style={s.settingRight}>
              <Text style={s.settingValue}>{QUALITY_OPTIONS[quality].split(" ")[0]}</Text>
              <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.3)" />
            </View>
          </Pressable>
          {showQuality && (
            <View style={s.qualityPicker}>
              {QUALITY_OPTIONS.map((q, i) => (
                <Pressable
                  key={q}
                  style={[s.qualityOpt, i === quality && s.qualityOptActive]}
                  onPress={() => { setQuality(i); setShowQuality(false); }}
                >
                  {i === quality && <Feather name="check" size={14} color={RED} />}
                  <Text style={[s.qualityLabel, i === quality && { color: RED }]}>{q}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Downloads list */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Meus Downloads</Text>
          <Text style={s.sectionCount}>{downloads.length} {downloads.length === 1 ? "item" : "itens"}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={RED} style={{ marginTop: 32 }} />
        ) : downloads.length === 0 ? (
          <View style={s.emptyWrap}>
            <Feather name="download" size={48} color="#222" />
            <Text style={s.emptyTitle}>Nenhum download</Text>
            <Text style={s.emptyDesc}>
              Toque em "Download" na tela de um filme ou série.{"\n"}Downloads ficam disponíveis por 20 dias.
            </Text>
          </View>
        ) : (
          <>
            <View style={s.dlList}>
              {downloads.map(item => (
                <DownloadCard key={item.key} item={item} onDelete={() => handleDelete(item)} />
              ))}
            </View>
            <TouchableOpacity
              style={s.clearAllBtn}
              onPress={() =>
                Alert.alert("Limpar downloads", "Remover todos os downloads?", [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Remover tudo", style: "destructive",
                    onPress: async () => {
                      for (const d of downloads) await downloadsManager.remove(d.key);
                      load();
                    },
                  },
                ])
              }
            >
              <Feather name="trash" size={13} color={RED} />
              <Text style={s.clearAllText}>Remover todos</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={s.tipCard}>
          <Feather name="info" size={14} color="#06b6d4" />
          <Text style={s.tipText}>
            Downloads ficam disponíveis por 20 dias. Abra o conteúdo para assistir offline.
          </Text>
        </View>

        <View style={s.emptySection}>
          <Text style={s.emptySectionTitle}>Adicionar mais conteúdo</Text>
          <Text style={s.emptySectionSub}>Encontre filmes e séries para baixar</Text>
          <Pressable style={s.browseBtn} onPress={() => router.push("/(tabs)/descobrir")}>
            <LinearGradient colors={[RED, "#8b0000"]} style={StyleSheet.absoluteFill} />
            <Feather name="compass" size={16} color="#fff" />
            <Text style={s.browseBtnText}>Explorar Catálogo</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  headerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, marginBottom: 20,
  },
  headerTitle: { color: "#fff", fontSize: 28, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 2 },
  headerAdd: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_B,
    alignItems: "center", justifyContent: "center",
  },
  storageCard: {
    marginHorizontal: 20, borderRadius: 18, padding: 18,
    overflow: "hidden", borderWidth: 1, borderColor: "rgba(229,9,20,0.2)", marginBottom: 16,
  },
  storageRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  storageIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(229,9,20,0.15)", alignItems: "center", justifyContent: "center",
  },
  storageInfo: { flex: 1 },
  storageTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  storageUsed: { color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 },
  storagePct: { color: RED, fontSize: 16, fontWeight: "800" },
  storageBg: { height: 6, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" },
  storageFill: { height: 6, backgroundColor: RED, borderRadius: 3 },
  settingsCard: {
    marginHorizontal: 20, borderRadius: 18, overflow: "hidden",
    backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_B, marginBottom: 20,
  },
  settingRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  settingIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  settingLabel: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "500" },
  settingRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  settingValue: { color: "rgba(255,255,255,0.4)", fontSize: 13 },
  toggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", padding: 2,
  },
  toggleOn: { backgroundColor: RED },
  toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.5)" },
  toggleKnobOn: { backgroundColor: "#fff", alignSelf: "flex-end" },
  sep: { height: 1, backgroundColor: GLASS_B, marginLeft: 62 },
  qualityPicker: { paddingHorizontal: 16, paddingBottom: 12, gap: 4 },
  qualityOpt: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  qualityOptActive: {},
  qualityLabel: { color: "rgba(255,255,255,0.6)", fontSize: 14 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, marginBottom: 12,
  },
  sectionTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  sectionCount: { color: "rgba(255,255,255,0.35)", fontSize: 13 },
  dlList: { paddingHorizontal: 20, gap: 12, marginBottom: 16 },
  dlCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: GLASS, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: GLASS_B,
  },
  dlThumb: { width: 56, height: 80, borderRadius: 10 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  dlInfo: { flex: 1, gap: 2 },
  dlTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  dlSize: { color: "#22c55e", fontSize: 11 },
  dlExpiry: { color: "rgba(255,255,255,0.35)", fontSize: 10 },
  dlActions: { alignItems: "center", justifyContent: "center", gap: 4 },
  emptyWrap: {
    alignItems: "center", paddingVertical: 40, paddingHorizontal: 32, gap: 12,
  },
  emptyTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  emptyDesc: { color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", lineHeight: 20 },
  clearAllBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginHorizontal: 20, marginBottom: 16, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(229,9,20,0.25)", backgroundColor: "rgba(229,9,20,0.06)",
  },
  clearAllText: { color: RED, fontSize: 13, fontWeight: "700" },
  tipCard: {
    marginHorizontal: 20, flexDirection: "row", gap: 10, padding: 14,
    backgroundColor: "rgba(6,182,212,0.08)", borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(6,182,212,0.2)", marginBottom: 24,
  },
  tipText: { flex: 1, color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 18 },
  emptySection: { marginHorizontal: 20, alignItems: "center", paddingVertical: 16, gap: 8 },
  emptySectionTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  emptySectionSub: { color: "rgba(255,255,255,0.4)", fontSize: 13 },
  browseBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, overflow: "hidden", marginTop: 8,
  },
  browseBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
