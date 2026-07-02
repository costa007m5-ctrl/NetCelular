import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";

const AMBER  = "#f59e0b";
const RED    = "#e50914";
const PINK   = "#ec4899";
const PURPLE = "#8b5cf6";
const BLUE   = "#3b82f6";
const GREEN  = "#22c55e";
const TEAL   = "#0891b2";
const ORANGE = "#f97316";

const TMDB_IMG = "https://image.tmdb.org/t/p/w185";
const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";

const ACTOR_CATEGORIES: Array<{
  id: string;
  label: string;
  emoji: string;
  color: string;
  actors: Array<{ name: string; initial: string; color: string }>;
}> = [
  {
    id: "hollywood",
    label: "Hollywood",
    emoji: "🎬",
    color: RED,
    actors: [
      { name: "Tom Cruise",         initial: "TC", color: RED    },
      { name: "Leonardo DiCaprio",  initial: "LD", color: BLUE   },
      { name: "Margot Robbie",      initial: "MR", color: PINK   },
      { name: "Timothée Chalamet",  initial: "TC", color: PURPLE },
      { name: "Zendaya",            initial: "ZE", color: AMBER  },
      { name: "Ryan Gosling",       initial: "RG", color: ORANGE },
      { name: "Ana de Armas",       initial: "AA", color: GREEN  },
      { name: "Florence Pugh",      initial: "FP", color: ORANGE },
      { name: "Cate Blanchett",     initial: "CB", color: TEAL   },
      { name: "Robert Downey Jr.",  initial: "RD", color: RED    },
      { name: "Scarlett Johansson", initial: "SJ", color: PURPLE },
      { name: "Chris Evans",        initial: "CE", color: BLUE   },
    ],
  },
  {
    id: "kdrama",
    label: "K-Drama",
    emoji: "🇰🇷",
    color: PINK,
    actors: [
      { name: "Song Joong-ki",   initial: "SJ", color: PINK   },
      { name: "Park Seo-jun",    initial: "PS", color: PURPLE },
      { name: "Hyun Bin",        initial: "HB", color: BLUE   },
      { name: "Lee Jong-suk",    initial: "LJ", color: GREEN  },
      { name: "IU",              initial: "IU", color: AMBER  },
      { name: "Park Min-young",  initial: "PM", color: ORANGE },
      { name: "Son Ye-jin",      initial: "SY", color: PINK   },
      { name: "Lee Min-ho",      initial: "LM", color: TEAL   },
      { name: "Park Shin-hye",   initial: "PS", color: PURPLE },
      { name: "Kim Soo-hyun",    initial: "KS", color: BLUE   },
    ],
  },
  {
    id: "brasileiros",
    label: "Brasileiros",
    emoji: "🇧🇷",
    color: GREEN,
    actors: [
      { name: "Wagner Moura",     initial: "WM", color: GREEN  },
      { name: "Alice Braga",      initial: "AB", color: AMBER  },
      { name: "Rodrigo Santoro",  initial: "RS", color: BLUE   },
      { name: "Fernanda Montenegro", initial: "FM", color: PINK },
      { name: "Lázaro Ramos",     initial: "LR", color: ORANGE },
      { name: "Taís Araújo",      initial: "TA", color: PURPLE },
      { name: "Pedro Pascal",     initial: "PP", color: TEAL   },
      { name: "Seu Jorge",        initial: "SJ", color: GREEN  },
      { name: "Bruna Marquezine", initial: "BM", color: PINK   },
      { name: "Caio Blat",        initial: "CB", color: BLUE   },
    ],
  },
  {
    id: "japoneses",
    label: "Japoneses",
    emoji: "🇯🇵",
    color: RED,
    actors: [
      { name: "Ken Watanabe",    initial: "KW", color: RED    },
      { name: "Hiroyuki Sanada", initial: "HS", color: AMBER  },
      { name: "Rinko Kikuchi",   initial: "RK", color: PINK   },
      { name: "Masaki Suda",     initial: "MS", color: PURPLE },
      { name: "Takuya Kimura",   initial: "TK", color: BLUE   },
      { name: "Yū Aoi",          initial: "YA", color: GREEN  },
      { name: "Ryo Kase",        initial: "RK", color: TEAL   },
      { name: "Eita Nagayama",   initial: "EN", color: ORANGE },
    ],
  },
  {
    id: "europeus",
    label: "Europeus",
    emoji: "🌍",
    color: PURPLE,
    actors: [
      { name: "Marion Cotillard", initial: "MC", color: PINK   },
      { name: "Javier Bardem",    initial: "JB", color: ORANGE },
      { name: "Penélope Cruz",    initial: "PC", color: RED    },
      { name: "Idris Elba",       initial: "IE", color: BLUE   },
      { name: "Sophie Turner",    initial: "ST", color: AMBER  },
      { name: "Rami Malek",       initial: "RM", color: PURPLE },
      { name: "Tilda Swinton",    initial: "TS", color: TEAL   },
      { name: "Antonio Banderas", initial: "AB", color: ORANGE },
    ],
  },
];

const _photoCache: Record<string, string | null> = {};
let _fetchActive = 0;
const _fetchQueue: Array<() => void> = [];
function drainQueue() {
  while (_fetchActive < 4 && _fetchQueue.length > 0) {
    _fetchActive++;
    _fetchQueue.shift()!();
  }
}

function ActorCircle({
  actor,
  onPress,
}: {
  actor: { name: string; initial: string; color: string };
  onPress: () => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState(false);
  const sc = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (_photoCache[actor.name] !== undefined) {
      setPhoto(_photoCache[actor.name]);
      return;
    }
    let cancelled = false;
    const doFetch = () => {
      fetch(
        `https://api.themoviedb.org/3/search/person?api_key=${TMDB_KEY}&query=${encodeURIComponent(actor.name)}&language=pt-BR`
      )
        .then((r) => r.json())
        .then((d) => {
          const path: string | null = d.results?.[0]?.profile_path ?? null;
          const url = path ? `${TMDB_IMG}${path}` : null;
          _photoCache[actor.name] = url;
          if (!cancelled) setPhoto(url);
        })
        .catch(() => { _photoCache[actor.name] = null; })
        .finally(() => {
          _fetchActive = Math.max(0, _fetchActive - 1);
          drainQueue();
        });
    };
    if (_fetchActive < 4) { _fetchActive++; doFetch(); }
    else { _fetchQueue.push(doFetch); }
    return () => { cancelled = true; };
  }, [actor.name]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() =>
        Animated.spring(sc, { toValue: 0.88, useNativeDriver: true, speed: 30 }).start()
      }
      onPressOut={() =>
        Animated.spring(sc, { toValue: 1, useNativeDriver: true, speed: 26 }).start()
      }
    >
      <Animated.View style={[st.circleWrap, { transform: [{ scale: sc }] }]}>
        <View style={[st.circle, { borderColor: `${actor.color}55` }]}>
          {!photoErr && photo ? (
            <Image
              source={{ uri: photo }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              onError={() => setPhotoErr(true)}
            />
          ) : (
            <>
              <LinearGradient
                colors={[`${actor.color}45`, `${actor.color}18`]}
                style={StyleSheet.absoluteFill}
              />
              <Text style={[st.initial, { color: actor.color }]}>{actor.initial}</Text>
            </>
          )}
        </View>
        <Text style={st.name} numberOfLines={2}>{actor.name}</Text>
      </Animated.View>
    </Pressable>
  );
}

export default function AtoresScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={st.root}>
      <StatusBar style="light" />

      {/* ── Header ── */}
      <View style={[st.header, { paddingTop: topPad + 10 }]}>
        <Pressable onPress={() => router.back()} hitSlop={14} style={st.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={st.logoRow}>
          <View style={st.logoAccent} />
          <Text style={[st.logoA, { color: AMBER }]}>ATOR</Text>
          <Text style={st.logoB}>ES</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {/* ── Subtitle ── */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <Text style={st.subtitle}>
          Toque em qualquer ator para explorar sua filmografia completa
        </Text>
      </View>

      {/* ── Categories ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {ACTOR_CATEGORIES.map((cat) => (
          <View key={cat.id} style={st.catSection}>
            {/* Category header */}
            <View style={st.catHeader}>
              <View style={[st.catBar, { backgroundColor: cat.color }]} />
              <Text style={st.catEmoji}>{cat.emoji}</Text>
              <Text style={[st.catLabel, { color: cat.color }]}>{cat.label}</Text>
            </View>

            {/* Actor row */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={st.actorRow}
              decelerationRate="fast"
            >
              {cat.actors.map((a) => (
                <ActorCircle
                  key={`${cat.id}-${a.name}`}
                  actor={a}
                  onPress={() =>
                    router.push({
                      pathname: "/actor-browse",
                      params: { name: a.name, color: a.color },
                    })
                  }
                />
              ))}
            </ScrollView>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  logoAccent: { width: 3, height: 22, borderRadius: 2, backgroundColor: AMBER },
  logoA: { fontSize: 22, fontWeight: "900", letterSpacing: 1 },
  logoB: { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: 1 },
  subtitle: {
    fontSize: 12, color: "rgba(255,255,255,0.38)",
    lineHeight: 18, fontStyle: "italic",
  },
  catSection: { marginBottom: 30 },
  catHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, marginBottom: 14, gap: 8,
  },
  catBar: { width: 3, height: 16, borderRadius: 2 },
  catEmoji: { fontSize: 15 },
  catLabel: { fontSize: 14, fontWeight: "800", letterSpacing: 0.3 },
  actorRow: { paddingHorizontal: 16, gap: 14, alignItems: "flex-start" },
  circleWrap: { alignItems: "center", gap: 7, width: 76 },
  circle: {
    width: 68, height: 68, borderRadius: 34,
    overflow: "hidden",
    borderWidth: 2,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#111",
  },
  initial: { fontSize: 22, fontWeight: "900" },
  name: {
    fontSize: 11, fontWeight: "600", color: "#fff",
    textAlign: "center", lineHeight: 15,
  },
});
