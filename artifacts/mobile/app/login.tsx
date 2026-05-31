import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");
    const emailTrimmed = email.trim();
    const passwordTrimmed = password.trim();
    if (!emailTrimmed || !passwordTrimmed) { setError("Preencha todos os campos"); return; }
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: emailTrimmed,
        password: passwordTrimmed,
      });
      if (signInError) { setError("Email ou senha incorretos"); return; }
      router.replace("/profile-select");
    } catch (e: any) {
      setError(e?.message ?? "Erro ao conectar. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={["#1a0000", "#000000"]} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <View style={styles.logoSection}>
            <Text style={styles.logo}>NET<Text style={styles.logoRed}>PLAY</Text></Text>
            <View style={styles.logoDivider} />
            <Text style={styles.logoSub}>CATÁLOGO PREMIUM</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Entrar na conta</Text>

            <View style={styles.inputWrap}>
              <Feather name="mail" size={16} color="#555" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#555"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View style={styles.inputWrap}>
              <Feather name="lock" size={16} color="#555" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Senha"
                placeholderTextColor="#555"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Feather name={showPassword ? "eye-off" : "eye"} size={16} color="#555" />
              </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Entrar</Text>
              }
            </Pressable>

            <Pressable onPress={() => router.push("/forgot-password")} style={styles.forgotBtn}>
              <Text style={styles.forgotText}>Esqueceu a senha?</Text>
            </Pressable>
          </View>

          <View style={styles.registerRow}>
            <Text style={styles.registerLabel}>Não tem uma conta?</Text>
            <Pressable onPress={() => router.push("/register")}>
              <Text style={styles.registerLink}> Criar conta</Text>
            </Pressable>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 48 },
  logoSection: { alignItems: "center", marginBottom: 40 },
  logo: { fontSize: 42, fontWeight: "900", color: "#fff", letterSpacing: -2 },
  logoRed: { color: "#e50914" },
  logoDivider: { width: 40, height: 2, backgroundColor: "#e50914", marginVertical: 12 },
  logoSub: { fontSize: 11, color: "#555", letterSpacing: 3, fontWeight: "700" },
  card: { backgroundColor: "#141414", borderRadius: 16, padding: 28, marginBottom: 24 },
  cardTitle: { fontSize: 20, fontWeight: "700", color: "#fff", marginBottom: 24 },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#1e1e1e", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14,
    marginBottom: 12, borderWidth: 1, borderColor: "#2a2a2a",
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: "#fff", fontSize: 15 },
  error: { color: "#e50914", fontSize: 13, marginBottom: 12, textAlign: "center" },
  btn: {
    backgroundColor: "#e50914", borderRadius: 10,
    paddingVertical: 15, alignItems: "center", marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  forgotBtn: { alignItems: "center", marginTop: 16 },
  forgotText: { color: "#888", fontSize: 14 },
  registerRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  registerLabel: { color: "#666", fontSize: 14 },
  registerLink: { color: "#e50914", fontSize: 14, fontWeight: "700" },
});
