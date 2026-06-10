import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOTAUpdate } from "@/hooks/useOTAUpdate";

export function UpdateBanner() {
  const { isUpdateReady, applyUpdate } = useOTAUpdate();
  const translateY = useRef(new Animated.Value(120)).current;
  const shown = useRef(false);

  useEffect(() => {
    if (isUpdateReady && !shown.current) {
      shown.current = true;
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    }
  }, [isUpdateReady, translateY]);

  const dismiss = () => {
    Animated.timing(translateY, {
      toValue: 120,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const insets = useSafeAreaInsets();

  if (!isUpdateReady) return null;
  if (Platform.OS === "web") return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { bottom: insets.bottom + 80, transform: [{ translateY }] },
      ]}
    >
      <View style={styles.inner}>
        <View style={styles.textWrap}>
          <Text style={styles.title}>✨ Nova versão disponível</Text>
          <Text style={styles.subtitle}>
            Reinicie para aplicar as atualizações
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable onPress={dismiss} style={styles.btnDismiss}>
            <Text style={styles.btnDismissText}>Depois</Text>
          </Pressable>
          <Pressable onPress={applyUpdate} style={styles.btnApply}>
            <Text style={styles.btnApplyText}>Reiniciar</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  inner: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#e5091433",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  textWrap: {
    gap: 2,
  },
  title: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    color: "#999",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  btnDismiss: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#2a2a2a",
  },
  btnDismissText: {
    color: "#aaa",
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  btnApply: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#e50914",
  },
  btnApplyText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
});
