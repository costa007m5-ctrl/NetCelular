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
import { getLocalLogo } from "@/constants/streaming-logos";
import { useColors } from "@/hooks/useColors";

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

  const cardStyle = featured ? styles.cardFeatured : styles.card;
  const gradStyle = featured ? styles.gradFeatured : styles.grad;
  const logoStyle = featured ? styles.logoFeatured : styles.logo;

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} style={cardStyle}>
      <Animated.View style={[cardStyle, { transform: [{ scale }] }]}>
        <LinearGradient
          colors={[platform.bgGradient[0], platform.bgGradient[1]] as [string, string]}
          style={gradStyle}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Brand glow overlay */}
          <View style={[styles.glow, { backgroundColor: platform.brandColor + "28" }]} />

          {/* Top accent line */}
          <View style={[styles.accentLine, { backgroundColor: platform.brandColor }]} />

          {/* Logo area */}
          <View style={styles.logoArea}>
            {localLogo ? (
              <Image source={localLogo} style={logoStyle} resizeMode="contain" />
            ) : logoUrl && !logoError ? (
              <Image
                source={{ uri: logoUrl }}
                style={logoStyle}
                resizeMode="contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              <View style={styles.textLogo}>
                <Text
                  style={[
                    styles.textLogoMain,
                    { color: platform.brandColor, fontSize: featured ? 26 : 20 },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {platform.name.split(" ")[0].toUpperCase()}
                </Text>
                {platform.name.split(" ").length > 1 && (
                  <Text
                    style={[styles.textLogoSub, { color: platform.accentColor }]}
                    numberOfLines={1}
                  >
                    {platform.name.split(" ").slice(1).join(" ").toUpperCase()}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Tagline + arrow row */}
          <View style={styles.footer}>
            <Text
              style={[styles.tagline, { color: platform.brandColor + "cc" }]}
              numberOfLines={1}
            >
              {platform.tagline ?? "PREMIUM"}
            </Text>
            <View style={[styles.arrowCircle, { backgroundColor: platform.brandColor + "25" }]}>
              <Feather name="chevron-right" size={11} color={platform.brandColor} />
            </View>
          </View>
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

        {/* Featured first platform */}
        {featuredPlatform && (
          <View style={styles.featuredRow}>
            <PlatformCard
              platform={featuredPlatform}
              onPress={() => goTo(featuredPlatform.id)}
              featured
            />
          </View>
        )}

        {/* Rest of main in 2-col grid */}
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

const CARD_RADIUS = 22;

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

  scroll: { paddingHorizontal: 14, paddingTop: 4 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 28,
    marginBottom: 14,
  },
  sectionBar: { width: 3, height: 18, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },

  featuredRow: { marginBottom: 10 },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  // ── Normal card (2-col grid) ──────────────────────────────
  card: {
    width: "48.5%",
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10 },
      android: { elevation: 5 },
    }),
  },
  grad: {
    height: 130,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    justifyContent: "space-between",
  },

  // ── Featured card (full width) ────────────────────────────
  cardFeatured: {
    width: "100%",
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.55, shadowRadius: 14 },
      android: { elevation: 7 },
    }),
  },
  gradFeatured: {
    height: 156,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    justifyContent: "space-between",
  },

  // ── Shared inner elements ─────────────────────────────────
  glow: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
  },
  accentLine: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 3,
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
  },

  logoArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: "90%",
    height: 68,
  },
  logoFeatured: {
    width: "52%",
    height: 86,
  },

  textLogo: { alignItems: "center" },
  textLogoMain: { fontWeight: "900", letterSpacing: 0.3, lineHeight: 28 },
  textLogoSub: { fontSize: 10, fontWeight: "700", letterSpacing: 2 },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  tagline: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  arrowCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
