import { useRef } from "react";
import { Animated } from "react-native";

interface ScrollHeaderOptions {
  threshold?: number;
  fadeRange?: number;
}

/** Returns scroll-driven header opacity/background for animated scroll headers */
export function useScrollHeader({
  threshold = 80,
  fadeRange = 60,
}: ScrollHeaderOptions = {}) {
  const scrollY = useRef(new Animated.Value(0)).current;

  const headerOpacity = scrollY.interpolate({
    inputRange: [threshold, threshold + fadeRange],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const titleOpacity = scrollY.interpolate({
    inputRange: [threshold + 20, threshold + fadeRange + 20],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const contentOpacity = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false }
  );

  return {
    scrollY,
    headerOpacity,
    titleOpacity,
    contentOpacity,
    onScroll,
  };
}
