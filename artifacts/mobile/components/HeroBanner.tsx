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
const HERO_HEIGHT = 540;
const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
const AUTO_ADVANCE_MS = 6000;

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

const GENRE_COLORS: Record<number, string> = {
  28: "#e50914", 12: "#f59e0b", 16: "#8b5cf6", 35: "#f97316",
  80: "#64748b", 18: "#3b82f6", 27: "#6b21a8", 878: "#22d3ee",
  10749: "#ec4899", 99: "#22c55e", 53: "#ef4444",
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

function GenreTag({ genreId }: { genreId: number }) {
  const name = GENRE_NAMES[genreId];
  if (!name) return null;
  const color = GENRE_COLORS[genreId] ?? "rgba(255,255,255,0.2)";
  return (
    <View style={[heroStyles.genreTag, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
      <View style={[heroStyles.genreDot, { backgroundColor: color }]} />
      <Text style={[heroStyles.genreTagText, { color: "rgba(255,255,255,0.85)" }]}>{name}</Text>
    </View>
  );
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
    <View style={[heroStyles.typeBadge, { backgroundColor: "rgba(229,9,20,0.18)", borderColor: "rgba(229,9,20,0.4)" }]}>
      <Feather name={icon} size={8} color="#e50914" />
      <Text style={[heroStyles.typeBadgeText, { color: "#e50914" }]}>{label}</Text>
    </View>
  );
}

function StarRating({ rating }: { rating: number }) {
  const stars = Math.round(rating / 2);
  return (
    <View style={heroStyles.starRow}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Feather
          key={i}
          name="star"
          size={10}
          color={i < stars ? "#f59e0b" : "rgba(255,255,255,0.2)"}
        />
      ))}
      <Text style={heroStyles.ratingNum}>{rating.toFixed(1)}</Text>
    </View>
  );
}

function HeroItem({ item, colors, onWatch, onDetails, onAddToList, isActive, index, screenWidth }: HeroItemProps) {
  const [imgError, setImgError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [liked, setLiked] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(1.04)).current;
  const heartScale = useRef(new Animated.Value(1)).current;

  const type = item.mediaType === "movie" || item.type === "movie" ? "movie" : "tv";
  const tmdbId = item.tmdbId ? Number(item.tmdbId) : undefined;
  const logoUrl = useTmdbLogo(tmdbId, type);

  useEffect(() => {
    if (isActive) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, speed: 14, bounciness: 4, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 6000, useNativeDriver: true }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(30);
      scaleAnim.setValue(1.04);
    }
  }, [isActive]);

  const handleLike = useCallback(() => {
    setLiked((v) => !v);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.45, speed: 30, bounciness: 14, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1, speed: 28, bounciness: 6, useNativeDriver: true }),
    ]).start();
  }, [heartScale]);

  const displayGenres = useMemo(
    () => Array.isArray(item.genres)
      ? (item.genres.filter((g: unknown) => typeof g === "number").slice(0, 2) as number[])
      : [],
    [item.genres]
  );

  const runtime = useMemo(
    () => formatRuntime(item.duration ? parseInt(String(item.duration)) : undefined),
    [item.duration]
  );
  const HERO_YEAR = new Date().getFullYear();
  const isNew = item.year >= HERO_YEAR - 1;

  return (
    <Pressable style={{ width: screenWidth, height: HERO_HEIGHT }} onPress={onDetails ?? onWatch}>
      {!imgError && item.backdropPath ? (
        <Animated.View style={[heroStyles.heroImageWrap, { transform: [{ scale: scaleAnim }] }]}>
          <Image
            source={{ uri: item.backdropPath }}
            style={heroStyles.heroImage}
            contentFit="cover"
            transition={Platform.OS === "web" ? 400 : 0}
            cachePolicy="memory-disk"
            onError={() => setImgError(true)}
          />
        </Animated.View>
      ) : (
        <LinearGradient colors={["#1a0a14", "#08060e"]} style={heroStyles.heroImage} />
      )}

      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.08)", "rgba(0,0,0,0.45)", "rgba(5,5,8,0.82)", "rgba(5,5,8,0.98)"]}
        locations={[0, 0.2, 0.45, 0.72, 1]}
        style={heroStyles.gradient}
      />

      <LinearGradient
        colors={["rgba(5,5,8,0.55)", "rgba(5,5,8,0.1)", "transparent"]}
        style={heroStyles.topFade}
      />

      <LinearGradient
        colors={["transparent", "transparent", "rgba(229,9,20,0.04)", "transparent"]}
        style={heroStyles.sideFade}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      />

      <Animated.View style={[heroStyles.heroContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={heroStyles.badgeRow}>
          <ContentTypeBadge type={type} channel={item.channel} />
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

        {logoUrl && !logoError ? (
          <Image
            source={{ uri: logoUrl }}
            style={heroStyles.logoImg}
            contentFit="contain"
            onError={() => setLogoError(true)}
          />
        ) : (
          <Text style={[heroStyles.heroTitle, { color: "#fff" }]} numberOfLines={2}>
            {item.title}
          </Text>
        )}

        <View style={heroStyles.metaRow}>
          {item.rating > 0 && <StarRating rating={item.rating} />}
          <View style={heroStyles.metaDivider} />
          <Text style={heroStyles.metaYear}>{item.year}</Text>
          {runtime && (
            <>
              <View style={heroStyles.metaDot} />
              <Text style={heroStyles.metaRuntime}>{runtime}</Text>
            </>
          )}
        </View>

        {displayGenres.length > 0 && (
          <View style={heroStyles.genreRow}>
            {displayGenres.map((g) => <GenreTag key={g} genreId={g} />)}
          </View>
        )}

        {item.description ? (
          <Text style={heroStyles.heroDesc} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}

        <View style={heroStyles.actions}>
          <Pressable
            onPress={onWatch}
            style={({ pressed }) => [heroStyles.watchBtn, { opacity: pressed ? 0.84 : 1, backgroundColor: colors.primary }]}
          >
            <View style={heroStyles.watchBtnIcon}>
              <Feather name="play" size={16} color="#fff" />
            </View>
            <Text style={heroStyles.watchBtnText}>Assistir</Text>
          </Pressable>

          <Pressable
            onPress={onDetails ?? onWatch}
            style={({ pressed }) => [heroStyles.detailsBtn, { opacity: pressed ? 0.72 : 1 }]}
          >
            <Feather name="info" size={14} color="rgba(255,255,255,0.82)" />
            <Text style={heroStyles.detailsBtnText}>Detalhes</Text>
          </Pressable>

          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <TouchableOpacity
              onPress={handleLike}
              style={[heroStyles.iconActionBtn, liked && { backgroundColor: "rgba(229,9,20,0.28)", borderColor: "rgba(229,9,20,0.5)" }]}
              activeOpacity={0.75}
            >
              <Feather
                name={liked ? "heart" : "heart"}
                size={17}
                color={liked ? "#e50914" : "rgba(255,255,255,0.7)"}
              />
            </TouchableOpacity>
          </Animated.View>

          {onAddToList && (
            <TouchableOpacity
              onPress={onAddToList}
              style={heroStyles.iconActionBtn}
              activeOpacity={0.75}
            >
              <Feather name="plus" size={19} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const TimerDot = React.memo(function TimerDot({ active, duration }: { active: boolean; duration: number }) {
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    if (active) {
      progress.setValue(1);
      Animated.timing(progress, {
        toValue: 0,
        duration,
        useNativeDriver: true,
      }).start();
    } else {
      progress.setValue(0);
    }
  }, [active]);

  // Use scaleX instead of width so useNativeDriver: true works
  const scaleX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 28 / 6],
  });

  if (!active) {
    return <View style={heroStyles.dotInactive} />;
  }

  return (
    <Animated.View
      style={[heroStyles.dotActive, { transform: [{ scaleX }] }]}
    />
  );
});

function HeroBannerSkeleton({ width: w }: { width: number }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== "web") return; // skip skeleton pulse on native
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 850, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.65] });

  const Bone = ({ style }: { style: any }) => (
    <Animated.View style={[{ backgroundColor: "#2a2040", borderRadius: 6 }, style, { opacity }]} />
  );

  return (
    <View style={{ height: HERO_HEIGHT, width: w, backgroundColor: "#070510", overflow: "hidden" }}>
      {/* Image placeholder */}
      <Animated.View
        style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "#130e22", opacity,
        }}
      />
      {/* Bottom gradient overlay skeleton */}
      <LinearGradient
        colors={["transparent", "rgba(7,5,16,0.85)", "#070510"]}
        locations={[0.35, 0.72, 1]}
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: HERO_HEIGHT * 0.65 }}
      />
      {/* Content skeletons */}
      <View style={{ position: "absolute", bottom: 88, left: 20, right: 20, gap: 10 }}>
        {/* Badge */}
        <Bone style={{ width: 64, height: 18, borderRadius: 4 }} />
        {/* Title */}
        <Bone style={{ width: w * 0.72, height: 38, borderRadius: 8 }} />
        <Bone style={{ width: w * 0.5, height: 34, borderRadius: 8, marginTop: -4 }} />
        {/* Description */}
        <Bone style={{ width: w * 0.9, height: 12, borderRadius: 4, marginTop: 4 }} />
        <Bone style={{ width: w * 0.75, height: 12, borderRadius: 4 }} />
        {/* Buttons */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
          <Bone style={{ width: 130, height: 44, borderRadius: 10 }} />
          <Bone style={{ width: 110, height: 44, borderRadius: 10 }} />
          <Bone style={{ width: 44, height: 44, borderRadius: 10 }} />
        </View>
      </View>
      {/* Dots skeleton */}
      <View style={{ position: "absolute", bottom: 60, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 5 }}>
        {[28, 6, 6, 6, 6].map((boneW, i) => (
          <Bone key={i} style={{ width: boneW, height: 5, borderRadius: 3 }} />
        ))}
      </View>
    </View>
  );
}

export function HeroBanner({ items, onItemPress, onDetailsPress, onAddToList }: HeroBannerProps) {
  const colors = useColors();
  const { width: w } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const hasItems = items.length > 0;

  // Fade in the real banner when items arrive
  useEffect(() => {
    if (hasItems) {
      Animated.timing(bannerOpacity, {
        toValue: 1,
        duration: 520,
        useNativeDriver: true,
      }).start();
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
      timerRef.current = setInterval(() => goTo(fromIdx + 1), AUTO_ADVANCE_MS);
    },
    [goTo, items.length]
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

  return (
    <View style={{ height: HERO_HEIGHT, width: w, overflow: "hidden" }}>
      {/* Skeleton always rendered as base layer */}
      <HeroBannerSkeleton width={w} />

      {/* Real banner fades in on top when items arrive */}
      {hasItems && (
        <Animated.View
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            opacity: bannerOpacity,
          }}
        >
          <Animated.ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={onScrollEnd}
            style={{ width: w, overflow: "hidden" }}
            contentContainerStyle={{ width: w * items.length }}
            snapToInterval={w}
            snapToAlignment="start"
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

          {items.length > 1 && (
            <View style={heroStyles.dotsContainer}>
              {items.map((_, i) => (
                <Pressable key={i} onPress={() => goTo(i)} hitSlop={8}>
                  <TimerDot active={i === activeIndex} duration={AUTO_ADVANCE_MS} />
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
  heroImageWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroImage: {
    width: "100%",
    height: HERO_HEIGHT,
    position: "absolute",
    top: 0,
    left: 0,
  },
  gradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: HERO_HEIGHT,
  },
  topFade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  sideFade: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  heroContent: {
    position: "absolute",
    bottom: 52,
    left: 22,
    right: 22,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 14,
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
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.15)",
  },
  typeLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#22c55e",
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: "rgba(255,255,255,0.8)",
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
    backgroundColor: "rgba(245,158,11,0.18)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.4)",
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
    width: "60%",
    height: 80,
    marginBottom: 14,
    alignSelf: "flex-start",
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
    lineHeight: 38,
    marginBottom: 14,
    textShadowColor: "rgba(0,0,0,0.95)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 14,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  starRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingNum: {
    color: "#f59e0b",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 4,
  },
  metaDivider: {
    width: 1,
    height: 11,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  metaYear: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "500",
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  metaRuntime: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "400",
  },
  genreRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 11,
    flexWrap: "wrap",
  },
  genreTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  genreDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  genreTagText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  heroDesc: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 20,
    fontWeight: "400",
    color: "rgba(255,255,255,0.62)",
    letterSpacing: 0.1,
  },
  actions: {
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
  },
  watchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#e50914",
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.6,
        shadowRadius: 18,
      },
      android: { elevation: 10 },
    }),
  },
  watchBtnIcon: { marginLeft: -2 },
  watchBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  detailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  detailsBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(255,255,255,0.82)",
  },
  iconActionBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  dotsContainer: {
    position: "absolute",
    bottom: 22,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  dotActive: {
    width: 6,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#e50914",
    opacity: 1,
  },
  dotInactive: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    opacity: 0.6,
  },
  arrowLeft: {
    position: "absolute",
    left: 12,
    top: "50%",
    marginTop: -20,
  },
  arrowRight: {
    position: "absolute",
    right: 12,
    top: "50%",
    marginTop: -20,
  },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
});
