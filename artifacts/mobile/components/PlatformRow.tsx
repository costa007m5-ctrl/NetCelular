import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";

interface Platform {
  id: string | number;
  name: string;
  logoPath?: string | null;
  color?: string;
  link?: string;
}

interface PlatformRowProps {
  title?: string;
  platforms: Platform[];
  onPress?: (platform: Platform) => void;
}

export function PlatformRow({ title, platforms, onPress }: PlatformRowProps) {
  const colors = useColors();

  return (
    <View style={styles.wrap}>
      {title && (
        <Text style={[styles.title, { color: colors.mutedForeground }]}>
          {title.toUpperCase()}
        </Text>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {platforms.map((platform) => {
          const logoUrl = platform.logoPath
            ? `https://image.tmdb.org/t/p/w92${platform.logoPath}`
            : null;
          const accent = platform.color ?? colors.primary;
          return (
            <Pressable
              key={platform.id}
              onPress={() => onPress?.(platform)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: colors.card,
                  borderColor: `${accent}25`,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <LinearGradient
                colors={[`${accent}10`, "transparent"]}
                style={StyleSheet.absoluteFill}
              />
              {logoUrl ? (
                <Image
                  source={{ uri: logoUrl }}
                  style={styles.logo}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              ) : (
                <Text style={[styles.chipName, { color: accent }]} numberOfLines={1}>
                  {platform.name}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    marginBottom: 24,
  },
  title: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    paddingHorizontal: 20,
  },
  scroll: {
    paddingHorizontal: 20,
    gap: 10,
    paddingVertical: 2,
  },
  chip: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
    overflow: "hidden",
  },
  logo: {
    width: 64,
    height: 24,
  },
  chipName: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
});
