import React from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface AnimatedHeaderProps {
  title: string;
  scrollY: Animated.Value;
  threshold?: number;
  right?: React.ReactNode;
  left?: React.ReactNode;
}

export function AnimatedHeader({
  title,
  scrollY,
  threshold = 80,
  right,
  left,
}: AnimatedHeaderProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const opacity = scrollY.interpolate({
    inputRange: [threshold, threshold + 60],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const titleOpacity = scrollY.interpolate({
    inputRange: [threshold + 10, threshold + 60],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const height = insets.top + 52;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          height,
          paddingTop: insets.top,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
          opacity,
        },
      ]}
    >
      <View style={styles.inner}>
        <View style={styles.left}>{left}</View>
        <Animated.Text
          style={[styles.title, { color: colors.foreground, opacity: titleOpacity }]}
          numberOfLines={1}
        >
          {title}
        </Animated.Text>
        <View style={styles.right}>{right}</View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: 1,
    zIndex: 100,
    ...Platform.select({
      ios: {
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      },
    }),
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 52,
  },
  left: {
    minWidth: 40,
    alignItems: "flex-start",
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  right: {
    minWidth: 40,
    alignItems: "flex-end",
  },
});
