import React from "react";
import {
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

const SECTIONS = [
  {
    icon: "database",
    title: "Dados coletados",
    body: "Coletamos dados de uso como títulos assistidos, preferências e progresso de reprodução para personalizar sua experiência.",
  },
  {
    icon: "eye-off",
    title: "Compartilhamento de dados",
    body: "Não vendemos seus dados pessoais. As informações são usadas exclusivamente para melhorar o serviço NETPLAY.",
  },
  {
    icon: "lock",
    title: "Segurança",
    body: "Sua senha é armazenada com hash seguro (bcrypt). Todas as comunicações são criptografadas via HTTPS/TLS.",
  },
  {
    icon: "trash-2",
    title: "Exclusão de dados",
    body: "Você pode solicitar a exclusão completa da sua conta e dados a qualquer momento pelo suporte.",
  },
  {
    icon: "bell-off",
    title: "Controle de notificações",
    body: "Você pode desativar notificações a qualquer momento nas configurações do seu perfil.",
  },
  {
    icon: "cookie",
    title: "Cookies",
    body: "Usamos cookies técnicos essenciais para manter sua sessão ativa. Não utilizamos cookies de rastreamento de terceiros.",
  },
];

export default function PrivacyScreen() {
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Privacidade</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroBanner, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "33" }]}>
          <Feather name="shield" size={32} color={colors.primary} />
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>Política de Privacidade</Text>
          <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
            Sua privacidade é importante para nós. Veja como tratamos seus dados.
          </Text>
        </View>

        {SECTIONS.map((s) => (
          <View key={s.title} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + "18" }]}>
              <Feather name={s.icon as any} size={18} color={colors.primary} />
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{s.title}</Text>
              <Text style={[styles.cardText, { color: colors.mutedForeground }]}>{s.body}</Text>
            </View>
          </View>
        ))}

        <Text style={[styles.updated, { color: colors.mutedForeground }]}>
          Última atualização: maio de 2025
        </Text>
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
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    gap: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardBody: { flex: 1, gap: 5 },
  cardTitle: { fontSize: 14, fontWeight: "700" },
  cardText: { fontSize: 13, lineHeight: 19 },
  updated: { fontSize: 11, textAlign: "center", marginTop: 8 },
});
