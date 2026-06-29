import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
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

const RANK_CFG: Record<number, { colors: [string, string]; glow: string; label: string }> = {
  1: { colors: ["#FFD700", "#B8860B"], glow: "rgba(255,215,0,0.4)", label: "🥇" },
  2: { colors: ["#E8E8E8", "#A0A0A0"], glow: "rgba(220,220,220,0.3)", label: "🥈" },
  3: { colors: ["#CD7F32", "#8B4513"], glow: "rgba(205,127,50,0.3)", label: "🥉" },
};

/* ── Giant outline rank number ─────────────────────────────── */
function OutlineNumber({ rank }: { rank: number }) {
  const cfg = RANK_CFG[rank];
  const color = cfg ? cfg.colors[0] : "rgba(255,255,255,0.08)";
  const enterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enterAnim, {
      toValue: 1, speed: 8, bounciness: 10, useNativeDriver: true,
    }).start();
  }, []);

  const opacity = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const translateX = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] });

  return (
    <Animated.View style={[t.rankNumWrap, { opacity, transform: [{ translateX }] }]}>
      {/* Shadow layer */}
      <Text style={[t.rankShadow, { color: "rgba(0,0,0,0.4)" }]}>{rank}</Text>
      {/* Color layer */}
      <Text style={[t.rankOutline, { color }]}>{rank}</Text>
    </Animated.View>
  );
}

/* ── Score bar (popularity percentage) ────────────────────── */
function ScoreBar({ score, accent }: { score: number; accent: string }) {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: score, duration: 900, delay: 300, useNativeDriver: false }).start();
  }, [score]);
  return (
    <View style={t.scoreBarTrack}>
      <Animated.View
        style={[
          t.scoreBarFill,
          {
            width: width.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
            backgroundColor: accent,
          },
        ]}
      />
    </View>
  );
}

/* ── Trending arrow with position change ──────────────────── */
function TrendBadge({ rank, change }: { rank: number; change?: number }) {
  if (rank > 5 && !change) return null;
  const up = (change ?? 0) > 0;
  const down = (change ?? 0) < 0;
  const same = !up && !down && rank <= 3;
  return (
    <View style={[t.trendBadge, up ? t.trendUp : down ? t.trendDown : t.trendSame]}>
      <Feather
        name={up ? "trending-up" : down ? "trending-down" : "minus"}
        size={8}
        color={up ? "#22c55e" : down ? "#ef4444" : "#f59e0b"}
      />
      <Text style={[t.trendText, { color: up ? "#22c55e" : down ? "#ef4444" : "#f59e0b" }]}>
        {up ? `+${change}` : down ? `${change}` : "TOP"}
      </Text>
    </View>
  );
}

export const TopTenCard = React.memo(function TopTenCard({ item, rank, onPress }: TopTenCardProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(0.92)).current;
  const [imgError, setImgError] = useState(false);
  const [liked, setLiked] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;

  const cfg = RANK_CFG[rank];
  const accent = cfg?.colors[0] ?? "#e50914";
  const isTop3 = rank <= 3;

  // Entrance animation
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, speed: 10, bounciness: 6, useNativeDriver: true }).start();
  }, []);

  const onPressIn = useCallback(() =>
    Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 26, bounciness: 4 }).start(), [scale]);
  const onPressOut = useCallback(() =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 5 }).start(), [scale]);

  const handleLike = useCallback(() => {
    setLiked((v) => !v);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.5, speed: 28, bounciness: 16, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1, speed: 26, bounciness: 5, useNativeDriver: true }),
    ]).start();
  }, [heartScale]);

  // Simulated popularity score based on rank
  const popularityScore = Math.max(10, 100 - (rank - 1) * 9);

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[t.container, { transform: [{ scale }] }]}>
        {/* Giant rank number behind the card */}
        <OutlineNumber rank={rank} />

        {/* Card */}
        <View style={[t.cardWrap, { borderRadius: colors.radius + 2 }]}>
          {/* Glow for top 3 */}
          {isTop3 && cfg && (
            <View style={[t.glowRing, { borderColor: `${cfg.colors[0]}55` }]} />
          )}

          {/* Poster image */}
          {!imgError && item.posterPath ? (
            <Image
              source={{ uri: item.posterPath }}
              style={[t.image, { borderRadius: colors.radius + 2 }]}
              contentFit="cover"
              transition={Platform.OS === "web" ? 220 : 0}
              cachePolicy="memory-disk"
              onError={() => setImgError(true)}
            />
          ) : (
            <LinearGradient
              colors={["#1a1525", "#0d0d18"]}
              style={[t.image, { borderRadius: colors.radius + 2, alignItems: "center", justifyContent: "center" }]}
            >
              <Feather name="film" size={28} color="#333348" />
            </LinearGradient>
          )}

          {/* Bottom gradient */}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.88)"]}
            style={[t.gradient, { borderRadius: colors.radius + 2 }]}
          />

          {/* Top-right: rank badge */}
          {isTop3 && cfg ? (
            <LinearGradient
              colors={cfg.colors}
              style={t.topBadge}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={t.topBadgeText}>{cfg.label} #{rank}</Text>
            </LinearGradient>
          ) : (
            <View style={[t.rankBadge, { backgroundColor: "rgba(229,9,20,0.88)" }]}>
              <Text style={t.rankBadgeText}>#{rank}</Text>
            </View>
          )}

          {/* Top-left: trending */}
          <TrendBadge rank={rank} />

          {/* Bottom-left: IMDb */}
          {item.rating > 0 && (
            <View style={t.imdbBadge}>
              <Text style={t.imdbLabel}>IMDb</Text>
              <Text style={t.imdbVal}>{item.rating.toFixed(1)}</Text>
            </View>
          )}

          {/* Bottom-right: type */}
          <View style={t.typeChip}>
            <Feather
              name={item.type === "series" ? "tv" : "film"}
              size={7}
              color="rgba(255,255,255,0.6)"
            />
          </View>

          {/* Like button overlay */}
          <Animated.View style={[t.likeBtn, { transform: [{ scale: heartScale }] }]}>
            <TouchableOpacity
              onPress={handleLike}
              style={[t.likeBtnInner, liked && { backgroundColor: "rgba(229,9,20,0.4)" }]}
              activeOpacity={0.75}
            >
              <Feather name="heart" size={11} color={liked ? "#e50914" : "rgba(255,255,255,0.6)"} />
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Title + meta */}
        <Text style={[t.title, { color: colors.foreground }]} numberOfLines={2}>
          {item.title}
        </Text>

        <View style={t.metaRow}>
          <Text style={[t.meta, { color: colors.mutedForeground }]}>{item.year}</Text>
          <View style={t.metaDot} />
          <Text style={[t.meta, { color: colors.mutedForeground }]}>
            {item.type === "series" ? "Série" : "Filme"}
          </Text>
        </View>

        {/* Popularity score bar */}
        <View style={t.scoreRow}>
          <Text style={t.scoreLabel}>Pop.</Text>
          <ScoreBar score={popularityScore} accent={isTop3 && cfg ? cfg.colors[0] : "#e50914"} />
          <Text style={[t.scorePct, { color: isTop3 && cfg ? cfg.colors[0] : "#e50914" }]}>
            {popularityScore}%
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
});

const CARD_W = 118;
const CARD_H = 168;

const t = StyleSheet.create({
  container: {
    width: CARD_W + 32,
    marginRight: 0,
    paddingLeft: 22,
    alignItems: "flex-start",
  },
  rankNumWrap: {
    position: "absolute",
    bottom: 70,
    left: -6,
    zIndex: 0,
  },
  rankShadow: {
    fontSize: 100,
    fontWeight: "900",
    lineHeight: 102,
    letterSpacing: -8,
    position: "absolute",
    bottom: 0,
    left: 2,
  },
  rankOutline: {
    fontSize: 100,
    fontWeight: "900",
    lineHeight: 102,
    letterSpacing: -8,
    opacity: 0.88,
  },
  cardWrap: {
    width: CARD_W,
    height: CARD_H,
    overflow: "hidden",
    backgroundColor: "#0a0a14",
    zIndex: 1,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 16 },
      android: { elevation: 10 },
    }),
  },
  glowRing: {
    position: "absolute",
    top: -2, left: -2, right: -2, bottom: -2,
    borderRadius: 16,
    borderWidth: 2,
    zIndex: 2,
  },
  image: { width: "100%", height: "100%" },
  gradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: "65%" },
  topBadge: {
    position: "absolute", top: 7, right: 7,
    flexDirection: "row", alignItems: "center", gap: 3,
    borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4,
  },
  topBadgeText: { color: "#000", fontSize: 8, fontWeight: "900", letterSpacing: 0.2 },
  rankBadge: {
    position: "absolute", top: 7, right: 7,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
  },
  rankBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  trendBadge: {
    position: "absolute", top: 7, left: 7,
    flexDirection: "row", alignItems: "center", gap: 3,
    borderRadius: 5, paddingHorizontal: 5, paddingVertical: 3,
    borderWidth: 1,
  },
  trendUp: { backgroundColor: "rgba(34,197,94,0.18)", borderColor: "rgba(34,197,94,0.35)" },
  trendDown: { backgroundColor: "rgba(239,68,68,0.18)", borderColor: "rgba(239,68,68,0.35)" },
  trendSame: { backgroundColor: "rgba(245,158,11,0.18)", borderColor: "rgba(245,158,11,0.35)" },
  trendText: { fontSize: 7, fontWeight: "800", letterSpacing: 0.3 },
  imdbBadge: {
    position: "absolute", bottom: 7, left: 6,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#f5c518", borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  imdbLabel: { color: "#000", fontSize: 7, fontWeight: "900" },
  imdbVal: { color: "#000", fontSize: 9, fontWeight: "800" },
  typeChip: {
    position: "absolute", bottom: 7, right: 6,
    backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 4,
    width: 17, height: 17, alignItems: "center", justifyContent: "center",
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)",
  },
  likeBtn: { position: "absolute", bottom: 30, right: 6 },
  likeBtnInner: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.15)",
  },
  title: {
    fontSize: 11, fontWeight: "700",
    marginTop: 9, lineHeight: 15, zIndex: 1,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  meta: { fontSize: 10, fontWeight: "400", zIndex: 1 },
  metaDot: { width: 2.5, height: 2.5, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.2)" },
  scoreRow: {
    flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6, width: "100%",
  },
  scoreLabel: { color: "rgba(255,255,255,0.35)", fontSize: 8, fontWeight: "600", width: 22 },
  scoreBarTrack: {
    flex: 1, height: 3, borderRadius: 2, overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  scoreBarFill: { height: "100%", borderRadius: 2 },
  scorePct: { fontSize: 9, fontWeight: "700", width: 28, textAlign: "right" },
});
