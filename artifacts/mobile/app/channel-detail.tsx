import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { calcProgress, calcRemaining, fakeViewers, getAccent } from "@/lib/live-tv-api";

const { width: W } = Dimensions.get("window");

const NEXT_PROGRAMS = [
  { time: "23:30", title: "Programação ao Vivo", duration: "60 min" },
  { time: "00:30", title: "Boletim Especial", duration: "30 min" },
  { time: "01:00", title: "Reprise do Dia", duration: "60 min" },
];

export default function ChannelDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 16 : insets.top;

  const params = useLocalSearchParams<{
    channelId: string;
    channelName: string;
    channelImage: string;
    channelPreview: string;
    channelUrl: string;
    epgTitle: string;
    epgDesc: string;
    epgStart: string;
  }>();

  const {
    channelId = "",
    channelName = "Canal",
    channelImage = "",
    channelPreview = "",
    channelUrl = "",
    epgTitle = "Ao Vivo",
    epgDesc = "",
    epgStart = "",
  } = params;

  const accent = getAccent(channelId);
  const progress = epgStart ? calcProgress(epgStart) : 45;
  const remaining = epgStart ? calcRemaining(epgStart) : "AO VIVO";
  const viewers = fakeViewers(channelId);

  const [favorited, setFavorited] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const goToPlayer = () => {
    router.push({
      pathname: "/player",
      params: {
        type: "live",
        id: "0",
        streamUrl: channelUrl,
        isLive: "true",
        title: epgTitle ? `${channelName} • ${epgTitle}` : channelName,
      },
    });
  };

  const details = [
    { icon: "globe", label: "Idioma", value: "Português" },
    { icon: "monitor", label: "Qualidade", value: "HD 1080p" },
    { icon: "radio", label: "Transmissão", value: "Ao Vivo" },
    { icon: "lock", label: "Classificação", value: "Livre" },
    { icon: "clock", label: "Restante", value: remaining },
    { icon: "eye", label: "Assistindo", value: viewers },
  ] as const;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* BACKDROP */}
      <View style={styles.backdropWrap}>
        <Image
          source={{ uri: channelPreview || channelImage }}
          style={styles.backdropImg}
          resizeMode="cover"
        />
        <LinearGradient
          colors={["rgba(0,0,0,0.65)", "transparent"]}
          style={[StyleSheet.absoluteFillObject, { height: 180 }]}
        />
        <LinearGradient
          colors={["transparent", "rgba(10,10,10,0.55)", "#0a0a0a"]}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Glow */}
        <View style={[styles.glowBlob, { backgroundColor: accent + "20" }]} pointerEvents="none" />

        {/* Top nav */}
        <View style={[styles.topNav, { paddingTop: topPad + 12 }]}>
          <Pressable onPress={() => router.back()} style={styles.navBtn}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </Pressable>
          <View style={styles.navRight}>
            <Pressable style={styles.navBtn}>
              <Feather name="cast" size={18} color="#fff" />
            </Pressable>
            <Pressable style={styles.navBtn}>
              <Feather name="more-vertical" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Channel logo + badge */}
        <View style={styles.channelBadgeRow}>
          <View style={[styles.channelLogoWrap, { borderColor: accent + "60", backgroundColor: accent + "20" }]}>
            <Image source={{ uri: channelImage }} style={styles.channelLogoImg} resizeMode="contain" />
          </View>
          <View>
            <View style={styles.liveRow}>
              <View style={[styles.livePill, { backgroundColor: accent + "30", borderColor: accent + "60" }]}>
                <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
                <Text style={[styles.livePillText, { color: accent }]}>AO VIVO</Text>
              </View>
              <Text style={styles.viewersText}>{viewers} assistindo</Text>
            </View>
            <Text style={styles.channelNameText}>{channelName}</Text>
          </View>
        </View>
      </View>

      {/* SCROLLABLE CONTENT */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <View style={styles.contentPad}>

            {/* Title + meta */}
            <Text style={styles.epgTitle} numberOfLines={2}>{epgTitle}</Text>
            <View style={styles.metaRow}>
              <View style={[styles.metaTag, { backgroundColor: accent + "20", borderColor: accent + "50" }]}>
                <Text style={[styles.metaTagText, { color: accent }]}>Esportes</Text>
              </View>
              <Text style={styles.metaSep}>•</Text>
              <Text style={styles.metaText}>Ao Vivo</Text>
              <Text style={styles.metaSep}>•</Text>
              <Text style={styles.metaText}>HD</Text>
              <Text style={styles.metaSep}>•</Text>
              <Text style={styles.metaText}>{remaining}</Text>
            </View>

            {/* Progress */}
            <View style={styles.progressWrap}>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${progress}%` as any, backgroundColor: accent, shadowColor: accent }]} />
              </View>
              <Text style={styles.progressLabel}>{Math.round(progress)}% transmitido</Text>
            </View>

            {/* Synopsis */}
            {!!epgDesc && (
              <Text style={styles.synopsis}>{epgDesc}</Text>
            )}

            {/* Details grid */}
            <View style={styles.detailsGrid}>
              {details.map((d) => (
                <View key={d.label} style={styles.detailCell}>
                  <Feather name={d.icon as any} size={16} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.detailLabel}>{d.label}</Text>
                  <Text style={styles.detailValue}>{d.value}</Text>
                </View>
              ))}
            </View>

            {/* Action buttons */}
            <View style={styles.actionsRow}>
              <Pressable
                style={({ pressed }) => [styles.watchBtn, { backgroundColor: accent, shadowColor: accent, opacity: pressed ? 0.85 : 1 }]}
                onPress={goToPlayer}
              >
                <Text style={styles.watchBtnPlay}>▶</Text>
                <Text style={styles.watchBtnText}>Assistir Agora</Text>
              </Pressable>
              <Pressable
                onPress={() => setFavorited((v) => !v)}
                style={[styles.iconAction, favorited && { backgroundColor: accent + "25", borderColor: accent + "60" }]}
              >
                <Text style={[styles.iconActionText, favorited && { color: accent }]}>{favorited ? "★" : "☆"}</Text>
              </Pressable>
              <Pressable style={styles.iconAction}>
                <Feather name="download" size={18} color="rgba(255,255,255,0.7)" />
              </Pressable>
              <Pressable style={styles.iconAction}>
                <Feather name="share-2" size={18} color="rgba(255,255,255,0.7)" />
              </Pressable>
            </View>

            {/* Next programs */}
            <View style={styles.nextSection}>
              <View style={styles.nextHeader}>
                <Text style={styles.nextTitle}>Próximos Programas</Text>
                <Text style={[styles.nextSeeAll, { color: accent }]}>Ver grade →</Text>
              </View>
              {NEXT_PROGRAMS.map((p, i) => (
                <View key={i} style={styles.nextItem}>
                  <Text style={[styles.nextTime, { color: accent }]}>{p.time}</Text>
                  <Text style={styles.nextProg}>{p.title}</Text>
                  <Text style={styles.nextDur}>{p.duration}</Text>
                </View>
              ))}
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },

  backdropWrap: { width: "100%", height: 320, position: "relative" },
  backdropImg: { width: "100%", height: 320, position: "absolute" },
  glowBlob: {
    position: "absolute",
    bottom: 0,
    left: "25%",
    width: W * 0.5,
    height: 120,
    borderRadius: 60,
  },

  topNav: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 10,
  },
  navRight: { flexDirection: "row", gap: 8 },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  channelBadgeRow: {
    position: "absolute",
    bottom: 20,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  channelLogoWrap: {
    width: 58,
    height: 58,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
  channelLogoImg: { width: 46, height: 46 },

  liveRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#e50914" },
  livePillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  viewersText: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "500" },
  channelNameText: { color: "#fff", fontSize: 17, fontWeight: "800" },

  contentPad: { padding: 20, paddingTop: 4 },

  epgTitle: { color: "#fff", fontSize: 26, fontWeight: "900", letterSpacing: -0.5, marginBottom: 10, lineHeight: 30 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  metaTag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  metaTagText: { fontSize: 11, fontWeight: "700" },
  metaSep: { color: "rgba(255,255,255,0.25)", fontSize: 11 },
  metaText: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "500" },

  progressWrap: { marginBottom: 16 },
  progressBg: { height: 3, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden", marginBottom: 4 },
  progressFill: {
    height: 3,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 3,
  },
  progressLabel: { color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: "600" },

  synopsis: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 20,
  },

  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 16,
  },
  detailCell: {
    width: "30%",
    alignItems: "center",
    gap: 4,
  },
  detailLabel: { color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  detailValue: { color: "#fff", fontSize: 10, fontWeight: "600", textAlign: "center" },

  actionsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 28 },
  watchBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 6,
  },
  watchBtnPlay: { color: "#fff", fontSize: 13 },
  watchBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  iconAction: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  iconActionText: { fontSize: 20, color: "rgba(255,255,255,0.7)" },

  nextSection: { marginTop: 4 },
  nextHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  nextTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  nextSeeAll: { fontSize: 12, fontWeight: "600" },
  nextItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 8,
    gap: 12,
  },
  nextTime: { fontSize: 13, fontWeight: "800", minWidth: 38, tabularNums: true } as any,
  nextProg: { flex: 1, color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "500" },
  nextDur: { color: "rgba(255,255,255,0.35)", fontSize: 11 },
});
