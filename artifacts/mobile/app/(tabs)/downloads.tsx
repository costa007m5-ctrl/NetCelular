import React, { useState } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SW } = Dimensions.get("window");
const BG = "#050505";
const RED = "#e50914";
const GLASS = "rgba(255,255,255,0.05)";
const GLASS_B = "rgba(255,255,255,0.09)";

const QUALITY_OPTIONS = ["Padrão (480p)", "Boa (720p)", "Ótima (1080p)"];

const SAMPLE_DOWNLOADS = [
  {
    id: 1, title: "Stranger Things", ep: "S4 · E9", size: "1.2 GB",
    progress: 1.0, thumb: null, color: "#7c3aed",
  },
  {
    id: 2, title: "The Batman", ep: "Filme · 2022", size: "2.8 GB",
    progress: 1.0, thumb: null, color: "#1a56db",
  },
  {
    id: 3, title: "Oppenheimer", ep: "Filme · 2023", size: "3.1 GB",
    progress: 0.62, thumb: null, color: "#d97706",
  },
];

function DownloadCard({ item }: { item: typeof SAMPLE_DOWNLOADS[0] }) {
  const router = useRouter();
  const done = item.progress >= 1.0;
  return (
    <Pressable
      onPress={() => done && router.push({ pathname: "/player", params: { id: String(item.id) } })}
      style={({ pressed }) => [s.dlCard, { opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={[s.dlThumb, { backgroundColor: item.color + "33" }]}>
        <Feather name="film" size={24} color={item.color} />
        {done && (
          <View style={[s.dlPlayBtn, { backgroundColor: item.color }]}>
            <Feather name="play" size={10} color="#fff" />
          </View>
        )}
      </View>
      <View style={s.dlInfo}>
        <Text style={s.dlTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={s.dlEp}>{item.ep}</Text>
        {!done ? (
          <View style={s.progressWrap}>
            <View style={s.progressBg}>
              <View style={[s.progressFill, { width: `${item.progress * 100}%` as any, backgroundColor: item.color }]} />
            </View>
            <Text style={[s.progressPct, { color: item.color }]}>{Math.round(item.progress * 100)}%</Text>
          </View>
        ) : (
          <Text style={s.dlSize}>{item.size} · Disponível offline</Text>
        )}
      </View>
      <View style={s.dlActions}>
        {done ? (
          <Feather name="check-circle" size={18} color="#22c55e" />
        ) : (
          <Feather name="download" size={18} color="rgba(255,255,255,0.3)" />
        )}
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
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const totalSize = "4.0 GB";
  const usedPct = 0.38;

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

        <View style={s.storageCard}>
          <LinearGradient colors={["#1a0000", "#0a0000"]} style={StyleSheet.absoluteFill} />
          <View style={s.storageRow}>
            <View style={s.storageIcon}>
              <Feather name="hard-drive" size={20} color={RED} />
            </View>
            <View style={s.storageInfo}>
              <Text style={s.storageTitle}>Armazenamento</Text>
              <Text style={s.storageUsed}>{totalSize} de 10.6 GB utilizados</Text>
            </View>
            <Text style={s.storagePct}>{Math.round(usedPct * 100)}%</Text>
          </View>
          <View style={s.storageBg}>
            <View style={[s.storageFill, { width: `${usedPct * 100}%` as any }]} />
          </View>
        </View>

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

        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Meus Downloads</Text>
          <Text style={s.sectionCount}>{SAMPLE_DOWNLOADS.length} itens</Text>
        </View>

        <View style={s.dlList}>
          {SAMPLE_DOWNLOADS.map(item => (
            <DownloadCard key={item.id} item={item} />
          ))}
        </View>

        <View style={s.tipCard}>
          <Feather name="info" size={14} color="#06b6d4" />
          <Text style={s.tipText}>
            Downloads ficam disponíveis por 30 dias. Após assistir, você tem 24h antes de expirarem.
          </Text>
        </View>

        <View style={s.emptySection}>
          <Text style={s.emptySectionTitle}>Adicionar mais conteúdo</Text>
          <Text style={s.emptySectionSub}>Encontre filmes e séries para baixar</Text>
          <Pressable
            style={s.browseBtn}
            onPress={() => router.push("/(tabs)/descobrir")}
          >
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
    overflow: "hidden", borderWidth: 1, borderColor: "rgba(229,9,20,0.2)",
    marginBottom: 16,
  },
  storageRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  storageIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(229,9,20,0.15)",
    alignItems: "center", justifyContent: "center",
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
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center", padding: 2,
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
  dlList: { paddingHorizontal: 20, gap: 12, marginBottom: 20 },
  dlCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: GLASS, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: GLASS_B,
  },
  dlThumb: {
    width: 56, height: 56, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  dlPlayBtn: {
    position: "absolute", bottom: -4, right: -4,
    width: 20, height: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  dlInfo: { flex: 1, gap: 3 },
  dlTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  dlEp: { color: "rgba(255,255,255,0.45)", fontSize: 12 },
  dlSize: { color: "#22c55e", fontSize: 11, marginTop: 2 },
  progressWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  progressBg: { flex: 1, height: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2 },
  progressPct: { fontSize: 11, fontWeight: "700", width: 32 },
  dlActions: { alignItems: "center", justifyContent: "center" },
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
