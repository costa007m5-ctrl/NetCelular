import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface GenreChip {
  id: string | number;
  label: string;
  color?: string;
}

interface GenreChipRowProps {
  chips: GenreChip[];
  selected?: string | number | null;
  onSelect?: (id: string | number) => void;
  scrollable?: boolean;
}

export function GenreChipRow({
  chips,
  selected,
  onSelect,
  scrollable = true,
}: GenreChipRowProps) {
  const colors = useColors();

  const content = chips.map((chip) => {
    const isSelected = selected === chip.id;
    const accent = chip.color ?? colors.primary;
    return (
      <Pressable
        key={chip.id}
        onPress={() => onSelect?.(chip.id)}
        style={({ pressed }) => [
          styles.chip,
          {
            backgroundColor: isSelected ? accent : `${accent}12`,
            borderColor: isSelected ? accent : `${accent}30`,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        {isSelected && (
          <View style={[styles.dot, { backgroundColor: "#fff" }]} />
        )}
        <Text
          style={[
            styles.label,
            { color: isSelected ? "#fff" : accent },
          ]}
        >
          {chip.label}
        </Text>
      </Pressable>
    );
  });

  if (!scrollable) {
    return <View style={styles.wrap}>{content}</View>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  scroll: {
    paddingHorizontal: 20,
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
