import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { stringToColor } from "@/lib/color-utils";

interface UserAvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
  shape?: "circle" | "rounded";
  border?: boolean;
  borderColor?: string;
}

export function UserAvatar({
  uri,
  name,
  size = 40,
  shape = "circle",
  border = false,
  borderColor,
}: UserAvatarProps) {
  const colors = useColors();
  const [imgError, setImgError] = useState(false);
  const borderRadius = shape === "circle" ? size / 2 : size * 0.25;
  const accent = name ? stringToColor(name) : colors.primary;
  const fontSize = size * 0.38;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius,
          borderWidth: border ? 2 : 0,
          borderColor: borderColor ?? colors.border,
          overflow: "hidden",
        },
      ]}
    >
      {uri && !imgError ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          onError={() => setImgError(true)}
        />
      ) : (
        <LinearGradient
          colors={[accent, `${accent}88`]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={[styles.letter, { fontSize, lineHeight: size }]}>
            {(name?.[0] ?? "?").toUpperCase()}
          </Text>
        </LinearGradient>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  letter: {
    color: "#fff",
    fontWeight: "800",
    textAlign: "center",
  },
});
