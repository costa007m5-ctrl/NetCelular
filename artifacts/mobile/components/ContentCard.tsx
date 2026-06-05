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

interface ContentCardProps {
  item: ContentItem;
  width?: number;
  height?: number;
  showProgress?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  showRating?: boolean;
  showBadge?: boolean;
}

const isNewContent = (year: number) => year >= new Date().getFullYear() - 1;
const isRecentContent = (year: number) => year >= new Date().getFullYear();

function QualityBadge({ quality }: { quality?: string }) {
  if (!quality) return null;
  const colors: Record<string, string> = {
    "4K": "#a78bfa",
    "UHD": "#a78bfa",
    "HD": "#3b82f6",
    "FHD": "#22d3ee",
    "DV": "#f59e0b",
  };
  const color = colors[quality] ?? "#888";
  return (
    <View style={[cardStyles.qualityBadge, { borderColor: `${color}55`, backgroundColor: `${color}18` }]}>
      <Text style={[cardStyles.qualityText, { color }]}>{quality}</Text>
    </View>
  );
}

function PlayOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={cardStyles.playOverlay}>
      <View style={cardStyles.playCircle}>
        <Feather name="play" size={16} color="#fff" />
      </View>
    </View>
  );
}

function AnimatedCard({
  item,
  width = 120,
  height = 175,
  showProgress = false,
  showRating = false,
  showBadge = true,
  onPress,
  onLongPress,
}: ContentCardProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const [imgError, setImgError] = useState(false);
  const [pressing, setPressing] = useState(false);

  const onPressIn = () => {
    setPressing(true);
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 26, bounciness: 5 }),
      Animated.timing(glow, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const onPressOut = () => {
    setPressing(false);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 6 }),
      Animated.timing(glow, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  };

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const isNew = isNewContent(item.year);
  const isLatest = isRecentContent(item.year);
  const isSeries = item.type === "series";
  const progressPct = item.progress !== undefined ? Math.min(item.progress * 100, 100) : 0;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      android_ripple={{ color: "rgba(229,9,20,0.18)", radius: width / 2 }}
    >
      <Animated.View
        style={[
          cardStyles.card,
          {
            width,
            height,
            borderRadius: colors.radius,
            transform: [{ scale }],
          },
        ]}
      >
        {!imgError && item.posterPath ? (
          <Image
            source={{ uri: item.posterPath }}
            style={[cardStyles.image, { borderRadius: colors.radius }]}
            contentFit="cover"
            transition={220}
            onError={() => setImgError(true)}
            cachePolicy="memory-disk"
          />
        ) : (
          <LinearGradient
            colors={["#1a1525", "#0a0a14"]}
            style={[cardStyles.placeholder, { borderRadius: colors.radius }]}
          >
            <Feather name="film" size={Math.round(width * 0.2)} color="#2a2a40" />
            <Text style={[cardStyles.placeholderText, { fontSize: width * 0.08 }]} numberOfLines={2}>
              {item.title}
            </Text>
          </LinearGradient>
        )}

        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.7)"]}
          style={[cardStyles.bottomGradient, { borderRadius: colors.radius }]}
          locations={[0.5, 1]}
        />

        {showProgress && progressPct > 0 && (
          <View style={cardStyles.progressContainer}>
            <View style={cardStyles.progressTrack}>
              <View
                style={[
                  cardStyles.progressFill,
                  { width: `${progressPct}%` as any, backgroundColor: colors.primary },
                ]}
              />
            </View>
          </View>
        )}

        {showBadge && (
          <View style={cardStyles.topLeft}>
            {isSeries && (
              <View style={cardStyles.typeBadge}>
                <Feather name="tv" size={7} color="rgba(255,255,255,0.7)" />
              </View>
            )}
          </View>
        )}

        {showBadge && isLatest && (
          <View style={[cardStyles.newBadge, { backgroundColor: "#e50914" }]}>
            <Text style={cardStyles.newBadgeText}>NOVO</Text>
          </View>
        )}

        {showBadge && !isLatest && isNew && (
          <View style={[cardStyles.newBadge, { backgroundColor: "#22c55e" }]}>
            <Text style={cardStyles.newBadgeText}>RECENTE</Text>
          </View>
        )}

        {showRating && item.rating > 0 && (
          <View style={[cardStyles.ratingBadge, { backgroundColor: "rgba(245,158,11,0.2)" }]}>
            <Feather name="star" size={8} color="#f59e0b" />
            <Text style={[cardStyles.ratingText, { color: "#f59e0b" }]}>
              {item.rating.toFixed(1)}
            </Text>
          </View>
        )}

        <PlayOverlay visible={pressing} />

        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: colors.radius,
              borderWidth: 1.5,
              borderColor: colors.primary,
              opacity: glowOpacity,
            },
          ]}
          pointerEvents="none"
        />
      </Animated.View>
    </Pressable>
  );
}

export function ContentCard(props: ContentCardProps) {
  return <AnimatedCard {...props} />;
}

interface ContentCardWithLabelProps extends ContentCardProps {
  showTitle?: boolean;
}

export function ContentCardWithLabel({
  item,
  width = 120,
  height = 175,
  showProgress = false,
  showTitle = true,
  showRating,
  showBadge = true,
  onPress,
  onLongPress,
}: ContentCardWithLabelProps) {
  const colors = useColors();
  return (
    <View style={{ width, marginRight: 10 }}>
      <AnimatedCard
        item={item}
        width={width}
        height={height}
        showProgress={showProgress}
        showRating={showRating}
        showBadge={showBadge}
        onPress={onPress}
        onLongPress={onLongPress}
      />
      {showTitle && (
        <Text
          style={[cardStyles.label, { color: colors.mutedForeground }]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
      )}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    overflow: "hidden",
    backgroundColor: "#0a0a14",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
    }),
  },
  image: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 8,
  },
  placeholderText: {
    color: "#444460",
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 14,
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "55%",
  },
  progressContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 5,
    paddingBottom: 5,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  topLeft: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "column",
    gap: 3,
  },
  typeBadge: {
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 4,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.1)",
  },
  qualityBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  qualityText: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  newBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  newBadgeText: {
    color: "#fff",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  ratingBadge: {
    position: "absolute",
    bottom: 8,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 5,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: "700",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(229,9,20,0.88)",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 2,
    ...Platform.select({
      ios: {
        shadowColor: "#e50914",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 14,
      },
    }),
  },
  label: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 7,
    textAlign: "left",
    paddingHorizontal: 1,
  },
});
