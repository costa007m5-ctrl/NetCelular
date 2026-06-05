import React, { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { api, tmdbItemToContent } from "@/lib/api";
import { ContentRow } from "@/components/ContentRow";
import { SkeletonRow } from "@/components/SkeletonLoader";
import type { ContentItem } from "@/constants/content";

const GENRE_ICONS: Record<number, string> = {
  28: "zap",
  12: "compass",
  16: "film",
  35: "smile",
  80: "alert-octagon",
  99: "book-open",
  18: "heart",
  10751: "users",
  14: "star",
  36: "clock",
  27: "moon",
  10402: "music",
  9648: "search",
  10749: "heart",
  878: "cpu",
  53: "activity",
  10752: "shield",
  37: "sun",
  10759: "zap",
  10765: "cpu",
};

interface GenreRowProps {
  genreId: number;
  type: "movie" | "tv";
  title: string;
  accentColor?: string;
}

const ACCENT_COLORS = [
  "#e50914", "#3b82f6", "#a78bfa", "#22c55e", "#f59e0b",
  "#ec4899", "#06b6d4", "#f97316", "#10b981", "#6366f1",
];
let accentIndex = 0;
const genreAccentMap = new Map<number, string>();
function getGenreAccent(genreId: number): string {
  if (!genreAccentMap.has(genreId)) {
    genreAccentMap.set(genreId, ACCENT_COLORS[accentIndex % ACCENT_COLORS.length]!);
    accentIndex++;
  }
  return genreAccentMap.get(genreId)!;
}

export function GenreRow({ genreId, type, title, accentColor }: GenreRowProps) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const icon = GENRE_ICONS[genreId] ?? "film";
  const accent = accentColor ?? getGenreAccent(genreId);

  useEffect(() => {
    let cancelled = false;
    api.tmdb
      .discover(type, genreId, 1)
      .then((data) => {
        if (!cancelled) setItems(data.results.map(tmdbItemToContent));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [genreId, type]);

  if (loading) return <SkeletonRow cardWidth={130} cardHeight={190} />;
  if (items.length === 0) return null;

  return (
    <ContentRow
      title={title}
      icon={icon}
      accentColor={accent}
      items={items}
      maxItems={8}
      cardWidth={130}
      cardHeight={190}
      showRating
      seeAllLabel="Ver mais"
      onSeeAll={() =>
        router.push({
          pathname: "/genre-browse",
          params: { genre_id: String(genreId), type, title },
        })
      }
      onItemPress={(item) =>
        router.push({
          pathname: "/detail",
          params: {
            type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"),
            id: String(item.tmdbId ?? item.id),
            title: item.title,
          },
        })
      }
    />
  );
}
