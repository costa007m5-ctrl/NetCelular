/**
 * StingOverlay — plays the programmatic sting animation + audio track.
 *
 * Transition sequence when video is ready + animation done:
 *  1. Brief white flash (80 ms) — cinematic projector cut feel
 *  2. Fade to black (600 ms)
 *  3. onDone() called — overlay unmounts, video appears underneath
 *
 * This creates a smooth, cinematic handoff from the sting to the video.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  View,
} from "react-native";
import StingAnimation from "./StingAnimation";
import NetplayHeartbeatLoader from "./NetplayHeartbeatLoader";

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

const FADE_DURATION_MS = 650;
const FLASH_DURATION_MS = 80;

export default function StingOverlay({ videoReady, onDone, tmdbId, mediaType }: StingOverlayProps) {
  const [animDone, setAnimDone]   = useState(false);
  const [logoUrl,  setLogoUrl]    = useState<string | undefined>(undefined);

  // Animated values for the cinematic transition
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const flashOpacity   = useRef(new Animated.Value(0)).current;

  const doneCalledRef  = useRef(false);
  const animDoneRef    = useRef(false);
  const videoReadyRef  = useRef(videoReady);
  const onDoneRef      = useRef(onDone);
  const safetyRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundRef       = useRef<any>(null);

  useEffect(() => { onDoneRef.current = onDone; });

  // Fetch title logo (non-blocking)
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

    // ── Cinematic fade-out transition ─────────────────────────────────────────
    // 1. Brief white flash
    // 2. Fade entire overlay to black (opacity 0)
    // 3. Call onDone so the overlay unmounts revealing the video
    Animated.sequence([
      // Flash in
      Animated.timing(flashOpacity, {
        toValue: 0.7,
        duration: FLASH_DURATION_MS,
        useNativeDriver: true,
      }),
      // Flash out + main overlay fade simultaneously
      Animated.parallel([
        Animated.timing(flashOpacity, {
          toValue: 0,
          duration: FADE_DURATION_MS * 0.4,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: FADE_DURATION_MS,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      onDoneRef.current();
    });
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
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require("../assets/sting_audio.aac"),
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
    <Animated.View style={[styles.container, { opacity: overlayOpacity }]} pointerEvents="none">
      {/* Sting animation */}
      {!animDone && <StingAnimation onEnd={markAnimDone} logoUrl={logoUrl} />}

      {/* N heartbeat: animation done but video still buffering */}
      {animDone && !doneCalledRef.current && (
        <View style={styles.waitSpinner} pointerEvents="none">
          <NetplayHeartbeatLoader size={100} />
        </View>
      )}

      {/* White flash layer — sits on top of everything */}
      <Animated.View
        style={[styles.flashLayer, { opacity: flashOpacity }]}
        pointerEvents="none"
      />
    </Animated.View>
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
  flashLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#ffffff",
    zIndex: 10000,
  },
});
