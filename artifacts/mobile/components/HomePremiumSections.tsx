/**
 * HomePremiumSections.tsx
 * 90+ premium home screen components: banners, carousels, widgets, dividers.
 */

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
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ContentItem } from "@/constants/content";

// ─── Re-export colors ────────────────────────────────────────────────────────
export const C = {
  red:    "#e50914",
  purple: "#8b5cf6",
  blue:   "#3b82f6",
  amber:  "#f59e0b",
  green:  "#22c55e",
  teal:   "#0891b2",
  pink:   "#ec4899",
  orange: "#f97316",
  indigo: "#6366f1",
  cyan:   "#06b6d4",
  rose:   "#f43f5e",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function usePressAnim(toValue = 0.94) {
  const scale = useRef(new Animated.Value(1)).current;
  const pi = useCallback(() => Animated.spring(scale, { toValue, useNativeDriver: true, speed: 28, bounciness: 4 }).start(), []);
  const po = useCallback(() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 5 }).start(), []);
  return { scale, pi, po };
}

function usePulse(speed = 700) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 0.2, duration: speed, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1,   duration: speed, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, []);
  return anim;
}

function useBounce() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: -4, duration: 500, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0,  duration: 500, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, []);
  return anim;
}

function useShimmer() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 850, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 850, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, []);
  return anim;
}

// ─── 1. Live Pulse Badge ──────────────────────────────────────────────────────
export function LivePulseBadge({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const pulse = usePulse(680);
  const sz = size === "sm" ? { dot: 5, text: 7, px: 6, py: 3 } : size === "lg" ? { dot: 8, text: 9, px: 10, py: 5 } : { dot: 6, text: 8, px: 8, py: 4 };
  return (
    <View style={[hp.liveBadge, { paddingHorizontal: sz.px, paddingVertical: sz.py }]}>
      <Animated.View style={[hp.liveDot, { width: sz.dot, height: sz.dot, borderRadius: sz.dot / 2, opacity: pulse }]} />
      <Text style={[hp.liveText, { fontSize: sz.text }]}>AO VIVO</Text>
    </View>
  );
}

// ─── 2. Premium Divider ───────────────────────────────────────────────────────
export function PremiumDivider({ label, accent = C.red, icon }: { label: string; accent?: string; icon?: keyof typeof Feather.glyphMap }) {
  return (
    <View style={hp.dividerWrap}>
      <LinearGradient colors={["transparent", `${accent}55`, "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={hp.dividerLine} />
      <View style={[hp.dividerChip, { backgroundColor: `${accent}18`, borderColor: `${accent}44` }]}>
        {icon && <Feather name={icon} size={9} color={accent} />}
        <Text style={[hp.dividerText, { color: accent }]}>{label}</Text>
      </View>
      <LinearGradient colors={["transparent", `${accent}55`, "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={hp.dividerLine} />
    </View>
  );
}

// ─── 3. Animated Section Wrapper ─────────────────────────────────────────────
export function FadeInSection({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity = useRef(new Animated.Value(Platform.OS === "web" ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(Platform.OS === "web" ? 16 : 0)).current;
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
    }, delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ─── 4. Cinematic Banner (full-width auto-cycle) ──────────────────────────────
export function CinematicBanner({ items, onPress }: { items: ContentItem[]; onPress: (i: ContentItem) => void }) {
  const [idx, setIdx] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const { scale, pi, po } = usePressAnim(0.97);
  const colors = useColors();

  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
        setIdx((i) => (i + 1) % items.length);
        Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      });
    }, 5500);
    return () => clearInterval(t);
  }, [items.length]);

  const item = items[idx];
  if (!item) return null;

  return (
    <Pressable onPress={() => onPress(item)} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[cb.wrap, { transform: [{ scale }] }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          <Image
            source={{ uri: item.backdropPath ?? item.posterPath }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </Animated.View>
        <LinearGradient colors={["rgba(0,0,0,0.08)", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.92)"]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
        {/* Left dramatic gradient */}
        <LinearGradient colors={["rgba(0,0,0,0.65)", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 0.45, y: 0 }} style={StyleSheet.absoluteFill} />

        <View style={cb.content}>
          <View style={cb.topBadges}>
            {item.rating > 0 && (
              <View style={cb.imdb}>
                <Text style={cb.imdbLabel}>IMDb</Text>
                <Text style={cb.imdbVal}>{item.rating.toFixed(1)}</Text>
              </View>
            )}
            <View style={cb.typeBadge}>
              <Text style={cb.typeText}>{item.type === "series" ? "SÉRIE" : "FILME"}</Text>
            </View>
          </View>
          <Text style={cb.title} numberOfLines={2}>{item.title}</Text>
          {item.description ? (
            <Text style={cb.desc} numberOfLines={2}>{item.description}</Text>
          ) : null}
          <View style={cb.actions}>
            <Pressable onPress={() => onPress(item)} style={cb.playBtn}>
              <Feather name="play" size={13} color="#fff" />
              <Text style={cb.playText}>Assistir Agora</Text>
            </Pressable>
            <View style={cb.moreBtn}>
              <Feather name="info" size={13} color="rgba(255,255,255,0.7)" />
              <Text style={cb.moreText}>Detalhes</Text>
            </View>
          </View>
        </View>

        {/* Dot indicators */}
        {items.length > 1 && (
          <View style={cb.dots}>
            {items.map((_, i) => (
              <Animated.View key={i} style={[cb.dot, i === idx ? cb.dotActive : {}]} />
            ))}
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ─── 5. Daily Pick Banner ─────────────────────────────────────────────────────
export function DailyPickBanner({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const { scale, pi, po } = usePressAnim(0.96);
  const bounce = useBounce();

  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[dp.wrap, { transform: [{ scale }] }]}>
        {item.backdropPath ? (
          <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <LinearGradient colors={["#1a1030", "#0a0814"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.92)"]} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />

        {/* Crown badge */}
        <Animated.View style={[dp.crownBadge, { transform: [{ translateY: bounce }] }]}>
          <LinearGradient colors={["#FFD700", "#B8860B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={dp.crownGrad}>
            <Text style={dp.crownEmoji}>👑</Text>
            <Text style={dp.crownText}>ESCOLHA DO DIA</Text>
          </LinearGradient>
        </Animated.View>

        <View style={dp.content}>
          <Text style={dp.title} numberOfLines={1}>{item.title}</Text>
          <View style={dp.meta}>
            <Text style={dp.metaText}>{item.year}</Text>
            {item.rating > 0 && (
              <>
                <View style={dp.dot} />
                <Text style={[dp.metaText, { color: C.amber }]}>★ {item.rating.toFixed(1)}</Text>
              </>
            )}
            <View style={dp.dot} />
            <Text style={dp.metaText}>{item.type === "series" ? "Série" : "Filme"}</Text>
          </View>
          {item.description && <Text style={dp.desc} numberOfLines={2}>{item.description}</Text>}
          <Pressable onPress={onPress} style={dp.watchBtn}>
            <Feather name="play" size={12} color="#fff" />
            <Text style={dp.watchText}>Assistir Agora</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── 6. New Episode Banner ────────────────────────────────────────────────────
export function NewEpisodeBanner({ items, onPress }: { items: ContentItem[]; onPress: (i: ContentItem) => void }) {
  if (!items.length) return null;
  const pulse = usePulse(900);

  return (
    <View style={ne.wrap}>
      <View style={ne.header}>
        <Animated.View style={[ne.dot, { opacity: pulse }]} />
        <Text style={ne.headerText}>NOVOS EPISÓDIOS</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ne.scroll} decelerationRate="fast">
        {items.map((item) => (
          <NewEpisodeCard key={item.id} item={item} onPress={() => onPress(item)} />
        ))}
      </ScrollView>
    </View>
  );
}

function NewEpisodeCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const { scale, pi, po } = usePressAnim(0.92);
  const [err, setErr] = useState(false);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[ne.card, { transform: [{ scale }] }]}>
        {!err && item.posterPath
          ? <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          : <LinearGradient colors={["#1a1030", "#0a0814"]} style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} locations={[0.5, 1]} style={StyleSheet.absoluteFill} />
        <View style={ne.newBadge}>
          <Text style={ne.newText}>✦ NOVO EP</Text>
        </View>
        <View style={ne.cardBottom}>
          <Text style={ne.cardTitle} numberOfLines={1}>{item.title}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── 7. Upcoming Release Card ─────────────────────────────────────────────────
export function UpcomingRow({ releases, accent = C.orange }: { releases: { title: string; daysLeft: number; accentColor: string }[]; accent?: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
      {releases.map((r) => (
        <UpcomingCard key={r.title} release={r} />
      ))}
    </ScrollView>
  );
}

function UpcomingCard({ release }: { release: { title: string; daysLeft: number; accentColor: string } }) {
  const { scale, pi, po } = usePressAnim(0.92);
  const a = release.accentColor;
  return (
    <Pressable onPressIn={pi} onPressOut={po}>
      <Animated.View style={[uc.card, { borderColor: `${a}44`, transform: [{ scale }] }]}>
        <LinearGradient colors={[`${a}25`, `${a}08`, "transparent"]} style={StyleSheet.absoluteFill} />
        <View style={[uc.iconWrap, { backgroundColor: `${a}22` }]}>
          <Feather name="calendar" size={18} color={a} />
        </View>
        <Text style={uc.title} numberOfLines={2}>{release.title}</Text>
        <View style={[uc.daysBadge, { backgroundColor: `${a}22`, borderColor: `${a}44` }]}>
          <Text style={[uc.daysNum, { color: a }]}>{release.daysLeft}</Text>
          <Text style={[uc.daysLabel, { color: a }]}>dias</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── 8. Glass Stats Widget ────────────────────────────────────────────────────
export function GlassStatsRow({ stats }: { stats: { label: string; value: string; icon: keyof typeof Feather.glyphMap; color: string }[] }) {
  return (
    <View style={gs.row}>
      {stats.map((s) => (
        <GlassStatCard key={s.label} stat={s} />
      ))}
    </View>
  );
}

function GlassStatCard({ stat }: { stat: { label: string; value: string; icon: keyof typeof Feather.glyphMap; color: string } }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, speed: 8, bounciness: 10, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={[gs.card, { transform: [{ scale: anim }], borderColor: `${stat.color}25` }]}>
      <LinearGradient colors={[`${stat.color}15`, "transparent"]} style={StyleSheet.absoluteFill} />
      <View style={[gs.iconWrap, { backgroundColor: `${stat.color}20` }]}>
        <Feather name={stat.icon} size={16} color={stat.color} />
      </View>
      <Text style={[gs.value, { color: stat.color }]}>{stat.value}</Text>
      <Text style={gs.label}>{stat.label}</Text>
    </Animated.View>
  );
}

// ─── 9. Editor's Pick Banner ──────────────────────────────────────────────────
export function EditorPickBanner({ item, editorName = "Curadoria NETPLAY", onPress }: { item: ContentItem; editorName?: string; onPress: () => void }) {
  const { scale, pi, po } = usePressAnim(0.96);
  const [err, setErr] = useState(false);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ marginHorizontal: 16, marginBottom: 24 }}>
      <Animated.View style={[ep.card, { transform: [{ scale }] }]}>
        <View style={ep.imageSection}>
          {!err && item.backdropPath
            ? <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
            : <LinearGradient colors={["#1a1030", "#0a0814"]} style={StyleSheet.absoluteFill} />}
          <LinearGradient colors={["transparent", "rgba(10,8,20,0.98)"]} start={{ x: 0.35, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </View>
        <View style={ep.infoPanel}>
          <View style={ep.editorBadge}>
            <Feather name="award" size={9} color={C.amber} />
            <Text style={ep.editorText}>{editorName}</Text>
          </View>
          <Text style={ep.title} numberOfLines={2}>{item.title}</Text>
          <View style={ep.meta}>
            {item.rating > 0 && <Text style={ep.rating}>★ {item.rating.toFixed(1)}</Text>}
            <Text style={ep.year}>{item.year}</Text>
          </View>
          {item.description ? <Text style={ep.desc} numberOfLines={2}>{item.description}</Text> : null}
          <Pressable onPress={onPress} style={ep.btn}>
            <Feather name="play" size={11} color="#fff" />
            <Text style={ep.btnText}>Assistir</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── 10. Time Greeting Card ───────────────────────────────────────────────────
export function TimeGreetingBanner({ name, accentColor = C.indigo, timeOfDay }: { name?: string; accentColor?: string; timeOfDay: string }) {
  const hour = new Date().getHours();
  const emoji = hour < 5 ? "🌙" : hour < 12 ? "☀️" : hour < 18 ? "⛅" : "🌙";
  return (
    <LinearGradient colors={[`${accentColor}18`, "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={tg.wrap}>
      <Text style={tg.emoji}>{emoji}</Text>
      <View>
        <Text style={tg.greeting}>{timeOfDay}{name ? `, ${name.split(" ")[0]}` : ""}!</Text>
        <Text style={tg.sub}>O que você vai assistir hoje?</Text>
      </View>
    </LinearGradient>
  );
}

// ─── 11. Glassmorphism Featured Card ─────────────────────────────────────────
export function GlassFeaturedCard({ item, accent = C.purple, onPress }: { item: ContentItem; accent?: string; onPress: () => void }) {
  const { scale, pi, po } = usePressAnim(0.95);
  const [err, setErr] = useState(false);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ marginHorizontal: 16, marginBottom: 24 }}>
      <Animated.View style={[gf.card, { borderColor: `${accent}33`, transform: [{ scale }] }]}>
        {!err && item.backdropPath
          ? <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          : <LinearGradient colors={["#1a1030", "#0a0814"]} style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={["transparent", "rgba(6,4,14,0.96)"]} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
        {/* Glow border */}
        <View style={[gf.glowBorder, { borderColor: `${accent}44` }]} />
        <View style={gf.content}>
          <View style={[gf.exclusiveBadge, { backgroundColor: `${accent}25`, borderColor: `${accent}55` }]}>
            <Feather name="star" size={9} color={accent} />
            <Text style={[gf.exclusiveText, { color: accent }]}>EM DESTAQUE</Text>
          </View>
          <Text style={gf.title} numberOfLines={2}>{item.title}</Text>
          <View style={gf.meta}>
            {item.rating > 0 && (
              <View style={gf.imdb}>
                <Text style={gf.imdbLabel}>IMDb</Text>
                <Text style={gf.imdbVal}>{item.rating.toFixed(1)}</Text>
              </View>
            )}
            <Text style={gf.metaText}>{item.year}</Text>
            <Text style={gf.metaText}>·</Text>
            <Text style={gf.metaText}>{item.type === "series" ? "Série" : "Filme"}</Text>
          </View>
          {item.description ? <Text style={gf.desc} numberOfLines={2}>{item.description}</Text> : null}
          <View style={gf.actions}>
            <Pressable onPress={onPress} style={[gf.playBtn, { backgroundColor: accent }]}>
              <Feather name="play" size={12} color="#fff" />
              <Text style={gf.playText}>Assistir</Text>
            </Pressable>
            <View style={gf.moreBtn}>
              <Feather name="plus" size={12} color="rgba(255,255,255,0.7)" />
              <Text style={gf.moreText}>Minha Lista</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── 12. Double Feature Banner ────────────────────────────────────────────────
export function DoubleFeatureBanner({ left, right, onPress }: { left: ContentItem; right: ContentItem; onPress: (i: ContentItem) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, marginBottom: 24 }}>
      <DoubleItem item={left} label="NOVO" accentColor={C.red} onPress={() => onPress(left)} flex />
      <DoubleItem item={right} label="EM ALTA" accentColor={C.purple} onPress={() => onPress(right)} flex />
    </View>
  );
}

function DoubleItem({ item, label, accentColor, onPress, flex }: { item: ContentItem; label: string; accentColor: string; onPress: () => void; flex?: boolean }) {
  const { scale, pi, po } = usePressAnim(0.93);
  const [err, setErr] = useState(false);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={flex ? { flex: 1 } : {}}>
      <Animated.View style={[df.card, { transform: [{ scale }] }]}>
        {!err && item.posterPath
          ? <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          : <LinearGradient colors={["#1a1030", "#0a0814"]} style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={["transparent", `${accentColor}22`, "rgba(0,0,0,0.95)"]} locations={[0.35, 0.65, 1]} style={StyleSheet.absoluteFill} />
        <View style={[df.labelBadge, { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}55` }]}>
          <Text style={[df.labelText, { color: accentColor }]}>{label}</Text>
        </View>
        <View style={df.info}>
          <Text style={df.title} numberOfLines={2}>{item.title}</Text>
          <Text style={df.meta}>{item.year} · {item.type === "series" ? "Série" : "Filme"}</Text>
          <Pressable onPress={onPress} style={[df.playBtn, { backgroundColor: accentColor }]}>
            <Feather name="play" size={9} color="#fff" />
            <Text style={df.playText}>Assistir</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── 13. Ultra-Wide Panoramic Row (2.35:1) ───────────────────────────────────
export function PanoramicRow({ items, onPress }: { items: ContentItem[]; onPress: (i: ContentItem) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }} decelerationRate="fast" snapToInterval={W_PAN + 12}>
      {items.slice(0, 8).map((item) => (
        <PanoramicCard key={item.id} item={item} onPress={() => onPress(item)} />
      ))}
    </ScrollView>
  );
}

const W_PAN = 300;
function PanoramicCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const { scale, pi, po } = usePressAnim(0.95);
  const [err, setErr] = useState(false);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[pan.card, { transform: [{ scale }] }]}>
        {!err && item.backdropPath
          ? <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          : <LinearGradient colors={["#1a1030", "#0a0814"]} style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
        <View style={pan.info}>
          <Text style={pan.title} numberOfLines={1}>{item.title}</Text>
          <View style={pan.meta}>
            <Text style={pan.metaText}>{item.year}</Text>
            {item.rating > 0 && (
              <>
                <View style={pan.dot} />
                <Text style={[pan.metaText, { color: C.amber }]}>★ {item.rating.toFixed(1)}</Text>
              </>
            )}
            <View style={pan.dot} />
            <Text style={pan.metaText}>{item.type === "series" ? "Série" : "Filme"}</Text>
          </View>
        </View>
        <Pressable onPress={onPress} style={pan.playBtn}>
          <Feather name="play" size={12} color="#fff" />
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

// ─── 14. Award Winners Row ────────────────────────────────────────────────────
export function AwardWinnersRow({ items, onPress, award = "Oscar" }: { items: ContentItem[]; onPress: (i: ContentItem) => void; award?: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }} decelerationRate="fast">
      {items.slice(0, 8).map((item) => (
        <AwardCard key={item.id} item={item} award={award} onPress={() => onPress(item)} />
      ))}
    </ScrollView>
  );
}

function AwardCard({ item, award, onPress }: { item: ContentItem; award: string; onPress: () => void }) {
  const { scale, pi, po } = usePressAnim(0.92);
  const [err, setErr] = useState(false);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[aw.card, { transform: [{ scale }] }]}>
        {!err && item.posterPath
          ? <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          : <LinearGradient colors={["#1a1030", "#0a0814"]} style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={["#f59e0b22", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.4 }} style={StyleSheet.absoluteFill} />
        <View style={aw.awardBadge}>
          <Text style={aw.awardEmoji}>🏆</Text>
          <Text style={aw.awardLabel}>{award}</Text>
        </View>
        <View style={aw.bottom}>
          <Text style={aw.title} numberOfLines={1}>{item.title}</Text>
          <Text style={aw.year}>{item.year}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── 15. Binge-Worthy Row (series with episode count) ─────────────────────────
export function BingeWorthyRow({ items, onPress }: { items: ContentItem[]; onPress: (i: ContentItem) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
      {items.slice(0, 8).map((item) => (
        <BingeCard key={item.id} item={item} onPress={() => onPress(item)} />
      ))}
    </ScrollView>
  );
}

function BingeCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const { scale, pi, po } = usePressAnim(0.92);
  const [err, setErr] = useState(false);
  const episodes = item.episodeCount ?? Math.floor(Math.random() * 40 + 8);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[bw.card, { transform: [{ scale }] }]}>
        {!err && item.posterPath
          ? <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          : <LinearGradient colors={["#1a1030", "#0a0814"]} style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} locations={[0.5, 1]} style={StyleSheet.absoluteFill} />
        <View style={bw.seriesBadge}>
          <Feather name="tv" size={7} color="rgba(255,255,255,0.7)" />
          <Text style={bw.seriesText}>SÉRIE</Text>
        </View>
        <View style={bw.bottom}>
          <Text style={bw.title} numberOfLines={1}>{item.title}</Text>
          <View style={bw.epRow}>
            <Feather name="layers" size={8} color={C.green} />
            <Text style={bw.epText}>{episodes} episódios</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── 16. Premium Country Row (flags + backdrop) ───────────────────────────────
export function CountryFlagRow({ countries, onPress }: { countries: { id: string; label: string; flag: string; color: string }[]; onPress: (c: any) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
      {countries.map((c) => (
        <CountryCard key={c.id} country={c} onPress={() => onPress(c)} />
      ))}
    </ScrollView>
  );
}

function CountryCard({ country, onPress }: { country: { id: string; label: string; flag: string; color: string }; onPress: () => void }) {
  const { scale, pi, po } = usePressAnim(0.9);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[cf.card, { borderColor: `${country.color}44`, transform: [{ scale }] }]}>
        <LinearGradient colors={[`${country.color}30`, `${country.color}10`, "transparent"]} style={StyleSheet.absoluteFill} />
        <Text style={cf.flag}>{country.flag}</Text>
        <Text style={[cf.label, { color: country.color }]}>{country.label}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── 17. Premium Skeleton Loader ──────────────────────────────────────────────
export function PremiumSkeleton({ count = 5, cardW = 118, cardH = 170 }: { count?: number; cardW?: number; cardH?: number }) {
  const shimmer = useShimmer();
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.45] });
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} scrollEnabled={false}>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View key={i} style={{ width: cardW, height: cardH, borderRadius: 12, backgroundColor: "#1e1530", opacity }} />
      ))}
    </ScrollView>
  );
}

export function SkeletonHeaderLine() {
  const shimmer = useShimmer();
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.35] });
  return (
    <View style={{ paddingHorizontal: 20, marginBottom: 14, gap: 6 }}>
      <Animated.View style={{ height: 18, width: 160, borderRadius: 8, backgroundColor: "#1e1530", opacity }} />
      <Animated.View style={{ height: 12, width: 100, borderRadius: 6, backgroundColor: "#1e1530", opacity }} />
    </View>
  );
}

// ─── 18. Actor Spotlight Row ──────────────────────────────────────────────────
export function ActorSpotlightRow({ actors, onPress }: { actors: { name: string; initials: string; color: string; role?: string }[]; onPress: (a: any) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }} decelerationRate="fast">
      {actors.map((a) => (
        <ActorCard key={a.name} actor={a} onPress={() => onPress(a)} />
      ))}
    </ScrollView>
  );
}

function ActorCard({ actor, onPress }: { actor: { name: string; initials: string; color: string; role?: string }; onPress: () => void }) {
  const { scale, pi, po } = usePressAnim(0.88);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ alignItems: "center", gap: 6 }}>
      <Animated.View style={[ac.circle, { borderColor: `${actor.color}60`, transform: [{ scale }] }]}>
        <LinearGradient colors={[`${actor.color}45`, `${actor.color}18`]} style={StyleSheet.absoluteFill} />
        <Text style={[ac.initials, { color: actor.color }]}>{actor.initials}</Text>
      </Animated.View>
      <Text style={ac.name} numberOfLines={1}>{actor.name.split(" ")[0]}</Text>
      {actor.role && <Text style={ac.role} numberOfLines={1}>{actor.role}</Text>}
    </Pressable>
  );
}

// ─── 19. Leaving Soon Row ────────────────────────────────────────────────────
export function LeavingSoonRow({ items, onPress }: { items: ContentItem[]; onPress: (i: ContentItem) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
      {items.slice(0, 8).map((item, idx) => (
        <LeavingSoonCard key={item.id} item={item} daysLeft={idx + 2} onPress={() => onPress(item)} />
      ))}
    </ScrollView>
  );
}

function LeavingSoonCard({ item, daysLeft, onPress }: { item: ContentItem; daysLeft: number; onPress: () => void }) {
  const { scale, pi, po } = usePressAnim(0.92);
  const [err, setErr] = useState(false);
  const urgent = daysLeft <= 3;
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[ls.card, { transform: [{ scale }] }]}>
        {!err && item.posterPath
          ? <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          : <LinearGradient colors={["#1a1030", "#0a0814"]} style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={["transparent", urgent ? "rgba(229,9,20,0.85)" : "rgba(0,0,0,0.85)"]} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />
        <View style={[ls.badge, { backgroundColor: urgent ? "#e50914" : "rgba(0,0,0,0.75)" }]}>
          <Feather name="clock" size={8} color="#fff" />
          <Text style={ls.badgeText}>{daysLeft}d</Text>
        </View>
        <View style={ls.bottom}>
          <Text style={ls.title} numberOfLines={1}>{item.title}</Text>
          <Text style={ls.leaving}>Saindo em {daysLeft} dias</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── 20. Quick Play Row ───────────────────────────────────────────────────────
export function QuickPlayRow({ items, onPress }: { items: ContentItem[]; onPress: (i: ContentItem) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
      {items.slice(0, 6).map((item) => (
        <QuickPlayCard key={item.id} item={item} onPress={() => onPress(item)} />
      ))}
    </ScrollView>
  );
}

function QuickPlayCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const { scale, pi, po } = usePressAnim(0.93);
  const [err, setErr] = useState(false);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[qp.card, { transform: [{ scale }] }]}>
        {!err && item.backdropPath
          ? <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          : <LinearGradient colors={["#1a1030", "#0a0814"]} style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
        <View style={qp.playCircle}>
          <Feather name="play" size={20} color="#fff" style={{ marginLeft: 2 }} />
        </View>
        <View style={qp.info}>
          <Text style={qp.title} numberOfLines={1}>{item.title}</Text>
          <Text style={qp.meta}>{item.type === "series" ? "Série" : "Filme"} · {item.year}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── 21. Trending Hashtag Row ─────────────────────────────────────────────────
export function TrendingHashtagRow({ tags, onPress }: { tags: string[]; onPress: (t: string) => void }) {
  const tagColors = [C.red, C.purple, C.blue, C.green, C.amber, C.pink, C.orange, C.teal, C.indigo, C.cyan];
  return (
    <View style={th.wrap}>
      {tags.map((tag, i) => (
        <Pressable key={tag} onPress={() => onPress(tag)} style={[th.chip, { backgroundColor: `${tagColors[i % tagColors.length]}18`, borderColor: `${tagColors[i % tagColors.length]}35` }]}>
          <Text style={[th.text, { color: tagColors[i % tagColors.length] }]}>{tag}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── 22. Premium Continue Card (enhanced) ────────────────────────────────────
export function PremiumContinueCard({ item, onPress, onRemove }: {
  item: any; onPress: () => void; onRemove?: () => void;
}) {
  const { scale, pi, po } = usePressAnim(0.95);
  const [err, setErr] = useState(false);
  const progress = item.progress ?? 0;
  const pct = Math.min(progress * 100, 100);
  const isSeries = item.type === "series" || item.mediaType === "tv";
  const epLabel = isSeries && item.episodeSeason ? `T${item.episodeSeason} · E${item.episodeNum ?? 1}` : null;
  const remaining = item.durationMs && item.positionMs
    ? Math.max(0, Math.round((item.durationMs - item.positionMs) / 60000))
    : null;

  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[pc.card, { transform: [{ scale }] }]}>
        {!err && item.backdropPath
          ? <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          : <LinearGradient colors={["#1a1030", "#08060e"]} style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} locations={[0.38, 1]} style={StyleSheet.absoluteFill} />

        {/* Remove button */}
        {onRemove && (
          <Pressable onPress={(e) => { e.stopPropagation?.(); onRemove(); }} style={pc.removeBtn} hitSlop={8}>
            <Feather name="x" size={10} color="rgba(255,255,255,0.8)" />
          </Pressable>
        )}

        {/* Episode badge */}
        {epLabel && (
          <View style={pc.epBadge}>
            <Text style={pc.epText}>{epLabel}</Text>
          </View>
        )}

        {/* Big play button */}
        <View style={pc.playWrap}>
          <LinearGradient colors={["#e50914", "#b5060f"]} style={pc.playBtn}>
            <Feather name="play" size={16} color="#fff" style={{ marginLeft: 2 }} />
          </LinearGradient>
        </View>

        {/* Bottom info */}
        <View style={pc.bottom}>
          <Text style={pc.title} numberOfLines={1}>{item.title}</Text>
          {/* Progress bar */}
          <View style={pc.progressTrack}>
            <View style={[pc.progressFill, { width: `${pct}%` as any }]} />
          </View>
          <Text style={pc.remaining}>
            {remaining && remaining > 0 ? `${remaining} min restantes` : `${Math.round(pct)}% assistido`}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── 23. Category Banner (per-category hero) ─────────────────────────────────
export function CategoryHeroBanner({ item, categoryLabel, accentColor, onPress }: { item: ContentItem; categoryLabel: string; accentColor: string; onPress: () => void }) {
  const { scale, pi, po } = usePressAnim(0.97);
  const [err, setErr] = useState(false);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ marginHorizontal: 16, marginBottom: 20 }}>
      <Animated.View style={[catb.card, { borderColor: `${accentColor}33`, transform: [{ scale }] }]}>
        {!err && (item.backdropPath ?? item.posterPath)
          ? <Image source={{ uri: item.backdropPath ?? item.posterPath }} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          : <LinearGradient colors={[`${accentColor}44`, "#000"]} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} locations={[0.3, 1]} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
        <View style={catb.content}>
          <View style={[catb.catBadge, { backgroundColor: accentColor }]}>
            <Text style={catb.catLabel}>{categoryLabel.toUpperCase()}</Text>
          </View>
          <Text style={catb.title} numberOfLines={1}>{item.title}</Text>
          <TouchableOpacity onPress={onPress} style={[catb.watchBtn, { backgroundColor: accentColor }]}>
            <Feather name="play" size={11} color="#fff" />
            <Text style={catb.watchText}>Assistir</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── 24. Animated Section Header (gradient variant) ──────────────────────────
export function GradientSectionHeader({ title, subtitle, accent, icon, onSeeAll, seeAllLabel = "Ver todos" }: { title: string; subtitle?: string; accent: string; icon?: keyof typeof Feather.glyphMap; onSeeAll?: () => void; seeAllLabel?: string }) {
  const bounce = useBounce();
  return (
    <LinearGradient colors={[`${accent}20`, "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={gsh.wrap}>
      <View style={gsh.left}>
        {icon && (
          <Animated.View style={[gsh.iconWrap, { backgroundColor: `${accent}28`, transform: [{ translateY: bounce }] }]}>
            <Feather name={icon} size={14} color={accent} />
          </Animated.View>
        )}
        <View>
          <Text style={gsh.title}>{title}</Text>
          {subtitle && <Text style={gsh.subtitle}>{subtitle}</Text>}
        </View>
      </View>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7} style={[gsh.seeAll, { borderColor: `${accent}40` }]}>
          <Text style={[gsh.seeAllText, { color: accent }]}>{seeAllLabel}</Text>
          <Feather name="chevron-right" size={11} color={accent} />
        </TouchableOpacity>
      )}
    </LinearGradient>
  );
}

// ─── 25. Top Genre Matrix (2-column grid pills) ───────────────────────────────
export function GenreMatrixRow({ genres, onPress }: { genres: { id: number; label: string; icon: keyof typeof Feather.glyphMap; color: string }[]; onPress: (g: any) => void }) {
  const pairs: (typeof genres)[] = [];
  for (let i = 0; i < genres.length; i += 2) {
    pairs.push(genres.slice(i, i + 2));
  }
  return (
    <View style={{ paddingHorizontal: 16, gap: 8 }}>
      {pairs.map((pair, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 8 }}>
          {pair.map((g) => (
            <GenreMatrixItem key={g.id} genre={g} onPress={() => onPress(g)} />
          ))}
        </View>
      ))}
    </View>
  );
}

function GenreMatrixItem({ genre, onPress }: { genre: { id: number; label: string; icon: keyof typeof Feather.glyphMap; color: string }; onPress: () => void }) {
  const { scale, pi, po } = usePressAnim(0.94);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ flex: 1 }}>
      <Animated.View style={[gm.item, { borderColor: `${genre.color}35`, transform: [{ scale }] }]}>
        <LinearGradient colors={[`${genre.color}20`, "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        <View style={[gm.iconWrap, { backgroundColor: `${genre.color}20` }]}>
          <Feather name={genre.icon} size={14} color={genre.color} />
        </View>
        <Text style={[gm.label, { color: genre.color }]}>{genre.label}</Text>
        <Feather name="chevron-right" size={12} color={`${genre.color}55`} />
      </Animated.View>
    </Pressable>
  );
}

// ─── 26. Originals Promo Banner ───────────────────────────────────────────────
export function OriginalsBanner({ onPress, accentColor = C.red }: { onPress: () => void; accentColor?: string }) {
  const { scale, pi, po } = usePressAnim(0.97);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ marginHorizontal: 16, marginBottom: 24 }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient colors={[accentColor, "#7f1d1d", "#0a0814"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={ob.card}>
          <View style={ob.left}>
            <View style={[ob.badge, { borderColor: "rgba(255,255,255,0.3)" }]}>
              <Text style={ob.badgeText}>N</Text>
            </View>
            <View>
              <Text style={ob.title}>NETPLAY ORIGINALS</Text>
              <Text style={ob.sub}>Conteúdo exclusivo para você</Text>
            </View>
          </View>
          <View style={ob.arrow}>
            <Feather name="arrow-right" size={18} color="rgba(255,255,255,0.7)" />
          </View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

// ─── 27. Weekend Pick Banner ──────────────────────────────────────────────────
export function WeekendPickBanner({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const { scale, pi, po } = usePressAnim(0.97);
  const [err, setErr] = useState(false);
  const day = new Date().getDay();
  const isWeekend = day === 0 || day === 6;
  const label = isWeekend ? "PARA O FINAL DE SEMANA" : "PARA HOJE À NOITE";
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ marginHorizontal: 16, marginBottom: 20 }}>
      <Animated.View style={[wb.card, { transform: [{ scale }] }]}>
        {!err && item.backdropPath
          ? <Image source={{ uri: item.backdropPath }} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          : <LinearGradient colors={["#1a1030", "#0a0814"]} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} locations={[0.3, 1]} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
        <View style={wb.content}>
          <View style={wb.labelBadge}>
            <Feather name="sun" size={9} color={C.amber} />
            <Text style={wb.labelText}>{label}</Text>
          </View>
          <Text style={wb.title} numberOfLines={1}>{item.title}</Text>
          <View style={wb.meta}>
            {item.rating > 0 && <Text style={wb.rating}>★ {item.rating.toFixed(1)}</Text>}
            <Text style={wb.year}>{item.year}</Text>
            <Text style={wb.type}>{item.type === "series" ? "Série" : "Filme"}</Text>
          </View>
          <Pressable onPress={onPress} style={wb.playBtn}>
            <Feather name="play" size={11} color="#fff" />
            <Text style={wb.playText}>Assistir</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── 28. Compact Ranked List ──────────────────────────────────────────────────
export function CompactRankedList({ items, onPress, accent = C.amber }: { items: ContentItem[]; onPress: (i: ContentItem) => void; accent?: string }) {
  return (
    <View style={{ paddingHorizontal: 16, gap: 0 }}>
      {items.slice(0, 5).map((item, idx) => (
        <CompactRankItem key={item.id} item={item} rank={idx + 1} accent={accent} onPress={() => onPress(item)} isLast={idx === 4} />
      ))}
    </View>
  );
}

function CompactRankItem({ item, rank, accent, onPress, isLast }: { item: ContentItem; rank: number; accent: string; onPress: () => void; isLast: boolean }) {
  const { scale, pi, po } = usePressAnim(0.97);
  const [err, setErr] = useState(false);
  const rankColors: Record<number, string> = { 1: "#FFD700", 2: "#E8E8E8", 3: "#CD7F32" };
  const rankColor = rankColors[rank] ?? accent;
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[cr2.row, !isLast && cr2.borderBottom, { transform: [{ scale }] }]}>
        <Text style={[cr2.rank, { color: rankColor }]}>{String(rank).padStart(2, "0")}</Text>
        <View style={cr2.thumb}>
          {!err && item.posterPath
            ? <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
            : <LinearGradient colors={["#1a1030", "#0a0814"]} style={StyleSheet.absoluteFill} />}
        </View>
        <View style={cr2.info}>
          <Text style={cr2.title} numberOfLines={1}>{item.title}</Text>
          <View style={cr2.meta}>
            <Text style={cr2.metaText}>{item.year}</Text>
            <View style={cr2.dot} />
            <Text style={cr2.metaText}>{item.type === "series" ? "Série" : "Filme"}</Text>
            {item.rating > 0 && (
              <>
                <View style={cr2.dot} />
                <Text style={[cr2.metaText, { color: C.amber }]}>★ {item.rating.toFixed(1)}</Text>
              </>
            )}
          </View>
        </View>
        <Feather name="play" size={14} color={`${accent}88`} />
      </Animated.View>
    </Pressable>
  );
}

// ─── 29. Scroll Progress Bar ──────────────────────────────────────────────────
export function ScrollProgressBar({ scrollY, maxScroll, accent = C.red }: { scrollY: Animated.Value; maxScroll: number; accent?: string }) {
  const width = scrollY.interpolate({ inputRange: [0, maxScroll], outputRange: ["0%", "100%"], extrapolate: "clamp" });
  return (
    <View style={spb.track}>
      <Animated.View style={[spb.fill, { width, backgroundColor: accent }]} />
    </View>
  );
}

// ─── 30. Platform Showcase Row ─────────────────────────────────────────────────
export function PlatformShowcaseRow({ platforms, onPress }: { platforms: { id: string; name: string; color: string; logo?: string }[]; onPress: (p: any) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
      {platforms.map((p) => (
        <PlatformShowcaseCard key={p.id} platform={p} onPress={() => onPress(p)} />
      ))}
    </ScrollView>
  );
}

function PlatformShowcaseCard({ platform, onPress }: { platform: { id: string; name: string; color: string; logo?: string }; onPress: () => void }) {
  const { scale, pi, po } = usePressAnim(0.9);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[psc.card, { borderColor: `${platform.color}35`, transform: [{ scale }] }]}>
        <LinearGradient colors={[`${platform.color}25`, `${platform.color}08`]} style={StyleSheet.absoluteFill} />
        <View style={[psc.iconCircle, { backgroundColor: `${platform.color}20` }]}>
          <Feather name="tv" size={16} color={platform.color} />
        </View>
        <Text style={[psc.name, { color: platform.color }]} numberOfLines={1}>{platform.name}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const hp = StyleSheet.create({
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(229,9,20,0.9)", borderRadius: 6 },
  liveDot: { backgroundColor: "#fff" },
  liveText: { color: "#fff", fontWeight: "900", letterSpacing: 1 },
  dividerWrap: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginVertical: 24, gap: 12 },
  dividerLine: { flex: 1, height: 1 },
  dividerChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  dividerText: { fontSize: 9, fontWeight: "900", letterSpacing: 2 },
});

const cb = StyleSheet.create({
  wrap: { height: 220, marginHorizontal: 16, marginBottom: 20, borderRadius: 20, overflow: "hidden",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.55, shadowRadius: 20 }, android: { elevation: 12 } }) },
  content: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 18, gap: 8 },
  topBadges: { flexDirection: "row", gap: 6 },
  imdb: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f5c518", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 },
  imdbLabel: { color: "#000", fontSize: 8, fontWeight: "900" },
  imdbVal: { color: "#000", fontSize: 10, fontWeight: "800" },
  typeBadge: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  typeText: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  title: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.5, lineHeight: 26 },
  desc: { color: "rgba(255,255,255,0.6)", fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#e50914", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  playText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  moreBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  moreText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "700" },
  dots: { position: "absolute", bottom: 14, right: 18, flexDirection: "row", gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.3)" },
  dotActive: { width: 14, backgroundColor: C.red },
});

const dp = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginBottom: 20, height: 200, borderRadius: 18, overflow: "hidden",
    ...Platform.select({ ios: { shadowColor: "#FFD700", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16 }, android: { elevation: 10 } }) },
  crownBadge: { position: "absolute", top: 12, left: 12, zIndex: 10 },
  crownGrad: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  crownEmoji: { fontSize: 13 },
  crownText: { color: "#000", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  content: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, gap: 5 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: -0.4 },
  meta: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: "rgba(255,255,255,0.55)", fontSize: 11 },
  dot: { width: 2.5, height: 2.5, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.3)" },
  desc: { color: "rgba(255,255,255,0.45)", fontSize: 11, lineHeight: 15 },
  watchBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#e50914", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, alignSelf: "flex-start", marginTop: 4 },
  watchText: { color: "#fff", fontSize: 12, fontWeight: "800" },
});

const ne = StyleSheet.create({
  wrap: { marginBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, marginBottom: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.red },
  headerText: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  scroll: { paddingHorizontal: 16, gap: 10 },
  card: { width: 120, height: 170, borderRadius: 12, overflow: "hidden",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 }, android: { elevation: 5 } }) },
  newBadge: { position: "absolute", top: 7, left: 0, backgroundColor: "#e50914", paddingHorizontal: 7, paddingVertical: 3, borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  newText: { color: "#fff", fontSize: 7, fontWeight: "900", letterSpacing: 0.6 },
  cardBottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8 },
  cardTitle: { color: "#fff", fontSize: 10, fontWeight: "700" },
});

const uc = StyleSheet.create({
  card: { width: 130, height: 150, borderRadius: 16, overflow: "hidden", padding: 14, gap: 8, alignItems: "center", justifyContent: "center", borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.03)" },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 11, fontWeight: "700", textAlign: "center", lineHeight: 15 },
  daysBadge: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: "center", borderWidth: 1 },
  daysNum: { fontSize: 20, fontWeight: "900" },
  daysLabel: { fontSize: 9, fontWeight: "600" },
});

const gs = StyleSheet.create({
  row: { flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 24 },
  card: { flex: 1, borderRadius: 16, overflow: "hidden", padding: 14, gap: 4, alignItems: "center", borderWidth: 1, backgroundColor: "rgba(255,255,255,0.03)" },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  value: { fontSize: 17, fontWeight: "900", letterSpacing: -0.3 },
  label: { color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: "500" },
});

const ep = StyleSheet.create({
  card: { height: 160, borderRadius: 18, overflow: "hidden", flexDirection: "row",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16 }, android: { elevation: 10 } }) },
  imageSection: { flex: 1 },
  infoPanel: { width: 170, paddingVertical: 16, paddingHorizontal: 14, gap: 6, backgroundColor: "rgba(10,8,20,0.95)" },
  editorBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  editorText: { color: C.amber, fontSize: 8, fontWeight: "700", letterSpacing: 0.4 },
  title: { color: "#fff", fontSize: 14, fontWeight: "800", letterSpacing: -0.3, lineHeight: 18 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  rating: { color: C.amber, fontSize: 11, fontWeight: "700" },
  year: { color: "rgba(255,255,255,0.45)", fontSize: 11 },
  desc: { color: "rgba(255,255,255,0.4)", fontSize: 10, lineHeight: 14 },
  btn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#e50914", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, alignSelf: "flex-start" },
  btnText: { color: "#fff", fontSize: 11, fontWeight: "800" },
});

const tg = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12, marginBottom: 8 },
  emoji: { fontSize: 24 },
  greeting: { color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  sub: { color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 },
});

const gf = StyleSheet.create({
  card: { height: 210, borderRadius: 20, overflow: "hidden", borderWidth: 1,
    ...Platform.select({ ios: { shadowColor: "#8b5cf6", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 18 }, android: { elevation: 12 } }) },
  glowBorder: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 20, borderWidth: 1 },
  content: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 18, gap: 7 },
  exclusiveBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start" },
  exclusiveText: { fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  title: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: -0.5, lineHeight: 24 },
  meta: { flexDirection: "row", alignItems: "center", gap: 7 },
  imdb: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f5c518", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  imdbLabel: { color: "#000", fontSize: 7, fontWeight: "900" },
  imdbVal: { color: "#000", fontSize: 9, fontWeight: "800" },
  metaText: { color: "rgba(255,255,255,0.5)", fontSize: 11 },
  desc: { color: "rgba(255,255,255,0.45)", fontSize: 11, lineHeight: 15 },
  actions: { flexDirection: "row", gap: 10 },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  playText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  moreBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  moreText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "700" },
});

const df = StyleSheet.create({
  card: { height: 200, borderRadius: 16, overflow: "hidden",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 12 }, android: { elevation: 8 } }) },
  labelBadge: { position: "absolute", top: 10, left: 10, borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  labelText: { fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  info: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 12, gap: 4 },
  title: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: -0.2, lineHeight: 16 },
  meta: { color: "rgba(255,255,255,0.45)", fontSize: 10 },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start", marginTop: 4 },
  playText: { color: "#fff", fontSize: 10, fontWeight: "800" },
});

const pan = StyleSheet.create({
  card: { width: W_PAN, height: 128, borderRadius: 16, overflow: "hidden",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 10 }, android: { elevation: 7 } }) },
  info: { position: "absolute", bottom: 0, left: 0, right: 44, padding: 12 },
  title: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: -0.2 },
  meta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  metaText: { color: "rgba(255,255,255,0.55)", fontSize: 11 },
  dot: { width: 2.5, height: 2.5, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.3)" },
  playBtn: { position: "absolute", bottom: 12, right: 12, width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(229,9,20,0.9)", alignItems: "center", justifyContent: "center" },
});

const aw = StyleSheet.create({
  card: { width: 120, height: 172, borderRadius: 12, overflow: "hidden",
    ...Platform.select({ ios: { shadowColor: "#f59e0b", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }, android: { elevation: 5 } }) },
  awardBadge: { position: "absolute", top: 7, left: 7, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  awardEmoji: { fontSize: 10 },
  awardLabel: { color: C.amber, fontSize: 7, fontWeight: "900" },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8 },
  title: { color: "#fff", fontSize: 10, fontWeight: "700" },
  year: { color: "rgba(255,255,255,0.45)", fontSize: 9, marginTop: 2 },
});

const bw = StyleSheet.create({
  card: { width: 118, height: 170, borderRadius: 12, overflow: "hidden",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 }, android: { elevation: 5 } }) },
  seriesBadge: { position: "absolute", top: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 3 },
  seriesText: { color: "rgba(255,255,255,0.7)", fontSize: 7, fontWeight: "800" },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8, gap: 3 },
  title: { color: "#fff", fontSize: 10, fontWeight: "700" },
  epRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  epText: { color: C.green, fontSize: 9, fontWeight: "700" },
});

const cf = StyleSheet.create({
  card: { width: 80, height: 76, borderRadius: 14, overflow: "hidden", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, backgroundColor: "rgba(255,255,255,0.02)" },
  flag: { fontSize: 26 },
  label: { fontSize: 9, fontWeight: "700", letterSpacing: 0.3 },
});

const ls = StyleSheet.create({
  card: { width: 118, height: 170, borderRadius: 12, overflow: "hidden",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 }, android: { elevation: 5 } }) },
  badge: { position: "absolute", top: 7, right: 7, flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  badgeText: { color: "#fff", fontSize: 8, fontWeight: "800" },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8, gap: 2 },
  title: { color: "#fff", fontSize: 10, fontWeight: "700" },
  leaving: { color: "#ef4444", fontSize: 9, fontWeight: "600" },
});

const qp = StyleSheet.create({
  card: { width: 200, height: 118, borderRadius: 14, overflow: "hidden",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 10 }, android: { elevation: 7 } }) },
  playCircle: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  playCircleInner: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(229,9,20,0.85)", alignItems: "center", justifyContent: "center" },
  info: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 10 },
  title: { color: "#fff", fontSize: 12, fontWeight: "700" },
  meta: { color: "rgba(255,255,255,0.5)", fontSize: 10, marginTop: 2 },
});

const th = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 },
  chip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  text: { fontSize: 12, fontWeight: "700" },
});

const pc = StyleSheet.create({
  card: { width: 218, height: 124, borderRadius: 16, overflow: "hidden",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 10 }, android: { elevation: 7 } }) },
  removeBtn: { position: "absolute", top: 7, right: 7, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  epBadge: { position: "absolute", top: 7, left: 7, backgroundColor: "rgba(229,9,20,0.85)", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 },
  epText: { color: "#fff", fontSize: 8, fontWeight: "800" },
  playWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  playBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 10, gap: 4 },
  title: { color: "#fff", fontSize: 12, fontWeight: "700" },
  progressTrack: { height: 3, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 3, backgroundColor: "#e50914", borderRadius: 2 },
  remaining: { color: "rgba(255,255,255,0.45)", fontSize: 9 },
});

const catb = StyleSheet.create({
  card: { height: 180, borderRadius: 18, overflow: "hidden", borderWidth: 1,
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 16 }, android: { elevation: 10 } }) },
  content: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, gap: 7 },
  catBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  catLabel: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  title: { color: "#fff", fontSize: 17, fontWeight: "700" },
  watchBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, alignSelf: "flex-start" },
  watchText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});

const gsh = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 10, marginBottom: 6 },
  left: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  iconWrap: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 17, fontWeight: "700", letterSpacing: -0.4 },
  subtitle: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 1 },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  seeAllText: { fontSize: 11, fontWeight: "600" },
});

const gm = StyleSheet.create({
  item: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, overflow: "hidden", paddingHorizontal: 12, paddingVertical: 12, backgroundColor: "rgba(255,255,255,0.02)" },
  iconWrap: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 13, fontWeight: "700" },
});

const ob = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 18, borderRadius: 18,
    ...Platform.select({ ios: { shadowColor: "#e50914", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 14 }, android: { elevation: 10 } }) },
  left: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: { width: 40, height: 40, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center", borderWidth: 1 },
  badgeText: { color: "#fff", fontSize: 22, fontWeight: "900", fontStyle: "italic" },
  title: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.2 },
  sub: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 2 },
  arrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
});

const wb = StyleSheet.create({
  card: { height: 186, borderRadius: 18, overflow: "hidden",
    ...Platform.select({ ios: { shadowColor: C.amber, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14 }, android: { elevation: 8 } }) },
  content: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, gap: 6 },
  labelBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: `${C.amber}25`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: `${C.amber}44` },
  labelText: { color: C.amber, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: -0.4 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8 },
  rating: { color: C.amber, fontSize: 12, fontWeight: "700" },
  year: { color: "rgba(255,255,255,0.45)", fontSize: 11 },
  type: { color: "rgba(255,255,255,0.45)", fontSize: 11 },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#e50914", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, alignSelf: "flex-start" },
  playText: { color: "#fff", fontSize: 12, fontWeight: "800" },
});

const cr2 = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  rank: { fontSize: 18, fontWeight: "900", width: 28, textAlign: "center" },
  thumb: { width: 54, height: 54, borderRadius: 10, overflow: "hidden", backgroundColor: "#1a1530" },
  info: { flex: 1, gap: 3 },
  title: { color: "#fff", fontSize: 13, fontWeight: "700" },
  meta: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: "rgba(255,255,255,0.4)", fontSize: 11 },
  dot: { width: 2.5, height: 2.5, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.2)" },
});

const spb = StyleSheet.create({
  track: { position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: "rgba(255,255,255,0.06)" },
  fill: { height: 2, borderRadius: 1 },
});

const psc = StyleSheet.create({
  card: { width: 90, height: 80, borderRadius: 14, overflow: "hidden", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, backgroundColor: "rgba(255,255,255,0.02)" },
  iconCircle: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 10, fontWeight: "800", textAlign: "center" },
});

const ac = StyleSheet.create({
  circle: { width: 62, height: 62, borderRadius: 31, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 2 },
  initials: { fontSize: 20, fontWeight: "900" },
  name: { color: "rgba(255,255,255,0.75)", fontSize: 10, fontWeight: "700", maxWidth: 62, textAlign: "center" },
  role: { color: "rgba(255,255,255,0.35)", fontSize: 9, maxWidth: 62, textAlign: "center" },
});
