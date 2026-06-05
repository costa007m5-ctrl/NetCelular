import React, { useRef } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface Tab {
  id: string;
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  count?: number;
}

interface CategoryTabProps {
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
  accentColor?: string;
  scrollable?: boolean;
  style?: any;
}

export function CategoryTab({
  tabs,
  activeId,
  onSelect,
  accentColor,
  scrollable = true,
  style,
}: CategoryTabProps) {
  const colors = useColors();
  const accent = accentColor ?? colors.primary;

  const items = tabs.map((tab) => {
    const isActive = tab.id === activeId;
    return (
      <Pressable
        key={tab.id}
        onPress={() => onSelect(tab.id)}
        style={({ pressed }) => [
          styles.tab,
          {
            backgroundColor: isActive ? accent : "rgba(255,255,255,0.06)",
            borderColor: isActive ? accent : "rgba(255,255,255,0.10)",
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        {tab.icon && (
          <Feather
            name={tab.icon}
            size={12}
            color={isActive ? "#fff" : colors.mutedForeground}
          />
        )}
        <Text
          style={[
            styles.tabLabel,
            { color: isActive ? "#fff" : colors.mutedForeground },
          ]}
        >
          {tab.label}
        </Text>
        {tab.count !== undefined && tab.count > 0 && (
          <View
            style={[
              styles.count,
              { backgroundColor: isActive ? "rgba(255,255,255,0.25)" : `${accent}20` },
            ]}
          >
            <Text
              style={[styles.countText, { color: isActive ? "#fff" : accent }]}
            >
              {tab.count > 99 ? "99+" : tab.count}
            </Text>
          </View>
        )}
      </Pressable>
    );
  });

  if (!scrollable) {
    return (
      <View style={[styles.row, style]}>
        {items}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.scroll, style]}
    >
      {items}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  scroll: {
    gap: 8,
    paddingVertical: 2,
    paddingHorizontal: 20,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  count: {
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center",
  },
  countText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
