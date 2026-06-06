import React, { useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { Text } from "react-native";
import { useRouter } from "expo-router";

const RED = "#e50914";

interface Props {
  placeholder?: string;
  initialQuery?: string;
  style?: object;
}

export function SearchTriggerBar({
  placeholder = "Buscar filmes, séries, atores...",
  initialQuery,
  style,
}: Props) {
  const router = useRouter();
  const scale  = useRef(new Animated.Value(1)).current;

  const pi = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const po = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 32 }).start();

  const handlePress = () => {
    router.push(
      initialQuery
        ? { pathname: "/buscar", params: { q: initialQuery } }
        : "/buscar"
    );
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={pi}
      onPressOut={po}
      style={[styles.wrap, style]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient
          colors={["rgba(255,255,255,0.09)", "rgba(255,255,255,0.03)"]}
          style={styles.bar}
        >
          <View style={styles.iconWrap}>
            <Feather name="search" size={15} color={RED} />
          </View>

          <Text style={styles.placeholder} numberOfLines={1}>
            {placeholder}
          </Text>

          <View style={styles.micBtn}>
            <Feather name="mic" size={13} color="rgba(255,255,255,0.38)" />
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
    paddingVertical: 11,
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
    color: "rgba(255,255,255,0.32)",
    fontWeight: "500",
  },
  micBtn: {
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
