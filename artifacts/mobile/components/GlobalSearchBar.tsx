import React, { useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

const RED = "#e50914";

interface Props {
  placeholder?: string;
  style?: object;
}

export function GlobalSearchBar({ placeholder = "Buscar filmes, séries, atores...", style }: Props) {
  const router = useRouter();
  const scale = useRef(new Animated.Value(1)).current;

  const pi = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 32 }).start();
  const po = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 28 }).start();

  return (
    <Pressable
      onPress={() => router.push("/(tabs)/" as any)}
      onPressIn={pi}
      onPressOut={po}
      style={[styles.wrap, style]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient
          colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.03)"]}
          style={styles.bar}
        >
          <View style={styles.iconWrap}>
            <Feather name="search" size={15} color={RED} />
          </View>
          <Text style={styles.placeholder} numberOfLines={1}>{placeholder}</Text>
          <View style={styles.voiceBtn}>
            <Feather name="mic" size={14} color="rgba(255,255,255,0.35)" />
          </View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    marginBottom: 16,
    marginTop: 8,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(229,9,20,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    flex: 1,
    fontSize: 14,
    color: "rgba(255,255,255,0.35)",
    fontWeight: "500",
  },
  voiceBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
});
