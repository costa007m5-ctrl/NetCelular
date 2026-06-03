import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { ContentCardWithLabel } from "@/components/ContentCard";
import type { ContentItem } from "@/constants/content";

interface ContentRowProps {
  title: string;
  icon?: string;
  items: ContentItem[];
  cardWidth?: number;
  cardHeight?: number;
  showProgress?: boolean;
  showTitles?: boolean;
  seeAllLabel?: string;
  maxItems?: number;
  onSeeAll?: () => void;
  onItemPress?: (item: ContentItem) => void;
}

export function ContentRow({
  title,
  icon,
  items,
  cardWidth = 120,
  cardHeight = 175,
  showProgress = false,
  showTitles = false,
  seeAllLabel = "Ver todos",
  maxItems,
  onSeeAll,
  onItemPress,
}: ContentRowProps) {
  const colors = useColors();
  const displayItems = maxItems ? items.slice(0, maxItems) : items;
  const hasMore = maxItems ? items.length > maxItems : false;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          {icon ? (
            <View style={[styles.iconDot, { backgroundColor: colors.primary }]} />
          ) : null}
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        </View>
        {onSeeAll && (
          <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7}>
            <Text style={[styles.seeAll, { color: colors.mutedForeground }]}>
              {seeAllLabel}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {displayItems.map((item) => (
          <ContentCardWithLabel
            key={item.id}
            item={item}
            width={cardWidth}
            height={cardHeight}
            showProgress={showProgress}
            showTitle={showTitles}
            onPress={onItemPress ? () => onItemPress(item) : undefined}
          />
        ))}
        {hasMore && onSeeAll && (
          <TouchableOpacity
            onPress={onSeeAll}
            activeOpacity={0.8}
            style={[styles.seeMoreCard, { width: cardWidth * 0.7, height: cardHeight }]}
          >
            <View style={[styles.seeMoreInner, { borderColor: "rgba(255,255,255,0.12)" }]}>
              <View style={[styles.seeMoreCircle, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
                <Text style={styles.seeMoreArrow}>›</Text>
              </View>
              <Text style={[styles.seeMoreLabel, { color: "rgba(255,255,255,0.6)" }]}>
                Ver mais
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 32,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconDot: {
    width: 3,
    height: 16,
    borderRadius: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  seeAll: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 0,
  },
  seeMoreCard: {
    marginLeft: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  seeMoreInner: {
    flex: 1,
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  seeMoreCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  seeMoreArrow: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 32,
  },
  seeMoreLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
