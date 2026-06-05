import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface OfflineBarProps {
  visible: boolean;
}

export function OfflineBar({ visible }: OfflineBarProps) {
  const colors = useColors();
  const translateY = useRef(new Animated.Value(-48)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : -48,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  }, [visible]);

  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: "#1f2937", transform: [{ translateY }] },
      ]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <Feather name="wifi-off" size={14} color="#fbbf24" />
      <Text style={styles.text}>Sem conexão — modo offline</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    zIndex: 9999,
  },
  text: {
    color: "#fbbf24",
    fontSize: 13,
    fontWeight: "600",
  },
});
