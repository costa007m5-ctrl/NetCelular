import React, { useRef, useState } from "react";
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ContentItem } from "@/constants/content";

interface TopTenCardProps {
  item: ContentItem;
  rank: number;
  onPress?: () => void;
}

export function TopTenCard({ item, rank, onPress }: TopTenCardProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;
  const [imgError, setImgError] = useState(false);

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[styles.container, { transform: [{ scale }] }]}>
        <Text style={[styles.rank, { color: colors.card }]}>{rank}</Text>
        <View style={styles.cardWrap}>
          {!imgError ? (
            <Image
              source={{ uri: item.posterPath }}
              style={[styles.image, { borderRadius: colors.radius }]}
              resizeMode="cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <LinearGradient
              colors={["#1e1e1e", "#2a1a1a"]}
              style={[styles.image, { borderRadius: colors.radius, alignItems: "center", justifyContent: "center" }]}
            >
              <Feather name="film" size={24} color="#444" />
            </LinearGradient>
          )}
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={styles.badgeText}>TOP {rank}</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginRight: 4,
  },
  rank: {
    fontSize: 80,
    fontWeight: "900",
    lineHeight: 84,
    letterSpacing: -4,
    width: 52,
    textAlign: "right",
    color: "#1a1a1a",
    textShadowColor: "rgba(255,255,255,0.05)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  cardWrap: {
    position: "relative",
  },
  image: {
    width: 110,
    height: 160,
    overflow: "hidden",
  },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
