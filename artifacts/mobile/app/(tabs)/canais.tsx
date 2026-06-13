import React, { useRef } from "react";
import {
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  MAIN_PLATFORMS,
  NICHE_PLATFORMS,
  SPECIFIC_PLATFORMS,
  StreamingPlatform,
} from "@/constants/streamings";

const TMDB_IMG = (path: string | null, size = "w300") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

const TAB_BAR_CLEARANCE = Platform.OS === "web" ? 100 : 110;

function PlatformCard({ platform }: { platform: StreamingPlatform }) {
  const router = useRouter();
  const scale = useRef(new Animated.Value(1)).current;
  const [logoError, setLogoError] = React.useState(false);

  const logoUrl = TMDB_IMG(platform.logoPath);

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 30 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  const onPress = () =>
    router.push({ pathname: "/streaming", params: { platform: platform.id } } as never);

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        <LinearGradient
          colors={platform.bgGradient as [string, string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.cardAccentBar, { backgroundColor: platform.brandColor }]} />

        <View style={styles.cardInner}>
          {logoUrl && !logoError ? (
            <Image
              source={{ uri: logoUrl }}
              style={styles.logo}
              resizeMode="contain"
              onError={() => setLogoError(true)}
            />
          ) : (
            <View style={styles.textLogoWrap}>
              <Text style={[styles.textLogoMain, { color: platform.brandColor }]}>
                {platform.name.split(" ")[0].toUpperCase()}
              </Text>
              {platform.name.split(" ").length > 1 && (
                <Text style={[styles.textLogoSub, { color: platform.brandColor + "BB" }]}>
                  {platform.name.split(" ").slice(1).join(" ").toUpperCase()}
                </Text>
              )}
            </View>
          )}

          <View style={styles.cardText}>
            <Text style={styles.cardName} numberOfLines={1}>
              {platform.name}
            </Text>
            {platform.tagline ? (
              <Text style={styles.cardTagline} numberOfLines={1}>
                {platform.tagline}
              </Text>
            ) : null}
          </View>

          <View style={[styles.chevron, { borderColor: platform.brandColor + "55" }]}>
            <Text style={[styles.chevronText, { color: platform.brandColor }]}>›</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

export default function CanaisScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <Text style={styles.headerTitle}>Canais</Text>
        <Text style={styles.headerSub}>Catálogos completos das principais plataformas</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
      >
        <SectionHeader title="Principais" />
        {MAIN_PLATFORMS.map((p) => (
          <PlatformCard key={p.id} platform={p} />
        ))}

        <SectionHeader title="Especializados" />
        {SPECIFIC_PLATFORMS.map((p) => (
          <PlatformCard key={p.id} platform={p} />
        ))}

        <SectionHeader title="Nicho & Esporte" />
        {NICHE_PLATFORMS.map((p) => (
          <PlatformCard key={p.id} platform={p} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.45)",
    marginTop: 2,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 10,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardAccentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  cardInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingLeft: 20,
    paddingRight: 16,
    gap: 14,
  },

  logo: {
    width: 72,
    height: 36,
  },
  textLogoWrap: {
    width: 72,
    alignItems: "flex-start",
  },
  textLogoMain: {
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  textLogoSub: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: -2,
  },

  cardText: {
    flex: 1,
  },
  cardName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  cardTagline: {
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
    marginTop: 2,
  },

  chevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chevronText: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 22,
    marginLeft: 2,
  },
});
