import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";

const { width: W, height: H } = Dimensions.get("window");

let WebView: any = null;
try {
  WebView = require("react-native-webview").WebView;
} catch {
  WebView = null;
}

export default function PlayerScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    type: string;
    id: string;
    season?: string;
    episode?: string;
    title?: string;
  }>();

  const type = (params.type ?? "movie") as "movie" | "tv";
  const id = Number(params.id ?? 0);
  const season = Number(params.season ?? 1);
  const episode = Number(params.episode ?? 1);
  const title = params.title ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const playerUrl = api.redeflix.url(type, id, season, episode);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (!id) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.backBtn, { top: topPad + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
        </View>
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>ID inválido</Text>
      </View>
    );
  }

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <StatusBar style="light" />
        <View style={[styles.playerHeader, { paddingTop: topPad + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.playerTitle} numberOfLines={1}>
            {title || (type === "tv" ? `T${season}:E${episode}` : "Assistindo")}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.iframeWrap}>
          <iframe
            src={playerUrl}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              backgroundColor: "#000",
            }}
            allowFullScreen
            allow="autoplay; fullscreen; encrypted-media"
            title={title}
          />
        </View>
        {type === "tv" && (
          <View style={[styles.episodeBar, { backgroundColor: "rgba(0,0,0,0.8)" }]}>
            <Text style={[styles.episodeText, { color: colors.mutedForeground }]}>
              Temporada {season} — Episódio {episode}
            </Text>
            <View style={styles.episodeActions}>
              <Pressable
                style={[styles.epBtn, { borderColor: colors.border }]}
                onPress={() => {}}
              >
                <Feather name="chevron-left" size={16} color={colors.foreground} />
                <Text style={[styles.epBtnText, { color: colors.foreground }]}>Anterior</Text>
              </Pressable>
              <Pressable
                style={[styles.epBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => {}}
              >
                <Text style={[styles.epBtnText, { color: "#fff" }]}>Próximo</Text>
                <Feather name="chevron-right" size={16} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  }

  if (!WebView) {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <StatusBar style="light" />
        <View style={[styles.backBtn, { top: topPad + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.centered}>
          <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            WebView indisponível
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <StatusBar style="light" hidden />

      <WebView
        source={{ uri: playerUrl }}
        style={styles.webview}
        onLoadStart={() => { setLoading(true); setError(false); }}
        onLoadEnd={() => setLoading(false)}
        onError={() => { setError(true); setLoading(false); }}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
      />

      {loading && !error && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Carregando player...
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.loaderOverlay}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            Não foi possível carregar o player
          </Text>
          <Text style={[styles.errorUrl, { color: colors.border }]}>{playerUrl}</Text>
        </View>
      )}

      <View style={[styles.playerHeader, { paddingTop: topPad + 4 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color="rgba(255,255,255,0.9)" />
        </Pressable>
        {title ? (
          <Text style={styles.playerTitle} numberOfLines={1}>{title}</Text>
        ) : null}
        <View style={{ width: 40 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: "#000" },
  playerHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
    zIndex: 10,
    backgroundColor: "transparent",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  playerTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    marginHorizontal: 8,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  iframeWrap: {
    flex: 1,
    backgroundColor: "#000",
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    gap: 14,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "500",
  },
  errorText: {
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
  errorUrl: {
    fontSize: 11,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  backBtn: {
    position: "absolute",
    left: 12,
    zIndex: 10,
  },
  episodeBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  episodeText: {
    fontSize: 13,
    fontWeight: "500",
  },
  episodeActions: {
    flexDirection: "row",
    gap: 10,
  },
  epBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  epBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
