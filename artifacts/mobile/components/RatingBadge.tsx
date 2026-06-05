import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface RatingBadgeProps {
  rating: number;
  size?: "sm" | "md" | "lg";
  showBar?: boolean;
}

export function RatingBadge({ rating, size = "md", showBar = false }: RatingBadgeProps) {
  const colors = useColors();

  const label = rating >= 8 ? "Excelente" : rating >= 6.5 ? "Bom" : rating >= 5 ? "Regular" : "Fraco";
  const color =
    rating >= 8 ? colors.accentGreen :
    rating >= 6.5 ? colors.ratingGold :
    rating >= 5 ? colors.accentAmber :
    colors.mutedForeground;

  const fontSizes = { sm: 10, md: 13, lg: 18 };
  const iconSizes = { sm: 9, md: 12, lg: 16 };
  const px = { sm: 5, md: 8, lg: 12 };
  const py = { sm: 2, md: 4, lg: 7 };

  return (
    <View style={styles.wrap}>
      <View style={[
        styles.badge,
        {
          backgroundColor: `${color}18`,
          borderColor: `${color}30`,
          paddingHorizontal: px[size],
          paddingVertical: py[size],
        },
      ]}>
        <Feather name="star" size={iconSizes[size]} color={color} />
        <Text style={[styles.score, { fontSize: fontSizes[size], color }]}>
          {rating.toFixed(1)}
        </Text>
      </View>
      {size !== "sm" && (
        <Text style={[styles.label, { color: colors.mutedForeground, fontSize: size === "lg" ? 12 : 10 }]}>
          {label}
        </Text>
      )}
      {showBar && (
        <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.barFill,
              { width: `${(rating / 10) * 100}%` as any, backgroundColor: color },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "flex-start",
    gap: 5,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  score: {
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  label: {
    fontWeight: "500",
  },
  barTrack: {
    height: 4,
    width: 80,
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },
});
