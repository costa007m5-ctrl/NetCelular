import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface FilterOption {
  id: string;
  label: string;
  icon?: keyof typeof Feather.glyphMap;
}

interface FilterGroup {
  id: string;
  title: string;
  options: FilterOption[];
  multi?: boolean;
}

interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
  groups: FilterGroup[];
  selected: Record<string, string | string[]>;
  onSelect: (groupId: string, value: string | string[]) => void;
  onReset?: () => void;
  onApply?: () => void;
}

export function FilterSheet({
  visible,
  onClose,
  groups,
  selected,
  onSelect,
  onReset,
  onApply,
}: FilterSheetProps) {
  const colors = useColors();

  const handleOptionPress = (group: FilterGroup, optionId: string) => {
    if (group.multi) {
      const current = (selected[group.id] as string[]) ?? [];
      const next = current.includes(optionId)
        ? current.filter((v) => v !== optionId)
        : [...current, optionId];
      onSelect(group.id, next);
    } else {
      const current = selected[group.id] as string;
      onSelect(group.id, current === optionId ? "" : optionId);
    }
  };

  const isSelected = (groupId: string, optionId: string) => {
    const val = selected[groupId];
    if (Array.isArray(val)) return val.includes(optionId);
    return val === optionId;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>Filtros</Text>
            <View style={styles.headerActions}>
              {onReset && (
                <Pressable onPress={onReset}>
                  <Text style={[styles.resetText, { color: colors.mutedForeground }]}>Limpar</Text>
                </Pressable>
              )}
              <Pressable onPress={onClose}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
            {groups.map((group) => (
              <View key={group.id} style={styles.group}>
                <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>
                  {group.title.toUpperCase()}
                </Text>
                <View style={styles.options}>
                  {group.options.map((option) => {
                    const active = isSelected(group.id, option.id);
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => handleOptionPress(group, option.id)}
                        style={({ pressed }) => [
                          styles.option,
                          {
                            backgroundColor: active
                              ? `${colors.primary}15`
                              : colors.muted,
                            borderColor: active ? colors.primary : colors.border,
                            opacity: pressed ? 0.75 : 1,
                          },
                        ]}
                      >
                        {option.icon && (
                          <Feather
                            name={option.icon}
                            size={13}
                            color={active ? colors.primary : colors.mutedForeground}
                          />
                        )}
                        <Text
                          style={[
                            styles.optionLabel,
                            { color: active ? colors.primary : colors.foreground },
                          ]}
                        >
                          {option.label}
                        </Text>
                        {active && (
                          <Feather name="check" size={12} color={colors.primary} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          {onApply && (
            <View style={styles.footer}>
              <Pressable
                onPress={() => { onApply(); onClose(); }}
                style={({ pressed }) => [
                  styles.applyBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.applyText}>Aplicar Filtros</Text>
              </Pressable>
            </View>
          )}
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
    maxHeight: "80%",
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  resetText: {
    fontSize: 14,
    fontWeight: "600",
  },
  content: {
    paddingHorizontal: 20,
  },
  group: {
    marginBottom: 22,
  },
  groupTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 10,
  },
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  applyBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  applyText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
