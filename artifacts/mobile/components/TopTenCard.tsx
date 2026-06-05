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
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ContentItem } from "@/constants/content";

interface TopTenCardProps {
  item: ContentItem;
  rank: number;
  onPress?: () => void;
}

const RANK_GRADIENT: Record<number, [string, string]> = {
  1: ["#FFD700", "#E09000"],
  2: ["#C8C8C8", "#909090"],
  3: ["#CD7F32", "#7B4A1E"],
};

export function TopTenCard({ item, rank, onPress }: TopTenCardProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;
  const [imgError, setImgError] = useState(false);

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 22, bounciness: 5 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }).start();

  const isTop3 = rank <= 3;
  const rankGrad = RANK_GRADIENT[rank];

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[styles.container, { transform: [{ scale }] }]}>
        {/* Big rank number behind card */}
        <Text
          style={[
            styles.rankShadow,
            { color: colors.cardElevated },
          ]}
        >
          {rank}
        </Text>

        <View style={[styles.cardWrap, { borderRadius: colors.radius }]}>
          {!imgError && item.posterPath ? (
            <Image
              source={{ uri: item.posterPath }}
              style={[styles.image, { borderRadius: colors.radius }]}
              contentFit="cover"
              transition={180}
              cachePolicy="memory-disk"
              onError={() => setImgError(true)}
            />
          ) : (
            <LinearGradient
              colors={["#1a1525", "#0d0d18"]}
              style={[styles.image, { borderRadius: colors.radius, alignItems: "center", justifyContent: "center" }]}
            >
              <Feather name="film" size={24} color="#333348" />
            </LinearGradient>
          )}

          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.7)"]}
            style={[styles.gradient, { borderRadius: colors.radius }]}
          />

          {isTop3 && rankGrad ? (
            <LinearGradient
              colors={rankGrad}
              style={styles.topBadge}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Feather name="award" size={8} color="#000" />
              <Text style={styles.topBadgeText}>#{rank}</Text>
            </LinearGradient>
          ) : (
            <View style={[styles.rankBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.rankBadgeText}>#{rank}</Text>
            </View>
          )}

          {item.rating > 0 && (
            <View style={[styles.ratingBadge, { backgroundColor: colors.ratingGoldBg }]}>
              <Feather name="star" size={8} color={colors.ratingGold} />
              <Text style={[styles.ratingText, { color: colors.ratingGold }]}>
                {item.rating.toFixed(1)}
              </Text>
            </View>
          )}
        </View>

        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {item.year} · {item.type === "series" ? "Série" : "Filme"}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const CARD_W = 112;
const CARD_H = 162;

const styles = StyleSheet.create({
  container: {
    width: CARD_W + 32,
    marginRight: 0,
    paddingLeft: 24,
    alignItems: "flex-start",
  },
  rankShadow: {
    fontSize: 86,
    fontWeight: "900",
    lineHeight: 88,
    letterSpacing: -5,
    position: "absolute",
    bottom: 30,
    left: -4,
    zIndex: 0,
  },
  cardWrap: {
    width: CARD_W,
    height: CARD_H,
    overflow: "hidden",
    backgroundColor: "#0e0e16",
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  image: {
    width: "100%",
    height: "100%",
  },
  gradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "60%",
  },
  topBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  topBadgeText: {
    color: "#000",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  rankBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  rankBadgeText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  ratingBadge: {
    position: "absolute",
    bottom: 6,
    left: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  ratingText: {
    fontSize: 9,
    fontWeight: "700",
  },
  title: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 8,
    lineHeight: 15,
    zIndex: 1,
  },
  meta: {
    fontSize: 10,
    fontWeight: "400",
    marginTop: 2,
    zIndex: 1,
  },
});
