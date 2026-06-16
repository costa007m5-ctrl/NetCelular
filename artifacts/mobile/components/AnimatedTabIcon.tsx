/**
 * AnimatedTabIcon — thematic animations for each tab.
 * Each icon has a unique animation that represents its content identity.
 * useNativeDriver: platform-adaptive (native on iOS/Android, JS on web).
 */
import React, { useEffect, useRef, useCallback } from "react";
import {
  Animated,
  Easing,
  Platform,
  View,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";

export type TabIconType = "home" | "bell" | "tv" | "film" | "star" | "user";

interface Props {
  type: TabIconType;
  color: string;
  size?: number;
  focused: boolean;
}

const ND = Platform.OS !== "web"; // useNativeDriver

// ─── Reusable: animated ring that expands and fades ─────────────────────────

function Ring({
  color,
  baseSize,
  delay = 0,
  trigger,
  maxScale = 3,
  duration = 600,
}: {
  color: string;
  baseSize: number;
  delay?: number;
  trigger: number; // incrementing number to re-trigger
  maxScale?: number;
  duration?: number;
}) {
  const scale   = useRef(new Animated.Value(0.2)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (trigger === 0) return;
    const timer = setTimeout(() => {
      scale.setValue(0.2);
      opacity.setValue(0.8);
      Animated.parallel([
        Animated.timing(scale,   { toValue: maxScale, duration, useNativeDriver: ND, easing: Easing.out(Easing.ease) }),
        Animated.timing(opacity, { toValue: 0, duration, useNativeDriver: ND }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [trigger]);

  return (
    <Animated.View
      style={[
        styles.ring,
        {
          width: baseSize,
          height: baseSize,
          borderRadius: baseSize / 2,
          borderColor: color,
          transform: [{ scale }],
          opacity,
        },
      ]}
    />
  );
}

// ─── Reusable: particle dot that shoots in a direction ──────────────────────

function Particle({
  color,
  angleDeg,
  distance,
  trigger,
  delay = 0,
  size = 4,
  duration = 500,
}: {
  color: string;
  angleDeg: number;
  distance: number;
  trigger: number;
  delay?: number;
  size?: number;
  duration?: number;
}) {
  const rad = (angleDeg * Math.PI) / 180;
  const tx = Math.cos(rad) * distance;
  const ty = Math.sin(rad) * distance;
  const x       = useRef(new Animated.Value(0)).current;
  const y       = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (trigger === 0) return;
    const timer = setTimeout(() => {
      x.setValue(0); y.setValue(0); opacity.setValue(1); scale.setValue(1);
      Animated.parallel([
        Animated.timing(x,       { toValue: tx, duration, useNativeDriver: ND, easing: Easing.out(Easing.ease) }),
        Animated.timing(y,       { toValue: ty, duration, useNativeDriver: ND, easing: Easing.out(Easing.ease) }),
        Animated.timing(opacity, { toValue: 0, duration, useNativeDriver: ND }),
        Animated.timing(scale,   { toValue: 0.2, duration, useNativeDriver: ND }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [trigger]);

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity,
          transform: [{ translateX: x }, { translateY: y }, { scale }],
        },
      ]}
    />
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 🏠  INÍCIO — Netflix streaming identity
//   On focus: crimson glow circle + smooth scale-in like pressing "play"
//   Idle: slow breathing pulse (standby mode)
// ══════════════════════════════════════════════════════════════════════════════
function HomeIcon({ color, size, focused }: { color: string; size: number; focused: boolean }) {
  const scale      = useRef(new Animated.Value(1)).current;
  const glowScale  = useRef(new Animated.Value(0.5)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const breathLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    breathLoop.current?.stop();
    if (focused) {
      // Glow burst
      glowScale.setValue(0.5);
      glowOpacity.setValue(0.6);
      Animated.parallel([
        Animated.timing(glowScale,   { toValue: 2.2, duration: 500, useNativeDriver: ND, easing: Easing.out(Easing.ease) }),
        Animated.timing(glowOpacity, { toValue: 0, duration: 500, useNativeDriver: ND }),
      ]).start();
      // Icon: stream-in spring
      scale.setValue(0.7);
      Animated.spring(scale, { toValue: 1, useNativeDriver: ND, tension: 200, friction: 6 }).start();
    } else {
      // Idle: slow breath like a standby LED
      breathLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.06, duration: 1800, useNativeDriver: ND, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(scale, { toValue: 1,    duration: 1800, useNativeDriver: ND, easing: Easing.inOut(Easing.ease) }),
        ])
      );
      breathLoop.current.start();
    }
    return () => breathLoop.current?.stop();
  }, [focused]);

  return (
    <View style={styles.centered}>
      <Animated.View
        style={[styles.glow, {
          width: size + 4, height: size + 4,
          borderRadius: (size + 4) / 2,
          backgroundColor: color,
          transform: [{ scale: glowScale }],
          opacity: glowOpacity,
        }]}
      />
      <Animated.View style={{ transform: [{ scale }] }}>
        <Feather name="home" size={size} color={color} />
      </Animated.View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ⚡  NOVIDADES — Breaking alert / electric news
//   On focus: rapid electric vibration + 4 spark lines shooting out
//   Idle: random single spark zap
// ══════════════════════════════════════════════════════════════════════════════
function BellIcon({ color, size, focused }: { color: string; size: number; focused: boolean }) {
  const rotate       = useRef(new Animated.Value(0)).current;
  const scale        = useRef(new Animated.Value(1)).current;
  const sparkTrigger = useRef(new Animated.Value(0)).current;
  const [ringTick, setRingTick]  = React.useState(0);

  const doZap = useCallback(() => {
    rotate.setValue(0);
    // High-freq electric vibration
    Animated.sequence([
      Animated.timing(rotate, { toValue:  1.2, duration: 40, useNativeDriver: ND, easing: Easing.linear }),
      Animated.timing(rotate, { toValue: -1.2, duration: 40, useNativeDriver: ND, easing: Easing.linear }),
      Animated.timing(rotate, { toValue:  1,   duration: 40, useNativeDriver: ND, easing: Easing.linear }),
      Animated.timing(rotate, { toValue: -1,   duration: 40, useNativeDriver: ND, easing: Easing.linear }),
      Animated.timing(rotate, { toValue:  0.5, duration: 40, useNativeDriver: ND, easing: Easing.linear }),
      Animated.timing(rotate, { toValue:  0,   duration: 40, useNativeDriver: ND, easing: Easing.linear }),
    ]).start();
  }, [rotate]);

  useEffect(() => {
    if (focused) {
      Animated.spring(scale, { toValue: 1.25, useNativeDriver: ND, tension: 300, friction: 4 }).start(() =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: ND, tension: 180, friction: 6 }).start()
      );
      doZap();
      setRingTick(t => t + 1);
    }
  }, [focused]);

  // Periodic idle zap
  useEffect(() => {
    if (focused) return;
    const t = setInterval(() => { if (Math.random() < 0.5) doZap(); }, 7000);
    return () => clearInterval(t);
  }, [focused, doZap]);

  const deg = rotate.interpolate({ inputRange: [-1.2, 0, 1.2], outputRange: ["-22deg", "0deg", "22deg"] });

  return (
    <View style={styles.centered}>
      {/* Spark particles in 4 diagonal directions */}
      {[45, 135, 225, 315].map((angle, i) => (
        <Particle key={i} color={color} angleDeg={angle} distance={20} trigger={ringTick} delay={i * 30} size={3} duration={400} />
      ))}
      <Animated.View style={{ transform: [{ rotate: deg }, { scale }] }}>
        <Feather name="bell" size={size} color={color} />
      </Animated.View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 📡  CANAIS — Live broadcast signal
//   On focus: TV flash (turning on) + 3 signal rings expanding like antenna waves
//   Idle: single ring pulse every 5s (always broadcasting)
// ══════════════════════════════════════════════════════════════════════════════
function TvIcon({ color, size, focused }: { color: string; size: number; focused: boolean }) {
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const scale        = useRef(new Animated.Value(1)).current;
  const [ringTick, setRingTick] = React.useState(0);

  useEffect(() => {
    if (focused) {
      // TV turning on flash
      flashOpacity.setValue(0.8);
      Animated.timing(flashOpacity, { toValue: 0, duration: 300, useNativeDriver: ND }).start();
      Animated.spring(scale, { toValue: 1.15, useNativeDriver: ND, tension: 250, friction: 5 }).start(() =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: ND }).start()
      );
      setRingTick(t => t + 1);
    }
  }, [focused]);

  // Idle: signal rings pulse like a live broadcast
  useEffect(() => {
    if (focused) return;
    const t = setInterval(() => setRingTick(t => t + 1), 5000);
    return () => clearInterval(t);
  }, [focused]);

  return (
    <View style={styles.centered}>
      {/* 3 expanding signal rings with staggered delays */}
      <Ring color={color} baseSize={size} trigger={ringTick} delay={0}   maxScale={3.2} duration={700} />
      <Ring color={color} baseSize={size} trigger={ringTick} delay={180} maxScale={2.4} duration={600} />
      <Ring color={color} baseSize={size} trigger={ringTick} delay={350} maxScale={1.7} duration={500} />
      {/* TV turning-on white flash overlay */}
      <Animated.View
        style={[StyleSheet.absoluteFill, {
          backgroundColor: "#fff",
          borderRadius: 6,
          opacity: flashOpacity,
        }]}
      />
      <Animated.View style={{ transform: [{ scale }] }}>
        <Feather name="tv" size={size} color={color} />
      </Animated.View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 🎬  CINEMA — Clapperboard snap + projector beam
//   On focus: Y-axis snap (clap!) + white projector flash that fans out from top
//   Idle: occasional single clap snap
// ══════════════════════════════════════════════════════════════════════════════
function FilmIcon({ color, size, focused }: { color: string; size: number; focused: boolean }) {
  const scaleY      = useRef(new Animated.Value(1)).current;
  const scaleX      = useRef(new Animated.Value(1)).current;
  const beamOpacity = useRef(new Animated.Value(0)).current;
  const beamScaleY  = useRef(new Animated.Value(0.1)).current;

  const doClap = useCallback(() => {
    // Snap: squish Y then overshoot like a clap
    Animated.sequence([
      Animated.parallel([
        Animated.timing(scaleY, { toValue: 0.4, duration: 80, useNativeDriver: ND, easing: Easing.in(Easing.ease) }),
        Animated.timing(scaleX, { toValue: 1.3, duration: 80, useNativeDriver: ND }),
      ]),
      Animated.parallel([
        Animated.spring(scaleY, { toValue: 1, useNativeDriver: ND, tension: 300, friction: 4 }),
        Animated.spring(scaleX, { toValue: 1, useNativeDriver: ND, tension: 300, friction: 5 }),
      ]),
    ]).start();
    // Projector beam
    beamOpacity.setValue(0.7);
    beamScaleY.setValue(0.1);
    Animated.parallel([
      Animated.timing(beamScaleY,  { toValue: 1,   duration: 350, useNativeDriver: ND, easing: Easing.out(Easing.ease) }),
      Animated.timing(beamOpacity, { toValue: 0,   duration: 400, useNativeDriver: ND }),
    ]).start();
  }, [scaleY, scaleX, beamOpacity, beamScaleY]);

  useEffect(() => {
    if (focused) doClap();
  }, [focused]);

  // Idle: occasional snap
  useEffect(() => {
    if (focused) return;
    const t = setInterval(() => { if (Math.random() < 0.4) doClap(); }, 8000);
    return () => clearInterval(t);
  }, [focused, doClap]);

  return (
    <View style={styles.centered}>
      {/* Projector beam — comes from top */}
      <Animated.View
        style={[
          styles.projectorBeam,
          {
            width: size * 2.5,
            borderTopColor: color,
            opacity: beamOpacity,
            transform: [{ scaleY: beamScaleY }],
          },
        ]}
      />
      <Animated.View style={{ transform: [{ scaleX }, { scaleY }] }}>
        <Feather name="film" size={size} color={color} />
      </Animated.View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 💥  FRANQUIAS — Marvel/DC epic reveal
//   On focus: icon explodes in + 2 ring bursts + 8 particles shooting out
//   Idle: single ring pulse every 6s like a beacon
// ══════════════════════════════════════════════════════════════════════════════
function StarIcon({ color, size, focused }: { color: string; size: number; focused: boolean }) {
  const scale    = useRef(new Animated.Value(1)).current;
  const rotate   = useRef(new Animated.Value(0)).current;
  const [ringTick, setRingTick] = React.useState(0);

  useEffect(() => {
    if (focused) {
      // Dramatic scale reveal
      scale.setValue(0.3);
      rotate.setValue(-0.5);
      Animated.parallel([
        Animated.spring(scale,  { toValue: 1.3, useNativeDriver: ND, tension: 280, friction: 4 }),
        Animated.timing(rotate, { toValue: 0.2, duration: 200, useNativeDriver: ND, easing: Easing.out(Easing.ease) }),
      ]).start(() => {
        Animated.parallel([
          Animated.spring(scale,  { toValue: 1, useNativeDriver: ND, tension: 200, friction: 6 }),
          Animated.timing(rotate, { toValue: 0, duration: 150, useNativeDriver: ND }),
        ]).start();
      });
      setRingTick(t => t + 1);
    }
  }, [focused]);

  // Idle: beacon ring
  useEffect(() => {
    if (focused) return;
    const t = setInterval(() => setRingTick(t => t + 1), 6000);
    return () => clearInterval(t);
  }, [focused]);

  const deg = rotate.interpolate({ inputRange: [-0.5, 0, 0.5], outputRange: ["-18deg", "0deg", "18deg"] });

  // 8 particles at equal angles
  const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

  return (
    <View style={styles.centered}>
      {/* 2 staggered epic rings */}
      <Ring color={color} baseSize={size} trigger={ringTick} delay={0}   maxScale={3.8} duration={800} />
      <Ring color={color} baseSize={size} trigger={ringTick} delay={120} maxScale={2.8} duration={700} />
      {/* 8 particles */}
      {ANGLES.map((angle, i) => (
        <Particle
          key={i}
          color={color}
          angleDeg={angle}
          distance={22}
          trigger={ringTick}
          delay={i * 20}
          size={focused ? 4 : 3}
          duration={550}
        />
      ))}
      <Animated.View style={{ transform: [{ rotate: deg }, { scale }] }}>
        <Feather name="star" size={size} color={color} />
      </Animated.View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 👑  PERFIL — VIP spotlight
//   On focus: glow ring materializes + 4 crown dots appear + icon lights up
//   Idle: glow ring slow breathe
// ══════════════════════════════════════════════════════════════════════════════
function UserIcon({ color, size, focused }: { color: string; size: number; focused: boolean }) {
  const scale        = useRef(new Animated.Value(1)).current;
  const ringScale    = useRef(new Animated.Value(0.6)).current;
  const ringOpacity  = useRef(new Animated.Value(0)).current;
  const ringLoop     = useRef<Animated.CompositeAnimation | null>(null);
  const dotOpacity   = useRef(new Animated.Value(0)).current;
  const dotScale     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    ringLoop.current?.stop();
    if (focused) {
      // Icon pop
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.22, useNativeDriver: ND, tension: 280, friction: 4 }),
        Animated.spring(scale, { toValue: 1,    useNativeDriver: ND, tension: 180, friction: 6 }),
      ]).start();
      // Spotlight ring appear
      ringScale.setValue(0.7);
      ringOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(ringScale,   { toValue: 1,   duration: 300, useNativeDriver: ND, easing: Easing.out(Easing.ease) }),
        Animated.timing(ringOpacity, { toValue: 0.9, duration: 300, useNativeDriver: ND }),
      ]).start(() => {
        // Keep pulsing while focused
        ringLoop.current = Animated.loop(
          Animated.sequence([
            Animated.timing(ringOpacity, { toValue: 0.4, duration: 900, useNativeDriver: ND, easing: Easing.inOut(Easing.ease) }),
            Animated.timing(ringOpacity, { toValue: 0.9, duration: 900, useNativeDriver: ND, easing: Easing.inOut(Easing.ease) }),
          ])
        );
        ringLoop.current.start();
      });
      // Crown dots pop in
      dotScale.setValue(0);
      dotOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(dotScale,   { toValue: 1, useNativeDriver: ND, tension: 300, friction: 5 }),
        Animated.timing(dotOpacity, { toValue: 1, duration: 200, useNativeDriver: ND }),
      ]).start();
    } else {
      // Idle: ring gently breathes
      Animated.timing(dotOpacity, { toValue: 0, duration: 200, useNativeDriver: ND }).start();
      Animated.timing(ringOpacity, { toValue: 0, duration: 300, useNativeDriver: ND }).start(() => {
        ringLoop.current = Animated.loop(
          Animated.sequence([
            Animated.timing(ringOpacity, { toValue: 0.15, duration: 2000, useNativeDriver: ND, easing: Easing.inOut(Easing.ease) }),
            Animated.timing(ringOpacity, { toValue: 0,    duration: 2000, useNativeDriver: ND, easing: Easing.inOut(Easing.ease) }),
          ])
        );
        ringScale.setValue(1);
        ringLoop.current.start();
      });
    }
    return () => ringLoop.current?.stop();
  }, [focused]);

  // Crown dot positions (top-left, top, top-right, right)
  const CROWN = [
    { top: -10, left: -8 },
    { top: -13, left: size / 2 - 3 },
    { top: -10, left: size + 0 },
  ];

  return (
    <View style={{ width: size + 16, height: size + 18, alignItems: "center", justifyContent: "center" }}>
      {/* Spotlight ring */}
      <Animated.View
        style={[styles.spotlightRing, {
          width: size + 14,
          height: size + 14,
          borderRadius: (size + 14) / 2,
          borderColor: color,
          transform: [{ scale: ringScale }],
          opacity: ringOpacity,
        }]}
      />
      {/* Crown dots */}
      {CROWN.map((pos, i) => (
        <Animated.View
          key={i}
          style={[styles.crownDot, {
            backgroundColor: color,
            top: pos.top,
            left: pos.left,
            opacity: dotOpacity,
            transform: [{ scale: dotScale }],
          }]}
        />
      ))}
      <Animated.View style={{ transform: [{ scale }] }}>
        <Feather name="user" size={size} color={color} />
      </Animated.View>
    </View>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function AnimatedTabIcon({ type, color, size = 22, focused }: Props) {
  switch (type) {
    case "home": return <HomeIcon  color={color} size={size} focused={focused} />;
    case "bell": return <BellIcon  color={color} size={size} focused={focused} />;
    case "tv":   return <TvIcon    color={color} size={size} focused={focused} />;
    case "film": return <FilmIcon  color={color} size={size} focused={focused} />;
    case "star": return <StarIcon  color={color} size={size} focused={focused} />;
    case "user": return <UserIcon  color={color} size={size} focused={focused} />;
    default:     return <Feather   name="circle" size={size} color={color} />;
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
  },
  ring: {
    position: "absolute",
    borderWidth: 1.5,
  },
  particle: {
    position: "absolute",
  },
  projectorBeam: {
    position: "absolute",
    bottom: "100%",
    alignSelf: "center",
    height: 30,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 30,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    transformOrigin: "bottom",
  },
  spotlightRing: {
    position: "absolute",
    borderWidth: 1.8,
  },
  crownDot: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
