import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

const RED    = "#e50914";
const DARK   = "#0a0a0a";
const CARD   = "rgba(255,255,255,0.06)";
const BORDER = "rgba(255,255,255,0.10)";

interface CastModalProps {
  visible: boolean;
  onClose: () => void;
  castUrl: string;
  title?: string;
  videoUrl?: string;
}

const CAST_TIPS = [
  { icon: "tv"       as const, label: "Samsung Smart TV",  desc: "Abra o navegador da TV e escaneie o QR" },
  { icon: "tv"       as const, label: "LG webOS",          desc: "Abra o LG Browser e acesse o link" },
  { icon: "airplay"  as const, label: "Apple TV / AirPlay",desc: "Abra no Safari e use AirPlay (ícone 🔲)" },
  { icon: "cast"     as const, label: "Chromecast",        desc: "No Chrome: Menu → Transmitir → Aba" },
  { icon: "monitor"  as const, label: "Qualquer TV",       desc: "Digite o link no navegador da TV" },
];

function PlatformTip({ icon, label, desc }: { icon: any; label: string; desc: string }) {
  return (
    <View style={tip.row}>
      <View style={tip.iconWrap}>
        <Feather name={icon} size={16} color="rgba(255,255,255,0.55)" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={tip.label}>{label}</Text>
        <Text style={tip.desc}>{desc}</Text>
      </View>
    </View>
  );
}

export function CastModal({ visible, onClose, castUrl, title, videoUrl }: CastModalProps) {
  const slideAnim = useRef(new Animated.Value(400)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const [copied, setCopied] = useState(false);
  const [expirySecs, setExpirySecs] = useState(1800);

  useEffect(() => {
    if (visible) {
      setExpirySecs(1800);
      setCopied(false);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1,   duration: 240, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0,   useNativeDriver: true, damping: 18, stiffness: 180 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0,   duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 400, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setExpirySecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [visible]);

  const expiryLabel = expirySecs > 0
    ? `Expira em ${Math.floor(expirySecs / 60)}:${String(expirySecs % 60).padStart(2, "0")}`
    : "Link expirado — volte e gere um novo";

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&color=ffffff&bgcolor=000000&data=${encodeURIComponent(castUrl)}&qzone=2`;

  const handleShare = async () => {
    try {
      await Share.share({ message: castUrl, url: castUrl, title: `NETPLAY · ${title ?? ""}` });
    } catch {}
  };

  const handleCopy = async () => {
    try {
      const { Clipboard } = await import("react-native") as any;
      if (Clipboard?.setString) {
        Clipboard.setString(castUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        handleShare();
      }
    } catch {
      handleShare();
    }
  };

  if (!visible) return null;

  const Content = (
    <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <LinearGradient colors={["#1a0000", DARK, "#0a0a0a"]} style={StyleSheet.absoluteFill} />

        {/* Handle */}
        <View style={s.handle} />

        {/* Header */}
        <View style={s.header}>
          <View style={s.castIconWrap}>
            <Feather name="cast" size={22} color={RED} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Assistir na TV</Text>
            <Text style={s.headerSub}>Escaneie o QR Code com a câmera da TV</Text>
          </View>
          <Pressable onPress={onClose} style={s.closeBtn}>
            <Feather name="x" size={20} color="rgba(255,255,255,0.5)" />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* QR Code */}
          <View style={s.qrSection}>
            <View style={s.qrWrap}>
              <Image
                source={{ uri: qrUrl }}
                style={s.qrImage}
                contentFit="contain"
                cachePolicy="none"
              />
            </View>
            <View style={[s.expiryBadge, { backgroundColor: expirySecs < 300 ? "rgba(229,9,20,0.2)" : "rgba(255,255,255,0.06)" }]}>
              <Feather name="clock" size={10} color={expirySecs < 300 ? RED : "rgba(255,255,255,0.4)"} />
              <Text style={[s.expiryText, { color: expirySecs < 300 ? RED : "rgba(255,255,255,0.4)" }]}>
                {expiryLabel}
              </Text>
            </View>
            {title && <Text style={s.contentTitle} numberOfLines={1}>{title}</Text>}
          </View>

          {/* URL row */}
          <View style={s.urlSection}>
            <View style={s.urlBox}>
              <Text style={s.urlText} numberOfLines={1} ellipsizeMode="middle">{castUrl}</Text>
            </View>
            <View style={s.urlActions}>
              <Pressable style={s.actionBtn} onPress={handleCopy}>
                <Feather name={copied ? "check" : "copy"} size={15} color={copied ? "#4ade80" : "#fff"} />
                <Text style={[s.actionBtnText, { color: copied ? "#4ade80" : "#fff" }]}>
                  {copied ? "Copiado!" : "Copiar"}
                </Text>
              </Pressable>
              <Pressable style={[s.actionBtn, { backgroundColor: RED }]} onPress={handleShare}>
                <Feather name="share-2" size={15} color="#fff" />
                <Text style={s.actionBtnText}>Compartilhar</Text>
              </Pressable>
            </View>
          </View>

          {/* How to cast */}
          <View style={s.tipsSection}>
            <Text style={s.tipsTitle}>Como assistir</Text>
            {CAST_TIPS.map((t) => (
              <PlatformTip key={t.label} icon={t.icon} label={t.label} desc={t.desc} />
            ))}
          </View>
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );

  if (Platform.OS === "ios") {
    return (
      <Modal visible transparent animationType="none" onRequestClose={onClose}>
        <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
        {Content}
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.7)" }]}>
        {Content}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    overflow: "hidden",
    maxHeight: "92%",
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14, gap: 12,
  },
  castIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: "rgba(229,9,20,0.15)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(229,9,20,0.25)",
  },
  headerTitle:  { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  headerSub:    { fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },

  qrSection: { alignItems: "center", paddingVertical: 12, gap: 10 },
  qrWrap: {
    width: 220, height: 220,
    backgroundColor: "#000", borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2, borderColor: RED,
    alignItems: "center", justifyContent: "center",
  },
  qrImage: { width: 220, height: 220 },
  expiryBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
  },
  expiryText:    { fontSize: 11, fontWeight: "600", letterSpacing: 0.2 },
  contentTitle:  { fontSize: 14, fontWeight: "700", color: "rgba(255,255,255,0.6)", textAlign: "center", paddingHorizontal: 32 },

  urlSection: { paddingHorizontal: 20, gap: 10, marginTop: 4 },
  urlBox: {
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
  },
  urlText:       { fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  urlActions:    { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 10,
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
  },
  actionBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  tipsSection:   { paddingHorizontal: 20, marginTop: 20, gap: 4 },
  tipsTitle:     { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.4)", marginBottom: 10, letterSpacing: 0.5 },
});

const tip = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)",
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: CARD, alignItems: "center", justifyContent: "center",
  },
  label:  { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.75)" },
  desc:   { fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 2, lineHeight: 16 },
});
