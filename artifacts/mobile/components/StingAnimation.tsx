/**
 * StingAnimation — NETPLAY opening sting, programmatic React Native animation.
 *
 * Sequence (10 s total):
 *  0-2.5 s  — Neon semicircular arch rings fly inward (tunnel effect)
 *  2-3.5 s  — Content title logo materializes with bloom glow
 *  3.5-5 s  — Progress bar appears
 *  5-7 s    — NETPLAY text fades + slides in
 *  7-10 s   — Tagline appears; full logo hold
 *
 * logoUrl: stylized title logo from TMDB (PNG with transparent background).
 *          Falls back to nothing if unavailable.
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

// ── Content title logo ────────────────────────────────────────────────────────
function ContentLogo({ showAt, logoUrl, logoW, logoH }: {
  showAt: number; logoUrl?: string; logoW: number; logoH: number;
}) {
  const opacity    = useSharedValue(0);
  const scale      = useSharedValue(0.3);
  const translateY = useSharedValue(10);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(true);
      opacity.value    = withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) });
      scale.value      = withSequence(
        withTiming(1.06, { duration: 550, easing: Easing.out(Easing.cubic) }),
        withTiming(1.0,  { duration: 350, easing: Easing.inOut(Easing.quad) }),
      );
      translateY.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) });
    }, showAt);
    return () => clearTimeout(t);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  if (!visible || !logoUrl) return null;

  return (
    <Animated.View style={[styles.logoWrap, animStyle]}>
      {/* White glow behind logo so it pops on dark BG */}
      <View style={[styles.logoGlow, { width: logoW * 1.4, height: logoH * 2 }]} />
      <Image
        source={{ uri: logoUrl }}
        style={{ width: logoW, height: logoH }}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

// ── NETPLAY brand text ────────────────────────────────────────────────────────
function BrandText({ showAt, brandSize }: { showAt: number; brandSize: number }) {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(14);
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
      color: "rgba(255,255,255,0.5)", textAlign: "center",
    }, style]}>
      CATÁLOGO PREMIUM • ENTRETENIMENTO
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
  onEnd:     () => void;
  logoUrl?:  string;
}

export default function StingAnimation({ onEnd, logoUrl }: StingAnimationProps) {
  const { width: W, height: H } = useWindowDimensions();
  const onEndRef = useRef(onEnd);
  useEffect(() => { onEndRef.current = onEnd; });

  useEffect(() => {
    const t = setTimeout(() => onEndRef.current(), STING_DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  const HORIZON_Y  = H * 0.55;
  // Logo: wide format (content logos are usually 3:1 to 5:1 ratio)
  const LOGO_W     = Math.round(Math.min(W * 0.65, 280));
  const LOGO_H     = Math.round(LOGO_W * 0.38); // ~3:1 ratio container
  const BRAND_SIZE = Math.round(Math.min(W * 0.09, 34));
  const TAG_SIZE   = Math.round(Math.min(W * 0.026, 11));

  return (
    <View style={{ flex: 1, backgroundColor: "#080000", overflow: "hidden" }}>

      {/* ── Radial centre glow ─────────────────────────────────────────────── */}
      <View style={{
        position: "absolute",
        width: W * 1.4, height: W * 1.4, borderRadius: W * 0.7,
        left: W / 2 - W * 0.7, top: HORIZON_Y - W * 0.7,
        shadowColor: "#500000", shadowRadius: 130, shadowOpacity: 0.8,
        shadowOffset: { width: 0, height: 0 },
      }} />

      {/* ── Top dark vignette ─────────────────────────────────────────────── */}
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

      {/* ── Logo block: title logo + NETPLAY text ─────────────────────────── */}
      <View style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: H * 0.26,
        alignItems: "center", justifyContent: "center", gap: 14,
      }} pointerEvents="none">
        <ContentLogo showAt={2100} logoUrl={logoUrl} logoW={LOGO_W} logoH={LOGO_H} />
        <BrandText   showAt={5200} brandSize={BRAND_SIZE} />
        <Tagline     showAt={7000} tagSize={TAG_SIZE} />
      </View>

      {/* ── Progress bar ──────────────────────────────────────────────────── */}
      <ProgressBar totalMs={STING_DURATION_MS} showAt={1900} barW={W * 0.65} />
    </View>
  );
}

const styles = StyleSheet.create({
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  logoGlow: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "transparent",
    shadowColor: "#ffffff",
    shadowRadius: 30,
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 0 },
  },
  progressWrap: {
    position: "absolute",
    bottom: "24%",
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
