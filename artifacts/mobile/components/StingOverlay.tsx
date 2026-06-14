/**
 * StingOverlay — plays the programmatic sting animation + audio track.
 *
 * - StingAnimation handles all visuals (ring arches, icon reveal, text, bar)
 * - expo-av Audio plays sting_audio.aac in parallel
 * - Two conditions both required before disappearing:
 *     1. Animation's 10 s timer fired (or 12 s safety net)
 *     2. `videoReady` prop is true
 * - Spinner shown if animation done but videoReady still false
 */

import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import StingAnimation from "./StingAnimation";

let AudioModule: any = null;
try { AudioModule = require("expo-av").Audio; } catch {}

interface StingOverlayProps {
  videoReady: boolean;
  onDone:     () => void;
}

export default function StingOverlay({ videoReady, onDone }: StingOverlayProps) {
  const [animDone, setAnimDone] = useState(false);
  const doneCalledRef   = useRef(false);
  const animDoneRef     = useRef(false);
  const videoReadyRef   = useRef(videoReady);
  const onDoneRef       = useRef(onDone);
  const safetyRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundRef        = useRef<any>(null);

  useEffect(() => { onDoneRef.current = onDone; });

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
    // Play audio in parallel with the animation
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

    // Absolute safety fallback: 12 s
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
      {!animDone && <StingAnimation onEnd={markAnimDone} />}

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
