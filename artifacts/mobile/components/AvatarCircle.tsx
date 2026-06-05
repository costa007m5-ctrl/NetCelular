import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";

interface AvatarCircleProps {
  uri?: string | null;
  name?: string;
  size?: number;
  showEdit?: boolean;
  editIcon?: keyof typeof Feather.glyphMap;
  editColor?: string;
  onPress?: () => void;
  badge?: React.ReactNode;
}

export function AvatarCircle({
  uri,
  name,
  size = 72,
  showEdit = false,
  editIcon = "edit-2",
  editColor,
  onPress,
  badge,
}: AvatarCircleProps) {
  const colors = useColors();
  const accent = editColor ?? colors.primary;
  const borderRadius = size / 2;
  const fontSize = size * 0.38;
  const editSize = size * 0.3;

  return (
    <Pressable onPress={onPress} style={[styles.wrap, { width: size, height: size }]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.avatar, { width: size, height: size, borderRadius }]}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <LinearGradient
          colors={[accent, `${accent}88`]}
          style={[styles.avatar, { width: size, height: size, borderRadius }]}
        >
          <Text style={[styles.letter, { fontSize }]}>
            {(name?.[0] ?? "?").toUpperCase()}
          </Text>
        </LinearGradient>
      )}

      {showEdit && (
        <View
          style={[
            styles.editBadge,
            {
              width: editSize,
              height: editSize,
              borderRadius: editSize / 2,
              backgroundColor: accent,
              bottom: 0,
              right: 0,
              borderWidth: 2,
              borderColor: colors.background,
            },
          ]}
        >
          <Feather name={editIcon} size={editSize * 0.52} color="#fff" />
        </View>
      )}

      {badge && (
        <View style={styles.badgeWrap}>
          {badge}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  letter: {
    color: "#fff",
    fontWeight: "800",
  },
  editBadge: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeWrap: {
    position: "absolute",
    top: -2,
    right: -2,
  },
});
