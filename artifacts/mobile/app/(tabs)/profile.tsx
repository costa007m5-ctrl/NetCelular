import React, { useState } from "react";
import {
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface SettingRowProps {
  icon: string;
  label: string;
  value?: string;
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  onPress?: () => void;
  danger?: boolean;
}

function SettingRow({ icon, label, value, toggle, toggleValue, onToggle, onPress, danger }: SettingRowProps) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.settingRow, { backgroundColor: pressed ? colors.card : "transparent" }]}
    >
      <View style={[styles.settingIcon, { backgroundColor: danger ? colors.primary + "22" : colors.card }]}>
        <Feather name={icon as any} size={16} color={danger ? colors.primary : colors.mutedForeground} />
      </View>
      <Text style={[styles.settingLabel, { color: danger ? colors.primary : colors.foreground }]}>
        {label}
      </Text>
      <View style={styles.settingRight}>
        {value && (
          <Text style={[styles.settingValue, { color: colors.mutedForeground }]}>{value}</Text>
        )}
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
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [notifications, setNotifications] = useState(true);
  const [autoPlay, setAutoPlay] = useState(true);
  const [hd, setHd] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ height: topPad + 16 }} />

        <View style={styles.avatarSection}>
          <LinearGradient
            colors={[colors.primary, "#8b0000"]}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>U</Text>
          </LinearGradient>
          <View style={styles.avatarInfo}>
            <Text style={[styles.userName, { color: colors.foreground }]}>
              Usuário NETPLAY
            </Text>
            <View style={[styles.planBadge, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}>
              <Text style={[styles.planText, { color: colors.primary }]}>Premium</Text>
            </View>
          </View>
          <Pressable style={styles.editBtn}>
            <Feather name="edit-2" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          {[
            { label: "Assistidos", value: "128" },
            { label: "Na lista", value: "24" },
            { label: "Horas", value: "342" },
          ].map((stat) => (
            <View
              key={stat.label}
              style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Text style={[styles.statValue, { color: colors.foreground }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Preferências</Text>
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingRow
              icon="bell"
              label="Notificações"
              toggle
              toggleValue={notifications}
              onToggle={setNotifications}
            />
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <SettingRow
              icon="play-circle"
              label="Reprodução automática"
              toggle
              toggleValue={autoPlay}
              onToggle={setAutoPlay}
            />
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <SettingRow
              icon="film"
              label="Qualidade HD"
              toggle
              toggleValue={hd}
              onToggle={setHd}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Conta</Text>
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingRow icon="user" label="Editar perfil" value="" />
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <SettingRow icon="shield" label="Privacidade" />
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <SettingRow icon="download" label="Downloads offline" value="0 itens" />
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <SettingRow icon="help-circle" label="Ajuda e suporte" />
          </View>
        </View>

        <View style={styles.section}>
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingRow icon="log-out" label="Sair da conta" danger />
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
    paddingBottom: 24,
    gap: 14,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
  },
  avatarInfo: {
    flex: 1,
    gap: 6,
  },
  userName: {
    fontSize: 18,
    fontWeight: "700",
  },
  planBadge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  planText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  editBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
    borderRadius: 0,
  },
  settingIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  settingLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  settingRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  settingValue: {
    fontSize: 13,
  },
  separator: {
    height: 1,
    marginLeft: 62,
  },
  version: {
    textAlign: "center",
    fontSize: 11,
    paddingVertical: 10,
  },
});
