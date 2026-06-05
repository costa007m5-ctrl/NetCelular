import React, { useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface WatchlistButtonProps {
  inList: boolean;
  onToggle: () => void;
  loading?: boolean;
  variant?: "icon" | "pill" | "full";
  size?: number;
}

export function WatchlistButton({
  inList,
  onToggle,
  loading = false,
  variant = "pill",
  size = 18,
}: WatchlistButtonProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;
  const [wiggled, setWiggled] = useState(false);

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, speed: 30 }).start();

  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }).start();

  const handlePress = () => {
    onToggle();
    if (!inList) {
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.2, useNativeDriver: true, speed: 40 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }),
      ]).start();
    }
  };

  const iconName = inList ? "check-circle" : "plus-circle";
  const accent = inList ? colors.accentGreen : colors.primary;
  const label = inList ? "Na lista" : "Adicionar";

  if (variant === "icon") {
    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPress={handlePress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={loading}
        >
          <Feather
            name={iconName}
            size={size}
            color={loading ? colors.mutedForeground : accent}
          />
        </Pressable>
      </Animated.View>
    );
  }

  if (variant === "full") {
    return (
      <Animated.View style={[{ transform: [{ scale }] }, styles.fullWrap]}>
        <Pressable
          onPress={handlePress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={loading}
          style={[
            styles.fullBtn,
            {
              backgroundColor: inList ? `${colors.accentGreen}18` : colors.primary,
              borderColor: inList ? colors.accentGreen : colors.primary,
            },
          ]}
        >
          <Feather
            name={iconName}
            size={16}
            color={inList ? colors.accentGreen : "#fff"}
          />
          <Text
            style={[
              styles.fullLabel,
              { color: inList ? colors.accentGreen : "#fff" },
            ]}
          >
            {label}
          </Text>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={loading}
        style={[
          styles.pill,
          {
            backgroundColor: inList ? `${colors.accentGreen}14` : `${colors.primary}14`,
            borderColor: inList ? `${colors.accentGreen}30` : `${colors.primary}30`,
          },
        ]}
      >
        <Feather
          name={iconName}
          size={13}
          color={loading ? colors.mutedForeground : accent}
        />
        <Text style={[styles.pillText, { color: accent }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  fullWrap: {
    flex: 1,
  },
  fullBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 13,
  },
  fullLabel: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
