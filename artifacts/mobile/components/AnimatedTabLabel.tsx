/**
 * AnimatedTabLabel — thematic text animations for each tab label.
 * Each tab's label animates in a way that represents its content identity.
 */
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text } from "react-native";

const ND = Platform.OS !== "web";
const IS_WEB = Platform.OS === "web";

export type TabLabelType = "home" | "bell" | "tv" | "film" | "star" | "user" | "scissors";

interface Props {
  type: TabLabelType;
  label: string;
  color: string;
  focused: boolean;
}

// ══════════════════════════════════════════════════════════════════════════════
// 🏠 INÍCIO — spring jump-up like pressing "play"
// ══════════════════════════════════════════════════════════════════════════════
function HomeLabel({ label, color, focused }: { label: string; color: string; focused: boolean }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const scale      = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (focused) {
      translateY.setValue(4);
      scale.setValue(0.85);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: ND, tension: 280, friction: 6 }),
        Animated.spring(scale,      { toValue: 1, useNativeDriver: ND, tension: 280, friction: 6 }),
      ]).start();
    }
  }, [focused]);

  return (
    <Animated.Text style={[styles.label, { color, transform: [{ translateY }, { scale }] }]}>
      {label}
    </Animated.Text>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ⚡ NOVIDADES — electric flicker (neon sign zap)
// ══════════════════════════════════════════════════════════════════════════════
function BellLabel({ label, color, focused }: { label: string; color: string; focused: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (focused) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.05, duration: 50,  useNativeDriver: ND }),
        Animated.timing(opacity, { toValue: 1,    duration: 50,  useNativeDriver: ND }),
        Animated.timing(opacity, { toValue: 0.05, duration: 40,  useNativeDriver: ND }),
        Animated.timing(opacity, { toValue: 1,    duration: 50,  useNativeDriver: ND }),
        Animated.timing(opacity, { toValue: 0.2,  duration: 30,  useNativeDriver: ND }),
        Animated.timing(opacity, { toValue: 1,    duration: 80,  useNativeDriver: ND }),
      ]).start();
    }
  }, [focused]);

  return (
    <Animated.Text style={[styles.label, { color, opacity }]}>
      {label}
    </Animated.Text>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 📡 CANAIS — live ticker slide up (breaking news bar)
// ══════════════════════════════════════════════════════════════════════════════
function TvLabel({ label, color, focused }: { label: string; color: string; focused: boolean }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (focused) {
      translateY.setValue(9);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: ND, easing: Easing.out(Easing.ease) }),
        Animated.timing(opacity,    { toValue: 1, duration: 200, useNativeDriver: ND }),
      ]).start();
    }
  }, [focused]);

  return (
    <Animated.Text style={[styles.label, { color, transform: [{ translateY }], opacity }]}>
      {label}
    </Animated.Text>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 🎬 CINEMA — scaleX wipe from center (film cut transition)
// ══════════════════════════════════════════════════════════════════════════════
function FilmLabel({ label, color, focused }: { label: string; color: string; focused: boolean }) {
  const scaleX  = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (focused) {
      scaleX.setValue(0.05);
      opacity.setValue(0.3);
      Animated.parallel([
        Animated.spring(scaleX,  { toValue: 1, useNativeDriver: ND, tension: 260, friction: 7 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: ND }),
      ]).start();
    }
  }, [focused]);

  return (
    <Animated.Text style={[styles.label, { color, transform: [{ scaleX }], opacity }]}>
      {label}
    </Animated.Text>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 💥 FRANQUIAS — Marvel title card: scale from 0 → 1.2 → 1 (epic reveal)
// ══════════════════════════════════════════════════════════════════════════════
function StarLabel({ label, color, focused }: { label: string; color: string; focused: boolean }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (focused) {
      scale.setValue(0.2);
      opacity.setValue(0);
      Animated.parallel([
        Animated.sequence([
          Animated.spring(scale, { toValue: 1.25, useNativeDriver: ND, tension: 320, friction: 4 }),
          Animated.spring(scale, { toValue: 1,    useNativeDriver: ND, tension: 200, friction: 6 }),
        ]),
        Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: ND }),
      ]).start();
    }
  }, [focused]);

  return (
    <Animated.Text style={[styles.label, { color, transform: [{ scale }], opacity }]}>
      {label}
    </Animated.Text>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 👑 PERFIL — spotlight fade-in + gentle pulse while active
// ══════════════════════════════════════════════════════════════════════════════
function UserLabel({ label, color, focused }: { label: string; color: string; focused: boolean }) {
  const opacity  = useRef(new Animated.Value(1)).current;
  const pulse    = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    pulse.current?.stop();
    if (focused) {
      opacity.setValue(0.3);
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: ND, easing: Easing.out(Easing.ease) }).start(() => {
        if (IS_WEB) return; // web Animated.loop on JS thread causes layout repaints
        pulse.current = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.75, duration: 900, useNativeDriver: ND, easing: Easing.inOut(Easing.ease) }),
            Animated.timing(opacity, { toValue: 1,    duration: 900, useNativeDriver: ND, easing: Easing.inOut(Easing.ease) }),
          ])
        );
        pulse.current.start();
      });
    } else {
      pulse.current?.stop();
    }
    return () => pulse.current?.stop();
  }, [focused]);

  return (
    <Animated.Text style={[styles.label, { color, opacity }]}>
      {label}
    </Animated.Text>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ✂️ SHORTS — quick cut zoom-in from center
// ══════════════════════════════════════════════════════════════════════════════
function ScissorsLabel({ label, color, focused }: { label: string; color: string; focused: boolean }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (focused) {
      scale.setValue(1.6);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale,   { toValue: 1, useNativeDriver: ND, tension: 300, friction: 6 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: ND }),
      ]).start();
    }
  }, [focused]);

  return (
    <Animated.Text style={[styles.label, { color, transform: [{ scale }], opacity }]}>
      {label}
    </Animated.Text>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function AnimatedTabLabel({ type, label, color, focused }: Props) {
  switch (type) {
    case "home":     return <HomeLabel     label={label} color={color} focused={focused} />;
    case "bell":     return <BellLabel     label={label} color={color} focused={focused} />;
    case "tv":       return <TvLabel       label={label} color={color} focused={focused} />;
    case "film":     return <FilmLabel     label={label} color={color} focused={focused} />;
    case "star":     return <StarLabel     label={label} color={color} focused={focused} />;
    case "user":     return <UserLabel     label={label} color={color} focused={focused} />;
    case "scissors": return <ScissorsLabel label={label} color={color} focused={focused} />;
    default:         return <Text style={[styles.label, { color }]}>{label}</Text>;
  }
}

const styles = StyleSheet.create({
  label: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.1,
    marginBottom: 4,
    textAlign: "center",
  },
});
