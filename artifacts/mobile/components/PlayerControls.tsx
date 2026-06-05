import React, { useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";

interface PlayerControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onSkipBack?: () => void;
  onSkipForward?: () => void;
  onFullscreen?: () => void;
  onSettings?: () => void;
  currentTime?: number;
  duration?: number;
  onSeek?: (time: number) => void;
  title?: string;
  subtitle?: string;
  visible?: boolean;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PlayerControls({
  isPlaying,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onFullscreen,
  onSettings,
  currentTime = 0,
  duration = 0,
  onSeek,
  title,
  subtitle,
  visible = true,
}: PlayerControlsProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;
  const progress = duration > 0 ? currentTime / duration : 0;

  if (!visible) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.container]}>
      <LinearGradient
        colors={["rgba(0,0,0,0.75)", "transparent", "transparent", "rgba(0,0,0,0.9)"]}
        locations={[0, 0.2, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.topMeta}>
          {title && (
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
          )}
          {subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          )}
        </View>
        <View style={styles.topActions}>
          {onSettings && (
            <Pressable onPress={onSettings} style={styles.iconBtn}>
              <Feather name="settings" size={20} color="#fff" />
            </Pressable>
          )}
          {onFullscreen && (
            <Pressable onPress={onFullscreen} style={styles.iconBtn}>
              <Feather name="maximize" size={20} color="#fff" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Center Controls */}
      <View style={styles.centerControls}>
        {onSkipBack && (
          <Pressable onPress={onSkipBack} style={styles.skipBtn}>
            <Feather name="rotate-ccw" size={24} color="rgba(255,255,255,0.85)" />
            <Text style={styles.skipLabel}>10</Text>
          </Pressable>
        )}

        <Pressable onPress={onPlayPause} style={styles.playPauseBtn}>
          <View style={styles.playPauseInner}>
            <Feather
              name={isPlaying ? "pause" : "play"}
              size={28}
              color="#fff"
              style={isPlaying ? undefined : { marginLeft: 3 }}
            />
          </View>
        </Pressable>

        {onSkipForward && (
          <Pressable onPress={onSkipForward} style={styles.skipBtn}>
            <Feather name="rotate-cw" size={24} color="rgba(255,255,255,0.85)" />
            <Text style={styles.skipLabel}>10</Text>
          </Pressable>
        )}
      </View>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <Text style={styles.timeText}>{formatTime(currentTime)}</Text>

        <Pressable
          style={styles.progressWrap}
          onPress={(e) => {
            if (!onSeek || duration <= 0) return;
          }}
        >
          <View style={styles.progressTrack}>
            <View style={styles.progressBuffer} />
            <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
            <View
              style={[
                styles.progressThumb,
                { left: `${progress * 100}%` as any },
              ]}
            />
          </View>
        </Pressable>

        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "space-between",
    zIndex: 10,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: 16,
    paddingTop: Platform.OS === "ios" ? 52 : 20,
    gap: 12,
  },
  topMeta: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.3,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  subtitle: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontWeight: "400",
  },
  topActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  centerControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
  },
  skipBtn: {
    alignItems: "center",
    justifyContent: "center",
    width: 52,
    height: 52,
  },
  skipLabel: {
    position: "absolute",
    bottom: 4,
    color: "rgba(255,255,255,0.7)",
    fontSize: 9,
    fontWeight: "700",
  },
  playPauseBtn: {
    alignItems: "center",
    justifyContent: "center",
  },
  playPauseInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(229,9,20,0.88)",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#e50914",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
      },
    }),
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 38 : 20,
    gap: 12,
  },
  timeText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "600",
    minWidth: 40,
    textAlign: "center",
  },
  progressWrap: {
    flex: 1,
    height: 20,
    justifyContent: "center",
  },
  progressTrack: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2,
    position: "relative",
    overflow: "visible",
  },
  progressBuffer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "60%",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 2,
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#e50914",
    borderRadius: 2,
  },
  progressThumb: {
    position: "absolute",
    top: -5,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: "#fff",
    marginLeft: -6,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
      },
    }),
  },
});
