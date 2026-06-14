/**
 * StingAnimation — NETPLAY opening sting, programmatic React Native animation.
 *
 * Layout zones:
 *   TOP (0 → HORIZON_Y)   — animated semicircular arch rings + content title logo
 *   BOTTOM (HORIZON_Y → H) — NETPLAY brand logo + tagline
 *   FOOTER                 — progress bar with percentage counter
 *
 * Sequence (10 s total):
 *  0-2.5 s  — Neon arch rings fly inward (tunnel effect)
 *  2-3.5 s  — Content title logo materialises with bloom glow + scale-up
 *  3.5 s    — Progress bar + % counter appear
 *  5 s      — NETPLAY brand appears below horizon
 *  7 s      — Tagline appears
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
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

export const STING_DURATION_MS = 10_000;

const RED      = "#e50914";
const RED_GLOW = "#ff2020";
const RING_CLR = "#cc1818";
const CYCLE_MS = 1400;
const NUM_RINGS = 14;
const RING_RADII = [30, 58, 92, 132, 178, 232, 292, 360, 435, 518, 610, 712, 823, 944];

// ── Individual animated arch ring ─────────────────────────────────────────────
interface RingProps { radius: number; index: number }

function Ring({ radius, index }: RingProps) {
  const scale   = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const phase   = index / NUM_RINGS;
    const firstMs = phase * CYCLE_MS;
    const resetMs = 25;

    scale.value   = 1 - phase;
    opacity.value = 1 - phase > 0.05 ? 0.82 : 0;

    scale.value = withSequence(
      withTiming(0, { duration: firstMs, easing: Easing.linear }),
      withRepeat(
        withSequence(
          withTiming(1, { duration: resetMs }),
          withTiming(0, { duration: CYCLE_MS, easing: Easing.linear }),
        ),
        -1, false,
      ),
    );

    opacity.value = withSequence(
      withTiming(0, { duration: firstMs * 0.9, easing: Easing.linear }),
      withRepeat(
        withSequence(
          withTiming(0.85, { duration: resetMs + CYCLE_MS * 0.05 }),
          withTiming(0.85, { duration: CYCLE_MS * 0.75, easing: Easing.linear }),
          withTiming(0,    { duration: CYCLE_MS * 0.2,  easing: Easing.in(Easing.quad) }),
        ),
        -1, false,
      ),
    );

    return () => { cancelAnimation(scale); cancelAnimation(opacity); };
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const size = radius * 2;
  const glow = Math.min(18, 5 + index * 1.1);
  const bw   = index < 4 ? 1.2 : index < 8 ? 1.5 : 2;

  return (
    <Animated.View
      style={[{
        position: "absolute",
        width: size, height: size, borderRadius: radius,
        left: -radius, top: -radius,
        borderWidth: bw, borderColor: RING_CLR,
        shadowColor: RED_GLOW, shadowRadius: glow, shadowOpacity: 0.95,
        shadowOffset: { width: 0, height: 0 }, elevation: 4,
      }, animStyle]}
    />
  );
}

// ── Content title logo (inside arch rings area) ───────────────────────────────
function ContentLogo({ showAt, logoUrl, logoW, logoH }: {
  showAt: number; logoUrl?: string; logoW: number; logoH: number;
}) {
  const opacity    = useSharedValue(0);
  const scale      = useSharedValue(0.75);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(true);
      // Scale-up like Disney+ castle — starts smaller, blooms to full size
      scale.value = withSequence(
        withTiming(1.08, { duration: 550, easing: Easing.out(Easing.cubic) }),
        withTiming(1.0,  { duration: 350, easing: Easing.inOut(Easing.quad) }),
      );
      opacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) });
    }, showAt);
    return () => clearTimeout(t);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!visible || !logoUrl) return null;

  return (
    <Animated.View style={[styles.logoWrap, animStyle]}>
      <View style={[styles.logoGlow, { width: logoW * 1.4, height: logoH * 2 }]} />
      <Image
        source={{ uri: logoUrl }}
        style={{ width: logoW, height: logoH }}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

// ── NETPLAY brand (below horizon line) ───────────────────────────────────────
function BrandBlock({ showAt, W }: { showAt: number; W: number }) {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(20);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(true);
      opacity.value    = withTiming(1, { duration: 800, easing: Easing.out(Easing.quad) });
      translateY.value = withTiming(0, { duration: 800, easing: Easing.out(Easing.cubic) });
    }, showAt);
    return () => clearTimeout(t);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const brandSize = Math.round(Math.min(W * 0.13, 48));
  const tagSize   = Math.round(Math.min(W * 0.028, 12));

  if (!visible) return null;
  return (
    <Animated.View style={[{ alignItems: "center", gap: 6 }, animStyle]}>
      {/* NETPLAY logotype */}
      <Text style={{ fontSize: brandSize, fontWeight: "900", letterSpacing: 6 }}>
        <Text style={{ color: RED }}>NET</Text>
        <Text style={{ color: "#ffffff" }}>PLAY</Text>
      </Text>
      {/* Decorative line */}
      <View style={{
        width: brandSize * 3.2, height: 1.5,
        backgroundColor: RED,
        shadowColor: RED_GLOW, shadowRadius: 8, shadowOpacity: 0.9,
        shadowOffset: { width: 0, height: 0 },
      }} />
      {/* Tagline */}
      <Text style={{
        fontSize: tagSize, fontWeight: "500", letterSpacing: 3,
        color: "rgba(255,255,255,0.45)", textAlign: "center",
        marginTop: 2,
      }}>
        CATÁLOGO PREMIUM • ENTRETENIMENTO
      </Text>
    </Animated.View>
  );
}

// ── Progress bar with percentage counter ──────────────────────────────────────
function ProgressBar({ totalMs, showAt, barW }: {
  totalMs: number; showAt: number; barW: number;
}) {
  const fill    = useSharedValue(0);
  const wrapOp  = useSharedValue(0);
  const [visible,  setVisible]  = useState(false);
  const [percent,  setPercent]  = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(true);
      wrapOp.value = withTiming(1, { duration: 350 });
      fill.value   = withTiming(1, { duration: totalMs - showAt, easing: Easing.linear });

      // JS-side percentage counter (updates ~10 fps)
      const duration = totalMs - showAt;
      const start    = Date.now();
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - start;
        const pct = Math.min(99, Math.round((elapsed / duration) * 100));
        setPercent(pct);
        if (pct >= 99) {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }, 100);
    }, showAt);

    return () => {
      clearTimeout(t);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const wrapStyle = useAnimatedStyle(() => ({ opacity: wrapOp.value }));
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` as any }));

  if (!visible) return null;
  return (
    <Animated.View style={[styles.progressWrap, wrapStyle]}>
      {/* Percentage number */}
      <Text style={styles.percentText}>{percent}%</Text>
      {/* Track */}
      <View style={[styles.progressTrack, { width: barW }]}>
        <Animated.View style={[styles.progressFill, fillStyle]} />
      </View>
      <Text style={styles.loadingLabel}>CARREGANDO</Text>
    </Animated.View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface StingAnimationProps {
  onEnd:    () => void;
  logoUrl?: string;
}

export default function StingAnimation({ onEnd, logoUrl }: StingAnimationProps) {
  const { width: W, height: H } = useWindowDimensions();
  const onEndRef = useRef(onEnd);
  useEffect(() => { onEndRef.current = onEnd; });

  useEffect(() => {
    const t = setTimeout(() => onEndRef.current(), STING_DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  // Arch rings occupy top 52% of screen; NETPLAY lives below
  const HORIZON_Y = H * 0.52;
  const LOGO_W    = Math.round(Math.min(W * 0.68, 300));
  const LOGO_H    = Math.round(LOGO_W * 0.38);

  return (
    <View style={{ flex: 1, backgroundColor: "#060000", overflow: "hidden" }}>

      {/* ── Arch rings zone (top half, overflow hidden) ──────────────────── */}
      <View style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: HORIZON_Y, overflow: "hidden",
      }}>
        {/* Centre radial glow */}
        <View style={{
          position: "absolute",
          width: W * 1.2, height: W * 1.2, borderRadius: W * 0.6,
          left: W / 2 - W * 0.6, top: HORIZON_Y - W * 0.6,
          shadowColor: "#600000", shadowRadius: 120, shadowOpacity: 0.7,
          shadowOffset: { width: 0, height: 0 },
        }} />

        {/* Arch ring pivot at horizon centre */}
        <View style={{ position: "absolute", bottom: 0, left: W / 2 }}>
          {RING_RADII.map((r, i) => <Ring key={i} radius={r} index={i} />)}
        </View>

        {/* Top vignette */}
        <View style={{
          position: "absolute", top: 0, left: 0, right: 0, height: HORIZON_Y * 0.35,
          backgroundColor: "rgba(0,0,0,0.55)",
        }} />

        {/* Content title logo — centred in arch area */}
        <View style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          alignItems: "center", justifyContent: "center",
        }} pointerEvents="none">
          <ContentLogo showAt={2100} logoUrl={logoUrl} logoW={LOGO_W} logoH={LOGO_H} />
        </View>
      </View>

      {/* ── Horizon glow line ────────────────────────────────────────────── */}
      <View style={{
        position: "absolute", top: HORIZON_Y - 1, left: 0, right: 0, height: 2,
        backgroundColor: RED,
        shadowColor: RED_GLOW, shadowRadius: 16, shadowOpacity: 0.95,
        shadowOffset: { width: 0, height: 0 }, elevation: 6,
      }} />

      {/* ── Floor zone (below horizon) ───────────────────────────────────── */}
      <View style={{
        position: "absolute", top: HORIZON_Y, left: 0, right: 0, bottom: 0,
        backgroundColor: "#040000",
      }} />

      {/* ── NETPLAY brand — centred in floor zone ────────────────────────── */}
      <View style={{
        position: "absolute",
        top: HORIZON_Y + 8,
        left: 0, right: 0,
        bottom: H * 0.22,
        alignItems: "center", justifyContent: "center",
      }} pointerEvents="none">
        <BrandBlock showAt={4800} W={W} />
      </View>

      {/* ── Progress bar + % — bottom strip ─────────────────────────────── */}
      <ProgressBar totalMs={STING_DURATION_MS} showAt={1800} barW={W * 0.65} />
    </View>
  );
}

const styles = StyleSheet.create({
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoGlow: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "transparent",
    shadowColor: "#ffffff",
    shadowRadius: 35,
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 0 },
  },
  progressWrap: {
    position: "absolute",
    bottom: "8%",
    left: 0, right: 0,
    alignItems: "center",
    gap: 6,
  },
  percentText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    color: RED,
    fontVariant: ["tabular-nums"],
  },
  progressTrack: {
    height: 3, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
    shadowColor: "#cc2020", shadowRadius: 6, shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 0 }, elevation: 3,
  },
  progressFill: {
    height: "100%", borderRadius: 2,
    backgroundColor: RED,
    shadowColor: RED_GLOW, shadowRadius: 8, shadowOpacity: 0.9,
    shadowOffset: { width: 0, height: 0 }, elevation: 5,
  },
  loadingLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 3,
    color: "rgba(255,255,255,0.3)",
  },
});
