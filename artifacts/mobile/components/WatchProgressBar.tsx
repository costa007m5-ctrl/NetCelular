import React from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface WatchProgressBarProps {
  progress: number;
  height?: number;
  showLabel?: boolean;
  label?: string;
  accentColor?: string;
}

export function WatchProgressBar({
  progress,
  height = 3,
  showLabel = false,
  label,
  accentColor,
}: WatchProgressBarProps) {
  const colors = useColors();
  const accent = accentColor ?? colors.primary;
  const pct = Math.min(Math.max(progress, 0), 1);
  const minutes = Math.round(pct * 100);

  return (
    <View style={styles.wrap}>
      {showLabel && (
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            {label ?? `${minutes}% assistido`}
          </Text>
          {pct >= 0.9 && (
            <View style={[styles.doneTag, { backgroundColor: `${colors.accentGreen}18`, borderColor: `${colors.accentGreen}30` }]}>
              <Text style={[styles.doneText, { color: colors.accentGreen }]}>Concluído</Text>
            </View>
          )}
        </View>
      )}
      <View
        style={[
          styles.track,
          { height, borderRadius: height / 2, backgroundColor: colors.border },
        ]}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${pct * 100}%` as any,
              height,
              borderRadius: height / 2,
              backgroundColor: pct >= 0.9 ? colors.accentGreen : accent,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 5,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 11,
    fontWeight: "500",
  },
  track: {
    overflow: "hidden",
    width: "100%",
  },
  fill: {},
  doneTag: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  doneText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
