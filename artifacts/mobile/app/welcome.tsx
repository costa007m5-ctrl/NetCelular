import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { height: H } = Dimensions.get("window");
const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
const RED = "#e50914";

const FEATURES = [
  { icon: "film" as const, text: "Filmes & Séries exclusivos" },
  { icon: "tv" as const, text: "TV ao vivo em HD" },
  { icon: "download" as const, text: "Download para assistir offline" },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [backdrops, setBackdrops] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const nextFade = useRef(new Animated.Value(0)).current;
  const transitioning = useRef(false);

  useEffect(() => {
    fetch(
      `https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_KEY}&language=pt-BR`
    )
      .then((r) => r.json())
      .then((data) => {
        const imgs = (data.results ?? [])
          .filter((i: any) => i.backdrop_path)
          .slice(0, 8)
          .map((i: any) => `https://image.tmdb.org/t/p/w1280${i.backdrop_path}`);
        setBackdrops(imgs);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (backdrops.length < 2) return;
    const interval = setInterval(() => {
      if (transitioning.current) return;
      transitioning.current = true;
      nextFade.setValue(0);
      Animated.sequence([
        Animated.timing(nextFade, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]).start(() => {
        setCurrentIdx((prev) => {
          const next = (prev + 1) % backdrops.length;
          return next;
        });
        fadeAnim.setValue(1);
        nextFade.setValue(0);
        transitioning.current = false;
      });
    }, 4500);
    return () => clearInterval(interval);
  }, [backdrops.length, fadeAnim, nextFade]);

  const curr = backdrops[currentIdx];
  const next = backdrops.length > 1 ? backdrops[(currentIdx + 1) % backdrops.length] : null;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Cycling backdrop images */}
      {next ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: nextFade }]}>
          <Image source={{ uri: next }} style={StyleSheet.absoluteFill} contentFit="cover" />
        </Animated.View>
      ) : null}
      {curr ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
          <Image source={{ uri: curr }} style={StyleSheet.absoluteFill} contentFit="cover" />
        </Animated.View>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a0000" }]} />
      )}

      {/* Cinematic gradient overlay */}
      <LinearGradient
        colors={[
          "rgba(0,0,0,0.20)",
          "rgba(0,0,0,0.40)",
          "rgba(0,0,0,0.78)",
          "rgba(0,0,0,0.96)",
          "#000",
        ]}
        locations={[0, 0.25, 0.55, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Top vignette */}
      <LinearGradient
        colors={["rgba(0,0,0,0.70)", "transparent"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 140 }}
      />

      {/* Main content */}
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 28 },
        ]}
      >
        {/* Logo */}
        <View style={styles.logoArea}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeN}>N</Text>
          </View>
          <View>
            <Text style={styles.logoText}>
              NET<Text style={{ color: RED }}>PLAY</Text>
            </Text>
            <Text style={styles.logoSub}>CATÁLOGO PREMIUM</Text>
          </View>
        </View>

        {/* Grow spacer */}
        <View style={{ flex: 1, minHeight: H * 0.06 }} />

        {/* Headline */}
        <View style={styles.heroBlock}>
          <Text style={styles.headline}>
            Cinema, Séries e{"\n"}muito mais — em um{"\n"}só lugar.
          </Text>
          <Text style={styles.subHeadline}>
            Acesso ilimitado aos maiores sucessos do cinema e da TV, com
            qualidade até 4K.
          </Text>
        </View>

        {/* Feature pills */}
        <View style={styles.pillsWrap}>
          {FEATURES.map((f) => (
            <View key={f.icon} style={styles.pill}>
              <Feather name={f.icon} size={13} color="rgba(255,255,255,0.85)" />
              <Text style={styles.pillText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* Dots */}
        {backdrops.length > 1 && (
          <View style={styles.dotsRow}>
            {backdrops.map((_, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  {
                    width: i === currentIdx ? 22 : 6,
                    backgroundColor:
                      i === currentIdx ? RED : "rgba(255,255,255,0.25)",
                  },
                ]}
              />
            ))}
          </View>
        )}

        {/* CTA Buttons */}
        <View style={styles.btnStack}>
          {/* Primary — register */}
          <Pressable
            style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.82 }]}
            onPress={() => router.push("/register")}
          >
            <Feather name="play-circle" size={20} color="#fff" />
            <Text style={styles.btnPrimaryText}>VAMOS COMEÇAR</Text>
          </Pressable>

          {/* Divider */}
          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>ou</Text>
            <View style={styles.orLine} />
          </View>

          {/* Secondary — login */}
          <Pressable
            style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.7 }]}
            onPress={() => router.push("/login")}
          >
            <Feather name="log-in" size={16} color="rgba(255,255,255,0.75)" />
            <Text style={styles.btnSecondaryText}>
              Já tenho uma conta{" "}
              <Text style={{ color: RED, fontWeight: "800" }}>ENTRAR</Text>
            </Text>
          </Pressable>
        </View>

        {/* Footer legal note */}
        <Text style={styles.legal}>
          Ao continuar, você concorda com nossos{" "}
          <Text style={{ textDecorationLine: "underline" }}>Termos de Uso</Text> e{" "}
          <Text style={{ textDecorationLine: "underline" }}>Política de Privacidade</Text>.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  content: { flex: 1, paddingHorizontal: 28 },

  logoArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: RED,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  logoBadgeN: { color: "#fff", fontSize: 24, fontWeight: "900" },
  logoText: {
    fontSize: 32,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: -1.2,
    lineHeight: 34,
  },
  logoSub: {
    fontSize: 9,
    color: "rgba(255,255,255,0.40)",
    letterSpacing: 3,
    fontWeight: "700",
    marginTop: 1,
  },

  heroBlock: { marginBottom: 22 },
  headline: {
    fontSize: Platform.OS === "web" ? 38 : 34,
    fontWeight: "900",
    color: "#fff",
    lineHeight: Platform.OS === "web" ? 46 : 42,
    letterSpacing: -0.8,
    marginBottom: 14,
  },
  subHeadline: {
    fontSize: 15,
    color: "rgba(255,255,255,0.60)",
    lineHeight: 22,
  },

  pillsWrap: { gap: 9, marginBottom: 22 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignSelf: "flex-start",
  },
  pillText: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "500" },

  dotsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 24,
    alignItems: "center",
  },
  dot: { height: 6, borderRadius: 3 },

  btnStack: { gap: 0, marginBottom: 18 },
  btnPrimary: {
    backgroundColor: RED,
    borderRadius: 14,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: RED,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
    marginBottom: 0,
  },
  btnPrimaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  orLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.12)" },
  orText: { color: "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: "600" },
  btnSecondary: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  btnSecondaryText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 14,
    fontWeight: "500",
  },

  legal: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
  },
});
