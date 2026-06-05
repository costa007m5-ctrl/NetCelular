import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface InfoItem {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  accent?: string;
}

interface ContentInfoRowProps {
  items: InfoItem[];
  style?: any;
}

export function ContentInfoRow({ items, style }: ContentInfoRowProps) {
  const colors = useColors();

  return (
    <View style={[styles.row, style]}>
      {items.map((item, idx) => (
        <React.Fragment key={item.label}>
          <View style={styles.item}>
            <Feather
              name={item.icon}
              size={12}
              color={item.accent ?? colors.mutedForeground}
            />
            <View style={styles.texts}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                {item.label}
              </Text>
              <Text
                style={[
                  styles.value,
                  { color: item.accent ?? colors.foreground },
                ]}
              >
                {item.value}
              </Text>
            </View>
          </View>
          {idx < items.length - 1 && (
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  texts: {
    gap: 1,
  },
  label: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  value: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  divider: {
    width: 1,
    height: 28,
    borderRadius: 1,
  },
});
