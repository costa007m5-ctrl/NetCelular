import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface HorizontalDividerProps {
  label?: string;
  spacing?: number;
  color?: string;
}

export function HorizontalDivider({ label, spacing = 20, color }: HorizontalDividerProps) {
  const colors = useColors();
  const lineColor = color ?? colors.border;

  if (!label) {
    return (
      <View
        style={[
          styles.divider,
          {
            backgroundColor: lineColor,
            marginHorizontal: spacing,
            marginVertical: 8,
          },
        ]}
      />
    );
  }

  return (
    <View style={[styles.row, { marginHorizontal: spacing, marginVertical: 8 }]}>
      <View style={[styles.line, { backgroundColor: lineColor }]} />
      <Text style={[styles.text, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[styles.line, { backgroundColor: lineColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  line: {
    flex: 1,
    height: 1,
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});
