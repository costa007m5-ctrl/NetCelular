/**
 * StingAnimation — faithful React Native recreation of the NETPLAY sting video.
 *
 * Sequence (10 s total):
 *  0-2 s   — Neon semicircular arch rings flying inward (tunnel effect)
 *  2-3.5 s — App icon materializes with intense glow/bloom
 *  3.5-5 s — Icon clears, progress bar visible
 *  5-7 s   — NETPLAY text fades in
 *  7-10 s  — Subtitle appears; full logo hold
 *
 * Visual tricks:
 *  - Rings are FULL circles centered at the horizon line
 *  - A floor View overlays the lower 42% of screen, hiding the bottom half
 *    of each ring → result looks like semicircular arches
 *  - scale() on each ring converges at the ring's center = horizon center ✓
 *
 * Reanimated rule: useAnimatedStyle lives inside <Ring>, never in .map().
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
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

export const STING_DURATION_MS = 10_000;

// Horizon = where arches meet the floor (rings centered here)
const HORIZON_Y = H * 0.58;
const ARCH_HEIGHT = HORIZON_Y; // the clipping area is 0..HORIZON_Y

const RING_COLOR   = "#cc2020";
const RING_CYCLE   = 1600; // ms per full cycle
const NUM_RINGS    = 12;

// Radii of the rings — small inner to large outer
const RING_RADII = [38, 72, 112, 160, 215, 278, 348, 425, 510, 600, 700, 810];

// ── Individual animated arch ring ──────────────────────────────────────────
interface RingProps { radius: number; index: number }

function Ring({ radius, index }: RingProps) {
  const scale   = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const phase        = index / NUM_RINGS;
    const startScale   = 1 - phase;
    const firstMs      = phase * RING_CYCLE;
    const resetMs      = 30;

    scale.value   = startScale;
    opacity.value = startScale > 0.05 ? 0.78 : 0;

    scale.value = withSequence(
      withTiming(0, { duration: firstMs, easing: Easing.linear }),
      withRepeat(
        withSequence(
          withTiming(1, { duration: resetMs }),
          withTiming(0, { duration: RING_CYCLE, easing: Easing.linear }),
        ),
        -1,
        false,
      ),
    );

    opacity.value = withSequence(
      withTiming(0, { duration: firstMs * 0.9, easing: Easing.linear }),
      withRepeat(
        withSequence(
          withTiming(0.78, { duration: resetMs + RING_CYCLE * 0.05 }),
          withTiming(0.78, { duration: RING_CYCLE * 0.78, easing: Easing.linear }),
          withTiming(0,    { duration: RING_CYCLE * 0.17, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );

    return () => { cancelAnimation(scale); cancelAnimation(opacity); };
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const size = radius * 2;
  const glow = Math.min(14, 4 + index);

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: radius,
          left: -radius,
          top: -radius,
          borderWidth: 1.5,
          borderColor: RING_COLOR,
          shadowColor: "#ff2020",
          shadowRadius: glow,
          shadowOpacity: 0.9,
          shadowOffset: { width: 0, height: 0 },
          elevation: 3,
        },
        animStyle,
      ]}
    />
  );
}

// ── Logo icon with bloom-in animation ──────────────────────────────────────
function LogoIcon({ showAt }: { showAt: number }) {
  const opacity = useSharedValue(0);
  const scale   = useSharedValue(0.2);
  const blur    = useSharedValue(30);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(true);
      // Bloom phase: fade in bright + blurry
      opacity.value = withTiming(1, { duration: 400 });
      scale.value   = withSequence(
        withTiming(1.15, { duration: 500, easing: Easing.out(Easing.quad) }),
        withTiming(1,    { duration: 400, easing: Easing.in(Easing.quad) }),
      );
    }, showAt);
    return () => clearTimeout(timer);
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!visible) return null;
  return (
    <Animated.View style={[styles.iconWrap, iconStyle]}>
      <Image
        source={require("@/assets/images/icon.png")}
        style={styles.icon}
        resizeMode="contain"
      />
      {/* Glow ring around icon */}
      <View style={styles.iconGlow} />
    </Animated.View>
  );
}

// ── NETPLAY text ───────────────────────────────────────────────────────────
function BrandText({ showAt }: { showAt: number }) {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(16);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(true);
      opacity.value    = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) });
      translateY.value = withTiming(0, { duration: 700, easing: Easing.out(Easing.quad) });
    }, showAt);
    return () => clearTimeout(timer);
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;
  return (
    <Animated.View style={[styles.brandWrap, style]}>
      <Text style={styles.brandName}>
        <Text style={styles.netText}>NET</Text>
        <Text style={styles.playText}>PLAY</Text>
      </Text>
    </Animated.View>
  );
}

// ── Subtitle ───────────────────────────────────────────────────────────────
function Subtitle({ showAt }: { showAt: number }) {
  const opacity = useSharedValue(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(true);
      opacity.value = withTiming(1, { duration: 800 });
    }, showAt);
    return () => clearTimeout(timer);
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  if (!visible) return null;
  return (
    <Animated.Text style={[styles.tagline, style]}>
      CATÁLOGO PREMIUM • ENTRETENIMENTO
    </Animated.Text>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────
function ProgressBar({ totalMs, showAt }: { totalMs: number; showAt: number }) {
  const fill   = useSharedValue(0);
  const wrapOp = useSharedValue(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(true);
      wrapOp.value = withTiming(1, { duration: 400 });
      fill.value   = withTiming(1, {
        duration: totalMs - showAt,
        easing: Easing.linear,
      });
    }, showAt);
    return () => clearTimeout(timer);
  }, []);

  const wrapStyle = useAnimatedStyle(() => ({ opacity: wrapOp.value }));
  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%` as any,
  }));

  if (!visible) return null;
  return (
    <Animated.View style={[styles.progressWrap, wrapStyle]}>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, fillStyle]} />
      </View>
    </Animated.View>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
interface StingAnimationProps { onEnd: () => void }

export default function StingAnimation({ onEnd }: StingAnimationProps) {
  useEffect(() => {
    const timer = setTimeout(onEnd, STING_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.root}>
      {/* Background */}
      <View style={styles.bg} />

      {/* ── Arch rings (overflow hidden clips lower half → semicircles) ──── */}
      <View style={styles.archArea}>
        <View style={styles.ringsOrigin}>
          {RING_RADII.map((r, i) => (
            <Ring key={i} radius={r} index={i} />
          ))}
        </View>
      </View>

      {/* ── Floor covers lower 42% hiding bottom half of rings ────────────── */}
      <View style={styles.floor} />

      {/* ── Horizon glow line ──────────────────────────────────────────────── */}
      <View style={styles.horizonLine} />

      {/* ── Logo block (centered on screen) ────────────────────────────────── */}
      <View style={styles.logoBlock} pointerEvents="none">
        <LogoIcon  showAt={2000} />
        <BrandText showAt={4800} />
        <Subtitle  showAt={6600} />
      </View>

      {/* ── Progress bar ───────────────────────────────────────────────────── */}
      <ProgressBar totalMs={STING_DURATION_MS} showAt={1800} />
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const ICON_SIZE    = Math.round(W * 0.28);
const BRAND_SIZE   = Math.round(W * 0.12);
const TAG_SIZE     = Math.round(W * 0.031);

const styles = StyleSheet.create({
  root: {
    width: W,
    height: H,
    backgroundColor: "#080101",
    overflow: "hidden",
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0a0101",
  },

  // ── Rings
  archArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: ARCH_HEIGHT,
    overflow: "hidden",
  },
  ringsOrigin: {
    position: "absolute",
    bottom: 0,
    left: W / 2,
  },

  // ── Floor
  floor: {
    position: "absolute",
    top: HORIZON_Y,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#060000",
  },
  horizonLine: {
    position: "absolute",
    top: HORIZON_Y - 1,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#cc1010",
    shadowColor: "#ff2020",
    shadowRadius: 10,
    shadowOpacity: 0.8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },

  // ── Logo block
  logoBlock: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: H * 0.28,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  iconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE * 0.22,
  },
  iconGlow: {
    position: "absolute",
    width: ICON_SIZE * 1.8,
    height: ICON_SIZE * 1.8,
    borderRadius: ICON_SIZE * 0.9,
    backgroundColor: "transparent",
    shadowColor: "#ff2020",
    shadowRadius: 40,
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },

  // ── Text
  brandWrap: { alignItems: "center" },
  brandName:  { fontSize: BRAND_SIZE, fontWeight: "900", letterSpacing: 2 },
  netText:    { color: "#e50914" },
  playText:   { color: "#ffffff" },
  tagline: {
    fontSize: TAG_SIZE,
    fontWeight: "500",
    letterSpacing: 3,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
  },

  // ── Progress bar
  progressWrap: {
    position: "absolute",
    bottom: H * 0.26,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  progressTrack: {
    width: W * 0.72,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(204,32,32,0.35)",
    overflow: "hidden",
    shadowColor: "#cc2020",
    shadowRadius: 8,
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: "#dd2020",
    shadowColor: "#ff2020",
    shadowRadius: 8,
    shadowOpacity: 0.8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
});
