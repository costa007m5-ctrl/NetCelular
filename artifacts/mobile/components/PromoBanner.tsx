import React, { useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";

interface PromoBannerProps {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onPress?: () => void;
  onDismiss?: () => void;
  gradient?: [string, string];
}

export function PromoBanner({
  icon = "zap",
  title,
  subtitle,
  actionLabel,
  onPress,
  onDismiss,
  gradient,
}: PromoBannerProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }).start();

  const grad = gradient ?? [colors.primary, colors.primaryDim];

  return (
    <View style={styles.wrap}>
      <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
        <Animated.View style={[styles.container, { transform: [{ scale }] }]}>
          <LinearGradient
            colors={[grad[0], grad[1]]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <View style={styles.shimmer} />

          <View style={[styles.iconWrap, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
            <Feather name={icon} size={22} color="#fff" />
          </View>

          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>

          {actionLabel && (
            <View style={styles.actionBtn}>
              <Text style={[styles.actionText, { color: grad[0] }]}>{actionLabel}</Text>
            </View>
          )}

          {onDismiss && (
            <Pressable onPress={onDismiss} style={styles.dismiss} hitSlop={10}>
              <Feather name="x" size={14} color="rgba(255,255,255,0.6)" />
            </Pressable>
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  container: {
    borderRadius: 16,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
    minHeight: 72,
  },
  shimmer: {
    position: "absolute",
    top: -20,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  content: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  subtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 17,
  },
  actionBtn: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexShrink: 0,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  dismiss: {
    position: "absolute",
    top: 8,
    right: 10,
    padding: 4,
  },
});
