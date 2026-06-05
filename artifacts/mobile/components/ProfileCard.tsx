import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { AvatarCircle } from "./AvatarCircle";
import { useColors } from "@/hooks/useColors";

interface ProfileCardProps {
  name: string;
  email?: string;
  avatarUrl?: string | null;
  isActive?: boolean;
  isPremium?: boolean;
  onPress?: () => void;
  onEdit?: () => void;
}

export function ProfileCard({
  name,
  email,
  avatarUrl,
  isActive = false,
  isPremium = false,
  onPress,
  onEdit,
}: ProfileCardProps) {
  const colors = useColors();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: isActive ? `${colors.primary}12` : colors.card,
          borderColor: isActive ? `${colors.primary}35` : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {isActive && (
        <LinearGradient
          colors={[`${colors.primary}14`, "transparent"]}
          style={StyleSheet.absoluteFill}
        />
      )}

      <AvatarCircle
        uri={avatarUrl}
        name={name}
        size={52}
        showEdit={false}
      />

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
            {name}
          </Text>
          {isPremium && (
            <View style={[styles.premiumBadge, { backgroundColor: "#f59e0b18", borderColor: "#f59e0b30" }]}>
              <Feather name="star" size={8} color="#f59e0b" />
              <Text style={[styles.premiumText, { color: "#f59e0b" }]}>PRO</Text>
            </View>
          )}
        </View>
        {email && (
          <Text style={[styles.email, { color: colors.mutedForeground }]} numberOfLines={1}>
            {email}
          </Text>
        )}
      </View>

      <View style={styles.right}>
        {isActive && (
          <View style={[styles.activeIndicator, { backgroundColor: colors.accentGreen }]} />
        )}
        {onEdit && (
          <Pressable onPress={onEdit} style={styles.editBtn} hitSlop={8}>
            <Feather name="edit-2" size={14} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    overflow: "hidden",
  },
  info: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  premiumText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  email: {
    fontSize: 12,
    fontWeight: "400",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  activeIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  editBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
