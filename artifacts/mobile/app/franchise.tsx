import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FRANCHISES, getFranchise, type ChronologicalItem } from "@/constants/franchises";
import { api, tmdbItemToContent, TMDB_IMG } from "@/lib/api";
import { useFavorites } from "@/hooks/useFavorites";
import type { ContentItem } from "@/constants/content";

const { width: W } = Dimensions.get("window");
const BG     = "#050508";
const GLASS  = "rgba(255,255,255,0.07)";
const GLASS_B = "rgba(255,255,255,0.12)";
const HERO_H = 430;
const CARD_W = 130;
const CARD_H = 190;
const WIDE_H = Math.round((W - 32) * 9 / 16);

type Tab = "filmes" | "series" | "cronologia";
type SortKey = "rating" | "year" | "az";

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

async function fetchBackdrop(franchise: any, tmdbColId?: number | null): Promise<string | null> {
  try {
    let path: string | null = null;
    if (tmdbColId) {
      const d = await api.tmdb.collection(tmdbColId);
      path = d.backdrop_path;
    } else if (franchise?.fetchType === "collection" && franchise.tmdbCollectionId) {
      const d = await api.tmdb.collection(franchise.tmdbCollectionId);
      path = d.backdrop_path;
    } else if (franchise?.tmdbTvId) {
      const d = await (api.tmdb.tv(franchise.tmdbTvId) as Promise<any>);
      path = d.backdrop_path ?? null;
    } else if (franchise) {
      const q = franchise.searchQuery ?? franchise.name;
      const type = franchise.category === "anime" ? "tv" : "movie";
      const d = await api.tmdb.search(q, type as any);
      path = d.results[0]?.backdrop_path ?? null;
    }
    return path ? (TMDB_IMG(path, "w1280") ?? null) : null;
  } catch { return null; }
}

async function fetchLogo(franchise: any): Promise<string | null> {
  if (!franchise) return null;
  try {
    let type: "collection" | "tv" | "movie" = "movie";
    let id = 0;
    if (franchise.fetchType === "collection" && franchise.tmdbCollectionId) { type = "collection"; id = franchise.tmdbCollectionId; }
    else if (franchise.tmdbTvId) { type = "tv"; id = franchise.tmdbTvId; }
    if (!id) return null;
    const data = await api.tmdb.franchiseLogo(type, id);
    return data.logo_path ? (TMDB_IMG(data.logo_path, "w500") ?? null) : null;
  } catch { return null; }
}

function sortItems(items: ContentItem[], key: SortKey): ContentItem[] {
  const arr = [...items];
  if (key === "rating") arr.sort((a, b) => b.rating - a.rating);
  else if (key === "year") arr.sort((a, b) => (b.year ?? 0) > (a.year ?? 0) ? 1 : -1);
  else if (key === "az") arr.sort((a, b) => a.title.localeCompare(b.title));
  return arr;
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════

/* ── Skeleton ─────────────────────────────────────────────────── */
function Skeleton({ w, h, r = 10 }: { w: number; h: number; r?: number }) {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.85, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.View style={{ width: w, height: h, borderRadius: r, backgroundColor: "rgba(255,255,255,0.08)", opacity: anim }} />;
}

/* ── Cinematic Hero ───────────────────────────────────────────── */
function CinematicHero({
  backdropUrl, logoUrl, franchise, isFav, onFavPress, onWatchPress, topPad,
}: {
  backdropUrl: string | null;
  logoUrl: string | null;
  franchise: any;
  isFav: boolean;
  onFavPress: () => void;
  onWatchPress: () => void;
  topPad: number;
}) {
  const glow = useRef(new Animated.Value(0.2)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.65, duration: 3200, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.2, duration: 3200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={[hero.wrap, { height: HERO_H + topPad }]}>
      {/* Backdrop */}
      {backdropUrl ? (
        <Image source={{ uri: backdropUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <LinearGradient colors={franchise.bgGradient} style={StyleSheet.absoluteFill} />
      )}

      {/* Gradient overlay */}
      <LinearGradient
        colors={["rgba(5,5,8,0.12)", "rgba(5,5,8,0.32)", "rgba(5,5,8,0.78)", BG]}
        locations={[0, 0.35, 0.72, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Animated glow */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: glow }]} pointerEvents="none">
        <LinearGradient
          colors={[franchise.color + "00", franchise.color + "28", franchise.color + "00"]}
          locations={[0.1, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Top color bar */}
      <View style={[hero.topBar, { backgroundColor: franchise.color }]} />

      {/* Content */}
      <View style={[hero.content, { paddingTop: topPad + 16 }]}>
        {/* Category + genre badges */}
        <View style={hero.badgeRow}>
          <View style={[hero.badge, { backgroundColor: franchise.color + "28", borderColor: franchise.color + "60" }]}>
            <Text style={[hero.badgeTxt, { color: franchise.accentColor }]}>
              {franchise.category?.toUpperCase()}
            </Text>
          </View>
          <View style={[hero.badge, { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.14)" }]}>
            <Text style={hero.badgeTxt}>{franchise.genre?.toUpperCase()}</Text>
          </View>
          {franchise.yearRange ? (
            <View style={[hero.badge, { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.14)" }]}>
              <Feather name="calendar" size={9} color="rgba(255,255,255,0.55)" />
              <Text style={hero.badgeTxt}>{franchise.yearRange}</Text>
            </View>
          ) : null}
        </View>

        {/* Logo or name */}
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={hero.logo} contentFit="contain" />
        ) : (
          <Text style={hero.title}>{franchise.name?.toUpperCase()}</Text>
        )}

        {/* Tagline */}
        <Text style={hero.tagline}>{franchise.tagline}</Text>

        {/* Stats chips */}
        <View style={hero.chips}>
          {franchise.contentCount > 0 && (
            <View style={hero.chip}>
              <Feather name="film" size={10} color={franchise.accentColor} />
              <Text style={[hero.chipTxt, { color: franchise.accentColor }]}>{franchise.contentCount} títulos</Text>
            </View>
          )}
          {franchise.totalHours > 0 && (
            <View style={hero.chip}>
              <Feather name="clock" size={10} color={franchise.accentColor} />
              <Text style={[hero.chipTxt, { color: franchise.accentColor }]}>{franchise.totalHours}h</Text>
            </View>
          )}
        </View>

        {/* CTAs */}
        <View style={hero.btnRow}>
          <Pressable onPress={onWatchPress} style={[hero.btnPrimary, { backgroundColor: franchise.color }]}>
            <Feather name="play" size={15} color="#fff" />
            <Text style={hero.btnPrimaryTxt}>ASSISTIR AGORA</Text>
          </Pressable>
          <Pressable
            onPress={onFavPress}
            style={[hero.btnSecondary, isFav && { backgroundColor: "rgba(255,60,60,0.2)", borderColor: "rgba(255,60,60,0.4)" }]}
          >
            <Feather name="heart" size={16} color={isFav ? "#ff4c4c" : "rgba(255,255,255,0.75)"} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const hero = StyleSheet.create({
  wrap: { position: "relative", justifyContent: "flex-end", overflow: "hidden" },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, height: 3, zIndex: 2 },
  content: { paddingHorizontal: 20, paddingBottom: 28, zIndex: 2, gap: 0 },
  badgeRow: { flexDirection: "row", gap: 6, marginBottom: 14, flexWrap: "wrap" },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1,
  },
  badgeTxt: { color: "rgba(255,255,255,0.65)", fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  logo: { width: 200, height: 64, marginBottom: 10 },
  title: { fontSize: 30, fontWeight: "900", color: "#fff", letterSpacing: 2, lineHeight: 34, marginBottom: 8 },
  tagline: { fontSize: 13, color: "rgba(255,255,255,0.6)", fontWeight: "500", marginBottom: 14, lineHeight: 18 },
  chips: { flexDirection: "row", gap: 8, marginBottom: 18 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(0,0,0,0.45)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  chipTxt: { fontSize: 11, fontWeight: "700" },
  btnRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  btnPrimary: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 13, borderRadius: 13,
    shadowColor: "#e50914", shadowOffset: { width: 0, height: 4 }, shadowRadius: 14, shadowOpacity: 0.55,
    elevation: 6,
  },
  btnPrimaryTxt: { color: "#fff", fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  btnSecondary: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
});

/* ── Expandable Description ───────────────────────────────────── */
function ExpandableText({ text, color }: { text: string; color: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  return (
    <View style={exp.wrap}>
      <Text style={exp.text} numberOfLines={expanded ? undefined : 3}>{text}</Text>
      <Pressable onPress={() => setExpanded(v => !v)} style={exp.btn}>
        <Text style={[exp.btnTxt, { color }]}>{expanded ? "Ver menos ↑" : "Ver mais ↓"}</Text>
      </Pressable>
    </View>
  );
}
const exp = StyleSheet.create({
  wrap: { paddingHorizontal: 20, marginBottom: 20 },
  text: { color: "rgba(255,255,255,0.62)", fontSize: 13, lineHeight: 20 },
  btn: { marginTop: 6 },
  btnTxt: { fontSize: 12, fontWeight: "700" },
});

/* ── Stat Strip ───────────────────────────────────────────────── */
function StatStrip({ items }: {
  items: { icon: keyof typeof Feather.glyphMap; value: string; label: string; color: string }[];
}) {
  return (
    <View style={st.row}>
      {items.map((s, i) => (
        <React.Fragment key={s.label}>
          <View style={[st.tile, { borderColor: s.color + "30" }]}>
            <Feather name={s.icon} size={14} color={s.color} />
            <Text style={st.val}>{s.value}</Text>
            <Text style={st.lbl}>{s.label}</Text>
          </View>
          {i < items.length - 1 && <View style={st.divider} />}
        </React.Fragment>
      ))}
    </View>
  );
}
const st = StyleSheet.create({
  row: {
    flexDirection: "row", marginHorizontal: 16, marginBottom: 22,
    backgroundColor: GLASS, borderRadius: 16, borderWidth: 1, borderColor: GLASS_B,
    overflow: "hidden",
  },
  tile: { flex: 1, alignItems: "center", paddingVertical: 14, gap: 4, borderWidth: 0 },
  val: { color: "#fff", fontSize: 14, fontWeight: "800" },
  lbl: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "600" },
  divider: { width: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 10 },
});

/* ── Tab Pills ────────────────────────────────────────────────── */
function TabPills({
  tabs, active, onPress, accentColor,
}: {
  tabs: { id: Tab; label: string; count: number }[];
  active: Tab;
  onPress: (t: Tab) => void;
  accentColor: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={tp.row}
      style={{ marginBottom: 20 }}
    >
      {tabs.map(t => (
        <Pressable
          key={t.id}
          onPress={() => onPress(t.id)}
          style={[
            tp.pill,
            active === t.id
              ? { backgroundColor: accentColor, borderColor: accentColor }
              : { backgroundColor: GLASS, borderColor: GLASS_B },
          ]}
        >
          <Text style={[tp.txt, { color: active === t.id ? "#fff" : "rgba(255,255,255,0.6)" }]}>
            {t.label}
          </Text>
          <View style={[tp.countBadge, { backgroundColor: active === t.id ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.08)" }]}>
            <Text style={[tp.countTxt, { color: active === t.id ? "#fff" : "rgba(255,255,255,0.45)" }]}>
              {t.count}
            </Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}
const tp = StyleSheet.create({
  row: { paddingHorizontal: 16, gap: 8 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 24, borderWidth: 1,
  },
  txt: { fontSize: 13, fontWeight: "700" },
  countBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  countTxt: { fontSize: 11, fontWeight: "800" },
});

/* ── Featured Wide Card (16:9) ───────────────────────────────── */
function FeaturedCard({ item, accentColor, onPress }: {
  item: ContentItem; accentColor: string; onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30, bounciness: 4 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 4 }).start()}
      onPress={onPress}
    >
      <Animated.View style={[fc.card, { width: W - 32, height: WIDE_H + 36, transform: [{ scale }] }]}>
        {item.posterPath ? (
          <Image source={{ uri: item.backdropPath ?? item.posterPath }} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} contentFit="cover" />
        ) : (
          <LinearGradient colors={["#1a1a2e", "#0a0a14"]} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />
        )}
        <LinearGradient
          colors={["rgba(5,5,8,0)", "rgba(5,5,8,0.18)", "rgba(5,5,8,0.92)"]}
          locations={[0.25, 0.6, 1]}
          style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
        />
        {/* Type badge */}
        <View style={[fc.badge, { backgroundColor: accentColor + "cc" }]}>
          <Text style={fc.badgeTxt}>{item.type === "movie" ? "FILME" : "SÉRIE"}</Text>
        </View>
        {/* Rating */}
        {item.rating > 0 && (
          <View style={fc.rating}>
            <Feather name="star" size={10} color="#fbbf24" />
            <Text style={fc.ratingTxt}>{item.rating.toFixed(1)}</Text>
          </View>
        )}
        {/* Bottom */}
        <View style={fc.bottom}>
          <Text style={fc.title} numberOfLines={1}>{item.title}</Text>
          <View style={fc.meta}>
            <Text style={fc.year}>{item.year}</Text>
            <Pressable onPress={onPress} style={[fc.playBtn, { backgroundColor: accentColor }]}>
              <Feather name="play" size={13} color="#fff" />
              <Text style={fc.playTxt}>ASSISTIR</Text>
            </Pressable>
          </View>
        </View>
        {/* Left accent */}
        <View style={[fc.leftAccent, { backgroundColor: accentColor }]} />
      </Animated.View>
    </Pressable>
  );
}
const fc = StyleSheet.create({
  card: {
    borderRadius: 16, overflow: "hidden", marginHorizontal: 16, marginBottom: 16,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "#111",
  },
  badge: {
    position: "absolute", top: 12, left: 12, zIndex: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  badgeTxt: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  rating: {
    position: "absolute", top: 12, right: 12, zIndex: 3,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
  },
  ratingTxt: { color: "#fbbf24", fontSize: 11, fontWeight: "800" },
  bottom: { position: "absolute", bottom: 14, left: 14, right: 14, zIndex: 2 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900", marginBottom: 8 },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  year: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600" },
  playBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  playTxt: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  leftAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
});

/* ── Carousel Poster Card ─────────────────────────────────────── */
function CarouselCard({ item, accentColor, onPress, rank }: {
  item: ContentItem; accentColor: string; onPress: () => void; rank?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 30, bounciness: 6 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start()}
      onPress={onPress}
      style={{ marginRight: 12 }}
    >
      <Animated.View style={[cc.card, { transform: [{ scale }] }]}>
        {item.posterPath ? (
          <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={[accentColor + "44", "#111"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.75)"]}
          locations={[0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        {/* Type */}
        <View style={[cc.typeBadge, { backgroundColor: accentColor }]}>
          <Text style={cc.typeTxt}>{item.type === "movie" ? "F" : "S"}</Text>
        </View>
        {/* Rank */}
        {rank != null && (
          <View style={cc.rankBadge}>
            <Text style={cc.rankTxt}>{rank}</Text>
          </View>
        )}
        {/* Rating */}
        {item.rating > 0 && (
          <View style={cc.ratingBadge}>
            <Feather name="star" size={8} color="#fbbf24" />
            <Text style={cc.ratingTxt}>{item.rating.toFixed(1)}</Text>
          </View>
        )}
        {/* Bottom */}
        <View style={cc.bottom}>
          <Text style={cc.title} numberOfLines={2}>{item.title}</Text>
          <Text style={cc.year}>{item.year}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}
const cc = StyleSheet.create({
  card: {
    width: CARD_W, height: CARD_H, borderRadius: 12, overflow: "hidden",
    backgroundColor: "#111", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
  },
  typeBadge: {
    position: "absolute", top: 7, left: 7, zIndex: 2,
    width: 18, height: 18, borderRadius: 4, alignItems: "center", justifyContent: "center",
  },
  typeTxt: { color: "#fff", fontSize: 8, fontWeight: "900" },
  rankBadge: {
    position: "absolute", top: 7, right: 7, zIndex: 2,
    backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
  },
  rankTxt: { color: "#fff", fontSize: 11, fontWeight: "900" },
  ratingBadge: {
    position: "absolute", bottom: 44, right: 7, zIndex: 2,
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5,
  },
  ratingTxt: { color: "#fbbf24", fontSize: 9, fontWeight: "800" },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8, zIndex: 2 },
  title: { color: "#fff", fontSize: 11, fontWeight: "700", lineHeight: 15 },
  year: { color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 2 },
});

/* ── Content Section (featured + carousel) ────────────────────── */
function ContentSection({
  items, accentColor, loading, onPress, sort, onSortChange,
}: {
  items: ContentItem[];
  accentColor: string;
  loading: boolean;
  onPress: (item: ContentItem) => void;
  sort: SortKey;
  onSortChange: (k: SortKey) => void;
}) {
  const [showSort, setShowSort] = useState(false);
  const sorted = sortItems(items, sort);
  const featured = sorted.slice(0, 1)[0];
  const rest = sorted.slice(1);

  if (loading) {
    return (
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <Skeleton w={W - 32} h={WIDE_H + 36} r={16} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          {[0, 1, 2].map(i => <Skeleton key={i} w={CARD_W} h={CARD_H} r={12} />)}
        </View>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 40, gap: 12 }}>
        <Feather name="film" size={36} color="rgba(255,255,255,0.15)" />
        <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 15, fontWeight: "600" }}>
          Nenhum conteúdo encontrado
        </Text>
      </View>
    );
  }

  return (
    <View>
      {/* Sort bar */}
      <View style={cs.sortBar}>
        <Text style={cs.countTxt}>{items.length} título{items.length !== 1 ? "s" : ""}</Text>
        <Pressable onPress={() => setShowSort(v => !v)} style={[cs.sortBtn, { borderColor: accentColor + "44" }]}>
          <Feather name="sliders" size={12} color={accentColor} />
          <Text style={[cs.sortBtnTxt, { color: accentColor }]}>
            {sort === "rating" ? "Nota" : sort === "year" ? "Ano" : "A–Z"}
          </Text>
          <Feather name={showSort ? "chevron-up" : "chevron-down"} size={11} color={accentColor} />
        </Pressable>
      </View>

      {/* Sort dropdown */}
      {showSort && (
        <View style={cs.dropdown}>
          {([
            { k: "rating" as SortKey, label: "Melhor nota", icon: "star" },
            { k: "year" as SortKey, label: "Mais recente", icon: "calendar" },
            { k: "az" as SortKey, label: "A–Z", icon: "type" },
          ] as { k: SortKey; label: string; icon: keyof typeof Feather.glyphMap }[]).map(o => (
            <Pressable
              key={o.k}
              onPress={() => { onSortChange(o.k); setShowSort(false); }}
              style={[cs.dropdownItem, sort === o.k && { backgroundColor: accentColor + "18" }]}
            >
              <Feather name={o.icon} size={13} color={sort === o.k ? accentColor : "rgba(255,255,255,0.55)"} />
              <Text style={[cs.dropdownTxt, { color: sort === o.k ? accentColor : "rgba(255,255,255,0.7)" }]}>
                {o.label}
              </Text>
              {sort === o.k && <Feather name="check" size={12} color={accentColor} />}
            </Pressable>
          ))}
        </View>
      )}

      {/* Featured card */}
      {featured && (
        <FeaturedCard item={featured} accentColor={accentColor} onPress={() => onPress(featured)} />
      )}

      {/* Horizontal carousel */}
      {rest.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <View style={cs.rowHeader}>
            <View style={[cs.accentBar, { backgroundColor: accentColor }]} />
            <Text style={cs.rowTitle}>Todos os títulos</Text>
            <Text style={[cs.rowCount, { color: accentColor }]}>{rest.length} mais</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 0 }}>
            {rest.map((item, i) => (
              <CarouselCard
                key={item.id}
                item={item}
                accentColor={accentColor}
                onPress={() => onPress(item)}
                rank={sort === "rating" ? i + 2 : undefined}
              />
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const cs = StyleSheet.create({
  sortBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, marginBottom: 14,
  },
  countTxt: { color: "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: "600" },
  sortBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  sortBtnTxt: { fontSize: 12, fontWeight: "700" },
  dropdown: {
    marginHorizontal: 16, marginBottom: 14,
    backgroundColor: "#0e0e1c", borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)",
  },
  dropdownTxt: { flex: 1, fontSize: 14, fontWeight: "600" },
  rowHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, gap: 10, marginBottom: 12,
  },
  accentBar: { width: 3, height: 16, borderRadius: 2 },
  rowTitle: { color: "#fff", fontSize: 15, fontWeight: "800", flex: 1 },
  rowCount: { fontSize: 12, fontWeight: "600" },
});

/* ── Timeline Item (separate component to avoid hook violation) ── */
function TimelineItem({
  chrono, found, accentColor, onPress, isLast,
}: {
  chrono: ChronologicalItem;
  found: ContentItem | undefined;
  accentColor: string;
  onPress: () => void;
  isLast: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30, bounciness: 4 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 4 }).start()}
      onPress={found ? onPress : undefined}
      style={{ flexDirection: "row", marginBottom: 0 }}
    >
      {/* Timeline spine */}
      <View style={tl.spine}>
        <View style={[tl.dot, { backgroundColor: accentColor }]} />
        {!isLast && <View style={[tl.line, { backgroundColor: accentColor + "30" }]} />}
      </View>
      {/* Card */}
      <Animated.View style={[tl.card, { transform: [{ scale }] }]}>
        {/* Poster thumb */}
        <View style={tl.thumb}>
          {found?.posterPath ? (
            <Image source={{ uri: found.posterPath }} style={[StyleSheet.absoluteFill, { borderRadius: 8 }]} contentFit="cover" />
          ) : (
            <LinearGradient colors={[accentColor + "33", "#111"]} style={[StyleSheet.absoluteFill, { borderRadius: 8 }]}>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Feather name="film" size={16} color={accentColor} />
              </View>
            </LinearGradient>
          )}
          {/* Type badge on thumb */}
          <View style={[tl.thumbBadge, { backgroundColor: accentColor }]}>
            <Text style={tl.thumbBadgeTxt}>{chrono.type === "movie" ? "F" : "S"}</Text>
          </View>
        </View>
        {/* Info */}
        <View style={tl.info}>
          <Text style={[tl.label, { color: accentColor }]}>{chrono.label}</Text>
          {chrono.note && <Text style={tl.note}>{chrono.note}</Text>}
          <Text style={tl.title} numberOfLines={1}>{found?.title ?? (chrono.type === "movie" ? "Filme" : "Série")}</Text>
          {found && (
            <View style={tl.metaRow}>
              <Text style={tl.year}>{found.year}</Text>
              {found.rating > 0 && (
                <>
                  <Text style={tl.dot2}>·</Text>
                  <Feather name="star" size={9} color="#fbbf24" />
                  <Text style={tl.rating}>{found.rating.toFixed(1)}</Text>
                </>
              )}
            </View>
          )}
        </View>
        {/* Play arrow */}
        {found && (
          <View style={[tl.playBtn, { backgroundColor: accentColor + "20", borderColor: accentColor + "44" }]}>
            <Feather name="chevron-right" size={16} color={accentColor} />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const tl = StyleSheet.create({
  spine: { width: 32, alignItems: "center", paddingTop: 18 },
  dot: { width: 10, height: 10, borderRadius: 5, zIndex: 1 },
  line: { width: 2, flex: 1, marginTop: 4, minHeight: 30 },
  card: {
    flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 12,
    paddingBottom: 16, paddingRight: 16,
  },
  thumb: {
    width: 56, height: 80, borderRadius: 8, overflow: "hidden",
    backgroundColor: "#111", flexShrink: 0,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  thumbBadge: {
    position: "absolute", bottom: 4, right: 4,
    width: 16, height: 16, borderRadius: 3, alignItems: "center", justifyContent: "center",
  },
  thumbBadgeTxt: { color: "#fff", fontSize: 7, fontWeight: "900" },
  info: { flex: 1, paddingTop: 4, gap: 2 },
  label: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  note: { color: "rgba(255,255,255,0.35)", fontSize: 10, fontStyle: "italic" },
  title: { color: "#fff", fontSize: 14, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  year: { color: "rgba(255,255,255,0.45)", fontSize: 11 },
  dot2: { color: "rgba(255,255,255,0.25)", fontSize: 11 },
  rating: { color: "#fbbf24", fontSize: 11, fontWeight: "700" },
  playBtn: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1,
    alignItems: "center", justifyContent: "center", marginTop: 4,
  },
});

/* ── Cast Circle ──────────────────────────────────────────────── */
function CastCircle({ person, accentColor }: {
  person: { name: string; character: string; profile_path: string | null };
  accentColor: string;
}) {
  const uri = person.profile_path
    ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
    : null;
  return (
    <View style={cast.wrap}>
      <View style={[cast.circle, { borderColor: accentColor + "44" }]}>
        {uri ? (
          <Image source={{ uri }} style={[StyleSheet.absoluteFill, { borderRadius: 30 }]} contentFit="cover" />
        ) : (
          <LinearGradient colors={[accentColor + "33", "#111"]} style={[StyleSheet.absoluteFill, { borderRadius: 30 }]}>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Feather name="user" size={22} color={accentColor + "88"} />
            </View>
          </LinearGradient>
        )}
      </View>
      <Text style={cast.name} numberOfLines={2}>{person.name}</Text>
      <Text style={[cast.char, { color: accentColor + "88" }]} numberOfLines={1}>{person.character}</Text>
    </View>
  );
}
const cast = StyleSheet.create({
  wrap: { width: 72, alignItems: "center", marginRight: 14 },
  circle: {
    width: 60, height: 60, borderRadius: 30, overflow: "hidden",
    borderWidth: 1.5, backgroundColor: "#111", marginBottom: 6,
  },
  name: { color: "#fff", fontSize: 10, fontWeight: "700", textAlign: "center", lineHeight: 13 },
  char: { fontSize: 9, textAlign: "center", marginTop: 2 },
});

/* ── Section Header ───────────────────────────────────────────── */
function SectionHead({ title, color, sub }: { title: string; color: string; sub?: string }) {
  return (
    <View style={sh.row}>
      <View style={[sh.bar, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={sh.title}>{title}</Text>
        {sub && <Text style={[sh.sub, { color }]}>{sub}</Text>}
      </View>
    </View>
  );
}
const sh = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, gap: 10, marginBottom: 14 },
  bar: { width: 3.5, height: 18, borderRadius: 2, marginTop: 3 },
  title: { color: "#fff", fontSize: 17, fontWeight: "800" },
  sub: { fontSize: 11, fontWeight: "600", marginTop: 2 },
});

/* ── Related Franchise Card ───────────────────────────────────── */
function RelatedCard({ franchiseId, onPress }: { franchiseId: string; onPress: () => void }) {
  const f = getFranchise(franchiseId);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!f) return;
    const load = async () => {
      const url = await fetchBackdrop(f);
      setImgUrl(url);
    };
    load();
  }, [franchiseId]);

  if (!f) return null;
  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 30, bounciness: 4 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 4 }).start()}
      onPress={onPress}
    >
      <Animated.View style={[rel.card, { transform: [{ scale }] }]}>
        {imgUrl ? (
          <Image source={{ uri: imgUrl }} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} contentFit="cover" />
        ) : (
          <LinearGradient colors={f.bgGradient} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
        )}
        <LinearGradient
          colors={["rgba(5,5,8,0)", "rgba(5,5,8,0.85)"]}
          locations={[0.3, 1]}
          style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
        />
        <View style={[rel.topBar, { backgroundColor: f.color }]} />
        <View style={rel.info}>
          <Text style={rel.name}>{f.shortName}</Text>
          <View style={rel.metaRow}>
            <Text style={[rel.count, { color: f.accentColor }]}>{f.contentCount} títulos</Text>
            <Text style={rel.dot}>·</Text>
            <Text style={rel.hours}>{f.totalHours}h</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
const rel = StyleSheet.create({
  card: {
    width: 170, height: 110, borderRadius: 14, overflow: "hidden",
    marginRight: 12, backgroundColor: "#111",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, height: 2.5, zIndex: 2 },
  info: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 12, zIndex: 2 },
  name: { color: "#fff", fontSize: 14, fontWeight: "900", marginBottom: 3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  count: { fontSize: 11, fontWeight: "700" },
  dot: { color: "rgba(255,255,255,0.3)", fontSize: 11 },
  hours: { color: "rgba(255,255,255,0.4)", fontSize: 11 },
});

// ═══════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════
export default function FranchiseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const rawId = params.id ?? "";
  const isTmdbCollection = rawId.startsWith("tmdb_collection_");
  const tmdbColId = isTmdbCollection ? Number(rawId.replace("tmdb_collection_", "")) : null;
  const franchise = isTmdbCollection ? null : getFranchise(rawId);
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;
  const { isFavorite, toggle } = useFavorites();

  // State
  const [dynamicName, setDynamicName] = useState(params.name ?? "");
  const [backdropUrl, setBackdropUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [movies, setMovies] = useState<ContentItem[]>([]);
  const [series, setSeries] = useState<ContentItem[]>([]);
  const [castItems, setCastItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("filmes");
  const [movieSort, setMovieSort] = useState<SortKey>("rating");
  const [seriesSort, setSeriesSort] = useState<SortKey>("rating");
  const [collectionOverview, setCollectionOverview] = useState("");
  const [collectionYearRange, setCollectionYearRange] = useState("");
  const [collectionTotalHours, setCollectionTotalHours] = useState(0);

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({
    inputRange: [HERO_H - 80, HERO_H + 10],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  // ── Fetch backdrop + logo ────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const [bd, lg] = await Promise.all([
        fetchBackdrop(franchise, tmdbColId),
        fetchLogo(franchise),
      ]);
      if (bd) setBackdropUrl(bd);
      if (lg) setLogoUrl(lg);
    };
    load();
  }, [rawId]);

  // ── Fetch content ────────────────────────────────────────────────
  useEffect(() => {
    if (!franchise && !isTmdbCollection) return;
    setLoading(true);
    setMovies([]);
    setSeries([]);

    const load = async () => {
      try {
        let allItems: ContentItem[] = [];

        if (isTmdbCollection && tmdbColId) {
          const d = await api.tmdb.collection(tmdbColId);
          if (d.name && !dynamicName) setDynamicName(d.name);
          if (d.overview) setCollectionOverview(d.overview);
          const parts: any[] = d.parts ?? [];
          const years = parts.map((p: any) => Number((p.release_date ?? "").slice(0, 4))).filter((y: number) => y > 1900);
          if (years.length > 0) {
            const min = Math.min(...years);
            const max = Math.max(...years);
            setCollectionYearRange(min === max ? String(min) : `${min}–${max}`);
          }
          setCollectionTotalHours(Math.round((parts.length * 105) / 60));
          allItems = parts.map((p: any) => tmdbItemToContent({ ...p, media_type: "movie" }));
          allItems.sort((a, b) => b.rating - a.rating);
          setMovies(allItems.filter(i => i.type === "movie"));
          setSeries(allItems.filter(i => i.type === "series"));
          setLoading(false);
          return;
        }

        const fetchCollections = async (ids: number[]): Promise<ContentItem[]> => {
          const results = await Promise.allSettled(ids.map(id => api.tmdb.collection(id)));
          return results
            .filter(r => r.status === "fulfilled")
            .flatMap((r: any) => r.value.parts ?? [])
            .map((p: any) => tmdbItemToContent({ ...p, media_type: "movie" }));
        };
        const fetchTvShows = async (ids: number[]): Promise<ContentItem[]> => {
          const results = await Promise.allSettled(ids.map(id => api.tmdb.tv(id) as Promise<any>));
          return results
            .filter(r => r.status === "fulfilled")
            .map((r: any) => tmdbItemToContent({ ...r.value, media_type: "tv" }));
        };

        if (franchise!.fetchType === "collection" && franchise!.tmdbCollectionId) {
          const allCollIds = [franchise!.tmdbCollectionId, ...(franchise!.relatedCollectionIds ?? [])];
          const [mvItems, tvItems] = await Promise.all([fetchCollections(allCollIds), fetchTvShows(franchise!.relatedTvIds ?? [])]);
          allItems = [...mvItems, ...tvItems];
        } else if (franchise!.fetchType === "keyword" && franchise!.tmdbKeywordId) {
          const pages = [1, 2, 3];
          const [mvPages, tvPages] = await Promise.all([
            Promise.all(pages.map(p => api.tmdb.keywordDiscover(franchise!.tmdbKeywordId!, "movie", p))),
            Promise.all(pages.map(p => api.tmdb.keywordDiscover(franchise!.tmdbKeywordId!, "tv", p))),
          ]);
          allItems = [
            ...mvPages.flatMap(d => d.results).map(m => tmdbItemToContent({ ...m, media_type: "movie" })),
            ...tvPages.flatMap(d => d.results).map(t => tmdbItemToContent({ ...t, media_type: "tv" })),
          ].sort((a, b) => b.rating - a.rating);
        } else if (franchise!.fetchType === "tv" && franchise!.tmdbTvId) {
          const tvIds = [franchise!.tmdbTvId, ...(franchise!.relatedTvIds ?? [])];
          const [tvItems, mvItems] = await Promise.all([fetchTvShows(tvIds), fetchCollections(franchise!.relatedCollectionIds ?? [])]);
          allItems = [...tvItems, ...mvItems];
        } else {
          const q = franchise!.searchQuery ?? franchise!.name;
          const type = franchise!.searchType ?? (franchise!.category === "anime" ? "tv" : "movie");
          const pages = await Promise.allSettled([
            api.tmdb.search(q, type as any, 1),
            api.tmdb.search(q, type as any, 2),
            api.tmdb.search(q, type as any, 3),
          ]);
          for (const p of pages) {
            if (p.status === "fulfilled") {
              allItems.push(...(p.value.results ?? []).map((item: any) => tmdbItemToContent({ ...item, media_type: type as any })));
            }
          }
          allItems.sort((a, b) => b.rating - a.rating);
        }

        // Deduplicate
        const seen = new Set<number>();
        const unique = allItems.filter(item => {
          if (!item.tmdbId || seen.has(item.tmdbId)) return false;
          seen.add(item.tmdbId);
          return true;
        });

        setMovies(unique.filter(i => i.type === "movie"));
        setSeries(unique.filter(i => i.type === "series"));
      } catch (e) {
        console.warn("Franchise fetch error:", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [franchise?.id, rawId]);

  // ── Fetch cast ──────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    const first = [...movies, ...series].sort((a, b) => b.rating - a.rating)[0];
    if (!first?.tmdbId) return;
    const fetchCast = async () => {
      try {
        const type = first.type === "movie" ? "movie" : "tv";
        let data: any;
        if (type === "movie") data = await api.tmdb.movie(first.tmdbId!);
        else data = await (api.tmdb.tv(first.tmdbId!) as Promise<any>);
        const credits = (data as any).credits?.cast ?? [];
        setCastItems(credits.slice(0, 20));
      } catch {}
    };
    fetchCast();
  }, [loading]);

  // ── Auto-switch tab ──────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    if (activeTab === "filmes" && movies.length === 0 && series.length > 0) setActiveTab("series");
    if (activeTab === "series" && series.length === 0 && movies.length > 0) setActiveTab("filmes");
  }, [loading, movies.length, series.length]);

  const goToDetail = useCallback((item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"),
        id: String(item.tmdbId ?? item.id),
        title: item.title,
      },
    });
  }, [router]);

  // Not found
  if (!franchise && !isTmdbCollection) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center" }}>
        <Feather name="alert-circle" size={40} color="rgba(255,255,255,0.2)" />
        <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 16, marginTop: 12 }}>Franquia não encontrada</Text>
      </View>
    );
  }

  // Build display franchise object
  const df = isTmdbCollection ? {
    id: rawId,
    name: dynamicName || "Coleção TMDB",
    shortName: dynamicName || "Coleção",
    tagline: "Coleção do TMDB",
    description: collectionOverview,
    color: "#01b4e4",
    accentColor: "#01d4ff",
    bgGradient: ["#001520", "#002030", "#001018"] as [string, string, string],
    category: "filmes" as const,
    genre: "acao" as const,
    fetchType: "collection" as const,
    yearRange: collectionYearRange,
    contentCount: movies.length + series.length,
    totalHours: collectionTotalHours,
    related: [] as string[],
    chronologicalContent: undefined,
  } : franchise!;

  const allItems = [...movies, ...series];
  const hasCronologia = !!franchise?.chronologicalContent;
  const firstItem = allItems.sort((a, b) => b.rating - a.rating)[0];

  const TABS: { id: Tab; label: string; count: number }[] = [
    ...(loading || movies.length > 0 ? [{ id: "filmes" as Tab, label: "Filmes", count: movies.length }] : []),
    ...(loading || series.length > 0 ? [{ id: "series" as Tab, label: "Séries", count: series.length }] : []),
    ...(hasCronologia ? [{ id: "cronologia" as Tab, label: "Cronologia", count: franchise!.chronologicalContent!.length }] : []),
  ];

  const fav = isFavorite(df.id);
  const statItems = [
    { icon: "film" as const,     value: String(df.contentCount || movies.length + series.length), label: "Títulos",  color: df.accentColor },
    { icon: "clock" as const,    value: df.totalHours ? `${df.totalHours}h` : "–",               label: "Total",    color: df.accentColor },
    { icon: "calendar" as const, value: df.yearRange || "–",                                      label: "Período",  color: df.accentColor },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar style="light" />

      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 50 }}
      >
        {/* ── CINEMATIC HERO ─────────────────────────── */}
        <CinematicHero
          backdropUrl={backdropUrl}
          logoUrl={logoUrl}
          franchise={df}
          isFav={fav}
          onFavPress={() => toggle(df.id)}
          onWatchPress={() => firstItem && goToDetail(firstItem)}
          topPad={topPad}
        />

        {/* ── STAT STRIP ─────────────────────────────── */}
        <View style={{ marginTop: 20, marginBottom: 4 }}>
          <StatStrip items={statItems} />
        </View>

        {/* ── DESCRIPTION ────────────────────────────── */}
        {!!df.description && (
          <ExpandableText text={df.description} color={df.accentColor} />
        )}

        {/* ── TABS ───────────────────────────────────── */}
        {TABS.length > 0 && (
          <TabPills tabs={TABS} active={activeTab} onPress={setActiveTab} accentColor={df.accentColor} />
        )}

        {/* ── TAB: FILMES ────────────────────────────── */}
        {activeTab === "filmes" && (
          <ContentSection
            items={movies}
            accentColor={df.accentColor}
            loading={loading}
            onPress={goToDetail}
            sort={movieSort}
            onSortChange={setMovieSort}
          />
        )}

        {/* ── TAB: SÉRIES ────────────────────────────── */}
        {activeTab === "series" && (
          <ContentSection
            items={series}
            accentColor={df.accentColor}
            loading={loading}
            onPress={goToDetail}
            sort={seriesSort}
            onSortChange={setSeriesSort}
          />
        )}

        {/* ── TAB: CRONOLOGIA ────────────────────────── */}
        {activeTab === "cronologia" && hasCronologia && franchise && (
          <View>
            <View style={main.chronoIntro}>
              <Feather name="clock" size={15} color={df.accentColor} />
              <Text style={[main.chronoIntroTxt, { color: df.accentColor }]}>
                Ordem cronológica do universo
              </Text>
            </View>
            {loading ? (
              <View style={main.centered}>
                <ActivityIndicator color={df.accentColor} size="large" />
                <Text style={main.loadingTxt}>Montando linha do tempo...</Text>
              </View>
            ) : (
              <View style={{ paddingLeft: 16 }}>
                {franchise.chronologicalContent!.map((chrono, idx) => {
                  const found = allItems.find(c => Number(c.tmdbId) === chrono.tmdbId);
                  return (
                    <TimelineItem
                      key={`${chrono.tmdbId}-${idx}`}
                      chrono={chrono}
                      found={found}
                      accentColor={df.accentColor}
                      onPress={() => found && goToDetail(found)}
                      isLast={idx === franchise.chronologicalContent!.length - 1}
                    />
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ── ELENCO ─────────────────────────────────── */}
        {castItems.length > 0 && (
          <View style={main.section}>
            <SectionHead title="Elenco principal" color={df.accentColor} sub={`${castItems.length} artistas`} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 0 }}
            >
              {castItems.map((p: any, i: number) => (
                <CastCircle key={`${p.id}-${i}`} person={p} accentColor={df.accentColor} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── RELACIONADOS ───────────────────────────── */}
        {df.related.length > 0 && (
          <View style={main.section}>
            <SectionHead title={`Se você gosta de ${df.shortName}…`} color={df.color} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 0 }}
            >
              {df.related.map(rid => (
                <RelatedCard
                  key={rid}
                  franchiseId={rid}
                  onPress={() => router.push({ pathname: "/franchise", params: { id: rid } })}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── OTHER FRANCHISES ────────────────────────── */}
        <View style={main.section}>
          <SectionHead title="Outros universos" color="rgba(255,255,255,0.4)" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 0 }}
          >
            {FRANCHISES.filter(f => f.id !== df.id && !df.related.includes(f.id)).slice(0, 8).map(f => (
              <RelatedCard
                key={f.id}
                franchiseId={f.id}
                onPress={() => router.push({ pathname: "/franchise", params: { id: f.id } })}
              />
            ))}
          </ScrollView>
        </View>
      </Animated.ScrollView>

      {/* ── STICKY HEADER ──────────────────────────── */}
      <Animated.View
        style={[main.stickyHeader, { paddingTop: topPad }]}
        pointerEvents="box-none"
      >
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: BG, opacity: headerOpacity }]} />
        <View style={main.stickyContent}>
          <Pressable onPress={() => router.back()} style={main.circleBtn}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </Pressable>
          <Animated.Text style={[main.stickyTitle, { opacity: headerOpacity }]} numberOfLines={1}>
            {df.shortName.toUpperCase()}
          </Animated.Text>
          <Pressable onPress={() => toggle(df.id)} style={main.circleBtn}>
            <Feather
              name="heart"
              size={18}
              color={isFavorite(df.id) ? df.accentColor : "rgba(255,255,255,0.7)"}
            />
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const main = StyleSheet.create({
  section: { marginBottom: 28 },
  chronoIntro: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, paddingVertical: 10, marginBottom: 6,
  },
  chronoIntroTxt: { fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
  centered: { alignItems: "center", paddingVertical: 50, gap: 12 },
  loadingTxt: { color: "rgba(255,255,255,0.4)", fontSize: 13 },
  stickyHeader: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  stickyContent: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 8,
  },
  stickyTitle: {
    color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 2,
    flex: 1, textAlign: "center",
  },
  circleBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center",
  },
});
