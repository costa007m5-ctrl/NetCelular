import React, { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";

const logoCache = new Map<string, string | null>();

interface Props {
  id: number;
  type: "movie" | "tv";
  width?: number;
  height?: number;
  style?: object;
}

export function TmdbLogo({ id, type, width = 200, height = 64, style }: Props) {
  const cacheKey = `${type}_${id}`;
  const [logoPath, setLogoPath] = useState<string | null | undefined>(
    logoCache.has(cacheKey) ? logoCache.get(cacheKey) : undefined
  );

  useEffect(() => {
    if (logoCache.has(cacheKey)) {
      setLogoPath(logoCache.get(cacheKey) ?? null);
      return;
    }
    fetch(
      `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${TMDB_KEY}&include_image_language=pt,en,null`
    )
      .then((r) => r.json())
      .then((data) => {
        const logos: any[] = data.logos ?? [];
        const en = logos.find((l) => l.iso_639_1 === "en");
        const pt = logos.find((l) => l.iso_639_1 === "pt");
        const best = en ?? pt ?? logos[0] ?? null;
        const path = best?.file_path ?? null;
        logoCache.set(cacheKey, path);
        setLogoPath(path);
      })
      .catch(() => {
        logoCache.set(cacheKey, null);
        setLogoPath(null);
      });
  }, [cacheKey]);

  if (logoPath === undefined || logoPath === null) return null;

  const url = `https://image.tmdb.org/t/p/w500${logoPath}`;
  return (
    <Image
      source={{ uri: url }}
      style={[{ width, height }, s.logo, style]}
      resizeMode="contain"
    />
  );
}

const s = StyleSheet.create({
  logo: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },
});
