/**
 * NetplayLogo — animated NETPLAY header logo.
 *
 * Entry    : scale + opacity spring reveal (dramatic, like Netflix intro)
 * Ongoing  : "NET" breathes with a neon-red glow pulse (always visible)
 * Every 8s : white shimmer sweeps left → right across the full logo
 * Every 20s: micro-glitch — both halves jitter apart then snap back
 * Dot      : tiny red "live" pulse dot on the right side of "NET"
 */
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
} from "react-native";

const ND   = Platform.OS !== "web";
const RED  = "#e50914";

interface Props {
  netStyle?: object;
  playStyle?: object;
}

export default function NetplayLogo({ netStyle, playStyle }: Props) {
  // Entry
  const entryScale   = useRef(new Animated.Value(0.6)).current;
  const entryOpacity = useRef(new Animated.Value(0)).current;

  // NET glow pulse (continuous)
  const netGlow = useRef(new Animated.Value(1)).current;

  // Shimmer sweep
  const shimmerX  = useRef(new Animated.Value(-140)).current;
  const shimmerOp = useRef(new Animated.Value(0)).current;

  // Glitch
  const glitchNetX  = useRef(new Animated.Value(0)).current;
  const glitchPlayX = useRef(new Animated.Value(0)).current;

  // Live dot pulse
  const dotScale   = useRef(new Animated.Value(1)).current;
  const dotOpacity = useRef(new Animated.Value(0.7)).current;

  // ── 1. Entry: Netflix-style dramatic reveal ────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.spring(entryScale, {
        toValue: 1,
        useNativeDriver: ND,
        tension: 160,
        friction: 7,
      }),
      Animated.timing(entryOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: ND,
        easing: Easing.out(Easing.ease),
      }),
    ]).start();
  }, []);

  // ── 2. Continuous neon glow on "NET" (always breathing) ──────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(netGlow, {
          toValue: 0.65,
          duration: 1400,
          useNativeDriver: ND,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(netGlow, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: ND,
          easing: Easing.inOut(Easing.ease),
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // ── 3. Shimmer sweep every 8s ─────────────────────────────────────────────
  useEffect(() => {
    const doShimmer = () => {
      shimmerX.setValue(-140);
      shimmerOp.setValue(0.7);
      Animated.parallel([
        Animated.timing(shimmerX, {
          toValue: 140,
          duration: 500,
          useNativeDriver: ND,
          easing: Easing.linear,
        }),
        Animated.sequence([
          Animated.timing(shimmerOp, { toValue: 0.7, duration: 80, useNativeDriver: ND }),
          Animated.timing(shimmerOp, { toValue: 0,   duration: 250, useNativeDriver: ND, delay: 150 }),
        ]),
      ]).start();
    };

    const t1 = setTimeout(doShimmer, 1200); // first shimmer shortly after entry
    const t2 = setInterval(doShimmer, 8000);
    return () => { clearTimeout(t1); clearInterval(t2); };
  }, []);

  // ── 4. Micro-glitch every 20s ─────────────────────────────────────────────
  useEffect(() => {
    const doGlitch = () => {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glitchNetX,  { toValue: -4, duration: 50, useNativeDriver: ND }),
          Animated.timing(glitchPlayX, { toValue:  4, duration: 50, useNativeDriver: ND }),
        ]),
        Animated.parallel([
          Animated.timing(glitchNetX,  { toValue:  3, duration: 40, useNativeDriver: ND }),
          Animated.timing(glitchPlayX, { toValue: -3, duration: 40, useNativeDriver: ND }),
        ]),
        Animated.parallel([
          Animated.timing(glitchNetX,  { toValue: 0, duration: 60, useNativeDriver: ND }),
          Animated.timing(glitchPlayX, { toValue: 0, duration: 60, useNativeDriver: ND }),
        ]),
      ]).start();
    };

    const t = setInterval(doGlitch, 20000);
    return () => clearInterval(t);
  }, []);

  // ── 5. Live dot: continuous pulse ────────────────────────────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(dotScale,   { toValue: 1.5, duration: 600, useNativeDriver: ND, easing: Easing.out(Easing.ease) }),
          Animated.timing(dotOpacity, { toValue: 0.15, duration: 600, useNativeDriver: ND }),
        ]),
        Animated.parallel([
          Animated.timing(dotScale,   { toValue: 1, duration: 600, useNativeDriver: ND, easing: Easing.in(Easing.ease) }),
          Animated.timing(dotOpacity, { toValue: 0.9, duration: 600, useNativeDriver: ND }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[styles.row, { opacity: entryOpacity, transform: [{ scale: entryScale }] }]}
      pointerEvents="none"
    >
      {/* ── NET (red, glowing) ── */}
      <Animated.Text
        style={[
          styles.net,
          netStyle,
          {
            opacity: netGlow,
            transform: [{ translateX: glitchNetX }],
          },
        ]}
      >
        NET
      </Animated.Text>

      {/* Live pulse dot between NET and PLAY */}
      <Animated.View
        style={[
          styles.liveDot,
          { transform: [{ scale: dotScale }], opacity: dotOpacity },
        ]}
      />

      {/* ── PLAY (white) ── */}
      <Animated.Text
        style={[
          styles.play,
          playStyle,
          { transform: [{ translateX: glitchPlayX }] },
        ]}
      >
        PLAY
      </Animated.Text>

      {/* Shimmer overlay — sweeps across whole logo */}
      <Animated.View
        style={[
          styles.shimmer,
          { transform: [{ translateX: shimmerX }, { skewX: "-18deg" }], opacity: shimmerOp },
        ]}
        pointerEvents="none"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  net: {
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: 1.5,
    color: RED,
  },
  play: {
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: 1.5,
    color: "#fff",
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: RED,
    marginHorizontal: 1,
    marginBottom: 8, // floats near top of the letters
  },
  shimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 28,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
});
