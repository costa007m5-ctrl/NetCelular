import React, { useRef } from "react";
import { Animated, Platform, Pressable, Share, StyleSheet, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface ShareButtonProps {
  title: string;
  message?: string;
  url?: string;
  label?: string;
  showLabel?: boolean;
  size?: number;
  variant?: "icon" | "pill" | "outline";
}

export function ShareButton({
  title,
  message,
  url,
  label = "Compartilhar",
  showLabel = false,
  size = 18,
  variant = "icon",
}: ShareButtonProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;

  const handleShare = async () => {
    try {
      const content: any = { title };
      if (message) content.message = message;
      if (url && Platform.OS === "ios") content.url = url;
      await Share.share(content);
    } catch {}
  };

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, speed: 30 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }).start();

  if (variant === "pill") {
    return (
      <Pressable
        onPress={handleShare}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: colors.muted, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Feather name="share-2" size={13} color={colors.mutedForeground} />
        <Text style={[styles.pillText, { color: colors.mutedForeground }]}>{label}</Text>
      </Pressable>
    );
  }

  if (variant === "outline") {
    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPress={handleShare}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          style={[styles.outline, { borderColor: colors.border }]}
        >
          <Feather name="share-2" size={size} color={colors.foreground} />
          {showLabel && (
            <Text style={[styles.outlineText, { color: colors.foreground }]}>{label}</Text>
          )}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable onPress={handleShare} onPressIn={onPressIn} onPressOut={onPressOut}>
        <Feather name="share-2" size={size} color={colors.mutedForeground} />
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
    fontWeight: "600",
  },
  outline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  outlineText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
