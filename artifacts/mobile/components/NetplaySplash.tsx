import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path, Rect, Defs, RadialGradient, Stop } from "react-native-svg";

const { width: SW, height: SH } = Dimensions.get("window");

function NetplayLogoSvg({ size = 80 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="grad" cx="50%" cy="30%" rx="60%" ry="60%">
          <Stop offset="0%" stopColor="#ff4040" />
          <Stop offset="100%" stopColor="#8b0000" />
        </RadialGradient>
      </Defs>
      <Rect x="5" y="5" width="90" height="90" rx="22" fill="url(#grad)" />
      <Path
        d="M22 30 L22 70 L34 70 L34 48 L52 70 L64 70 L64 30 L52 30 L52 52 L34 30 Z"
        fill="white"
      />
      <Path
        d="M70 30 L78 30 L78 62 L92 62 L92 70 L70 70 Z"
        fill="white"
        opacity="0.0"
      />
      <Circle cx="76" cy="50" r="10" fill="white" opacity="0.9" />
      <Path d="M72 44 L84 50 L72 56 Z" fill="#cc0000" />
    </Svg>
  );
}

interface Props {
  onFinish: () => void;
}

export default function NetplaySplash({ onFinish }: Props) {
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const barWidth = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const dotOpacity1 = useRef(new Animated.Value(0.3)).current;
  const dotOpacity2 = useRef(new Animated.Value(0.3)).current;
  const dotOpacity3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const dotAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity1, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(dotOpacity1, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        Animated.timing(dotOpacity2, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(dotOpacity2, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        Animated.timing(dotOpacity3, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(dotOpacity3, { toValue: 0.3, duration: 300, useNativeDriver: true }),
      ])
    );
    dotAnim.start();

    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(taglineOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(barWidth, { toValue: SW * 0.55, duration: 1200, useNativeDriver: false }),
      Animated.delay(400),
      Animated.timing(screenOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => {
      dotAnim.stop();
      onFinish();
    });

    return () => dotAnim.stop();
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]} pointerEvents="none">
      <LinearGradient
        colors={["#050000", "#100000", "#000000"]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.glowCircle} />

      <Animated.View style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <NetplayLogoSvg size={100} />
      </Animated.View>

      <Animated.View style={[styles.brandRow, { opacity: textOpacity }]}>
        <Text style={styles.logoText}>
          <Text style={styles.logoRed}>NET</Text>
          <Text style={styles.logoWhite}>PLAY</Text>
        </Text>
      </Animated.View>

      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        Catálogo Premium de Entretenimento
      </Animated.Text>

      <View style={styles.barBg}>
        <Animated.View style={[styles.barFill, { width: barWidth }]} />
      </View>

      <View style={styles.dotsRow}>
        <Animated.View style={[styles.dot, { opacity: dotOpacity1 }]} />
        <Animated.View style={[styles.dot, { opacity: dotOpacity2 }]} />
        <Animated.View style={[styles.dot, { opacity: dotOpacity3 }]} />
      </View>

      <Text style={styles.loadingText}>Carregando seu conteúdo...</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    backgroundColor: "#000",
  },
  glowCircle: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(229,9,20,0.07)",
    top: SH * 0.5 - 200,
  },
  logoWrap: {
    marginBottom: 20,
    shadowColor: "#e50914",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 20,
  },
  brandRow: {
    marginBottom: 8,
  },
  logoText: {
    letterSpacing: 8,
    fontSize: 42,
    fontWeight: "900",
  },
  logoRed: {
    color: "#e50914",
  },
  logoWhite: {
    color: "#ffffff",
  },
  tagline: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    letterSpacing: 1.5,
    marginBottom: 56,
    textTransform: "uppercase",
  },
  barBg: {
    width: SW * 0.55,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 24,
  },
  barFill: {
    height: 3,
    backgroundColor: "#e50914",
    borderRadius: 2,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#e50914",
  },
  loadingText: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 12,
    letterSpacing: 0.5,
  },
});
