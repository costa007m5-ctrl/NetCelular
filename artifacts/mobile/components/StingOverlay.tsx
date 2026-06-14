/**
 * StingOverlay — plays a branded sting video while the main content loads.
 *
 * Logic:
 *  - Renders fullscreen on top of the player as soon as the player mounts.
 *  - Plays sting.mp4 once to completion.
 *  - Two conditions must BOTH be true before the overlay disappears:
 *      1. The sting has finished playing.
 *      2. `videoReady` prop is true (main content is buffered and ready).
 *  - If the sting finishes before the video is ready → holds on black + spinner.
 *  - If the video is ready before the sting finishes → waits for sting to end.
 *  - Instant hide — no fade delay — once both conditions are met.
 *  - Fallback: absolute 12 s max timeout so it can never freeze the player.
 */

import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, StyleSheet, View } from "react-native";

let Video: any = null;
let ResizeMode: any = null;
try {
  const av = require("expo-av");
  Video = av.Video;
  ResizeMode = av.ResizeMode;
} catch {}

const { width: W, height: H } = Dimensions.get("window");

interface StingOverlayProps {
  videoReady: boolean;
  onDone: () => void;
}

export default function StingOverlay({ videoReady, onDone }: StingOverlayProps) {
  const [stingDone, setStingDone] = useState(false);
  const doneCalledRef   = useRef(false);
  const stingDoneRef    = useRef(false);
  const videoReadyRef   = useRef(videoReady);
  const onDoneRef       = useRef(onDone);
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
    if (!Video) {
      finish();
      return;
    }
    fallbackTimerRef.current = setTimeout(() => {
      markStingDone();
      finish();
    }, 12000);
    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    videoReadyRef.current = videoReady;
    if (videoReady && stingDoneRef.current) finish();
  }, [videoReady]);

  if (!Video) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <Video
        source={require("@/assets/sting.mp4")}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode?.COVER ?? "cover"}
        shouldPlay
        isLooping={false}
        isMuted={false}
        useNativeControls={false}
        onLoad={(status: any) => {
          if (!status.isLoaded) return;
          const dur = status.durationMillis ?? 0;
          if (dur > 0) {
            if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
            fallbackTimerRef.current = setTimeout(() => {
              markStingDone();
            }, dur + 300);
          }
        }}
        onPlaybackStatusUpdate={(status: any) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) markStingDone();
        }}
        onError={() => {
          markStingDone();
          finish();
        }}
      />

      {/* Cover the sparkle/star artefact that sits in the bottom-right of the
          sting video. The overlay is a small black patch flush to the corner. */}
      <View style={styles.starCover} pointerEvents="none" />

      {/* Waiting spinner — shown only when sting ended but video not ready yet */}
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
    backgroundColor: "#000",
    zIndex: 9999,
  },
  starCover: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: Math.round(W * 0.08),
    height: Math.round(H * 0.12),
    backgroundColor: "#000",
  },
  waitSpinner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
});
