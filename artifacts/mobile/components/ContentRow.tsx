import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { ContentCardWithLabel, ContentCard } from "@/components/ContentCard";
import type { ContentItem } from "@/constants/content";
import { preloadImages } from "@/lib/image-preloader";

export type RowLayout =
  | "poster"       // default vertical poster scroll
  | "backdrop"     // 16:9 landscape scroll
  | "featured"     // tall cinematic cards
  | "spotlight"    // wide card with side info
  | "mini-list"    // compact vertical stacked list
  | "square"       // 1:1 square cards
  | "ranked";      // cards with rank numbers

const ICON_MAP: Record<string, keyof typeof Feather.glyphMap> = {
  fire: "trending-up", star: "star", play: "play-circle",
  clock: "clock", heart: "heart", new: "zap", award: "award",
  globe: "globe", bookmark: "bookmark", tv: "tv", film: "film",
  trending: "trending-up", layers: "layers", hash: "hash",
  users: "users", grid: "grid", sun: "sun", "play-circle": "play-circle",
  "trending-up": "trending-up",
};

export interface ContentRowProps {
  title: string;
  subtitle?: string;
  icon?: string;
  items: ContentItem[];
  layout?: RowLayout;
  cardWidth?: number;
  cardHeight?: number;
  showProgress?: boolean;
  showTitles?: boolean;
  showRating?: boolean;
  showMatchScore?: boolean;
  seeAllLabel?: string;
  maxItems?: number;
  onSeeAll?: () => void;
  onItemPress?: (item: ContentItem) => void;
  onItemLongPress?: (item: ContentItem) => void;
  accentColor?: string;
  badge?: string;
  badgeColor?: string;
  isLive?: boolean;
  aiRecommended?: boolean;
  count?: number;
  featuredFirst?: boolean;
  headerVariant?: "default" | "gradient" | "plain";
}

// ─── Skeleton loading row ─────────────────────────────────────────────────────
function SkeletonRow({ cardWidth, cardHeight, count = 5 }: { cardWidth: number; cardHeight: number; count?: number }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    a.start();
    return () => a.stop();
  }, []);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.45] });

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }} scrollEnabled={false}>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View
          key={i}
          style={{
            width: cardWidth, height: cardHeight,
            borderRadius: 12, backgroundColor: "#1e1530",
            opacity,
          }}
        />
      ))}
    </ScrollView>
  );
}

// ─── Section header variants ──────────────────────────────────────────────────
function RowHeader({
  title, subtitle, icon, accentColor, onSeeAll, seeAllLabel,
  badge, badgeColor, isLive, aiRecommended, count, headerVariant = "default",
}: Pick<ContentRowProps, "title" | "subtitle" | "icon" | "accentColor" | "onSeeAll" | "seeAllLabel" | "badge" | "badgeColor" | "isLive" | "aiRecommended" | "count" | "headerVariant">) {
  const colors = useColors();
  const accent = accentColor ?? colors.primary;
  const featherIcon = icon ? (ICON_MAP[icon] ?? (icon as keyof typeof Feather.glyphMap)) : null;

  // Animated trending icon
  const bounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (icon === "fire" || icon === "trending" || icon === "trending-up") {
      const a = Animated.loop(
        Animated.sequence([
          Animated.timing(bounce, { toValue: -3, duration: 500, useNativeDriver: true }),
          Animated.timing(bounce, { toValue: 0, duration: 500, useNativeDriver: true }),
        ])
      );
      a.start();
      return () => a.stop();
    }
  }, [icon]);

  if (headerVariant === "gradient") {
    return (
      <LinearGradient
        colors={[`${accent}18`, "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[rh.gradientContainer]}
      >
        <View style={rh.inner}>
          <View style={rh.left}>
            {featherIcon && (
              <Animated.View style={[rh.iconWrap, { backgroundColor: `${accent}28`, transform: [{ translateY: bounce }] }]}>
                <Feather name={featherIcon} size={15} color={accent} />
              </Animated.View>
            )}
            <View>
              <View style={rh.titleRow}>
                <Text style={[rh.title, { color: colors.foreground }]}>{title}</Text>
                {isLive && <LiveBadge />}
                {aiRecommended && <AIBadge />}
                {badge && <PillBadge label={badge} color={badgeColor ?? accent} />}
                {count !== undefined && <CountBadge count={count} />}
              </View>
              {subtitle && <Text style={[rh.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>}
            </View>
          </View>
          {onSeeAll && <SeeAllBtn onPress={onSeeAll} label={seeAllLabel ?? "Ver todos"} colors={colors} />}
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={rh.container}>
      <View style={rh.left}>
        <View style={[rh.accentBar, { backgroundColor: accent }]} />
        {featherIcon && (
          <Animated.View style={[rh.iconWrap, { backgroundColor: `${accent}18`, transform: [{ translateY: bounce }] }]}>
            <Feather name={featherIcon} size={13} color={accent} />
          </Animated.View>
        )}
        <View>
          <View style={rh.titleRow}>
            <Text style={[rh.title, { color: colors.foreground }]}>{title}</Text>
            {isLive && <LiveBadge />}
            {aiRecommended && <AIBadge />}
            {badge && <PillBadge label={badge} color={badgeColor ?? accent} />}
            {count !== undefined && <CountBadge count={count} />}
          </View>
          {subtitle && <Text style={[rh.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>}
        </View>
      </View>
      {onSeeAll && <SeeAllBtn onPress={onSeeAll} label={seeAllLabel ?? "Ver todos"} colors={colors} />}
    </View>
  );
}

function LiveBadge() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    a.start();
    return () => a.stop();
  }, []);
  return (
    <View style={rh.liveBadge}>
      <Animated.View style={[rh.liveDot, { opacity: pulse }]} />
      <Text style={rh.liveText}>AO VIVO</Text>
    </View>
  );
}

function AIBadge() {
  return (
    <LinearGradient colors={["#7c3aed", "#4f46e5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={rh.aiBadge}>
      <Feather name="zap" size={8} color="#fff" />
      <Text style={rh.aiText}>IA</Text>
    </LinearGradient>
  );
}

function PillBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[rh.pillBadge, { backgroundColor: `${color}22`, borderColor: `${color}44` }]}>
      <Text style={[rh.pillText, { color }]}>{label}</Text>
    </View>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <View style={rh.countBadge}>
      <Text style={rh.countText}>{count > 999 ? "999+" : count}</Text>
    </View>
  );
}

function SeeAllBtn({ onPress, label, colors }: { onPress: () => void; label: string; colors: any }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[rh.seeAllBtn, { borderColor: colors.border }]}
    >
      <Text style={[rh.seeAllText, { color: colors.mutedForeground }]}>{label}</Text>
      <Feather name="chevron-right" size={12} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

// ─── See-more card at end of row ──────────────────────────────────────────────
function SeeMoreCard({ height, accent, colors, onPress }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 28, bounciness: 4 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 5 }).start()}
    >
      <Animated.View style={[sm.card, { height, borderColor: colors.borderLight, borderRadius: colors.radius, transform: [{ scale }] }]}>
        <View style={[sm.circle, { backgroundColor: `${accent}15`, borderColor: `${accent}30` }]}>
          <Feather name="chevron-right" size={22} color={accent} />
        </View>
        <Text style={[sm.label, { color: colors.mutedForeground }]}>{"Ver\nmais"}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Mini-list layout (no scroll, stacked vertically) ─────────────────────────
function MiniListRow({ items, onItemPress, onItemLongPress, maxItems }: {
  items: ContentItem[];
  onItemPress?: (i: ContentItem) => void;
  onItemLongPress?: (i: ContentItem) => void;
  maxItems?: number;
}) {
  const displayItems = maxItems ? items.slice(0, maxItems) : items.slice(0, 5);
  const colors = useColors();
  return (
    <View style={{ paddingHorizontal: 16, gap: 0 }}>
      {displayItems.map((item, idx) => (
        <View key={item.id}>
          <ContentCard
            item={item}
            variant="mini"
            width={undefined}
            onPress={onItemPress ? () => onItemPress(item) : undefined}
            onLongPress={onItemLongPress ? () => onItemLongPress(item) : undefined}
          />
          {idx < displayItems.length - 1 && (
            <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginLeft: 84 }} />
          )}
        </View>
      ))}
    </View>
  );
}

// ─── Ranked cards row ─────────────────────────────────────────────────────────
function RankedRow({ items, cardWidth, cardHeight, onItemPress, onItemLongPress, maxItems, showRating }: {
  items: ContentItem[];
  cardWidth: number;
  cardHeight: number;
  onItemPress?: (i: ContentItem) => void;
  onItemLongPress?: (i: ContentItem) => void;
  maxItems?: number;
  showRating?: boolean;
}) {
  const displayItems = maxItems ? items.slice(0, maxItems) : items;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
      decelerationRate="fast"
    >
      {displayItems.map((item, idx) => (
        <ContentCardWithLabel
          key={item.id}
          item={item}
          width={cardWidth}
          height={cardHeight}
          rank={idx + 1}
          showBadge
          showRating={showRating}
          onPress={onItemPress ? () => onItemPress(item) : undefined}
          onLongPress={onItemLongPress ? () => onItemLongPress(item) : undefined}
        />
      ))}
    </ScrollView>
  );
}

// ─── Featured-first layout: 1st card is larger ────────────────────────────────
function FeaturedFirstRow({ items, cardWidth, cardHeight, onItemPress, onItemLongPress, showRating, showProgress, accentColor }: {
  items: ContentItem[];
  cardWidth: number;
  cardHeight: number;
  onItemPress?: (i: ContentItem) => void;
  onItemLongPress?: (i: ContentItem) => void;
  showRating?: boolean;
  showProgress?: boolean;
  accentColor?: string;
}) {
  if (items.length === 0) return null;
  const [first, ...rest] = items;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
      decelerationRate="fast"
    >
      {/* Featured first card — taller */}
      <ContentCard
        item={first}
        variant="featured"
        width={cardWidth * 1.4}
        height={cardHeight * 1.25}
        showRating={showRating}
        showProgress={showProgress}
        showBadge
        accentColor={accentColor}
        onPress={onItemPress ? () => onItemPress(first) : undefined}
        onLongPress={onItemLongPress ? () => onItemLongPress(first) : undefined}
      />
      {/* Rest as normal cards */}
      {rest.map((item) => (
        <ContentCardWithLabel
          key={item.id}
          item={item}
          width={cardWidth}
          height={cardHeight}
          showRating={showRating}
          showProgress={showProgress}
          showBadge
          accentColor={accentColor}
          onPress={onItemPress ? () => onItemPress(item) : undefined}
          onLongPress={onItemLongPress ? () => onItemLongPress(item) : undefined}
        />
      ))}
    </ScrollView>
  );
}

// ─── Backdrop row ─────────────────────────────────────────────────────────────
function BackdropRow({ items, cardWidth, cardHeight, onItemPress, onItemLongPress, showProgress, onSeeAll, hasMore, accentColor, colors }: any) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
      decelerationRate="fast"
      snapToInterval={cardWidth + 12}
      snapToAlignment="start"
    >
      {items.map((item: ContentItem) => (
        <ContentCard
          key={item.id}
          item={item}
          variant="backdrop"
          width={cardWidth}
          height={cardHeight}
          showProgress={showProgress}
          showBadge
          accentColor={accentColor}
          onPress={onItemPress ? () => onItemPress(item) : undefined}
          onLongPress={onItemLongPress ? () => onItemLongPress(item) : undefined}
        />
      ))}
      {hasMore && onSeeAll && (
        <SeeMoreCard height={cardHeight} accent={accentColor ?? "#e50914"} colors={colors} onPress={onSeeAll} />
      )}
    </ScrollView>
  );
}

// ─── Spotlight row (one at a time, centered) ─────────────────────────────────
function SpotlightRow({ items, cardWidth, cardHeight, onItemPress, onItemLongPress }: any) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
      decelerationRate="fast"
      snapToInterval={cardWidth + 12}
    >
      {items.map((item: ContentItem) => (
        <ContentCard
          key={item.id}
          item={item}
          variant="spotlight"
          width={cardWidth}
          height={cardHeight}
          showBadge
          onPress={onItemPress ? () => onItemPress(item) : undefined}
          onLongPress={onItemLongPress ? () => onItemLongPress(item) : undefined}
        />
      ))}
    </ScrollView>
  );
}

// ─── Square row ───────────────────────────────────────────────────────────────
function SquareRow({ items, cardWidth, onItemPress, onItemLongPress, showProgress }: any) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
      decelerationRate="fast"
    >
      {items.map((item: ContentItem) => (
        <ContentCard
          key={item.id}
          item={item}
          variant="square"
          width={cardWidth}
          showBadge
          showProgress={showProgress}
          onPress={onItemPress ? () => onItemPress(item) : undefined}
          onLongPress={onItemLongPress ? () => onItemLongPress(item) : undefined}
        />
      ))}
    </ScrollView>
  );
}

// ─── Main ContentRow ──────────────────────────────────────────────────────────
export const ContentRow = React.memo(function ContentRow({
  title, subtitle, icon, items, layout = "poster",
  cardWidth: cw, cardHeight: ch,
  showProgress = false, showTitles = false, showRating = false, showMatchScore = false,
  seeAllLabel = "Ver todos", maxItems, onSeeAll, onItemPress, onItemLongPress,
  accentColor, badge, badgeColor, isLive, aiRecommended, count,
  featuredFirst = false, headerVariant = "default",
}: ContentRowProps) {
  const colors = useColors();
  const accent = accentColor ?? colors.primary;

  // Default dimensions per layout
  const cardWidth  = cw  ?? (layout === "backdrop" ? 260 : layout === "spotlight" ? 300 : layout === "square" ? 130 : layout === "featured" ? 170 : 118);
  const cardHeight = ch  ?? (layout === "backdrop" ? 148 : layout === "spotlight" ? 168 : layout === "square" ? 130 : layout === "featured" ? 240 : 170);

  const displayItems = useMemo(
    () => (maxItems ? items.slice(0, maxItems) : items),
    [items, maxItems]
  );
  const hasMore = useMemo(() => (maxItems ? items.length > maxItems : false), [items.length, maxItems]);
  const snapInterval = cardWidth + 10;

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const urls = displayItems.slice(0, 8).map((i) => i.posterPath).filter((u): u is string => Boolean(u));
    if (urls.length > 0) preloadImages(urls, "low");
  }, [displayItems]);

  if (displayItems.length === 0) return null;

  return (
    <View style={cr.container}>
      <RowHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        accentColor={accent}
        onSeeAll={onSeeAll}
        seeAllLabel={seeAllLabel}
        badge={badge}
        badgeColor={badgeColor}
        isLive={isLive}
        aiRecommended={aiRecommended}
        count={count}
        headerVariant={headerVariant}
      />

      {/* Mini list — vertical stacked */}
      {layout === "mini-list" && (
        <MiniListRow
          items={displayItems}
          onItemPress={onItemPress}
          onItemLongPress={onItemLongPress}
          maxItems={maxItems}
        />
      )}

      {/* Backdrop horizontal scroll */}
      {layout === "backdrop" && (
        <BackdropRow
          items={displayItems}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          onItemPress={onItemPress}
          onItemLongPress={onItemLongPress}
          showProgress={showProgress}
          onSeeAll={onSeeAll}
          hasMore={hasMore}
          accentColor={accent}
          colors={colors}
        />
      )}

      {/* Spotlight */}
      {layout === "spotlight" && (
        <SpotlightRow
          items={displayItems}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          onItemPress={onItemPress}
          onItemLongPress={onItemLongPress}
        />
      )}

      {/* Square */}
      {layout === "square" && (
        <SquareRow
          items={displayItems}
          cardWidth={cardWidth}
          onItemPress={onItemPress}
          onItemLongPress={onItemLongPress}
          showProgress={showProgress}
        />
      )}

      {/* Ranked */}
      {layout === "ranked" && (
        <RankedRow
          items={displayItems}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          onItemPress={onItemPress}
          onItemLongPress={onItemLongPress}
          maxItems={maxItems}
          showRating={showRating}
        />
      )}

      {/* Featured (tall cinematic) */}
      {layout === "featured" && !featuredFirst && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
          decelerationRate="fast"
          snapToInterval={cardWidth + 10}
        >
          {displayItems.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              variant="featured"
              width={cardWidth}
              height={cardHeight}
              showRating={showRating}
              showBadge
              accentColor={accent}
              onPress={onItemPress ? () => onItemPress(item) : undefined}
              onLongPress={onItemLongPress ? () => onItemLongPress(item) : undefined}
            />
          ))}
          {hasMore && onSeeAll && (
            <SeeMoreCard height={cardHeight} accent={accent} colors={colors} onPress={onSeeAll} />
          )}
        </ScrollView>
      )}

      {/* Featured-first hybrid */}
      {layout === "featured" && featuredFirst && (
        <FeaturedFirstRow
          items={displayItems}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          onItemPress={onItemPress}
          onItemLongPress={onItemLongPress}
          showRating={showRating}
          showProgress={showProgress}
          accentColor={accent}
        />
      )}

      {/* Default poster layout */}
      {layout === "poster" && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={cr.scrollContent}
          decelerationRate="fast"
          snapToInterval={snapInterval}
          snapToAlignment="start"
          removeClippedSubviews={Platform.OS !== "web"}
        >
          {displayItems.map((item) => (
            <ContentCardWithLabel
              key={item.id}
              item={item}
              width={cardWidth}
              height={cardHeight}
              showProgress={showProgress}
              showTitle={showTitles}
              showRating={showRating}
              showMatchScore={showMatchScore}
              showBadge
              accentColor={accent}
              onPress={onItemPress ? () => onItemPress(item) : undefined}
              onLongPress={onItemLongPress ? () => onItemLongPress(item) : undefined}
            />
          ))}
          {hasMore && onSeeAll && (
            <SeeMoreCard height={cardHeight} accent={accent} colors={colors} onPress={onSeeAll} />
          )}
        </ScrollView>
      )}
    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const rh = StyleSheet.create({
  container: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20, marginBottom: 13,
  },
  gradientContainer: {
    paddingHorizontal: 20, paddingVertical: 10,
    marginBottom: 6,
    borderRadius: 0,
  },
  inner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  left: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  accentBar: { width: 3, height: 20, borderRadius: 2 },
  iconWrap: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  title: { fontSize: 17, fontWeight: "700", letterSpacing: -0.4 },
  subtitle: { fontSize: 11, fontWeight: "500", marginTop: 1 },
  seeAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  seeAllText: { fontSize: 11, fontWeight: "600", letterSpacing: 0.1 },
  liveBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(229,9,20,0.88)",
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff" },
  liveText: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  aiBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
  },
  aiText: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  pillBadge: {
    borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  pillText: { fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  countBadge: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2,
  },
  countText: { color: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: "700" },
});

const cr = StyleSheet.create({
  container: { marginBottom: 30 },
  scrollContent: { paddingHorizontal: 20, gap: 0 },
});

const sm = StyleSheet.create({
  card: {
    width: 72,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.02)",
    marginLeft: 4,
  },
  circle: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1,
  },
  label: { fontSize: 11, fontWeight: "600", letterSpacing: 0.3, textAlign: "center" },
});
