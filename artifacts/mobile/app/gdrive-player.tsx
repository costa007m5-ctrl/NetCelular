import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { parseEpisodeInfo, getStreamUrl } from "@/lib/gdrive-index";

const RED = "#e50914";
const AUTO_HIDE_MS = 4000;

const IS_WEB = Platform.OS === "web";

let WebView: any = null;
if (!IS_WEB) {
  try { WebView = require("react-native-webview").WebView; } catch {}
}

let ScreenOrientation: any = null;
try { ScreenOrientation = require("expo-screen-orientation"); } catch {}

let NavBar: any = null;
try { NavBar = require("expo-navigation-bar"); } catch {}

type PlaylistItem = { name: string; link: string };

function buildPlayerHTML(videoUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:100%; height:100%; background:#000; overflow:hidden; }
  video {
    width:100%; height:100%; object-fit:contain;
    background:#000;
  }
  #err {
    display:none; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
    color:#fff; font-family:sans-serif; font-size:14px; text-align:center; padding:20px;
  }
</style>
</head>
<body>
  <video id="v" src="${videoUrl}" autoplay controls playsinline preload="auto"
    onerror="document.getElementById('err').style.display='block'">
  </video>
  <div id="err">⚠️ Não foi possível carregar o vídeo.<br>Verifique sua conexão.</div>
  <script>
    var v = document.getElementById('v');
    v.addEventListener('error', function(e) {
      document.getElementById('err').style.display = 'block';
    });
    // Notify React Native when ready
    v.addEventListener('canplay', function() {
      try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'})); } catch(e) {}
    });
    v.addEventListener('timeupdate', function() {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type:'progress',
          currentTime: v.currentTime,
          duration: v.duration
        }));
      } catch(e) {}
    });
    v.addEventListener('ended', function() {
      try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'ended'})); } catch(e) {}
    });
  </script>
</body>
</html>`;
}

export default function GdrivePlayer() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    fileName: string;
    fileLink: string;
    drive: string;
    folderPath: string;
    playlist: string;
    currentIndex: string;
  }>();

  const playlist: PlaylistItem[] = (() => {
    try { return JSON.parse(params.playlist ?? "[]"); } catch { return []; }
  })();
  const [currentIndex, setCurrentIndex] = useState(
    Math.max(0, parseInt(params.currentIndex ?? "0", 10))
  );
  const currentItem = playlist[currentIndex] ?? {
    name: params.fileName ?? "",
    link: params.fileLink ?? "",
  };

  const streamUrl = getStreamUrl({ ...currentItem, id: "", driveId: "", mimeType: "", modifiedTime: "", kind: "drive#file" } as any);
  const ep = parseEpisodeInfo(currentItem.name);

  // Build the listing worker URL for web iframe player (supports MKV via video.js)
  const LISTING_WORKER = "https://1.animezey23112022.workers.dev";
  const webPlayerUrl = (() => {
    const drive = params.drive ?? "0";
    const folder = params.folderPath ?? "";
    const filename = currentItem.name;
    if (!filename) return "";
    const encodedFolder = folder.split("/").map(s => encodeURIComponent(s)).join("/");
    const encodedFile = encodeURIComponent(filename);
    const path = encodedFolder ? `${encodedFolder}/${encodedFile}` : encodedFile;
    return `${LISTING_WORKER}/${drive}:/${path}`;
  })();

  const [loading, setLoading] = useState(!IS_WEB);
  const [showControls, setShowControls] = useState(true);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webviewRef = useRef<any>(null);
  const webContainerRef = useRef<any>(null);
  const webVideoRef = useRef<any>(null);

  // Web-only: mount an iframe pointing to the listing worker's built-in video.js player
  useEffect(() => {
    if (!IS_WEB) return;
    const container = webContainerRef.current;
    if (!container) return;

    // Cleanup previous iframe/video
    if (webVideoRef.current) {
      webVideoRef.current = null;
    }
    while (container.firstChild) container.removeChild(container.firstChild);

    if (!webPlayerUrl) return;

    const iframe = document.createElement("iframe");
    iframe.src = webPlayerUrl;
    iframe.allow = "autoplay; fullscreen";
    iframe.setAttribute("allowfullscreen", "");
    iframe.style.cssText =
      "width:100%;height:100%;border:none;background:#000;display:block;";
    container.appendChild(iframe);
    webVideoRef.current = iframe;

    return () => {
      iframe.src = "about:blank";
    };
  }, [webPlayerUrl]);

  useEffect(() => {
    const lock = async () => {
      try {
        if (ScreenOrientation)
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.LANDSCAPE_LEFT
          );
        if (NavBar && Platform.OS === "android") {
          await NavBar.setVisibilityAsync("hidden");
          await NavBar.setBehaviorAsync("overlay-swipe");
        }
      } catch {}
    };
    lock();
    return () => {
      try {
        if (ScreenOrientation)
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
        if (NavBar && Platform.OS === "android")
          NavBar.setVisibilityAsync("visible").catch(() => {});
      } catch {}
    };
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setShowControls(false));
    }, AUTO_HIDE_MS);
  }, [controlsOpacity]);

  const showControlsNow = useCallback(() => {
    setShowControls(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    scheduleHide();
  }, [controlsOpacity, scheduleHide]);

  useEffect(() => {
    scheduleHide();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [scheduleHide]);

  const goToEpisode = useCallback((index: number) => {
    setCurrentIndex(index);
    if (!IS_WEB) setLoading(true);
    setVideoEnded(false);
    setShowPlaylist(false);
    showControlsNow();
  }, [showControlsNow]);

  const goNext = useCallback(() => {
    if (currentIndex < playlist.length - 1) goToEpisode(currentIndex + 1);
  }, [currentIndex, playlist.length, goToEpisode]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) goToEpisode(currentIndex - 1);
  }, [currentIndex, goToEpisode]);

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "ready") setLoading(false);
      if (msg.type === "ended") {
        setVideoEnded(true);
        showControlsNow();
      }
    } catch {}
  }, [showControlsNow]);

  const { width: W, height: H } = Dimensions.get("window");

  const hasNext = currentIndex < playlist.length - 1;
  const hasPrev = currentIndex > 0;

  // Web: render top bar + iframe + bottom nav (no overlay needed)
  if (IS_WEB) {
    return (
      <View style={[styles.container, { flexDirection: "column" }]}>
        <StatusBar hidden />
        {/* Top bar */}
        <View style={[styles.topBar, { backgroundColor: "rgba(0,0,0,0.9)", paddingTop: 12, paddingBottom: 10 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="chevron-left" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginHorizontal: 10 }}>
            {ep.season !== undefined && ep.episode !== undefined && (
              <Text style={styles.epLabel}>
                S{String(ep.season).padStart(2, "0")}E{String(ep.episode).padStart(2, "0")}
              </Text>
            )}
            <Text style={styles.titleText} numberOfLines={1}>
              {currentItem.name.replace(/\.[^.]+$/, "")}
            </Text>
          </View>
          {playlist.length > 1 && (
            <TouchableOpacity onPress={() => setShowPlaylist(true)} style={[styles.iconBtn, { flexDirection: "row", gap: 4 }]}>
              <Feather name="list" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 12 }}>{currentIndex + 1}/{playlist.length}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* iframe player - fills remaining space */}
        <View ref={webContainerRef} style={{ flex: 1, backgroundColor: "#000" }} />

        {/* Bottom episode navigation */}
        {playlist.length > 1 && (
          <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: "rgba(0,0,0,0.9)", paddingHorizontal: 24, paddingVertical: 10 }}>
            <TouchableOpacity onPress={goPrev} disabled={!hasPrev} style={{ alignItems: "center", opacity: hasPrev ? 1 : 0.3 }}>
              <Feather name="skip-back" size={24} color="#fff" />
              <Text style={styles.navLabel}>Anterior</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={goNext} disabled={!hasNext} style={{ alignItems: "center", opacity: hasNext ? 1 : 0.3 }}>
              <Feather name="skip-forward" size={24} color="#fff" />
              <Text style={styles.navLabel}>Próximo</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Playlist Modal */}
        <Modal visible={showPlaylist} transparent animationType="slide" onRequestClose={() => setShowPlaylist(false)}>
          <View style={styles.modalBg}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Episódios ({playlist.length})</Text>
                <TouchableOpacity onPress={() => setShowPlaylist(false)}>
                  <Feather name="x" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
              <FlatList
                data={playlist}
                keyExtractor={(_, i) => String(i)}
                showsVerticalScrollIndicator={false}
                renderItem={({ item: ep_item, index }) => {
                  const epInfo = parseEpisodeInfo(ep_item.name);
                  const isActive = index === currentIndex;
                  return (
                    <TouchableOpacity onPress={() => goToEpisode(index)} style={[styles.epItem, isActive && { backgroundColor: RED + "22", borderColor: RED + "60" }]}>
                      <View style={[styles.epNum, { backgroundColor: isActive ? RED : "#333" }]}>
                        <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
                          {epInfo.episode !== undefined ? `E${String(epInfo.episode).padStart(2, "0")}` : String(index + 1)}
                        </Text>
                      </View>
                      <Text style={[styles.epTitle, { color: isActive ? "#fff" : "#ccc" }]} numberOfLines={2}>
                        {ep_item.name.replace(/\.[^.]+$/, "")}
                      </Text>
                      {isActive && <Feather name="volume-2" size={14} color={RED} />}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Native player — WebView */}
      {WebView ? (
        <WebView
          ref={webviewRef}
          source={{ html: buildPlayerHTML(streamUrl) }}
          style={styles.webview}
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onMessage={handleMessage}
          originWhitelist={["*"]}
          mixedContentMode="always"
          javaScriptEnabled
        />
      ) : (
        <View style={[styles.webview, styles.center]}>
          <Text style={{ color: "#fff" }}>WebView não disponível nesta plataforma.</Text>
        </View>
      )}

      {/* Loading spinner */}
      {loading && (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: "#000" }]}>
          <ActivityIndicator color={RED} size="large" />
          <Text style={styles.loadingText}>Carregando vídeo...</Text>
        </View>
      )}

      {/* Touch area to toggle controls */}
      <Pressable style={StyleSheet.absoluteFill} onPress={showControlsNow} />

      {/* Controls overlay */}
      {showControls && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { opacity: controlsOpacity }]}>
          {/* Top bar */}
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
              <Feather name="chevron-left" size={26} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              {ep.season !== undefined && ep.episode !== undefined && (
                <Text style={styles.epLabel}>
                  S{String(ep.season).padStart(2, "0")}E{String(ep.episode).padStart(2, "0")}
                </Text>
              )}
              <Text style={styles.titleText} numberOfLines={1}>
                {currentItem.name.replace(/\.[^.]+$/, "")}
              </Text>
            </View>
            {playlist.length > 1 && (
              <TouchableOpacity
                onPress={() => setShowPlaylist(true)}
                style={[styles.iconBtn, { flexDirection: "row", gap: 4 }]}
              >
                <Feather name="list" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 12 }}>
                  {currentIndex + 1}/{playlist.length}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Center episode nav */}
          {playlist.length > 1 && (
            <View style={styles.centerNav}>
              <TouchableOpacity
                onPress={goPrev}
                style={[styles.navBtn, !hasPrev && { opacity: 0.3 }]}
                disabled={!hasPrev}
              >
                <Feather name="skip-back" size={28} color="#fff" />
                <Text style={styles.navLabel}>Anterior</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={goNext}
                style={[styles.navBtn, !hasNext && { opacity: 0.3 }]}
                disabled={!hasNext}
              >
                <Feather name="skip-forward" size={28} color="#fff" />
                <Text style={styles.navLabel}>Próximo</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Next episode after ended */}
          {videoEnded && hasNext && (
            <TouchableOpacity
              onPress={goNext}
              style={[styles.nextEpBtn, { backgroundColor: RED }]}
            >
              <Feather name="play" size={16} color="#fff" />
              <Text style={styles.nextEpText}>
                Próximo episódio →{" "}
                {(() => {
                  const next = playlist[currentIndex + 1];
                  const e = parseEpisodeInfo(next.name);
                  return e.episode !== undefined ? `Ep. ${e.episode}` : "Próximo";
                })()}
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* Playlist Modal */}
      <Modal visible={showPlaylist} transparent animationType="slide" onRequestClose={() => setShowPlaylist(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Episódios ({playlist.length})</Text>
              <TouchableOpacity onPress={() => setShowPlaylist(false)}>
                <Feather name="x" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={playlist}
              keyExtractor={(_, i) => String(i)}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: ep_item, index }) => {
                const epInfo = parseEpisodeInfo(ep_item.name);
                const isActive = index === currentIndex;
                return (
                  <TouchableOpacity
                    onPress={() => goToEpisode(index)}
                    style={[
                      styles.epItem,
                      isActive && { backgroundColor: RED + "22", borderColor: RED + "60" },
                    ]}
                  >
                    <View
                      style={[
                        styles.epNum,
                        { backgroundColor: isActive ? RED : "#333" },
                      ]}
                    >
                      <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
                        {epInfo.episode !== undefined
                          ? `E${String(epInfo.episode).padStart(2, "0")}`
                          : String(index + 1)}
                      </Text>
                    </View>
                    <Text
                      style={[styles.epTitle, { color: isActive ? "#fff" : "#ccc" }]}
                      numberOfLines={2}
                    >
                      {ep_item.name.replace(/\.[^.]+$/, "")}
                    </Text>
                    {isActive && (
                      <Feather name="volume-2" size={14} color={RED} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  webview: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: "#fff", fontSize: 14, marginTop: 8 },
  overlay: { justifyContent: "space-between" },
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    background: "transparent",
    backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)",
  },
  iconBtn: { padding: 8 },
  epLabel: { color: RED, fontSize: 11, fontWeight: "700", marginBottom: 2 },
  titleText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  centerNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 40,
    alignItems: "center",
  },
  navBtn: { alignItems: "center", gap: 4, padding: 12 },
  navLabel: { color: "#fff", fontSize: 11 },
  nextEpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-end",
    margin: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  nextEpText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#111",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  epItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: 4,
  },
  epNum: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  epTitle: { flex: 1, fontSize: 12, lineHeight: 17 },
});
