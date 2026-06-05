import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import AsyncStorage from "@react-native-async-storage/async-storage";

const NOTIF_COUNT_KEY = "netplay_unread_notif_count";

interface NotificationBellProps {
  onPress?: () => void;
  size?: number;
}

export function NotificationBell({ onPress, size = 22 }: NotificationBellProps) {
  const colors = useColors();
  const [unread, setUnread] = useState(0);
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(NOTIF_COUNT_KEY)
      .then((v) => { if (v) setUnread(parseInt(v) || 0); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (unread > 0) {
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, duration: 80, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0.6, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -0.6, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]).start();
    }
  }, [unread]);

  const rotation = shake.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ["-15deg", "0deg", "15deg"],
  });

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Animated.View style={{ transform: [{ rotate: rotation }] }}>
        <Feather name="bell" size={size} color="rgba(255,255,255,0.85)" />
      </Animated.View>
      {unread > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: "#050508",
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 11,
  },
});
