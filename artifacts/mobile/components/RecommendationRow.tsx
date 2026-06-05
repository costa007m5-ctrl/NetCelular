import React, { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { api, tmdbItemToContent } from "@/lib/api";
import { ContentRow } from "@/components/ContentRow";
import { SkeletonRow } from "@/components/SkeletonLoader";
import type { ContentItem } from "@/constants/content";

const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";

interface RecommendationRowProps {
  tmdbId: number;
  type: "movie" | "tv";
  title?: string;
}

export function RecommendationRow({
  tmdbId,
  type,
  title = "Recomendados",
}: RecommendationRowProps) {
  const router = useRouter();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tmdbId) return;
    const endpoint = type === "movie"
      ? `https://api.themoviedb.org/3/movie/${tmdbId}/recommendations?api_key=${TMDB_KEY}&language=pt-BR&page=1`
      : `https://api.themoviedb.org/3/tv/${tmdbId}/recommendations?api_key=${TMDB_KEY}&language=pt-BR&page=1`;

    fetch(endpoint)
      .then((r) => r.json())
      .then((d) => {
        const results = (d.results ?? []).filter((i: any) => i.poster_path);
        setItems(results.slice(0, 12).map((item: any) => tmdbItemToContent(item)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tmdbId, type]);

  if (loading) return <SkeletonRow />;
  if (items.length === 0) return null;

  return (
    <ContentRow
      title={title}
      icon="star"
      items={items}
      cardWidth={120}
      cardHeight={175}
      showRating
      maxItems={12}
      onItemPress={(item) => {
        router.push({
          pathname: "/detail",
          params: { type: item.type === "series" ? "tv" : "movie", id: String(item.tmdbId ?? item.id), title: item.title },
        });
      }}
    />
  );
}
