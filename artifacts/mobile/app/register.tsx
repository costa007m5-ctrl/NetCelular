import React, { useRef, useState } from "react";
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

const TOTAL_STEPS = 5;

export default function RegisterScreen() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resending, setResending] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  const clearError = () => setError("");

  const formatPhone = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const goNext = async () => {
    clearError();
    if (step === 1) {
      if (!name.trim() || name.trim().length < 2) { setError("Informe seu nome completo"); return; }
      setStep(2);
    } else if (step === 2) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 10) { setError("Informe um número de celular válido"); return; }
      setStep(3);
    } else if (step === 3) {
      if (!email.trim() || !/\S+@\S+\.\S+/.test(email.trim())) { setError("Email inválido"); return; }
      setStep(4);
    } else if (step === 4) {
      if (password.length < 6) { setError("A senha deve ter no mínimo 6 caracteres"); return; }
      if (password !== confirm) { setError("As senhas não coincidem"); return; }
      await handleSignUp();
    }
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const handleSignUp = async () => {
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: "netplay://email-confirmed" },
      });
      if (signUpError) { setError(signUpError.message); return; }
      if (data.user) {
        await db.users.upsertProfile(data.user.id, email.trim(), name.trim());
      }
      setStep(5);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: "netplay://email-confirmed" } });
      Alert.alert("Email reenviado", "Verifique sua caixa de entrada.");
    } catch {
      Alert.alert("Erro", "Não foi possível reenviar o email.");
    } finally {
      setResending(false);
    }
  };

  const goBack = () => {
    clearError();
    if (step > 1 && step < 5) setStep(step - 1);
    else router.back();
  };

  const progress = ((step - 1) / (TOTAL_STEPS - 1)) * 100;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={["#1a0000", "#000000"]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        {step < 5 && (
          <Pressable onPress={goBack} style={styles.backBtn} hitSlop={12}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
        )}
        <Text style={styles.headerTitle}>Criar conta</Text>
        <Text style={styles.stepLabel}>{step}/{TOTAL_STEPS}</Text>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {step === 1 && (
            <View style={styles.stepWrap}>
              <View style={styles.stepIcon}><Feather name="user" size={28} color="#e50914" /></View>
              <Text style={styles.stepTitle}>Como você se chama?</Text>
              <Text style={styles.stepSubtitle}>Esse nome aparecerá no seu perfil do NETPLAY.</Text>
              <View style={styles.inputWrap}>
                <Feather name="user" size={16} color="#555" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Seu nome completo"
                  placeholderTextColor="#555"
                  autoCapitalize="words"
                  value={name}
                  onChangeText={setName}
                  returnKeyType="next"
                  onSubmitEditing={goNext}
                />
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepWrap}>
              <View style={styles.stepIcon}><Feather name="phone" size={28} color="#e50914" /></View>
              <Text style={styles.stepTitle}>Número de celular</Text>
              <Text style={styles.stepSubtitle}>Para segurança da sua conta, caso precise de suporte.</Text>
              <View style={styles.inputWrap}>
                <Feather name="phone" size={16} color="#555" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="(00) 00000-0000"
                  placeholderTextColor="#555"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={(v) => setPhone(formatPhone(v))}
                  returnKeyType="next"
                  onSubmitEditing={goNext}
                />
              </View>
            </View>
          )}

          {step === 3 && (
            <View style={styles.stepWrap}>
              <View style={styles.stepIcon}><Feather name="mail" size={28} color="#e50914" /></View>
              <Text style={styles.stepTitle}>Qual o seu email?</Text>
              <Text style={styles.stepSubtitle}>Vamos enviar um link de confirmação para ativar sua conta.</Text>
              <View style={styles.inputWrap}>
                <Feather name="mail" size={16} color="#555" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="seu@email.com"
                  placeholderTextColor="#555"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                  returnKeyType="next"
                  onSubmitEditing={goNext}
                />
              </View>
            </View>
          )}

          {step === 4 && (
            <View style={styles.stepWrap}>
              <View style={styles.stepIcon}><Feather name="shield" size={28} color="#e50914" /></View>
              <Text style={styles.stepTitle}>Crie uma senha</Text>
              <Text style={styles.stepSubtitle}>Mínimo de 6 caracteres. Use letras e números para maior segurança.</Text>
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
                  returnKeyType="done"
                  onSubmitEditing={goNext}
                />
              </View>
            </View>
          )}

          {step === 5 && (
            <View style={styles.stepWrap}>
              <View style={[styles.stepIcon, { backgroundColor: "#1a2a1a", borderColor: "#2a4a2a" }]}>
                <Feather name="send" size={28} color="#4caf50" />
              </View>
              <Text style={styles.stepTitle}>Verifique seu email</Text>
              <Text style={styles.stepSubtitle}>
                Enviamos um link de confirmação para:
              </Text>
              <View style={styles.emailBox}>
                <Feather name="mail" size={16} color="#e50914" style={{ marginRight: 8 }} />
                <Text style={styles.emailText}>{email}</Text>
              </View>
              <Text style={styles.instructions}>
                Abra o email e toque no botão <Text style={{ color: "#fff", fontWeight: "700" }}>"Confirmar E-mail"</Text>.{"\n\n"}
                O aplicativo abrirá automaticamente para você finalizar seu cadastro.
              </Text>

              <View style={styles.divider} />

              <Text style={styles.resendLabel}>Não recebeu o email?</Text>
              <Pressable
                onPress={handleResend}
                style={[styles.resendBtn, resending && styles.btnDisabled]}
                disabled={resending}
              >
                {resending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.resendText}>Reenviar email</Text>
                }
              </Pressable>

              <Pressable onPress={() => router.replace("/login")} style={styles.backToLogin}>
                <Feather name="arrow-left" size={14} color="#666" style={{ marginRight: 6 }} />
                <Text style={styles.backToLoginText}>Voltar ao login</Text>
              </Pressable>
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {step < 5 && (
            <Pressable
              style={[styles.nextBtn, loading && styles.btnDisabled]}
              onPress={goNext}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : (
                  <View style={styles.nextBtnInner}>
                    <Text style={styles.nextBtnText}>{step === 4 ? "Criar conta" : "Próximo"}</Text>
                    {step < 4 && <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />}
                  </View>
                )
              }
            </Pressable>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  flex: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 56 : 40,
    paddingHorizontal: 20, paddingBottom: 12,
  },
  backBtn: { marginRight: 12, padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: "#fff" },
  stepLabel: { fontSize: 13, color: "#555", fontWeight: "600" },
  progressBar: { height: 3, backgroundColor: "#1e1e1e", marginHorizontal: 20, borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: "#e50914", borderRadius: 2 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 48 },
  stepWrap: { marginBottom: 24 },
  stepIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "#1e0000", borderWidth: 1, borderColor: "#3a0000",
    alignItems: "center", justifyContent: "center", marginBottom: 24,
  },
  stepTitle: { fontSize: 26, fontWeight: "800", color: "#fff", marginBottom: 8 },
  stepSubtitle: { fontSize: 15, color: "#888", lineHeight: 22, marginBottom: 28 },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#141414", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 15,
    marginBottom: 12, borderWidth: 1, borderColor: "#2a2a2a",
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: "#fff", fontSize: 16 },
  emailBox: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#1a0a0a", borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: "#3a1010", marginBottom: 20,
  },
  emailText: { color: "#fff", fontSize: 15, fontWeight: "600", flex: 1 },
  instructions: { fontSize: 15, color: "#888", lineHeight: 24, marginBottom: 8 },
  divider: { height: 1, backgroundColor: "#1e1e1e", marginVertical: 24 },
  resendLabel: { fontSize: 14, color: "#666", marginBottom: 12 },
  resendBtn: {
    borderWidth: 1, borderColor: "#333", borderRadius: 10,
    paddingVertical: 13, alignItems: "center", marginBottom: 16,
  },
  resendText: { color: "#aaa", fontSize: 15, fontWeight: "600" },
  backToLogin: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  backToLoginText: { color: "#555", fontSize: 14 },
  error: { color: "#e50914", fontSize: 13, marginBottom: 12, textAlign: "center" },
  nextBtn: {
    backgroundColor: "#e50914", borderRadius: 12,
    paddingVertical: 16, alignItems: "center",
  },
  nextBtnInner: { flexDirection: "row", alignItems: "center" },
  nextBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  btnDisabled: { opacity: 0.6 },
});
