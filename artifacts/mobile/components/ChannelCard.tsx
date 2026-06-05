import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { LiveBadge } from "./LiveBadge";
import { useColors } from "@/hooks/useColors";

interface ChannelCardProps {
  name: string;
  logoUrl?: string | null;
  currentProgram?: string;
  isLive?: boolean;
  color?: string;
  onPress?: () => void;
  width?: number;
  height?: number;
}

export function ChannelCard({
  name,
  logoUrl,
  currentProgram,
  isLive = true,
  color = "#e50914",
  onPress,
  width = 140,
  height = 80,
}: ChannelCardProps) {
  const colors = useColors();
  const [logoError, setLogoError] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          width,
          height,
          borderRadius: 14,
          borderColor: `${color}30`,
          backgroundColor: colors.card,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <LinearGradient
        colors={[`${color}14`, "transparent"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {isLive && (
        <View style={styles.liveWrap}>
          <LiveBadge size="sm" />
        </View>
      )}

      <View style={styles.center}>
        {logoUrl && !logoError ? (
          <Image
            source={{ uri: logoUrl }}
            style={styles.logo}
            contentFit="contain"
            cachePolicy="memory-disk"
            onError={() => setLogoError(true)}
          />
        ) : (
          <View style={[styles.logoFallback, { backgroundColor: `${color}20` }]}>
            <Feather name="tv" size={20} color={color} />
            <Text style={[styles.logoName, { color }]} numberOfLines={1}>
              {name.slice(0, 8)}
            </Text>
          </View>
        )}
      </View>

      {currentProgram && (
        <Text style={[styles.program, { color: colors.mutedForeground }]} numberOfLines={1}>
          {currentProgram}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    overflow: "hidden",
    justifyContent: "space-between",
    padding: 10,
  },
  liveWrap: {
    alignSelf: "flex-end",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 80,
    height: 32,
  },
  logoFallback: {
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    padding: 6,
  },
  logoName: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  program: {
    fontSize: 9,
    fontWeight: "500",
    textAlign: "center",
  },
});
