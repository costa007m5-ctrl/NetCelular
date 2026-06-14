/**
 * StingOverlay — shows the animated vinheta while the main content loads.
 *
 * Logic:
 *  - Renders fullscreen on top of the player as soon as the player mounts.
 *  - Plays the StingAnimation (pure RN/Reanimated — no video file, no diamond).
 *  - Two conditions must BOTH be true before the overlay disappears:
 *      1. The sting animation has finished its cycle (~5 s).
 *      2. `videoReady` prop is true (main content is buffered and ready).
 *  - If the sting ends first → holds black screen + spinner until videoReady.
 *  - If videoReady before sting ends → waits for sting, then hides instantly.
 *  - Absolute 12 s safety fallback so it can NEVER freeze the player.
 */

import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import StingAnimation, { STING_DURATION_MS } from "./StingAnimation";

interface StingOverlayProps {
  videoReady: boolean;
  onDone: () => void;
}

export default function StingOverlay({ videoReady, onDone }: StingOverlayProps) {
  const [stingDone, setStingDone] = useState(false);
  const doneCalledRef    = useRef(false);
  const stingDoneRef     = useRef(false);
  const videoReadyRef    = useRef(videoReady);
  const onDoneRef        = useRef(onDone);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { onDoneRef.current = onDone; });

  const finish = () => {
    if (doneCalledRef.current) return;
    doneCalledRef.current = true;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    onDoneRef.current();
  };

  const markStingDone = () => {
    if (stingDoneRef.current) return;
    stingDoneRef.current = true;
    setStingDone(true);
    if (videoReadyRef.current) finish();
  };

  useEffect(() => {
    fallbackTimerRef.current = setTimeout(() => {
      markStingDone();
      finish();
    }, Math.max(STING_DURATION_MS, 12000));

    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    videoReadyRef.current = videoReady;
    if (videoReady && stingDoneRef.current) finish();
  }, [videoReady]);

  return (
    <View style={styles.container} pointerEvents="none">
      <StingAnimation onEnd={markStingDone} />

      {stingDone && !videoReady && (
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
    zIndex: 9999,
  },
  waitSpinner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
});
