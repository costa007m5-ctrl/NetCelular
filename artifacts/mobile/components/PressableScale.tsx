import React, { useRef } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";

interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  scale?: number;
  speed?: number;
  style?: any;
  disabled?: boolean;
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
}

export function PressableScale({
  children,
  onPress,
  onLongPress,
  scale: targetScale = 0.94,
  speed = 28,
  style,
  disabled = false,
  hitSlop,
}: PressableScaleProps) {
  const animScale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    if (disabled) return;
    Animated.spring(animScale, {
      toValue: targetScale,
      useNativeDriver: true,
      speed,
      bounciness: 4,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(animScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: speed - 2,
      bounciness: 6,
    }).start();
  };

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={style}
      hitSlop={hitSlop as any}
    >
      <Animated.View style={{ transform: [{ scale: animScale }] }}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
