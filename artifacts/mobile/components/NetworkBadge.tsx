import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useColors } from "@/hooks/useColors";

interface NetworkBadgeProps {
  name: string;
  logoPath?: string | null;
  size?: "sm" | "md";
}

export function NetworkBadge({ name, logoPath, size = "sm" }: NetworkBadgeProps) {
  const colors = useColors();
  const logoUrl = logoPath
    ? `https://image.tmdb.org/t/p/${size === "md" ? "w92" : "w45"}${logoPath}`
    : null;

  if (logoUrl) {
    return (
      <View style={[styles.imgWrap, { backgroundColor: "#fff" }]}>
        <Image
          source={{ uri: logoUrl }}
          style={size === "md" ? styles.logoMd : styles.logoSm}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      </View>
    );
  }

  return (
    <View style={[styles.text, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.foreground, fontSize: size === "md" ? 11 : 9 }]}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  imgWrap: {
    borderRadius: 6,
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  logoSm: {
    width: 32,
    height: 18,
  },
  logoMd: {
    width: 52,
    height: 28,
  },
  text: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  label: {
    fontWeight: "700",
    letterSpacing: -0.2,
  },
});
