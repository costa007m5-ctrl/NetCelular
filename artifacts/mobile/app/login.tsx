import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { supabase, db } from "@/lib/supabase";

export default function LoginScreen() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    const emailTrimmed = email.trim();
    const passwordTrimmed = password.trim();

    if (!emailTrimmed || !passwordTrimmed) { setError("Preencha todos os campos"); return; }
    if (mode === "register" && !name.trim()) { setError("Informe seu nome"); return; }
    if (passwordTrimmed.length < 6) { setError("Senha deve ter no mínimo 6 caracteres"); return; }

    setLoading(true);
    try {
      if (mode === "register") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: emailTrimmed,
          password: passwordTrimmed,
          options: { emailRedirectTo: "netplay://login" },
        });
        if (signUpError) { setError(signUpError.message); return; }
        if (data.user) {
          const { error: profileError } = await db.users.upsertProfile(
            data.user.id,
            emailTrimmed,
            name.trim()
          );
          if (profileError) { setError(profileError); return; }
        }
        if (!data.session) {
          Alert.alert(
            "Confirme seu email",
            "Enviamos um link de confirmação para " + emailTrimmed + ". Confirme antes de entrar.",
            [{ text: "OK" }]
          );
          setLoading(false);
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: emailTrimmed,
          password: passwordTrimmed,
        });
        if (signInError) {
          setError("Email ou senha incorretos");
          return;
        }
      }

      router.replace("/profile-select");
    } catch (e: any) {
      setError(e?.message ?? "Erro ao conectar. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const emailTrimmed = email.trim();
    if (!emailTrimmed) {
      Alert.alert("Esqueceu a senha?", "Digite seu email no campo acima e toque em 'Esqueceu a senha?' novamente.");
      return;
    }
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(emailTrimmed, {
        redirectTo: "netplay://reset-password",
      });
      if (resetError) throw resetError;
      Alert.alert(
        "Email enviado",
        `Um link de redefinição de senha foi enviado para ${emailTrimmed}. Verifique sua caixa de entrada.`
      );
    } catch (e: any) {
      Alert.alert("Erro", e?.message ?? "Não foi possível enviar o email.");
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={["#1a0000", "#000000"]} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.logoSection}>
            <Text style={styles.logoText}>NETPLAY</Text>
            <View style={styles.logoLine} />
            <Text style={styles.logoSub}>CATÁLOGO PREMIUM</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{mode === "login" ? "Entrar na conta" : "Criar conta"}</Text>

            {mode === "register" && (
              <View style={styles.inputWrap}>
                <Feather name="user" size={18} color="#666" style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="Seu nome" placeholderTextColor="#555" value={name} onChangeText={setName} autoCapitalize="words" returnKeyType="next" />
              </View>
            )}

            <View style={styles.inputWrap}>
              <Feather name="mail" size={18} color="#666" style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#555" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} returnKeyType="next" />
            </View>

            <View style={styles.inputWrap}>
              <Feather name="lock" size={18} color="#666" style={styles.inputIcon} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Senha" placeholderTextColor="#555" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} returnKeyType="done" onSubmitEditing={handleSubmit} />
              <Pressable onPress={() => setShowPassword((p) => !p)} style={styles.eyeBtn}>
                <Feather name={showPassword ? "eye-off" : "eye"} size={18} color="#666" />
              </Pressable>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color="#e50914" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }]} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>{mode === "login" ? "ENTRAR" : "CRIAR CONTA"}</Text>}
            </Pressable>

            {mode === "login" && (
              <Pressable style={styles.forgotBtn} onPress={handleForgotPassword}>
                <Text style={styles.forgotText}>Esqueceu a senha?</Text>
              </Pressable>
            )}

            <Pressable style={styles.switchMode} onPress={() => { setMode((m) => (m === "login" ? "register" : "login")); setError(""); }}>
              <Text style={styles.switchText}>
                {mode === "login" ? "Não tem conta? " : "Já tem conta? "}
                <Text style={styles.switchLink}>{mode === "login" ? "Criar conta" : "Entrar"}</Text>
              </Text>
            </Pressable>
          </View>

          <Text style={styles.footer}>NETPLAY v1.1 — Catálogo Premium</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 48 },
  logoSection: { alignItems: "center", marginBottom: 40 },
  logoText: { fontSize: 42, fontWeight: "900", color: "#e50914", letterSpacing: 6 },
  logoLine: { width: 40, height: 2, backgroundColor: "#e50914", marginVertical: 8 },
  logoSub: { fontSize: 11, color: "#666", fontWeight: "600", letterSpacing: 3 },
  card: { width: "100%", maxWidth: 380, backgroundColor: "#111", borderRadius: 20, borderWidth: 1, borderColor: "#222", padding: 24, gap: 16 },
  cardTitle: { fontSize: 22, fontWeight: "700", color: "#fff", marginBottom: 4 },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a1a", borderRadius: 12, borderWidth: 1, borderColor: "#2a2a2a", paddingHorizontal: 14, height: 52 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: "#fff", fontSize: 15 },
  eyeBtn: { padding: 4 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#e5091422", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  errorText: { color: "#e50914", fontSize: 13, flex: 1 },
  submitBtn: { backgroundColor: "#e50914", borderRadius: 12, height: 52, alignItems: "center", justifyContent: "center", marginTop: 4 },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "700", letterSpacing: 1 },
  forgotBtn: { alignItems: "center", paddingVertical: 2 },
  forgotText: { color: "#e50914", fontSize: 13, fontWeight: "500" },
  switchMode: { alignItems: "center", paddingVertical: 4 },
  switchText: { color: "#666", fontSize: 14 },
  switchLink: { color: "#e50914", fontWeight: "600" },
  footer: { color: "#333", fontSize: 11, marginTop: 32, textAlign: "center" },
});
