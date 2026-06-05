import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Tag {
  label: string;
  color?: string;
}

interface ContentTagRowProps {
  tags: (string | Tag)[];
  maxTags?: number;
  scrollable?: boolean;
}

function normalizeTag(t: string | Tag): Tag {
  return typeof t === "string" ? { label: t } : t;
}

export function ContentTagRow({ tags, maxTags, scrollable = true }: ContentTagRowProps) {
  const colors = useColors();
  const items = (maxTags ? tags.slice(0, maxTags) : tags).map(normalizeTag);

  const chips = items.map((tag, i) => (
    <View
      key={i}
      style={[
        styles.tag,
        {
          backgroundColor: tag.color ? `${tag.color}14` : colors.muted,
          borderColor: tag.color ? `${tag.color}28` : colors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: tag.color ?? colors.mutedForeground },
        ]}
      >
        {tag.label}
      </Text>
    </View>
  ));

  if (!scrollable) {
    return <View style={styles.wrap}>{chips}</View>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {chips}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  scroll: {
    gap: 6,
    paddingVertical: 2,
  },
  tag: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
