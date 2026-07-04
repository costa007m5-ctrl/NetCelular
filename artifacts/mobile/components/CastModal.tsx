import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import {
  buildCastMediaInfo,
  chromecastSupported,
  openChromecastPicker,
  useChromecastClient,
  useChromecastState,
  whyChromecastUnavailable,
} from "@/lib/chromecast";

const RED    = "#e50914";
const DARK   = "#0a0a0a";
const CARD   = "rgba(255,255,255,0.06)";
const BORDER = "rgba(255,255,255,0.10)";
const GREEN  = "#22c55e";

type CastState = "scanning" | "ready" | "connecting" | "connected" | "unsupported";

interface CastModalProps {
  visible: boolean;
  onClose: () => void;
  castUrl: string;
  title?: string;
  videoUrl?: string;
}

function useRadarAnim(running: boolean) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!running) { ring1.setValue(0); ring2.setValue(0); ring3.setValue(0); return; }
    const pulse = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ])
      );
    const a1 = pulse(ring1, 0);
    const a2 = pulse(ring2, 600);
    const a3 = pulse(ring3, 1200);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [running]);

  return { ring1, ring2, ring3 };
}

function RadarRing({ anim, size }: { anim: Animated.Value; size: number }) {
  return (
    <Animated.View
      style={{
        position: "absolute",
        width: size, height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: RED,
        opacity: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.6, 0] }),
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
      }}
    />
  );
}

// Triggers the browser's native Cast / device picker.
// Uses Remote Playback API first, then Presentation API as fallback.
async function triggerNativeCast(castUrl: string): Promise<boolean> {
  if (Platform.OS !== "web") return false;

  // --- Remote Playback API (Chrome, Edge) ---
  try {
    const win = window as any;
    const video = document.createElement("video");
    video.src = castUrl;
    video.crossOrigin = "anonymous";
    video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.body.appendChild(video);

    if (typeof video.remote !== "undefined") {
      try {
        await video.remote.prompt();
        document.body.removeChild(video);
        return true;
      } catch {
        document.body.removeChild(video);
      }
    } else {
      document.body.removeChild(video);
    }
  } catch {}

  // --- Presentation API fallback ---
  try {
    const win = window as any;
    if (win.PresentationRequest) {
      const req = new win.PresentationRequest([castUrl]);
      await req.start();
      return true;
    }
  } catch {}

  return false;
}

// Check if any cast API is available in this browser
function detectCastSupport(): Promise<"remote-playback" | "presentation" | "none"> {
  return new Promise((resolve) => {
    if (Platform.OS !== "web") { resolve("none"); return; }
    try {
      const video = document.createElement("video");
      if (typeof video.remote !== "undefined") { resolve("remote-playback"); return; }
    } catch {}
    try {
      const win = window as any;
      if (win.PresentationRequest) { resolve("presentation"); return; }
    } catch {}
    resolve("none");
  });
}

export function CastModal({ visible, onClose, castUrl, title, videoUrl }: CastModalProps) {
  const slideAnim = useRef(new Animated.Value(500)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  const [castState, setCastState]       = useState<CastState>("scanning");
  const [copied, setCopied]             = useState(false);
  const [castSupport, setCastSupport]   = useState<"remote-playback" | "presentation" | "chromecast" | "none">("none");

  const chromecastState  = useChromecastState();
  const chromecastClient = useChromecastClient();
  const mediaUrl = videoUrl || castUrl;
  const unavailableReason = whyChromecastUnavailable();

  const scanning = castState === "scanning";
  const { ring1, ring2, ring3 } = useRadarAnim(scanning || castState === "ready");

  // Animate sheet in/out
  useEffect(() => {
    if (visible) {
      setCastState("scanning");
      setCopied(false);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1,   duration: 240, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0,   useNativeDriver: true, damping: 18, stiffness: 180 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0,   duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 500, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  // Detect cast support when modal opens
  useEffect(() => {
    if (!visible) return;
    if (chromecastSupported) {
      setCastSupport("chromecast");
      setCastState(
        chromecastState === "connected" ? "connected" : "ready"
      );
      return;
    }
    detectCastSupport().then((support) => {
      setCastSupport(support);
      setCastState(support !== "none" ? "ready" : "unsupported");
    });
  }, [visible]);

  // React to Chromecast session state changes while the modal is open
  useEffect(() => {
    if (!visible || !chromecastSupported) return;
    if (chromecastState === "connecting") {
      setCastState("connecting");
    } else if (chromecastState === "connected") {
      if (chromecastClient && mediaUrl) {
        chromecastClient
          .loadMedia({ mediaInfo: buildCastMediaInfo(mediaUrl, title) })
          .catch(() => {});
      }
      setCastState("connected");
    }
  }, [chromecastState, chromecastClient, visible, mediaUrl, title]);

  const handleCast = async () => {
    if (chromecastSupported) {
      setCastState("connecting");
      try {
        await openChromecastPicker();
      } catch {
        setCastState("ready");
      }
      return;
    }
    setCastState("connecting");
    try {
      const success = await triggerNativeCast(castUrl);
      setCastState(success ? "connected" : "unsupported");
    } catch {
      setCastState("ready");
    }
  };

  const handleShare = async () => {
    try { await Share.share({ message: castUrl, url: castUrl, title: `NETPLAY · ${title ?? ""}` }); } catch {}
  };

  const handleCopy = async () => {
    try {
      if (Platform.OS === "web" && navigator.clipboard) {
        await navigator.clipboard.writeText(castUrl);
      } else {
        const { Clipboard } = await import("react-native") as any;
        Clipboard?.setString?.(castUrl);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { handleShare(); }
  };

  if (!visible) return null;

  const Content = (
    <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <LinearGradient colors={["#100000", DARK, "#0a0a0a"]} style={StyleSheet.absoluteFill} />

        <View style={s.handle} />

        {/* Header */}
        <View style={s.header}>
          <View style={s.castIconWrap}>
            <Feather name="cast" size={22} color={RED} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Assistir na TV</Text>
            <Text style={s.headerSub}>
              {castState === "connected"
                ? "Transmitindo para o dispositivo"
                : "Encontra TVs e dispositivos na rede"}
            </Text>
          </View>
          <Pressable onPress={onClose} style={s.closeBtn}>
            <Feather name="x" size={20} color="rgba(255,255,255,0.5)" />
          </Pressable>
        </View>

        {/* Radar scanner */}
        <View style={s.radarArea}>
          <RadarRing anim={ring1} size={220} />
          <RadarRing anim={ring2} size={160} />
          <RadarRing anim={ring3} size={100} />

          {/* Center icon */}
          <View style={[s.radarCenter, {
            backgroundColor: castState === "connected"
              ? "rgba(34,197,94,0.15)"
              : castState === "unsupported"
              ? "rgba(255,255,255,0.05)"
              : "rgba(229,9,20,0.12)",
            borderColor: castState === "connected" ? GREEN
              : castState === "unsupported" ? "rgba(255,255,255,0.15)"
              : RED,
          }]}>
            <Feather
              name={castState === "connected" ? "check" : castState === "unsupported" ? "wifi-off" : "cast"}
              size={32}
              color={castState === "connected" ? GREEN : castState === "unsupported" ? "rgba(255,255,255,0.3)" : RED}
            />
          </View>

          {/* Status label */}
          <Text style={[s.radarLabel, {
            color: castState === "connected" ? GREEN
              : castState === "unsupported" ? "rgba(255,255,255,0.3)"
              : "rgba(255,255,255,0.55)",
          }]}>
            {castState === "scanning" && "Detectando suporte..."}
            {castState === "ready" &&
              (castSupport === "chromecast"
                ? "Toque para buscar Chromecast e TVs na rede"
                : "Dispositivos disponíveis na rede")}
            {castState === "connecting" && "Abrindo seletor de dispositivos..."}
            {castState === "connected" && "Transmissão iniciada!"}
            {castState === "unsupported" &&
              (unavailableReason ?? "Cast não disponível neste navegador")}
          </Text>

          {title && (
            <Text style={s.contentTitle} numberOfLines={1}>{title}</Text>
          )}
        </View>

        {/* Main action */}
        {castState === "ready" && (
          <Pressable style={s.castBtn} onPress={handleCast}>
            <Feather name="cast" size={18} color="#fff" />
            <Text style={s.castBtnText}>
              {castSupport === "chromecast" ? "Buscar Chromecast" : "Buscar e Conectar à TV"}
            </Text>
          </Pressable>
        )}

        {castState === "connecting" && (
          <View style={[s.castBtn, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
            <Feather name="loader" size={18} color="rgba(255,255,255,0.5)" />
            <Text style={[s.castBtnText, { color: "rgba(255,255,255,0.5)" }]}>Abrindo picker nativo...</Text>
          </View>
        )}

        {castState === "connected" && (
          <Pressable style={[s.castBtn, { backgroundColor: "rgba(34,197,94,0.15)", borderColor: GREEN, borderWidth: 1 }]} onPress={onClose}>
            <Feather name="check-circle" size={18} color={GREEN} />
            <Text style={[s.castBtnText, { color: GREEN }]}>Transmitindo — Fechar</Text>
          </Pressable>
        )}

        {/* Divider */}
        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>ou compartilhe o link</Text>
          <View style={s.dividerLine} />
        </View>

        {/* URL + share actions */}
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

        {/* Device tips — shown only when unsupported */}
        {castState === "unsupported" && (
          <View style={s.tipsSection}>
            <Text style={s.tipsTitle}>Como assistir manualmente</Text>
            {[
              { icon: "tv" as const,      label: "Samsung / LG Smart TV",  desc: "Abra o navegador da TV e cole o link" },
              { icon: "cast" as const,    label: "Chromecast",              desc: Platform.OS === "web" ? "No Chrome: Menu → Transmitir → Aba" : "Disponível na versão instalada do app" },
              { icon: "airplay" as const, label: "Apple TV / AirPlay",      desc: "Abra no Safari e use AirPlay, ou deslize a Central de Controle" },
            ].map((t) => (
              <View key={t.label} style={tip.row}>
                <View style={tip.iconWrap}>
                  <Feather name={t.icon} size={16} color="rgba(255,255,255,0.45)" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={tip.label}>{t.label}</Text>
                  <Text style={tip.desc}>{t.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />
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
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.72)" }]}>
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
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  headerSub:   { fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },

  radarArea: {
    alignItems: "center", justifyContent: "center",
    height: 230, marginTop: 8, gap: 14,
  },
  radarCenter: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5,
  },
  radarLabel: {
    fontSize: 13, fontWeight: "600", textAlign: "center",
    paddingHorizontal: 32, lineHeight: 18,
  },
  contentTitle: {
    fontSize: 14, fontWeight: "700",
    color: "rgba(255,255,255,0.5)",
    textAlign: "center", paddingHorizontal: 40,
  },

  castBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, marginHorizontal: 20, marginTop: 4,
    paddingVertical: 14, borderRadius: 14,
    backgroundColor: RED,
  },
  castBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },

  divider: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 20, marginTop: 20, marginBottom: 14, gap: 10,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.08)" },
  dividerText: { fontSize: 11, color: "rgba(255,255,255,0.28)", fontWeight: "600" },

  urlSection: { paddingHorizontal: 20, gap: 10 },
  urlBox: {
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
  },
  urlText: {
    fontSize: 12, color: "rgba(255,255,255,0.4)",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  urlActions:    { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 10,
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
  },
  actionBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  tipsSection: { paddingHorizontal: 20, marginTop: 20, gap: 4 },
  tipsTitle: {
    fontSize: 12, fontWeight: "700",
    color: "rgba(255,255,255,0.3)", marginBottom: 10, letterSpacing: 0.5,
  },
});

const tip = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    paddingVertical: 10, borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: CARD, alignItems: "center", justifyContent: "center",
  },
  label: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.65)" },
  desc:  { fontSize: 11, color: "rgba(255,255,255,0.32)", marginTop: 2, lineHeight: 16 },
});
