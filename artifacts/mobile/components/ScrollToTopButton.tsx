import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface ScrollToTopButtonProps {
  visible: boolean;
  onPress: () => void;
}

export function ScrollToTopButton({ visible, onPress }: ScrollToTopButtonProps) {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(opacity, {
        toValue: visible ? 1 : 0,
        useNativeDriver: true,
        speed: 18,
      }),
      Animated.spring(translateY, {
        toValue: visible ? 0 : 16,
        useNativeDriver: true,
        speed: 18,
      }),
    ]).start();
  }, [visible]);

  return (
    <Animated.View
      style={[
        styles.container,
        { opacity, transform: [{ translateY }] },
      ]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.btn,
          {
            backgroundColor: colors.primary,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Feather name="arrow-up" size={18} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 100,
    right: 20,
    zIndex: 100,
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
