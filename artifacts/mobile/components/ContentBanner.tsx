import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ContentItem } from "@/constants/content";

interface ContentBannerProps {
  item: ContentItem;
  badge?: string;
  badgeColor?: string;
  onPress?: () => void;
  height?: number;
}

export function ContentBanner({
  item,
  badge,
  badgeColor,
  onPress,
  height = 200,
}: ContentBannerProps) {
  const colors = useColors();
  const [imgError, setImgError] = useState(false);
  const accent = badgeColor ?? colors.primary;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.container,
          { height, borderRadius: 18, opacity: pressed ? 0.9 : 1 },
        ]}
      >
        {!imgError && (item.backdropPath || item.posterPath) ? (
          <Image
            source={{ uri: item.backdropPath || item.posterPath }}
            style={[styles.image, { borderRadius: 18 }]}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            onError={() => setImgError(true)}
          />
        ) : (
          <LinearGradient
            colors={["#1a0a14", "#050508"]}
            style={[styles.image, { borderRadius: 18 }]}
          />
        )}

        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.85)"]}
          locations={[0.3, 1]}
          style={[styles.gradient, { borderRadius: 18 }]}
        />

        {badge && (
          <View style={[styles.badge, { backgroundColor: accent }]}>
            {badge === "AO VIVO" && (
              <View style={[styles.liveDot, { backgroundColor: "#fff" }]} />
            )}
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}

        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.meta}>
            <Text style={styles.metaText}>{item.year}</Text>
            {item.duration && (
              <Text style={styles.metaText}>· {item.duration}</Text>
            )}
            {item.rating > 0 && (
              <View style={styles.ratingWrap}>
                <Feather name="star" size={9} color="#f59e0b" />
                <Text style={[styles.metaText, { color: "#f59e0b" }]}>
                  {item.rating.toFixed(1)}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.playCircle}>
          <Feather name="play" size={18} color="#fff" />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  container: {
    overflow: "hidden",
    backgroundColor: "#0e0e16",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  badge: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  content: {
    position: "absolute",
    bottom: 14,
    left: 14,
    right: 64,
    gap: 5,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.4,
    lineHeight: 22,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
    fontWeight: "500",
  },
  ratingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  playCircle: {
    position: "absolute",
    bottom: 14,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(229,9,20,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
});
