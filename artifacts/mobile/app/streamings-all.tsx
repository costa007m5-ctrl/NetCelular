import React from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MAIN_PLATFORMS, SPECIFIC_PLATFORMS, NICHE_PLATFORMS } from "@/constants/streamings";
import type { StreamingPlatform } from "@/constants/streamings";
import { useColors } from "@/hooks/useColors";

function PlatformCard({
  platform,
  onPress,
  wide = false,
}: {
  platform: StreamingPlatform;
  onPress: () => void;
  wide?: boolean;
}) {
  const [logoError, setLogoError] = React.useState(false);
  const scale = React.useRef(new Animated.Value(1)).current;
  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 30 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26 }).start();

  const logoUrl = platform.logoUrl
    ? platform.logoUrl
    : platform.logoPath
    ? `https://image.tmdb.org/t/p/w185${platform.logoPath}`
    : null;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={wide ? styles.cardWide : styles.card}
    >
      <Animated.View style={[wide ? styles.cardWide : styles.card, { transform: [{ scale }] }]}>
        <LinearGradient
          colors={[platform.bgGradient[0], platform.bgGradient[1]] as [string, string]}
          style={[styles.cardGradient, wide && styles.cardGradientWide]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Glow overlay */}
          <View
            style={[
              styles.glowOverlay,
              { backgroundColor: platform.brandColor + "18" },
            ]}
          />

          {/* Top accent bar */}
          <View
            style={[styles.accentBar, { backgroundColor: platform.brandColor }]}
          />

          {/* Logo or text */}
          <View style={styles.logoArea}>
            {logoUrl && !logoError ? (
              <Image
                source={{ uri: logoUrl }}
                style={[styles.cardLogo, wide && styles.cardLogoWide]}
                resizeMode="contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              <View style={styles.textLogoContainer}>
                <Text
                  style={[styles.textLogoFirst, { color: platform.brandColor }]}
                  numberOfLines={1}
                >
                  {platform.name.split(" ")[0].toUpperCase()}
                </Text>
                {platform.name.split(" ").length > 1 && (
                  <Text
                    style={[styles.textLogoRest, { color: platform.accentColor }]}
                    numberOfLines={1}
                  >
                    {platform.name.split(" ").slice(1).join(" ")}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Tagline */}
          {platform.tagline ? (
            <Text
              style={[styles.tagline, { color: platform.brandColor + "aa" }]}
              numberOfLines={1}
            >
              {platform.tagline}
            </Text>
          ) : null}

          {/* Bottom right arrow */}
          <View style={[styles.arrowBadge, { backgroundColor: platform.brandColor + "22" }]}>
            <Feather name="chevron-right" size={12} color={platform.brandColor} />
          </View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

function SectionHeader({ title, icon }: { title: string; icon?: string }) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionBar, { backgroundColor: colors.primary }]} />
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
    </View>
  );
}

export default function StreamingsAllScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const goTo = (id: string) => {
    router.push({ pathname: "/streaming", params: { id } });
  };

  // First platform gets a wide card, rest normal
  const [mainFirst, ...mainRest] = MAIN_PLATFORMS;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* Header */}
      <LinearGradient
        colors={["#0a0a0a", "transparent"]}
        style={[styles.header, { paddingTop: topPad + 8 }]}
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Plataformas</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 80 },
        ]}
      >
        {/* Main Platforms */}
        <SectionHeader title="Filmes e Séries" />

        {/* First platform wide */}
        {mainFirst && (
          <View style={styles.wideRow}>
            <PlatformCard
              platform={mainFirst}
              onPress={() => goTo(mainFirst.id)}
              wide
            />
          </View>
        )}

        {/* Rest in 2-column grid */}
        <View style={styles.grid}>
          {mainRest.map((p) => (
            <PlatformCard key={p.id} platform={p} onPress={() => goTo(p.id)} />
          ))}
        </View>

        {/* Specific */}
        <SectionHeader title="Cineastas e Premium" />
        <View style={styles.grid}>
          {SPECIFIC_PLATFORMS.map((p) => (
            <PlatformCard key={p.id} platform={p} onPress={() => goTo(p.id)} />
          ))}
        </View>

        {/* Niche */}
        <SectionHeader title="Anime, Esporte e Nichos" />
        <View style={styles.grid}>
          {NICHE_PLATFORMS.map((p) => (
            <PlatformCard key={p.id} platform={p} onPress={() => goTo(p.id)} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  headerTitle: { fontSize: 21, fontWeight: "800", letterSpacing: -0.4 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 4 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 28,
    marginBottom: 14,
  },
  sectionBar: { width: 3, height: 18, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },

  // Grid layout
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  wideRow: {
    marginBottom: 10,
  },

  // Cards
  card: {
    width: "48%",
    borderRadius: 16,
    overflow: "hidden",
  },
  cardWide: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
  },
  cardGradient: {
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    position: "relative",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardGradientWide: {
    height: 110,
  },

  glowOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  accentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2.5,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },

  logoArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  cardLogo: {
    width: "80%",
    height: 44,
  },
  cardLogoWide: {
    height: 56,
    width: "60%",
  },

  textLogoContainer: { alignItems: "center" },
  textLogoFirst: { fontSize: 20, fontWeight: "900", letterSpacing: 0.3 },
  textLogoRest: { fontSize: 10, fontWeight: "700", letterSpacing: 2, marginTop: 2 },

  tagline: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textAlign: "center",
    marginTop: 4,
  },

  arrowBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
});
