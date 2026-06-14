import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FRANCHISES, GENRE_SECTIONS, type Franchise } from "@/constants/franchises";
import { api, TMDB_IMG } from "@/lib/api";
import { useFavorites } from "@/hooks/useFavorites";

const { width: W } = Dimensions.get("window");
const COLS = 2;
const GAP = 12;
const SIDE = 16;
const CARD_W = (W - SIDE * 2 - GAP) / COLS;
const CARD_H = CARD_W * 1.3;

const _imgCache = new Map<string, string | null>();
const _logoCache = new Map<string, string | null>();

async function loadImage(f: Franchise): Promise<string | null> {
  if (_imgCache.has(f.id)) return _imgCache.get(f.id)!;
  try {
    let path: string | null = null;
    if (f.fetchType === "collection" && f.tmdbCollectionId) {
      const d = await api.tmdb.collection(f.tmdbCollectionId);
      path = d.backdrop_path;
    } else if (f.tmdbTvId) {
      const d = await (api.tmdb.tv(f.tmdbTvId) as Promise<any>);
      path = d.backdrop_path ?? null;
    }
    const url = path ? TMDB_IMG(path, "w780") ?? null : null;
    _imgCache.set(f.id, url);
    return url;
  } catch {
    _imgCache.set(f.id, null);
    return null;
  }
}

async function loadLogo(f: Franchise): Promise<string | null> {
  if (_logoCache.has(f.id)) return _logoCache.get(f.id)!;
  try {
    let type: "collection" | "tv" | "movie" = "movie";
    let id = 0;
    if ((f as any).tmdbLogoId && (f as any).tmdbLogoType) { type = (f as any).tmdbLogoType; id = (f as any).tmdbLogoId; }
    else if (f.fetchType === "collection" && f.tmdbCollectionId) { type = "collection"; id = f.tmdbCollectionId; }
    else if (f.tmdbTvId) { type = "tv"; id = f.tmdbTvId; }
    if (!id) { _logoCache.set(f.id, null); return null; }
    const data = await api.tmdb.franchiseLogo(type, id);
    const url = data.logo_path ? TMDB_IMG(data.logo_path, "w500") ?? null : null;
    _logoCache.set(f.id, url);
    return url;
  } catch {
    _logoCache.set(f.id, null);
    return null;
  }
}

function GenreCard({
  franchise,
  onPress,
  isFav,
  onFavPress,
}: {
  franchise: Franchise;
  onPress: () => void;
  isFav: boolean;
  onFavPress: () => void;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(_imgCache.get(franchise.id) ?? null);
  const [logoUrl, setLogoUrl] = useState<string | null>(_logoCache.get(franchise.id) ?? null);
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadImage(franchise).then(setImgUrl);
    loadLogo(franchise).then(setLogoUrl);
  }, [franchise.id]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 30, bounciness: 4 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 4 }).start()}
    >
      <Animated.View style={[styles.card, { width: CARD_W, height: CARD_H, transform: [{ scale }] }]}>
        {imgUrl
          ? <Image source={{ uri: imgUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <LinearGradient colors={franchise.bgGradient} style={StyleSheet.absoluteFill} />}
        <LinearGradient
          colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.9)"]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.cardAccent, { backgroundColor: franchise.color }]} />

        <Pressable onPress={onFavPress} style={styles.heartBtn} hitSlop={8}>
          <Feather name="heart" size={13} color={isFav ? "#FF3B30" : "rgba(255,255,255,0.65)"} />
        </Pressable>

        <View style={styles.logoArea}>
          {logoUrl
            ? <Image source={{ uri: logoUrl }} style={styles.logoImg} resizeMode="contain" />
            : <Text style={[styles.nameText, { color: franchise.accentColor }]} numberOfLines={2}>{franchise.shortName}</Text>}
        </View>

        <View style={styles.cardBottom}>
          <View style={[styles.badge, { backgroundColor: franchise.color + "33", borderColor: franchise.color + "55" }]}>
            <Text style={[styles.badgeText, { color: franchise.accentColor }]}>{franchise.contentCount} títulos</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function FranchisesGenreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { genre, label } = useLocalSearchParams<{ genre: string; label: string }>();
  const { isFavorite, toggle } = useFavorites();

  const genreLabel = label ?? GENRE_SECTIONS.find(g => g.genre === genre)?.label ?? genre;
  const items = FRANCHISES.filter(f => f.genre === genre);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{genreLabel}</Text>
          <Text style={styles.headerSub}>{items.length} franquias</Text>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={i => i.id}
        numColumns={COLS}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={{ gap: GAP }}
        ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
        renderItem={({ item }) => (
          <GenreCard
            franchise={item}
            onPress={() => router.push({ pathname: "/franchise", params: { id: item.id } })}
            isFav={isFavorite(item.id)}
            onFavPress={() => toggle(item.id)}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)",
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  headerSub: { color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 1 },
  grid: { padding: SIDE, paddingBottom: 40 },
  card: { borderRadius: 16, overflow: "hidden", position: "relative" },
  cardAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 2, zIndex: 2 },
  heartBtn: {
    position: "absolute", top: 10, right: 10, zIndex: 4,
    backgroundColor: "rgba(0,0,0,0.55)", width: 28, height: 28,
    borderRadius: 14, alignItems: "center", justifyContent: "center",
  },
  logoArea: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 44,
    zIndex: 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 10,
  },
  logoImg: { width: "85%", height: 56 },
  nameText: { fontSize: 16, fontWeight: "900", textAlign: "center" },
  cardBottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 10, zIndex: 2 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: "700" },
});
