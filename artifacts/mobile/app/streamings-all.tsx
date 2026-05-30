import React from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
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
}: {
  platform: StreamingPlatform;
  onPress: () => void;
}) {
  const [logoError, setLogoError] = React.useState(false);
  const logoUrl = platform.logoPath
    ? `https://image.tmdb.org/t/p/w185${platform.logoPath}`
    : null;

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <LinearGradient
        colors={[platform.bgGradient[0], platform.bgGradient[1]] as [string, string]}
        style={styles.cardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Accent bar */}
        <View style={[styles.accentBar, { backgroundColor: platform.brandColor }]} />

        {/* Logo or text */}
        {logoUrl && !logoError ? (
          <Image
            source={{ uri: logoUrl }}
            style={styles.cardLogo}
            resizeMode="contain"
            onError={() => setLogoError(true)}
          />
        ) : (
          <View style={styles.textLogoContainer}>
            <Text style={[styles.textLogoFirst, { color: platform.brandColor }]} numberOfLines={1}>
              {platform.name.split(" ")[0].toUpperCase()}
            </Text>
            {platform.name.split(" ").length > 1 && (
              <Text style={[styles.textLogoRest, { color: platform.accentColor }]} numberOfLines={1}>
                {platform.name.split(" ").slice(1).join(" ")}
              </Text>
            )}
          </View>
        )}

        {/* Arrow indicator */}
        <Feather name="chevron-right" size={14} color={platform.accentColor} style={styles.cardArrow} />
      </LinearGradient>
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
  const topPad = isWeb ? 0 : insets.top;

  const goTo = (id: string) => {
    router.push({ pathname: "/streaming", params: { id } });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Streamings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
      >
        {/* Main Platforms */}
        <SectionHeader title="Filmes e Séries" />
        <View style={styles.grid}>
          {MAIN_PLATFORMS.map((p) => (
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
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 24, marginBottom: 12 },
  sectionBar: { width: 3, height: 16, borderRadius: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  card: {
    width: "47%",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 2,
  },
  cardGradient: {
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    position: "relative",
  },
  accentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  cardLogo: {
    width: "85%",
    height: 38,
  },
  textLogoContainer: { alignItems: "center" },
  textLogoFirst: { fontSize: 18, fontWeight: "900", letterSpacing: 0.5 },
  textLogoRest: { fontSize: 9, fontWeight: "700", letterSpacing: 1.5, marginTop: 2 },
  cardArrow: {
    position: "absolute",
    bottom: 8,
    right: 10,
    opacity: 0.6,
  },
});
