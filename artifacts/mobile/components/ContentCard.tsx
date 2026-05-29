import React, { useRef, useState } from "react";
import {
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ContentItem } from "@/constants/content";

interface ContentCardProps {
  item: ContentItem;
  width?: number;
  height?: number;
  showProgress?: boolean;
  onPress?: () => void;
}

function AnimatedCard({
  item,
  width = 120,
  height = 175,
  showProgress = false,
  onPress,
}: ContentCardProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: 0.94,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  };

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View
        style={[
          styles.card,
          { width, height, transform: [{ scale }] },
        ]}
      >
        {!imgError ? (
          <Image
            source={{ uri: item.posterPath }}
            style={[styles.image, { borderRadius: colors.radius }]}
            resizeMode="cover"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        ) : (
          <LinearGradient
            colors={["#1e1e1e", "#2a1a1a"]}
            style={[styles.placeholder, { borderRadius: colors.radius }]}
          >
            <Feather name="film" size={28} color="#444" />
          </LinearGradient>
        )}

        {!imgLoaded && !imgError && (
          <View
            style={[
              styles.loadingOverlay,
              { borderRadius: colors.radius, backgroundColor: "#1e1e1e" },
            ]}
          />
        )}

        {showProgress && item.progress !== undefined && (
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${item.progress * 100}%` as any,
                    backgroundColor: colors.primary,
                  },
                ]}
              />
            </View>
          </View>
        )}

        {item.type === "series" && (
          <View style={[styles.typeBadge, { backgroundColor: "rgba(0,0,0,0.75)" }]}>
            <Text style={styles.typeBadgeText}>SÉRIE</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

export function ContentCard(props: ContentCardProps) {
  return <AnimatedCard {...props} />;
}

interface ContentCardWithLabelProps extends ContentCardProps {
  showTitle?: boolean;
}

export function ContentCardWithLabel({
  item,
  width = 120,
  height = 175,
  showProgress = false,
  showTitle = true,
  onPress,
}: ContentCardWithLabelProps) {
  const colors = useColors();
  return (
    <View style={{ width, marginRight: 12 }}>
      <AnimatedCard
        item={item}
        width={width}
        height={height}
        showProgress={showProgress}
        onPress={onPress}
      />
      {showTitle && (
        <Text
          style={[styles.label, { color: colors.mutedForeground }]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  progressContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  progressTrack: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  typeBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  label: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 6,
    textAlign: "center",
  },
});
