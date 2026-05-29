import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { HeroBanner } from "@/components/HeroBanner";
import { ContentRow } from "@/components/ContentRow";
import { TopTenCard } from "@/components/TopTenCard";
import { SyncBar } from "@/components/SyncBar";
import { SkeletonRow } from "@/components/SkeletonLoader";
import {
  HERO_ITEMS,
  TOP_10_SERIES,
  TRENDING,
  CONTINUE_WATCHING,
  CATEGORIES,
} from "@/constants/content";

const TAB_BAR_CLEARANCE = 100;

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const topPad = isWeb ? 67 : insets.top;

  const [loading, setLoading] = useState(true);
  const [syncProgress, setSyncProgress] = useState(2);
  const [showSync, setShowSync] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showSync) return;
    const interval = setInterval(() => {
      setSyncProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setTimeout(() => setShowSync(false), 600);
          return 100;
        }
        return p + Math.floor(Math.random() * 8) + 3;
      });
    }, 180);
    return () => clearInterval(interval);
  }, [showSync]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
      >
        <View style={{ marginTop: topPad }}>
          <HeroBanner items={HERO_ITEMS} />
        </View>

        <View style={{ paddingTop: 28 }}>
          <View style={styles.categoriesRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setActiveCategory(cat.id)}
                  style={[
                    styles.categoryPill,
                    {
                      backgroundColor:
                        activeCategory === cat.id ? colors.primary : colors.card,
                      borderColor:
                        activeCategory === cat.id ? colors.primary : colors.border,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      {
                        color:
                          activeCategory === cat.id
                            ? "#fff"
                            : colors.mutedForeground,
                      },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : (
            <>
              <ContentRow
                title="Em Alta"
                icon="fire"
                items={TRENDING}
                cardWidth={150}
                cardHeight={210}
                onSeeAll={() => {}}
              />

              <View style={styles.topTenSection}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.redBar, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                    Top 10 Séries
                  </Text>
                  <TouchableOpacity style={styles.seeAllBtn}>
                    <Text style={[styles.seeAllText, { color: colors.mutedForeground }]}>
                      Ver todos
                    </Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.topTenScroll}
                >
                  {TOP_10_SERIES.map((item, i) => (
                    <TopTenCard key={item.id} item={item} rank={i + 1} />
                  ))}
                </ScrollView>
              </View>

              <ContentRow
                title="Continue Assistindo"
                icon="play"
                items={CONTINUE_WATCHING}
                cardWidth={170}
                cardHeight={100}
                showProgress
                onSeeAll={() => {}}
              />

              <ContentRow
                title="Animações e Universos"
                icon="star"
                items={TRENDING.slice(0, 4)}
                cardWidth={130}
                cardHeight={190}
                onSeeAll={() => {}}
              />

              <View style={[styles.hypeBanner, { backgroundColor: colors.card, borderColor: colors.primary }]}>
                <View style={styles.hypeContent}>
                  <View style={[styles.hypeDot, { backgroundColor: colors.primary }]} />
                  <View>
                    <Text style={[styles.hypePercent, { color: colors.foreground }]}>98% Hype</Text>
                    <Text style={[styles.hypeDesc, { color: colors.mutedForeground }]}>
                      Nível de energia da comunidade
                    </Text>
                  </View>
                </View>
              </View>
            </>
          )}
        </View>
      </Animated.ScrollView>

      <Animated.View
        style={[
          styles.header,
          {
            paddingTop: topPad,
            backgroundColor: headerOpacity.interpolate
              ? undefined
              : "transparent",
          },
          { top: 0 },
        ]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.background, opacity: headerOpacity },
          ]}
        />
        <View style={styles.headerContent}>
          <Text style={[styles.logo, { color: colors.primary }]}>NETPLAY</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn}>
              <Feather name="search" size={22} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn}>
              <Feather name="user" size={22} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {showSync && (
        <View style={[styles.syncWrapper, { top: topPad + 52 }]}>
          <SyncBar progress={Math.min(syncProgress, 100)} visible={showSync} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  logo: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 2,
  },
  headerActions: {
    flexDirection: "row",
    gap: 6,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  categoriesRow: {
    marginBottom: 24,
  },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: "600",
  },
  topTenSection: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 14,
    gap: 8,
  },
  redBar: {
    width: 3,
    height: 16,
    borderRadius: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    flex: 1,
    letterSpacing: -0.3,
  },
  seeAllBtn: {},
  seeAllText: {
    fontSize: 12,
    fontWeight: "500",
  },
  topTenScroll: {
    paddingHorizontal: 20,
    gap: 4,
  },
  hypeBanner: {
    marginHorizontal: 20,
    marginBottom: 32,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    borderLeftWidth: 3,
  },
  hypeContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  hypeDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    opacity: 0.9,
  },
  hypePercent: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  hypeDesc: {
    fontSize: 12,
    fontWeight: "400",
    marginTop: 2,
  },
  syncWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
});
