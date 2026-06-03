import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/supabase";
import { PLANS, PlanKey } from "@/lib/session-manager";

const RED = "#e50914";

interface PlanCard {
  key: PlanKey;
  featured?: boolean;
}

const PLAN_CARDS: PlanCard[] = [
  { key: "basic" },
  { key: "normal", featured: true },
  { key: "premium" },
];

export default function PlanSelectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [selected, setSelected] = useState<PlanKey>("normal");
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!user?.id) {
      Alert.alert("Erro", "Usuário não autenticado. Faça login novamente.");
      return;
    }
    setSaving(true);
    try {
      await db.subscriptions.create(user.id, selected);
      router.replace("/(tabs)");
    } catch (err: any) {
      Alert.alert("Erro ao salvar plano", err?.message ?? "Não foi possível salvar sua escolha. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.logo}>
          NET<Text style={{ color: RED }}>PLAY</Text>
        </Text>
        <Text style={styles.title}>Escolha seu plano</Text>
        <Text style={styles.subtitle}>
          Você tem <Text style={styles.highlightText}>3 dias grátis</Text> para experimentar.{"\n"}
          Escolha o plano que melhor combina com você.
        </Text>

        {PLAN_CARDS.map(({ key, featured }) => {
          const plan = PLANS[key];
          const isSelected = selected === key;
          return (
            <Pressable
              key={key}
              onPress={() => setSelected(key)}
              style={[styles.card, isSelected && styles.cardSelected, featured && styles.cardFeatured]}
            >
              {featured && (
                <View style={styles.featuredBadge}>
                  <Text style={styles.featuredText}>RECOMENDADO</Text>
                </View>
              )}
              <View style={styles.cardRow}>
                <View style={styles.radioOuter}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
                <View style={styles.cardInfo}>
                  <Text style={[styles.planName, isSelected && { color: "#fff" }]}>{plan.name}</Text>
                  <View style={styles.featureRow}>
                    <Feather name="monitor" size={13} color={isSelected ? "#fff" : "#aaa"} />
                    <Text style={[styles.featureText, isSelected && { color: "#ddd" }]}>
                      {plan.screens} {plan.screens === 1 ? "tela simultânea" : "telas simultâneas"}
                    </Text>
                  </View>
                  <View style={styles.featureRow}>
                    <Feather name="check-circle" size={13} color={isSelected ? "#4ade80" : "#aaa"} />
                    <Text style={[styles.featureText, isSelected && { color: "#ddd" }]}>
                      Catálogo completo
                    </Text>
                  </View>
                  <View style={styles.featureRow}>
                    <Feather name="download" size={13} color={isSelected ? "#fff" : "#aaa"} />
                    <Text style={[styles.featureText, isSelected && { color: "#ddd" }]}>
                      Downloads disponíveis
                    </Text>
                  </View>
                </View>
                <View style={styles.priceBox}>
                  <Text style={[styles.priceVal, isSelected && { color: RED }]}>{plan.priceStr}</Text>
                  {plan.price > 0 && <Text style={styles.pricePer}>/mês</Text>}
                </View>
              </View>
            </Pressable>
          );
        })}

        <View style={styles.trialBanner}>
          <Feather name="clock" size={16} color={RED} />
          <Text style={styles.trialText}>
            3 dias de teste gratuito — sem necessidade de pagamento agora.{"\n"}
            Após o período, entre em contato com o administrador para ativar.
          </Text>
        </View>

        <Pressable
          style={[styles.confirmBtn, saving && { opacity: 0.6 }]}
          onPress={handleConfirm}
          disabled={saving}
        >
          <LinearGradient
            colors={["#e50914", "#b00710"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.confirmGrad}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmText}>Começar teste grátis</Text>
            )}
          </LinearGradient>
        </Pressable>

        <Text style={styles.footer}>
          Ao continuar você concorda com os termos de uso do NETPLAY.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080808" },
  scroll: { padding: 20, paddingBottom: 40 },
  logo: { fontSize: 28, fontWeight: "900", color: "#fff", letterSpacing: -1, textAlign: "center", marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "800", color: "#fff", textAlign: "center", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#999", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  highlightText: { color: "#fff", fontWeight: "700" },
  card: {
    borderRadius: 16, borderWidth: 1.5, borderColor: "#2a2a2a",
    backgroundColor: "#111", padding: 18, marginBottom: 12,
  },
  cardSelected: { borderColor: RED, backgroundColor: "#1a0a0b" },
  cardFeatured: { borderColor: "#e50914aa" },
  featuredBadge: {
    position: "absolute", top: -10, alignSelf: "center",
    backgroundColor: RED, paddingHorizontal: 14, paddingVertical: 3, borderRadius: 20,
  },
  featuredText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#555",
    alignItems: "center", justifyContent: "center", marginTop: 2,
  },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: RED },
  cardInfo: { flex: 1, gap: 5 },
  planName: { fontSize: 16, fontWeight: "700", color: "#ccc", marginBottom: 4 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  featureText: { fontSize: 12, color: "#888" },
  priceBox: { alignItems: "flex-end" },
  priceVal: { fontSize: 20, fontWeight: "800", color: "#fff" },
  pricePer: { fontSize: 11, color: "#666" },
  trialBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: "#1a0a0b", borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: "#330a0d", marginBottom: 24, marginTop: 8,
  },
  trialText: { flex: 1, fontSize: 12, color: "#ccc", lineHeight: 18 },
  confirmBtn: { borderRadius: 14, overflow: "hidden", marginBottom: 16 },
  confirmGrad: { paddingVertical: 18, alignItems: "center", justifyContent: "center" },
  confirmText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  footer: { fontSize: 11, color: "#555", textAlign: "center", lineHeight: 16 },
});
