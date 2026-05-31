import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

export default function EmailConfirmedScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "success">("loading");

  const circleScale = useRef(new Animated.Value(0)).current;
  const circleOpacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;
  const rippleScale = useRef(new Animated.Value(1)).current;
  const rippleOpacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase("success");
      startAnimation();
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const startAnimation = () => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(circleScale, { toValue: 1, tension: 50, friction: 5, useNativeDriver: true }),
        Animated.timing(circleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.spring(checkScale, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }),
      Animated.timing(textOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(btnOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(rippleScale, { toValue: 1.6, duration: 1200, useNativeDriver: true }),
          Animated.timing(rippleOpacity, { toValue: 0, duration: 1200, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(rippleScale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(rippleOpacity, { toValue: 0.3, duration: 0, useNativeDriver: true }),
        ]),
      ])
    ).start();
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={["#001a00", "#000000"]} style={StyleSheet.absoluteFill} />

      <View style={styles.content}>
        {phase === "loading" && (
          <View style={styles.loadingWrap}>
            <View style={styles.loadingDot} />
            <View style={[styles.loadingDot, { opacity: 0.6, marginHorizontal: 8 }]} />
            <View style={[styles.loadingDot, { opacity: 0.3 }]} />
          </View>
        )}

        {phase === "success" && (
          <>
            <View style={styles.circleWrap}>
              <Animated.View
                style={[
                  styles.ripple,
                  { transform: [{ scale: rippleScale }], opacity: rippleOpacity },
                ]}
              />
              <Animated.View
                style={[
                  styles.outerCircle,
                  { transform: [{ scale: circleScale }], opacity: circleOpacity },
                ]}
              />
              <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                <Feather name="check" size={60} color="#fff" />
              </Animated.View>
            </View>

            <Animated.View style={{ opacity: textOpacity, alignItems: "center" }}>
              <Text style={styles.title}>Email confirmado!</Text>
              <Text style={styles.subtitle}>
                Sua conta foi ativada com sucesso.{"\n"}
                Agora vamos personalizar sua experiência no NETPLAY.
              </Text>
            </Animated.View>

            <Animated.View style={[styles.btnWrap, { opacity: btnOpacity }]}>
              <Pressable
                style={styles.btn}
                onPress={() => router.replace("/onboarding/preferences")}
              >
                <Text style={styles.btnText}>Configurar meu perfil</Text>
                <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
              </Pressable>
            </Animated.View>
          </>
        )}
      </View>

      <Text style={styles.brand}>NET<Text style={styles.brandRed}>PLAY</Text></Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  loadingWrap: { flexDirection: "row", alignItems: "center" },
  loadingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#4caf50" },
  circleWrap: { alignItems: "center", justifyContent: "center", marginBottom: 40, height: 140 },
  ripple: {
    position: "absolute",
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: "#4caf50",
  },
  outerCircle: {
    position: "absolute",
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: "#2e7d32",
  },
  title: { fontSize: 30, fontWeight: "800", color: "#fff", marginBottom: 16, textAlign: "center" },
  subtitle: { fontSize: 15, color: "#888", textAlign: "center", lineHeight: 24 },
  btnWrap: { marginTop: 48, width: "100%" },
  btn: {
    backgroundColor: "#e50914", borderRadius: 14,
    paddingVertical: 17, flexDirection: "row",
    alignItems: "center", justifyContent: "center",
  },
  btnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  brand: {
    position: "absolute", bottom: 40, alignSelf: "center",
    fontSize: 18, fontWeight: "900", color: "#333", letterSpacing: -0.5,
  },
  brandRed: { color: "#4a0000" },
});
