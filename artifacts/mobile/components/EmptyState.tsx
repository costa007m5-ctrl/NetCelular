import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface EmptyStateProps {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  size?: "sm" | "md" | "lg";
}

export function EmptyState({
  icon = "inbox",
  title,
  subtitle,
  actionLabel,
  onAction,
  size = "md",
}: EmptyStateProps) {
  const colors = useColors();
  const iconSize = size === "sm" ? 28 : size === "lg" ? 52 : 38;
  const titleSize = size === "sm" ? 14 : size === "lg" ? 20 : 16;

  return (
    <View style={[styles.container, size === "lg" && styles.containerLg]}>
      <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}20` }]}>
        <Feather name={icon} size={iconSize} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.title, { color: colors.foreground, fontSize: titleSize }]}>
        {title}
      </Text>
      {subtitle && (
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
      )}
      {actionLabel && onAction && (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={styles.btnText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 32,
    gap: 10,
  },
  containerLg: {
    paddingVertical: 64,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 4,
  },
  title: {
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "400",
    textAlign: "center",
    lineHeight: 19,
  },
  btn: {
    marginTop: 6,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 10,
  },
  btnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
