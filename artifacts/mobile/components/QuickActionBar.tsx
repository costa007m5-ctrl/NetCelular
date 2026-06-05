import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";

interface QuickAction {
  id: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  badge?: string;
}

interface QuickActionBarProps {
  actions: QuickAction[];
  onPress: (action: QuickAction) => void;
}

export function QuickActionBar({ actions, onPress }: QuickActionBarProps) {
  const colors = useColors();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {actions.map((action) => (
        <Pressable
          key={action.id}
          onPress={() => onPress(action)}
          style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <LinearGradient
            colors={[`${action.color}22`, `${action.color}0a`]}
            style={[styles.btnInner, { borderColor: `${action.color}30` }]}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${action.color}20` }]}>
              <Feather name={action.icon} size={16} color={action.color} />
            </View>
            <Text style={[styles.label, { color: colors.foreground }]}>
              {action.label}
            </Text>
            {action.badge && (
              <View style={[styles.badge, { backgroundColor: action.color }]}>
                <Text style={styles.badgeText}>{action.badge}</Text>
              </View>
            )}
          </LinearGradient>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    gap: 10,
    paddingVertical: 2,
  },
  btn: {
    borderRadius: 12,
    overflow: "hidden",
  },
  btnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 12,
    minWidth: 110,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },
});
