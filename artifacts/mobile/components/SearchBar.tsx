import React, { useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface SearchBarProps {
  value?: string;
  onChangeText?: (text: string) => void;
  onPress?: () => void;
  onClear?: () => void;
  placeholder?: string;
  editable?: boolean;
  autoFocus?: boolean;
}

export function SearchBar({
  value,
  onChangeText,
  onPress,
  onClear,
  placeholder = "Buscar filmes, séries, atores...",
  editable = true,
  autoFocus = false,
}: SearchBarProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;
  const [focused, setFocused] = useState(false);

  const onPressIn = () => {
    if (!editable) return;
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 30 }).start();
  };
  const onPressOut = () => {
    if (!editable) return;
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }).start();
  };

  const borderColor = focused
    ? `${colors.primary}50`
    : "rgba(255,255,255,0.10)";

  if (!editable) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <Animated.View
          style={[
            styles.container,
            {
              backgroundColor: "rgba(255,255,255,0.07)",
              borderColor: "rgba(255,255,255,0.10)",
              transform: [{ scale }],
            },
          ]}
        >
          <Feather name="search" size={16} color="rgba(255,255,255,0.4)" />
          <Text
            style={[styles.placeholder, { color: "rgba(255,255,255,0.35)" }]}
            numberOfLines={1}
          >
            {placeholder}
          </Text>
          <View style={styles.micBtn}>
            <Feather name="mic" size={14} color="rgba(255,255,255,0.3)" />
          </View>
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: focused
            ? "rgba(255,255,255,0.09)"
            : "rgba(255,255,255,0.07)",
          borderColor,
          transform: [{ scale }],
        },
      ]}
    >
      <Feather
        name="search"
        size={16}
        color={focused ? colors.primary : "rgba(255,255,255,0.4)"}
      />
      <TextInput
        style={[styles.input, { color: colors.foreground }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.30)"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        returnKeyType="search"
        clearButtonMode="never"
      />
      {value && value.length > 0 ? (
        <Pressable onPress={onClear} style={styles.clearBtn} hitSlop={8}>
          <View style={[styles.clearCircle, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
            <Feather name="x" size={11} color="rgba(255,255,255,0.7)" />
          </View>
        </Pressable>
      ) : (
        <View style={styles.micBtn}>
          <Feather name="mic" size={14} color="rgba(255,255,255,0.3)" />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 12, android: 10, default: 12 }),
    gap: 10,
  },
  placeholder: {
    flex: 1,
    fontSize: 14,
    fontWeight: "400",
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: "400",
    padding: 0,
    margin: 0,
  },
  micBtn: {
    width: 24,
    alignItems: "center",
  },
  clearBtn: {
    alignItems: "center",
    justifyContent: "center",
  },
  clearCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
