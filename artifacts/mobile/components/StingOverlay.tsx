/**
 * StingOverlay — plays the sting video and waits for the main video to be ready.
 *
 * - StingAnimation handles all visuals + audio (embedded in sting.mp4)
 * - Two conditions both required before disappearing:
 *     1. Animation's onEnd fired (video finished or 12 s safety net)
 *     2. `videoReady` prop is true
 * - Spinner shown if animation done but videoReady still false
 */

import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import StingAnimation from "./StingAnimation";

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

  useEffect(() => { onDoneRef.current = onDone; });

  const finish = () => {
    if (doneCalledRef.current) return;
    doneCalledRef.current = true;
    onDoneRef.current();
  };

  const markAnimDone = () => {
    if (animDoneRef.current) return;
    animDoneRef.current = true;
    setAnimDone(true);
    if (videoReadyRef.current) finish();
  };

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
