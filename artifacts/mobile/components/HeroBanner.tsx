import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ContentItem } from "@/constants/content";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HERO_HEIGHT = 480;

interface HeroBannerProps {
  items: ContentItem[];
}

interface HeroItemProps {
  item: ContentItem;
  colors: ReturnType<typeof useColors>;
  onWatch?: () => void;
  onDetails?: () => void;
}

function HeroItem({ item, colors, onWatch, onDetails }: HeroItemProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <View style={{ width: SCREEN_WIDTH, height: HERO_HEIGHT }}>
      {!imgError ? (
        <Image
          source={{ uri: item.backdropPath }}
          style={styles.heroImage}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <LinearGradient colors={["#1a0a0a", "#000"]} style={styles.heroImage} />
      )}

      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.5)", "#000"]}
        locations={[0.2, 0.6, 1]}
        style={styles.gradient}
      />

      <View style={styles.heroContent}>
        {item.channel && (
          <View style={[styles.channelBadge, { borderColor: colors.primary }]}>
            <Text style={[styles.channelText, { color: colors.primary }]}>
              {item.channel === "NETPLAY" ? "CATÁLOGO PREMIUM" : item.channel}
            </Text>
          </View>
        )}

        <Text style={[styles.heroTitle, { color: colors.foreground }]} numberOfLines={2}>
          {item.title}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.ratingBadge}>
            <Feather name="star" size={10} color="#fbbf24" />
            <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
          </View>
          {item.communityScore && (
            <Text style={[styles.metaText, { color: "#4ade80" }]}>
              {item.communityScore}% hype
            </Text>
          )}
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {item.year}
          </Text>
          {item.duration && (
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {item.duration}
            </Text>
          )}
          {item.genres[0] && (
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {item.genres[0]}
            </Text>
          )}
        </View>

        <Text style={[styles.heroDesc, { color: "rgba(255,255,255,0.7)" }]} numberOfLines={2}>
          {item.description}
        </Text>

        <View style={styles.actions}>
          <Pressable
            onPress={onWatch}
            style={({ pressed }) => [
              styles.watchBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Feather name="play" size={16} color="#fff" />
            <Text style={styles.watchBtnText}>Assistir</Text>
          </Pressable>

          <Pressable
            onPress={onDetails}
            style={({ pressed }) => [
              styles.detailsBtn,
              {
                borderColor: "rgba(255,255,255,0.35)",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather name="info" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={[styles.detailsBtnText, { color: "rgba(255,255,255,0.8)" }]}>
              Detalhes
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function HeroBanner({ items }: HeroBannerProps) {
  const colors = useColors();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const flatRef = useRef<any>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const next = (activeIndex + 1) % items.length;
      flatRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
      setActiveIndex(next);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeIndex, items.length]);

  return (
    <View style={{ height: HERO_HEIGHT }}>
      <Animated.ScrollView
        ref={flatRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
        })}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setActiveIndex(idx);
        }}
        style={{ width: SCREEN_WIDTH }}
        scrollEnabled
      >
        {items.map((item) => (
          <HeroItem key={item.id} item={item} colors={colors} />
        ))}
      </Animated.ScrollView>

      <View style={styles.dotsContainer}>
        {items.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === activeIndex
                ? { backgroundColor: colors.primary, width: 20 }
                : { backgroundColor: "rgba(255,255,255,0.3)", width: 6 },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroImage: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
    position: "absolute",
    top: 0,
    left: 0,
  },
  gradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: HERO_HEIGHT * 0.85,
  },
  heroContent: {
    position: "absolute",
    bottom: 50,
    left: 20,
    right: 20,
  },
  channelBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  channelText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 33,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 10,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(251,191,36,0.15)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ratingText: {
    color: "#fbbf24",
    fontSize: 11,
    fontWeight: "700",
  },
  metaText: {
    fontSize: 12,
    fontWeight: "500",
  },
  heroDesc: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
    fontWeight: "400",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  watchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: "#e50914",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  watchBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  detailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  detailsBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  dotsContainer: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
