import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
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

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setSessionReady(true);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleReset = async () => {
    setError("");
    if (!password || !confirm) { setError("Preencha todos os campos."); return; }
    if (password.length < 6) { setError("A senha deve ter no mínimo 6 caracteres."); return; }
    if (password !== confirm) { setError("As senhas não coincidem."); return; }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      Alert.alert(
        "Senha redefinida",
        "Sua senha foi alterada com sucesso. Faça login com a nova senha.",
        [{ text: "OK", onPress: () => router.replace("/login") }]
      );
    } catch (e: any) {
      setError(e?.message ?? "Não foi possível redefinir a senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={["#1a0000", "#000000"]} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <View style={styles.content}>
          <Text style={styles.logo}>
            NET<Text style={styles.logoRed}>PLAY</Text>
          </Text>

          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Feather name="lock" size={28} color="#e50914" />
            </View>
            <Text style={styles.title}>Nova senha</Text>
            <Text style={styles.subtitle}>
              {sessionReady
                ? "Escolha uma nova senha para a sua conta."
                : "Aguardando verificação do link..."}
            </Text>

            {!sessionReady ? (
              <ActivityIndicator color="#e50914" style={{ marginTop: 24 }} />
            ) : (
              <>
                <View style={styles.inputWrap}>
                  <Feather name="lock" size={16} color="#555" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Nova senha"
                    placeholderTextColor="#555"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={16} color="#555" />
                  </Pressable>
                </View>

                <View style={styles.inputWrap}>
                  <Feather name="lock" size={16} color="#555" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirmar senha"
                    placeholderTextColor="#555"
                    secureTextEntry={!showPassword}
                    value={confirm}
                    onChangeText={setConfirm}
                  />
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                  style={[styles.btn, loading && styles.btnDisabled]}
                  onPress={handleReset}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.btnText}>Redefinir senha</Text>
                  }
                </Pressable>
              </>
            )}

            <Pressable onPress={() => router.replace("/login")} style={styles.back}>
              <Feather name="arrow-left" size={14} color="#666" />
              <Text style={styles.backText}>Voltar ao login</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  logo: { fontSize: 36, fontWeight: "900", color: "#fff", textAlign: "center", marginBottom: 32, letterSpacing: -1 },
  logoRed: { color: "#e50914" },
  card: { backgroundColor: "#141414", borderRadius: 16, padding: 32 },
  iconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#1e1e1e", alignItems: "center", justifyContent: "center",
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#888", lineHeight: 20, marginBottom: 24 },
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
    paddingVertical: 15, alignItems: "center", marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  back: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 20, gap: 6 },
  backText: { color: "#666", fontSize: 13 },
});
