import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  FRANCHISES,
  BANNER_FRANCHISES,
  TOP10_FRANCHISES,
  GENRE_SECTIONS,
  type Franchise,
} from "@/constants/franchises";
import { api, TMDB_IMG } from "@/lib/api";
import { useFavorites } from "@/hooks/useFavorites";

const { width: W } = Dimensions.get("window");
const BG = "#050508";
const RED = "#e50914";
const GLASS = "rgba(255,255,255,0.07)";
const GLASS_B = "rgba(255,255,255,0.12)";
const CARD_W = 148;
const CARD_H = 212;
const WIDE_W = W - 32;
const WIDE_H = Math.round((WIDE_W * 9) / 16) + 30;

// ── Cache ─────────────────────────────────────────────────────────────
const _imgCache = new Map<string, string | null>();
const _posterCache = new Map<string, string | null>();
const _logoCache = new Map<string, string | null>();

async function fetchFranchiseImage(f: Franchise): Promise<string | null> {
  if (_imgCache.has(f.id)) return _imgCache.get(f.id)!;
  try {
    let path: string | null = null;
    if (f.fetchType === "collection" && f.tmdbCollectionId) {
      const d = await api.tmdb.collection(f.tmdbCollectionId);
      path = d.backdrop_path;
    } else if (f.tmdbTvId) {
      const d = await (api.tmdb.tv(f.tmdbTvId) as Promise<any>);
      path = d.backdrop_path ?? null;
    } else {
      const q = f.searchQuery ?? f.name;
      const type = f.category === "anime" ? "tv" : "movie";
      const d = await api.tmdb.search(q, type as any);
      path = d.results[0]?.backdrop_path ?? null;
    }
    const url = path ? (TMDB_IMG(path, "w1280") ?? null) : null;
    _imgCache.set(f.id, url);
    return url;
  } catch {
    _imgCache.set(f.id, null);
    return null;
  }
}

async function fetchFranchisePoster(f: Franchise): Promise<string | null> {
  if (_posterCache.has(f.id)) return _posterCache.get(f.id)!;
  try {
    let path: string | null = null;
    if (f.fetchType === "collection" && f.tmdbCollectionId) {
      const d = await api.tmdb.collection(f.tmdbCollectionId);
      path = d.poster_path ?? d.backdrop_path;
    } else if (f.tmdbTvId) {
      const d = await (api.tmdb.tv(f.tmdbTvId) as Promise<any>);
      path = d.poster_path ?? d.backdrop_path ?? null;
    } else {
      const q = f.searchQuery ?? f.name;
      const type = f.category === "anime" ? "tv" : "movie";
      const d = await api.tmdb.search(q, type as any);
      path = d.results[0]?.poster_path ?? null;
    }
    const url = path ? (TMDB_IMG(path, "w500") ?? null) : null;
    _posterCache.set(f.id, url);
    return url;
  } catch {
    _posterCache.set(f.id, null);
    return null;
  }
}

async function fetchFranchiseLogo(f: Franchise): Promise<string | null> {
  if (_logoCache.has(f.id)) return _logoCache.get(f.id)!;
  try {
    let type: "collection" | "tv" | "movie" = "movie";
    let id = 0;
    if (f.fetchType === "collection" && f.tmdbCollectionId) { type = "collection"; id = f.tmdbCollectionId; }
    else if (f.tmdbTvId) { type = "tv"; id = f.tmdbTvId; }
    if (!id) { _logoCache.set(f.id, null); return null; }
    const data = await api.tmdb.franchiseLogo(type, id);
    const url = data.logo_path ? (TMDB_IMG(data.logo_path, "w500") ?? null) : null;
    _logoCache.set(f.id, url);
    return url;
  } catch {
    _logoCache.set(f.id, null);
    return null;
  }
}

function useFranchiseAssets(f: Franchise) {
  const [img, setImg] = useState<string | null>(_imgCache.get(f.id) ?? null);
  const [poster, setPoster] = useState<string | null>(_posterCache.get(f.id) ?? null);
  const [logo, setLogo] = useState<string | null>(_logoCache.get(f.id) ?? null);
  useEffect(() => {
    if (!_imgCache.has(f.id)) fetchFranchiseImage(f).then(setImg);
    if (!_posterCache.has(f.id)) fetchFranchisePoster(f).then(setPoster);
    if (!_logoCache.has(f.id)) fetchFranchiseLogo(f).then(setLogo);
  }, [f.id]);
  return { img, poster, logo };
}

// ── Skeleton Card ─────────────────────────────────────────────────
function SkeletonCard({ width = CARD_W, height = CARD_H }: { width?: number; height?: number }) {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.9, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[{ width, height, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.07)", marginRight: 12, opacity: anim }]} />
  );
}

// ═══════════════════════════════════════════════════════════════════
// BANNER TYPES
// ═══════════════════════════════════════════════════════════════════

/* ── Cinematic Hero Slide ─────────────────────────────────────── */
function CinematicHeroSlide({ franchise, onPress }: { franchise: Franchise; onPress: () => void }) {
  const { img, logo } = useFranchiseAssets(franchise);
  const glow = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.7, duration: 3000, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.25, duration: 3000, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Pressable onPress={onPress} style={{ width: W, height: 400 }}>
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <LinearGradient colors={franchise.bgGradient} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={["rgba(5,5,8,0.04)", "rgba(5,5,8,0.38)", BG]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Glow pulse */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: glow }]} pointerEvents="none">
        <LinearGradient
          colors={[franchise.color + "00", franchise.color + "20", franchise.color + "00"]}
          locations={[0.2, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {/* Top color bar */}
      <View style={[ch.topBar, { backgroundColor: franchise.color }]} />
      {/* Content */}
      <View style={ch.content}>
        <View style={[ch.badge, { backgroundColor: franchise.color + "20", borderColor: franchise.color + "60" }]}>
          <Text style={[ch.badgeTxt, { color: franchise.accentColor }]}>
            {franchise.category.toUpperCase()} · {franchise.yearRange}
          </Text>
        </View>
        {logo ? (
          <Image source={{ uri: logo }} style={ch.logo} contentFit="contain" />
        ) : (
          <Text style={ch.name}>{franchise.name.toUpperCase()}</Text>
        )}
        <Text style={ch.tagline}>{franchise.tagline}</Text>
        <View style={ch.chips}>
          <View style={ch.chip}>
            <Feather name="film" size={10} color={franchise.accentColor} />
            <Text style={[ch.chipTxt, { color: franchise.accentColor }]}>{franchise.contentCount} títulos</Text>
          </View>
          <View style={ch.chip}>
            <Feather name="clock" size={10} color={franchise.accentColor} />
            <Text style={[ch.chipTxt, { color: franchise.accentColor }]}>{franchise.totalHours}h</Text>
          </View>
          <View style={[ch.chip, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
            <Text style={ch.chipTxt}>{franchise.genre.toUpperCase()}</Text>
          </View>
        </View>
        <View style={ch.btnRow}>
          <Pressable onPress={onPress} style={[ch.btnPrimary, { backgroundColor: franchise.color }]}>
            <Feather name="play" size={13} color="#fff" />
            <Text style={ch.btnPrimaryTxt}>EXPLORAR</Text>
          </Pressable>
          <Pressable style={ch.btnSecondary}>
            <Feather name="info" size={13} color="rgba(255,255,255,0.8)" />
            <Text style={ch.btnSecondaryTxt}>Detalhes</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const ch = StyleSheet.create({
  topBar: { position: "absolute", top: 0, left: 0, right: 0, height: 3, zIndex: 2 },
  content: { position: "absolute", bottom: 44, left: 20, right: 20, zIndex: 2 },
  badge: {
    alignSelf: "flex-start", borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4, marginBottom: 12,
  },
  badgeTxt: { fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  logo: { width: 190, height: 58, marginBottom: 10 },
  name: { fontSize: 28, fontWeight: "900", color: "#fff", letterSpacing: 2, lineHeight: 32, marginBottom: 8 },
  tagline: { fontSize: 13, color: "rgba(255,255,255,0.65)", fontWeight: "500", marginBottom: 14 },
  chips: { flexDirection: "row", gap: 8, marginBottom: 18, flexWrap: "wrap" },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  chipTxt: { color: "rgba(255,255,255,0.65)", fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
  btnRow: { flexDirection: "row", gap: 10 },
  btnPrimary: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12,
    shadowColor: RED, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, shadowOpacity: 0.55,
    elevation: 6,
  },
  btnPrimaryTxt: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  btnSecondary: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.11)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  btnSecondaryTxt: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "700" },
});

/* ── Split Hero Slide (poster left + info right) ────────────── */
function SplitHeroSlide({ franchise, onPress }: { franchise: Franchise; onPress: () => void }) {
  const { poster, img, logo } = useFranchiseAssets(franchise);
  const bg = img ?? poster;
  return (
    <Pressable onPress={onPress} style={{ width: W, height: 400, flexDirection: "row" }}>
      {bg ? (
        <Image source={{ uri: bg }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={18} />
      ) : (
        <LinearGradient colors={franchise.bgGradient} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={["rgba(5,5,8,0.45)", "rgba(5,5,8,0.9)"]}
        style={StyleSheet.absoluteFill}
      />
      {/* Left: poster card */}
      <View style={sph.posterSide}>
        <View style={sph.posterCard}>
          {poster ? (
            <Image source={{ uri: poster }} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} contentFit="cover" />
          ) : (
            <LinearGradient colors={franchise.bgGradient} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />
          )}
          <LinearGradient
            colors={[franchise.color + "00", franchise.color + "80"]}
            locations={[0.55, 1]}
            style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
          />
          {/* Left edge accent */}
          <View style={[sph.posterAccent, { backgroundColor: franchise.color }]} />
        </View>
      </View>
      {/* Right: info */}
      <View style={sph.infoSide}>
        <View style={[sph.catBadge, { borderColor: franchise.color + "55" }]}>
          <Text style={[sph.catTxt, { color: franchise.color }]}>{franchise.genre.toUpperCase()}</Text>
        </View>
        {logo ? (
          <Image source={{ uri: logo }} style={sph.logo} contentFit="contain" />
        ) : (
          <Text style={sph.title}>{franchise.name}</Text>
        )}
        <Text style={sph.desc} numberOfLines={3}>{franchise.description}</Text>
        <View style={sph.statsRow}>
          <View style={sph.statItem}>
            <Text style={[sph.statVal, { color: franchise.accentColor }]}>{franchise.contentCount}</Text>
            <Text style={sph.statLbl}>títulos</Text>
          </View>
          <View style={[sph.statDivider, { backgroundColor: franchise.color + "44" }]} />
          <View style={sph.statItem}>
            <Text style={[sph.statVal, { color: franchise.accentColor }]}>{franchise.totalHours}h</Text>
            <Text style={sph.statLbl}>conteúdo</Text>
          </View>
        </View>
        <Pressable onPress={onPress} style={[sph.btn, { borderColor: franchise.color + "55", backgroundColor: franchise.color + "18" }]}>
          <Text style={[sph.btnTxt, { color: franchise.accentColor }]}>Ver universo  →</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const sph = StyleSheet.create({
  posterSide: { width: W * 0.42, padding: 24, justifyContent: "center" },
  posterCard: {
    width: "100%", aspectRatio: 2 / 3, borderRadius: 16, overflow: "hidden",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#000", shadowOffset: { width: 4, height: 8 }, shadowRadius: 20, shadowOpacity: 0.8,
    elevation: 12,
  },
  posterAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  infoSide: { flex: 1, justifyContent: "center", paddingRight: 20, gap: 10 },
  catBadge: {
    alignSelf: "flex-start", borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "rgba(0,0,0,0.4)",
  },
  catTxt: { fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  logo: { width: "90%", height: 46 },
  title: { fontSize: 20, fontWeight: "900", color: "#fff", lineHeight: 24 },
  desc: { fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 18 },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  statItem: { alignItems: "center", gap: 2 },
  statVal: { fontSize: 22, fontWeight: "900" },
  statLbl: { fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: "600" },
  statDivider: { width: 1, height: 32 },
  btn: {
    alignSelf: "flex-start", borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  btnTxt: { fontSize: 12, fontWeight: "700" },
});

/* ── Rotating Hero (alternates slide types) ──────────────────── */
function RotatingHero({ onPress }: { onPress: (id: string) => void }) {
  const [idx, setIdx] = useState(0);
  const scrollRef = useRef<any>(null);
  const total = BANNER_FRANCHISES.length;

  useEffect(() => {
    const t = setInterval(() => {
      const next = (idx + 1) % total;
      scrollRef.current?.scrollTo({ x: next * W, animated: true });
      setIdx(next);
    }, 5500);
    return () => clearInterval(t);
  }, [idx, total]);

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / W))}
      >
        {BANNER_FRANCHISES.map((f, i) =>
          i % 2 === 0 ? (
            <CinematicHeroSlide key={f.id} franchise={f} onPress={() => onPress(f.id)} />
          ) : (
            <SplitHeroSlide key={f.id} franchise={f} onPress={() => onPress(f.id)} />
          )
        )}
      </ScrollView>
      {/* Dots */}
      <View style={rh.dots}>
        {BANNER_FRANCHISES.map((_, i) => (
          <Pressable
            key={i}
            onPress={() => { scrollRef.current?.scrollTo({ x: i * W, animated: true }); setIdx(i); }}
          >
            <View style={[rh.dot, i === idx
              ? { backgroundColor: "#fff", width: 20 }
              : { backgroundColor: "rgba(255,255,255,0.25)", width: 6 }
            ]} />
          </Pressable>
        ))}
      </View>
      {/* Counter */}
      <View style={rh.counter}>
        <Text style={rh.counterTxt}>{idx + 1} / {total}</Text>
      </View>
    </View>
  );
}

const rh = StyleSheet.create({
  dots: {
    position: "absolute", bottom: 16, left: 0, right: 0,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5,
  },
  dot: { height: 4, borderRadius: 2 },
  counter: {
    position: "absolute", bottom: 14, right: 16,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  counterTxt: { color: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: "700" },
});

// ═══════════════════════════════════════════════════════════════════
// CARD TYPES
// ═══════════════════════════════════════════════════════════════════

/* ── Standard Poster Card (improved) ─────────────────────────── */
function PosterCard({
  franchise, onPress, isFav, onFavPress, rank,
}: {
  franchise: Franchise; onPress: () => void;
  isFav?: boolean; onFavPress?: () => void; rank?: number;
}) {
  const { poster, logo } = useFranchiseAssets(franchise);
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 28, bounciness: 6 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 6 }).start()}
      onPress={onPress}
    >
      <Animated.View style={[poc.card, { transform: [{ scale }] }]}>
        {poster ? (
          <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={franchise.bgGradient} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.85)"]}
          locations={[0, 0.52, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[poc.topLine, { backgroundColor: franchise.color }]} />
        {rank != null && (
          <View style={[poc.rankBadge, { borderColor: franchise.color + "88" }]}>
            <Text style={[poc.rankTxt, { color: franchise.accentColor }]}>{rank}</Text>
          </View>
        )}
        {onFavPress && (
          <Pressable
            onPress={onFavPress}
            style={[poc.heart, isFav && { backgroundColor: "rgba(255,60,60,0.25)" }]}
            hitSlop={10}
          >
            <Feather name="heart" size={12} color={isFav ? "#ff4c4c" : "rgba(255,255,255,0.6)"} />
          </Pressable>
        )}
        <View style={poc.bottom}>
          {logo ? (
            <Image source={{ uri: logo }} style={poc.logo} contentFit="contain" />
          ) : (
            <Text style={poc.name} numberOfLines={2}>{franchise.shortName}</Text>
          )}
          <Text style={[poc.genre, { color: franchise.accentColor }]}>{franchise.genre}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const poc = StyleSheet.create({
  card: {
    width: CARD_W, height: CARD_H,
    borderRadius: 14, overflow: "hidden",
    marginRight: 12, backgroundColor: "#111",
  },
  topLine: { position: "absolute", top: 0, left: 0, right: 0, height: 3, zIndex: 2 },
  rankBadge: {
    position: "absolute", top: 9, left: 9, zIndex: 3,
    backgroundColor: "rgba(0,0,0,0.78)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7,
    borderWidth: 1,
  },
  rankTxt: { fontSize: 12, fontWeight: "900" },
  heart: {
    position: "absolute", top: 9, right: 9, zIndex: 3,
    backgroundColor: "rgba(0,0,0,0.65)", width: 27, height: 27, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2, padding: 10, paddingBottom: 11 },
  logo: { width: "100%", height: 32 },
  name: {
    color: "#fff", fontSize: 13, fontWeight: "800", lineHeight: 17,
    textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8,
  },
  genre: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5, marginTop: 4, opacity: 0.8, textTransform: "capitalize" },
});

/* ── Wide Backdrop Card (16:9) ───────────────────────────────── */
function WideBackdropCard({
  franchise, onPress, isFav, onFavPress,
}: {
  franchise: Franchise; onPress: () => void; isFav?: boolean; onFavPress?: () => void;
}) {
  const { img, logo } = useFranchiseAssets(franchise);
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 28, bounciness: 4 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 4 }).start()}
      onPress={onPress}
    >
      <Animated.View style={[wbc.card, { transform: [{ scale }] }]}>
        {img ? (
          <Image source={{ uri: img }} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} contentFit="cover" />
        ) : (
          <LinearGradient colors={franchise.bgGradient} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />
        )}
        <LinearGradient
          colors={["rgba(5,5,8,0.0)", "rgba(5,5,8,0.18)", "rgba(5,5,8,0.9)"]}
          locations={[0.2, 0.6, 1]}
          style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
        />
        {/* Category badge */}
        <View style={[wbc.catBadge, { backgroundColor: franchise.color + "cc" }]}>
          <Text style={wbc.catTxt}>{franchise.genre.toUpperCase()}</Text>
        </View>
        {/* Fav btn */}
        {onFavPress && (
          <Pressable onPress={onFavPress} style={[wbc.favBtn, isFav && { backgroundColor: "rgba(255,60,60,0.3)" }]} hitSlop={8}>
            <Feather name="heart" size={13} color={isFav ? "#ff4c4c" : "rgba(255,255,255,0.7)"} />
          </Pressable>
        )}
        {/* Bottom */}
        <View style={wbc.bottom}>
          {logo ? (
            <Image source={{ uri: logo }} style={wbc.logo} contentFit="contain" />
          ) : (
            <Text style={wbc.name} numberOfLines={1}>{franchise.name}</Text>
          )}
          <View style={wbc.metaRow}>
            <View style={[wbc.pill, { backgroundColor: franchise.color + "30", borderColor: franchise.color + "55" }]}>
              <Text style={[wbc.pillTxt, { color: franchise.accentColor }]}>{franchise.contentCount} títulos</Text>
            </View>
            <View style={[wbc.pill, { backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.14)" }]}>
              <Feather name="clock" size={9} color="rgba(255,255,255,0.55)" />
              <Text style={wbc.pillTxt}>{franchise.totalHours}h</Text>
            </View>
          </View>
        </View>
        {/* Left accent */}
        <View style={[wbc.leftAccent, { backgroundColor: franchise.color }]} />
      </Animated.View>
    </Pressable>
  );
}

const wbc = StyleSheet.create({
  card: {
    width: WIDE_W, height: WIDE_H,
    borderRadius: 16, overflow: "hidden",
    marginRight: 14, backgroundColor: "#111",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  catBadge: {
    position: "absolute", top: 12, left: 12, zIndex: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  catTxt: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  favBtn: {
    position: "absolute", top: 10, right: 10, zIndex: 3,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
  },
  bottom: { position: "absolute", bottom: 12, left: 14, right: 14, zIndex: 2 },
  logo: { width: "55%", height: 28, marginBottom: 8 },
  name: { color: "#fff", fontSize: 16, fontWeight: "900", marginBottom: 8 },
  metaRow: { flexDirection: "row", gap: 6 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1,
  },
  pillTxt: { color: "rgba(255,255,255,0.65)", fontSize: 10, fontWeight: "700" },
  leftAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
});

/* ── Rank Card (giant transparent number) ────────────────────── */
function RankCard({
  franchise, rank, onPress, isFav, onFavPress,
}: {
  franchise: Franchise; rank: number; onPress: () => void; isFav?: boolean; onFavPress?: () => void;
}) {
  const { poster, logo } = useFranchiseAssets(franchise);
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 28, bounciness: 6 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 6 }).start()}
      onPress={onPress}
    >
      <Animated.View style={[rkc.wrap, { transform: [{ scale }] }]}>
        {/* Giant number */}
        <Text style={[rkc.numBg, { color: franchise.color + "55" }]}>{rank}</Text>
        {/* Poster */}
        <View style={rkc.poster}>
          {poster ? (
            <Image source={{ uri: poster }} style={[StyleSheet.absoluteFill, { borderRadius: 10 }]} contentFit="cover" />
          ) : (
            <LinearGradient colors={franchise.bgGradient} style={[StyleSheet.absoluteFill, { borderRadius: 10 }]} />
          )}
          <LinearGradient
            colors={["rgba(5,5,8,0)", "rgba(5,5,8,0.85)"]}
            locations={[0.45, 1]}
            style={[StyleSheet.absoluteFill, { borderRadius: 10 }]}
          />
          {onFavPress && (
            <Pressable onPress={onFavPress} style={rkc.heart} hitSlop={8}>
              <Feather name="heart" size={11} color={isFav ? "#ff4c4c" : "rgba(255,255,255,0.65)"} />
            </Pressable>
          )}
        </View>
        {/* Label */}
        {logo ? (
          <Image source={{ uri: logo }} style={rkc.logo} contentFit="contain" />
        ) : (
          <Text style={rkc.name} numberOfLines={2}>{franchise.shortName}</Text>
        )}
        <View style={[rkc.bar, { backgroundColor: franchise.color }]} />
      </Animated.View>
    </Pressable>
  );
}

const rkc = StyleSheet.create({
  wrap: { width: 118, marginRight: 8, alignItems: "center" },
  numBg: {
    fontSize: 82, fontWeight: "900", lineHeight: 82,
    position: "absolute", left: -4, bottom: 40, zIndex: 1,
  },
  poster: {
    width: 82, height: 118, borderRadius: 10, overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    alignSelf: "flex-end", zIndex: 2, marginBottom: 6,
  },
  heart: {
    position: "absolute", top: 6, right: 6,
    backgroundColor: "rgba(0,0,0,0.6)", width: 24, height: 24,
    borderRadius: 12, alignItems: "center", justifyContent: "center",
  },
  logo: { width: 100, height: 24, marginBottom: 5 },
  name: {
    color: "#fff", fontSize: 11, fontWeight: "800", textAlign: "center",
    lineHeight: 14, marginBottom: 5, paddingHorizontal: 4,
  },
  bar: { width: 28, height: 2, borderRadius: 1 },
});

/* ── Neon Card (pulsing glow border) ────────────────────────── */
function NeonCard({
  franchise, onPress, isFav, onFavPress,
}: {
  franchise: Franchise; onPress: () => void; isFav?: boolean; onFavPress?: () => void;
}) {
  const { poster, logo } = useFranchiseAssets(franchise);
  const glow = useRef(new Animated.Value(0.3)).current;
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.85, duration: 1800, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.3, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 28, bounciness: 6 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 6 }).start()}
      onPress={onPress}
    >
      <Animated.View style={[
        nec.outer,
        { transform: [{ scale }], shadowColor: franchise.color, shadowOpacity: glow as any },
      ]}>
        <View style={[nec.card, { borderColor: franchise.color + "60" }]}>
          {poster ? (
            <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <LinearGradient colors={franchise.bgGradient} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={["rgba(5,5,8,0)", "rgba(5,5,8,0.1)", "rgba(5,5,8,0.88)"]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          {/* Neon top line */}
          <View style={[nec.topNeon, { backgroundColor: franchise.color }]} />
          {/* Heart */}
          {onFavPress && (
            <Pressable onPress={onFavPress} style={nec.heart} hitSlop={8}>
              <Feather name="heart" size={12} color={isFav ? "#ff4c4c" : "rgba(255,255,255,0.6)"} />
            </Pressable>
          )}
          {/* Bottom */}
          <View style={nec.bottom}>
            {logo ? (
              <Image source={{ uri: logo }} style={nec.logo} contentFit="contain" />
            ) : (
              <Text style={nec.name} numberOfLines={2}>{franchise.shortName}</Text>
            )}
            <View style={[nec.genrePill, { borderColor: franchise.color + "55" }]}>
              <Text style={[nec.genreTxt, { color: franchise.accentColor }]}>{franchise.genre.toUpperCase()}</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const nec = StyleSheet.create({
  outer: {
    marginRight: 12, borderRadius: 14,
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 16,
  },
  card: {
    width: CARD_W, height: CARD_H,
    borderRadius: 14, overflow: "hidden",
    backgroundColor: "#111", borderWidth: 1.5,
  },
  topNeon: { position: "absolute", top: 0, left: 0, right: 0, height: 2.5, zIndex: 2 },
  heart: {
    position: "absolute", top: 9, right: 9, zIndex: 3,
    backgroundColor: "rgba(0,0,0,0.65)", width: 27, height: 27, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 10, zIndex: 2 },
  logo: { width: "100%", height: 30, marginBottom: 6 },
  name: { color: "#fff", fontSize: 13, fontWeight: "800", lineHeight: 17, marginBottom: 6 },
  genrePill: {
    alignSelf: "flex-start", borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2, backgroundColor: "rgba(0,0,0,0.45)",
  },
  genreTxt: { fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
});

/* ── Glass Card (glassmorphism) ──────────────────────────────── */
function GlassCard({
  franchise, onPress, isFav, onFavPress,
}: {
  franchise: Franchise; onPress: () => void; isFav?: boolean; onFavPress?: () => void;
}) {
  const { poster, img, logo } = useFranchiseAssets(franchise);
  const scale = useRef(new Animated.Value(1)).current;
  const bg = img ?? poster;
  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 28, bounciness: 6 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 6 }).start()}
      onPress={onPress}
    >
      <Animated.View style={[glc.card, { transform: [{ scale }] }]}>
        {/* Blurred bg */}
        {bg ? (
          <Image source={{ uri: bg }} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} contentFit="cover" blurRadius={12} />
        ) : (
          <LinearGradient colors={franchise.bgGradient} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
        )}
        {/* Glass overlay */}
        <View style={[StyleSheet.absoluteFill, glc.glass, { borderRadius: 14 }]} />
        {/* Poster centered */}
        {poster && (
          <View style={glc.posterWrap}>
            <Image source={{ uri: poster }} style={[StyleSheet.absoluteFill, { borderRadius: 8 }]} contentFit="cover" />
          </View>
        )}
        {/* Top bar */}
        <View style={[glc.topBar, { backgroundColor: franchise.color }]} />
        {/* Fav */}
        {onFavPress && (
          <Pressable onPress={onFavPress} style={glc.heart} hitSlop={8}>
            <Feather name="heart" size={11} color={isFav ? "#ff4c4c" : "rgba(255,255,255,0.6)"} />
          </Pressable>
        )}
        {/* Bottom glass panel */}
        <View style={glc.bottomPanel}>
          {logo ? (
            <Image source={{ uri: logo }} style={glc.logo} contentFit="contain" />
          ) : (
            <Text style={glc.name} numberOfLines={1}>{franchise.shortName}</Text>
          )}
          <Text style={[glc.hours, { color: franchise.accentColor }]}>{franchise.totalHours}h</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const glc = StyleSheet.create({
  card: {
    width: CARD_W, height: CARD_H,
    borderRadius: 14, overflow: "hidden",
    marginRight: 12, backgroundColor: "#111",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
  },
  glass: { backgroundColor: "rgba(8,8,22,0.58)" },
  posterWrap: {
    position: "absolute", top: 14, left: 10, right: 10, bottom: 52,
    borderRadius: 8, overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, height: 2.5, zIndex: 2 },
  heart: {
    position: "absolute", top: 9, right: 9, zIndex: 3,
    backgroundColor: "rgba(0,0,0,0.65)", width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  bottomPanel: {
    position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2,
    backgroundColor: "rgba(5,5,18,0.72)", padding: 10,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)",
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  logo: { width: "70%", height: 22 },
  name: { color: "#fff", fontSize: 12, fontWeight: "800", flex: 1 },
  hours: { fontSize: 11, fontWeight: "700" },
});

/* ── Landscape Card (horizontal row item) ────────────────────── */
function LandscapeCard({
  franchise, onPress, isFav, onFavPress,
}: {
  franchise: Franchise; onPress: () => void; isFav?: boolean; onFavPress?: () => void;
}) {
  const { poster, logo } = useFranchiseAssets(franchise);
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 28, bounciness: 4 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 4 }).start()}
      onPress={onPress}
    >
      <Animated.View style={[lac.card, { transform: [{ scale }] }]}>
        {/* Poster thumb */}
        <View style={lac.thumb}>
          {poster ? (
            <Image source={{ uri: poster }} style={[StyleSheet.absoluteFill, { borderRadius: 10 }]} contentFit="cover" />
          ) : (
            <LinearGradient colors={franchise.bgGradient} style={[StyleSheet.absoluteFill, { borderRadius: 10 }]} />
          )}
          <View style={[lac.thumbAccent, { backgroundColor: franchise.color }]} />
        </View>
        {/* Info */}
        <View style={lac.info}>
          {logo ? (
            <Image source={{ uri: logo }} style={lac.logo} contentFit="contain" />
          ) : (
            <Text style={lac.title} numberOfLines={1}>{franchise.name}</Text>
          )}
          <Text style={lac.tagline} numberOfLines={1}>{franchise.tagline}</Text>
          <View style={lac.metaRow}>
            <View style={[lac.pill, { backgroundColor: franchise.color + "20", borderColor: franchise.color + "40" }]}>
              <Text style={[lac.pillTxt, { color: franchise.accentColor }]}>{franchise.contentCount} títulos</Text>
            </View>
            <View style={lac.yearPill}>
              <Text style={lac.yearTxt}>{franchise.yearRange}</Text>
            </View>
          </View>
        </View>
        {/* Actions */}
        <View style={lac.actions}>
          {onFavPress && (
            <Pressable onPress={onFavPress} hitSlop={8}>
              <Feather name="heart" size={15} color={isFav ? "#ff4c4c" : "rgba(255,255,255,0.35)"} />
            </Pressable>
          )}
          <Feather name="chevron-right" size={15} color="rgba(255,255,255,0.25)" />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const lac = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: GLASS, borderRadius: 14,
    borderWidth: 1, borderColor: GLASS_B,
    padding: 10, gap: 12,
  },
  thumb: {
    width: 54, height: 76, borderRadius: 10, overflow: "hidden",
    backgroundColor: "#111", flexShrink: 0,
  },
  thumbAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 2 },
  info: { flex: 1, gap: 5 },
  logo: { width: "75%", height: 20 },
  title: { color: "#fff", fontSize: 14, fontWeight: "800" },
  tagline: { color: "rgba(255,255,255,0.42)", fontSize: 11 },
  metaRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  pill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  pillTxt: { fontSize: 10, fontWeight: "700" },
  yearPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)" },
  yearTxt: { color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: "600" },
  actions: { gap: 10, alignItems: "center" },
});

// ═══════════════════════════════════════════════════════════════════
// BANNER INSERTS
// ═══════════════════════════════════════════════════════════════════

/* ── Stats Banner ─────────────────────────────────────────────── */
function StatsBanner() {
  const totalContent = FRANCHISES.reduce((a, f) => a + f.contentCount, 0);
  const totalHours = FRANCHISES.reduce((a, f) => a + f.totalHours, 0);
  const total = FRANCHISES.length;
  return (
    <View style={stb.wrap}>
      <LinearGradient colors={["#0d0d1e", "#080814"]} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />
      <View style={stb.row}>
        <View style={stb.item}>
          <Text style={[stb.val, { color: RED }]}>{total}</Text>
          <Text style={stb.lbl}>Universos</Text>
        </View>
        <View style={stb.div} />
        <View style={stb.item}>
          <Text style={[stb.val, { color: "#FFD700" }]}>{totalContent}+</Text>
          <Text style={stb.lbl}>Títulos</Text>
        </View>
        <View style={stb.div} />
        <View style={stb.item}>
          <Text style={[stb.val, { color: "#00c8ff" }]}>{(Math.round(totalHours / 100) / 10).toFixed(1)}k</Text>
          <Text style={stb.lbl}>Horas</Text>
        </View>
      </View>
      <Text style={stb.caption}>✦ Todos os universos em um só lugar</Text>
    </View>
  );
}

const stb = StyleSheet.create({
  wrap: {
    marginHorizontal: 16, marginVertical: 10, borderRadius: 16,
    overflow: "hidden", padding: 20,
    borderWidth: 1, borderColor: "rgba(229,9,20,0.18)",
  },
  row: { flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  item: { alignItems: "center", gap: 4 },
  val: { fontSize: 28, fontWeight: "900" },
  lbl: { fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: "600" },
  div: { width: 1, height: 40, backgroundColor: "rgba(255,255,255,0.09)" },
  caption: { textAlign: "center", color: "rgba(255,255,255,0.22)", fontSize: 11, marginTop: 14, fontWeight: "600", letterSpacing: 0.5 },
});

/* ── Featured Banner (editorial spotlight) ───────────────────── */
function FeaturedBanner({ franchise, onPress }: { franchise: Franchise; onPress: () => void }) {
  const { img, logo } = useFranchiseAssets(franchise);
  return (
    <Pressable onPress={onPress} style={fbd.wrap}>
      {img ? (
        <Image source={{ uri: img }} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} contentFit="cover" />
      ) : (
        <LinearGradient colors={franchise.bgGradient} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
      )}
      <LinearGradient
        colors={["rgba(5,5,8,0.08)", "rgba(5,5,8,0.55)", "rgba(5,5,8,0.95)"]}
        locations={[0, 0.5, 1]}
        style={[StyleSheet.absoluteFill, { borderRadius: 18 }]}
      />
      <View style={[fbd.leftStripe, { backgroundColor: franchise.color }]} />
      <View style={fbd.content}>
        <Text style={fbd.eyebrow}>✦ DESTAQUE DA SEMANA</Text>
        {logo ? (
          <Image source={{ uri: logo }} style={fbd.logo} contentFit="contain" />
        ) : (
          <Text style={fbd.title}>{franchise.name}</Text>
        )}
        <Text style={fbd.desc} numberOfLines={2}>{franchise.description}</Text>
        <Pressable onPress={onPress} style={[fbd.btn, { borderColor: franchise.color + "55" }]}>
          <Text style={[fbd.btnTxt, { color: franchise.accentColor }]}>EXPLORAR AGORA  →</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const fbd = StyleSheet.create({
  wrap: {
    marginHorizontal: 16, height: 175,
    borderRadius: 18, overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  leftStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, zIndex: 2 },
  content: { position: "absolute", bottom: 18, left: 22, right: 18, zIndex: 2 },
  eyebrow: { color: "rgba(255,255,255,0.45)", fontSize: 9, fontWeight: "800", letterSpacing: 1.5, marginBottom: 8 },
  logo: { width: 155, height: 40, marginBottom: 8 },
  title: { color: "#fff", fontSize: 20, fontWeight: "900", marginBottom: 8 },
  desc: { color: "rgba(255,255,255,0.6)", fontSize: 12, lineHeight: 18, marginBottom: 12 },
  btn: {
    alignSelf: "flex-start", borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  btnTxt: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
});

// ═══════════════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════════════

/* ── Section Header ──────────────────────────────────────────── */
function SectionHeader({
  title, color, count, onVerMais,
}: {
  title: string; color?: string; count?: number; onVerMais?: () => void;
}) {
  const accent = color ?? RED;
  return (
    <View style={sth.row}>
      <View style={[sth.bar, { backgroundColor: accent }]} />
      <Text style={sth.title}>{title}</Text>
      {count != null && (
        <Text style={sth.count}>{count}</Text>
      )}
      {onVerMais && (
        <Pressable onPress={onVerMais} style={[sth.btn, { borderColor: accent + "55" }]}>
          <Text style={[sth.btnTxt, { color: accent }]}>Ver mais</Text>
          <Feather name="chevron-right" size={12} color={accent} />
        </Pressable>
      )}
    </View>
  );
}

const sth = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 10, marginBottom: 14 },
  bar: { width: 3.5, height: 18, borderRadius: 2 },
  title: { color: "#fff", fontSize: 17, fontWeight: "800", flex: 1 },
  count: {
    color: "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: "700",
    backgroundColor: "rgba(255,255,255,0.07)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  btn: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
  },
  btnTxt: { fontSize: 11, fontWeight: "700" },
});

/* ── Scroll Top FAB ──────────────────────────────────────────── */
function ScrollTopFab({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: visible ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [visible]);
  return (
    <Animated.View
      style={[fbt.wrap, { opacity: anim, transform: [{ scale: anim }] }]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <Pressable onPress={onPress} style={fbt.btn}>
        <Feather name="arrow-up" size={18} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

const fbt = StyleSheet.create({
  wrap: { position: "absolute", bottom: 122, right: 18, zIndex: 20 },
  btn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: RED, alignItems: "center", justifyContent: "center",
    shadowColor: RED, shadowOffset: { width: 0, height: 0 }, shadowRadius: 14, shadowOpacity: 0.75,
    elevation: 8,
  },
});

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const GENRE_FILTERS = [
  { key: "all",       label: "Todos",        icon: "grid"    as const },
  { key: "superherois", label: "Super-heróis", icon: "shield" as const },
  { key: "acao",      label: "Ação",          icon: "zap"    as const },
  { key: "scifi",     label: "Sci-Fi",        icon: "cpu"    as const },
  { key: "fantasia",  label: "Fantasia",      icon: "star"   as const },
  { key: "terror",    label: "Terror",        icon: "moon"   as const },
  { key: "animacao",  label: "Animação",      icon: "tv"     as const },
  { key: "anime",     label: "Anime",         icon: "heart"  as const },
  { key: "drama",     label: "Drama",         icon: "users"  as const },
];

const GENRE_KEYWORDS: Record<string, string> = {
  superherois: "superhero", acao: "action", scifi: "sci-fi",
  fantasia: "fantasy", terror: "horror", drama: "drama",
  animacao: "animation", anime: "anime",
};

// Which card format each genre uses
const GENRE_FORMAT: Record<string, "neon" | "glass" | "poster" | "landscape" | "wide"> = {
  superherois: "neon",
  scifi:       "glass",
  acao:        "poster",
  fantasia:    "wide",
  drama:       "landscape",
  terror:      "neon",
  animacao:    "poster",
  anime:       "neon",
};

type SortKey = "popular" | "az" | "content" | "year";
const SORT_OPTIONS: { key: SortKey; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: "popular", label: "Popular",       icon: "trending-up" },
  { key: "az",      label: "A–Z",           icon: "type"        },
  { key: "content", label: "Mais títulos",  icon: "film"        },
  { key: "year",    label: "Mais recente",  icon: "calendar"    },
];

function sortFranchises(list: Franchise[], key: SortKey): Franchise[] {
  const s = [...list];
  if (key === "az") s.sort((a, b) => a.name.localeCompare(b.name));
  else if (key === "content") s.sort((a, b) => b.contentCount - a.contentCount);
  else if (key === "year") {
    s.sort((a, b) => {
      const ya = parseInt(a.yearRange?.split(" - ")[0] ?? "0", 10);
      const yb = parseInt(b.yearRange?.split(" - ")[0] ?? "0", 10);
      return yb - ya;
    });
  }
  return s;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════
export default function FranquiasScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;
  const { toggle, isFavorite } = useFavorites();

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeSort, setActiveSort] = useState<SortKey>("popular");
  const [showSort, setShowSort] = useState(false);
  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showFab, setShowFab] = useState(false);

  const scrollRef = useRef<any>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const headerBg = scrollY.interpolate({
    inputRange: [340, 400],
    outputRange: ["rgba(5,5,8,0)", "rgba(5,5,8,0.97)"],
    extrapolate: "clamp",
  });

  const goTo = useCallback(
    (id: string) => router.push({ pathname: "/franchise", params: { id } }),
    [router]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    _imgCache.clear();
    _posterCache.clear();
    _logoCache.clear();
    await new Promise<void>((r) => setTimeout(r, 1200));
    setRefreshing(false);
  }, []);

  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim()) { setTmdbResults([]); setTmdbLoading(false); return; }
    setTmdbLoading(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const data = await api.tmdb.searchCollections(text.trim());
        const localIds = new Set(FRANCHISES.map((f) => f.tmdbCollectionId).filter(Boolean));
        const fresh = (data.results ?? []).filter((r: any) => !localIds.has(r.id)).slice(0, 12);
        setTmdbResults(fresh);
      } catch { setTmdbResults([]); }
      finally { setTmdbLoading(false); }
    }, 500);
  }, []);

  const searchResults = useMemo(() =>
    search.trim()
      ? FRANCHISES.filter(f =>
          f.name.toLowerCase().includes(search.toLowerCase()) ||
          f.tagline.toLowerCase().includes(search.toLowerCase()) ||
          f.category.toLowerCase().includes(search.toLowerCase()))
      : [],
    [search]);

  const favoriteFranchises = useMemo(
    () => FRANCHISES.filter(f => isFavorite(f.id)),
    [isFavorite]
  );

  const visibleSections = useMemo(
    () => activeFilter === "all" ? GENRE_SECTIONS : GENRE_SECTIONS.filter(g => g.genre === activeFilter),
    [activeFilter]
  );

  const getSectionFranchises = useCallback((genre: string) => {
    const base = FRANCHISES.filter(f => f.genre === genre);
    return activeFilter === "all" ? sortFranchises(base, activeSort) : base;
  }, [activeFilter, activeSort]);

  const featuredFranchise = useMemo(
    () => FRANCHISES.find(f => f.id === "marvel") ?? FRANCHISES[0],
    []
  );

  const sectionCount = activeFilter === "all"
    ? FRANCHISES.length
    : FRANCHISES.filter(f => f.genre === activeFilter).length;

  return (
    <View style={s.container}>
      <StatusBar style="light" />

      <Animated.ScrollView
        ref={scrollRef}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: false,
            listener: (e: any) => setShowFab(e.nativeEvent.contentOffset.y > 500),
          }
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={RED} colors={[RED]} />
        }
      >
        {/* ── HERO CAROUSEL ───────────────────── */}
        <RotatingHero onPress={goTo} />

        {/* ── SEARCH BAR ──────────────────────── */}
        <View style={s.searchWrap}>
          <View style={s.searchBar}>
            <Feather name="search" size={16} color="rgba(255,255,255,0.4)" />
            <TextInput
              value={search}
              onChangeText={handleSearchChange}
              placeholder="Buscar universos e franquias..."
              placeholderTextColor="rgba(255,255,255,0.28)"
              style={s.searchInput}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => { setSearch(""); setTmdbResults([]); }}>
                <Feather name="x" size={15} color="rgba(255,255,255,0.4)" />
              </Pressable>
            )}
          </View>
        </View>

        {search.trim().length > 0 ? (
          /* ════════════════════════════════════
             SEARCH RESULTS
          ════════════════════════════════════ */
          <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
            <Text style={s.searchMeta}>
              {searchResults.length + tmdbResults.length} resultado{(searchResults.length + tmdbResults.length) !== 1 ? "s" : ""} para "{search}"
            </Text>

            {/* Local results as landscape cards */}
            {searchResults.length > 0 && (
              <>
                <Text style={s.searchSectionLbl}>Franquias locais</Text>
                {searchResults.map(f => (
                  <LandscapeCard
                    key={f.id}
                    franchise={f}
                    onPress={() => goTo(f.id)}
                    isFav={isFavorite(f.id)}
                    onFavPress={() => toggle(f.id)}
                  />
                ))}
              </>
            )}

            {/* TMDB collections */}
            {(tmdbLoading || tmdbResults.length > 0) && (
              <>
                <Text style={[s.searchSectionLbl, { marginTop: searchResults.length > 0 ? 18 : 0 }]}>
                  Coleções do TMDB
                </Text>
                {tmdbLoading ? (
                  <View style={{ paddingVertical: 24, alignItems: "center" }}>
                    <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Buscando no TMDB...</Text>
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 0 }}>
                    {tmdbResults.map((col: any) => {
                      const uri = col.poster_path
                        ? `https://image.tmdb.org/t/p/w500${col.poster_path}`
                        : col.backdrop_path
                          ? `https://image.tmdb.org/t/p/w500${col.backdrop_path}`
                          : null;
                      return (
                        <Pressable
                          key={col.id}
                          onPress={() => router.push({ pathname: "/franchise", params: { id: `tmdb_collection_${col.id}`, name: col.name } })}
                          style={s.tmdbCard}
                        >
                          {uri ? (
                            <Image source={{ uri }} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} contentFit="cover" />
                          ) : (
                            <LinearGradient colors={["#1a1a2e", "#0a0a14"]} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
                          )}
                          <LinearGradient
                            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.78)"]}
                            locations={[0.5, 1]}
                            style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
                          />
                          <View style={s.tmdbBadge}><Text style={s.tmdbBadgeTxt}>TMDB</Text></View>
                          <View style={s.tmdbBottom}><Text style={s.tmdbName} numberOfLines={2}>{col.name}</Text></View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </>
            )}

            {/* Empty state */}
            {!tmdbLoading && searchResults.length === 0 && tmdbResults.length === 0 && (
              <View style={s.emptyWrap}>
                <Text style={s.emptyEmoji}>🔍</Text>
                <Text style={s.emptyTxt}>Nenhuma franquia encontrada</Text>
                <Text style={s.emptyHint}>Tente outro termo de busca</Text>
              </View>
            )}
          </View>
        ) : (
          /* ════════════════════════════════════
             MAIN CONTENT
          ════════════════════════════════════ */
          <>
            {/* ── FILTER PILLS ─────────────────── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.filterRow}
            >
              {GENRE_FILTERS.map(gf => (
                <Pressable
                  key={gf.key}
                  onPress={() => setActiveFilter(gf.key)}
                  style={[
                    s.pill,
                    activeFilter === gf.key
                      ? { backgroundColor: RED, borderColor: RED }
                      : { backgroundColor: GLASS, borderColor: GLASS_B },
                  ]}
                >
                  <Feather
                    name={gf.icon}
                    size={11}
                    color={activeFilter === gf.key ? "#fff" : "rgba(255,255,255,0.45)"}
                  />
                  <Text style={[s.pillTxt, { color: activeFilter === gf.key ? "#fff" : "rgba(255,255,255,0.65)" }]}>
                    {gf.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* ── SORT + COUNT BAR ──────────────── */}
            <View style={s.sortBar}>
              <Text style={s.sortCount}>{sectionCount} universos</Text>
              <Pressable onPress={() => setShowSort(v => !v)} style={s.sortBtn}>
                <Feather name="sliders" size={13} color={RED} />
                <Text style={s.sortBtnTxt}>{SORT_OPTIONS.find(o => o.key === activeSort)?.label}</Text>
                <Feather name={showSort ? "chevron-up" : "chevron-down"} size={12} color={RED} />
              </Pressable>
            </View>

            {/* ── SORT DROPDOWN ─────────────────── */}
            {showSort && (
              <View style={s.sortDropdown}>
                {SORT_OPTIONS.map(o => (
                  <Pressable
                    key={o.key}
                    onPress={() => { setActiveSort(o.key); setShowSort(false); }}
                    style={[s.sortOption, activeSort === o.key && { backgroundColor: RED + "18" }]}
                  >
                    <Feather name={o.icon} size={14} color={activeSort === o.key ? RED : "rgba(255,255,255,0.55)"} />
                    <Text style={[s.sortOptionTxt, { color: activeSort === o.key ? RED : "rgba(255,255,255,0.7)" }]}>
                      {o.label}
                    </Text>
                    {activeSort === o.key && <Feather name="check" size={13} color={RED} />}
                  </Pressable>
                ))}
              </View>
            )}

            {/* ── FAVORITOS ─────────────────────── */}
            {favoriteFranchises.length > 0 && (
              <View style={s.section}>
                <SectionHeader title="❤️ Meus Favoritos" color="#ff4c4c" count={favoriteFranchises.length} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                  {favoriteFranchises.map(f => (
                    <PosterCard
                      key={f.id}
                      franchise={f}
                      onPress={() => goTo(f.id)}
                      isFav
                      onFavPress={() => toggle(f.id)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── TOP 10 ────────────────────────── */}
            {activeFilter === "all" && (
              <View style={s.section}>
                <SectionHeader title="🏆 Top 10 Universos" color="#FFD700" count={TOP10_FRANCHISES.length} />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[s.hScroll, { paddingLeft: 24 }]}
                >
                  {TOP10_FRANCHISES.map((f, i) => (
                    <RankCard
                      key={f.id}
                      franchise={f}
                      rank={i + 1}
                      onPress={() => goTo(f.id)}
                      isFav={isFavorite(f.id)}
                      onFavPress={() => toggle(f.id)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── STATS BANNER ──────────────────── */}
            {activeFilter === "all" && <StatsBanner />}

            {/* ── FEATURED EDITORIAL BANNER ─────── */}
            {activeFilter === "all" && (
              <View style={[s.section, { marginTop: 8 }]}>
                <SectionHeader title="⭐ Destaque" color={RED} />
                <FeaturedBanner franchise={featuredFranchise} onPress={() => goTo(featuredFranchise.id)} />
              </View>
            )}

            {/* ── GENRE SECTIONS ────────────────── */}
            {visibleSections.map(({ genre, label }) => {
              const items = getSectionFranchises(genre);
              if (items.length === 0) return null;
              const color = items[0]?.color;
              const fmt = GENRE_FORMAT[genre] ?? "poster";
              const keyword = GENRE_KEYWORDS[genre];

              return (
                <View key={genre} style={s.section}>
                  <SectionHeader
                    title={label}
                    color={color}
                    count={items.length}
                    onVerMais={keyword
                      ? () => router.push({ pathname: "/collections-browser", params: { q: keyword, title: label } })
                      : undefined}
                  />

                  {fmt === "landscape" ? (
                    /* Landscape list (drama) */
                    <View>
                      {items.slice(0, 5).map(f => (
                        <LandscapeCard
                          key={f.id}
                          franchise={f}
                          onPress={() => goTo(f.id)}
                          isFav={isFavorite(f.id)}
                          onFavPress={() => toggle(f.id)}
                        />
                      ))}
                      {items.length > 5 && keyword && (
                        <Pressable
                          onPress={() => router.push({ pathname: "/collections-browser", params: { q: keyword, title: label } })}
                          style={s.viewAllBtn}
                        >
                          <Text style={s.viewAllTxt}>Ver todos {items.length} universos  →</Text>
                        </Pressable>
                      )}
                    </View>
                  ) : fmt === "wide" ? (
                    /* Wide backdrop (fantasia) */
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                      {items.map(f => (
                        <WideBackdropCard
                          key={f.id}
                          franchise={f}
                          onPress={() => goTo(f.id)}
                          isFav={isFavorite(f.id)}
                          onFavPress={() => toggle(f.id)}
                        />
                      ))}
                    </ScrollView>
                  ) : fmt === "glass" ? (
                    /* Glass cards (sci-fi) */
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                      {items.map(f => (
                        <GlassCard
                          key={f.id}
                          franchise={f}
                          onPress={() => goTo(f.id)}
                          isFav={isFavorite(f.id)}
                          onFavPress={() => toggle(f.id)}
                        />
                      ))}
                    </ScrollView>
                  ) : fmt === "neon" ? (
                    /* Neon glow cards (superherois, terror, anime) */
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                      {items.map(f => (
                        <NeonCard
                          key={f.id}
                          franchise={f}
                          onPress={() => goTo(f.id)}
                          isFav={isFavorite(f.id)}
                          onFavPress={() => toggle(f.id)}
                        />
                      ))}
                    </ScrollView>
                  ) : (
                    /* Default poster cards (acao, animacao) */
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                      {items.map(f => (
                        <PosterCard
                          key={f.id}
                          franchise={f}
                          onPress={() => goTo(f.id)}
                          isFav={isFavorite(f.id)}
                          onFavPress={() => toggle(f.id)}
                        />
                      ))}
                    </ScrollView>
                  )}
                </View>
              );
            })}
          </>
        )}
      </Animated.ScrollView>

      {/* ── STICKY HEADER ──────────────────── */}
      <Animated.View
        style={[s.stickyHeader, { paddingTop: topPad, backgroundColor: headerBg as any }]}
        pointerEvents="box-none"
      >
        <View style={s.stickyContent}>
          <View>
            <Text style={s.stickyTitle}>UNIVERSOS</Text>
            <Text style={s.stickyMeta}>{FRANCHISES.length} franquias</Text>
          </View>
          <Pressable style={s.stickyBtn} onPress={() => router.push("/(tabs)/search")}>
            <Feather name="search" size={18} color="rgba(255,255,255,0.85)" />
          </Pressable>
        </View>
      </Animated.View>

      {/* ── SCROLL TOP FAB ─────────────────── */}
      <ScrollTopFab
        visible={showFab}
        onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // Search
  searchWrap: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: GLASS, borderRadius: 16,
    borderWidth: 1, borderColor: GLASS_B,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "500" },
  searchMeta: { color: "rgba(255,255,255,0.38)", fontSize: 12, marginBottom: 14 },
  searchSectionLbl: { color: "rgba(255,255,255,0.52)", fontSize: 12, fontWeight: "700", marginBottom: 10, letterSpacing: 0.5 },

  // TMDB search results
  tmdbCard: {
    width: CARD_W, height: CARD_H,
    borderRadius: 14, overflow: "hidden",
    marginRight: 12, backgroundColor: "#111",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  tmdbBadge: {
    position: "absolute", top: 10, right: 10, zIndex: 3,
    backgroundColor: "#032541", paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 5, borderWidth: 1, borderColor: "#01b4e4",
  },
  tmdbBadgeTxt: { color: "#01b4e4", fontSize: 8, fontWeight: "800" },
  tmdbBottom: { position: "absolute", bottom: 10, left: 10, right: 10, zIndex: 2 },
  tmdbName: { color: "#fff", fontSize: 12, fontWeight: "700", lineHeight: 16 },

  // Empty
  emptyWrap: { alignItems: "center", paddingVertical: 50, gap: 10 },
  emptyEmoji: { fontSize: 44 },
  emptyTxt: { color: "rgba(255,255,255,0.5)", fontSize: 16, fontWeight: "700" },
  emptyHint: { color: "rgba(255,255,255,0.22)", fontSize: 13 },

  // Filters
  filterRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 16 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 13, paddingVertical: 8,
    borderRadius: 24, borderWidth: 1,
  },
  pillTxt: { fontSize: 12, fontWeight: "700" },

  // Sort
  sortBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 14,
  },
  sortCount: { color: "rgba(255,255,255,0.32)", fontSize: 12, fontWeight: "600" },
  sortBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: RED + "14", borderWidth: 1, borderColor: RED + "40",
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  sortBtnTxt: { color: RED, fontSize: 12, fontWeight: "700" },
  sortDropdown: {
    marginHorizontal: 16, marginBottom: 14,
    backgroundColor: "#0e0e1a", borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
  },
  sortOption: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)",
  },
  sortOptionTxt: { flex: 1, fontSize: 14, fontWeight: "600" },

  // Sections
  section: { marginBottom: 28 },
  hScroll: { paddingHorizontal: 16, paddingBottom: 4 },
  viewAllBtn: {
    marginHorizontal: 16, marginTop: 6, paddingVertical: 13,
    backgroundColor: GLASS, borderRadius: 12, borderWidth: 1, borderColor: GLASS_B,
    alignItems: "center",
  },
  viewAllTxt: { color: RED, fontSize: 13, fontWeight: "700" },

  // Sticky header
  stickyHeader: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  stickyContent: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 10,
  },
  stickyTitle: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 1.5 },
  stickyMeta: { color: "rgba(255,255,255,0.32)", fontSize: 11, fontWeight: "600" },
  stickyBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_B,
    alignItems: "center", justifyContent: "center",
  },
});
