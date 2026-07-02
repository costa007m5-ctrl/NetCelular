import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
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
import { useColors } from "@/hooks/useColors";
import type { ContentItem } from "@/constants/content";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HERO_HEIGHT = 480;
const CARD_MARGIN = 16;
const CARD_POSTER_RATIO = 1.28; // height / width of the poster area inside the card
const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
const AUTO_ADVANCE_MS = 7000;

const logoCache = new Map<string, string | null>();

function useTmdbLogo(id?: number, type?: "movie" | "tv") {
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !type) return;
    const key = `${type}_${id}`;
    if (logoCache.has(key)) { setLogo(logoCache.get(key) ?? null); return; }
    fetch(`https://api.themoviedb.org/3/${type}/${id}/images?api_key=${TMDB_KEY}&include_image_language=pt,en,null`)
      .then((r) => r.json())
      .then((data) => {
        const logos: any[] = data.logos ?? [];
        const pt = logos.find((l) => l.iso_639_1 === "pt");
        const en = logos.find((l) => l.iso_639_1 === "en");
        const best = pt ?? en ?? logos[0] ?? null;
        const path = best?.file_path ? `https://image.tmdb.org/t/p/w300${best.file_path}` : null;
        logoCache.set(key, path);
        setLogo(path);
      })
      .catch(() => { logoCache.set(`${type}_${id}`, null); });
  }, [id, type]);
  return logo;
}

function formatRuntime(minutes?: number): string | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

const GENRE_NAMES: Record<number, string> = {
  28: "Ação", 12: "Aventura", 16: "Animação", 35: "Comédia", 80: "Crime",
  99: "Documentário", 18: "Drama", 10751: "Família", 14: "Fantasia",
  27: "Terror", 9648: "Mistério", 10749: "Romance", 878: "Ficção Científica",
  53: "Suspense", 10752: "Guerra", 37: "Faroeste", 10759: "Ação & Aventura",
  10765: "Sci-Fi & Fantasia", 10766: "Novela",
};

interface HeroBannerProps {
  items: ContentItem[];
  onItemPress?: (item: ContentItem) => void;
  onDetailsPress?: (item: ContentItem) => void;
  onAddToList?: (item: ContentItem) => void;
}

interface HeroItemProps {
  item: ContentItem;
  colors: ReturnType<typeof useColors>;
  onWatch?: () => void;
  onDetails?: () => void;
  onAddToList?: () => void;
  isActive: boolean;
  index: number;
  screenWidth: number;
}

function ContentTypeBadge({ type, channel }: { type: string; channel?: string }) {
  if (channel && channel !== "NETPLAY") {
    return (
      <View style={heroStyles.typeBadge}>
        <View style={heroStyles.typeLiveDot} />
        <Text style={heroStyles.typeBadgeText}>{channel}</Text>
      </View>
    );
  }
  const label = type === "movie" ? "FILME" : "SÉRIE";
  const icon: any = type === "movie" ? "film" : "tv";
  return (
    <View style={[heroStyles.typeBadge, { backgroundColor: "rgba(229,9,20,0.22)", borderColor: "rgba(229,9,20,0.55)" }]}>
      <Feather name={icon} size={9} color="#e50914" />
      <Text style={[heroStyles.typeBadgeText, { color: "#ff3a46" }]}>{label}</Text>
    </View>
  );
}

function IMDbBadge({ rating }: { rating: number }) {
  return (
    <View style={heroStyles.imdbBadge}>
      <Text style={heroStyles.imdbText}>IMDb</Text>
      <Text style={heroStyles.imdbRating}>{rating.toFixed(1)}</Text>
    </View>
  );
}

function HeroItem({ item, colors, onWatch, onDetails, onAddToList, isActive, screenWidth }: HeroItemProps) {
  const [imgError, setImgError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [liked, setLiked] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(28)).current;
  const scaleAnim = useRef(new Animated.Value(1.06)).current;
  const heartScale = useRef(new Animated.Value(1)).current;
  const contentFade = useRef(new Animated.Value(0)).current;

  const type = item.mediaType === "movie" || item.type === "movie" ? "movie" : "tv";
  const tmdbId = item.tmdbId ? Number(item.tmdbId) : undefined;
  const logoUrl = useTmdbLogo(tmdbId, type);

  useEffect(() => {
    if (isActive) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, speed: 12, bounciness: 3, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 7000, useNativeDriver: true }),
        Animated.timing(contentFade, { toValue: 1, duration: 700, delay: 150, useNativeDriver: true }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(28);
      scaleAnim.setValue(1.06);
      contentFade.setValue(0);
    }
  }, [isActive]);

  const handleLike = useCallback(() => {
    setLiked((v) => !v);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.5, speed: 28, bounciness: 16, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1, speed: 26, bounciness: 5, useNativeDriver: true }),
    ]).start();
  }, [heartScale]);

  const displayGenres = useMemo(
    () => Array.isArray(item.genres)
      ? (item.genres.filter((g: unknown) => typeof g === "number").slice(0, 3) as number[])
      : [],
    [item.genres]
  );

  const runtime = useMemo(
    () => formatRuntime(item.duration ? parseInt(String(item.duration)) : undefined),
    [item.duration]
  );

  const cardWidth = screenWidth - CARD_MARGIN * 2;
  const posterHeight = cardWidth * CARD_POSTER_RATIO;

  const HERO_YEAR = new Date().getFullYear();
  const isNew = item.year >= HERO_YEAR - 1;

  return (
    <View style={{ width: screenWidth, alignItems: "center", flexShrink: 0 }}>
      <Animated.View
        style={[
          heroStyles.card,
          { width: cardWidth, opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <Pressable onPress={onDetails ?? onWatch} style={{ width: "100%", height: posterHeight }}>
          {/* Poster art */}
          {!imgError && (item.posterPath || item.backdropPath) ? (
            <Animated.View style={{ ...StyleSheet.absoluteFillObject, transform: [{ scale: scaleAnim }] }}>
              <Image
                source={{ uri: item.posterPath || item.backdropPath }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={Platform.OS === "web" ? 400 : 0}
                cachePolicy="memory-disk"
                onError={() => setImgError(true)}
              />
            </Animated.View>
          ) : (
            <LinearGradient colors={["#1a0a14", "#08060e"]} style={StyleSheet.absoluteFill} />
          )}

          {/* Bottom gradient inside poster for logo legibility */}
          <LinearGradient
            colors={["transparent", "rgba(6,10,10,0.55)", "rgba(6,10,10,0.92)"]}
            locations={[0.55, 0.8, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* Netflix "N" badge */}
          <View style={heroStyles.nBadge}>
            <Text style={heroStyles.nBadgeText}>N</Text>
          </View>

          {/* Top badges */}
          <View style={heroStyles.badgeRow}>
            {isNew && (
              <View style={heroStyles.newBadge}>
                <Feather name="zap" size={8} color="#fff" />
                <Text style={heroStyles.newBadgeText}>NOVO</Text>
              </View>
            )}
            {item.channel === "NETPLAY" && (
              <View style={heroStyles.exclusiveBadge}>
                <Text style={heroStyles.exclusiveBadgeText}>✦ DESTAQUE</Text>
              </View>
            )}
          </View>

          {/* Logo or title, anchored near bottom of poster */}
          <Animated.View style={[heroStyles.logoWrap, { opacity: contentFade }]}>
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
          </Animated.View>
        </Pressable>

        {/* Card footer (below poster) */}
        <Animated.View style={[heroStyles.cardFooter, { opacity: contentFade }]}>
          {/* Genre tags row */}
          {displayGenres.length > 0 && (
            <View style={heroStyles.genreRow}>
              {displayGenres.map((g, idx) => {
                const name = GENRE_NAMES[g];
                if (!name) return null;
                return (
                  <React.Fragment key={g}>
                    {idx > 0 && <View style={heroStyles.genreSep} />}
                    <Text style={heroStyles.genreText}>{name}</Text>
                  </React.Fragment>
                );
              })}
            </View>
          )}

          {/* Meta info row */}
          <View style={heroStyles.metaRow}>
            {item.rating > 0 && <IMDbBadge rating={item.rating} />}
            <Text style={heroStyles.metaYear}>{item.year}</Text>
            {runtime && <Text style={heroStyles.metaRuntime}>• {runtime}</Text>}
          </View>

          {/* Assistir button */}
          <Pressable
            onPress={onWatch}
            style={({ pressed }) => [heroStyles.watchBtn, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Feather name="play" size={17} color="#111" style={{ marginRight: 2 }} />
            <Text style={heroStyles.watchBtnText}>Assistir</Text>
          </Pressable>

          {/* Minha lista button */}
          <TouchableOpacity
            onPress={onAddToList}
            style={heroStyles.listBtn}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={17} color="rgba(255,255,255,0.9)" style={{ marginRight: 2 }} />
            <Text style={heroStyles.listBtnText}>Minha lista</Text>
          </TouchableOpacity>

          {/* Secondary row: details + like */}
          <View style={heroStyles.secondaryRow}>
            <Pressable
              onPress={onDetails ?? onWatch}
              style={({ pressed }) => [heroStyles.glassBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Feather name="info" size={14} color="rgba(255,255,255,0.9)" />
              <Text style={heroStyles.glassBtnText}>Detalhes</Text>
            </Pressable>

            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <TouchableOpacity
                onPress={handleLike}
                style={[
                  heroStyles.iconBtn,
                  liked && { backgroundColor: "rgba(229,9,20,0.32)", borderColor: "rgba(229,9,20,0.6)" },
                ]}
                activeOpacity={0.75}
              >
                <Feather name="heart" size={16} color={liked ? "#e50914" : "rgba(255,255,255,0.75)"} />
              </TouchableOpacity>
            </Animated.View>

            <TouchableOpacity style={heroStyles.iconBtn} activeOpacity={0.75}>
              <Feather name="download" size={16} color="rgba(255,255,255,0.75)" />
            </TouchableOpacity>
          </View>
        </Animated.View>
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
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.55] });
  const Bone = ({ style }: { style: any }) => (
    <Animated.View style={[{ backgroundColor: "#1e1530", borderRadius: 6 }, style, { opacity }]} />
  );

  const cardWidth = w - CARD_MARGIN * 2;
  const posterHeight = cardWidth * CARD_POSTER_RATIO;
  const skeletonHeight = posterHeight + 260;

  return (
    <View style={{ height: skeletonHeight, width: w, backgroundColor: "#050308", alignItems: "center", paddingTop: 4 }}>
      <View style={{ width: cardWidth, borderRadius: 20, overflow: "hidden", backgroundColor: "#0f0a1c" }}>
        <Animated.View style={{ width: "100%", height: posterHeight, backgroundColor: "#1a1224", opacity }} />
        <View style={{ padding: 16, gap: 11 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[52, 72, 84].map((bw, i) => <Bone key={i} style={{ width: bw, height: 12, borderRadius: 4 }} />)}
          </View>
          <Bone style={{ width: "100%", height: 48, borderRadius: 24 }} />
          <Bone style={{ width: "100%", height: 44, borderRadius: 24 }} />
        </View>
      </View>
    </View>
  );
}

/* ─── Main HeroBanner component ─── */
export function HeroBanner({ items, onItemPress, onDetailsPress, onAddToList }: HeroBannerProps) {
  const colors = useColors();
  const { width: w } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const hasItems = items.length > 0;

  useEffect(() => {
    if (hasItems) {
      Animated.timing(bannerOpacity, { toValue: 1, duration: 550, useNativeDriver: true }).start();
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
    (fromIdx: number) => {
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
          {/* Scroll carousel */}
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
                colors={colors}
                screenWidth={w}
                isActive={i === activeIndex}
                onWatch={onItemPress ? () => onItemPress(item) : undefined}
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
  card: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#0c0f0e",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
      },
      android: { elevation: 8 },
    }),
  },
  cardFooter: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 10,
  },
  nBadge: {
    position: "absolute",
    top: 14,
    left: 14,
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: "#e50914",
    alignItems: "center",
    justifyContent: "center",
  },
  nBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  logoWrap: {
    position: "absolute",
    bottom: 14,
    left: 16,
    right: 16,
    alignItems: "center",
  },
  badgeRow: {
    position: "absolute",
    top: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  typeLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22c55e",
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.85)",
  },
  newBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#e50914",
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  newBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  exclusiveBadge: {
    backgroundColor: "rgba(245,158,11,0.15)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.38)",
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  exclusiveBadgeText: {
    color: "#f59e0b",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  logoImg: {
    width: "82%",
    height: 74,
    alignSelf: "center",
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 30,
    color: "#fff",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.98)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 16,
  },
  genreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  genreText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "500",
  },
  genreSep: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  imdbBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#f5c518",
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  imdbText: {
    color: "#000",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  imdbRating: {
    color: "#000",
    fontSize: 11,
    fontWeight: "800",
  },
  metaYear: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    fontWeight: "500",
  },
  metaRuntime: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontWeight: "400",
  },
  watchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    paddingVertical: 13,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  watchBtnText: {
    color: "#111",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  listBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  listBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "rgba(255,255,255,0.92)",
  },
  secondaryRow: {
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  glassBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  glassBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255,255,255,0.88)",
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  /* Dot indicators */
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    marginBottom: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  dotActive: {
    backgroundColor: "#e50914",
    width: 16,
  },
});
