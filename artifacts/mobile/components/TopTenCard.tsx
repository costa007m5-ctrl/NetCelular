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

const RANK_CONFIGS: Record<number, { gradient: [string, string]; glow: string; icon?: string }> = {
  1: { gradient: ["#FFD700", "#B8860B"], glow: "rgba(255,215,0,0.35)", icon: "award" },
  2: { gradient: ["#E8E8E8", "#A0A0A0"], glow: "rgba(220,220,220,0.25)", icon: "award" },
  3: { gradient: ["#CD7F32", "#8B4513"], glow: "rgba(205,127,50,0.25)", icon: "award" },
};

function OutlineNumber({ rank, color }: { rank: number; color: string }) {
  return (
    <View style={styles.rankNumWrap}>
      <Text style={[styles.rankShadow, { color: "rgba(255,255,255,0.03)" }]}>{rank}</Text>
      <Text style={[styles.rankOutline, { color: rank <= 3 ? color : "rgba(255,255,255,0.06)" }]}>{rank}</Text>
    </View>
  );
}

function TrendingArrow({ rank }: { rank: number }) {
  if (rank > 5) return null;
  return (
    <View style={styles.trendingBadge}>
      <Feather name="trending-up" size={8} color="#22c55e" />
      <Text style={styles.trendingText}>TREND</Text>
    </View>
  );
}

export function TopTenCard({ item, rank, onPress }: TopTenCardProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;
  const [imgError, setImgError] = useState(false);

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 24, bounciness: 4 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 5 }).start();

  const isTop3 = rank <= 3;
  const rankCfg = RANK_CONFIGS[rank];
  const glowColor = rankCfg?.glow ?? "transparent";

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[styles.container, { transform: [{ scale }] }]}>
        <OutlineNumber
          rank={rank}
          color={rankCfg?.gradient?.[0] ?? "#fff"}
        />

        <View style={[styles.cardWrap, { borderRadius: colors.radius + 2 }]}>
          {isTop3 && (
            <View style={[styles.cardGlow, { shadowColor: glowColor }]} />
          )}

          {!imgError && item.posterPath ? (
            <Image
              source={{ uri: item.posterPath }}
              style={[styles.image, { borderRadius: colors.radius + 2 }]}
              contentFit="cover"
              transition={220}
              cachePolicy="memory-disk"
              onError={() => setImgError(true)}
            />
          ) : (
            <LinearGradient
              colors={["#1a1525", "#0d0d18"]}
              style={[styles.image, { borderRadius: colors.radius + 2, alignItems: "center", justifyContent: "center" }]}
            >
              <Feather name="film" size={26} color="#333348" />
            </LinearGradient>
          )}

          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.78)"]}
            style={[styles.gradient, { borderRadius: colors.radius + 2 }]}
          />

          {isTop3 && rankCfg ? (
            <LinearGradient
              colors={rankCfg.gradient}
              style={styles.topBadge}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Feather name={rankCfg.icon as any} size={9} color="#000" />
              <Text style={styles.topBadgeText}>#{rank}</Text>
            </LinearGradient>
          ) : (
            <View style={[styles.rankBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.rankBadgeText}>#{rank}</Text>
            </View>
          )}

          <TrendingArrow rank={rank} />

          {item.rating > 0 && (
            <View style={styles.ratingBadge}>
              <Feather name="star" size={8} color="#f59e0b" />
              <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}

          <View style={styles.typeChip}>
            <Feather
              name={item.type === "series" ? "tv" : "film"}
              size={7}
              color="rgba(255,255,255,0.6)"
            />
          </View>
        </View>

        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {item.year}
          </Text>
          <View style={styles.metaDot} />
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {item.type === "series" ? "Série" : "Filme"}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const CARD_W = 118;
const CARD_H = 168;

const styles = StyleSheet.create({
  container: {
    width: CARD_W + 36,
    marginRight: 0,
    paddingLeft: 26,
    alignItems: "flex-start",
  },
  rankNumWrap: {
    position: "absolute",
    bottom: 34,
    left: -4,
    zIndex: 0,
  },
  rankShadow: {
    fontSize: 96,
    fontWeight: "900",
    lineHeight: 98,
    letterSpacing: -7,
    position: "absolute",
    bottom: 0,
    left: 0,
  },
  rankOutline: {
    fontSize: 96,
    fontWeight: "900",
    lineHeight: 98,
    letterSpacing: -7,
    opacity: 0.9,
  },
  cardWrap: {
    width: CARD_W,
    height: CARD_H,
    overflow: "hidden",
    backgroundColor: "#0a0a14",
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.55,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
    }),
  },
  cardGlow: {
    position: "absolute",
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 18,
    ...Platform.select({
      ios: {
        shadowOpacity: 0.7,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 18,
      },
    }),
    zIndex: -1,
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
    height: "65%",
  },
  topBadge: {
    position: "absolute",
    top: 7,
    right: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
  },
  topBadgeText: {
    color: "#000",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  rankBadge: {
    position: "absolute",
    top: 7,
    right: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rankBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  trendingBadge: {
    position: "absolute",
    top: 7,
    left: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(34,197,94,0.18)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.35)",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  trendingText: {
    color: "#22c55e",
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  ratingBadge: {
    position: "absolute",
    bottom: 7,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: "rgba(245,158,11,0.18)",
  },
  ratingText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#f59e0b",
  },
  typeChip: {
    position: "absolute",
    bottom: 7,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 4,
    width: 17,
    height: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.1)",
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 9,
    lineHeight: 15,
    zIndex: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
  },
  meta: {
    fontSize: 10,
    fontWeight: "400",
    zIndex: 1,
  },
  metaDot: {
    width: 2.5,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
});
