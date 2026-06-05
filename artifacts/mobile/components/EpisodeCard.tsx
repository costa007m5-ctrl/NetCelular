import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { WatchProgressBar } from "./WatchProgressBar";

interface EpisodeCardProps {
  number: number;
  title: string;
  overview?: string;
  stillPath?: string;
  runtime?: number;
  airDate?: string;
  progress?: number;
  watched?: boolean;
  onPress?: () => void;
  active?: boolean;
}

export function EpisodeCard({
  number,
  title,
  overview,
  stillPath,
  runtime,
  airDate,
  progress = 0,
  watched = false,
  onPress,
  active = false,
}: EpisodeCardProps) {
  const colors = useColors();

  const runtimeLabel = runtime
    ? `${Math.floor(runtime / 60)}h${runtime % 60 ? ` ${runtime % 60}min` : ""}`
    : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: active ? `${colors.primary}10` : colors.card,
          borderColor: active ? `${colors.primary}30` : colors.border,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <View style={styles.thumbWrap}>
        {stillPath ? (
          <Image
            source={{ uri: `https://image.tmdb.org/t/p/w300${stillPath}` }}
            style={[styles.thumb, { borderRadius: 10 }]}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.thumbFallback, { backgroundColor: colors.muted, borderRadius: 10 }]}>
            <Feather name="film" size={20} color={colors.mutedForeground} />
          </View>
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.5)"]}
          style={[styles.thumbGradient, { borderRadius: 10 }]}
        />

        {active && (
          <View style={[styles.playOverlay, { backgroundColor: "rgba(229,9,20,0.85)" }]}>
            <Feather name="play" size={14} color="#fff" />
          </View>
        )}

        {watched && !active && (
          <View style={[styles.watchedBadge, { backgroundColor: "rgba(34,197,94,0.85)" }]}>
            <Feather name="check" size={10} color="#fff" />
          </View>
        )}
      </View>

      <View style={styles.info}>
        <View style={styles.headerRow}>
          <Text style={[styles.epNum, { color: colors.mutedForeground }]}>
            Ep. {number}
          </Text>
          {runtimeLabel && (
            <Text style={[styles.runtime, { color: colors.mutedForeground }]}>
              {runtimeLabel}
            </Text>
          )}
        </View>
        <Text
          style={[styles.title, { color: active ? colors.primary : colors.foreground }]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {overview && (
          <Text style={[styles.overview, { color: colors.mutedForeground }]} numberOfLines={2}>
            {overview}
          </Text>
        )}
        {progress > 0 && (
          <WatchProgressBar progress={progress} height={2} />
        )}
      </View>

      <Pressable onPress={onPress} style={styles.moreBtn}>
        <Feather name="more-vertical" size={16} color={colors.mutedForeground} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  thumbWrap: {
    position: "relative",
    width: 120,
    height: 68,
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  thumbFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  watchedBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 3,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  epNum: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  runtime: {
    fontSize: 10,
    fontWeight: "500",
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.2,
    lineHeight: 17,
  },
  overview: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
  },
  moreBtn: {
    padding: 4,
  },
});
