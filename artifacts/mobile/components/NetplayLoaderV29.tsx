import React, { useEffect } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

// Safe easing — Easing.linear works on all platforms (web, iOS, Android)
const LIN = Easing.linear;

// ── Arc spinner ───────────────────────────────────────────────────────────────
function Arc({
  size,
  borderWidth,
  topColor,
  rightColor,
  bottomColor,
  leftColor,
  duration,
  reverse = false,
}: {
  size: number;
  borderWidth: number;
  topColor?: string;
  rightColor?: string;
  bottomColor?: string;
  leftColor?: string;
  duration: number;
  reverse?: boolean;
}) {
  const rotation = useSharedValue(reverse ? 360 : 0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(reverse ? 0 : 360, { duration, easing: LIN }),
      -1,
      false,
    );
    return () => cancelAnimation(rotation);
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      style={[
        style,
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderTopColor: topColor ?? "transparent",
          borderRightColor: rightColor ?? "transparent",
          borderBottomColor: bottomColor ?? "transparent",
          borderLeftColor: leftColor ?? "transparent",
        },
      ]}
    />
  );
}

// ── Orbit dot ─────────────────────────────────────────────────────────────────
function OrbitDot({ arcSize }: { arcSize: number }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 5000, easing: LIN }),
      -1,
      false,
    );
    return () => cancelAnimation(rotation);
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      style={[
        style,
        {
          position: "absolute",
          width: arcSize,
          height: arcSize,
          alignItems: "center",
        },
      ]}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 3.5,
          marginTop: 4,
          backgroundColor: "#ff6672",
          shadowColor: "#ff2034",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6,
          shadowRadius: 6,
          elevation: 4,
        }}
      />
    </Animated.View>
  );
}

// ── Ring pulse ────────────────────────────────────────────────────────────────
function Ring({ size, delay }: { size: number; delay: number }) {
  const opacity = useSharedValue(0.8);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.55, { duration: 2400, easing: LIN }),
          withTiming(0.8,  { duration: 2400, easing: LIN }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(opacity);
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        style,
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: "rgba(255,36,52,0.15)",
        },
      ]}
    />
  );
}

// ── Equalizer bar ─────────────────────────────────────────────────────────────
function EqBar({ height, delay }: { height: number; delay: number }) {
  const scaleY = useSharedValue(0.72);

  useEffect(() => {
    scaleY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.26, { duration: 500, easing: LIN }),
          withTiming(0.72, { duration: 500, easing: LIN }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(scaleY);
  }, []);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: scaleY.value }] }));

  return (
    <Animated.View style={style}>
      <LinearGradient
        colors={["#ff6672", "#ff2034"]}
        style={{ width: 7, height, borderRadius: 999 }}
      />
    </Animated.View>
  );
}

// ── Particle ──────────────────────────────────────────────────────────────────
function Particle({ left, top, delay }: { left: string; top: string; delay: number }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.75, { duration: 1700, easing: LIN }),
          withTiming(0.36, { duration: 2800, easing: LIN }),
          withTiming(0,    { duration: 700,  easing: LIN }),
          withTiming(0,    { duration: 1600, easing: LIN }),
        ),
        -1,
        false,
      ),
    );
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-20, { duration: 5200, easing: LIN }),
          withTiming(8,   { duration: 0   }),
          withTiming(8,   { duration: 1600, easing: LIN }),
        ),
        -1,
        false,
      ),
    );
    return () => {
      cancelAnimation(opacity);
      cancelAnimation(translateY);
    };
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        style,
        {
          position: "absolute",
          left,
          top,
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: "rgba(255,110,120,0.88)",
        },
      ]}
    />
  );
}

// ── N-letter center pulse ─────────────────────────────────────────────────────
function CenterBox() {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 1000, easing: LIN }),
        withTiming(1.0,  { duration: 1000, easing: LIN }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(scale);
  }, []);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <LinearGradient
        colors={["#ff4c58", "#f40408", "#980008"]}
        style={styles.centerBox}
      >
        <View style={styles.centerShine} />
        <Text style={styles.nLetter}>N</Text>
        <View style={styles.playBadge} />
      </LinearGradient>
    </Animated.View>
  );
}

// ── Halo ──────────────────────────────────────────────────────────────────────
function Halo() {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 1100, easing: LIN }),
        withTiming(1.0, { duration: 1100, easing: LIN }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(scale);
  }, []);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[
        style,
        {
          position: "absolute",
          width: 164,
          height: 164,
          borderRadius: 82,
          backgroundColor: "rgba(255,45,60,0.12)",
        },
      ]}
    />
  );
}

// ── Animated dots "..." ───────────────────────────────────────────────────────
function AnimatedDots() {
  const [dots, setDots] = React.useState("");
  useEffect(() => {
    const id = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 400);
    return () => clearInterval(id);
  }, []);
  return <Text style={styles.loadingText}>{dots}</Text>;
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function NetplayLoaderV29() {
  return (
    <View style={styles.root}>
      {/* Background ambient glow */}
      <View style={styles.ambientGlow} />

      {/* Concentric rings */}
      <Ring size={310} delay={0} />
      <Ring size={230} delay={240} />
      <Ring size={150} delay={480} />

      {/* Particles */}
      <Particle left="19%" top="34%" delay={200} />
      <Particle left="30%" top="67%" delay={900} />
      <Particle left="42%" top="25%" delay={500} />
      <Particle left="63%" top="24%" delay={1100} />
      <Particle left="77%" top="66%" delay={750} />
      <Particle left="58%" top="73%" delay={1350} />

      {/* Loader center */}
      <View style={styles.loaderWrap}>
        <View style={styles.loader}>
          <Halo />
          <View style={styles.track} />

          {/* Three spinning arcs */}
          <Arc size={128} borderWidth={4} topColor="#ff2034" rightColor="#ff6672" duration={1050} />
          <Arc size={104} borderWidth={3} bottomColor="rgba(255,105,116,0.88)" leftColor="rgba(255,31,51,0.78)" duration={1750} reverse />
          <Arc size={84}  borderWidth={2} topColor="rgba(255,255,255,0.16)" rightColor="rgba(255,255,255,0.05)" duration={2400} />

          <OrbitDot arcSize={128} />
          <CenterBox />
        </View>

        {/* Equalizer */}
        <View style={styles.equalizerRow}>
          <EqBar height={8}  delay={0}   />
          <EqBar height={16} delay={120} />
          <EqBar height={11} delay={240} />
          <EqBar height={16} delay={360} />
          <EqBar height={8}  delay={480} />
        </View>

        {/* Loading text */}
        <View style={styles.textRow}>
          <Text style={styles.loadingBold}>Carregando</Text>
          <AnimatedDots />
        </View>

        <Text style={styles.sub}>NETPLAY STREAMING</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  ambientGlow: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: "rgba(255,36,52,0.10)",
  },
  loaderWrap: {
    alignItems: "center",
    gap: 18,
    marginTop: -20,
  },
  loader: {
    width: 128,
    height: 128,
    alignItems: "center",
    justifyContent: "center",
  },
  track: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  centerBox: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#ff2034",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  centerShine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  nLetter: {
    fontFamily: Platform.OS === "ios" ? "Arial-BoldMT" : "sans-serif-black",
    fontSize: 40,
    fontWeight: "900",
    color: "#f6f7f8",
    lineHeight: 44,
    letterSpacing: -2,
    zIndex: 1,
  },
  playBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#f5f5f7",
    zIndex: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 5,
    elevation: 6,
  },
  equalizerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 7,
    height: 18,
  },
  textRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  loadingBold: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  loadingText: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 19,
    fontWeight: "700",
    width: 24,
  },
  sub: {
    color: "rgba(255,255,255,0.14)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3.5,
    textTransform: "uppercase",
    marginTop: -8,
  },
});
