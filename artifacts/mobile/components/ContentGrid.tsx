import React, { useCallback } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { ContentCard } from "./ContentCard";
import { EmptyState } from "./EmptyState";
import { SkeletonRow } from "./SkeletonLoader";
import type { ContentItem } from "@/constants/content";

interface ContentGridProps {
  items: ContentItem[];
  loading?: boolean;
  numColumns?: number;
  cardWidth?: number;
  cardHeight?: number;
  showRating?: boolean;
  showProgress?: boolean;
  onItemPress?: (item: ContentItem) => void;
  onItemLongPress?: (item: ContentItem) => void;
  onEndReached?: () => void;
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyIcon?: any;
  style?: any;
  contentContainerStyle?: any;
  headerComponent?: React.ReactElement;
  footerComponent?: React.ReactElement;
}

export function ContentGrid({
  items,
  loading = false,
  numColumns = 3,
  cardWidth,
  cardHeight,
  showRating = false,
  showProgress = false,
  onItemPress,
  onItemLongPress,
  onEndReached,
  emptyTitle = "Nenhum conteúdo",
  emptySubtitle,
  emptyIcon = "film",
  style,
  contentContainerStyle,
  headerComponent,
  footerComponent,
}: ContentGridProps) {
  const renderItem = useCallback(({ item }: { item: ContentItem }) => (
    <View style={styles.item}>
      <ContentCard
        item={item}
        width={cardWidth}
        height={cardHeight}
        showRating={showRating}
        showProgress={showProgress}
        onPress={onItemPress ? () => onItemPress(item) : undefined}
        onLongPress={onItemLongPress ? () => onItemLongPress(item) : undefined}
      />
    </View>
  ), [cardWidth, cardHeight, showRating, showProgress, onItemPress, onItemLongPress]);

  const keyExtractor = useCallback((item: ContentItem) => item.id, []);

  if (loading) {
    return (
      <View>
        {headerComponent}
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View>
        {headerComponent}
        <EmptyState icon={emptyIcon} title={emptyTitle} subtitle={emptySubtitle} />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      numColumns={numColumns}
      keyExtractor={keyExtractor}
      style={style}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
      ListHeaderComponent={headerComponent}
      ListFooterComponent={footerComponent}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      showsVerticalScrollIndicator={false}
      renderItem={renderItem}
      initialNumToRender={9}
      maxToRenderPerBatch={9}
      windowSize={5}
      removeClippedSubviews={Platform.OS !== "web"}
      updateCellsBatchingPeriod={50}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 120,
    gap: 12,
  },
  row: {
    gap: 10,
    justifyContent: "flex-start",
  },
  item: {
    flex: 1,
    alignItems: "center",
  },
});
