import React, { useCallback, useEffect, useMemo } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { ContentCardWithLabel } from "@/components/ContentCard";
import type { ContentItem } from "@/constants/content";
import { preloadImages } from "@/lib/image-preloader";

const ICON_MAP: Record<string, keyof typeof Feather.glyphMap> = {
  fire: "trending-up",
  star: "star",
  play: "play-circle",
  clock: "clock",
  heart: "heart",
  new: "zap",
  award: "award",
  globe: "globe",
  bookmark: "bookmark",
  tv: "tv",
  film: "film",
};

interface ContentRowProps {
  title: string;
  subtitle?: string;
  icon?: string;
  items: ContentItem[];
  cardWidth?: number;
  cardHeight?: number;
  showProgress?: boolean;
  showTitles?: boolean;
  showRating?: boolean;
  seeAllLabel?: string;
  maxItems?: number;
  onSeeAll?: () => void;
  onItemPress?: (item: ContentItem) => void;
  onItemLongPress?: (item: ContentItem) => void;
  accentColor?: string;
}

export const ContentRow = React.memo(function ContentRow({
  title,
  subtitle,
  icon,
  items,
  cardWidth = 120,
  cardHeight = 175,
  showProgress = false,
  showTitles = false,
  showRating = false,
  seeAllLabel = "Ver todos",
  maxItems,
  onSeeAll,
  onItemPress,
  onItemLongPress,
  accentColor,
}: ContentRowProps) {
  const colors = useColors();

  const displayItems = useMemo(
    () => (maxItems ? items.slice(0, maxItems) : items),
    [items, maxItems]
  );
  const hasMore = useMemo(
    () => (maxItems ? items.length > maxItems : false),
    [items.length, maxItems]
  );
  const featherIcon = useMemo(
    () => icon ? (ICON_MAP[icon] ?? (icon as keyof typeof Feather.glyphMap)) : null,
    [icon]
  );
  const accent = accentColor ?? colors.primary;

  const snapInterval = cardWidth + 10;

  useEffect(() => {
    const urls = displayItems
      .slice(0, 8)
      .map((i) => i.posterPath)
      .filter((u): u is string => Boolean(u));
    if (urls.length > 0) preloadImages(urls, "low");
  }, [displayItems]);

  if (displayItems.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.accentBar, { backgroundColor: accent }]} />
          {featherIcon && (
            <View style={[styles.iconWrap, { backgroundColor: `${accent}18` }]}>
              <Feather name={featherIcon} size={13} color={accent} />
            </View>
          )}
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
            {subtitle && (
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
            )}
          </View>
        </View>
        {onSeeAll && (
          <TouchableOpacity
            onPress={onSeeAll}
            activeOpacity={0.7}
            style={[styles.seeAllBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.seeAll, { color: colors.mutedForeground }]}>
              {seeAllLabel}
            </Text>
            <Feather name="chevron-right" size={12} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
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
            onPress={onItemPress ? () => onItemPress(item) : undefined}
            onLongPress={onItemLongPress ? () => onItemLongPress(item) : undefined}
          />
        ))}
        {hasMore && onSeeAll && (
          <TouchableOpacity
            onPress={onSeeAll}
            activeOpacity={0.8}
            style={{ width: cardWidth * 0.65, height: cardHeight, marginLeft: 4 }}
          >
            <View
              style={[
                styles.seeMoreInner,
                { borderColor: colors.borderLight, height: cardHeight, borderRadius: colors.radius },
              ]}
            >
              <View style={[styles.seeMoreCircle, { backgroundColor: `${accent}15`, borderColor: `${accent}30`, borderWidth: 1 }]}>
                <Feather name="chevron-right" size={20} color={accent} />
              </View>
              <Text style={[styles.seeMoreLabel, { color: colors.mutedForeground }]}>
                Ver{"\n"}mais
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 30,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 13,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  accentBar: {
    width: 3,
    height: 18,
    borderRadius: 2,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  seeAll: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 0,
  },
  seeMoreInner: {
    flex: 1,
    width: "100%",
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  seeMoreCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
  },
  seeMoreLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
    textAlign: "center",
  },
});
