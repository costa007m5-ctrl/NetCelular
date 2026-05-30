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
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { api } from "@/convex/_generated/api";
import { useAuth, hashPassword } from "@/lib/auth-context";

export default function LoginScreen() {
  const router = useRouter();
  const { setUser } = useAuth();
  const loginMutation = useMutation(api.users.login);
  const registerMutation = useMutation(api.users.register);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Tempo esgotado. Verifique sua conexão e tente novamente.")), ms)
      ),
    ]);
  }

  const handleSubmit = async () => {
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Preencha todos os campos");
      return;
    }
    if (mode === "register" && !name.trim()) {
      setError("Informe seu nome");
      return;
    }
    if (password.length < 6) {
      setError("Senha deve ter no mínimo 6 caracteres");
      return;
    }

    setLoading(true);
    try {
      const ph = await hashPassword(password);

      if (mode === "register") {
        const result = await withTimeout(
          registerMutation({ email, name, passwordHash: ph }),
          10000
        );
        if (result && "error" in result && result.error) {
          setError(result.error as string);
          return;
        }
        await setUser(result as any);
      } else {
        const result = await withTimeout(
          loginMutation({ email, passwordHash: ph }),
          10000
        );
        if (!result || ("error" in result && result.error)) {
          setError((result as any)?.error ?? "Email ou senha incorretos");
          return;
        }
        await setUser(result as any);
      }

      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.message ?? "Erro ao conectar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient
        colors={["#1a0000", "#000000"]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoSection}>
            <Text style={styles.logoText}>NETPLAY</Text>
            <View style={styles.logoLine} />
            <Text style={styles.logoSub}>CATÁLOGO PREMIUM</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {mode === "login" ? "Entrar na conta" : "Criar conta"}
            </Text>

            {mode === "register" && (
              <View style={styles.inputWrap}>
                <Feather name="user" size={18} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Seu nome"
                  placeholderTextColor="#555"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            )}

            <View style={styles.inputWrap}>
              <Feather name="mail" size={18} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#555"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputWrap}>
              <Feather name="lock" size={18} color="#666" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Senha"
                placeholderTextColor="#555"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
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

            <Pressable
              style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitText}>
                  {mode === "login" ? "ENTRAR" : "CRIAR CONTA"}
                </Text>
              )}
            </Pressable>

            <Pressable
              style={styles.switchMode}
              onPress={() => {
                setMode((m) => (m === "login" ? "register" : "login"));
                setError("");
              }}
            >
              <Text style={styles.switchText}>
                {mode === "login"
                  ? "Não tem conta? "
                  : "Já tem conta? "}
                <Text style={styles.switchLink}>
                  {mode === "login" ? "Criar conta" : "Entrar"}
                </Text>
              </Text>
            </Pressable>
          </View>

          <Text style={styles.footer}>
            NETPLAY v1.0 — Catálogo Premium
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  logoSection: { alignItems: "center", marginBottom: 40 },
  logoText: {
    fontSize: 42,
    fontWeight: "900",
    color: "#e50914",
    letterSpacing: 6,
  },
  logoLine: {
    width: 40,
    height: 2,
    backgroundColor: "#e50914",
    marginVertical: 8,
  },
  logoSub: {
    fontSize: 11,
    color: "#666",
    fontWeight: "600",
    letterSpacing: 3,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#111",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#222",
    padding: 24,
    gap: 16,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontWeight: "400",
  },
  eyeBtn: { padding: 4 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#e5091422",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: { color: "#e50914", fontSize: 13, flex: 1 },
  submitBtn: {
    backgroundColor: "#e50914",
    borderRadius: 12,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "700", letterSpacing: 1 },
  switchMode: { alignItems: "center", paddingVertical: 4 },
  switchText: { color: "#666", fontSize: 14 },
  switchLink: { color: "#e50914", fontWeight: "600" },
  footer: { color: "#333", fontSize: 11, marginTop: 32, textAlign: "center" },
});
