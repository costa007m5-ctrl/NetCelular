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
const HERO_HEIGHT = 560;
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

  const HERO_YEAR = new Date().getFullYear();
  const isNew = item.year >= HERO_YEAR - 1;

  return (
    <Pressable
      style={{ width: screenWidth, height: HERO_HEIGHT, flexShrink: 0, overflow: "hidden" }}
      onPress={onDetails ?? onWatch}
    >
      {/* Background image */}
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

      {/* Cinematic left-to-right dark gradient */}
      <LinearGradient
        colors={["rgba(5,5,8,0.85)", "rgba(5,5,8,0.3)", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Bottom gradient */}
      <LinearGradient
        colors={["transparent", "rgba(3,3,6,0.55)", "rgba(3,3,6,0.85)", "rgba(3,3,6,0.98)"]}
        locations={[0.3, 0.58, 0.78, 1]}
        style={heroStyles.gradient}
      />

      {/* Top gradient */}
      <LinearGradient
        colors={["rgba(3,3,6,0.6)", "transparent"]}
        style={heroStyles.topFade}
      />

      {/* Red accent glow from bottom-left */}
      <LinearGradient
        colors={["rgba(229,9,20,0.06)", "transparent"]}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.5, y: 0.4 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Content */}
      <Animated.View style={[heroStyles.heroContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

        {/* Top badges */}
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

        {/* Logo or title */}
        <Animated.View style={{ opacity: contentFade }}>
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

        {/* Genre pills */}
        {displayGenres.length > 0 && (
          <Animated.View style={[heroStyles.genreRow, { opacity: contentFade }]}>
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
          </Animated.View>
        )}

        {/* Meta info row */}
        <Animated.View style={[heroStyles.metaRow, { opacity: contentFade }]}>
          {item.rating > 0 && <IMDbBadge rating={item.rating} />}
          <Text style={heroStyles.metaYear}>{item.year}</Text>
          {runtime && <Text style={heroStyles.metaRuntime}>• {runtime}</Text>}
        </Animated.View>

        {/* Description */}
        {item.description ? (
          <Animated.Text style={[heroStyles.heroDesc, { opacity: contentFade }]} numberOfLines={2}>
            {item.description}
          </Animated.Text>
        ) : null}

        {/* Action buttons */}
        <Animated.View style={[heroStyles.actions, { opacity: contentFade }]}>
          {/* Play button */}
          <Pressable
            onPress={onWatch}
            style={({ pressed }) => [heroStyles.watchBtn, { opacity: pressed ? 0.82 : 1 }]}
          >
            <LinearGradient
              colors={["#ff1a26", "#c8000c"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={heroStyles.watchBtnGradient}
            >
              <Feather name="play" size={16} color="#fff" style={{ marginLeft: 2 }} />
              <Text style={heroStyles.watchBtnText}>Assistir</Text>
            </LinearGradient>
          </Pressable>

          {/* Details button */}
          <Pressable
            onPress={onDetails ?? onWatch}
            style={({ pressed }) => [heroStyles.glassBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="info" size={15} color="rgba(255,255,255,0.9)" />
            <Text style={heroStyles.glassBtnText}>Detalhes</Text>
          </Pressable>

          {/* Like button */}
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <TouchableOpacity
              onPress={handleLike}
              style={[
                heroStyles.iconBtn,
                liked && { backgroundColor: "rgba(229,9,20,0.32)", borderColor: "rgba(229,9,20,0.6)" },
              ]}
              activeOpacity={0.75}
            >
              <Feather name="heart" size={17} color={liked ? "#e50914" : "rgba(255,255,255,0.75)"} />
            </TouchableOpacity>
          </Animated.View>

          {/* Add to list */}
          {onAddToList && (
            <TouchableOpacity onPress={onAddToList} style={heroStyles.iconBtn} activeOpacity={0.75}>
              <Feather name="plus" size={19} color="rgba(255,255,255,0.75)" />
            </TouchableOpacity>
          )}

          {/* Download */}
          <TouchableOpacity style={heroStyles.iconBtn} activeOpacity={0.75}>
            <Feather name="download" size={17} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/* ─── Animated progress bar for active slide ─── */
const ProgressBar = React.memo(function ProgressBar({
  active,
  duration,
  index,
  total,
  onPress,
}: {
  active: boolean;
  duration: number;
  index: number;
  total: number;
  onPress: () => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (animRef.current) animRef.current.stop();
    if (active) {
      progress.setValue(0);
      animRef.current = Animated.timing(progress, {
        toValue: 1,
        duration,
        useNativeDriver: false,
      });
      animRef.current.start();
    } else {
      progress.setValue(0);
    }
    return () => { animRef.current?.stop(); };
  }, [active]);

  return (
    <Pressable onPress={onPress} style={heroStyles.progressBarWrap} hitSlop={10}>
      <View style={heroStyles.progressTrack}>
        {active ? (
          <Animated.View
            style={[
              heroStyles.progressFill,
              { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
            ]}
          />
        ) : (
          <View style={[heroStyles.progressFill, { width: index < total ? "100%" : "0%" }]} />
        )}
      </View>
    </Pressable>
  );
});

/* ─── Thumbnail strip item ─── */
function ThumbItem({
  item,
  active,
  onPress,
}: {
  item: ContentItem;
  active: boolean;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(active ? 1 : 0.88)).current;
  const borderAnim = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: active ? 1 : 0.88, speed: 14, bounciness: 4, useNativeDriver: true }),
      Animated.timing(borderAnim, { toValue: active ? 1 : 0, duration: 260, useNativeDriver: false }),
    ]).start();
  }, [active]);

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0)", "rgba(229,9,20,0.9)"],
  });

  return (
    <Pressable onPress={onPress}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Animated.View style={[heroStyles.thumbWrap, { borderColor }]}>
          {item.posterPath || item.backdropPath ? (
            <Image
              source={{ uri: item.posterPath ?? item.backdropPath }}
              style={heroStyles.thumbImg}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <LinearGradient colors={["#2a1020", "#0a0810"]} style={heroStyles.thumbImg} />
          )}
          {active && (
            <View style={heroStyles.thumbActiveOverlay}>
              <Feather name="play" size={12} color="#fff" />
            </View>
          )}
          {!active && (
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.45)"]}
              style={StyleSheet.absoluteFill}
            />
          )}
        </Animated.View>
        {active && <View style={heroStyles.thumbActiveDot} />}
      </Animated.View>
    </Pressable>
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

  return (
    <View style={{ height: HERO_HEIGHT, width: w, backgroundColor: "#050308", overflow: "hidden" }}>
      <Animated.View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "#0f0a1c", opacity }} />
      <LinearGradient
        colors={["transparent", "rgba(5,3,8,0.88)", "#050308"]}
        locations={[0.3, 0.7, 1]}
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: HERO_HEIGHT * 0.7 }}
      />
      <View style={{ position: "absolute", bottom: 100, left: 20, right: 20, gap: 11 }}>
        <Bone style={{ width: 72, height: 20, borderRadius: 5 }} />
        <Bone style={{ width: w * 0.75, height: 40, borderRadius: 8 }} />
        <Bone style={{ width: w * 0.55, height: 32, borderRadius: 8, marginTop: -4 }} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
          {[52, 72, 84].map((bw, i) => <Bone key={i} style={{ width: bw, height: 13, borderRadius: 4 }} />)}
        </View>
        <Bone style={{ width: w * 0.88, height: 13, borderRadius: 4, marginTop: 2 }} />
        <Bone style={{ width: w * 0.65, height: 13, borderRadius: 4 }} />
        <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
          <Bone style={{ width: 130, height: 48, borderRadius: 14 }} />
          <Bone style={{ width: 110, height: 48, borderRadius: 14 }} />
          <Bone style={{ width: 48, height: 48, borderRadius: 14 }} />
          <Bone style={{ width: 48, height: 48, borderRadius: 14 }} />
        </View>
      </View>
      {/* Progress bars skeleton */}
      <View style={{ position: "absolute", bottom: 60, left: 20, right: 20, flexDirection: "row", gap: 4 }}>
        {[1, 0, 0, 0, 0].map((full, i) => (
          <Bone key={i} style={{ flex: 1, height: 3, borderRadius: 2, opacity: full ? undefined : 0.4 }} />
        ))}
      </View>
      {/* Thumbnail strip skeleton */}
      <View style={{ position: "absolute", bottom: 10, left: 20, flexDirection: "row", gap: 8 }}>
        {[1, 0.7, 0.7, 0.7, 0.7].map((op, i) => (
          <Bone key={i} style={{ width: 44, height: 62, borderRadius: 8, opacity: op }} />
        ))}
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
    <View style={{ height: HERO_HEIGHT, width: w, overflow: "hidden" }}>
      <HeroBannerSkeleton width={w} />

      {hasItems && (
        <Animated.View
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            overflow: "hidden",
            opacity: bannerOpacity,
          }}
        >
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

          {/* Bottom overlay: progress bars + thumbnails */}
          {items.length > 1 && (
            <View style={heroStyles.bottomOverlay}>
              {/* Progress bars */}
              <View style={heroStyles.progressRow}>
                {items.map((_, i) => (
                  <ProgressBar
                    key={i}
                    active={i === activeIndex}
                    duration={AUTO_ADVANCE_MS}
                    index={i < activeIndex ? items.length : 0}
                    total={activeIndex}
                    onPress={() => handleThumbPress(i)}
                  />
                ))}
              </View>

              {/* Thumbnail strip */}
              <View style={heroStyles.thumbStrip}>
                {items.slice(0, 7).map((item, i) => (
                  <ThumbItem
                    key={item.id}
                    item={item}
                    active={i === activeIndex}
                    onPress={() => handleThumbPress(i)}
                  />
                ))}
                {items.length > 7 && (
                  <View style={heroStyles.moreThumb}>
                    <Text style={heroStyles.moreThumbText}>+{items.length - 7}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Slide counter top-right */}
          {items.length > 1 && (
            <View style={heroStyles.slideCounter}>
              <Text style={heroStyles.slideCounterText}>
                {activeIndex + 1}<Text style={heroStyles.slideCounterTotal}>/{items.length}</Text>
              </Text>
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
    top: 0, left: 0, right: 0, bottom: 0,
  },
  heroImage: {
    width: "100%",
    height: HERO_HEIGHT,
    position: "absolute",
    top: 0, left: 0,
  },
  gradient: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    height: HERO_HEIGHT,
  },
  topFade: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 120,
  },
  heroContent: {
    position: "absolute",
    bottom: 110,
    left: 20,
    right: 20,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 16,
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
    width: "65%",
    height: 84,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1,
    lineHeight: 40,
    marginBottom: 12,
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.98)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 16,
  },
  genreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
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
    gap: 10,
    marginBottom: 11,
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
  heroDesc: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 18,
    fontWeight: "400",
    color: "rgba(255,255,255,0.58)",
    letterSpacing: 0.1,
  },
  actions: {
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
  },
  watchBtn: {
    borderRadius: 14,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#e50914",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.55,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
    }),
  },
  watchBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  watchBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  glassBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  glassBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(255,255,255,0.88)",
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  /* Bottom overlay */
  bottomOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  progressRow: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  progressBarWrap: {
    flex: 1,
    paddingVertical: 6,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#e50914",
    borderRadius: 2,
  },
  thumbStrip: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  thumbWrap: {
    width: 46,
    height: 66,
    borderRadius: 9,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0)",
  },
  thumbImg: {
    width: "100%",
    height: "100%",
  },
  thumbActiveOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(229,9,20,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbActiveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e50914",
    alignSelf: "center",
    marginTop: 4,
  },
  moreThumb: {
    width: 46,
    height: 66,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  moreThumbText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "700",
  },

  /* Slide counter */
  slideCounter: {
    position: "absolute",
    top: 52,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  slideCounterText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  slideCounterTotal: {
    color: "rgba(255,255,255,0.45)",
    fontWeight: "400",
  },
});
