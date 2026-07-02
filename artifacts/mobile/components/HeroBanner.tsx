import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import type { ContentItem } from "@/constants/content";

const CARD_MARGIN        = 7;   // px each side — small margin like Netflix
const CARD_POSTER_RATIO  = 1.22; // height / width — slightly taller than wide
const AUTO_ADVANCE_MS    = 6000;

/* ─── TMDB logo hook — routes through API server proxy ─── */
const logoCache = new Map<string, string | null>();

function useTmdbLogo(id?: number, type?: "movie" | "tv") {
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !type) return;
    const key = `${type}_${id}`;
    if (logoCache.has(key)) { setLogo(logoCache.get(key) ?? null); return; }
    let cancelled = false;
    (async () => {
      try {
        // Route through server proxy — avoids browser CORS / rate-limit issues
        const { getApiBase } = await import("@/lib/api");
        const base = getApiBase();
        const r = await fetch(`${base}/tmdb/${type}/${id}/images`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (cancelled) return;
        const logos: any[] = data.logos ?? [];
        // Prefer pt logo, then en, then first available
        const pt   = logos.find((l: any) => l.iso_639_1 === "pt");
        const en   = logos.find((l: any) => l.iso_639_1 === "en");
        const best = pt ?? en ?? logos[0] ?? null;
        const path = best?.file_path
          ? `https://image.tmdb.org/t/p/w500${best.file_path}`
          : null;
        logoCache.set(key, path);
        if (!cancelled) setLogo(path);
      } catch {
        if (!cancelled) { logoCache.set(key, null); }
      }
    })();
    return () => { cancelled = true; };
  }, [id, type]);
  return logo;
}

/* ─── Genre names ─── */
const GENRE_NAMES: Record<number, string> = {
  28: "Ação", 12: "Aventura", 16: "Animação", 35: "Comédia", 80: "Crime",
  99: "Documentário", 18: "Drama", 10751: "Família", 14: "Fantasia",
  27: "Terror", 9648: "Mistério", 10749: "Romance", 878: "Ficção Científica",
  53: "Suspense", 10752: "Guerra", 37: "Faroeste", 10759: "Ação & Aventura",
  10765: "Sci-Fi & Fantasia", 10766: "Novela",
};

/* ─── Props ─── */
interface HeroBannerProps {
  items: ContentItem[];
  onItemPress?: (item: ContentItem) => void;
  onDetailsPress?: (item: ContentItem) => void;
  onAddToList?: (item: ContentItem) => void;
}

interface HeroItemProps {
  item: ContentItem;
  onWatch?: () => void;
  onDetails?: () => void;
  onAddToList?: () => void;
  isActive: boolean;
  index: number;
  screenWidth: number;
}

/* ─── Single hero slide ─── */
function HeroItem({ item, onWatch, onDetails, onAddToList, isActive, screenWidth }: HeroItemProps) {
  const [imgError,  setImgError]  = useState(false);
  const [logoError, setLogoError] = useState(false);

  const fadeAnim    = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(0)).current;
  const scaleAnim   = useRef(new Animated.Value(1.06)).current;

  const type   = item.mediaType === "movie" || item.type === "movie" ? "movie" : "tv";
  const tmdbId = item.tmdbId ? Number(item.tmdbId) : undefined;
  const logoUrl = useTmdbLogo(tmdbId, type);

  useEffect(() => {
    if (isActive) {
      Animated.parallel([
        Animated.timing(fadeAnim,    { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(contentFade, { toValue: 1, duration: 600, delay: 120, useNativeDriver: true }),
        Animated.timing(scaleAnim,   { toValue: 1, duration: 7000, useNativeDriver: true }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      contentFade.setValue(0);
      scaleAnim.setValue(1.06);
    }
  }, [isActive]);

  const displayGenres = useMemo(
    () =>
      Array.isArray(item.genres)
        ? (item.genres.filter((g: unknown) => typeof g === "number").slice(0, 3) as number[])
        : [],
    [item.genres]
  );

  const cardWidth   = screenWidth - CARD_MARGIN * 2;
  const cardHeight  = Math.round(cardWidth * CARD_POSTER_RATIO);

  // Prefer landscape backdrop for the hero image
  const bannerImg = (!imgError && (item.backdropPath || item.posterPath)) ? (item.backdropPath || item.posterPath) : null;

  return (
    <View style={{ width: screenWidth, alignItems: "center" }}>
      <Animated.View
        style={{
          width: cardWidth,
          height: cardHeight,
          borderRadius: 16,
          overflow: "hidden",
          opacity: fadeAnim,
          backgroundColor: "#0c0c14",
        }}
      >
        <Pressable
          onPress={onDetails ?? onWatch}
          style={StyleSheet.absoluteFill}
          android_ripple={{ color: "rgba(255,255,255,0.06)" }}
        >
          {/* Banner image */}
          {bannerImg ? (
            <Animated.View style={{ ...StyleSheet.absoluteFillObject, transform: [{ scale: scaleAnim }] }}>
              <Image
                source={{ uri: bannerImg }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={Platform.OS === "web" ? 350 : 0}
                cachePolicy="memory-disk"
                onError={() => setImgError(true)}
              />
            </Animated.View>
          ) : (
            <LinearGradient colors={["#1a0a14", "#08060e"]} style={StyleSheet.absoluteFill} />
          )}

          {/* Top fade (subtle darkening for top area legibility) */}
          <LinearGradient
            colors={["rgba(0,0,0,0.52)", "rgba(0,0,0,0.1)", "transparent"]}
            locations={[0, 0.18, 0.38]}
            style={StyleSheet.absoluteFill}
          />

          {/* Bottom gradient — strong, covers bottom 60% for text + buttons */}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.82)", "#060609"]}
            locations={[0.28, 0.55, 0.78, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* N badge — top left */}
          <View style={heroStyles.nBadge}>
            <Text style={heroStyles.nBadgeText}>N</Text>
          </View>

          {/* Bottom overlay: logo + genres + buttons */}
          <Animated.View style={[heroStyles.overlay, { opacity: contentFade }]}>
            {/* Logo image or title text */}
            {logoUrl && !logoError ? (
              <Image
                source={{ uri: logoUrl }}
                style={heroStyles.logoImg}
                contentFit="contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              <Text style={heroStyles.heroTitle} numberOfLines={2}>
                {item.title}
              </Text>
            )}

            {/* Genre dots */}
            {displayGenres.length > 0 && (
              <View style={heroStyles.genreRow}>
                {displayGenres.map((g, idx) => {
                  const name = GENRE_NAMES[g];
                  if (!name) return null;
                  return (
                    <React.Fragment key={g}>
                      {idx > 0 && <View style={heroStyles.genreDot} />}
                      <Text style={heroStyles.genreText}>{name}</Text>
                    </React.Fragment>
                  );
                })}
              </View>
            )}

            {/* Assistir button — white, full width */}
            <Pressable
              onPress={onWatch}
              style={({ pressed }) => [heroStyles.watchBtn, { opacity: pressed ? 0.82 : 1 }]}
            >
              <Feather name="play" size={16} color="#111" />
              <Text style={heroStyles.watchBtnText}>Assistir</Text>
            </Pressable>

            {/* Minha lista + Detalhes row */}
            <View style={heroStyles.secondaryRow}>
              <TouchableOpacity
                onPress={onAddToList}
                style={heroStyles.ghostBtn}
                activeOpacity={0.78}
              >
                <Feather name="plus" size={16} color="rgba(255,255,255,0.92)" />
                <Text style={heroStyles.ghostBtnText}>Minha lista</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onDetails ?? onWatch}
                style={heroStyles.ghostBtnSmall}
                activeOpacity={0.78}
              >
                <Feather name="info" size={15} color="rgba(255,255,255,0.85)" />
                <Text style={heroStyles.ghostBtnText}>Detalhes</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/* ─── Skeleton loading state ─── */
function HeroBannerSkeleton({ width: w }: { width: number }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 850, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const opacity  = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.0] });
  const cardWidth  = w - CARD_MARGIN * 2;
  const cardHeight = Math.round(cardWidth * CARD_POSTER_RATIO);

  return (
    <View style={{ width: w, alignItems: "center" }}>
      <View style={{ width: cardWidth, height: cardHeight, borderRadius: 16, overflow: "hidden", backgroundColor: "#141420" }}>
        <Animated.View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "#1e1e2e", opacity }} />
        {/* Shimmer at bottom for button area */}
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, gap: 10 }}>
          <Animated.View style={{ height: 52, width: "85%", alignSelf: "center", backgroundColor: "#2a2a3a", borderRadius: 8, opacity }} />
          <Animated.View style={{ height: 44, width: "100%", backgroundColor: "#2a2a3a", borderRadius: 8, opacity }} />
          <Animated.View style={{ height: 38, width: "100%", backgroundColor: "#242432", borderRadius: 8, opacity }} />
        </View>
      </View>
    </View>
  );
}

/* ─── Main HeroBanner component ─── */
export function HeroBanner({ items, onItemPress, onDetailsPress, onAddToList }: HeroBannerProps) {
  const { width: w } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef     = useRef<any>(null);
  const timerRef      = useRef<any>(null);
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const hasItems      = items.length > 0;

  useEffect(() => {
    if (hasItems) {
      Animated.timing(bannerOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    } else {
      bannerOpacity.setValue(0);
    }
  }, [hasItems]);

  const goTo = useCallback(
    (idx: number) => {
      const next = ((idx % items.length) + items.length) % items.length;
      scrollRef.current?.scrollTo({ x: next * w, animated: true });
      setActiveIndex(next);
    },
    [items.length, w]
  );

  const resetTimer = useCallback(
    (_fromIdx: number) => {
      clearInterval(timerRef.current);
      if (items.length <= 1) return;
      timerRef.current = setInterval(() => {
        setActiveIndex((cur) => {
          const next = (cur + 1) % items.length;
          scrollRef.current?.scrollTo({ x: next * w, animated: true });
          return next;
        });
      }, AUTO_ADVANCE_MS);
    },
    [items.length, w]
  );

  useEffect(() => {
    resetTimer(activeIndex);
    return () => clearInterval(timerRef.current);
  }, [activeIndex, resetTimer]);

  const onScrollEnd = useCallback(
    (e: any) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / w);
      setActiveIndex(idx);
      resetTimer(idx);
    },
    [resetTimer, w]
  );

  const handleThumbPress = useCallback(
    (idx: number) => {
      clearInterval(timerRef.current);
      goTo(idx);
      resetTimer(idx);
    },
    [goTo, resetTimer]
  );

  return (
    <View style={{ width: w }}>
      {!hasItems && <HeroBannerSkeleton width={w} />}

      {hasItems && (
        <Animated.View style={{ opacity: bannerOpacity }}>
          <Animated.ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={onScrollEnd}
            style={{ width: w, flexGrow: 0, flexShrink: 0 }}
            contentContainerStyle={{ flexDirection: "row" }}
            snapToInterval={w}
            snapToAlignment="start"
            disableIntervalMomentum
            decelerationRate="fast"
            bounces={false}
            overScrollMode="never"
          >
            {items.map((item, i) => (
              <HeroItem
                key={item.id}
                item={item}
                index={i}
                screenWidth={w}
                isActive={i === activeIndex}
                onWatch={onItemPress  ? () => onItemPress(item)  : undefined}
                onDetails={
                  onDetailsPress
                    ? () => onDetailsPress(item)
                    : onItemPress
                    ? () => onItemPress(item)
                    : undefined
                }
                onAddToList={onAddToList ? () => onAddToList(item) : undefined}
              />
            ))}
          </Animated.ScrollView>

          {/* Dot indicators */}
          {items.length > 1 && (
            <View style={heroStyles.dotsRow}>
              {items.map((_, i) => (
                <Pressable key={i} onPress={() => handleThumbPress(i)} hitSlop={8}>
                  <View style={[heroStyles.dot, i === activeIndex && heroStyles.dotActive]} />
                </Pressable>
              ))}
            </View>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const heroStyles = StyleSheet.create({
  nBadge: {
    position: "absolute",
    top: 14,
    left: 14,
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: "#e50914",
    alignItems: "center",
    justifyContent: "center",
  },
  nBadgeText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: -0.5,
  },

  /* Bottom content overlay — absolute positioned inside the card */
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },

  logoImg: {
    width: "75%",
    height: 62,
    alignSelf: "center",
    marginBottom: 2,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 28,
    color: "#fff",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.95)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
    marginBottom: 2,
  },

  genreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 2,
  },
  genreText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.65)",
    fontWeight: "500",
  },
  genreDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.35)",
  },

  /* Primary action — full-width white button */
  watchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  watchBtnText: {
    color: "#111",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.1,
  },

  /* Secondary row: Minha lista + Detalhes side by side */
  secondaryRow: {
    flexDirection: "row",
    gap: 8,
  },
  ghostBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  ghostBtnSmall: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  ghostBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255,255,255,0.9)",
  },

  /* Dot indicators below banner */
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
    marginBottom: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  dotActive: {
    backgroundColor: "#e50914",
    width: 18,
    borderRadius: 3,
  },
});
