import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

type State = "idle" | "sending" | "sent";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");

  const checkScale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;

  const animateSuccess = () => {
    Animated.sequence([
      Animated.timing(contentOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.parallel([
        Animated.spring(checkScale, { toValue: 1, tension: 60, friction: 6, useNativeDriver: true }),
        Animated.timing(checkOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  };

  const handleSend = async () => {
    setError("");
    const emailTrimmed = email.trim();
    if (!emailTrimmed) { setError("Digite seu email"); return; }
    if (!/\S+@\S+\.\S+/.test(emailTrimmed)) { setError("Email inválido"); return; }

    setState("sending");
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(emailTrimmed, {
        redirectTo: "netplay://reset-password",
      });
      if (resetError) throw resetError;
      setState("sent");
      animateSuccess();
    } catch (e: any) {
      setState("idle");
      setError(e?.message ?? "Não foi possível enviar o email.");
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={["#1a0000", "#000000"]} style={StyleSheet.absoluteFill} />

      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Feather name="arrow-left" size={22} color="#fff" />
      </Pressable>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <View style={styles.content}>

          {state !== "sent" && (
            <Animated.View style={{ opacity: contentOpacity }}>
              <Text style={styles.logo}>NET<Text style={styles.logoRed}>PLAY</Text></Text>
              <View style={styles.card}>
                <View style={styles.iconWrap}>
                  <Feather name="lock" size={26} color="#e50914" />
                </View>
                <Text style={styles.title}>Redefinir senha</Text>
                <Text style={styles.subtitle}>
                  Digite seu email cadastrado. Vamos enviar um link para criar uma nova senha.
                </Text>

                <View style={styles.inputWrap}>
                  <Feather name="mail" size={16} color="#555" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Seu email"
                    placeholderTextColor="#555"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                    editable={state === "idle"}
                  />
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                  style={[styles.btn, state === "sending" && styles.btnDisabled]}
                  onPress={handleSend}
                  disabled={state !== "idle"}
                >
                  {state === "sending" ? (
                    <View style={styles.sendingRow}>
                      <ActivityIndicator color="#fff" size="small" style={{ marginRight: 10 }} />
                      <Text style={styles.btnText}>Enviando...</Text>
                    </View>
                  ) : (
                    <Text style={styles.btnText}>Enviar link</Text>
                  )}
                </Pressable>
              </View>
            </Animated.View>
          )}

          {state === "sent" && (
            <Animated.View style={[styles.successWrap, { opacity: checkOpacity, transform: [{ scale: checkScale }] }]}>
              <View style={styles.successCircle}>
                <Feather name="check" size={52} color="#fff" />
              </View>
              <Text style={styles.successTitle}>Link enviado!</Text>
              <Text style={styles.successSubtitle}>
                Verifique sua caixa de entrada em{"\n"}
                <Text style={styles.emailHighlight}>{email}</Text>
                {"\n\n"}e clique no link para criar sua nova senha.
              </Text>
              <Pressable onPress={() => router.replace("/login")} style={styles.backToLogin}>
                <Text style={styles.backToLoginText}>Voltar ao login</Text>
              </Pressable>
            </Animated.View>
          )}

        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  flex: { flex: 1 },
  backBtn: { position: "absolute", top: 56, left: 20, zIndex: 10, padding: 8 },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  logo: { fontSize: 36, fontWeight: "900", color: "#fff", textAlign: "center", marginBottom: 32, letterSpacing: -1 },
  logoRed: { color: "#e50914" },
  card: { backgroundColor: "#141414", borderRadius: 16, padding: 28 },
  iconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#1e1e1e", alignItems: "center", justifyContent: "center",
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#888", lineHeight: 21, marginBottom: 24 },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#1e1e1e", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14,
    marginBottom: 12, borderWidth: 1, borderColor: "#2a2a2a",
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: "#fff", fontSize: 15 },
  error: { color: "#e50914", fontSize: 13, marginBottom: 12 },
  btn: {
    backgroundColor: "#e50914", borderRadius: 10,
    paddingVertical: 15, alignItems: "center", marginTop: 4,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sendingRow: { flexDirection: "row", alignItems: "center" },
  successWrap: { alignItems: "center", paddingHorizontal: 24 },
  successCircle: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: "#e50914", alignItems: "center", justifyContent: "center",
    marginBottom: 32,
  },
  successTitle: { fontSize: 28, fontWeight: "800", color: "#fff", marginBottom: 16 },
  successSubtitle: { fontSize: 15, color: "#888", textAlign: "center", lineHeight: 24 },
  emailHighlight: { color: "#fff", fontWeight: "600" },
  backToLogin: { marginTop: 36, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 10, borderWidth: 1, borderColor: "#333" },
  backToLoginText: { color: "#aaa", fontSize: 15, fontWeight: "600" },
});
