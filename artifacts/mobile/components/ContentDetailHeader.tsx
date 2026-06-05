import React, { useState } from "react";
import {
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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const { width: W } = Dimensions.get("window");
const BACKDROP_H = Math.round(W * 0.58);

interface ContentDetailHeaderProps {
  backdropPath?: string | null;
  posterPath?: string | null;
  title: string;
  year?: number | string;
  rating?: number;
  type: "movie" | "tv";
  runtime?: string | null;
  totalSeasons?: number | null;
  onPlay?: () => void;
  onShare?: () => void;
  logoUrl?: string | null;
}

export function ContentDetailHeader({
  backdropPath,
  posterPath,
  title,
  year,
  rating,
  type,
  runtime,
  totalSeasons,
  onPlay,
  onShare,
  logoUrl,
}: ContentDetailHeaderProps) {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [imgError, setImgError] = useState(false);
  const [posterError, setPosterError] = useState(false);

  const tmdbImg = (path: string | null | undefined, size = "w1280") =>
    path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

  const backdropUrl = !imgError && backdropPath ? tmdbImg(backdropPath, "w1280") : null;
  const posterUrl = !posterError && posterPath ? tmdbImg(posterPath, "w500") : null;

  return (
    <View style={{ height: BACKDROP_H + 80 }}>
      <View style={{ width: W, height: BACKDROP_H, overflow: "hidden" }}>
        {backdropUrl ? (
          <Image
            source={{ uri: backdropUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            onError={() => setImgError(true)}
          />
        ) : (
          <LinearGradient colors={["#1a0a14", "#050508"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.2)", colors.background]}
          locations={[0, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Top nav bar */}
      <View
        style={[
          styles.topNav,
          { paddingTop: insets.top + 8 },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={[styles.navBtn, { backgroundColor: "rgba(0,0,0,0.55)" }]}
        >
          <Feather name="arrow-left" size={18} color="#fff" />
        </Pressable>
        <View style={styles.navRight}>
          {onShare && (
            <Pressable
              onPress={onShare}
              style={[styles.navBtn, { backgroundColor: "rgba(0,0,0,0.55)" }]}
            >
              <Feather name="share-2" size={18} color="#fff" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Poster + metadata row */}
      <View style={[styles.metaRow, { marginTop: -(BACKDROP_H - 180) }]}>
        {posterUrl && (
          <Image
            source={{ uri: posterUrl }}
            style={[styles.poster, { borderColor: colors.border }]}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setPosterError(true)}
          />
        )}
        <View style={styles.metaInfo}>
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              style={styles.logo}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : (
            <Text style={[styles.titleText, { color: colors.foreground }]} numberOfLines={3}>
              {title}
            </Text>
          )}
          <View style={styles.badges}>
            <View style={[styles.typeBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.typeBadgeText}>
                {type === "movie" ? "FILME" : "SÉRIE"}
              </Text>
            </View>
            {year && (
              <Text style={[styles.yearText, { color: colors.mutedForeground }]}>{year}</Text>
            )}
            {rating && rating > 0 && (
              <View style={styles.ratingRow}>
                <Feather name="star" size={10} color="#fbbf24" />
                <Text style={[styles.ratingText, { color: "#fbbf24" }]}>
                  {rating.toFixed(1)}
                </Text>
              </View>
            )}
            {runtime && (
              <Text style={[styles.runtimeText, { color: colors.mutedForeground }]}>
                {runtime}
              </Text>
            )}
            {totalSeasons && (
              <Text style={[styles.runtimeText, { color: colors.mutedForeground }]}>
                {totalSeasons} temp.
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topNav: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex: 10,
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  navRight: {
    flexDirection: "row",
    gap: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    gap: 14,
  },
  poster: {
    width: 100,
    height: 148,
    borderRadius: 12,
    borderWidth: 1,
  },
  logo: {
    width: 160,
    height: 56,
    marginBottom: 4,
  },
  metaInfo: {
    flex: 1,
    gap: 8,
    paddingBottom: 4,
  },
  titleText: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 24,
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  typeBadge: {
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  typeBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  yearText: {
    fontSize: 12,
    fontWeight: "500",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: "700",
  },
  runtimeText: {
    fontSize: 12,
    fontWeight: "500",
  },
});
