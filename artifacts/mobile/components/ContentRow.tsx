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
  onSeeAll?: () => void;
}

export function ContentRow({
  title,
  icon,
  items,
  cardWidth = 120,
  cardHeight = 175,
  showProgress = false,
  showTitles = false,
  onSeeAll,
}: ContentRowProps) {
  const colors = useColors();

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
              Ver todos
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {items.map((item) => (
          <ContentCardWithLabel
            key={item.id}
            item={item}
            width={cardWidth}
            height={cardHeight}
            showProgress={showProgress}
            showTitle={showTitles}
          />
        ))}
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
});
