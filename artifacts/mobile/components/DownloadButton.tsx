import React, { useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

type DownloadState = "idle" | "downloading" | "done" | "error";

interface DownloadButtonProps {
  state?: DownloadState;
  progress?: number;
  onPress?: () => void;
  label?: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export function DownloadButton({
  state = "idle",
  progress = 0,
  onPress,
  label = "Baixar",
  showLabel = true,
  size = "md",
}: DownloadButtonProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;
  const rotation = useRef(new Animated.Value(0)).current;

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 30 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }).start();

  const iconSize = size === "sm" ? 14 : size === "lg" ? 22 : 18;
  const fontSize = size === "sm" ? 11 : size === "lg" ? 15 : 13;

  const iconName: any =
    state === "downloading" ? "loader" :
    state === "done" ? "check-circle" :
    state === "error" ? "x-circle" :
    "download";

  const iconColor =
    state === "done" ? colors.accentGreen :
    state === "error" ? colors.primary :
    colors.foreground;

  const bgColor =
    state === "done" ? `${colors.accentGreen}14` :
    state === "error" ? `${colors.primary}14` :
    colors.muted;

  const labelText =
    state === "downloading" ? `${Math.round(progress * 100)}%` :
    state === "done" ? "Baixado" :
    state === "error" ? "Erro" :
    label;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={state === "downloading" ? undefined : onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [
          styles.btn,
          {
            backgroundColor: bgColor,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        {state === "downloading" && (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.progressFill,
              {
                width: `${progress * 100}%` as any,
                backgroundColor: `${colors.primary}18`,
                borderRadius: 12,
              },
            ]}
          />
        )}
        <Feather name={iconName} size={iconSize} color={iconColor} />
        {showLabel && (
          <Text style={[styles.label, { fontSize, color: iconColor }]}>
            {labelText}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    overflow: "hidden",
    position: "relative",
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  label: {
    fontWeight: "700",
  },
});
