import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Feather.glyphMap;
  accentColor?: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  rightContent?: React.ReactNode;
}

export function SectionHeader({
  title,
  subtitle,
  icon,
  accentColor,
  onSeeAll,
  seeAllLabel = "Ver todos",
  rightContent,
}: SectionHeaderProps) {
  const colors = useColors();
  const accent = accentColor ?? colors.primary;

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <View style={[styles.bar, { backgroundColor: accent }]} />
        {icon && (
          <View style={[styles.iconWrap, { backgroundColor: `${accent}15` }]}>
            <Feather name={icon} size={14} color={accent} />
          </View>
        )}
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          {subtitle && (
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
          )}
        </View>
      </View>
      <View style={styles.right}>
        {rightContent}
        {onSeeAll && (
          <Pressable
            onPress={onSeeAll}
            style={({ pressed }) => [
              styles.seeAll,
              { borderColor: colors.borderLight, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[styles.seeAllText, { color: colors.mutedForeground }]}>
              {seeAllLabel}
            </Text>
            <Feather name="chevron-right" size={12} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  bar: {
    width: 3,
    height: 20,
    borderRadius: 2,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    gap: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "500",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  seeAllText: {
    fontSize: 11,
    fontWeight: "600",
  },
});
