import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface SyncBarProps {
  progress?: number;
  visible?: boolean;
}

export function SyncBar({ progress = 0, visible = true }: SyncBarProps) {
  const colors = useColors();
  const spinAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [show, setShow] = useState(visible);

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    );
    spin.start();
    return () => spin.stop();
  }, [spinAnim]);

  useEffect(() => {
    if (!visible) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => setShow(false));
    } else {
      setShow(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, fadeAnim]);

  if (!show) return null;

  const rotate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const Content = (
    <View style={styles.inner}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Feather name="loader" size={11} color={colors.primary} />
      </Animated.View>
      <Text style={[styles.text, { color: colors.foreground }]}>
        Sincronizando {progress}%
      </Text>
    </View>
  );

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {Platform.OS === "ios" ? (
        <BlurView intensity={60} tint="dark" style={styles.blurWrap}>
          {Content}
        </BlurView>
      ) : (
        <View style={[styles.blurWrap, { backgroundColor: "rgba(10,10,10,0.85)" }]}>
          {Content}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "center",
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  blurWrap: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  text: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
});
