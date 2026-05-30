import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { ContentCard } from "@/components/ContentCard";
import { api, tmdbItemToContent } from "@/lib/api";
import type { ContentItem } from "@/constants/content";
import { TRENDING, TOP_10_SERIES } from "@/constants/content";

const MOCK_ALL = [...TRENDING, ...TOP_10_SERIES].filter(
  (item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx
);

const GENRE_FILTERS = [
  "Ação", "Drama", "Ficção Científica", "Terror", "Crime", "Aventura", "Comédia", "Animação",
];

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [query, setQuery] = useState("");
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [results, setResults] = useState<ContentItem[]>(MOCK_ALL);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchTmdb = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults(MOCK_ALL);
      return;
    }
    setSearchLoading(true);
    try {
      const data = await api.tmdb.search(q, "multi");
      const items = data.results
        .filter((r) => r.media_type === "movie" || r.media_type === "tv")
        .map(tmdbItemToContent);
      setResults(items.length > 0 ? items : MOCK_ALL);
    } catch {
      setResults(MOCK_ALL);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchTmdb(query), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchTmdb]);

  const filtered = results.filter((item) => {
    if (!activeGenre) return true;
    return item.genres?.some((g) =>
      g.toLowerCase().includes(activeGenre.toLowerCase())
    );
  });

  const goToPlayer = (item: ContentItem) => {
    router.push({
      pathname: "/player",
      params: {
        type: item.type === "movie" ? "movie" : "tv",
        id: String((item as any).tmdbId ?? item.id),
        title: item.title,
      },
    });
  };

  const CARD_WIDTH = 108;
  const CARD_HEIGHT = 158;

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
          {searchLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : query.length > 0 ? (
            <Pressable onPress={() => setQuery("")}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
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

      {filtered.length === 0 && !searchLoading ? (
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
          numColumns={3}
          contentContainerStyle={[styles.grid, { paddingBottom: 120 }]}
          renderItem={({ item }) => (
            <View style={{ margin: 5 }}>
              <ContentCard
                item={item}
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
                onPress={() => goToPlayer(item)}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  searchInput: { flex: 1, fontSize: 15 },
  genreScroll: { gap: 8, paddingRight: 18 },
  genrePill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  genreText: { fontSize: 12, fontWeight: "600" },
  grid: { paddingHorizontal: 10, paddingTop: 4, alignItems: "center" as any },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyTitle: { fontSize: 17, fontWeight: "600" },
  emptyDesc: { fontSize: 13 },
});
