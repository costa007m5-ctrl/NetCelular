/**
 * StingAnimation — plays the NETPLAY sting video (sting.mp4) via expo-av.
 *
 * Replaces the previous programmatic ring/text recreation with the actual
 * high-quality video asset. Audio is embedded in the MP4 and plays natively.
 *
 * Props:
 *  onEnd — called when the video finishes (or after a 12 s safety fallback).
 */

import React, { useRef, useEffect } from "react";
import { Dimensions, StyleSheet, View } from "react-native";

export const STING_DURATION_MS = 10_000;

let Video: any = null;
let ResizeMode: any = null;
try {
  const av = require("expo-av");
  Video = av.Video;
  ResizeMode = av.ResizeMode;
} catch {}

const { width: W, height: H } = Dimensions.get("window");

interface StingAnimationProps {
  onEnd: () => void;
}

export default function StingAnimation({ onEnd }: StingAnimationProps) {
  const onEndRef = useRef(onEnd);
  const calledRef = useRef(false);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onEndRef.current = onEnd;
  });

  useEffect(() => {
    // Safety fallback: fire after duration + 2 s if video hasn't ended
    fallbackRef.current = setTimeout(() => {
      triggerEnd();
    }, STING_DURATION_MS + 2000);

    // Also handle the no-Video case: fire after duration
    if (!Video) {
      clearTimeout(fallbackRef.current!);
      fallbackRef.current = setTimeout(() => {
        triggerEnd();
      }, STING_DURATION_MS);
    }

    return () => {
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
    };
  }, []);

  function triggerEnd() {
    if (calledRef.current) return;
    calledRef.current = true;
    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
    onEndRef.current();
  }

  if (!Video) {
    return <View style={styles.root} />;
  }

  return (
    <View style={styles.root}>
      <Video
        source={require("@/assets/sting.mp4")}
        style={styles.video}
        resizeMode={ResizeMode?.COVER ?? "cover"}
        shouldPlay
        isLooping={false}
        isMuted={false}
        volume={1.0}
        rate={1.0}
        useNativeControls={false}
        onPlaybackStatusUpdate={(status: any) => {
          if (status?.didJustFinish) {
            triggerEnd();
          }
        }}
        onError={() => {
          triggerEnd();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: W,
    height: H,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  video: {
    width: W,
    height: H,
  },
});
