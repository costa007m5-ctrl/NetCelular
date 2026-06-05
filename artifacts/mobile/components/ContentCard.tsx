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

  const onPressIn = () => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 0.93,
        useNativeDriver: true,
        speed: 24,
        bounciness: 6,
      }),
      Animated.timing(glow, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const onPressOut = () => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 22,
        bounciness: 5,
      }),
      Animated.timing(glow, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const isNew = isNewContent(item.year);
  const isSeries = item.type === "series";

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      android_ripple={{ color: "rgba(229,9,20,0.2)", radius: width / 2 }}
    >
      <Animated.View
        style={[
          styles.card,
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
            style={[styles.image, { borderRadius: colors.radius }]}
            contentFit="cover"
            transition={180}
            onError={() => setImgError(true)}
            cachePolicy="memory-disk"
          />
        ) : (
          <LinearGradient
            colors={["#1a1525", "#0d0d18"]}
            style={[styles.placeholder, { borderRadius: colors.radius }]}
          >
            <Feather name="film" size={Math.round(width * 0.22)} color="#333348" />
            <Text style={[styles.placeholderText, { fontSize: width * 0.08 }]} numberOfLines={2}>
              {item.title}
            </Text>
          </LinearGradient>
        )}

        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.55)"]}
          style={[styles.bottomGradient, { borderRadius: colors.radius }]}
          locations={[0.45, 1]}
        />

        {showProgress && item.progress !== undefined && item.progress > 0 && (
          <View style={styles.progressContainer}>
            <View style={[styles.progressTrack, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(item.progress * 100, 100)}%` as any,
                    backgroundColor: colors.primary,
                  },
                ]}
              />
            </View>
          </View>
        )}

        {showBadge && isSeries && (
          <View style={[styles.typeBadge, { backgroundColor: "rgba(0,0,0,0.72)", borderColor: "rgba(255,255,255,0.1)", borderWidth: 0.5 }]}>
            <Text style={styles.typeBadgeText}>SÉRIE</Text>
          </View>
        )}

        {showBadge && isNew && (
          <View style={[styles.newBadge, { backgroundColor: colors.newBadge }]}>
            <Text style={styles.newBadgeText}>NOVO</Text>
          </View>
        )}

        {showRating && item.rating > 0 && (
          <View style={[styles.ratingBadge, { backgroundColor: colors.ratingGoldBg }]}>
            <Feather name="star" size={9} color={colors.ratingGold} />
            <Text style={[styles.ratingText, { color: colors.ratingGold }]}>
              {item.rating.toFixed(1)}
            </Text>
          </View>
        )}

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
          style={[styles.label, { color: colors.mutedForeground }]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    backgroundColor: "#0e0e16",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
      },
      android: { elevation: 7 },
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
    color: "#555570",
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 14,
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "50%",
  },
  progressContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 6,
    paddingBottom: 6,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  typeBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
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
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
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
  label: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 7,
    textAlign: "left",
    paddingHorizontal: 1,
  },
});
