import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet, View } from "react-native";
import { useColors } from "@/hooks/useColors";

const { width: SW } = Dimensions.get("window");

interface SkeletonProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: any;
}

export function Skeleton({ width, height, borderRadius = 8, style }: SkeletonProps) {
  const colors = useColors();
  const translateX = useRef(new Animated.Value(-SW)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(translateX, {
        toValue: SW,
        duration: 1400,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [translateX]);

  return (
    <View
      style={[
        { width: width as number, height, borderRadius, overflow: "hidden", backgroundColor: colors.shimmer1 },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [{ translateX }],
          },
        ]}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "transparent",
            flexDirection: "row",
          }}
        >
          <View style={{ flex: 1, backgroundColor: "transparent" }} />
          <View
            style={{
              width: SW * 0.5,
              backgroundColor: colors.shimmer2,
              opacity: 0.6,
              transform: [{ skewX: "-20deg" }],
            }}
          />
          <View style={{ flex: 1, backgroundColor: "transparent" }} />
        </View>
      </Animated.View>
    </View>
  );
}

export function SkeletonCard({ width = 120, height = 175 }: { width?: number; height?: number }) {
  const colors = useColors();
  return (
    <View style={{ marginRight: 10 }}>
      <Skeleton width={width} height={height} borderRadius={14} />
      <View style={{ height: 7 }} />
      <Skeleton width={width * 0.8} height={9} borderRadius={5} />
      <View style={{ height: 4 }} />
      <Skeleton width={width * 0.55} height={7} borderRadius={4} />
    </View>
  );
}

export function SkeletonRow({
  cardWidth = 120,
  cardHeight = 175,
  count = 4,
}: {
  cardWidth?: number;
  cardHeight?: number;
  count?: number;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Skeleton width={18} height={18} borderRadius={5} />
        <Skeleton width={140} height={14} borderRadius={7} />
      </View>
      <View style={styles.cards}>
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} width={cardWidth} height={cardHeight} />
        ))}
      </View>
    </View>
  );
}

export function SkeletonHero() {
  return (
    <View style={styles.hero}>
      <Skeleton width="100%" height={480} borderRadius={0} />
      <View style={styles.heroContent}>
        <Skeleton width={200} height={60} borderRadius={8} />
        <View style={{ height: 10 }} />
        <Skeleton width={280} height={12} borderRadius={6} />
        <View style={{ height: 6 }} />
        <Skeleton width={220} height={12} borderRadius={6} />
        <View style={{ height: 18 }} />
        <View style={styles.heroBtns}>
          <Skeleton width={120} height={44} borderRadius={10} />
          <Skeleton width={100} height={44} borderRadius={10} />
        </View>
      </View>
    </View>
  );
}

export function SkeletonBanner() {
  return (
    <View style={styles.banner}>
      <Skeleton width="100%" height={160} borderRadius={16} />
    </View>
  );
}

export function SkeletonDetail() {
  return (
    <View style={{ flex: 1 }}>
      <Skeleton width="100%" height={240} borderRadius={0} />
      <View style={{ padding: 20, gap: 12 }}>
        <Skeleton width={220} height={28} borderRadius={8} />
        <Skeleton width={160} height={14} borderRadius={7} />
        <Skeleton width="100%" height={13} borderRadius={6} />
        <Skeleton width="95%" height={13} borderRadius={6} />
        <Skeleton width="80%" height={13} borderRadius={6} />
        <View style={{ height: 8 }} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Skeleton width={130} height={46} borderRadius={10} />
          <Skeleton width={110} height={46} borderRadius={10} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  cards: {
    flexDirection: "row",
    gap: 0,
  },
  hero: {
    height: 480,
    overflow: "hidden",
  },
  heroContent: {
    position: "absolute",
    bottom: 50,
    left: 20,
    right: 20,
  },
  heroBtns: {
    flexDirection: "row",
    gap: 12,
  },
  banner: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
});
