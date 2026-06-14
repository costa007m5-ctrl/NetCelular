/**
 * StingAnimation — NETPLAY opening sting, programmatic React Native animation.
 *
 * Sequence (10 s total):
 *  0-2.5 s  — Neon semicircular arch rings fly inward (tunnel effect)
 *  2-3.5 s  — App icon materializes with bloom glow
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
  Dimensions,
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

const RED        = "#e50914";
const RED_GLOW   = "#ff2020";
const RING_COLOR = "#cc1818";
const RING_CYCLE = 1400; // ms per tunnel cycle
const NUM_RINGS  = 14;

const RING_RADII = [32, 62, 98, 140, 190, 248, 314, 388, 470, 560, 660, 770, 890, 1020];

// ── Individual animated arch ring ────────────────────────────────────────────
interface RingProps { radius: number; index: number; W: number; H: number }

function Ring({ radius, index, W, H }: RingProps) {
  const scale   = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const phase      = index / NUM_RINGS;
    const startScale = 1 - phase;
    const firstMs    = phase * RING_CYCLE;
    const resetMs    = 25;

    scale.value   = startScale;
    opacity.value = startScale > 0.05 ? 0.82 : 0;

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
          withTiming(0.85, { duration: resetMs + RING_CYCLE * 0.05 }),
          withTiming(0.85, { duration: RING_CYCLE * 0.75, easing: Easing.linear }),
          withTiming(0,    { duration: RING_CYCLE * 0.2,  easing: Easing.in(Easing.quad) }),
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
  const glow = Math.min(18, 5 + index * 1.1);
  const bw   = index < 4 ? 1.2 : index < 8 ? 1.5 : 2;

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
          borderWidth: bw,
          borderColor: RING_COLOR,
          shadowColor: RED_GLOW,
          shadowRadius: glow,
          shadowOpacity: 0.95,
          shadowOffset: { width: 0, height: 0 },
          elevation: 4,
        },
        animStyle,
      ]}
    />
  );
}

// ── Logo icon with bloom-in animation ────────────────────────────────────────
function LogoIcon({ showAt, iconSize }: { showAt: number; iconSize: number }) {
  const opacity = useSharedValue(0);
  const scale   = useSharedValue(0.15);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(true);
      opacity.value = withTiming(1, { duration: 350 });
      scale.value   = withSequence(
        withTiming(1.2,  { duration: 450, easing: Easing.out(Easing.cubic) }),
        withTiming(1.05, { duration: 300, easing: Easing.inOut(Easing.quad) }),
        withTiming(1.0,  { duration: 200, easing: Easing.in(Easing.quad) }),
      );
    }, showAt);
    return () => clearTimeout(t);
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!visible) return null;
  return (
    <Animated.View style={[{ alignItems: "center", justifyContent: "center" }, iconStyle]}>
      <View style={{ position: "relative", alignItems: "center", justifyContent: "center" }}>
        <Image
          source={require("@/assets/images/icon.png")}
          style={{
            width: iconSize,
            height: iconSize,
            borderRadius: iconSize * 0.22,
          }}
          resizeMode="contain"
        />
        {/* Outer glow halo */}
        <View
          style={{
            position: "absolute",
            width: iconSize * 2,
            height: iconSize * 2,
            borderRadius: iconSize,
            backgroundColor: "transparent",
            shadowColor: RED_GLOW,
            shadowRadius: 50,
            shadowOpacity: 0.55,
            shadowOffset: { width: 0, height: 0 },
          }}
        />
      </View>
    </Animated.View>
  );
}

// ── NETPLAY text ──────────────────────────────────────────────────────────────
function BrandText({ showAt, brandSize }: { showAt: number; brandSize: number }) {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(22);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(true);
      opacity.value    = withTiming(1, { duration: 750, easing: Easing.out(Easing.quad) });
      translateY.value = withTiming(0, { duration: 750, easing: Easing.out(Easing.cubic) });
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
      <Text
        style={{
          fontSize: brandSize,
          fontWeight: "900",
          letterSpacing: 3,
        }}
      >
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
    <Animated.Text
      style={[
        {
          fontSize: tagSize,
          fontWeight: "500",
          letterSpacing: 3.5,
          color: "rgba(255,255,255,0.55)",
          textAlign: "center",
          textTransform: "uppercase",
        },
        style,
      ]}
    >
      Catálogo Premium • Entretenimento
    </Animated.Text>
  );
}

// ── Loading progress bar ──────────────────────────────────────────────────────
function ProgressBar({ totalMs, showAt, W }: { totalMs: number; showAt: number; W: number }) {
  const fill   = useSharedValue(0);
  const wrapOp = useSharedValue(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(true);
      wrapOp.value = withTiming(1, { duration: 350 });
      fill.value   = withTiming(1, {
        duration: totalMs - showAt,
        easing: Easing.linear,
      });
    }, showAt);
    return () => clearTimeout(t);
  }, []);

  const wrapStyle = useAnimatedStyle(() => ({ opacity: wrapOp.value }));
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` as any }));

  if (!visible) return null;
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          bottom: "28%",
          left: 0,
          right: 0,
          alignItems: "center",
        },
        wrapStyle,
      ]}
    >
      <View
        style={{
          width: W * 0.68,
          height: 3,
          borderRadius: 2,
          backgroundColor: "rgba(255,255,255,0.06)",
          borderWidth: 0.5,
          borderColor: "rgba(229,9,20,0.3)",
          overflow: "hidden",
          shadowColor: "#cc2020",
          shadowRadius: 6,
          shadowOpacity: 0.4,
          shadowOffset: { width: 0, height: 0 },
          elevation: 3,
        }}
      >
        <Animated.View
          style={[
            {
              height: "100%",
              borderRadius: 2,
              backgroundColor: RED,
              shadowColor: RED_GLOW,
              shadowRadius: 8,
              shadowOpacity: 0.9,
              shadowOffset: { width: 0, height: 0 },
              elevation: 5,
            },
            fillStyle,
          ]}
        />
      </View>
    </Animated.View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface StingAnimationProps { onEnd: () => void }

export default function StingAnimation({ onEnd }: StingAnimationProps) {
  const { width: W, height: H } = useWindowDimensions();
  const onEndRef = useRef(onEnd);
  useEffect(() => { onEndRef.current = onEnd; });

  useEffect(() => {
    const t = setTimeout(() => onEndRef.current(), STING_DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  const HORIZON_Y  = H * 0.56;
  const ICON_SIZE  = Math.round(W * 0.3);
  const BRAND_SIZE = Math.round(W * 0.13);
  const TAG_SIZE   = Math.round(W * 0.032);

  return (
    <View style={{ flex: 1, backgroundColor: "#080000", overflow: "hidden" }}>

      {/* ── Radial gradient background ─────────────────────────────────────── */}
      <View style={StyleSheet.absoluteFillObject}>
        {/* Centre glow */}
        <View
          style={{
            position: "absolute",
            width: W * 1.4,
            height: W * 1.4,
            borderRadius: W * 0.7,
            left: W / 2 - W * 0.7,
            top: HORIZON_Y - W * 0.7,
            backgroundColor: "transparent",
            shadowColor: "#500000",
            shadowRadius: 120,
            shadowOpacity: 0.8,
            shadowOffset: { width: 0, height: 0 },
          }}
        />
        {/* Top dark vignette */}
        <View
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0,
            height: H * 0.35,
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
        />
      </View>

      {/* ── Arch rings (overflow hidden → only upper half visible) ─────────── */}
      <View
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: HORIZON_Y,
          overflow: "hidden",
        }}
      >
        <View style={{ position: "absolute", bottom: 0, left: W / 2 }}>
          {RING_RADII.map((r, i) => (
            <Ring key={i} radius={r} index={i} W={W} H={H} />
          ))}
        </View>
      </View>

      {/* ── Floor covers lower half of rings ───────────────────────────────── */}
      <View
        style={{
          position: "absolute",
          top: HORIZON_Y, left: 0, right: 0, bottom: 0,
          backgroundColor: "#050000",
        }}
      />

      {/* ── Glowing horizon line ────────────────────────────────────────────── */}
      <View
        style={{
          position: "absolute",
          top: HORIZON_Y - 1, left: 0, right: 0,
          height: 1.5,
          backgroundColor: RED,
          shadowColor: RED_GLOW,
          shadowRadius: 14,
          shadowOpacity: 0.9,
          shadowOffset: { width: 0, height: 0 },
          elevation: 6,
        }}
      />

      {/* ── Logo block ──────────────────────────────────────────────────────── */}
      <View
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          bottom: H * 0.3,
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
        }}
        pointerEvents="none"
      >
        <LogoIcon  showAt={2100} iconSize={ICON_SIZE} />
        <BrandText showAt={4900} brandSize={BRAND_SIZE} />
        <Tagline   showAt={6700} tagSize={TAG_SIZE} />
      </View>

      {/* ── Progress bar ────────────────────────────────────────────────────── */}
      <ProgressBar totalMs={STING_DURATION_MS} showAt={1900} W={W} />
    </View>
  );
}
