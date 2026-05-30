import React, { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { api, tmdbItemToContent } from "@/lib/api";
import { ContentRow } from "@/components/ContentRow";
import { SkeletonRow } from "@/components/SkeletonLoader";
import type { ContentItem } from "@/constants/content";

interface StreamingGenreRowProps {
  providerId: number;
  genreId: number;
  type: "movie" | "tv";
  title: string;
  accentColor: string;
}

export function StreamingGenreRow({ providerId, genreId, type, title, accentColor }: StreamingGenreRowProps) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setItems([]);
    api.tmdb
      .streamingGenre(providerId, type, genreId, 1)
      .then((data) => {
        if (!cancelled) setItems(data.results.map(tmdbItemToContent));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [providerId, genreId, type]);

  if (loading) return <SkeletonRow />;
  if (items.length === 0) return null;

  return (
    <ContentRow
      title={title}
      icon="circle"
      items={items.slice(0, 10)}
      cardWidth={130}
      cardHeight={190}
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
