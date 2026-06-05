import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";

interface StatCardProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string | number;
  color?: string;
  trend?: string;
}

export function StatCard({ icon, label, value, color, trend }: StatCardProps) {
  const colors = useColors();
  const accent = color ?? colors.primary;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
      <LinearGradient
        colors={[`${accent}18`, "transparent"]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={[styles.iconWrap, { backgroundColor: `${accent}18` }]}>
        <Feather name={icon} size={18} color={accent} />
      </View>
      <Text style={[styles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.mutedForeground }]} numberOfLines={1}>
        {label}
      </Text>
      {trend && (
        <View style={styles.trendRow}>
          <Feather name="trending-up" size={10} color={colors.accentGreen} />
          <Text style={[styles.trend, { color: colors.accentGreen }]}>{trend}</Text>
        </View>
      )}
    </View>
  );
}

export function StatsRow({
  stats,
}: {
  stats: Array<{ icon: keyof typeof Feather.glyphMap; label: string; value: string | number; color?: string }>;
}) {
  return (
    <View style={styles.row}>
      {stats.map((s, i) => (
        <StatCard key={i} {...s} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  card: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
    overflow: "hidden",
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  value: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 11,
    fontWeight: "500",
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  trend: {
    fontSize: 10,
    fontWeight: "600",
  },
});
