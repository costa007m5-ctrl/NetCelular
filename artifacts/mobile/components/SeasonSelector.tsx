import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface Season {
  season_number: number;
  name?: string;
  episode_count?: number;
  air_date?: string;
}

interface SeasonSelectorProps {
  seasons: Season[];
  activeSeason: number;
  onSelect: (season: number) => void;
}

export function SeasonSelector({ seasons, activeSeason, onSelect }: SeasonSelectorProps) {
  const colors = useColors();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {seasons
        .filter((s) => s.season_number >= 1)
        .map((season) => {
          const isActive = season.season_number === activeSeason;
          return (
            <Pressable
              key={season.season_number}
              onPress={() => onSelect(season.season_number)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: isActive ? `${colors.primary}18` : colors.muted,
                  borderColor: isActive ? colors.primary : colors.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  { color: isActive ? colors.primary : colors.foreground },
                ]}
              >
                {season.name ?? `Temporada ${season.season_number}`}
              </Text>
              {season.episode_count !== undefined && (
                <Text style={[styles.epCount, { color: colors.mutedForeground }]}>
                  {season.episode_count} eps
                </Text>
              )}
            </Pressable>
          );
        })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 2,
  },
  chip: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: "center",
    gap: 2,
    minWidth: 80,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.2,
    textAlign: "center",
  },
  epCount: {
    fontSize: 10,
    fontWeight: "400",
  },
});
