import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type ChangelogEntry } from "@/lib/changelog";

const RED = "#e50914";
const DARK = "#0a0a0a";
const CARD = "rgba(255,255,255,0.06)";
const BORDER = "rgba(255,255,255,0.10)";

interface WhatsNewModalProps {
  visible: boolean;
  entry: ChangelogEntry | null;
  onClose: () => void;
}

function HighlightRow({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <View style={s.row}>
      <View style={s.iconWrap}>
        <Text style={s.iconEmoji}>{icon}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.rowDesc}>{description}</Text>
      </View>
    </View>
  );
}

export function WhatsNewModal({ visible, entry, onClose }: WhatsNewModalProps) {
  const slideAnim = useRef(new Animated.Value(500)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 500, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!entry) return null;

  const Content = (
    <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }], paddingBottom: insets.bottom + 16 }]}>
        <LinearGradient colors={["#1a0000", DARK]} style={StyleSheet.absoluteFill} />

        <View style={s.handle} />

        <View style={s.header}>
          <View style={s.badgeWrap}>
            <Text style={s.badgeEmoji}>🎉</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Novidades da versão {entry.version}</Text>
            <Text style={s.headerSub}>{entry.date}</Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
        >
          <View style={s.divider} />
          {entry.highlights.map((h, i) => (
            <HighlightRow key={i} icon={h.icon} title={h.title} description={h.description} />
          ))}
          <View style={s.divider} />
        </ScrollView>

        <View style={s.footer}>
          <Pressable style={s.btnClose} onPress={onClose}>
            <Text style={s.btnCloseText}>Entendido!</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  );

  if (Platform.OS === "ios") {
    return (
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        {Content}
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.75)" }]}>
        {Content}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: "hidden",
    maxHeight: "85%",
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 16, gap: 14,
  },
  badgeWrap: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: "rgba(229,9,20,0.15)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(229,9,20,0.25)",
  },
  badgeEmoji: { fontSize: 24 },
  headerTitle: {
    fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.3,
    fontFamily: "Inter_700Bold",
  },
  headerSub: {
    fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2,
    fontFamily: "Inter_400Regular",
  },
  divider: {
    height: 1, backgroundColor: BORDER, marginVertical: 8,
  },
  row: {
    flexDirection: "row", alignItems: "flex-start", gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)",
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    alignItems: "center", justifyContent: "center",
  },
  iconEmoji: { fontSize: 20 },
  rowTitle: {
    fontSize: 14, fontWeight: "700", color: "#fff",
    fontFamily: "Inter_700Bold",
  },
  rowDesc: {
    fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 18,
    fontFamily: "Inter_400Regular",
  },
  footer: {
    paddingHorizontal: 20, paddingTop: 12,
  },
  btnClose: {
    backgroundColor: RED, borderRadius: 14,
    paddingVertical: 14, alignItems: "center",
  },
  btnCloseText: {
    color: "#fff", fontSize: 15, fontWeight: "800",
    fontFamily: "Inter_700Bold", letterSpacing: 0.2,
  },
});
