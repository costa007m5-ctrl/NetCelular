import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface Track {
  id: string;
  label: string;
  language?: string;
  type?: "audio" | "subtitle" | "dub";
  active?: boolean;
}

interface AudioTrackSelectorProps {
  visible: boolean;
  onClose: () => void;
  audioTracks: Track[];
  subtitleTracks: Track[];
  onSelectAudio?: (track: Track) => void;
  onSelectSubtitle?: (track: Track) => void;
  activeAudioId?: string;
  activeSubtitleId?: string;
}

function TrackItem({
  track,
  active,
  onPress,
}: {
  track: Track;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.trackItem,
        {
          backgroundColor: active ? `${colors.primary}15` : colors.muted,
          borderColor: active ? colors.primary : colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.trackInfo}>
        <Text style={[styles.trackLabel, { color: active ? colors.primary : colors.foreground }]}>
          {track.label}
        </Text>
        {track.language && (
          <Text style={[styles.trackLang, { color: colors.mutedForeground }]}>
            {track.language}
          </Text>
        )}
      </View>
      {active && <Feather name="check" size={14} color={colors.primary} />}
    </Pressable>
  );
}

export function AudioTrackSelector({
  visible,
  onClose,
  audioTracks,
  subtitleTracks,
  onSelectAudio,
  onSelectSubtitle,
  activeAudioId,
  activeSubtitleId,
}: AudioTrackSelectorProps) {
  const colors = useColors();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <Feather name="sliders" size={18} color={colors.primary} />
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              Áudio & Legendas
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
            {audioTracks.length > 0 && (
              <View style={styles.group}>
                <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>
                  ÁUDIO
                </Text>
                {audioTracks.map((track) => (
                  <TrackItem
                    key={track.id}
                    track={track}
                    active={track.id === activeAudioId}
                    onPress={() => { onSelectAudio?.(track); onClose(); }}
                  />
                ))}
              </View>
            )}

            {subtitleTracks.length > 0 && (
              <View style={styles.group}>
                <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>
                  LEGENDAS
                </Text>
                {subtitleTracks.map((track) => (
                  <TrackItem
                    key={track.id}
                    track={track}
                    active={track.id === activeSubtitleId}
                    onPress={() => { onSelectSubtitle?.(track); onClose(); }}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    maxHeight: "70%",
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  content: {
    paddingHorizontal: 20,
  },
  group: {
    marginBottom: 20,
  },
  groupTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 10,
  },
  trackItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  trackInfo: {
    flex: 1,
    gap: 2,
  },
  trackLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  trackLang: {
    fontSize: 11,
    fontWeight: "400",
  },
});
