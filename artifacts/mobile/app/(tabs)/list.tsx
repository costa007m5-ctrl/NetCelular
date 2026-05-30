import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { ContentCard } from "@/components/ContentCard";
import { db } from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";
import { MY_LIST } from "@/constants/content";
import type { ContentItem } from "@/constants/content";

export default function ListScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [list, setList] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState("");

  const loadList = useCallback(async (devId: string) => {
    try {
      const items = await db.watchlist.getAll(devId);
      if (items.length > 0) {
        const content: ContentItem[] = items.map((w) => ({
          id: String(w.tmdb_id),
          tmdbId: w.tmdb_id,
          title: w.title ?? "Título desconhecido",
          year: 2024,
          rating: 0,
          posterPath: w.poster_path ?? "",
          backdropPath: w.backdrop_path ?? "",
          description: "",
          genres: [],
          type: w.type === "movie" ? "movie" : "series",
          mediaType: w.type,
        }));
        setList(content);
      } else {
        setList(MY_LIST);
      }
    } catch {
      setList(MY_LIST);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getDeviceId().then((id) => {
      setDeviceId(id);
      loadList(id);
    });
  }, [loadList]);

  const removeItem = async (item: ContentItem) => {
    const type = item.mediaType ?? (item.type === "movie" ? "movie" : "tv");
    const tmdbId = item.tmdbId ?? Number(item.id);
    setList((prev) => prev.filter((x) => x.id !== item.id));
    if (deviceId) {
      await db.watchlist.remove(deviceId, tmdbId, type as "movie" | "tv");
    }
  };

  const goToPlayer = (item: ContentItem) => {
    router.push({
      pathname: "/player",
      params: {
        type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"),
        id: String(item.tmdbId ?? item.id),
        title: item.title,
      },
    });
  };

  const CARD_WIDTH = 104;
  const CARD_HEIGHT = 152;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Minha Lista</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {list.length} {list.length === 1 ? "título" : "títulos"} salvos
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : list.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="bookmark" size={44} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>Lista vazia</Text>
          <Text style={[styles.emptyDesc, { color: colors.border }]}>
            Adicione filmes e séries para assistir depois
          </Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <ContentCard
                item={item}
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
                onPress={() => goToPlayer(item)}
              />
              <Pressable
                onPress={() => removeItem(item)}
                style={[styles.removeBtn, { backgroundColor: colors.card }]}
              >
                <Feather name="x" size={12} color={colors.mutedForeground} />
              </Pressable>
              <Text
                style={[styles.cardTitle, { color: colors.mutedForeground }]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 4 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 18, fontWeight: "600" },
  emptyDesc: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  cardWrap: { margin: 5, alignItems: "center", position: "relative" },
  removeBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: "500",
    marginTop: 5,
    width: 104,
    textAlign: "center",
  },
});
