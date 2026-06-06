import React, { useCallback, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Platform,
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
  const scale     = useRef(new Animated.Value(1)).current;
  const micPulse  = useRef(new Animated.Value(1)).current;
  const inputRef  = useRef<TextInput>(null);
  const [listening, setListening] = useState(false);
  const recogRef  = useRef<any>(null);

  const pi = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 32 }).start();
  const po = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 28 }).start();

  const hasText = value.length > 0;

  const stopListening = useCallback(() => {
    try { recogRef.current?.stop(); } catch {}
    recogRef.current = null;
    setListening(false);
    micPulse.stopAnimation();
    micPulse.setValue(1);
  }, [micPulse]);

  const startVoiceSearch = useCallback(() => {
    if (listening) { stopListening(); return; }

    if (Platform.OS !== "web") {
      Alert.alert(
        "Busca por voz",
        "A busca por voz está disponível apenas na versão web. No app, digite normalmente.",
        [{ text: "OK" }]
      );
      return;
    }

    const SR: any =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SR) {
      Alert.alert(
        "Não suportado",
        "Seu navegador não suporta reconhecimento de voz. Tente Chrome ou Edge.",
        [{ text: "OK" }]
      );
      return;
    }

    const recognition = new SR();
    recognition.lang            = "pt-BR";
    recognition.continuous      = false;
    recognition.interimResults  = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      Animated.loop(
        Animated.sequence([
          Animated.timing(micPulse, { toValue: 0.4, duration: 500, useNativeDriver: true }),
          Animated.timing(micPulse, { toValue: 1,   duration: 500, useNativeDriver: true }),
        ])
      ).start();
    };

    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      onChangeText(transcript);
      inputRef.current?.focus();
    };

    recognition.onerror = () => stopListening();
    recognition.onend   = () => stopListening();

    recogRef.current = recognition;
    recognition.start();
  }, [listening, micPulse, onChangeText, stopListening]);

  const handleRightBtn = useCallback(() => {
    if (hasText) {
      onChangeText("");
      inputRef.current?.focus();
    } else {
      startVoiceSearch();
    }
  }, [hasText, onChangeText, startVoiceSearch]);

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
          <View style={styles.iconWrap}>
            <Feather name="search" size={15} color={RED} />
          </View>

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

          <Pressable
            style={[
              styles.rightBtn,
              hasText && styles.rightBtnClear,
              listening && styles.rightBtnListening,
            ]}
            hitSlop={8}
            onPress={handleRightBtn}
          >
            <Animated.View style={listening ? { opacity: micPulse } : undefined}>
              <Feather
                name={hasText ? "x" : "mic"}
                size={14}
                color={hasText ? "#fff" : listening ? RED : "rgba(255,255,255,0.35)"}
              />
            </Animated.View>
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
  rightBtnClear: {
    backgroundColor: RED,
    borderColor: RED,
  },
  rightBtnListening: {
    borderColor: RED,
    backgroundColor: "rgba(229,9,20,0.15)",
  },
});
