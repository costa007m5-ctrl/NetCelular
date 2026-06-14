/**
 * StingAnimation — pure React Native animated sting/vinheta.
 *
 * Visual: neon tunnel of concentric rings flying toward the center,
 * a glowing red progress bar, and a subtle NETPLAY brand watermark.
 * No video file, no diamond artefact, no codec dependency.
 *
 * Reanimated rule respected: useAnimatedStyle lives inside <Ring>,
 * never directly inside a .map() call.
 */

import React, { useEffect } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const { width: W, height: H } = Dimensions.get("window");

export const STING_DURATION_MS = 5000;

const RING_COLOR    = "#e8400a";
const RING_CYCLE_MS = 2200;
const NUM_RINGS     = 9;

const RING_SIZES = [55, 105, 158, 216, 278, 344, 414, 488, 565] as const;

// ── Individual animated ring ──────────────────────────────────────────────────
interface RingProps {
  index: number;
  radius: number;
}

function Ring({ index, radius }: RingProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    const stagger = (index / NUM_RINGS) * RING_CYCLE_MS;

    progress.value = withSequence(
      withTiming(stagger / RING_CYCLE_MS, { duration: stagger, easing: Easing.linear }),
      withRepeat(
        withTiming(1, { duration: RING_CYCLE_MS, easing: Easing.linear }),
        -1,
        false,
      ),
    );

    return () => { cancelAnimation(progress); };
  }, []);

  const style = useAnimatedStyle(() => {
    const t = progress.value % 1;
    const scale = 1 - t;
    const opacity =
      t < 0.7 ? 0.8 - t * 0.6
      : t < 0.9 ? (0.8 - 0.7 * 0.6) * (1 - (t - 0.7) / 0.2)
      : 0;
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const size = radius * 2;
  const glowRadius = 4 + index * 2;

  return (
    <Animated.View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: radius,
          left: -radius,
          top: -radius,
          borderColor: RING_COLOR,
          shadowColor: RING_COLOR,
          shadowRadius: glowRadius,
          shadowOpacity: 0.85,
          shadowOffset: { width: 0, height: 0 },
          elevation: 4,
        },
        style,
      ]}
    />
  );
}

// ── Glowing progress bar ──────────────────────────────────────────────────────
function ProgressBar({ totalMs }: { totalMs: number }) {
  const fillRatio = useSharedValue(0);

  useEffect(() => {
    fillRatio.value = withTiming(1, { duration: totalMs, easing: Easing.linear });
    return () => { cancelAnimation(fillRatio); };
  }, []);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillRatio.value * 100}%` as any,
  }));

  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, fillStyle]} />
    </View>
  );
}

// ── Ambient center glow (static, subtle) ─────────────────────────────────────
function CenterGlow() {
  const scale = useSharedValue(0.9);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.35, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => { cancelAnimation(scale); };
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.centerGlow, style]} pointerEvents="none" />
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
interface StingAnimationProps {
  onEnd: () => void;
}

export default function StingAnimation({ onEnd }: StingAnimationProps) {
  useEffect(() => {
    const timer = setTimeout(onEnd, STING_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.root}>
      {/* Deep radial background */}
      <View style={styles.bgGlow} />

      {/* Ambient center pulse */}
      <CenterGlow />

      {/* Tunnel rings — centered */}
      <View style={styles.ringsAnchor} pointerEvents="none">
        {RING_SIZES.map((r, i) => (
          <Ring key={i} index={i} radius={r} />
        ))}
      </View>

      {/* Floor gradient — hides bottom half of rings for depth illusion */}
      <View style={styles.floor} pointerEvents="none" />

      {/* Bottom area: brand + progress */}
      <View style={styles.bottomArea} pointerEvents="none">
        <Text style={styles.brand}>
          <Text style={styles.brandNet}>NET</Text>
          <Text style={styles.brandPlay}>PLAY</Text>
        </Text>
        <ProgressBar totalMs={STING_DURATION_MS} />
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: W,
    height: H,
    backgroundColor: "#050505",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  bgGlow: {
    position: "absolute",
    top: "15%",
    left: "10%",
    right: "10%",
    bottom: "15%",
    borderRadius: 9999,
    backgroundColor: "#1a0500",
    opacity: 0.75,
  },

  centerGlow: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "#ff220010",
    shadowColor: "#ff2200",
    shadowRadius: 40,
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },

  ringsAnchor: {
    position: "absolute",
    top: H * 0.5,
    left: W * 0.5,
    width: 0,
    height: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  ring: {
    position: "absolute",
    borderWidth: 1.5,
  },

  floor: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: H * 0.38,
    backgroundColor: "#050505",
    opacity: 0.85,
  },

  bottomArea: {
    position: "absolute",
    bottom: H * 0.12,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 14,
  },

  brand: {
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 8,
    opacity: 0.16,
  },

  brandNet: {
    color: "#e50914",
  },

  brandPlay: {
    color: "#ffffff",
  },

  barTrack: {
    width: W * 0.76,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(232,64,10,0.3)",
    overflow: "hidden",
    shadowColor: "#e8400a",
    shadowRadius: 8,
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },

  barFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#e8400a",
    shadowColor: "#ff3300",
    shadowRadius: 10,
    shadowOpacity: 0.8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
});
