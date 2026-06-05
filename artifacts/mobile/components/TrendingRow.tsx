import React, { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { api, tmdbItemToContent } from "@/lib/api";
import { ContentRow } from "@/components/ContentRow";
import { SkeletonRow } from "@/components/SkeletonLoader";
import type { ContentItem } from "@/constants/content";

interface TrendingRowProps {
  window?: "day" | "week";
  type?: "all" | "movie" | "tv";
  title?: string;
  icon?: string;
  maxItems?: number;
}

const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";

export function TrendingRow({
  window = "week",
  type = "all",
  title = "Em Alta",
  icon = "fire",
  maxItems = 10,
}: TrendingRowProps) {
  const router = useRouter();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = `https://api.themoviedb.org/3/trending/${type}/${window}?api_key=${TMDB_KEY}&language=pt-BR`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        const results = (d.results ?? []).filter((i: any) => i.poster_path);
        setItems(results.slice(0, maxItems).map((item: any) => tmdbItemToContent(item)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [window, type, maxItems]);

  if (loading) return <SkeletonRow />;
  if (items.length === 0) return null;

  return (
    <ContentRow
      title={title}
      icon={icon}
      items={items}
      cardWidth={120}
      cardHeight={175}
      showRating
      maxItems={maxItems}
      onItemPress={(item) => {
        router.push({
          pathname: "/detail",
          params: {
            type: item.type === "series" ? "tv" : "movie",
            id: String(item.tmdbId ?? item.id),
            title: item.title,
          },
        });
      }}
    />
  );
}
