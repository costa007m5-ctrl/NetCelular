import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { ContentRow } from "@/components/ContentRow";
import { TRENDING, TOP_10_SERIES } from "@/constants/content";
import { CHANNELS } from "@/constants/content";
import type { ContentItem } from "@/constants/content";

const CHANNEL_CONTENT: Record<string, typeof TRENDING> = {
  ch1: TRENDING.slice(0, 4),
  ch2: TOP_10_SERIES.slice(0, 4),
  ch3: TRENDING.slice(2, 6),
  ch4: TOP_10_SERIES.slice(1, 5),
  ch5: TRENDING.slice(1, 5),
  ch6: TOP_10_SERIES.slice(0, 4),
};

export default function ChannelsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const goToDetail = (item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: (item as any).mediaType ?? (item.type === "movie" ? "movie" : "tv"),
        id: String((item as any).tmdbId ?? item.id),
        title: item.title,
      },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={{ height: topPad + 16 }} />

        <View style={styles.headerSection}>
          <Text style={[styles.screenTitle, { color: colors.foreground }]}>
            Canais Premium
          </Text>
          <Text style={[styles.screenSub, { color: colors.mutedForeground }]}>
            Acesso ilimitado a todos os catálogos
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.channelsRow}
        >
          {CHANNELS.map((ch) => (
            <Pressable
              key={ch.id}
              style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
            >
              <LinearGradient
                colors={[ch.color + "33", ch.color + "11"]}
                style={[styles.channelCard, { borderColor: ch.color + "44" }]}
              >
                <Text style={[styles.channelLogo, { color: ch.color }]}>
                  {ch.logo || ch.name.charAt(0)}
                </Text>
                <Text style={[styles.channelName, { color: colors.foreground }]}>
                  {ch.name}
                </Text>
              </LinearGradient>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.divider} />

        {CHANNELS.map((ch) => {
          const content = CHANNEL_CONTENT[ch.id];
          if (!content || content.length === 0) return null;
          return (
            <ContentRow
              key={ch.id}
              title={ch.name}
              icon="tv"
              items={content}
              cardWidth={130}
              cardHeight={185}
              onSeeAll={() => {}}
              onItemPress={goToDetail}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  screenSub: {
    fontSize: 13,
    fontWeight: "400",
    marginTop: 4,
  },
  channelsRow: {
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 28,
  },
  channelCard: {
    width: 110,
    height: 72,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  channelLogo: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 1,
  },
  channelName: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginHorizontal: 20,
    marginBottom: 28,
  },
});
