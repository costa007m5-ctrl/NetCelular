import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onDismiss?: () => void;
  visible: boolean;
}

const TOAST_CONFIG: Record<ToastType, { icon: keyof typeof Feather.glyphMap; color: string }> = {
  success: { icon: "check-circle", color: "#22c55e" },
  error: { icon: "x-circle", color: "#e50914" },
  info: { icon: "info", color: "#3b82f6" },
  warning: { icon: "alert-triangle", color: "#f59e0b" },
};

export function ToastNotification({
  message,
  type = "info",
  duration = 3000,
  onDismiss,
  visible,
}: ToastProps) {
  const colors = useColors();
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const config = TOAST_CONFIG[type];

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          speed: 18,
          bounciness: 8,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -80,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }),
        ]).start(() => onDismiss?.());
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.cardElevated,
          borderColor: `${config.color}30`,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${config.color}18` }]}>
        <Feather name={config.icon} size={16} color={config.color} />
      </View>
      <Text style={[styles.message, { color: colors.foreground }]} numberOfLines={2}>
        {message}
      </Text>
      <Pressable onPress={onDismiss} hitSlop={8}>
        <Feather name="x" size={14} color={colors.mutedForeground} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    zIndex: 9999,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
});
