import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { getApiBase } from "@/lib/api";
import { ProfileAvatarButton } from "@/components/ProfileAvatarButton";

let WebView: any = null;
try { WebView = require("react-native-webview").WebView; } catch {}

const { width: W, height: H } = Dimensions.get("window");
const RED = "#e50914";
const IS_NATIVE = Platform.OS !== "web";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShortItem {
  id: string;
  tmdbId: number;
  title: string;
  type: "movie" | "tv";
  backdrop: string | null;
  poster: string | null;
  overview: string;
  year: number;
  rating: number;
  genre: string;
  genreIds: number[];
  runtime: number;
  startTimePct: number;
  startTimeSeconds: number;
  clipDurationSeconds: number;
  sceneLabel: string;
  availableOnFlix2: boolean;
  liked: boolean;
  likes: number;
  saved: boolean;
}

type VideoState = "idle" | "resolving" | "playing" | "error";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function buildShortVideoHtml(
  streamUrl: string,
  startTimeSeconds: number,
  clipDurationSeconds: number,
  muted: boolean,
): string {
  const escaped = streamUrl.replace(/'/g, "\\'").replace(/"/g, "&quot;");
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;background:#000}
html,body,video{width:100%;height:100%;overflow:hidden}
video{object-fit:cover;display:block}
</style>
</head>
<body>
<video id="v" playsinline webkit-playsinline preload="auto" ${muted ? "muted" : ""}></video>
<script>
(function(){
  var v = document.getElementById('v');
  var START = ${startTimeSeconds};
  var CLIP  = ${clipDurationSeconds};
  var rn    = window.ReactNativeWebView;

  function send(obj) {
    try { rn && rn.postMessage(JSON.stringify(obj)); } catch(e){}
  }

  v.addEventListener('loadedmetadata', function() {
    v.currentTime = START;
    v.play().catch(function(){});
    send({ type: 'ready', duration: v.duration });
  });

  v.addEventListener('timeupdate', function() {
    if (v.currentTime >= START + CLIP) {
      v.currentTime = START;
    }
    send({ type: 'progress', position: v.currentTime, duration: v.duration });
  });

  v.addEventListener('error', function() {
    send({ type: 'error', msg: 'video error' });
  });

  v.addEventListener('stalled', function() {
    send({ type: 'buffering' });
  });

  function handleCmd(e) {
    try {
      var d = typeof e === 'string' ? e : (e.data || '{}');
      var cmd = JSON.parse(d);
      if (cmd.type === 'play')   { v.currentTime = START; v.play().catch(function(){}); }
      if (cmd.type === 'pause')  { v.pause(); }
      if (cmd.type === 'mute')   { v.muted = true; }
      if (cmd.type === 'unmute') { v.muted = false; }
    } catch(ex){}
  }

  document.addEventListener('message', handleCmd);
  window.addEventListener('message', handleCmd);

  v.src = '${escaped}';
  v.load();
})();
</script>
</body>
</html>`;
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({
  icon, label, color = "#fff", onPress, active = false,
}: {
  icon: string; label: string; color?: string; onPress: () => void; active?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const tap = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.72, duration: 75, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 320, friction: 5 }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity onPress={tap} activeOpacity={0.8} style={s.actionBtn}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Feather name={icon as any} size={28} color={active ? RED : color} />
      </Animated.View>
      <Text style={[s.actionLabel, active && { color: RED }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Short Video Card ─────────────────────────────────────────────────────────

function ShortVideoCard({
  item,
  isVisible,
  onLike,
  onSave,
  onDetail,
}: {
  item: ShortItem;
  isVisible: boolean;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onDetail: (item: ShortItem) => void;
}) {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const [videoState, setVideoState] = useState<VideoState>("idle");
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const webviewRef = useRef<any>(null);

  const infoY   = useRef(new Animated.Value(30)).current;
  const infoOp  = useRef(new Animated.Value(0)).current;
  const aiBadgeScale = useRef(new Animated.Value(0)).current;

  // Resolve stream URL when visible — calls flix2/lookup directly
  useEffect(() => {
    if (!isVisible || videoState !== "idle") return;

    setVideoState("resolving");

    const resolve = async () => {
      try {
        const base = getApiBase(); // sync, returns /api or https://domain/api
        const catalogType = item.type === "movie" ? "movies" : "series";
        // Use tmdbId=0 for title-only lookup (most Flix2 items have no tmdb_id)
        const url = `${base}/r2/flix2/lookup?tmdbId=${item.tmdbId}&type=${catalogType}&title=${encodeURIComponent(item.title)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error("lookup failed");
        const data = await res.json() as any;
        const raw = data.item?.stream_url ?? "";
        // Only accept direct video URLs — series info URLs (player_api.php) are not playable
        const isDirectVideo = raw && !raw.startsWith("flix2id:") && !raw.includes("player_api.php");
        if (data.found && isDirectVideo) {
          setStreamUrl(raw);
          setVideoState("playing");
        } else {
          setVideoState("error");
        }
      } catch {
        setVideoState("error");
      }
    };

    resolve();
  }, [isVisible]);

  // Inject play/pause commands when visibility changes
  useEffect(() => {
    if (videoState !== "playing" || !webviewRef.current) return;
    const cmd = isVisible ? { type: "play" } : { type: "pause" };
    const js = `(function(){ var e = new MessageEvent('message',{data:'${JSON.stringify(cmd).replace(/'/g, "\\'")}'}); window.dispatchEvent(e); })(); true;`;
    webviewRef.current.injectJavaScript?.(js);
  }, [isVisible, videoState]);

  // Animate info overlay
  useEffect(() => {
    if (isVisible) {
      Animated.parallel([
        Animated.timing(infoY, { toValue: 0, duration: 380, useNativeDriver: true, delay: 100 }),
        Animated.timing(infoOp, { toValue: 1, duration: 340, useNativeDriver: true, delay: 100 }),
        Animated.spring(aiBadgeScale, { toValue: 1, useNativeDriver: true, tension: 220, friction: 6, delay: 500 }),
      ]).start();
    } else {
      infoY.setValue(30);
      infoOp.setValue(0);
      aiBadgeScale.setValue(0);
    }
  }, [isVisible]);

  const injectMute = (m: boolean) => {
    if (!webviewRef.current) return;
    const cmd = m ? { type: "mute" } : { type: "unmute" };
    const js = `(function(){ var e = new MessageEvent('message',{data:'${JSON.stringify(cmd).replace(/'/g, "\\'")}'}); window.dispatchEvent(e); })(); true;`;
    webviewRef.current.injectJavaScript?.(js);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    injectMute(next);
  };

  const showVideo = videoState === "playing" && streamUrl && IS_NATIVE && WebView;
  const showProxyVideo = videoState === "playing" && streamUrl && isWeb;

  const html = showVideo
    ? buildShortVideoHtml(streamUrl, item.startTimeSeconds, item.clipDurationSeconds, muted)
    : null;

  return (
    <View style={{ width: W, height: H }}>

      {/* ── Background: WebView video or TMDB backdrop ── */}
      {showVideo && html ? (
        <WebView
          ref={webviewRef}
          style={StyleSheet.absoluteFill}
          source={{ html }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsAirPlayForMediaPlayback={false}
          javaScriptEnabled
          onMessage={(e: any) => {
            try {
              const msg = JSON.parse(e.nativeEvent.data);
              if (msg.type === "error") setVideoState("error");
            } catch {}
          }}
          scrollEnabled={false}
          bounces={false}
        />
      ) : showProxyVideo ? (
        // Web: simple video element via proxy
        <View style={StyleSheet.absoluteFill}>
          <Image
            source={{ uri: item.backdrop ?? undefined }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        </View>
      ) : (
        <Image
          source={{ uri: item.backdrop ?? undefined }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={400}
        />
      )}

      {/* ── Top gradient ── */}
      <LinearGradient
        colors={["rgba(0,0,0,0.55)", "transparent"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: topPad + 80 }}
        pointerEvents="none"
      />

      {/* ── Bottom gradient ── */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.90)"]}
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: H * 0.60 }}
        pointerEvents="none"
      />

      {/* ── Resolving / buffering indicator ── */}
      {videoState === "resolving" && (
        <View style={s.spinnerWrap} pointerEvents="none">
          <Feather name="loader" size={28} color="rgba(255,255,255,0.6)" />
        </View>
      )}

      {/* ── Right action column ── */}
      <View style={[s.actions, { bottom: bottomPad + 100 }]}>
        <ActionBtn
          icon="heart"
          label={fmtNum(item.likes + (item.liked ? 1 : 0))}
          active={item.liked}
          onPress={() => onLike(item.id)}
        />
        <ActionBtn
          icon="bookmark"
          label="Salvar"
          active={item.saved}
          onPress={() => onSave(item.id)}
        />
        <ActionBtn
          icon="share-2"
          label="Partilhar"
          onPress={() => {}}
        />
        <ActionBtn
          icon="info"
          label="Detalhes"
          onPress={() => onDetail(item)}
        />
        {/* Mute toggle — só mostra quando o vídeo está tocando */}
        {showVideo && (
          <ActionBtn
            icon={muted ? "volume-x" : "volume-2"}
            label={muted ? "Som" : "Mudo"}
            onPress={toggleMute}
          />
        )}
      </View>

      {/* ── Bottom info ── */}
      <Animated.View
        style={[s.info, { bottom: bottomPad + 92, opacity: infoOp, transform: [{ translateY: infoY }] }]}
        pointerEvents="box-none"
      >
        {/* AI Scene badge */}
        <Animated.View style={[s.aiBadge, { transform: [{ scale: aiBadgeScale }] }]}>
          <LinearGradient colors={["#7c3aed", "#a855f7"]} style={s.aiBadgeInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Feather name="zap" size={10} color="#fff" />
            <Text style={s.aiBadgeText}>IA • {item.sceneLabel}</Text>
          </LinearGradient>
        </Animated.View>

        {/* Poster + info row */}
        <View style={s.infoRow}>
          <Image source={{ uri: item.poster ?? undefined }} style={s.miniPoster} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={s.infoTitle} numberOfLines={2}>{item.title}</Text>
            <View style={s.infoMeta}>
              <View style={s.genrePill}>
                <Text style={s.genreText}>{item.genre}</Text>
              </View>
              <Text style={s.metaText}>{item.year}</Text>
              <Feather name="star" size={11} color="#f59e0b" />
              <Text style={[s.metaText, { color: "#f59e0b" }]}>{item.rating}</Text>
            </View>
            <Text style={s.overview} numberOfLines={2}>{item.overview}</Text>
          </View>
        </View>

        {/* Watch full + clip info */}
        <View style={s.bottomRow}>
          <TouchableOpacity style={s.watchBtn} onPress={() => onDetail(item)} activeOpacity={0.85}>
            <Feather name="play-circle" size={15} color="#fff" />
            <Text style={s.watchBtnText}>Assistir completo</Text>
          </TouchableOpacity>

          {showVideo && (
            <View style={s.clipPill}>
              <Feather name="scissors" size={10} color="rgba(255,255,255,0.7)" />
              <Text style={s.clipText}>{item.clipDurationSeconds}s</Text>
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Fetch shorts feed ────────────────────────────────────────────────────────

async function fetchShortsFeed(page = 1): Promise<ShortItem[]> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/shorts/feed?page=${page}&limit=20`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error("feed error");
    const data = await res.json() as any;
    return (data.items ?? []).map((item: any, i: number) => ({
      ...item,
      liked: false,
      likes: Math.floor(Math.random() * 9000) + 1000,
      saved: false,
    }));
  } catch {
    return [];
  }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ShortsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [items, setItems] = useState<ShortItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadFeed = useCallback(async (p = 1) => {
    if (p === 1) setLoading(true);
    else setLoadingMore(true);

    const newItems = await fetchShortsFeed(p);
    setItems((prev) => p === 1 ? newItems : [...prev, ...newItems]);
    setHasMore(newItems.length >= 20);
    setPage(p);

    if (p === 1) setLoading(false);
    else setLoadingMore(false);
  }, []);

  useEffect(() => { loadFeed(1); }, []);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    loadFeed(page + 1);
  }, [loadingMore, hasMore, page, loadFeed]);

  const onLike = useCallback((id: string) => {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, liked: !it.liked } : it));
  }, []);

  const onSave = useCallback((id: string) => {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, saved: !it.saved } : it));
  }, []);

  const onDetail = useCallback((item: ShortItem) => {
    router.push({
      pathname: "/detail",
      params: { type: item.type, id: String(item.tmdbId), title: item.title },
    });
  }, [router]);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 55 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        setVisibleIndex(viewableItems[0].index ?? 0);
      }
    }
  ).current;

  if (loading) {
    return (
      <View style={[s.root, { alignItems: "center", justifyContent: "center" }]}>
        <StatusBar style="light" />
        <View style={{ alignItems: "center", gap: 14 }}>
          <LinearGradient colors={["#7c3aed", "#e50914"]} style={s.loadingIcon}>
            <Feather name="zap" size={22} color="#fff" />
          </LinearGradient>
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "600" }}>
            IA selecionando as melhores cenas...
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
            Powered by TMDB + Flix 2.0
          </Text>
        </View>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[s.root, { alignItems: "center", justifyContent: "center" }]}>
        <StatusBar style="light" />
        <Feather name="scissors" size={48} color="rgba(255,255,255,0.2)" />
        <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 15, marginTop: 16 }}>
          Nenhum short disponível
        </Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* ── TikTok-style vertical feed ── */}
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={H}
        decelerationRate="fast"
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onEndReached={loadMore}
        onEndReachedThreshold={2}
        renderItem={({ item, index }) => (
          <ShortVideoCard
            item={item}
            isVisible={index === visibleIndex}
            onLike={onLike}
            onSave={onSave}
            onDetail={onDetail}
          />
        )}
        getItemLayout={(_, index) => ({ length: H, offset: H * index, index })}
      />

      {/* ── Floating header ── */}
      <View style={[s.header, { paddingTop: topPad + 8 }]} pointerEvents="box-none">
        <View style={s.headerInner}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <LinearGradient colors={["#7c3aed", "#e50914"]} style={s.headerIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Feather name="zap" size={13} color="#fff" />
            </LinearGradient>
            <Text style={s.headerTitle}>SHORTS</Text>
            <View style={s.aiHeaderBadge}>
              <Text style={s.aiHeaderBadgeText}>IA</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <TouchableOpacity
              style={s.iconBtn}
              onPress={() => router.push("/buscar")}
              activeOpacity={0.75}
            >
              <Feather name="search" size={20} color="rgba(255,255,255,0.82)" />
            </TouchableOpacity>
            <ProfileAvatarButton />
          </View>
        </View>
      </View>

      {/* ── Scroll indicator dots ── */}
      <View style={[s.dots, { top: topPad + 64 }]} pointerEvents="none">
        {items.slice(0, Math.min(items.length, 8)).map((_, i) => (
          <View
            key={i}
            style={[s.dot, i === visibleIndex % Math.min(items.length, 8) && s.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  // Header
  header: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
  },
  headerInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, paddingVertical: 6,
  },
  headerIcon: {
    width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center",
  },
  headerTitle: {
    color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: 2,
  },
  aiHeaderBadge: {
    backgroundColor: "#7c3aed", borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  aiHeaderBadgeText: {
    color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 1,
  },
  iconBtn: {
    width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20,
  },

  // Loading
  loadingIcon: {
    width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center",
  },

  // Dots
  dots: {
    position: "absolute", right: 6, flexDirection: "column", gap: 4, alignItems: "center",
  },
  dot: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)",
  },
  dotActive: {
    backgroundColor: RED, height: 12, borderRadius: 3,
  },

  // Spinner
  spinnerWrap: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },

  // Right actions
  actions: {
    position: "absolute", right: 12,
    alignItems: "center", gap: 18,
  },
  actionBtn: { alignItems: "center", gap: 4 },
  actionLabel: {
    color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "700",
  },

  // AI scene badge
  aiBadge: {
    alignSelf: "flex-start", marginBottom: 6,
  },
  aiBadgeInner: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
  },
  aiBadgeText: {
    color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.3,
  },

  // Bottom info
  info: {
    position: "absolute", left: 0, right: 80, paddingHorizontal: 16, gap: 8,
  },
  infoRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  miniPoster: {
    width: 52, height: 76, borderRadius: 8,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)",
  },
  infoTitle: {
    color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: 0.2, marginBottom: 5,
  },
  infoMeta: {
    flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4,
  },
  genrePill: {
    backgroundColor: "rgba(229,9,20,0.85)", borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  genreText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  metaText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600" },
  overview: { color: "rgba(255,255,255,0.6)", fontSize: 12, lineHeight: 17 },

  // Bottom row
  bottomRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
  },
  watchBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: RED, borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 16,
  },
  watchBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  clipPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  clipText: {
    color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "600",
  },
});
