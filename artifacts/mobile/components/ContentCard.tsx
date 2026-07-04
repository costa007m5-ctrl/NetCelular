import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
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
import { useAuth } from "@/lib/auth-context";
import { useAppliedContentItem } from "@/lib/content-edits";
import { EditPosterModal } from "./EditPosterModal";

// ─── Types ────────────────────────────────────────────────────────────────────
export type CardVariant =
  | "poster"       // 2:3 portrait (default)
  | "backdrop"     // 16:9 landscape wide
  | "square"       // 1:1
  | "mini"         // compact horizontal list row
  | "featured"     // tall cinematic with full overlay
  | "spotlight";   // wide with side info panel

interface ContentCardProps {
  item: ContentItem;
  width?: number;
  height?: number;
  variant?: CardVariant;
  showProgress?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  showRating?: boolean;
  showBadge?: boolean;
  showTitle?: boolean;
  showMatchScore?: boolean;
  rank?: number;
  isLive?: boolean;
  accentColor?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CURRENT_YEAR = new Date().getFullYear();
const isNewContent    = (y: number) => y >= CURRENT_YEAR - 1;
const isRecentContent = (y: number) => y >= CURRENT_YEAR;

const QUALITY_COLORS: Record<string, string> = {
  "4K": "#a78bfa", UHD: "#a78bfa",
  HD: "#3b82f6", FHD: "#22d3ee", DV: "#f59e0b",
};

const PLATFORM_COLORS: Record<string, string> = {
  Netflix: "#e50914", Disney: "#113ccf", Prime: "#00a8e0",
  Apple: "#fff", HBO: "#9333ea", Paramount: "#3b82f6",
};

// ─── Sub-badges ───────────────────────────────────────────────────────────────
function QualityBadge({ quality }: { quality?: string }) {
  if (!quality) return null;
  const color = QUALITY_COLORS[quality] ?? "#888";
  return (
    <View style={[b.qualityBadge, { borderColor: `${color}55`, backgroundColor: `${color}1A` }]}>
      <Text style={[b.qualityText, { color }]}>{quality}</Text>
    </View>
  );
}

function AudioBadge({ dubbed, subbed }: { dubbed?: boolean; subbed?: boolean }) {
  if (!dubbed && !subbed) return null;
  return (
    <View style={b.audioBadgeRow}>
      {dubbed && (
        <View style={[b.audioBadge, { backgroundColor: "rgba(34,197,94,0.22)", borderColor: "rgba(34,197,94,0.4)" }]}>
          <Text style={[b.audioText, { color: "#22c55e" }]}>DUB</Text>
        </View>
      )}
      {subbed && (
        <View style={[b.audioBadge, { backgroundColor: "rgba(59,130,246,0.22)", borderColor: "rgba(59,130,246,0.4)" }]}>
          <Text style={[b.audioText, { color: "#60a5fa" }]}>LEG</Text>
        </View>
      )}
    </View>
  );
}

function MatchScoreBadge({ score }: { score: number }) {
  const color = score >= 90 ? "#22c55e" : score >= 70 ? "#f59e0b" : "#e50914";
  return (
    <View style={[b.matchBadge, { borderColor: `${color}44` }]}>
      <Text style={[b.matchPct, { color }]}>{score}%</Text>
      <Text style={b.matchLabel}>para você</Text>
    </View>
  );
}

function LivePulseBadge() {
  const pulse = useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
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
    <View style={b.liveBadge}>
      <Animated.View style={[b.liveDot, { opacity: pulse }]} />
      <Text style={b.liveText}>AO VIVO</Text>
    </View>
  );
}

function EpisodeBadge({ count }: { count: number }) {
  return (
    <View style={b.episodeBadge}>
      <Feather name="layers" size={7} color="rgba(255,255,255,0.7)" />
      <Text style={b.episodeText}>{count} EP</Text>
    </View>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const colors: Record<number, [string, string]> = {
    1: ["#FFD700", "#B8860B"],
    2: ["#E8E8E8", "#A0A0A0"],
    3: ["#CD7F32", "#8B4513"],
  };
  if (rank <= 3) {
    return (
      <LinearGradient colors={colors[rank]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={b.rankGold}>
        <Text style={b.rankGoldText}>#{rank}</Text>
      </LinearGradient>
    );
  }
  return (
    <View style={b.rankBadge}>
      <Text style={b.rankText}>#{rank}</Text>
    </View>
  );
}

function NewSparkle() {
  const rotate = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const a = Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: 2500, useNativeDriver: true })
    );
    a.start();
    return () => a.stop();
  }, []);
  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View style={[b.sparkle, { transform: [{ rotate: spin }] }]}>
      <Text style={b.sparkleText}>✦</Text>
    </Animated.View>
  );
}

// ─── Quick-action context menu ─────────────────────────────────────────────
function QuickMenu({
  visible,
  item,
  onClose,
  onWatch,
}: {
  visible: boolean;
  item: ContentItem;
  onClose: () => void;
  onWatch?: () => void;
}) {
  const actions: { icon: keyof typeof Feather.glyphMap; label: string; color?: string }[] = [
    { icon: "play", label: "Assistir agora", color: "#e50914" },
    { icon: "plus", label: "Adicionar à lista" },
    { icon: "heart", label: "Favoritar" },
    { icon: "download", label: "Baixar" },
    { icon: "share-2", label: "Compartilhar" },
    { icon: "info", label: "Ver detalhes" },
  ];
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={qm.backdrop} onPress={onClose}>
        <View style={qm.sheet}>
          <View style={qm.handle} />
          <Text style={qm.title} numberOfLines={1}>{item.title}</Text>
          <Text style={qm.meta}>{item.year} · {item.type === "series" ? "Série" : "Filme"}</Text>
          <View style={qm.divider} />
          {actions.map((a) => (
            <TouchableOpacity
              key={a.label}
              style={qm.action}
              activeOpacity={0.7}
              onPress={() => {
                if (a.icon === "play" && onWatch) onWatch();
                onClose();
              }}
            >
              <View style={[qm.iconCircle, a.color ? { backgroundColor: `${a.color}22` } : {}]}>
                <Feather name={a.icon} size={15} color={a.color ?? "rgba(255,255,255,0.75)"} />
              </View>
              <Text style={[qm.actionLabel, a.color ? { color: a.color } : {}]}>{a.label}</Text>
              <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.25)" />
            </TouchableOpacity>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Poster Card (2:3) ────────────────────────────────────────────────────────
const PosterCard = React.memo(function PosterCard({
  item: rawItem, width = 118, height = 170,
  showProgress, showRating, showBadge, showMatchScore, rank, isLive, accentColor,
  onPress, onLongPress,
}: ContentCardProps) {
  const colors = useColors();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const item = useAppliedContentItem(rawItem);
  const scale = useRef(new Animated.Value(1)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [imgError, setImgError] = useState(false);
  const [fallbackUri, setFallbackUri] = useState<string | null>(null);
  const [pressing, setPressing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const accent = accentColor ?? colors.primary;

  const handleImgError = useCallback(async () => {
    if (fallbackUri) { setImgError(true); return; }
    const tmdbId = (item as any).tmdbId;
    if (!tmdbId) { setImgError(true); return; }
    try {
      const { getApiBase } = await import("@/lib/api");
      const base = getApiBase();
      const mt = item.type === "series" ? "tv" : "movie";
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(`${base}/tmdb/${mt}/${tmdbId}`, { signal: ctrl.signal });
      clearTimeout(tid);
      if (r.ok) {
        const d = await r.json();
        const uri = d.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : null;
        if (uri) { setFallbackUri(uri); return; }
      }
    } catch {}
    setImgError(true);
  }, [item, fallbackUri]);

  const onPressIn = useCallback(() => {
    setPressing(true);
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 28, bounciness: 4 }),
      Animated.timing(overlayOpacity, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
  }, []);
  const onPressOut = useCallback(() => {
    setPressing(false);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 6 }),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const progressPct = Math.min((item.progress ?? 0) * 100, 100);
  const isNew    = isNewContent(item.year);
  const isLatest = isRecentContent(item.year);
  const isSeries = item.type === "series";
  const timeRemaining = item.progress && item.duration
    ? Math.round(parseInt(String(item.duration)) * (1 - item.progress))
    : null;

  const handleLongPress = useCallback(() => {
    setMenuVisible(true);
    if (onLongPress) onLongPress();
  }, [onLongPress]);

  return (
    <>
      <QuickMenu
        visible={menuVisible}
        item={item}
        onClose={() => setMenuVisible(false)}
        onWatch={onPress}
      />
      <Pressable onPress={onPress} onLongPress={handleLongPress} onPressIn={onPressIn} onPressOut={onPressOut}>
        <Animated.View style={[card.base, { width, height, borderRadius: colors.radius, transform: [{ scale }] }]}>
          {/* Image */}
          {!imgError && (fallbackUri || item.posterPath) ? (
            <Image
              source={{ uri: fallbackUri || item.posterPath! }}
              style={[card.image, { borderRadius: colors.radius }]}
              contentFit="cover"
              transition={Platform.OS === "web" ? 200 : 0}
              onError={handleImgError}
              cachePolicy="memory-disk"
            />
          ) : (
            <LinearGradient colors={["#1a1525", "#0a0a14"]} style={[card.image, { borderRadius: colors.radius, alignItems: "center", justifyContent: "center", gap: 6 }]}>
              <Feather name="film" size={Math.round(width * 0.22)} color="#2a2a40" />
              <Text style={{ color: "#333348", fontSize: width * 0.09, fontWeight: "600", textAlign: "center", paddingHorizontal: 8 }} numberOfLines={2}>{item.title}</Text>
            </LinearGradient>
          )}

          {/* Bottom gradient */}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.72)"]}
            style={[card.bottomGrad, { borderRadius: colors.radius }]}
            locations={[0.45, 1]}
          />

          {/* Press overlay */}
          <Animated.View style={[card.pressOverlay, { opacity: overlayOpacity, borderRadius: colors.radius }]}>
            <View style={card.playCircle}>
              <Feather name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
            </View>
          </Animated.View>

          {/* Live badge */}
          {isLive && <LivePulseBadge />}

          {/* Rank badge */}
          {rank !== undefined && <RankBadge rank={rank} />}

          {/* Top-right: NEW / RECENT */}
          {showBadge && !rank && !isLive && isLatest && (
            <View style={[card.cornerBadge, { backgroundColor: "#e50914" }]}>
              <NewSparkle />
              <Text style={card.cornerBadgeText}>NOVO</Text>
            </View>
          )}
          {showBadge && !rank && !isLive && !isLatest && isNew && (
            <View style={[card.cornerBadge, { backgroundColor: "#22c55e" }]}>
              <Text style={card.cornerBadgeText}>RECENTE</Text>
            </View>
          )}

          {/* Top-left badges */}
          {showBadge && (
            <View style={card.topLeft}>
              {isSeries && (
                <View style={card.typeChip}>
                  <Feather name="tv" size={7} color="rgba(255,255,255,0.75)" />
                </View>
              )}
              {item.quality && <QualityBadge quality={item.quality} />}
              {item.dubbed !== undefined && <AudioBadge dubbed={item.dubbed} subbed={item.subbed} />}
            </View>
          )}

          {/* Episode count for series */}
          {isSeries && item.episodeCount && showBadge && (
            <View style={card.bottomLeft}>
              <EpisodeBadge count={item.episodeCount} />
            </View>
          )}

          {/* Rating */}
          {showRating && item.rating > 0 && (
            <View style={card.ratingWrap}>
              <View style={card.imdbPill}>
                <Text style={card.imdbLabel}>IMDb</Text>
                <Text style={card.imdbValue}>{item.rating.toFixed(1)}</Text>
              </View>
            </View>
          )}

          {/* Exclusive ribbon */}
          {item.exclusive && (
            <View style={card.exclusiveRibbon}>
              <Text style={card.exclusiveText}>✦ EXCLUSIVO</Text>
            </View>
          )}

          {/* Watch progress bar + remaining time */}
          {showProgress && progressPct > 0 && (
            <View style={card.progressWrap}>
              {timeRemaining && timeRemaining > 0 && (
                <Text style={card.progressTime}>{timeRemaining} min restantes</Text>
              )}
              <View style={card.progressTrack}>
                <View style={[card.progressFill, { width: `${progressPct}%` as any, backgroundColor: accent }]} />
              </View>
            </View>
          )}

          {/* Match score */}
          {showMatchScore && item.matchScore !== undefined && (
            <View style={card.matchWrap}>
              <MatchScoreBadge score={item.matchScore} />
            </View>
          )}

          {/* Long press hint dot */}
          <View style={card.longPressHint} />

          {/* Admin edit button */}
          {isAdmin && (
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation?.(); setEditVisible(true); }}
              style={card.adminEditBtn}
              hitSlop={8}
              activeOpacity={0.75}
            >
              <Feather name="edit-2" size={11} color="#fff" />
            </TouchableOpacity>
          )}
        </Animated.View>
      </Pressable>
      {isAdmin && (
        <EditPosterModal
          visible={editVisible}
          onClose={() => setEditVisible(false)}
          itemKey={item.id}
          initialTitle={item.title}
          initialType={item.type === "series" ? "series" : "movie"}
        />
      )}
    </>
  );
});

// ─── Backdrop Card (16:9 wide) ────────────────────────────────────────────────
const BackdropCard = React.memo(function BackdropCard({
  item: rawItem, width = 260, height = 150,
  showProgress, showRating, showBadge, isLive, onPress, onLongPress,
}: ContentCardProps) {
  const colors = useColors();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const item = useAppliedContentItem(rawItem);
  const scale = useRef(new Animated.Value(1)).current;
  const [imgError, setImgError] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);

  const onPressIn = useCallback(() =>
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 28, bounciness: 3 }).start(), []);
  const onPressOut = useCallback(() =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 5 }).start(), []);

  const progressPct = Math.min((item.progress ?? 0) * 100, 100);
  const timeRemaining = item.progress && item.duration
    ? Math.round(parseInt(String(item.duration)) * (1 - item.progress))
    : null;

  return (
    <>
      <QuickMenu visible={menuVisible} item={item} onClose={() => setMenuVisible(false)} onWatch={onPress} />
      <Pressable
        onPress={onPress}
        onLongPress={() => { setMenuVisible(true); onLongPress?.(); }}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <Animated.View style={[bd.card, { width, height, borderRadius: colors.radius + 2, transform: [{ scale }] }]}>
          {!imgError && (item.backdropPath ?? item.posterPath) ? (
            <Image
              source={{ uri: item.backdropPath ?? item.posterPath }}
              style={[bd.image, { borderRadius: colors.radius + 2 }]}
              contentFit="cover"
              transition={Platform.OS === "web" ? 200 : 0}
              onError={() => setImgError(true)}
              cachePolicy="memory-disk"
            />
          ) : (
            <LinearGradient colors={["#1a1030", "#08060e"]} style={[bd.image, { borderRadius: colors.radius + 2 }]} />
          )}

          {/* Side gradient for text legibility */}
          <LinearGradient
            colors={["rgba(3,3,6,0.0)", "rgba(3,3,6,0.65)", "rgba(3,3,6,0.95)"]}
            locations={[0.2, 0.65, 1]}
            style={[bd.bottomGrad, { borderRadius: colors.radius + 2 }]}
          />

          {/* Left side gradient */}
          <LinearGradient
            colors={["rgba(3,3,6,0.55)", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.5, y: 0 }}
            style={StyleSheet.absoluteFill}
          />

          {isLive && <LivePulseBadge />}

          {/* Play button */}
          <View style={bd.playBtn}>
            <Feather name="play" size={14} color="#fff" style={{ marginLeft: 2 }} />
          </View>

          {/* Content info */}
          <View style={bd.info}>
            <Text style={bd.title} numberOfLines={1}>{item.title}</Text>
            <View style={bd.metaRow}>
              {item.year > 0 && <Text style={bd.meta}>{item.year}</Text>}
              {item.rating > 0 && (
                <>
                  <View style={bd.dot} />
                  <Text style={[bd.meta, { color: "#f59e0b" }]}>★ {item.rating.toFixed(1)}</Text>
                </>
              )}
              <View style={bd.dot} />
              <Text style={bd.meta}>{item.type === "series" ? "Série" : "Filme"}</Text>
            </View>
          </View>

          {showBadge && item.quality && (
            <View style={{ position: "absolute", top: 8, right: 8 }}>
              <QualityBadge quality={item.quality} />
            </View>
          )}

          {/* Progress */}
          {showProgress && progressPct > 0 && (
            <View style={bd.progressWrap}>
              {timeRemaining && timeRemaining > 0 && (
                <Text style={bd.progressTime}>{timeRemaining} min restantes</Text>
              )}
              <View style={bd.progressTrack}>
                <View style={[bd.progressFill, { width: `${progressPct}%` as any }]} />
              </View>
            </View>
          )}

          {/* Admin edit button */}
          {isAdmin && (
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation?.(); setEditVisible(true); }}
              style={card.adminEditBtn}
              hitSlop={8}
              activeOpacity={0.75}
            >
              <Feather name="edit-2" size={11} color="#fff" />
            </TouchableOpacity>
          )}
        </Animated.View>
      </Pressable>
      {isAdmin && (
        <EditPosterModal
          visible={editVisible}
          onClose={() => setEditVisible(false)}
          itemKey={item.id}
          initialTitle={item.title}
          initialType={item.type === "series" ? "series" : "movie"}
        />
      )}
    </>
  );
});

// ─── Spotlight Card (wide + side info panel) ──────────────────────────────────
const SpotlightCard = React.memo(function SpotlightCard({
  item, width = 300, height = 180, onPress, onLongPress,
}: ContentCardProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;
  const [imgError, setImgError] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  const onPressIn = useCallback(() =>
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 28, bounciness: 3 }).start(), []);
  const onPressOut = useCallback(() =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 5 }).start(), []);

  return (
    <>
      <QuickMenu visible={menuVisible} item={item} onClose={() => setMenuVisible(false)} onWatch={onPress} />
      <Pressable onPress={onPress} onLongPress={() => setMenuVisible(true)} onPressIn={onPressIn} onPressOut={onPressOut}>
        <Animated.View style={[sp.card, { width, height, borderRadius: colors.radius + 4, transform: [{ scale }] }]}>
          {/* Backdrop */}
          <View style={sp.imageSection}>
            {!imgError && (item.backdropPath ?? item.posterPath) ? (
              <Image
                source={{ uri: item.backdropPath ?? item.posterPath }}
                style={sp.image}
                contentFit="cover"
                onError={() => setImgError(true)}
                cachePolicy="memory-disk"
              />
            ) : (
              <LinearGradient colors={["#1a1030", "#0a0a14"]} style={sp.image} />
            )}
            <LinearGradient
              colors={["transparent", "rgba(10,8,18,0.98)"]}
              start={{ x: 0.4, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </View>

          {/* Info panel */}
          <View style={sp.infoPanel}>
            {item.posterPath && (
              <Image
                source={{ uri: item.posterPath }}
                style={sp.miniPoster}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            )}
            <View style={sp.infoText}>
              <Text style={sp.title} numberOfLines={2}>{item.title}</Text>
              <View style={sp.metaRow}>
                <Text style={sp.meta}>{item.year}</Text>
                {item.rating > 0 && (
                  <>
                    <View style={sp.dot} />
                    <Text style={[sp.meta, { color: "#f59e0b" }]}>★ {item.rating.toFixed(1)}</Text>
                  </>
                )}
              </View>
              {item.description && (
                <Text style={sp.desc} numberOfLines={2}>{item.description}</Text>
              )}
              <Pressable onPress={onPress} style={sp.watchBtn}>
                <Feather name="play" size={11} color="#fff" />
                <Text style={sp.watchText}>Assistir</Text>
              </Pressable>
            </View>
          </View>

          {/* "Em destaque" pill */}
          <View style={sp.featuredPill}>
            <Text style={sp.featuredText}>✦ EM DESTAQUE</Text>
          </View>
        </Animated.View>
      </Pressable>
    </>
  );
});

// ─── Mini Card (compact list row) ─────────────────────────────────────────────
const MiniCard = React.memo(function MiniCard({
  item, width = 280, onPress, onLongPress,
}: ContentCardProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;
  const [imgError, setImgError] = useState(false);

  const onPressIn = useCallback(() =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 28, bounciness: 3 }).start(), []);
  const onPressOut = useCallback(() =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 5 }).start(), []);

  const progressPct = Math.min((item.progress ?? 0) * 100, 100);

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[mi.card, { width, borderRadius: colors.radius, transform: [{ scale }] }]}>
        {/* Thumbnail */}
        <View style={mi.thumb}>
          {!imgError && item.posterPath ? (
            <Image
              source={{ uri: item.posterPath }}
              style={mi.thumbImg}
              contentFit="cover"
              onError={() => setImgError(true)}
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[mi.thumbImg, { backgroundColor: "#1a1525", alignItems: "center", justifyContent: "center" }]}>
              <Feather name="film" size={16} color="#333" />
            </View>
          )}
          {progressPct > 0 && (
            <View style={mi.progressBar}>
              <View style={[mi.progressFill, { width: `${progressPct}%` as any }]} />
            </View>
          )}
          {/* Play icon overlay */}
          <View style={mi.playOverlay}>
            <Feather name="play" size={11} color="rgba(255,255,255,0.8)" />
          </View>
        </View>

        {/* Info */}
        <View style={mi.info}>
          <Text style={mi.title} numberOfLines={1}>{item.title}</Text>
          <View style={mi.metaRow}>
            <Text style={mi.meta}>{item.year}</Text>
            {item.rating > 0 && (
              <>
                <View style={mi.dot} />
                <Text style={[mi.meta, { color: "#f59e0b" }]}>★ {item.rating.toFixed(1)}</Text>
              </>
            )}
            {item.type && (
              <>
                <View style={mi.dot} />
                <Text style={mi.meta}>{item.type === "series" ? "Série" : "Filme"}</Text>
              </>
            )}
          </View>
          {item.description && (
            <Text style={mi.desc} numberOfLines={1}>{item.description}</Text>
          )}
        </View>

        {/* Action */}
        <TouchableOpacity onPress={onPress} style={mi.actionBtn} activeOpacity={0.7}>
          <Feather name="play" size={14} color="#e50914" />
        </TouchableOpacity>
      </Animated.View>
    </Pressable>
  );
});

// ─── Featured card (tall, full-overlay cinematic) ─────────────────────────────
const FeaturedCard = React.memo(function FeaturedCard({
  item, width = 200, height = 280, onPress, onLongPress,
}: ContentCardProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;
  const [imgError, setImgError] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  const onPressIn = useCallback(() =>
    Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 26, bounciness: 4 }).start(), []);
  const onPressOut = useCallback(() =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 5 }).start(), []);

  return (
    <>
      <QuickMenu visible={menuVisible} item={item} onClose={() => setMenuVisible(false)} onWatch={onPress} />
      <Pressable onPress={onPress} onLongPress={() => setMenuVisible(true)} onPressIn={onPressIn} onPressOut={onPressOut}>
        <Animated.View style={[ft.card, { width, height, borderRadius: colors.radius + 2, transform: [{ scale }] }]}>
          {!imgError && item.posterPath ? (
            <Image
              source={{ uri: item.posterPath }}
              style={[ft.image, { borderRadius: colors.radius + 2 }]}
              contentFit="cover"
              onError={() => setImgError(true)}
              cachePolicy="memory-disk"
            />
          ) : (
            <LinearGradient colors={["#1a1030", "#0a0a14"]} style={[ft.image, { borderRadius: colors.radius + 2 }]} />
          )}

          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.4)", "rgba(0,0,0,0.92)"]}
            locations={[0.4, 0.65, 1]}
            style={[ft.grad, { borderRadius: colors.radius + 2 }]}
          />

          {/* Badges */}
          {isRecentContent(item.year) && (
            <View style={[ft.topBadge, { backgroundColor: "#e50914" }]}>
              <Text style={ft.topBadgeText}>NOVO</Text>
            </View>
          )}

          {item.quality && (
            <View style={{ position: "absolute", top: 8, right: 8 }}>
              <QualityBadge quality={item.quality} />
            </View>
          )}

          {/* Bottom info */}
          <View style={ft.bottom}>
            <Text style={ft.title} numberOfLines={2}>{item.title}</Text>
            <View style={ft.metaRow}>
              {item.rating > 0 && (
                <View style={ft.imdb}>
                  <Text style={ft.imdbLabel}>IMDb</Text>
                  <Text style={ft.imdbVal}>{item.rating.toFixed(1)}</Text>
                </View>
              )}
              <Text style={ft.year}>{item.year}</Text>
            </View>
            <View style={ft.actions}>
              <Pressable onPress={onPress} style={ft.playBtn}>
                <Feather name="play" size={11} color="#fff" style={{ marginLeft: 1 }} />
                <Text style={ft.playText}>Assistir</Text>
              </Pressable>
              <TouchableOpacity onPress={() => setMenuVisible(true)} style={ft.moreBtn}>
                <Feather name="more-vertical" size={14} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </>
  );
});

// ─── Square card (1:1) ────────────────────────────────────────────────────────
const SquareCard = React.memo(function SquareCard({
  item, width = 140, onPress, onLongPress, showBadge,
}: ContentCardProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;
  const [imgError, setImgError] = useState(false);

  const onPressIn = useCallback(() =>
    Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 28, bounciness: 4 }).start(), []);
  const onPressOut = useCallback(() =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 5 }).start(), []);

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[sq.card, { width, height: width, borderRadius: colors.radius + 2, transform: [{ scale }] }]}>
        {!imgError && (item.backdropPath ?? item.posterPath) ? (
          <Image
            source={{ uri: item.backdropPath ?? item.posterPath }}
            style={[sq.image, { borderRadius: colors.radius + 2 }]}
            contentFit="cover"
            onError={() => setImgError(true)}
            cachePolicy="memory-disk"
          />
        ) : (
          <LinearGradient colors={["#1a1030", "#0a0a14"]} style={[sq.image, { borderRadius: colors.radius + 2 }]} />
        )}

        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.8)"]}
          locations={[0.4, 1]}
          style={[sq.grad, { borderRadius: colors.radius + 2 }]}
        />

        {showBadge && isRecentContent(item.year) && (
          <View style={sq.newBadge}>
            <Text style={sq.newText}>NOVO</Text>
          </View>
        )}

        <View style={sq.bottom}>
          <Text style={sq.title} numberOfLines={1}>{item.title}</Text>
          {item.rating > 0 && (
            <Text style={sq.rating}>★ {item.rating.toFixed(1)}</Text>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
});

// ─── Public API: ContentCard dispatcher ──────────────────────────────────────
export function ContentCard(props: ContentCardProps) {
  const { variant = "poster" } = props;
  if (variant === "backdrop") return <BackdropCard {...props} />;
  if (variant === "spotlight") return <SpotlightCard {...props} />;
  if (variant === "mini") return <MiniCard {...props} />;
  if (variant === "featured") return <FeaturedCard {...props} />;
  if (variant === "square") return <SquareCard {...props} />;
  return <PosterCard {...props} />;
}

interface ContentCardWithLabelProps extends ContentCardProps {
  showTitle?: boolean;
}
export const ContentCardWithLabel = React.memo(function ContentCardWithLabel({
  item, width = 118, height = 170,
  showProgress = false, showTitle = true, showRating, showBadge = true,
  showMatchScore, rank, isLive, variant = "poster", accentColor,
  onPress, onLongPress,
}: ContentCardWithLabelProps) {
  const colors = useColors();
  return (
    <View style={[lw.wrap, { width }]}>
      <ContentCard
        item={item} width={width} height={height}
        showProgress={showProgress} showRating={showRating}
        showBadge={showBadge} showMatchScore={showMatchScore}
        rank={rank} isLive={isLive} variant={variant}
        accentColor={accentColor}
        onPress={onPress} onLongPress={onLongPress}
      />
      {showTitle && variant === "poster" && (
        <Text style={[lw.label, { color: colors.mutedForeground }]} numberOfLines={1}>
          {item.title.replace(/\s*\[[^\]]*\]/g, "").replace(/\s*\(\d{4}\)/g, "").trim()}
        </Text>
      )}
    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const card = StyleSheet.create({
  base: {
    overflow: "hidden",
    backgroundColor: "#0a0a14",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10 },
      android: { elevation: 5 },
    }),
  },
  image: { width: "100%", height: "100%" },
  bottomGrad: { position: "absolute", bottom: 0, left: 0, right: 0, height: "60%" },
  pressOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.32)",
    alignItems: "center",
    justifyContent: "center",
  },
  playCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(229,9,20,0.9)",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: "#e50914", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 14 },
    }),
  },
  topLeft: { position: "absolute", top: 7, left: 7, gap: 4 },
  typeChip: {
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 5, width: 20, height: 20,
    alignItems: "center", justifyContent: "center",
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.12)",
  },
  cornerBadge: {
    position: "absolute", top: 7, right: 7,
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5,
  },
  cornerBadgeText: { color: "#fff", fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  bottomLeft: { position: "absolute", bottom: 22, left: 7 },
  ratingWrap: { position: "absolute", bottom: 22, right: 6 },
  imdbPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#f5c518", borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  imdbLabel: { color: "#000", fontSize: 8, fontWeight: "900", letterSpacing: 0.3 },
  imdbValue: { color: "#000", fontSize: 10, fontWeight: "800" },
  exclusiveRibbon: {
    position: "absolute", bottom: 4, left: 0,
    backgroundColor: "rgba(229,9,20,0.9)",
    paddingHorizontal: 7, paddingVertical: 3,
    borderTopRightRadius: 6, borderBottomRightRadius: 6,
  },
  exclusiveText: { color: "#fff", fontSize: 6.5, fontWeight: "900", letterSpacing: 0.6 },
  progressWrap: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 6, paddingBottom: 5 },
  progressTime: { color: "rgba(255,255,255,0.55)", fontSize: 8, fontWeight: "500", marginBottom: 3 },
  progressTrack: { height: 3, borderRadius: 2, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.15)" },
  progressFill: { height: 3, borderRadius: 2 },
  matchWrap: { position: "absolute", top: 7, left: 7 },
  longPressHint: {
    position: "absolute", bottom: 6, right: 6,
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  adminEditBtn: {
    position: "absolute", top: 6, left: 6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center",
    zIndex: 20,
  },
});

const b = StyleSheet.create({
  qualityBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
  qualityText: { fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  audioBadgeRow: { flexDirection: "column", gap: 2 },
  audioBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
  audioText: { fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  matchBadge: {
    borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 6, paddingVertical: 3,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  matchPct: { fontSize: 11, fontWeight: "800" },
  matchLabel: { color: "rgba(255,255,255,0.55)", fontSize: 8, fontWeight: "500" },
  liveBadge: {
    position: "absolute", top: 7, left: 7,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(229,9,20,0.88)",
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveText: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  episodeBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 5, paddingHorizontal: 5, paddingVertical: 3,
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.15)",
  },
  episodeText: { color: "rgba(255,255,255,0.7)", fontSize: 7, fontWeight: "700" },
  rankGold: {
    position: "absolute", top: 7, right: 7,
    flexDirection: "row", alignItems: "center", gap: 2,
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4,
  },
  rankGoldText: { color: "#000", fontSize: 9, fontWeight: "900" },
  rankBadge: {
    position: "absolute", top: 7, right: 7,
    backgroundColor: "rgba(229,9,20,0.88)",
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
  },
  rankText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  sparkle: { marginTop: -1 },
  sparkleText: { color: "#fff", fontSize: 8 },
});

const bd = StyleSheet.create({
  card: {
    overflow: "hidden", backgroundColor: "#0a0a14",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  image: { width: "100%", height: "100%" },
  bottomGrad: { position: "absolute", bottom: 0, left: 0, right: 0, height: "75%" },
  playBtn: {
    position: "absolute", top: 10, right: 10,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "rgba(229,9,20,0.85)",
    alignItems: "center", justifyContent: "center",
  },
  info: { position: "absolute", bottom: 0, left: 0, right: 44, padding: 10 },
  title: { color: "#fff", fontSize: 13, fontWeight: "700", letterSpacing: -0.2, marginBottom: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  meta: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "500" },
  dot: { width: 2.5, height: 2.5, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.3)" },
  progressWrap: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8 },
  progressTime: { color: "rgba(255,255,255,0.5)", fontSize: 9, marginBottom: 4 },
  progressTrack: { height: 3, borderRadius: 2, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.18)" },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: "#e50914" },
});

const sp = StyleSheet.create({
  card: {
    overflow: "hidden", backgroundColor: "#0a0812", flexDirection: "row",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  imageSection: { flex: 1 },
  image: { width: "100%", height: "100%" },
  infoPanel: {
    width: 160, paddingVertical: 14, paddingHorizontal: 12,
    flexDirection: "row", gap: 10, alignItems: "flex-start",
  },
  miniPoster: { width: 50, height: 72, borderRadius: 8 },
  infoText: { flex: 1, gap: 4 },
  title: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: -0.3, lineHeight: 17 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  meta: { color: "rgba(255,255,255,0.5)", fontSize: 11 },
  dot: { width: 2.5, height: 2.5, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.3)" },
  desc: { color: "rgba(255,255,255,0.45)", fontSize: 10, lineHeight: 14 },
  watchBtn: {
    marginTop: 4, flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#e50914", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7, alignSelf: "flex-start",
  },
  watchText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  featuredPill: {
    position: "absolute", top: 10, left: 10,
    backgroundColor: "rgba(229,9,20,0.9)",
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  featuredText: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
});

const mi = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 10, marginBottom: 8,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
  },
  thumb: { width: 62, height: 88, borderRadius: 8, overflow: "hidden", position: "relative" },
  thumbImg: { width: "100%", height: "100%" },
  progressBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    height: 3, backgroundColor: "rgba(255,255,255,0.15)",
  },
  progressFill: { height: "100%", backgroundColor: "#e50914", borderRadius: 2 },
  playOverlay: {
    position: "absolute", bottom: 6, right: 6,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 10, width: 20, height: 20,
    alignItems: "center", justifyContent: "center",
  },
  info: { flex: 1, gap: 3 },
  title: { color: "#fff", fontSize: 13, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  meta: { color: "rgba(255,255,255,0.5)", fontSize: 11 },
  dot: { width: 2.5, height: 2.5, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.3)" },
  desc: { color: "rgba(255,255,255,0.38)", fontSize: 11, lineHeight: 15 },
  actionBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(229,9,20,0.12)",
    borderWidth: 1, borderColor: "rgba(229,9,20,0.3)",
    alignItems: "center", justifyContent: "center",
  },
});

const ft = StyleSheet.create({
  card: {
    overflow: "hidden", backgroundColor: "#0a0a14",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  image: { width: "100%", height: "100%" },
  grad: { position: "absolute", bottom: 0, left: 0, right: 0, height: "65%" },
  topBadge: {
    position: "absolute", top: 8, right: 8,
    paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6,
  },
  topBadgeText: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 12, gap: 6 },
  title: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: -0.3, lineHeight: 17 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  imdb: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#f5c518", borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  imdbLabel: { color: "#000", fontSize: 8, fontWeight: "900" },
  imdbVal: { color: "#000", fontSize: 10, fontWeight: "800" },
  year: { color: "rgba(255,255,255,0.5)", fontSize: 11 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  playBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#e50914", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  playText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  moreBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
});

const sq = StyleSheet.create({
  card: {
    overflow: "hidden", backgroundColor: "#0a0a14",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  image: { width: "100%", height: "100%" },
  grad: { position: "absolute", bottom: 0, left: 0, right: 0, height: "55%" },
  newBadge: {
    position: "absolute", top: 7, right: 7,
    backgroundColor: "#e50914", borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  newText: { color: "#fff", fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8, gap: 2 },
  title: { color: "#fff", fontSize: 11, fontWeight: "700" },
  rating: { color: "#f59e0b", fontSize: 10, fontWeight: "600" },
});

const lw = StyleSheet.create({
  wrap: { marginRight: 10 },
  label: { fontSize: 11, fontWeight: "500", marginTop: 7, paddingHorizontal: 1 },
});

const qm = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#12101e",
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32,
    borderTopWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center", marginBottom: 16,
  },
  title: { color: "#fff", fontSize: 16, fontWeight: "800", marginBottom: 2 },
  meta: { color: "rgba(255,255,255,0.45)", fontSize: 12, marginBottom: 12 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginBottom: 8 },
  action: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 12, paddingHorizontal: 4,
  },
  iconCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center", justifyContent: "center",
  },
  actionLabel: { flex: 1, color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "600" },
});
