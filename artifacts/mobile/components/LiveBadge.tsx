import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

interface LiveBadgeProps {
  label?: string;
  size?: "sm" | "md";
  pulse?: boolean;
}

export function LiveBadge({ label = "AO VIVO", size = "md", pulse = true }: LiveBadgeProps) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const dotSize = size === "sm" ? 5 : 7;
  const fontSize = size === "sm" ? 8 : 9;
  const px = size === "sm" ? 6 : 8;
  const py = size === "sm" ? 2 : 3;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: "rgba(220,38,38,0.18)",
          borderColor: "rgba(220,38,38,0.4)",
          paddingHorizontal: px,
          paddingVertical: py,
        },
      ]}
    >
      <Animated.View
        style={[styles.dot, { width: dotSize, height: dotSize, borderRadius: dotSize / 2, opacity }]}
      />
      <Text style={[styles.label, { fontSize }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  dot: {
    backgroundColor: "#dc2626",
  },
  label: {
    color: "#dc2626",
    fontWeight: "800",
    letterSpacing: 0.8,
  },
});
