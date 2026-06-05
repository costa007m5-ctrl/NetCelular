import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import type { ContentItem } from "@/constants/content";

interface Action {
  id: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color?: string;
  destructive?: boolean;
}

interface ContentActionSheetProps {
  visible: boolean;
  item: ContentItem | null;
  actions: Action[];
  onClose: () => void;
  onAction: (actionId: string, item: ContentItem) => void;
}

export function ContentActionSheet({
  visible,
  item,
  actions,
  onClose,
  onAction,
}: ContentActionSheetProps) {
  const colors = useColors();
  if (!item) return null;

  const posterUrl = item.posterPath
    ? item.posterPath.startsWith("http")
      ? item.posterPath
      : `https://image.tmdb.org/t/p/w185${item.posterPath}`
    : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Content preview */}
          <View style={styles.preview}>
            {posterUrl ? (
              <Image
                source={{ uri: posterUrl }}
                style={styles.poster}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.posterFallback, { backgroundColor: colors.muted }]}>
                <Feather name="film" size={20} color={colors.mutedForeground} />
              </View>
            )}
            <View style={styles.previewInfo}>
              <Text style={[styles.previewTitle, { color: colors.foreground }]} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={[styles.previewMeta, { color: colors.mutedForeground }]}>
                {item.year} · {item.type === "movie" ? "Filme" : "Série"}
                {item.rating > 0 ? ` · ★ ${item.rating.toFixed(1)}` : ""}
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Actions */}
          <View style={styles.actions}>
            {actions.map((action) => (
              <Pressable
                key={action.id}
                onPress={() => { onAction(action.id, item); onClose(); }}
                style={({ pressed }) => [
                  styles.action,
                  {
                    backgroundColor: pressed ? colors.muted : "transparent",
                  },
                ]}
              >
                <View
                  style={[
                    styles.actionIcon,
                    {
                      backgroundColor: action.destructive
                        ? `${colors.primary}15`
                        : action.color
                        ? `${action.color}15`
                        : colors.muted,
                    },
                  ]}
                >
                  <Feather
                    name={action.icon}
                    size={16}
                    color={
                      action.destructive
                        ? colors.primary
                        : action.color ?? colors.foreground
                    }
                  />
                </View>
                <Text
                  style={[
                    styles.actionLabel,
                    {
                      color: action.destructive
                        ? colors.primary
                        : action.color ?? colors.foreground,
                    },
                  ]}
                >
                  {action.label}
                </Text>
                <Feather name="chevron-right" size={14} color={colors.border} />
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={onClose}
            style={[styles.cancelBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
          >
            <Text style={[styles.cancelText, { color: colors.foreground }]}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  poster: {
    width: 52,
    height: 74,
    borderRadius: 10,
  },
  posterFallback: {
    width: 52,
    height: 74,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  previewInfo: {
    flex: 1,
    gap: 5,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  previewMeta: {
    fontSize: 12,
    fontWeight: "500",
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  actions: {
    paddingHorizontal: 16,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  cancelBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
