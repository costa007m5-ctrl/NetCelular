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

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

interface SpeedSelectorProps {
  visible: boolean;
  onClose: () => void;
  currentSpeed: number;
  onSelect: (speed: number) => void;
}

export function SpeedSelector({ visible, onClose, currentSpeed, onSelect }: SpeedSelectorProps) {
  const colors = useColors();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <Feather name="fast-forward" size={18} color={colors.primary} />
            <Text style={[styles.title, { color: colors.foreground }]}>Velocidade</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View style={styles.speeds}>
            {SPEEDS.map((speed) => {
              const active = currentSpeed === speed;
              return (
                <Pressable
                  key={speed}
                  onPress={() => { onSelect(speed); onClose(); }}
                  style={({ pressed }) => [
                    styles.speedBtn,
                    {
                      backgroundColor: active ? `${colors.primary}18` : colors.muted,
                      borderColor: active ? colors.primary : colors.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.speedLabel,
                      { color: active ? colors.primary : colors.foreground },
                    ]}
                  >
                    {speed === 1.0 ? "Normal" : `${speed}×`}
                  </Text>
                  {active && <Feather name="check" size={13} color={colors.primary} />}
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
  speeds: {
    paddingHorizontal: 20,
    gap: 8,
  },
  speedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  speedLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
});
