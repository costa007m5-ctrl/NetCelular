import React, { useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";

const RED = "#e50914";

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: object;
  autoFocus?: boolean;
}

export function InlineSearchBar({
  value,
  onChangeText,
  placeholder = "Buscar filmes, séries, atores...",
  style,
  autoFocus = false,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const inputRef = useRef<TextInput>(null);

  const pi = () =>
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 32 }).start();
  const po = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }).start();

  const hasText = value.length > 0;

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      onPressIn={pi}
      onPressOut={po}
      style={[styles.wrap, style]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient
          colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.03)"]}
          style={styles.bar}
        >
          {/* Left icon */}
          <View style={styles.iconWrap}>
            <Feather name="search" size={15} color={RED} />
          </View>

          {/* Real TextInput */}
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="rgba(255,255,255,0.35)"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            autoFocus={autoFocus}
            selectionColor={RED}
          />

          {/* Right button: clear (X) if has text, mic if empty */}
          <Pressable
            style={[styles.rightBtn, hasText && styles.rightBtnActive]}
            hitSlop={8}
            onPress={() => {
              if (hasText) {
                onChangeText("");
                inputRef.current?.focus();
              }
            }}
          >
            <Feather
              name={hasText ? "x" : "mic"}
              size={14}
              color={hasText ? "#fff" : "rgba(255,255,255,0.35)"}
            />
          </Pressable>
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
  input: {
    flex: 1,
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
    padding: 0,
    margin: 0,
  },
  rightBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  rightBtnActive: {
    backgroundColor: RED,
    borderColor: RED,
  },
});
