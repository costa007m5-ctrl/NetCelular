import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

type Quality = "4K" | "UHD" | "1080p" | "HD" | "720p" | "SD" | "480p";

interface QualityBadgeProps {
  quality: string;
  size?: "xs" | "sm" | "md";
}

function getQualityColor(quality: string) {
  const q = quality.toUpperCase();
  if (q.includes("4K") || q.includes("UHD")) return { bg: "#7c3aed", border: "#6d28d9" };
  if (q.includes("1080") || q.includes("FHD")) return { bg: "#2563eb", border: "#1d4ed8" };
  if (q.includes("HD") || q.includes("720")) return { bg: "#059669", border: "#047857" };
  return { bg: "#6b7280", border: "#4b5563" };
}

export function QualityBadge({ quality, size = "sm" }: QualityBadgeProps) {
  const { bg, border } = getQualityColor(quality);

  const fontSize = size === "xs" ? 7 : size === "sm" ? 8 : 10;
  const px = size === "xs" ? 4 : size === "sm" ? 6 : 8;
  const py = size === "xs" ? 1 : size === "sm" ? 2 : 3;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: `${bg}22`,
          borderColor: `${border}50`,
          paddingHorizontal: px,
          paddingVertical: py,
        },
      ]}
    >
      <Text style={[styles.label, { fontSize, color: bg }]}>{quality.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 5,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  label: {
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
