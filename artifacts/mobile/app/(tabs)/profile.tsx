import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";

interface SettingRowProps {
  icon: string;
  label: string;
  value?: string;
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  onPress?: () => void;
  danger?: boolean;
  accent?: boolean;
}

function SettingRow({ icon, label, value, toggle, toggleValue, onToggle, onPress, danger, accent }: SettingRowProps) {
  const colors = useColors();
  const color = danger ? colors.primary : accent ? colors.primary : colors.foreground;
  const iconColor = danger ? colors.primary : accent ? colors.primary : colors.mutedForeground;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.settingRow, { backgroundColor: pressed ? colors.card : "transparent" }]}
    >
      <View style={[styles.settingIcon, { backgroundColor: (danger || accent) ? colors.primary + "22" : colors.card }]}>
        <Feather name={icon as any} size={16} color={iconColor} />
      </View>
      <Text style={[styles.settingLabel, { color }]}>{label}</Text>
      <View style={styles.settingRight}>
        {value && <Text style={[styles.settingValue, { color: colors.mutedForeground }]}>{value}</Text>}
        {toggle && onToggle ? (
          <Switch
            value={toggleValue}
            onValueChange={onToggle}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        ) : !toggle ? (
          <Feather name="chevron-right" size={16} color={colors.border} />
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [notifications, setNotifications] = useState(true);
  const [autoPlay, setAutoPlay] = useState(true);
  const [hd, setHd] = useState(false);

  const handleLogout = () => {
    if (Platform.OS === "web") {
      logout();
      router.replace("/login");
      return;
    }
    Alert.alert("Sair da conta", "Tem certeza que deseja sair?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const isAdmin = user?.role === "admin";
  const avatarLetter = user?.avatarLetter ?? user?.name?.[0]?.toUpperCase() ?? "U";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ height: topPad + 16 }} />

        <View style={styles.avatarSection}>
          <LinearGradient colors={[colors.primary, "#8b0000"]} style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </LinearGradient>
          <View style={styles.avatarInfo}>
            <Text style={[styles.userName, { color: colors.foreground }]}>
              {user?.name ?? "Usuário NETPLAY"}
            </Text>
            <Text style={[styles.userEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
              {user?.email ?? ""}
            </Text>
            <View style={styles.badgeRow}>
              <View style={[styles.planBadge, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}>
                <Text style={[styles.planText, { color: colors.primary }]}>Premium</Text>
              </View>
              {isAdmin && (
                <View style={[styles.planBadge, { backgroundColor: "#ff980022", borderColor: "#ff980044", marginLeft: 6 }]}>
                  <Text style={[styles.planText, { color: "#ff9800" }]}>Admin</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Preferências</Text>
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingRow icon="bell" label="Notificações" toggle toggleValue={notifications} onToggle={setNotifications} />
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <SettingRow icon="play-circle" label="Reprodução automática" toggle toggleValue={autoPlay} onToggle={setAutoPlay} />
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <SettingRow icon="film" label="Qualidade HD" toggle toggleValue={hd} onToggle={setHd} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Conta</Text>
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingRow icon="shield" label="Privacidade" onPress={() => router.push("/privacy")} />
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <SettingRow icon="download" label="Downloads offline" value="0 itens" onPress={() => router.push("/(tabs)/list")} />
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <SettingRow icon="help-circle" label="Ajuda e suporte" onPress={() => router.push("/help")} />
          </View>
        </View>

        {isAdmin && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Administração</Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SettingRow
                icon="activity"
                label="Painel Admin"
                accent
                onPress={() => router.push("/admin")}
              />
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Perfis</Text>
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingRow
              icon="users"
              label="Trocar Perfil"
              accent
              onPress={() => router.push("/profile-select")}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingRow icon="log-out" label="Sair da conta" danger onPress={handleLogout} />
          </View>
        </View>

        <Text style={[styles.version, { color: colors.border }]}>
          NETPLAY v1.0.0 — Catálogo Premium
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  avatarSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 14,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 26, fontWeight: "800" },
  avatarInfo: { flex: 1, gap: 4 },
  userName: { fontSize: 18, fontWeight: "700" },
  userEmail: { fontSize: 13 },
  badgeRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  planBadge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  planText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  section: { paddingHorizontal: 20, marginBottom: 20 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  sectionCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  settingIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  settingLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
  settingRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  settingValue: { fontSize: 13 },
  separator: { height: 1, marginLeft: 62 },
  version: { textAlign: "center", fontSize: 11, paddingVertical: 10 },
});
