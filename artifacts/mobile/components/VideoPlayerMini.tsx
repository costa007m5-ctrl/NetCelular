import React, { useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";

interface MiniPlayerProps {
  title: string;
  subtitle?: string;
  posterPath?: string;
  progress?: number;
  onDismiss?: () => void;
  tmdbId?: number;
  tmdbType?: "movie" | "tv";
}

export function VideoPlayerMini({
  title,
  subtitle,
  posterPath,
  progress = 0,
  onDismiss,
  tmdbId,
  tmdbType = "movie",
}: MiniPlayerProps) {
  const colors = useColors();
  const router = useRouter();
  const translateY = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(true);

  const handleDismiss = () => {
    Animated.timing(translateY, {
      toValue: 120,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      onDismiss?.();
    });
  };

  const handleResume = () => {
    if (tmdbId) {
      router.push({
        pathname: "/detail",
        params: { type: tmdbType, id: String(tmdbId), title },
      });
    }
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: colors.borderLight,
          transform: [{ translateY }],
          ...Platform.select({
            ios: {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
            },
            android: { elevation: 10 },
          }),
        },
      ]}
    >
      <Pressable onPress={handleResume} style={styles.content}>
        {posterPath ? (
          <Image
            source={{ uri: posterPath }}
            style={[styles.thumb, { borderRadius: colors.radius - 4 }]}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.thumbFallback, { backgroundColor: colors.muted, borderRadius: colors.radius - 4 }]}>
            <Feather name="film" size={20} color={colors.mutedForeground} />
          </View>
        )}

        <View style={styles.info}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(progress * 100, 100)}%` as any, backgroundColor: colors.primary },
              ]}
            />
          </View>
        </View>

        <View style={styles.actions}>
          <View style={[styles.playBtn, { backgroundColor: colors.primary }]}>
            <Feather name="play" size={16} color="#fff" />
          </View>
        </View>
      </Pressable>

      <Pressable onPress={handleDismiss} style={styles.close} hitSlop={8}>
        <Feather name="x" size={14} color={colors.mutedForeground} />
      </Pressable>

      {progress > 0 && (
        <LinearGradient
          colors={[`${colors.primary}30`, "transparent"]}
          style={styles.progressGlow}
          start={{ x: 0, y: 0 }}
          end={{ x: `${progress}` as any, y: 0 }}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 90,
    left: 16,
    right: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  thumb: {
    width: 52,
    height: 72,
  },
  thumbFallback: {
    width: 52,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "400",
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    marginTop: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  actions: {
    gap: 8,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  close: {
    position: "absolute",
    top: 8,
    right: 10,
    padding: 4,
  },
  progressGlow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
  },
});
