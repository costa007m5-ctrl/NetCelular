import React, { useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { ContentCard } from "@/components/ContentCard";
import { TRENDING, TOP_10_SERIES, CONTINUE_WATCHING } from "@/constants/content";
import type { ContentItem } from "@/constants/content";

const ALL_CONTENT = [...TRENDING, ...TOP_10_SERIES, ...CONTINUE_WATCHING];

const GENRE_FILTERS = ["Ação", "Drama", "Ficção Científica", "Terror", "Crime", "Aventura", "Comédia"];

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [query, setQuery] = useState("");
  const [activeGenre, setActiveGenre] = useState<string | null>(null);

  const filtered = ALL_CONTENT.filter((item) => {
    const matchQuery = query.trim() === "" || item.title.toLowerCase().includes(query.toLowerCase());
    const matchGenre = !activeGenre || item.genres.includes(activeGenre);
    return matchQuery && matchGenre;
  }).filter((item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx);

  const CARD_WIDTH = 110;
  const CARD_HEIGHT = 160;
  const numColumns = 3;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      <View style={[styles.topBar, { paddingTop: topPad + 8 }]}>
        <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Buscar filmes, séries..."
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.genreScroll}
          style={{ marginTop: 14 }}
        >
          <Pressable
            onPress={() => setActiveGenre(null)}
            style={[
              styles.genrePill,
              {
                backgroundColor: !activeGenre ? colors.primary : colors.card,
                borderColor: !activeGenre ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={[styles.genreText, { color: !activeGenre ? "#fff" : colors.mutedForeground }]}>
              Todos
            </Text>
          </Pressable>
          {GENRE_FILTERS.map((g) => (
            <Pressable
              key={g}
              onPress={() => setActiveGenre(g === activeGenre ? null : g)}
              style={[
                styles.genrePill,
                {
                  backgroundColor: g === activeGenre ? colors.primary : colors.card,
                  borderColor: g === activeGenre ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.genreText, { color: g === activeGenre ? "#fff" : colors.mutedForeground }]}>
                {g}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="search" size={40} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>
            Nenhum resultado
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.border }]}>
            Tente outro título ou gênero
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          contentContainerStyle={[styles.grid, { paddingBottom: 120 }]}
          renderItem={({ item }) => (
            <View style={{ margin: 5 }}>
              <ContentCard item={item} width={CARD_WIDTH} height={CARD_HEIGHT} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "400",
  },
  genreScroll: {
    gap: 8,
    paddingRight: 18,
  },
  genrePill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  genreText: {
    fontSize: 12,
    fontWeight: "600",
  },
  grid: {
    paddingHorizontal: 10,
    paddingTop: 4,
    alignItems: "center" as any,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  emptyDesc: {
    fontSize: 13,
  },
});
