import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface BitrateOption {
  id: string;
  label: string;
  description?: string;
  quality?: "4K" | "1080p" | "720p" | "480p" | "Auto";
}

const DEFAULT_OPTIONS: BitrateOption[] = [
  { id: "auto", label: "Automático", description: "Ajusta conforme sua conexão", quality: "Auto" },
  { id: "4k", label: "4K Ultra HD", description: "25+ Mbps", quality: "4K" },
  { id: "1080p", label: "Full HD", description: "~8 Mbps", quality: "1080p" },
  { id: "720p", label: "HD", description: "~4 Mbps", quality: "720p" },
  { id: "480p", label: "SD", description: "~2 Mbps", quality: "480p" },
];

interface BitrateSelectorProps {
  visible: boolean;
  onClose: () => void;
  options?: BitrateOption[];
  currentId?: string;
  onSelect: (option: BitrateOption) => void;
}

export function BitrateSelector({
  visible,
  onClose,
  options = DEFAULT_OPTIONS,
  currentId = "auto",
  onSelect,
}: BitrateSelectorProps) {
  const colors = useColors();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <Feather name="layers" size={18} color={colors.primary} />
            <Text style={[styles.title, { color: colors.foreground }]}>Qualidade do vídeo</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View style={styles.options}>
            {options.map((opt) => {
              const active = opt.id === currentId;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => { onSelect(opt); onClose(); }}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      backgroundColor: active ? `${colors.primary}14` : colors.muted,
                      borderColor: active ? colors.primary : colors.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <View style={styles.optionInfo}>
                    <Text style={[styles.optionLabel, { color: active ? colors.primary : colors.foreground }]}>
                      {opt.label}
                    </Text>
                    {opt.description && (
                      <Text style={[styles.optionDesc, { color: colors.mutedForeground }]}>
                        {opt.description}
                      </Text>
                    )}
                  </View>
                  {opt.quality && (
                    <View style={[styles.qualityTag, { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}25` }]}>
                      <Text style={[styles.qualityText, { color: colors.primary }]}>{opt.quality}</Text>
                    </View>
                  )}
                  {active && <Feather name="check" size={16} color={colors.primary} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  options: {
    paddingHorizontal: 20,
    gap: 8,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionInfo: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  optionDesc: {
    fontSize: 12,
    fontWeight: "400",
  },
  qualityTag: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  qualityText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
