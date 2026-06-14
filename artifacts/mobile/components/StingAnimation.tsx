/**
 * StingAnimation — NETPLAY opening sting, programmatic React Native animation.
 *
 * Sequence (10 s total):
 *  0-2.5 s  — Neon semicircular arch rings fly inward (tunnel effect)
 *  2-3.5 s  — Content poster materializes with bloom glow
 *  3.5-5 s  — Progress bar appears
 *  5-7 s    — NETPLAY text fades + slides in
 *  7-10 s   — Tagline appears; full logo hold
 *
 * Layout trick:
 *  Rings are full circles centered at the horizon line.
 *  A floor View masks the lower half → result = semicircular arches.
 *
 * Reanimated rule: useAnimatedStyle lives inside leaf components, never .map().
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
    const phase    = index / NUM_RINGS;
    const firstMs  = phase * CYCLE_MS;
    const resetMs  = 25;

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

// ── Content poster card ───────────────────────────────────────────────────────
function PosterCard({ showAt, posterUrl, cardW, cardH }: {
  showAt: number; posterUrl?: string; cardW: number; cardH: number;
}) {
  const opacity = useSharedValue(0);
  const scale   = useSharedValue(0.2);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(true);
      opacity.value = withTiming(1, { duration: 400 });
      scale.value = withSequence(
        withTiming(1.08, { duration: 500, easing: Easing.out(Easing.cubic) }),
        withTiming(1.0,  { duration: 300, easing: Easing.inOut(Easing.quad) }),
      );
    }, showAt);
    return () => clearTimeout(t);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.posterWrap, { width: cardW, height: cardH }, animStyle]}>
      {posterUrl ? (
        <Image
          source={{ uri: posterUrl }}
          style={{ width: cardW, height: cardH, borderRadius: 12 }}
          resizeMode="cover"
        />
      ) : (
        /* Fallback: app icon */
        <Image
          source={require("@/assets/images/icon.png")}
          style={{ width: cardW, height: cardH, borderRadius: 12 }}
          resizeMode="contain"
        />
      )}
      {/* Glow halo around poster */}
      <View style={[styles.posterGlow, { width: cardW * 1.6, height: cardH * 1.6,
        borderRadius: cardH * 0.8, left: -cardW * 0.3, top: -cardH * 0.3 }]}
      />
    </Animated.View>
  );
}

// ── NETPLAY brand text ────────────────────────────────────────────────────────
function BrandText({ showAt, brandSize }: { showAt: number; brandSize: number }) {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(16);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(true);
      opacity.value    = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) });
      translateY.value = withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) });
    }, showAt);
    return () => clearTimeout(t);
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;
  return (
    <Animated.View style={[{ alignItems: "center" }, style]}>
      <Text style={{ fontSize: brandSize, fontWeight: "900", letterSpacing: 3 }}>
        <Text style={{ color: RED }}>NET</Text>
        <Text style={{ color: "#ffffff" }}>PLAY</Text>
      </Text>
    </Animated.View>
  );
}

// ── Tagline ───────────────────────────────────────────────────────────────────
function Tagline({ showAt, tagSize }: { showAt: number; tagSize: number }) {
  const opacity = useSharedValue(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(true);
      opacity.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) });
    }, showAt);
    return () => clearTimeout(t);
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  if (!visible) return null;
  return (
    <Animated.Text style={[{
      fontSize: tagSize, fontWeight: "500", letterSpacing: 3.5,
      color: "rgba(255,255,255,0.55)", textAlign: "center", textTransform: "uppercase",
    }, style]}>
      Catálogo Premium • Entretenimento
    </Animated.Text>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ totalMs, showAt, barW }: { totalMs: number; showAt: number; barW: number }) {
  const fill   = useSharedValue(0);
  const wrapOp = useSharedValue(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(true);
      wrapOp.value = withTiming(1, { duration: 350 });
      fill.value   = withTiming(1, { duration: totalMs - showAt, easing: Easing.linear });
    }, showAt);
    return () => clearTimeout(t);
  }, []);

  const wrapStyle = useAnimatedStyle(() => ({ opacity: wrapOp.value }));
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` as any }));

  if (!visible) return null;
  return (
    <Animated.View style={[styles.progressWrap, wrapStyle]}>
      <View style={[styles.progressTrack, { width: barW }]}>
        <Animated.View style={[styles.progressFill, fillStyle]} />
      </View>
    </Animated.View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface StingAnimationProps {
  onEnd:      () => void;
  posterUrl?: string;
}

export default function StingAnimation({ onEnd, posterUrl }: StingAnimationProps) {
  const { width: W, height: H } = useWindowDimensions();
  const onEndRef = useRef(onEnd);
  useEffect(() => { onEndRef.current = onEnd; });

  useEffect(() => {
    const t = setTimeout(() => onEndRef.current(), STING_DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  const HORIZON_Y  = H * 0.55;
  // Poster card: portrait ratio ~2:3, fits above the text block
  const CARD_W     = Math.round(Math.min(W * 0.26, 130));
  const CARD_H     = Math.round(CARD_W * 1.5);
  const BRAND_SIZE = Math.round(Math.min(W * 0.10, 38));
  const TAG_SIZE   = Math.round(Math.min(W * 0.028, 12));

  return (
    <View style={{ flex: 1, backgroundColor: "#080000", overflow: "hidden" }}>

      {/* ── Radial centre glow ─────────────────────────────────────────────── */}
      <View style={{
        position: "absolute",
        width: W * 1.4, height: W * 1.4,
        borderRadius: W * 0.7,
        left: W / 2 - W * 0.7, top: HORIZON_Y - W * 0.7,
        shadowColor: "#500000", shadowRadius: 130, shadowOpacity: 0.8,
        shadowOffset: { width: 0, height: 0 },
      }} />

      {/* ── Top vignette ──────────────────────────────────────────────────── */}
      <View style={{
        position: "absolute", top: 0, left: 0, right: 0, height: H * 0.32,
        backgroundColor: "rgba(0,0,0,0.6)",
      }} />

      {/* ── Arch rings ────────────────────────────────────────────────────── */}
      <View style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: HORIZON_Y, overflow: "hidden",
      }}>
        <View style={{ position: "absolute", bottom: 0, left: W / 2 }}>
          {RING_RADII.map((r, i) => <Ring key={i} radius={r} index={i} />)}
        </View>
      </View>

      {/* ── Floor ─────────────────────────────────────────────────────────── */}
      <View style={{
        position: "absolute", top: HORIZON_Y, left: 0, right: 0, bottom: 0,
        backgroundColor: "#050000",
      }} />

      {/* ── Horizon glow line ─────────────────────────────────────────────── */}
      <View style={{
        position: "absolute", top: HORIZON_Y - 1, left: 0, right: 0, height: 1.5,
        backgroundColor: RED,
        shadowColor: RED_GLOW, shadowRadius: 14, shadowOpacity: 0.9,
        shadowOffset: { width: 0, height: 0 }, elevation: 6,
      }} />

      {/* ── Logo block: poster + text centered above floor ────────────────── */}
      <View style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: H * 0.28,
        alignItems: "center", justifyContent: "center", gap: 10,
      }} pointerEvents="none">
        <PosterCard showAt={2100} posterUrl={posterUrl} cardW={CARD_W} cardH={CARD_H} />
        <BrandText  showAt={4900} brandSize={BRAND_SIZE} />
        <Tagline    showAt={6700} tagSize={TAG_SIZE} />
      </View>

      {/* ── Progress bar ──────────────────────────────────────────────────── */}
      <ProgressBar totalMs={STING_DURATION_MS} showAt={1900} barW={W * 0.65} />
    </View>
  );
}

const styles = StyleSheet.create({
  posterWrap: {
    position: "relative",
    borderRadius: 12,
    overflow: "visible",
    shadowColor: "#000",
    shadowRadius: 20,
    shadowOpacity: 0.8,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  posterGlow: {
    position: "absolute",
    backgroundColor: "transparent",
    shadowColor: RED_GLOW,
    shadowRadius: 40,
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 0 },
  },
  progressWrap: {
    position: "absolute",
    bottom: "26%",
    left: 0, right: 0,
    alignItems: "center",
  },
  progressTrack: {
    height: 3, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 0.5, borderColor: "rgba(229,9,20,0.3)",
    overflow: "hidden",
    shadowColor: "#cc2020", shadowRadius: 6, shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 0 }, elevation: 3,
  },
  progressFill: {
    height: "100%", borderRadius: 2, backgroundColor: RED,
    shadowColor: RED_GLOW, shadowRadius: 8, shadowOpacity: 0.9,
    shadowOffset: { width: 0, height: 0 }, elevation: 5,
  },
});
