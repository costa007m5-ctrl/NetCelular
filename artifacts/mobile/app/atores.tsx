import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { useFollowedActors } from "@/hooks/useFollowedActors";

const AMBER  = "#f59e0b";
const RED    = "#e50914";
const PINK   = "#ec4899";
const PURPLE = "#8b5cf6";
const BLUE   = "#3b82f6";
const GREEN  = "#22c55e";
const TEAL   = "#0891b2";
const ORANGE = "#f97316";

const PALETTE = [RED, PINK, PURPLE, BLUE, GREEN, TEAL, ORANGE, AMBER];
const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
const TMDB_IMG = "https://image.tmdb.org/t/p/w185";

function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ACTOR_CATEGORIES: Array<{
  id: string;
  label: string;
  emoji: string;
  color: string;
  actors: Array<{ name: string; initial: string; color: string }>;
}> = [
  {
    id: "hollywood",
    label: "Hollywood",
    emoji: "🎬",
    color: RED,
    actors: [
      { name: "Tom Cruise",         initial: "TC", color: RED    },
      { name: "Leonardo DiCaprio",  initial: "LD", color: BLUE   },
      { name: "Margot Robbie",      initial: "MR", color: PINK   },
      { name: "Timothée Chalamet",  initial: "TC", color: PURPLE },
      { name: "Zendaya",            initial: "ZE", color: AMBER  },
      { name: "Ryan Gosling",       initial: "RG", color: ORANGE },
      { name: "Ana de Armas",       initial: "AA", color: GREEN  },
      { name: "Florence Pugh",      initial: "FP", color: ORANGE },
      { name: "Cate Blanchett",     initial: "CB", color: TEAL   },
      { name: "Robert Downey Jr.",  initial: "RD", color: RED    },
      { name: "Scarlett Johansson", initial: "SJ", color: PURPLE },
      { name: "Chris Evans",        initial: "CE", color: BLUE   },
    ],
  },
  {
    id: "kdrama",
    label: "K-Drama",
    emoji: "🇰🇷",
    color: PINK,
    actors: [
      { name: "Song Joong-ki",   initial: "SJ", color: PINK   },
      { name: "Park Seo-jun",    initial: "PS", color: PURPLE },
      { name: "Hyun Bin",        initial: "HB", color: BLUE   },
      { name: "Lee Jong-suk",    initial: "LJ", color: GREEN  },
      { name: "IU",              initial: "IU", color: AMBER  },
      { name: "Park Min-young",  initial: "PM", color: ORANGE },
      { name: "Son Ye-jin",      initial: "SY", color: PINK   },
      { name: "Lee Min-ho",      initial: "LM", color: TEAL   },
      { name: "Park Shin-hye",   initial: "PS", color: PURPLE },
      { name: "Kim Soo-hyun",    initial: "KS", color: BLUE   },
    ],
  },
  {
    id: "brasileiros",
    label: "Brasileiros",
    emoji: "🇧🇷",
    color: GREEN,
    actors: [
      { name: "Wagner Moura",     initial: "WM", color: GREEN  },
      { name: "Alice Braga",      initial: "AB", color: AMBER  },
      { name: "Rodrigo Santoro",  initial: "RS", color: BLUE   },
      { name: "Fernanda Montenegro", initial: "FM", color: PINK },
      { name: "Lázaro Ramos",     initial: "LR", color: ORANGE },
      { name: "Taís Araújo",      initial: "TA", color: PURPLE },
      { name: "Pedro Pascal",     initial: "PP", color: TEAL   },
      { name: "Seu Jorge",        initial: "SJ", color: GREEN  },
      { name: "Bruna Marquezine", initial: "BM", color: PINK   },
      { name: "Caio Blat",        initial: "CB", color: BLUE   },
    ],
  },
  {
    id: "japoneses",
    label: "Japoneses",
    emoji: "🇯🇵",
    color: RED,
    actors: [
      { name: "Ken Watanabe",    initial: "KW", color: RED    },
      { name: "Hiroyuki Sanada", initial: "HS", color: AMBER  },
      { name: "Rinko Kikuchi",   initial: "RK", color: PINK   },
      { name: "Masaki Suda",     initial: "MS", color: PURPLE },
      { name: "Takuya Kimura",   initial: "TK", color: BLUE   },
      { name: "Yū Aoi",          initial: "YA", color: GREEN  },
      { name: "Ryo Kase",        initial: "RK", color: TEAL   },
      { name: "Eita Nagayama",   initial: "EN", color: ORANGE },
    ],
  },
  {
    id: "europeus",
    label: "Europeus",
    emoji: "🌍",
    color: PURPLE,
    actors: [
      { name: "Marion Cotillard", initial: "MC", color: PINK   },
      { name: "Javier Bardem",    initial: "JB", color: ORANGE },
      { name: "Penélope Cruz",    initial: "PC", color: RED    },
      { name: "Idris Elba",       initial: "IE", color: BLUE   },
      { name: "Sophie Turner",    initial: "ST", color: AMBER  },
      { name: "Rami Malek",       initial: "RM", color: PURPLE },
      { name: "Tilda Swinton",    initial: "TS", color: TEAL   },
      { name: "Antonio Banderas", initial: "AB", color: ORANGE },
    ],
  },
];

const _photoCache: Record<string, string | null> = {};
let _fetchActive = 0;
const _fetchQueue: Array<() => void> = [];
function drainQueue() {
  while (_fetchActive < 4 && _fetchQueue.length > 0) {
    _fetchActive++;
    _fetchQueue.shift()!();
  }
}

function ActorCircle({
  actor,
  photoUrl,
  onPress,
  isFollowed,
  onFollow,
}: {
  actor: { name: string; initial: string; color: string };
  photoUrl?: string | null;
  onPress: () => void;
  isFollowed: boolean;
  onFollow: () => void;
}) {
  const [photo, setPhoto] = useState<string | null>(photoUrl ?? null);
  const [photoErr, setPhotoErr] = useState(false);
  const sc = useRef(new Animated.Value(1)).current;
  const followScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (photoUrl !== undefined) { setPhoto(photoUrl); return; }
    if (_photoCache[actor.name] !== undefined) { setPhoto(_photoCache[actor.name]); return; }
    let cancelled = false;
    const doFetch = () => {
      fetch(
        `https://api.themoviedb.org/3/search/person?api_key=${TMDB_KEY}&query=${encodeURIComponent(actor.name)}&language=pt-BR`
      )
        .then((r) => r.json())
        .then((d) => {
          const path: string | null = d.results?.[0]?.profile_path ?? null;
          const url = path ? `${TMDB_IMG}${path}` : null;
          _photoCache[actor.name] = url;
          if (!cancelled) setPhoto(url);
        })
        .catch(() => { _photoCache[actor.name] = null; })
        .finally(() => { _fetchActive = Math.max(0, _fetchActive - 1); drainQueue(); });
    };
    if (_fetchActive < 4) { _fetchActive++; doFetch(); }
    else { _fetchQueue.push(doFetch); }
    return () => { cancelled = true; };
  }, [actor.name, photoUrl]);

  const handleFollow = () => {
    Animated.sequence([
      Animated.timing(followScale, { toValue: 0.7, duration: 80, useNativeDriver: true }),
      Animated.spring(followScale, { toValue: 1, useNativeDriver: true, tension: 320, friction: 5 }),
    ]).start();
    onFollow();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(sc, { toValue: 0.88, useNativeDriver: true, speed: 30 }).start()}
      onPressOut={() => Animated.spring(sc, { toValue: 1, useNativeDriver: true, speed: 26 }).start()}
    >
      <Animated.View style={[st.circleWrap, { transform: [{ scale: sc }] }]}>
        <View style={{ position: "relative" }}>
          <View style={[st.circle, { borderColor: isFollowed ? actor.color : `${actor.color}55` }]}>
            {!photoErr && photo ? (
              <Image source={{ uri: photo }} style={{ width: "100%", height: "100%" }}
                contentFit="cover" onError={() => setPhotoErr(true)} />
            ) : (
              <>
                <LinearGradient colors={[`${actor.color}45`, `${actor.color}18`]} style={StyleSheet.absoluteFill} />
                <Text style={[st.initial, { color: actor.color }]}>{actor.initial}</Text>
              </>
            )}
          </View>
          <Animated.View style={[st.followBtn, { transform: [{ scale: followScale }] }]}>
            <Pressable onPress={handleFollow} hitSlop={6} style={[
              st.followBtnInner,
              isFollowed
                ? { backgroundColor: actor.color }
                : { backgroundColor: "rgba(0,0,0,0.7)", borderWidth: 1.5, borderColor: `${actor.color}88` }
            ]}>
              <Feather name={isFollowed ? "user-check" : "user-plus"} size={10}
                color={isFollowed ? "#fff" : actor.color} />
            </Pressable>
          </Animated.View>
        </View>
        {isFollowed && (
          <View style={[st.followingBadge, { backgroundColor: `${actor.color}22`, borderColor: `${actor.color}55` }]}>
            <Text style={[st.followingText, { color: actor.color }]}>Seguindo</Text>
          </View>
        )}
        <Text style={st.name} numberOfLines={2}>{actor.name}</Text>
      </Animated.View>
    </Pressable>
  );
}

interface TmdbActorResult {
  id: number;
  name: string;
  profile_path: string | null;
  popularity: number;
}

export default function AtoresScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const { followedActors, followActor, isFollowing } = useFollowedActors();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [tmdbResults, setTmdbResults] = useState<TmdbActorResult[]>([]);
  const [tmdbSearching, setTmdbSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Debounced TMDB search ────────────────────────────────────────────────
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || q.length < 2) { setTmdbResults([]); setTmdbSearching(false); return; }
    setTmdbSearching(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://api.themoviedb.org/3/search/person?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&language=pt-BR`
        );
        if (!r.ok) return;
        const d = await r.json() as any;
        const results: TmdbActorResult[] = (d.results ?? [])
          .filter((x: any) => x.known_for_department === "Acting" || x.popularity > 1)
          .slice(0, 20);
        setTmdbResults(results);
      } catch { setTmdbResults([]); }
      finally { setTmdbSearching(false); }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return ACTOR_CATEGORIES;
    const q = searchQuery.trim().toLowerCase();
    return ACTOR_CATEGORIES.map((cat) => ({
      ...cat,
      actors: cat.actors.filter((a) => a.name.toLowerCase().includes(q)),
    })).filter((cat) => cat.actors.length > 0);
  }, [searchQuery]);

  // Merge hardcoded names so we don't duplicate in TMDB results
  const allHardcodedNames = useMemo(() => {
    const s = new Set<string>();
    ACTOR_CATEGORIES.forEach((c) => c.actors.forEach((a) => s.add(a.name.toLowerCase())));
    return s;
  }, []);

  const dedupedTmdbResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return tmdbResults.filter((r) => !allHardcodedNames.has(r.name.toLowerCase()));
  }, [tmdbResults, searchQuery, allHardcodedNames]);

  const isSearching = searchQuery.trim().length >= 2;

  return (
    <View style={st.root}>
      <StatusBar style="light" />

      {/* ── Header ── */}
      <View style={[st.header, { paddingTop: topPad + 10 }]}>
        <Pressable onPress={() => router.back()} hitSlop={14} style={st.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={st.logoRow}>
          <View style={st.logoAccent} />
          <Text style={[st.logoA, { color: AMBER }]}>ATOR</Text>
          <Text style={st.logoB}>ES</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {/* ── Search bar ── */}
      <View style={st.searchWrap}>
        <View style={[st.searchBar, searchFocused && st.searchBarFocused]}>
          {tmdbSearching
            ? <ActivityIndicator size="small" color={AMBER} />
            : <Feather name="search" size={15} color={searchFocused ? AMBER : "rgba(255,255,255,0.4)"} />
          }
          <TextInput
            style={st.searchInput}
            placeholder="Buscar qualquer ator no TMDB..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <Feather name="x" size={14} color="rgba(255,255,255,0.4)" />
            </Pressable>
          )}
        </View>
        {isSearching && (
          <Text style={st.searchHint}>🔍 Buscando em toda a base do TMDB</Text>
        )}
      </View>

      {/* ── Subtitle ── */}
      {!searchQuery && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <Text style={st.subtitle}>
            Toque em qualquer ator para explorar sua filmografia · Toque em + para seguir
          </Text>
        </View>
      )}

      {/* ── Content ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Seguindo section ── */}
        {followedActors.length > 0 && !searchQuery && (
          <View style={st.catSection}>
            <View style={st.catHeader}>
              <View style={[st.catBar, { backgroundColor: AMBER }]} />
              <Text style={st.catEmoji}>⭐</Text>
              <Text style={[st.catLabel, { color: AMBER }]}>Seguindo</Text>
              <View style={[st.followCountBadge, { backgroundColor: `${AMBER}22`, borderColor: `${AMBER}44` }]}>
                <Text style={[st.followCountText, { color: AMBER }]}>{followedActors.length}</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={st.actorRow} decelerationRate="fast">
              {followedActors.map((a) => (
                <ActorCircle key={`seguindo-${a.name}`} actor={a} isFollowed={true}
                  onFollow={() => followActor(a)}
                  onPress={() => router.push({ pathname: "/actor-browse", params: { name: a.name, color: a.color } })}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── TMDB search results ── */}
        {isSearching && (
          <View style={st.catSection}>
            <View style={st.catHeader}>
              <View style={[st.catBar, { backgroundColor: BLUE }]} />
              <Text style={st.catEmoji}>🌐</Text>
              <Text style={[st.catLabel, { color: BLUE }]}>Resultados TMDB</Text>
              {tmdbSearching && <ActivityIndicator size="small" color={BLUE} style={{ marginLeft: 6 }} />}
              {!tmdbSearching && (
                <View style={[st.followCountBadge, { backgroundColor: `${BLUE}22`, borderColor: `${BLUE}44` }]}>
                  <Text style={[st.followCountText, { color: BLUE }]}>
                    {filteredCategories.reduce((n, c) => n + c.actors.length, 0) + dedupedTmdbResults.length}
                  </Text>
                </View>
              )}
            </View>

            {/* Hardcoded matches first */}
            {filteredCategories.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={st.actorRow} decelerationRate="fast">
                {filteredCategories.flatMap((cat) =>
                  cat.actors.map((a) => (
                    <ActorCircle key={`search-${cat.id}-${a.name}`} actor={a}
                      isFollowed={isFollowing(a.name)}
                      onFollow={() => followActor(a)}
                      onPress={() => router.push({ pathname: "/actor-browse", params: { name: a.name, color: a.color } })}
                    />
                  ))
                )}
              </ScrollView>
            )}

            {/* TMDB-only results */}
            {dedupedTmdbResults.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={[st.actorRow, { marginTop: filteredCategories.length > 0 ? 14 : 0 }]}
                decelerationRate="fast">
                {dedupedTmdbResults.map((r) => {
                  const actor = {
                    name: r.name,
                    initial: initialsFor(r.name),
                    color: colorForName(r.name),
                  };
                  const photoUrl = r.profile_path ? `${TMDB_IMG}${r.profile_path}` : null;
                  return (
                    <ActorCircle key={`tmdb-${r.id}`} actor={actor} photoUrl={photoUrl}
                      isFollowed={isFollowing(r.name)}
                      onFollow={() => followActor(actor)}
                      onPress={() => router.push({ pathname: "/actor-browse", params: { name: r.name, color: actor.color } })}
                    />
                  );
                })}
              </ScrollView>
            )}

            {!tmdbSearching && filteredCategories.length === 0 && dedupedTmdbResults.length === 0 && (
              <View style={{ paddingHorizontal: 16, paddingVertical: 20, alignItems: "center", gap: 8 }}>
                <Feather name="user-x" size={32} color="rgba(255,255,255,0.12)" />
                <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                  Nenhum ator encontrado para "{searchQuery}"
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Hardcoded categories (when not searching) ── */}
        {!isSearching && filteredCategories.map((cat) => (
          <View key={cat.id} style={st.catSection}>
            <View style={st.catHeader}>
              <View style={[st.catBar, { backgroundColor: cat.color }]} />
              <Text style={st.catEmoji}>{cat.emoji}</Text>
              <Text style={[st.catLabel, { color: cat.color }]}>{cat.label}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={st.actorRow} decelerationRate="fast">
              {cat.actors.map((a) => (
                <ActorCircle key={`${cat.id}-${a.name}`} actor={a}
                  isFollowed={isFollowing(a.name)}
                  onFollow={() => followActor(a)}
                  onPress={() => router.push({ pathname: "/actor-browse", params: { name: a.name, color: a.color } })}
                />
              ))}
            </ScrollView>
          </View>
        ))}

        {/* ── "Não encontrou?" search prompt ── */}
        {!isSearching && (
          <Pressable style={st.notFoundWrap} onPress={() => setSearchFocused(true)}>
            <LinearGradient colors={["rgba(245,158,11,0.08)", "rgba(245,158,11,0.02)"]}
              style={StyleSheet.absoluteFill} />
            <View style={st.notFoundIcon}>
              <Feather name="search" size={20} color={AMBER} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.notFoundTitle}>Não encontrou seu favorito?</Text>
              <Text style={st.notFoundSub}>Digite o nome para buscar qualquer ator no TMDB</Text>
            </View>
            <Feather name="chevron-right" size={16} color="rgba(245,158,11,0.5)" />
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  logoAccent: { width: 3, height: 22, borderRadius: 2, backgroundColor: AMBER },
  logoA: { fontSize: 22, fontWeight: "900", letterSpacing: 1 },
  logoB: { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: 1 },
  searchWrap: { paddingHorizontal: 16, marginBottom: 8 },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14, paddingVertical: 10,
  },
  searchBarFocused: { borderColor: `${AMBER}55`, backgroundColor: "rgba(245,158,11,0.06)" },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "500" },
  searchHint: {
    marginTop: 6, marginLeft: 4,
    fontSize: 11, color: "rgba(255,255,255,0.3)", fontStyle: "italic",
  },
  subtitle: {
    fontSize: 12, color: "rgba(255,255,255,0.38)", lineHeight: 18, fontStyle: "italic",
  },
  catSection: { marginBottom: 30 },
  catHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, marginBottom: 14, gap: 8,
  },
  catBar: { width: 3, height: 16, borderRadius: 2 },
  catEmoji: { fontSize: 15 },
  catLabel: { fontSize: 14, fontWeight: "800", letterSpacing: 0.3 },
  followCountBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, marginLeft: 4,
  },
  followCountText: { fontSize: 11, fontWeight: "800" },
  actorRow: { paddingHorizontal: 16, gap: 14, alignItems: "flex-start" },
  circleWrap: { alignItems: "center", gap: 5, width: 76 },
  circle: {
    width: 68, height: 68, borderRadius: 34, overflow: "hidden",
    borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: "#111",
  },
  initial: { fontSize: 22, fontWeight: "900" },
  name: { fontSize: 11, fontWeight: "600", color: "#fff", textAlign: "center", lineHeight: 15 },
  followBtn: { position: "absolute", bottom: -2, right: -2 },
  followBtnInner: {
    width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
  },
  followingBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, marginTop: 2,
  },
  followingText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  notFoundWrap: {
    marginHorizontal: 16, marginTop: 8, marginBottom: 24,
    borderRadius: 14, borderWidth: 1, borderColor: "rgba(245,158,11,0.2)",
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 16, overflow: "hidden",
  },
  notFoundIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(245,158,11,0.12)", alignItems: "center", justifyContent: "center",
  },
  notFoundTitle: { fontSize: 14, fontWeight: "700", color: "#fff", marginBottom: 3 },
  notFoundSub: { fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 16 },
});
