import React from "react";
import {
  Dimensions,
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
import { getLocalLogo } from "@/constants/streaming-logos";
import { useColors } from "@/hooks/useColors";

const H_PAD = 14;
const COL_GAP = 10;
const SCREEN_W = Dimensions.get("window").width;
const CARD_W = Math.floor((SCREEN_W - H_PAD * 2 - COL_GAP) / 2);
const CARD_H = Math.floor(CARD_W * 0.68); // landscape ratio ~68%
const LOGO_H = Math.floor(CARD_H * 0.62);

const FEAT_H = 148;
const FEAT_LOGO_H = 82;

const RADIUS = 20;

function PlatformCard({
  platform,
  onPress,
  featured = false,
}: {
  platform: StreamingPlatform;
  onPress: () => void;
  featured?: boolean;
}) {
  const [logoError, setLogoError] = React.useState(false);
  const scale = React.useRef(new Animated.Value(1)).current;
  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 30 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26 }).start();

  const localLogo = getLocalLogo(platform.id);
  const logoUrl = platform.logoUrl
    ? platform.logoUrl
    : platform.logoPath
    ? `https://image.tmdb.org/t/p/w185${platform.logoPath}`
    : null;

  const cardWidth = featured ? SCREEN_W - H_PAD * 2 : CARD_W;
  const cardHeight = featured ? FEAT_H : CARD_H;
  const logoHeight = featured ? FEAT_LOGO_H : LOGO_H;
  const logoWidth = featured ? "48%" : "88%";

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={{ width: cardWidth, borderRadius: RADIUS, overflow: "hidden" }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient
          colors={[platform.bgGradient[0], platform.bgGradient[1]] as [string, string]}
          style={{
            width: cardWidth,
            height: cardHeight,
            borderRadius: RADIUS,
            overflow: "hidden",
            borderWidth: 0.5,
            borderColor: "rgba(255,255,255,0.09)",
            justifyContent: "space-between",
            paddingTop: 12,
            paddingBottom: 10,
            paddingHorizontal: featured ? 20 : 10,
          }}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Brand glow */}
          <View
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: platform.brandColor + "22",
            }}
          />

          {/* Accent top line */}
          <View
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0,
              height: 3,
              borderTopLeftRadius: RADIUS,
              borderTopRightRadius: RADIUS,
              backgroundColor: platform.brandColor,
            }}
          />

          {/* Logo — centered, ignoring tagline height */}
          <View style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 20,
            alignItems: "center",
            justifyContent: "center",
          }}>
            {localLogo ? (
              <Image
                source={localLogo}
                style={{ width: logoWidth as any, height: logoHeight }}
                resizeMode="contain"
              />
            ) : logoUrl && !logoError ? (
              <Image
                source={{ uri: logoUrl }}
                style={{ width: logoWidth as any, height: logoHeight }}
                resizeMode="contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              <View style={{ alignItems: "center" }}>
                <Text
                  style={{
                    color: platform.brandColor,
                    fontSize: featured ? 26 : 20,
                    fontWeight: "900",
                    letterSpacing: 0.5,
                  }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {platform.name.split(" ")[0].toUpperCase()}
                </Text>
                {platform.name.split(" ").length > 1 && (
                  <Text
                    style={{
                      color: platform.accentColor,
                      fontSize: 9,
                      fontWeight: "700",
                      letterSpacing: 2,
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                  >
                    {platform.name.split(" ").slice(1).join(" ").toUpperCase()}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Tagline pinned at bottom */}
          <Text
            style={{
              position: "absolute",
              bottom: 9, left: 8, right: 8,
              color: platform.brandColor + "bb",
              fontSize: 8,
              fontWeight: "700",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              textAlign: "center",
            }}
            numberOfLines={1}
          >
            {platform.tagline ?? "PREMIUM"}
          </Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

function SectionHeader({ title }: { title: string }) {
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

  const [featuredPlatform, ...restMain] = MAIN_PLATFORMS;

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
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
      >
        <SectionHeader title="Filmes e Séries" />

        {/* Featured Netflix */}
        {featuredPlatform && (
          <View style={{ marginBottom: COL_GAP }}>
            <PlatformCard platform={featuredPlatform} onPress={() => goTo(featuredPlatform.id)} featured />
          </View>
        )}

        {/* 2-col grid */}
        <View style={styles.grid}>
          {restMain.map((p) => (
            <PlatformCard key={p.id} platform={p} onPress={() => goTo(p.id)} />
          ))}
        </View>

        <SectionHeader title="Cineastas e Premium" />
        <View style={styles.grid}>
          {SPECIFIC_PLATFORMS.map((p) => (
            <PlatformCard key={p.id} platform={p} onPress={() => goTo(p.id)} />
          ))}
        </View>

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
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  headerTitle: { fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },

  scroll: { paddingHorizontal: H_PAD, paddingTop: 4 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 28,
    marginBottom: 14,
  },
  sectionBar: { width: 3, height: 18, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: COL_GAP,
  },
});
