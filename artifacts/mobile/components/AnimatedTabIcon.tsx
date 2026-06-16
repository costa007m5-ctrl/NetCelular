import React, { useEffect, useRef, useCallback } from "react";
import { Animated, Easing, Platform, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

export type TabIconType = "home" | "bell" | "tv" | "film" | "star" | "user";

interface Props {
  type: TabIconType;
  color: string;
  size?: number;
  focused: boolean;
}

// On web, useNativeDriver is not supported — fall back to JS driver
const ND = Platform.OS !== "web";

// ── Home: spring bounce up ─────────────────────────────────────────────────────
function HomeIcon({ color, size, focused }: { color: string; size: number; focused: boolean }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (focused) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: -5, useNativeDriver: ND, tension: 220, friction: 5 }),
        Animated.spring(scale,      { toValue: 1.18, useNativeDriver: ND, tension: 220, friction: 5 }),
      ]).start(() => {
        Animated.parallel([
          Animated.spring(translateY, { toValue: 0, useNativeDriver: ND, tension: 180, friction: 7 }),
          Animated.spring(scale,      { toValue: 1, useNativeDriver: ND, tension: 180, friction: 7 }),
        ]).start();
      });
    }
  }, [focused]);

  return (
    <Animated.View style={{ transform: [{ translateY }, { scale }] }}>
      <Feather name="home" size={size} color={color} />
    </Animated.View>
  );
}

// ── Bell: ring shake + periodic idle ring ─────────────────────────────────────
function BellIcon({ color, size, focused }: { color: string; size: number; focused: boolean }) {
  const rotate = useRef(new Animated.Value(0)).current;
  const scale  = useRef(new Animated.Value(1)).current;

  const doRing = useCallback(() => {
    rotate.setValue(0);
    Animated.sequence([
      Animated.timing(rotate, { toValue:  1,  duration: 60,  useNativeDriver: ND, easing: Easing.linear }),
      Animated.timing(rotate, { toValue: -1,  duration: 60,  useNativeDriver: ND, easing: Easing.linear }),
      Animated.timing(rotate, { toValue:  1,  duration: 60,  useNativeDriver: ND, easing: Easing.linear }),
      Animated.timing(rotate, { toValue: -1,  duration: 60,  useNativeDriver: ND, easing: Easing.linear }),
      Animated.timing(rotate, { toValue:  0.5, duration: 60, useNativeDriver: ND, easing: Easing.linear }),
      Animated.timing(rotate, { toValue:  0,  duration: 60,  useNativeDriver: ND, easing: Easing.linear }),
    ]).start();
  }, [rotate]);

  useEffect(() => {
    if (focused) {
      Animated.spring(scale, { toValue: 1.2, useNativeDriver: ND, tension: 200, friction: 5 }).start(() => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: ND, tension: 180, friction: 6 }).start();
      });
      doRing();
    }
  }, [focused]);

  // Periodic idle ring every ~8s when not focused
  useEffect(() => {
    if (focused) return;
    const t = setInterval(() => { if (Math.random() < 0.6) doRing(); }, 8000);
    return () => clearInterval(t);
  }, [focused, doRing]);

  const deg = rotate.interpolate({ inputRange: [-1, 0, 1], outputRange: ["-18deg", "0deg", "18deg"] });

  return (
    <Animated.View style={{ transform: [{ rotate: deg }, { scale }] }}>
      <Feather name="bell" size={size} color={color} />
    </Animated.View>
  );
}

// ── TV: live signal pulse + periodic static blink ─────────────────────────────
function TvIcon({ color, size, focused }: { color: string; size: number; focused: boolean }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const loop    = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (focused) {
      loop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.22, duration: 400, useNativeDriver: ND, easing: Easing.out(Easing.ease) }),
          Animated.timing(scale, { toValue: 1,    duration: 400, useNativeDriver: ND, easing: Easing.in(Easing.ease) }),
        ])
      );
      loop.current.start();
    } else {
      loop.current?.stop();
      Animated.spring(scale, { toValue: 1, useNativeDriver: ND }).start();
    }
    return () => loop.current?.stop();
  }, [focused]);

  // Occasional "signal blink" when idle
  useEffect(() => {
    if (focused) return;
    const t = setInterval(() => {
      if (Math.random() < 0.5) {
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.2, duration: 80,  useNativeDriver: ND }),
          Animated.timing(opacity, { toValue: 1,   duration: 80,  useNativeDriver: ND }),
          Animated.timing(opacity, { toValue: 0.2, duration: 80,  useNativeDriver: ND }),
          Animated.timing(opacity, { toValue: 1,   duration: 120, useNativeDriver: ND }),
        ]).start();
      }
    }, 5000);
    return () => clearInterval(t);
  }, [focused]);

  return (
    <Animated.View style={{ transform: [{ scale }], opacity }}>
      <Feather name="tv" size={size} color={color} />
    </Animated.View>
  );
}

// ── Film: continuous spin like a reel + idle flick ────────────────────────────
function FilmIcon({ color, size, focused }: { color: string; size: number; focused: boolean }) {
  const rotate = useRef(new Animated.Value(0)).current;
  const scale  = useRef(new Animated.Value(1)).current;
  const loop   = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (focused) {
      rotate.setValue(0);
      Animated.spring(scale, { toValue: 1.15, useNativeDriver: ND, tension: 200, friction: 5 }).start();
      loop.current = Animated.loop(
        Animated.timing(rotate, { toValue: 1, duration: 800, useNativeDriver: ND, easing: Easing.linear })
      );
      loop.current.start();
    } else {
      loop.current?.stop();
      Animated.spring(scale, { toValue: 1, useNativeDriver: ND }).start();
    }
    return () => loop.current?.stop();
  }, [focused]);

  // Occasional quick flick when idle
  useEffect(() => {
    if (focused) return;
    const t = setInterval(() => {
      if (Math.random() < 0.45) {
        rotate.setValue(0);
        Animated.timing(rotate, { toValue: 0.25, duration: 300, useNativeDriver: ND, easing: Easing.out(Easing.back(2)) }).start(() => {
          Animated.timing(rotate, { toValue: 0, duration: 200, useNativeDriver: ND }).start();
        });
      }
    }, 7000);
    return () => clearInterval(t);
  }, [focused]);

  const deg = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={{ transform: [{ rotate: deg }, { scale }] }}>
      <Feather name="film" size={size} color={color} />
    </Animated.View>
  );
}

// ── Star: twinkle + rotation wobble + sparkle ring burst ─────────────────────
function StarIcon({ color, size, focused }: { color: string; size: number; focused: boolean }) {
  const scale         = useRef(new Animated.Value(1)).current;
  const rotate        = useRef(new Animated.Value(0)).current;
  const sparkleScale  = useRef(new Animated.Value(0)).current;
  const sparkleOpacity = useRef(new Animated.Value(0)).current;

  const doSparkle = useCallback(() => {
    sparkleScale.setValue(0.3);
    sparkleOpacity.setValue(0.85);
    Animated.parallel([
      Animated.timing(sparkleScale,   { toValue: 2.5, duration: 550, useNativeDriver: ND, easing: Easing.out(Easing.ease) }),
      Animated.timing(sparkleOpacity, { toValue: 0,   duration: 550, useNativeDriver: ND }),
    ]).start();
  }, [sparkleScale, sparkleOpacity]);

  useEffect(() => {
    if (focused) {
      Animated.sequence([
        Animated.parallel([
          Animated.spring(scale,  { toValue: 1.4,  useNativeDriver: ND, tension: 300, friction: 4 }),
          Animated.timing(rotate, { toValue: 1,    duration: 200, useNativeDriver: ND, easing: Easing.out(Easing.ease) }),
        ]),
        Animated.parallel([
          Animated.spring(scale,  { toValue: 1.05, useNativeDriver: ND, tension: 150, friction: 5 }),
          Animated.timing(rotate, { toValue: -0.3, duration: 150, useNativeDriver: ND }),
        ]),
        Animated.parallel([
          Animated.spring(scale,  { toValue: 1, useNativeDriver: ND, tension: 180, friction: 6 }),
          Animated.timing(rotate, { toValue: 0, duration: 120, useNativeDriver: ND }),
        ]),
      ]).start();
      doSparkle();
    }
  }, [focused]);

  // Periodic sparkle burst when idle
  useEffect(() => {
    if (focused) return;
    const t = setInterval(() => { if (Math.random() < 0.55) doSparkle(); }, 6000);
    return () => clearInterval(t);
  }, [focused, doSparkle]);

  const deg = rotate.interpolate({ inputRange: [-1, 0, 1], outputRange: ["-30deg", "0deg", "30deg"] });

  return (
    <View style={{ width: size + 12, height: size + 12, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={[
          styles.sparkleRing,
          {
            width: size,
            height: size,
            borderRadius: size,
            borderColor: color,
            transform: [{ scale: sparkleScale }],
            opacity: sparkleOpacity,
          },
        ]}
      />
      <Animated.View style={{ transform: [{ rotate: deg }, { scale }] }}>
        <Feather name="star" size={size} color={color} />
      </Animated.View>
    </View>
  );
}

// ── User/Profile: pop bounce + orbiting dot ───────────────────────────────────
function UserIcon({ color, size, focused }: { color: string; size: number; focused: boolean }) {
  const scale      = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const dotOpacity = useRef(new Animated.Value(0)).current;
  const dotRotate  = useRef(new Animated.Value(0)).current;
  const orbit      = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (focused) {
      Animated.sequence([
        Animated.parallel([
          Animated.spring(scale,      { toValue: 1.25, useNativeDriver: ND, tension: 300, friction: 4 }),
          Animated.timing(translateY, { toValue: -4,   duration: 120, useNativeDriver: ND }),
        ]),
        Animated.parallel([
          Animated.spring(scale,      { toValue: 0.92, useNativeDriver: ND, tension: 200, friction: 6 }),
          Animated.timing(translateY, { toValue: 2,    duration: 100, useNativeDriver: ND }),
        ]),
        Animated.parallel([
          Animated.spring(scale,      { toValue: 1, useNativeDriver: ND, tension: 180, friction: 7 }),
          Animated.timing(translateY, { toValue: 0, duration: 100, useNativeDriver: ND }),
        ]),
      ]).start();

      dotOpacity.setValue(1);
      dotRotate.setValue(0);
      orbit.current = Animated.loop(
        Animated.timing(dotRotate, { toValue: 1, duration: 1600, useNativeDriver: ND, easing: Easing.linear })
      );
      orbit.current.start();
    } else {
      orbit.current?.stop();
      Animated.timing(dotOpacity, { toValue: 0, duration: 200, useNativeDriver: ND }).start();
      Animated.spring(scale,      { toValue: 1, useNativeDriver: ND }).start();
    }
    return () => orbit.current?.stop();
  }, [focused]);

  const orbitDeg = dotRotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const radius   = (size / 2) + 5;

  return (
    <View style={{ width: size + 14, height: size + 14, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={[
          styles.orbitDot,
          {
            backgroundColor: color,
            opacity: dotOpacity,
            transform: [{ rotate: orbitDeg }, { translateX: radius }],
          },
        ]}
      />
      <Animated.View style={{ transform: [{ scale }, { translateY }] }}>
        <Feather name="user" size={size} color={color} />
      </Animated.View>
    </View>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
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

const styles = StyleSheet.create({
  sparkleRing: {
    position: "absolute",
    borderWidth: 1.5,
  },
  orbitDot: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
