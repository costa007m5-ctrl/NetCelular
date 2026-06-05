import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useColors } from "@/hooks/useColors";

interface GlassCardProps {
  children: React.ReactNode;
  style?: any;
  onPress?: () => void;
  radius?: number;
  intensity?: number;
  gradient?: boolean;
  gradientColors?: [string, string];
  border?: boolean;
  padding?: number;
}

export function GlassCard({
  children,
  style,
  onPress,
  radius,
  intensity = 20,
  gradient = false,
  gradientColors,
  border = true,
  padding = 16,
}: GlassCardProps) {
  const colors = useColors();
  const r = radius ?? colors.radius;
  const gc = gradientColors ?? [`${colors.primary}18`, "transparent"];

  const content = (
    <View style={[styles.container, { borderRadius: r, padding, overflow: "hidden" }, style]}>
      {Platform.OS === "ios" ? (
        <BlurView
          intensity={intensity}
          style={StyleSheet.absoluteFill}
          tint="dark"
        />
      ) : (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassBg }]}
        />
      )}

      {gradient && (
        <LinearGradient
          colors={gc}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      )}

      {border && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: r, borderWidth: 1, borderColor: colors.glassBorder },
          ]}
          pointerEvents="none"
        />
      )}

      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
});
