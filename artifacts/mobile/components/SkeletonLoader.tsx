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
            backgroundColor: colors.shimmer2,
            opacity: 0.55,
            width: 160,
          },
        ]}
      />
    </View>
  );
}

/** Row of skeleton content cards */
export function SkeletonRow() {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Skeleton width={120} height={14} borderRadius={6} />
        <Skeleton width={60} height={11} borderRadius={6} />
      </View>
      <View style={styles.cards}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} width={120} height={175} borderRadius={12} />
        ))}
      </View>
    </View>
  );
}

/** Full hero skeleton for home screen */
export function SkeletonHero() {
  const colors = useColors();
  return (
    <View style={styles.hero}>
      <Skeleton width="100%" height={500} borderRadius={0} />
      <View style={styles.heroContent}>
        <Skeleton width={200} height={32} borderRadius={8} />
        <Skeleton width={280} height={13} borderRadius={6} />
        <Skeleton width={220} height={13} borderRadius={6} />
        <View style={styles.heroButtons}>
          <Skeleton width={120} height={44} borderRadius={12} />
          <Skeleton width={100} height={44} borderRadius={12} />
        </View>
      </View>
    </View>
  );
}

/** Detail page skeleton */
export function SkeletonDetail() {
  const colors = useColors();
  return (
    <View style={{ flex: 1 }}>
      <Skeleton width="100%" height={260} borderRadius={0} />
      <View style={styles.detail}>
        <View style={styles.detailRow}>
          <Skeleton width={100} height={148} borderRadius={12} />
          <View style={styles.detailInfo}>
            <Skeleton width={180} height={22} borderRadius={6} />
            <Skeleton width={120} height={14} borderRadius={5} />
            <Skeleton width={80} height={14} borderRadius={5} />
          </View>
        </View>
        <Skeleton width="100%" height={13} borderRadius={5} style={{ marginBottom: 6 }} />
        <Skeleton width="90%" height={13} borderRadius={5} style={{ marginBottom: 6 }} />
        <Skeleton width="75%" height={13} borderRadius={5} />
      </View>
    </View>
  );
}

export function SkeletonLoader({ rows = 2 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: 28,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  cards: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
  },
  hero: {
    position: "relative",
    marginBottom: 28,
  },
  heroContent: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    gap: 10,
  },
  heroButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  detail: {
    padding: 20,
    gap: 14,
  },
  detailRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-end",
  },
  detailInfo: {
    flex: 1,
    gap: 8,
  },
});
