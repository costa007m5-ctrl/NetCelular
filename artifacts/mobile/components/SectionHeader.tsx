import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Feather.glyphMap;
  accentColor?: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  rightContent?: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  isLive?: boolean;
  aiRecommended?: boolean;
  count?: number;
  variant?: "default" | "gradient" | "large" | "inline";
  animatedIcon?: boolean;
}

function LivePulse() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    );
    a.start();
    return () => a.stop();
  }, []);
  return (
    <View style={s.liveBadge}>
      <Animated.View style={[s.liveDot, { opacity: pulse }]} />
      <Text style={s.liveText}>AO VIVO</Text>
    </View>
  );
}

function AIBadge() {
  return (
    <LinearGradient
      colors={["#7c3aed", "#4f46e5"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.aiBadge}
    >
      <Feather name="zap" size={8} color="#fff" />
      <Text style={s.aiText}>IA</Text>
    </LinearGradient>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <View style={s.countBadge}>
      <Text style={s.countText}>{count > 999 ? "999+" : count}</Text>
    </View>
  );
}

function PillBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.pillBadge, { backgroundColor: `${color}22`, borderColor: `${color}44` }]}>
      <Text style={[s.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function SectionHeader({
  title,
  subtitle,
  icon,
  accentColor,
  onSeeAll,
  seeAllLabel = "Ver todos",
  rightContent,
  badge,
  badgeColor,
  isLive,
  aiRecommended,
  count,
  variant = "default",
  animatedIcon,
}: SectionHeaderProps) {
  const colors = useColors();
  const accent = accentColor ?? colors.primary;

  const bounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!animatedIcon) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: -4, duration: 480, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 480, useNativeDriver: true }),
      ])
    );
    a.start();
    return () => a.stop();
  }, [animatedIcon]);

  const badges = (
    <>
      {isLive && <LivePulse />}
      {aiRecommended && <AIBadge />}
      {badge && <PillBadge label={badge} color={badgeColor ?? accent} />}
      {count !== undefined && <CountBadge count={count} />}
    </>
  );

  const seeAllBtn = onSeeAll ? (
    <Pressable
      onPress={onSeeAll}
      style={({ pressed }) => [s.seeAll, { borderColor: colors.borderLight, opacity: pressed ? 0.6 : 1 }]}
    >
      <Text style={[s.seeAllText, { color: colors.mutedForeground }]}>{seeAllLabel}</Text>
      <Feather name="chevron-right" size={12} color={colors.mutedForeground} />
    </Pressable>
  ) : null;

  /* ── Gradient variant ─────────────────────────────────── */
  if (variant === "gradient") {
    return (
      <LinearGradient
        colors={[`${accent}22`, "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={s.gradWrap}
      >
        <View style={s.gradInner}>
          <View style={s.left}>
            {icon && (
              <Animated.View
                style={[s.iconWrap, { backgroundColor: `${accent}30`, transform: [{ translateY: bounce }] }]}
              >
                <Feather name={icon} size={15} color={accent} />
              </Animated.View>
            )}
            <View style={s.textWrap}>
              <View style={s.titleRow}>
                <Text style={[s.titleLarge, { color: colors.foreground }]}>{title}</Text>
                {badges}
              </View>
              {subtitle && (
                <Text style={[s.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
              )}
            </View>
          </View>
          <View style={s.right}>
            {rightContent}
            {seeAllBtn}
          </View>
        </View>
      </LinearGradient>
    );
  }

  /* ── Large variant ────────────────────────────────────── */
  if (variant === "large") {
    return (
      <View style={s.largeContainer}>
        <View style={s.left}>
          {icon && (
            <Animated.View
              style={[s.largeIconWrap, { backgroundColor: `${accent}18`, transform: [{ translateY: bounce }] }]}
            >
              <Feather name={icon} size={18} color={accent} />
            </Animated.View>
          )}
          <View style={s.textWrap}>
            <View style={s.titleRow}>
              <Text style={[s.titleXL, { color: colors.foreground }]}>{title}</Text>
              {badges}
            </View>
            {subtitle && (
              <Text style={[s.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
            )}
          </View>
        </View>
        <View style={s.right}>
          {rightContent}
          {seeAllBtn}
        </View>
      </View>
    );
  }

  /* ── Inline variant (compact, no bar) ────────────────── */
  if (variant === "inline") {
    return (
      <View style={s.inlineContainer}>
        <View style={s.titleRow}>
          {icon && <Feather name={icon} size={12} color={accent} />}
          <Text style={[s.inlineTitle, { color: accent }]}>{title}</Text>
          {badges}
        </View>
        {seeAllBtn}
      </View>
    );
  }

  /* ── Default variant ──────────────────────────────────── */
  return (
    <View style={s.container}>
      <View style={s.left}>
        <View style={[s.bar, { backgroundColor: accent }]} />
        {icon && (
          <Animated.View
            style={[s.iconWrap, { backgroundColor: `${accent}15`, transform: [{ translateY: bounce }] }]}
          >
            <Feather name={icon} size={14} color={accent} />
          </Animated.View>
        )}
        <View style={s.textWrap}>
          <View style={s.titleRow}>
            <Text style={[s.title, { color: colors.foreground }]}>{title}</Text>
            {badges}
          </View>
          {subtitle && (
            <Text style={[s.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
          )}
        </View>
      </View>
      <View style={s.right}>
        {rightContent}
        {seeAllBtn}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20, marginBottom: 14,
  },
  gradWrap: { paddingHorizontal: 20, paddingVertical: 12, marginBottom: 6 },
  gradInner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  largeContainer: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20, marginBottom: 16,
  },
  inlineContainer: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20, marginBottom: 10,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
  bar: { width: 3, height: 20, borderRadius: 2 },
  iconWrap: {
    width: 28, height: 28, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  largeIconWrap: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  textWrap: { gap: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  title: { fontSize: 17, fontWeight: "700", letterSpacing: -0.4 },
  titleLarge: { fontSize: 18, fontWeight: "800", letterSpacing: -0.5 },
  titleXL: { fontSize: 20, fontWeight: "900", letterSpacing: -0.6 },
  inlineTitle: { fontSize: 13, fontWeight: "700", letterSpacing: 0.2 },
  subtitle: { fontSize: 11, fontWeight: "500" },
  seeAll: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  seeAllText: { fontSize: 11, fontWeight: "600" },
  liveBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(229,9,20,0.9)",
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
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2,
  },
  countText: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "700" },
});
