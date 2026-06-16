/**
 * NetplayLogo — animated NETPLAY header logo.
 *
 * On mount : "NET" slides in from left + "PLAY" from right and they lock together.
 * Every 22s : a translucent scan-line sweeps across (broadcast signal feel).
 * Every 45s : micro-glitch — both halves briefly drift apart then snap back.
 */
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";

const ND = Platform.OS !== "web";
const RED = "#e50914";

interface Props {
  netStyle?: object;
  playStyle?: object;
}

export default function NetplayLogo({ netStyle, playStyle }: Props) {
  const netX   = useRef(new Animated.Value(-28)).current;
  const playX  = useRef(new Animated.Value(28)).current;
  const scanX  = useRef(new Animated.Value(-120)).current;
  const scanOp = useRef(new Animated.Value(0)).current;
  const glitchX = useRef(new Animated.Value(0)).current;

  // ── Entry animation ──────────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.spring(netX,  { toValue: 0, useNativeDriver: ND, tension: 200, friction: 8 }),
      Animated.spring(playX, { toValue: 0, useNativeDriver: ND, tension: 200, friction: 8, delay: 60 }),
    ]).start();
  }, []);

  // ── Periodic scan-line (broadcast signal) ────────────────────────────────
  useEffect(() => {
    const doScan = () => {
      scanX.setValue(-120);
      scanOp.setValue(0.55);
      Animated.parallel([
        Animated.timing(scanX,  { toValue: 120, duration: 550, useNativeDriver: ND, easing: Easing.linear }),
        Animated.sequence([
          Animated.timing(scanOp, { toValue: 0.55, duration: 50, useNativeDriver: ND }),
          Animated.timing(scanOp, { toValue: 0, duration: 300, useNativeDriver: ND, delay: 200 }),
        ]),
      ]).start();
    };

    doScan(); // first scan shortly after entry
    const t = setInterval(doScan, 22000);
    return () => clearInterval(t);
  }, []);

  // ── Periodic micro-glitch ────────────────────────────────────────────────
  useEffect(() => {
    const doGlitch = () => {
      Animated.sequence([
        Animated.timing(glitchX, { toValue:  3, duration: 60, useNativeDriver: ND, easing: Easing.linear }),
        Animated.timing(glitchX, { toValue: -3, duration: 60, useNativeDriver: ND, easing: Easing.linear }),
        Animated.timing(glitchX, { toValue:  2, duration: 40, useNativeDriver: ND, easing: Easing.linear }),
        Animated.timing(glitchX, { toValue:  0, duration: 60, useNativeDriver: ND, easing: Easing.linear }),
      ]).start();
    };

    const t = setInterval(doGlitch, 45000);
    return () => clearInterval(t);
  }, []);

  return (
    <View style={styles.row} pointerEvents="none">
      {/* NET — slides from left */}
      <Animated.Text style={[styles.net, netStyle, { transform: [{ translateX: netX }] }]}>
        NET
      </Animated.Text>

      {/* PLAY — slides from right, + glitch offset */}
      <Animated.Text style={[styles.play, playStyle, { transform: [{ translateX: Animated.add(playX, glitchX) }] }]}>
        PLAY
      </Animated.Text>

      {/* Scan-line overlay */}
      <Animated.View
        style={[
          styles.scanLine,
          { transform: [{ translateX: scanX }], opacity: scanOp },
        ]}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  net: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
    color: RED,
  },
  play: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
    color: "#fff",
  },
  scanLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 24,
    backgroundColor: "rgba(255,255,255,0.45)",
    transform: [{ skewX: "-15deg" }],
  },
});
