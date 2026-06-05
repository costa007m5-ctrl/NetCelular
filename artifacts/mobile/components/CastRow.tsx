import React, { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";

const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
const IMG = (p: string | null, s = "w185") =>
  p ? `https://image.tmdb.org/t/p/${s}${p}` : null;

interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

interface CastRowProps {
  tmdbId: number;
  type: "movie" | "tv";
}

export function CastRow({ tmdbId, type }: CastRowProps) {
  const colors = useColors();
  const [cast, setCast] = useState<CastMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tmdbId) return;
    const url =
      type === "movie"
        ? `https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${TMDB_KEY}&language=pt-BR`
        : `https://api.themoviedb.org/3/tv/${tmdbId}/credits?api_key=${TMDB_KEY}&language=pt-BR`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const list: CastMember[] = (data.cast ?? [])
          .filter((m: any) => m.profile_path)
          .slice(0, 15);
        setCast(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tmdbId, type]);

  if (!loading && cast.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.bar, { backgroundColor: colors.accentPurple }]} />
        <View style={[styles.iconWrap, { backgroundColor: `${colors.accentPurple}18` }]}>
          <Feather name="users" size={13} color={colors.accentPurple} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Elenco</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={styles.skeletonItem}>
                <View style={[styles.avatarSkeleton, { backgroundColor: colors.shimmer1 }]} />
                <View style={[styles.nameSkeleton, { backgroundColor: colors.shimmer1 }]} />
                <View style={[styles.roleSkeleton, { backgroundColor: colors.shimmer1 }]} />
              </View>
            ))
          : cast.map((member) => (
              <CastCard key={member.id} member={member} colors={colors} />
            ))}
      </ScrollView>
    </View>
  );
}

function CastCard({
  member,
  colors,
}: {
  member: CastMember;
  colors: ReturnType<typeof useColors>;
}) {
  const [imgError, setImgError] = useState(false);
  const photoUrl = IMG(member.profile_path);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={[styles.avatarWrap, { borderColor: colors.borderLight }]}>
        {!imgError && photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.avatar}
            contentFit="cover"
            transition={200}
            onError={() => setImgError(true)}
          />
        ) : (
          <LinearGradient
            colors={[colors.cardElevated, colors.card]}
            style={styles.avatarFallback}
          >
            <Text style={[styles.avatarLetter, { color: colors.mutedForeground }]}>
              {(member.name[0] ?? "?").toUpperCase()}
            </Text>
          </LinearGradient>
        )}
      </View>
      <Text
        style={[styles.name, { color: colors.foreground }]}
        numberOfLines={2}
      >
        {member.name}
      </Text>
      <Text
        style={[styles.character, { color: colors.mutedForeground }]}
        numberOfLines={2}
      >
        {member.character}
      </Text>
    </Pressable>
  );
}

const AVATAR_SIZE = 72;

const styles = StyleSheet.create({
  container: {
    marginBottom: 28,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  bar: {
    width: 3,
    height: 18,
    borderRadius: 2,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  scroll: {
    paddingHorizontal: 20,
    gap: 14,
  },
  card: {
    width: AVATAR_SIZE + 14,
    alignItems: "center",
    gap: 6,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: "hidden",
    borderWidth: 1.5,
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: 26,
    fontWeight: "700",
  },
  name: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 15,
  },
  character: {
    fontSize: 10,
    fontWeight: "400",
    textAlign: "center",
    lineHeight: 13,
  },
  skeletonItem: {
    width: AVATAR_SIZE + 14,
    alignItems: "center",
    gap: 7,
  },
  avatarSkeleton: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  nameSkeleton: {
    width: 64,
    height: 9,
    borderRadius: 5,
  },
  roleSkeleton: {
    width: 50,
    height: 8,
    borderRadius: 4,
  },
});
