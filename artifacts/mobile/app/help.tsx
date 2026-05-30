import React, { useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const FAQS = [
  {
    q: "Como assistir um conteúdo?",
    a: "Navegue pelas abas Início, Novidades ou Franquias, toque em qualquer título e pressione 'Assistir Agora' na tela de detalhes.",
  },
  {
    q: "Como adicionar à minha lista?",
    a: "Na tela de detalhes de qualquer filme ou série, toque no ícone de coração (♡) ou no botão 'Minha Lista'. O item aparecerá na aba Lista.",
  },
  {
    q: "Como assistir canais ao vivo?",
    a: "Vá para a aba Canais, escolha um canal e toque no botão play ou em 'Assistir Agora'. O player será aberto automaticamente.",
  },
  {
    q: "Por que o vídeo não carrega?",
    a: "Verifique sua conexão com a internet. Se o problema persistir, o conteúdo pode estar temporariamente indisponível. Tente novamente em alguns minutos.",
  },
  {
    q: "Como criar uma conta?",
    a: "Na tela de login, toque em 'Criar conta', insira seu nome, e-mail e senha. Sua conta será criada imediatamente.",
  },
  {
    q: "Posso assistir em vários dispositivos?",
    a: "Sim! Sua conta sincroniza o progresso e lista entre todos os dispositivos onde você fizer login com o mesmo e-mail.",
  },
  {
    q: "Como funciona o 'Continue Assistindo'?",
    a: "O progresso é salvo automaticamente quando você assiste. A seção 'Continue Assistindo' aparece na aba Início e na aba Lista.",
  },
  {
    q: "Como trocar minha senha?",
    a: "No momento, entre em contato com o suporte para solicitar a redefinição de senha. Em breve haverá opção direta no perfil.",
  },
];

const CONTACTS = [
  { icon: "mail", label: "E-mail", value: "suporte@netplay.com" },
  { icon: "message-circle", label: "Chat ao vivo", value: "Disponível 9h–22h" },
  { icon: "instagram", label: "Instagram", value: "@netplay.app" },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  return (
    <Pressable
      onPress={() => setOpen((v) => !v)}
      style={[styles.faqCard, { backgroundColor: colors.card, borderColor: open ? colors.primary + "55" : colors.border }]}
    >
      <View style={styles.faqRow}>
        <Text style={[styles.faqQ, { color: colors.foreground }]}>{q}</Text>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
      </View>
      {open && (
        <Text style={[styles.faqA, { color: colors.mutedForeground }]}>{a}</Text>
      )}
    </Pressable>
  );
}

export default function HelpScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Ajuda e Suporte</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>

        <View style={[styles.heroBanner, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "33" }]}>
          <Feather name="help-circle" size={32} color={colors.primary} />
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>Como podemos ajudar?</Text>
          <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
            Encontre respostas rápidas abaixo ou entre em contato com o suporte.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PERGUNTAS FREQUENTES</Text>
        {FAQS.map((item) => (
          <FAQItem key={item.q} q={item.q} a={item.a} />
        ))}

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 28 }]}>CONTATO</Text>
        {CONTACTS.map((c) => (
          <View key={c.label} style={[styles.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.contactIcon, { backgroundColor: colors.primary + "18" }]}>
              <Feather name={c.icon as any} size={18} color={colors.primary} />
            </View>
            <View>
              <Text style={[styles.contactLabel, { color: colors.mutedForeground }]}>{c.label}</Text>
              <Text style={[styles.contactValue, { color: colors.foreground }]}>{c.value}</Text>
            </View>
          </View>
        ))}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  heroBanner: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
  },
  heroTitle: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  heroSub: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 12,
  },
  faqCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
    gap: 10,
  },
  faqRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  faqQ: { flex: 1, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  faqA: { fontSize: 13, lineHeight: 19 },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
    gap: 14,
  },
  contactIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  contactLabel: { fontSize: 11, fontWeight: "600", marginBottom: 2 },
  contactValue: { fontSize: 14, fontWeight: "600" },
});
