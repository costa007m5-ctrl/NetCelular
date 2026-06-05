import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ContentItem } from "@/constants/content";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HERO_HEIGHT = 510;
const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";

const logoCache = new Map<string, string | null>();

function useTmdbLogo(id?: number, type?: "movie" | "tv") {
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !type) return;
    const key = `${type}_${id}`;
    if (logoCache.has(key)) {
      setLogo(logoCache.get(key) ?? null);
      return;
    }
    fetch(
      `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${TMDB_KEY}&include_image_language=pt,en,null`
    )
      .then((r) => r.json())
      .then((data) => {
        const logos: any[] = data.logos ?? [];
        const pt = logos.find((l) => l.iso_639_1 === "pt");
        const en = logos.find((l) => l.iso_639_1 === "en");
        const best = pt ?? en ?? logos[0] ?? null;
        const path = best?.file_path
          ? `https://image.tmdb.org/t/p/w500${best.file_path}`
          : null;
        logoCache.set(key, path);
        setLogo(path);
      })
      .catch(() => {
        logoCache.set(`${type}_${id}`, null);
      });
  }, [id, type]);
  return logo;
}

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
}

const GENRE_NAMES: Record<number, string> = {
  28: "Ação", 12: "Aventura", 16: "Animação", 35: "Comédia", 80: "Crime",
  99: "Documentário", 18: "Drama", 10751: "Família", 14: "Fantasia",
  27: "Terror", 9648: "Mistério", 10749: "Romance", 878: "Ficção Científica",
  53: "Suspense", 10752: "Guerra", 37: "Faroeste", 10759: "Ação & Aventura",
  10765: "Sci-Fi & Fantasia", 10766: "Novela", 10767: "Talk Show",
};

function GenreChip({ genreId, colors }: { genreId: number; colors: ReturnType<typeof useColors> }) {
  const name = GENRE_NAMES[genreId];
  if (!name) return null;
  return (
    <View style={[heroStyles.genreChip, { borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.08)" }]}>
      <Text style={[heroStyles.genreChipText, { color: "rgba(255,255,255,0.7)" }]}>{name}</Text>
    </View>
  );
}

function HeroItem({ item, colors, onWatch, onDetails, onAddToList, isActive }: HeroItemProps) {
  const [imgError, setImgError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const type = item.mediaType === "movie" || item.type === "movie" ? "movie" : "tv";
  const tmdbId = item.tmdbId ? Number(item.tmdbId) : undefined;
  const logoUrl = useTmdbLogo(tmdbId, type);

  useEffect(() => {
    if (isActive) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [isActive]);

  const handlePress = onDetails ?? onWatch;
  const displayGenres = Array.isArray(item.genres)
    ? item.genres.filter((g) => typeof g === "number").slice(0, 3) as number[]
    : [];

  return (
    <Pressable style={{ width: SCREEN_WIDTH, height: HERO_HEIGHT }} onPress={handlePress}>
      {!imgError && item.backdropPath ? (
        <Image
          source={{ uri: item.backdropPath }}
          style={heroStyles.heroImage}
          contentFit="cover"
          transition={300}
          cachePolicy="memory-disk"
          onError={() => setImgError(true)}
        />
      ) : (
        <LinearGradient colors={["#1a0a14", "#050508"]} style={heroStyles.heroImage} />
      )}

      <LinearGradient
        colors={[
          "rgba(0,0,0,0)",
          "rgba(0,0,0,0.15)",
          "rgba(0,0,0,0.55)",
          "rgba(5,5,8,0.88)",
          "rgba(5,5,8,1)",
        ]}
        locations={[0, 0.25, 0.5, 0.78, 1]}
        style={heroStyles.gradient}
      />

      <LinearGradient
        colors={["rgba(5,5,8,0.35)", "transparent"]}
        style={heroStyles.topFade}
      />

      <Animated.View style={[heroStyles.heroContent, { opacity: fadeAnim }]}>
        {item.channel && (
          <View style={[heroStyles.channelBadge, { borderColor: colors.primary, backgroundColor: `${colors.primary}18` }]}>
            <View style={[heroStyles.channelDot, { backgroundColor: colors.primary }]} />
            <Text style={[heroStyles.channelText, { color: colors.primary }]}>
              {item.channel === "NETPLAY" ? "CATÁLOGO PREMIUM" : item.channel}
            </Text>
          </View>
        )}

        {logoUrl && !logoError ? (
          <Image
            source={{ uri: logoUrl }}
            style={heroStyles.logoImg}
            contentFit="contain"
            onError={() => setLogoError(true)}
          />
        ) : (
          <Text style={[heroStyles.heroTitle, { color: colors.foreground }]} numberOfLines={2}>
            {item.title}
          </Text>
        )}

        <View style={heroStyles.metaRow}>
          {item.rating > 0 && (
            <View style={[heroStyles.ratingBadge, { backgroundColor: colors.ratingGoldBg }]}>
              <Feather name="star" size={10} color={colors.ratingGold} />
              <Text style={[heroStyles.ratingText, { color: colors.ratingGold }]}>
                {item.rating.toFixed(1)}
              </Text>
            </View>
          )}
          <Text style={[heroStyles.metaText, { color: "rgba(255,255,255,0.55)" }]}>{item.year}</Text>
          {item.duration && (
            <Text style={[heroStyles.metaText, { color: "rgba(255,255,255,0.55)" }]}>
              {item.duration}
            </Text>
          )}
          {displayGenres.slice(0, 2).map((g) => (
            <GenreChip key={g} genreId={g} colors={colors} />
          ))}
        </View>

        {item.description ? (
          <Text
            style={[heroStyles.heroDesc, { color: "rgba(255,255,255,0.6)" }]}
            numberOfLines={2}
          >
            {item.description}
          </Text>
        ) : null}

        <View style={heroStyles.actions}>
          <Pressable
            onPress={onWatch}
            style={({ pressed }) => [
              heroStyles.watchBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 },
            ]}
          >
            <View style={heroStyles.watchBtnIcon}>
              <Feather name="play" size={15} color="#fff" />
            </View>
            <Text style={heroStyles.watchBtnText}>Assistir</Text>
          </Pressable>

          <Pressable
            onPress={onDetails ?? onWatch}
            style={({ pressed }) => [
              heroStyles.detailsBtn,
              {
                borderColor: "rgba(255,255,255,0.25)",
                backgroundColor: "rgba(255,255,255,0.08)",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather name="info" size={13} color="rgba(255,255,255,0.75)" />
            <Text style={[heroStyles.detailsBtnText, { color: "rgba(255,255,255,0.75)" }]}>
              Detalhes
            </Text>
          </Pressable>

          {onAddToList && (
            <Pressable
              onPress={onAddToList}
              style={({ pressed }) => [
                heroStyles.addBtn,
                {
                  borderColor: "rgba(255,255,255,0.2)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Feather name="plus" size={18} color="rgba(255,255,255,0.7)" />
            </Pressable>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function HeroBanner({ items, onItemPress, onDetailsPress, onAddToList }: HeroBannerProps) {
  const colors = useColors();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  const goTo = useCallback(
    (idx: number) => {
      const next = ((idx % items.length) + items.length) % items.length;
      scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
      setActiveIndex(next);
    },
    [items.length]
  );

  useEffect(() => {
    if (items.length <= 1) return;
    timerRef.current = setInterval(() => {
      goTo(activeIndex + 1);
    }, 6000);
    return () => clearInterval(timerRef.current);
  }, [activeIndex, goTo, items.length]);

  const onScrollEnd = useCallback(
    (e: any) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      setActiveIndex(idx);
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => goTo(idx + 1), 6000);
    },
    [goTo]
  );

  return (
    <View style={{ height: HERO_HEIGHT }}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onScrollEnd}
        style={{ width: SCREEN_WIDTH }}
        decelerationRate="fast"
      >
        {items.map((item, i) => (
          <HeroItem
            key={item.id}
            item={item}
            colors={colors}
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
            <Pressable key={i} onPress={() => goTo(i)}>
              <Animated.View
                style={[
                  heroStyles.dot,
                  i === activeIndex
                    ? { backgroundColor: colors.primary, width: 24, opacity: 1 }
                    : { backgroundColor: "rgba(255,255,255,0.3)", width: 6, opacity: 0.7 },
                ]}
              />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const heroStyles = StyleSheet.create({
  heroImage: {
    width: SCREEN_WIDTH,
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
    height: 120,
  },
  heroContent: {
    position: "absolute",
    bottom: 50,
    left: 20,
    right: 20,
  },
  channelBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 13,
  },
  channelDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  channelText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  logoImg: {
    width: SCREEN_WIDTH * 0.58,
    height: 76,
    marginBottom: 13,
    alignSelf: "flex-start",
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.7,
    lineHeight: 36,
    marginBottom: 13,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: "700",
  },
  metaText: {
    fontSize: 12,
    fontWeight: "500",
  },
  genreChip: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  genreChipText: {
    fontSize: 10,
    fontWeight: "600",
  },
  heroDesc: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 18,
    fontWeight: "400",
    letterSpacing: 0.1,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  watchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 11,
    ...Platform.select({
      ios: {
        shadowColor: "#e50914",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.55,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  watchBtnIcon: {
    marginLeft: -2,
  },
  watchBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  detailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 11,
    borderWidth: 1,
  },
  detailsBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  addBtn: {
    width: 46,
    height: 46,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dotsContainer: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    height: 5,
    borderRadius: 3,
    transitionDuration: "200ms",
  } as any,
});
