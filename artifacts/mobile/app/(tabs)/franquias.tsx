import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FRANCHISES, FEATURED_FRANCHISE, type Franchise } from "@/constants/franchises";

const { width: W } = Dimensions.get("window");
const CARD_W = Math.floor((W - 48) / 2);
const CARD_H = 160;

type Category = "todos" | "filmes" | "series" | "anime";

const CATEGORIES: { id: Category; label: string; emoji: string }[] = [
  { id: "todos",  label: "Todos",  emoji: "🌌" },
  { id: "filmes", label: "Filmes", emoji: "🎬" },
  { id: "series", label: "Séries", emoji: "📺" },
  { id: "anime",  label: "Animes", emoji: "🎌" },
];

function FranchiseCard({ franchise, onPress }: { franchise: Franchise; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 30, bounciness: 4 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 4 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[styles.card, { width: CARD_W, height: CARD_H, transform: [{ scale }] }]}>
        <LinearGradient
          colors={franchise.bgGradient}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={[styles.cardTopAccent, { backgroundColor: franchise.color }]} />
        <View style={[styles.cardGlow, { backgroundColor: franchise.color }]} />

        <View style={styles.cardContent}>
          <Text style={styles.cardEmoji}>{franchise.emoji}</Text>
          <Text style={[styles.cardName, { color: "#fff" }]} numberOfLines={2}>
            {franchise.shortName}
          </Text>
          <View style={[styles.cardBadge, { backgroundColor: franchise.color + "33", borderColor: franchise.color + "66" }]}>
            <Text style={[styles.cardBadgeText, { color: franchise.accentColor }]}>
              {franchise.contentCount} conteúdos
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function FeaturedCard({ franchise, onPress }: { franchise: Franchise; onPress: () => void }) {
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });

  return (
    <Pressable onPress={onPress} style={styles.featuredCard}>
      <LinearGradient
        colors={franchise.bgGradient}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <Animated.View
        style={[styles.featuredGlow, { backgroundColor: franchise.color, opacity: glowOpacity }]}
      />

      <View style={[styles.featuredAccent, { backgroundColor: franchise.color }]} />

      <View style={styles.featuredBadge}>
        <Feather name="star" size={10} color="#FFD700" />
        <Text style={styles.featuredBadgeText}>EM ALTA</Text>
      </View>

      <View style={styles.featuredContent}>
        <Text style={styles.featuredEmoji}>{franchise.emoji}</Text>
        <Text style={[styles.featuredName, { color: "#fff" }]}>{franchise.name.toUpperCase()}</Text>
        <Text style={[styles.featuredTagline, { color: franchise.accentColor }]}>
          {franchise.tagline}
        </Text>
        <Text style={styles.featuredMeta}>
          {franchise.contentCount} conteúdos · {franchise.yearRange}
        </Text>

        <TouchableOpacity
          onPress={onPress}
          style={[styles.exploreBtn, { backgroundColor: franchise.color }]}
        >
          <Feather name="play" size={14} color="#fff" />
          <Text style={styles.exploreBtnText}>EXPLORAR</Text>
        </TouchableOpacity>
      </View>
    </Pressable>
  );
}

export default function FranquiasScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [activeCategory, setActiveCategory] = useState<Category>("todos");
  const [search, setSearch] = useState("");

  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(headerAnim, { toValue: 1, duration: 4000, useNativeDriver: true }),
        Animated.timing(headerAnim, { toValue: 0, duration: 4000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const orb1Opacity = headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.4] });
  const orb2Opacity = headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.15] });

  const filtered = FRANCHISES.filter((f) => {
    const matchesCategory = activeCategory === "todos" || f.category === activeCategory;
    const matchesSearch = search.trim() === "" ||
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.tagline.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const goToFranchise = (id: string) =>
    router.push({ pathname: "/franchise", params: { id } });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* ── Cinematic Header ─────────────────────────────── */}
        <View style={[styles.header, { paddingTop: topPad + 20 }]}>
          <LinearGradient
            colors={["#1a0000", "#0d0010", "#000000"]}
            style={StyleSheet.absoluteFill}
          />

          {/* Animated glow orbs */}
          <Animated.View style={[styles.orb1, { opacity: orb1Opacity }]} />
          <Animated.View style={[styles.orb2, { opacity: orb2Opacity }]} />

          {/* Particle dots */}
          {[...Array(12)].map((_, i) => (
            <View
              key={i}
              style={[
                styles.particle,
                {
                  left: (i * 73) % (W - 4),
                  top: 20 + (i * 37) % 160,
                  width: i % 3 === 0 ? 3 : 2,
                  height: i % 3 === 0 ? 3 : 2,
                  opacity: 0.2 + (i % 5) * 0.1,
                },
              ]}
            />
          ))}

          <View style={styles.headerContent}>
            <Text style={styles.headerEmoji}>🌌</Text>
            <Text style={styles.headerTitle}>UNIVERSOS NETPLAY</Text>
            <Text style={styles.headerSubtitle}>
              Explore sagas e franquias completas
            </Text>

            {/* Search bar */}
            <View style={styles.searchBar}>
              <Feather name="search" size={16} color="rgba(255,255,255,0.5)" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar franquia..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.searchInput}
                returnKeyType="search"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch("")}>
                  <Feather name="x" size={14} color="rgba(255,255,255,0.5)" />
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {/* ── Featured Franchise ────────────────────────────── */}
        {search.trim() === "" && activeCategory === "todos" && (
          <View style={styles.section}>
            <FeaturedCard
              franchise={FEATURED_FRANCHISE}
              onPress={() => goToFranchise(FEATURED_FRANCHISE.id)}
            />
          </View>
        )}

        {/* ── Category Filter ──────────────────────────────── */}
        <View style={styles.section}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScroll}
          >
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setActiveCategory(cat.id)}
                style={[
                  styles.categoryChip,
                  activeCategory === cat.id
                    ? { backgroundColor: "#E50914", borderColor: "#E50914" }
                    : { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.12)" },
                ]}
              >
                <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                <Text
                  style={[
                    styles.categoryLabel,
                    { color: activeCategory === cat.id ? "#fff" : "rgba(255,255,255,0.6)" },
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Franchise Grid ───────────────────────────────── */}
        <View style={[styles.section, styles.grid]}>
          {filtered.map((franchise) => (
            <FranchiseCard
              key={franchise.id}
              franchise={franchise}
              onPress={() => goToFranchise(franchise.id)}
            />
          ))}
          {filtered.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={styles.emptyText}>Nenhuma franquia encontrada</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  // Header
  header: {
    minHeight: 280,
    overflow: "hidden",
    marginBottom: 8,
  },
  headerContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    alignItems: "center",
    zIndex: 2,
  },
  orb1: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "#E50914",
    top: -60,
    left: -40,
    zIndex: 0,
  },
  orb2: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "#6600CC",
    top: 20,
    right: -40,
    zIndex: 0,
  },
  particle: {
    position: "absolute",
    borderRadius: 2,
    backgroundColor: "#fff",
    zIndex: 1,
  },
  headerEmoji: {
    fontSize: 40,
    marginBottom: 10,
    marginTop: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 3,
    textAlign: "center",
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    letterSpacing: 0.5,
    marginBottom: 20,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    width: "100%",
    maxWidth: 360,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },

  // Featured
  section: { paddingHorizontal: 16, marginBottom: 12 },
  featuredCard: {
    height: 200,
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
  },
  featuredGlow: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    top: -80,
    right: -60,
    zIndex: 0,
  },
  featuredAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    zIndex: 2,
  },
  featuredBadge: {
    position: "absolute",
    top: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,215,0,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.4)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    zIndex: 2,
  },
  featuredBadgeText: {
    color: "#FFD700",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  featuredContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 18,
    zIndex: 2,
  },
  featuredEmoji: { fontSize: 28, marginBottom: 6 },
  featuredName: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 2,
  },
  featuredTagline: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  featuredMeta: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    marginBottom: 12,
  },
  exploreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  exploreBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
  },

  // Category
  categoryScroll: { gap: 8, paddingVertical: 4 },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryEmoji: { fontSize: 13 },
  categoryLabel: { fontSize: 13, fontWeight: "700" },

  // Grid
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingBottom: 8,
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  cardTopAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 2,
  },
  cardGlow: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    top: -30,
    right: -20,
    opacity: 0.2,
    zIndex: 0,
  },
  cardContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
    zIndex: 2,
  },
  cardEmoji: { fontSize: 26, marginBottom: 6 },
  cardName: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  cardBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  cardBadgeText: { fontSize: 10, fontWeight: "700" },

  // Empty
  emptyState: {
    width: "100%",
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyEmoji: { fontSize: 40 },
  emptyText: { color: "rgba(255,255,255,0.4)", fontSize: 15 },
});
