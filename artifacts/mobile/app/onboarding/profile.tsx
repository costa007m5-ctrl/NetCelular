import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

const AVATAR_COLORS = [
  "#e50914", "#e91e63", "#9c27b0", "#673ab7",
  "#3f51b5", "#2196f3", "#00bcd4", "#009688",
  "#4caf50", "#ff9800", "#ff5722", "#795548",
];

const BANNERS: { colors: [string, string]; label: string }[] = [
  { colors: ["#4a0000", "#000000"], label: "Vermelho" },
  { colors: ["#001040", "#000000"], label: "Azul" },
  { colors: ["#001a00", "#000000"], label: "Verde" },
  { colors: ["#1a0030", "#000000"], label: "Roxo" },
  { colors: ["#2a1000", "#000000"], label: "Laranja" },
  { colors: ["#001a1a", "#000000"], label: "Teal" },
  { colors: ["#1a1a00", "#000000"], label: "Ouro" },
  { colors: ["#151515", "#000000"], label: "Cinza" },
];

export default function OnboardingProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const initial = (user?.name ?? "U")[0].toUpperCase();
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
  const [selectedBanner, setSelectedBanner] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleNext = async () => {
    setSaving(true);
    try {
      if (user?.id) {
        await supabase.from("users").update({
          avatar_url: selectedColor,
          profile_banner: `gradient:${BANNERS[selectedBanner].colors.join(",")}`,
        }).eq("id", user.id);
      }
      await AsyncStorage.setItem("netplay_profile_color", selectedColor);
      await AsyncStorage.setItem("netplay_profile_banner", String(selectedBanner));
    } catch {}
    setSaving(false);
    router.push("/onboarding/preferences");
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={["#1a0000", "#000000"]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <Text style={styles.logo}>NET<Text style={styles.logoRed}>PLAY</Text></Text>
        <Text style={styles.stepLabel}>1 de 2</Text>
      </View>

      <View style={styles.progressRow}>
        <View style={[styles.progressDot, styles.progressDotActive]} />
        <View style={styles.progressLine} />
        <View style={styles.progressDot} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Crie seu perfil</Text>
        <Text style={styles.subtitle}>Escolha um avatar e um banner para personalizar sua conta.</Text>

        <View style={styles.avatarPreviewWrap}>
          <LinearGradient
            colors={BANNERS[selectedBanner].colors}
            style={styles.bannerPreview}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          />
          <View style={[styles.avatarCircleLarge, { backgroundColor: selectedColor }]}>
            <Text style={styles.avatarLetterLarge}>{initial}</Text>
          </View>
          <Text style={styles.previewName}>{user?.name ?? "Seu nome"}</Text>
        </View>

        <Text style={styles.sectionLabel}>Cor do avatar</Text>
        <View style={styles.colorGrid}>
          {AVATAR_COLORS.map((color) => (
            <Pressable
              key={color}
              onPress={() => setSelectedColor(color)}
              style={[
                styles.colorDot,
                { backgroundColor: color },
                selectedColor === color && styles.colorDotSelected,
              ]}
            >
              {selectedColor === color && (
                <Feather name="check" size={16} color="#fff" />
              )}
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Banner do perfil</Text>
        <View style={styles.bannerGrid}>
          {BANNERS.map((banner, idx) => (
            <Pressable
              key={idx}
              onPress={() => setSelectedBanner(idx)}
              style={[
                styles.bannerOption,
                selectedBanner === idx && styles.bannerOptionSelected,
              ]}
            >
              <LinearGradient
                colors={banner.colors}
                style={styles.bannerGradient}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              />
              {selectedBanner === idx && (
                <View style={styles.bannerCheck}>
                  <Feather name="check" size={12} color="#fff" />
                </View>
              )}
              <Text style={styles.bannerLabel}>{banner.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[styles.nextBtn, saving && styles.nextBtnDisabled]}
          onPress={handleNext}
          disabled={saving}
        >
          <Text style={styles.nextBtnText}>Próximo</Text>
          <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
        </Pressable>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: 56, paddingHorizontal: 24, paddingBottom: 8,
  },
  logo: { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: -1 },
  logoRed: { color: "#e50914" },
  stepLabel: { fontSize: 13, color: "#555", fontWeight: "600" },
  progressRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 24, marginBottom: 24,
  },
  progressDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: "#2a2a2a", borderWidth: 2, borderColor: "#333",
  },
  progressDotActive: { backgroundColor: "#e50914", borderColor: "#e50914" },
  progressLine: { flex: 1, height: 2, backgroundColor: "#1e1e1e", marginHorizontal: 8 },
  scroll: { paddingHorizontal: 24, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: "800", color: "#fff", marginBottom: 8 },
  subtitle: { fontSize: 15, color: "#888", lineHeight: 22, marginBottom: 28 },
  avatarPreviewWrap: {
    borderRadius: 16, overflow: "hidden",
    backgroundColor: "#141414", marginBottom: 32,
    alignItems: "center", paddingBottom: 24,
  },
  bannerPreview: { width: "100%", height: 90 },
  avatarCircleLarge: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: "center", justifyContent: "center",
    marginTop: -40, borderWidth: 3, borderColor: "#000",
  },
  avatarLetterLarge: { fontSize: 34, fontWeight: "900", color: "#fff" },
  previewName: { color: "#fff", fontSize: 16, fontWeight: "700", marginTop: 10 },
  sectionLabel: { fontSize: 13, color: "#666", fontWeight: "700", letterSpacing: 1, marginBottom: 12, textTransform: "uppercase" },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 28 },
  colorDot: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
  },
  colorDotSelected: { borderWidth: 3, borderColor: "#fff" },
  bannerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 32 },
  bannerOption: { width: "22%", borderRadius: 10, overflow: "hidden", borderWidth: 2, borderColor: "transparent" },
  bannerOptionSelected: { borderColor: "#fff" },
  bannerGradient: { height: 44, width: "100%" },
  bannerCheck: {
    position: "absolute", top: 4, right: 4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "#e50914", alignItems: "center", justifyContent: "center",
  },
  bannerLabel: { color: "#666", fontSize: 10, textAlign: "center", paddingVertical: 4, fontWeight: "600" },
  nextBtn: {
    backgroundColor: "#e50914", borderRadius: 14,
    paddingVertical: 17, flexDirection: "row",
    alignItems: "center", justifyContent: "center",
  },
  nextBtnDisabled: { opacity: 0.6 },
  nextBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
