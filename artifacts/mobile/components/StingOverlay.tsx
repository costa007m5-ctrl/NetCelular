/**
 * StingOverlay — plays a branded sting video while the main content loads.
 *
 * Logic:
 *  - Renders fullscreen on top of the player as soon as the player mounts.
 *  - Plays sting.mp4 once to completion.
 *  - Two conditions must BOTH be true before the overlay disappears:
 *      1. The sting has finished playing.
 *      2. `videoReady` prop is true (main content is buffered and ready).
 *  - If the sting finishes before the video is ready → holds on black + spinner
 *    until `videoReady` becomes true, then disappears instantly (no delay).
 *  - If the video is ready before the sting finishes → waits for sting to end,
 *    then disappears instantly.
 */

import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

let Video: any = null;
let ResizeMode: any = null;
try {
  const av = require("expo-av");
  Video = av.Video;
  ResizeMode = av.ResizeMode;
} catch {}

interface StingOverlayProps {
  videoReady: boolean;
  onDone: () => void;
}

export default function StingOverlay({ videoReady, onDone }: StingOverlayProps) {
  const [stingDone, setStingDone] = useState(false);
  const doneCalledRef = useRef(false);
  const stingDoneRef = useRef(false);
  const videoReadyRef = useRef(videoReady);
  const onDoneRef = useRef(onDone);

  useEffect(() => { onDoneRef.current = onDone; });

  useEffect(() => {
    if (!Video) {
      doneCalledRef.current = true;
      onDoneRef.current();
    }
  }, []);

  useEffect(() => {
    videoReadyRef.current = videoReady;
    if (videoReady && stingDoneRef.current && !doneCalledRef.current) {
      doneCalledRef.current = true;
      onDoneRef.current();
    }
  }, [videoReady]);

  const handleStingEnd = () => {
    if (stingDoneRef.current) return;
    stingDoneRef.current = true;
    setStingDone(true);
    if (videoReadyRef.current && !doneCalledRef.current) {
      doneCalledRef.current = true;
      onDoneRef.current();
    }
  };

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
        onPlaybackStatusUpdate={(status: any) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) {
            handleStingEnd();
          }
        }}
        onError={handleStingEnd}
      />
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
  waitSpinner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
});
