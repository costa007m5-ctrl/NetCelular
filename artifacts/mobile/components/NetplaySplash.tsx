import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

const { width: SW } = Dimensions.get("window");
const RED = "#e50914";
const TOTAL_MS = 3600;

interface Props {
  onFinish: () => void;
}

export default function NetplaySplash({ onFinish }: Props) {
  const glowOp = useRef(new Animated.Value(0)).current;
  const glowMidOp = useRef(new Animated.Value(0)).current;
  const glowInOp = useRef(new Animated.Value(0)).current;
  const logoOp = useRef(new Animated.Value(0)).current;
  const logoSc = useRef(new Animated.Value(0.5)).current;
  const textOp = useRef(new Animated.Value(0)).current;
  const barW = useRef(new Animated.Value(0)).current;
  const masterOp = useRef(new Animated.Value(1)).current;

  // Self-managed: becomes null to remove from tree
  const [visible, setVisible] = useState(true);
  const finishedRef = useRef(false);

  const noDrive = { useNativeDriver: false };

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setVisible(false);
    onFinish();
  };

  useEffect(() => {
    if (Platform.OS !== "web") {
      setTimeout(
        () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
        200,
      );
    }

    // Phase 1 — Glow (0ms)
    Animated.timing(glowOp, { toValue: 1, duration: 500, ...noDrive }).start();
    Animated.timing(glowMidOp, { toValue: 0.75, duration: 600, ...noDrive }).start();
    Animated.timing(glowInOp, { toValue: 0.55, duration: 700, ...noDrive }).start();

    // Phase 2 — Logo (600ms)
    const t2 = setTimeout(() => {
      Animated.timing(logoOp, { toValue: 1, duration: 350, ...noDrive }).start();
      Animated.timing(logoSc, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), ...noDrive }).start();
    }, 600);

    // Phase 3 — Text (1100ms)
    const t3 = setTimeout(() => {
      Animated.timing(textOp, { toValue: 1, duration: 300, ...noDrive }).start();
    }, 1100);

    // Phase 4 — Bar (1450ms)
    const t4 = setTimeout(() => {
      Animated.timing(barW, {
        toValue: SW * 0.55,
        duration: 1400,
        easing: Easing.inOut(Easing.quad),
        ...noDrive,
      }).start();
    }, 1450);

    // Phase 5 — Fade out starts at (TOTAL_MS - 420ms)
    const t5 = setTimeout(() => {
      Animated.timing(masterOp, {
        toValue: 0,
        duration: 380,
        easing: Easing.in(Easing.quad),
        ...noDrive,
      }).start(() => finish());
    }, TOTAL_MS - 420);

    // Guaranteed fallback
    const tFallback = setTimeout(() => finish(), TOTAL_MS + 600);

    return () => {
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      clearTimeout(tFallback);
    };
  }, []);

  if (!visible) return null;

  return (
    <Animated.View style={[s.container, { opacity: masterOp }]} pointerEvents="none">
      <LinearGradient
        colors={["#080000", "#0e0000", "#050000", "#000"]}
        locations={[0, 0.35, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[s.glowOuter, { opacity: glowOp }]} />
      <Animated.View style={[s.glowMid, { opacity: glowMidOp }]} />
      <Animated.View style={[s.glowIn, { opacity: glowInOp }]} />

      <Animated.View style={[s.logoWrap, { opacity: logoOp, transform: [{ scale: logoSc }] }]}>
        <LinearGradient
          colors={["#ff3030", "#cc0000", "#6b0000"]}
          locations={[0, 0.5, 1]}
          style={s.logoBox}
        >
          <View style={s.shine} />
          <View style={s.nMark}>
            <View style={s.nBar} />
            <View style={s.nDiag} />
            <View style={s.nBar} />
          </View>
          <View style={s.playCircle}>
            <View style={s.playArrow} />
          </View>
        </LinearGradient>
      </Animated.View>

      <Animated.View style={[s.brandRow, { opacity: textOp }]}>
        <Text style={s.brandNet}>NET</Text>
        <Text style={s.brandPlay}>PLAY</Text>
      </Animated.View>
      <Animated.Text style={[s.tagline, { opacity: textOp }]}>
        CATÁLOGO PREMIUM · ENTRETENIMENTO
      </Animated.Text>

      <View style={s.barTrack}>
        <Animated.View style={[s.barFill, { width: barW }]}>
          <LinearGradient
            colors={["#900000", RED, "#ff3a3a", RED, "#900000"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
      <Animated.Text style={[s.loadText, { opacity: textOp }]}>
        Carregando seu conteúdo personalizado...
      </Animated.Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    backgroundColor: "#000",
  },
  glowOuter: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(200,9,20,0.09)",
    top: "18%",
    alignSelf: "center",
  },
  glowMid: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(220,9,20,0.13)",
    top: "24%",
    alignSelf: "center",
  },
  glowIn: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(229,9,20,0.22)",
    top: "29%",
    alignSelf: "center",
  },
  logoWrap: { marginBottom: 22 },
  logoBox: {
    width: 108,
    height: 108,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  shine: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 46,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  nMark: { flexDirection: "row", alignItems: "center", height: 46, gap: 3 },
  nBar: { width: 9, height: 46, backgroundColor: "#fff", borderRadius: 3 },
  nDiag: {
    width: 9, height: 46,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 3,
    transform: [{ skewX: "-16deg" }],
  },
  playCircle: {
    position: "absolute", right: 10, bottom: 8,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center", justifyContent: "center",
  },
  playArrow: {
    width: 0, height: 0,
    borderLeftWidth: 8, borderTopWidth: 5, borderBottomWidth: 5,
    borderLeftColor: RED, borderTopColor: "transparent", borderBottomColor: "transparent",
    marginLeft: 2,
  },
  brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  brandNet: { color: RED, fontSize: 46, fontWeight: "900", letterSpacing: 7 },
  brandPlay: { color: "#fff", fontSize: 46, fontWeight: "900", letterSpacing: 7 },
  tagline: {
    color: "rgba(255,255,255,0.22)",
    fontSize: 10, letterSpacing: 3.2, fontWeight: "600", marginBottom: 48,
  },
  barTrack: {
    width: SW * 0.55, height: 3,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 2, overflow: "hidden", marginBottom: 14,
  },
  barFill: {
    position: "absolute", left: 0, top: 0, height: 3,
    borderRadius: 2, overflow: "hidden",
  },
  loadText: { color: "rgba(255,255,255,0.18)", fontSize: 11, letterSpacing: 0.3 },
});
