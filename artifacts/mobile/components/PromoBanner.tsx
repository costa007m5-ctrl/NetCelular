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
  variant?: "default" | "dark" | "glass";
  count?: number;
}

export function PromoBanner({
  icon = "zap",
  title,
  subtitle,
  actionLabel,
  onPress,
  onDismiss,
  gradient,
  variant = "default",
  count,
}: PromoBannerProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  const onPressIn = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 32 }),
      Animated.timing(glow, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const onPressOut = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }),
      Animated.timing(glow, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const grad = gradient ?? [colors.primary, colors.primaryDim];
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] });

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

          <View style={styles.shimmer1} />
          <View style={styles.shimmer2} />

          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "#fff", borderRadius: 18, opacity: glowOpacity },
            ]}
            pointerEvents="none"
          />

          <View style={[styles.iconWrap, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
            <Feather name={icon} size={22} color="#fff" />
          </View>

          <View style={styles.content}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{title}</Text>
              {count !== undefined && (
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{count}</Text>
                </View>
              )}
            </View>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>

          {actionLabel && (
            <View style={styles.actionBtn}>
              <Text style={[styles.actionText, { color: grad[0] }]}>{actionLabel}</Text>
              <Feather name="chevron-right" size={12} color={grad[0]} />
            </View>
          )}

          {onDismiss && (
            <Pressable onPress={onDismiss} style={styles.dismiss} hitSlop={12}>
              <View style={styles.dismissCircle}>
                <Feather name="x" size={12} color="rgba(255,255,255,0.7)" />
              </View>
            </Pressable>
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
}

interface MiniStatBannerProps {
  stats: Array<{ label: string; value: string; icon: keyof typeof Feather.glyphMap; color: string }>;
}

export function MiniStatBanner({ stats }: MiniStatBannerProps) {
  return (
    <View style={statStyles.wrap}>
      {stats.map((stat, i) => (
        <View key={i} style={[statStyles.item, i < stats.length - 1 && statStyles.itemBorder]}>
          <View style={[statStyles.iconWrap, { backgroundColor: `${stat.color}18` }]}>
            <Feather name={stat.icon} size={14} color={stat.color} />
          </View>
          <Text style={statStyles.value}>{stat.value}</Text>
          <Text style={statStyles.label}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    marginBottom: 26,
  },
  container: {
    borderRadius: 18,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    gap: 14,
    minHeight: 76,
  },
  shimmer1: {
    position: "absolute",
    top: -30,
    right: -20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  shimmer2: {
    position: "absolute",
    bottom: -25,
    left: 80,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  subtitle: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 17,
  },
  countBadge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  countText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  actionBtn: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 8,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "800",
  },
  dismiss: {
    position: "absolute",
    top: 10,
    right: 10,
    padding: 2,
  },
  dismissCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
});

const statStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 26,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  item: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    gap: 5,
  },
  itemBorder: {
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.07)",
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  label: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
