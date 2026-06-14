/**
 * StingOverlay — plays the programmatic sting animation + audio track.
 *
 * - Fetches the TMDB title logo (stylized name image) for the content being played
 * - StingAnimation handles all visuals (ring arches, logo reveal, text, bar)
 * - expo-av Audio plays sting_audio.aac in parallel
 * - Two conditions required before disappearing:
 *     1. Animation's 10 s timer fired (or 12 s safety net)
 *     2. `videoReady` prop is true
 * - Spinner shown if animation done but videoReady still false
 */

import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import StingAnimation from "./StingAnimation";

let AudioModule: any = null;
try { AudioModule = require("expo-av").Audio; } catch {}

const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
const logoCache = new Map<string, string | null>();

async function fetchTmdbLogo(tmdbId: number, mediaType: "movie" | "tv"): Promise<string | null> {
  const key = `${mediaType}_${tmdbId}`;
  if (logoCache.has(key)) return logoCache.get(key) ?? null;
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/images?api_key=${TMDB_KEY}&include_image_language=pt,en,null`
    );
    const data = await res.json();
    const logos: any[] = data.logos ?? [];
    // Prefer English, then Portuguese, then any
    const best = logos.find((l) => l.iso_639_1 === "en")
      ?? logos.find((l) => l.iso_639_1 === "pt")
      ?? logos[0]
      ?? null;
    const path = best?.file_path ?? null;
    const url = path ? `https://image.tmdb.org/t/p/w500${path}` : null;
    logoCache.set(key, url);
    return url;
  } catch {
    logoCache.set(key, null);
    return null;
  }
}

interface StingOverlayProps {
  videoReady: boolean;
  onDone:     () => void;
  tmdbId?:    number | null;
  mediaType?: "movie" | "tv";
}

export default function StingOverlay({ videoReady, onDone, tmdbId, mediaType }: StingOverlayProps) {
  const [animDone, setAnimDone]   = useState(false);
  const [logoUrl,  setLogoUrl]    = useState<string | undefined>(undefined);
  const doneCalledRef  = useRef(false);
  const animDoneRef    = useRef(false);
  const videoReadyRef  = useRef(videoReady);
  const onDoneRef      = useRef(onDone);
  const safetyRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundRef       = useRef<any>(null);

  useEffect(() => { onDoneRef.current = onDone; });

  // Fetch title logo as soon as we mount (non-blocking — animation proceeds either way)
  useEffect(() => {
    if (!tmdbId || !mediaType) return;
    fetchTmdbLogo(tmdbId, mediaType).then((url) => {
      if (url) setLogoUrl(url);
    });
  }, [tmdbId, mediaType]);

  const finish = () => {
    if (doneCalledRef.current) return;
    doneCalledRef.current = true;
    if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null; }
    if (soundRef.current) {
      soundRef.current.stopAsync().catch(() => {});
      soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    onDoneRef.current();
  };

  const markAnimDone = () => {
    if (animDoneRef.current) return;
    animDoneRef.current = true;
    setAnimDone(true);
    if (videoReadyRef.current) finish();
  };

  useEffect(() => {
    (async () => {
      try {
        if (!AudioModule) return;
        await AudioModule.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await AudioModule.Sound.createAsync(
          require("@/assets/sting_audio.aac"),
          { shouldPlay: true, volume: 1.0, isLooping: false },
        );
        soundRef.current = sound;
      } catch { /* audio not critical */ }
    })();

    safetyRef.current = setTimeout(() => {
      markAnimDone();
      finish();
    }, 12_000);

    return () => {
      if (safetyRef.current) clearTimeout(safetyRef.current);
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => {});
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    videoReadyRef.current = videoReady;
    if (videoReady && animDoneRef.current) finish();
  }, [videoReady]);

  return (
    <View style={styles.container} pointerEvents="none">
      {!animDone && <StingAnimation onEnd={markAnimDone} logoUrl={logoUrl} />}

      {animDone && !videoReady && (
        <View style={styles.waitSpinner} pointerEvents="none">
          <ActivityIndicator size="large" color="#e50914" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 9999,
  },
  waitSpinner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
});
