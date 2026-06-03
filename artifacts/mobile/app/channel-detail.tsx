import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { calcProgress, calcRemaining, fakeViewers, getAccent, CATEGORY_LABELS } from "@/lib/live-tv-api";

const { width: W } = Dimensions.get("window");

let WebView: any = null;
try {
  WebView = require("react-native-webview").WebView;
} catch {
  WebView = null;
}

let ScreenOrientation: any = null;
try {
  ScreenOrientation = require("expo-screen-orientation");
} catch {
  ScreenOrientation = null;
}

/* ── Injected BEFORE any page script runs ── */
const BEFORE_LOAD_JS = `
(function(){
  /* 1. Kill all popup / new-window mechanisms */
  window.open = function(){ return {focus:function(){},close:function(){},document:{write:function(){}}}; };
  window.alert = function(){};
  window.confirm = function(){ return false; };
  window.prompt  = function(){ return null; };
  Object.defineProperty(window,'onbeforeunload',{set:function(){},get:function(){return null;}});

  /* 2. Freeze location navigation APIs so page JS cannot redirect */
  try { location.assign  = function(){}; } catch(e){}
  try { location.replace = function(){}; } catch(e){}

  /* 3. Intercept location.href setter — block cross-origin navigation */
  try {
    var __orig = location.origin || (location.protocol+'//'+location.host);
    var __desc = Object.getOwnPropertyDescriptor(Location.prototype,'href');
    if (__desc && __desc.set) {
      Object.defineProperty(Location.prototype,'href',{
        get: __desc.get,
        set: function(v){
          try{ if(new URL(v,location.href).origin !== __orig) return; }catch(e){}
          __desc.set.call(this,v);
        },
        configurable:true,
      });
    }
  } catch(e){}

  /* 4. Kill meta-refresh tags */
  var _origCreate = document.createElement.bind(document);
  document.createElement = function(tag){
    var el = _origCreate(tag);
    if(tag && tag.toLowerCase()==='meta'){
      var _set = Object.getOwnPropertyDescriptor(Element.prototype,'setAttribute');
      if(_set){ el.setAttribute = function(k,v){ if(k.toLowerCase()==='http-equiv'&&String(v).toLowerCase()==='refresh') return; _set.value.call(this,k,v); }; }
    }
    return el;
  };
})(); true;
`;

/* ── Injected AFTER page loads ── */
const AD_BLOCKER_JS = `
(function() {
  window.open = function(){ return {focus:function(){},close:function(){}}; };
  window.alert = function(){};
  window.confirm = function(){ return false; };
  try { location.assign  = function(){}; } catch(e){}
  try { location.replace = function(){}; } catch(e){}

  var BLOCKED_DOMAINS = [
    'googlesyndication','doubleclick','adservice.google','pagead2',
    'adnxs','taboola','outbrain','popads','popcash','propellerads',
    'adsterra','mgid','revcontent','exoclick','trafficjunky',
    'juicyads','hilltopads','adcash','bidvertiser','clickadu',
  ];
  function isBlocked(src){ return src && BLOCKED_DOMAINS.some(function(d){ return src.indexOf(d)!==-1; }); }

  /* Remove known ad elements */
  function removeAds(){
    try{ document.querySelectorAll('iframe').forEach(function(el){ if(isBlocked(el.src)) el.remove(); }); }catch(e){}
    try{ document.querySelectorAll('ins.adsbygoogle,[id*="google_ads"],[id*="aswift"],[class*="overlay-ad"],[class*="ad-container"],[id*="ad-container"],[id*="ad_container"],#preroll-ads,.preroll,[class*="preroll"],[class*="popup"],[id*="popup"],[class*="modal-ad"],[class*="interstitial"],[id*="interstitial"]').forEach(function(el){ el.remove(); }); }catch(e){}
    /* Kill high-z-index overlays that are not video */
    try{
      document.querySelectorAll('div,section,aside,article').forEach(function(el){
        var z=parseInt(window.getComputedStyle(el).zIndex)||0;
        if(z>100 && !el.querySelector('video')){
          var r=el.getBoundingClientRect();
          if(r.width>window.innerWidth*0.4 && r.height>50){ el.style.display='none'; }
        }
      });
    }catch(e){}
    /* Style video/iframe fullscreen */
    try{ document.querySelectorAll('video').forEach(function(v){ v.style.cssText='width:100%!important;height:100%!important;object-fit:contain!important;'; }); }catch(e){}
  }

  /* Neutralise all outbound links */
  function killLinks(){
    try{
      document.querySelectorAll('a').forEach(function(el){
        try{ var h=el.getAttribute('href')||''; if(h && h!=='#' && h.indexOf('javascript')===0) el.removeAttribute('href'); }catch(e){}
        el.removeAttribute('target');
        el.removeAttribute('onclick');
      });
    }catch(e){}
  }

  var style = document.createElement('style');
  style.textContent='html,body{margin:0!important;padding:0!important;overflow:hidden!important;background:#000!important;}video{width:100%!important;height:100%!important;object-fit:contain!important;}iframe{width:100%!important;height:100%!important;border:none!important;}';
  try{ document.head.appendChild(style); }catch(e){}

  removeAds(); killLinks();
  setInterval(function(){ removeAds(); killLinks(); }, 700);
  try{ new MutationObserver(function(){ removeAds(); killLinks(); }).observe(document.documentElement,{childList:true,subtree:true}); }catch(e){}
})();
true;
`;

function getNextSlots(startDateStr: string): { time: string; title: string; duration: string }[] {
  try {
    const start = new Date(startDateStr);
    const slots = [];
    for (let i = 1; i <= 3; i++) {
      const t = new Date(start.getTime() + i * 60 * 60 * 1000);
      const hh = String(t.getHours()).padStart(2, "0");
      const mm = String(t.getMinutes()).padStart(2, "0");
      slots.push({ time: `${hh}:${mm}`, title: "Programação ao Vivo", duration: "60 min" });
    }
    return slots;
  } catch {
    return [
      { time: "—", title: "Programação ao Vivo", duration: "60 min" },
      { time: "—", title: "Programação ao Vivo", duration: "60 min" },
    ];
  }
}

export default function ChannelDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 16 : insets.top;
  const { width: winW, height: winH } = useWindowDimensions();

  const params = useLocalSearchParams<{
    channelId: string;
    channelName: string;
    channelImage: string;
    channelPreview: string;
    channelUrl: string;
    channelCategories: string;
    epgTitle: string;
    epgDesc: string;
    epgStart: string;
  }>();

  const {
    channelId = "",
    channelName = "Canal",
    channelImage = "",
    channelPreview = "",
    channelUrl = "",
    channelCategories = "[]",
    epgTitle = "Ao Vivo",
    epgDesc = "",
    epgStart = "",
  } = params;

  const accent = getAccent(channelId);
  const progress = epgStart ? calcProgress(epgStart) : 45;
  const remaining = epgStart ? calcRemaining(epgStart) : "AO VIVO";
  const viewers = fakeViewers(channelId);
  const nextSlots = epgStart ? getNextSlots(epgStart) : [];

  let categories: number[] = [];
  try { categories = JSON.parse(channelCategories); } catch { categories = []; }
  const genreLabel = categories.length > 0 ? (CATEGORY_LABELS[categories[0]] ?? "Ao Vivo") : "Ao Vivo";

  const safeChannelUrl = (() => {
    try {
      if (!channelUrl) return "";
      const u = new URL(channelUrl);
      return (u.protocol === "http:" || u.protocol === "https:") ? channelUrl : "";
    } catch {
      return "";
    }
  })();

  const [isPlaying, setIsPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [favorited, setFavorited] = useState(false);

  /* Track when initial page load completes so we can lock down top-frame navigation after that */
  const initialLoadedRef = useRef(false);
  /* Track resolved URL after redirects so same-domain check uses the final domain */
  const resolvedUrlRef = useRef(channelUrl);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
    return () => {
      if (Platform.OS !== "web" && ScreenOrientation) {
        try { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch {}
      }
    };
  }, []);

  const toggleFullscreen = () => {
    const next = !fullscreen;
    setFullscreen(next);
    if (Platform.OS !== "web" && ScreenOrientation) {
      try {
        if (next) {
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT);
        } else {
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        }
      } catch {}
    }
  };

  const PLAYER_H = 230;
  const fsW = Math.max(winW, winH);
  const fsH = Math.min(winW, winH);

  return (
    <View style={styles.container}>
      <StatusBar style="light" hidden={fullscreen} />

      {/* ── INLINE PLAYER ──────────────────────── */}
      <View style={[
        styles.playerWrap,
        { height: PLAYER_H },
        fullscreen && { position: "absolute", top: 0, left: 0, width: fsW, height: fsH, zIndex: 999 } as any,
      ]}>
        {!isPlaying ? (
          /* Thumbnail + big play button */
          <>
            <Image
              source={{ uri: channelPreview || channelImage }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
            <LinearGradient
              colors={["rgba(0,0,0,0.5)", "transparent", "rgba(0,0,0,0.5)"]}
              style={StyleSheet.absoluteFillObject}
            />
            {/* Back button */}
            {!fullscreen && (
              <Pressable style={[styles.backBtn, { top: topPad + 8 }]} onPress={() => router.back()}>
                <Feather name="arrow-left" size={20} color="#fff" />
              </Pressable>
            )}
            {/* Channel logo overlay */}
            <View style={styles.thumbLogoWrap}>
              <View style={[styles.thumbLogo, { borderColor: accent + "60", backgroundColor: accent + "22" }]}>
                <Image source={{ uri: channelImage }} style={styles.thumbLogoImg} resizeMode="contain" />
              </View>
            </View>
            {/* Big play button */}
            <Pressable
              style={styles.bigPlayBtn}
              onPress={() => setIsPlaying(true)}
            >
              <LinearGradient
                colors={[accent, "#000"]}
                style={styles.bigPlayGradient}
              >
                <Text style={styles.bigPlayIcon}>▶</Text>
              </LinearGradient>
            </Pressable>
            {/* Live badge bottom-left */}
            <View style={styles.thumbLiveBadge}>
              <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
              <Text style={styles.thumbLiveText}>AO VIVO</Text>
            </View>
          </>
        ) : isWeb ? (
          /* ── Web iframe Player ── */
          <>
            <iframe
              src={safeChannelUrl}
              style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#000" } as any}
              allowFullScreen
              allow="autoplay; fullscreen; encrypted-media"
            />
            <Pressable style={styles.fsBtn} onPress={() => setFullscreen((v) => !v)}>
              <Feather name={fullscreen ? "minimize" : "maximize"} size={18} color="#fff" />
            </Pressable>
            {!fullscreen && (
              <Pressable style={[styles.backBtnPlayer, { top: topPad + 8 }]} onPress={() => router.back()}>
                <Feather name="arrow-left" size={20} color="#fff" />
              </Pressable>
            )}
          </>
        ) : WebView ? (
          /* ── Native WebView Player ── */
          safeChannelUrl ? <>
            <WebView
              source={{ uri: safeChannelUrl }}
              style={{ flex: 1, width: "100%", height: "100%", backgroundColor: "#000" }}
              allowsFullscreenVideo
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback
              javaScriptEnabled
              domStorageEnabled
              mixedContentMode="always"
              scalesPageToFit={false}
              injectedJavaScriptBeforeContentLoaded={BEFORE_LOAD_JS}
              injectedJavaScript={AD_BLOCKER_JS}
              onLoadStart={() => { initialLoadedRef.current = false; }}
              onLoadEnd={() => { initialLoadedRef.current = true; }}
              onNavigationStateChange={(state: any) => {
                /* Track resolved URL after any initial redirects */
                if (state.url && state.url !== "about:blank") {
                  resolvedUrlRef.current = state.url;
                }
              }}
              onShouldStartLoadWithRequest={(req: any) => {
                const url: string = req.url || "";
                const isTopFrame: boolean = req.isTopFrame ?? true;

                /* Always allow about:blank / srcdoc */
                if (url === "about:blank" || url === "about:srcdoc") return true;

                /* Block known ad/tracker domains in ALL frames (top + sub-frames) */
                const AD_DOMAINS = [
                  "googlesyndication","doubleclick.net","adservice.google",
                  "pagead2","adnxs.com","taboola.com","outbrain.com",
                  "popads.net","popcash.net","propellerads.com","adsterra.com",
                  "mgid.com","revcontent.com","exoclick.com","trafficjunky.com",
                  "juicyads.com","hilltopads.net","clickadu.com","adcash.com",
                  "bidvertiser.com","ero-advertising.com","plugrush.com",
                  "popunder","pornhub","xvideos","xnxx","adclick","adskeeper",
                  "push.express","onesignal.com/push","notix.io","datapush",
                  "sendpulse","pushwoosh","freeconvert","adf.ly","linkbucks",
                  "shorte.st","bc.vc","ouo.io","clk.sh",
                ];
                if (AD_DOMAINS.some((d) => url.includes(d))) return false;

                /* Sub-frames: allow only known video/player domains */
                if (!isTopFrame) {
                  const ALLOWED_SUB = [
                    "embedtv","redeflix","redeflixapi","jwplatform",
                    "jwpcdn","cloudfront","akamaized","cdn","player",
                    "stream","m3u8","hls","mp4","video","iframe",
                  ];
                  try {
                    const hostname = new URL(url).hostname.toLowerCase();
                    const allowed = ALLOWED_SUB.some((k) => hostname.includes(k) || url.includes(k));
                    if (!allowed) {
                      /* block cross-domain sub-frame navigations that aren't media */
                      const origRoot = channelUrl
                        ? new URL(channelUrl).hostname.split(".").slice(-2).join(".")
                        : "";
                      const navRoot = hostname.split(".").slice(-2).join(".");
                      if (origRoot && navRoot !== origRoot) return false;
                    }
                  } catch {}
                  return true;
                }

                /* Top-frame navigation: ALWAYS block cross-root-domain redirects */
                try {
                  if (!channelUrl) return false;
                  const origRoot = new URL(channelUrl).hostname.split(".").slice(-2).join(".");
                  const navRoot  = new URL(url).hostname.split(".").slice(-2).join(".");
                  if (navRoot !== origRoot) return false;
                } catch {
                  return false;
                }

                return true;
              }}
            />
            {/* Fullscreen toggle button */}
            <Pressable style={styles.fsBtn} onPress={toggleFullscreen}>
              <Feather name={fullscreen ? "minimize" : "maximize"} size={18} color="#fff" />
            </Pressable>
            {/* Back button when not fullscreen */}
            {!fullscreen && (
              <Pressable style={[styles.backBtnPlayer, { top: topPad + 8 }]} onPress={() => router.back()}>
                <Feather name="arrow-left" size={20} color="#fff" />
              </Pressable>
            )}
            {/* Exit fullscreen (top-left back button in fullscreen) */}
            {fullscreen && (
              <Pressable style={styles.fsExitBtn} onPress={toggleFullscreen}>
                <Feather name="minimize" size={20} color="#fff" />
              </Pressable>
            )}
          </>
          : (
            <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
              <Feather name="wifi-off" size={40} color="#444" />
              <Text style={{ color: "#666", marginTop: 16, fontSize: 15, fontWeight: "600" }}>Canal indisponível</Text>
              <Text style={{ color: "#444", marginTop: 6, fontSize: 12, textAlign: "center", paddingHorizontal: 40 }}>
                URL do canal inválida ou temporariamente fora do ar.
              </Text>
            </View>
          )
        ) : null}
      </View>

      {/* ── SCROLLABLE INFO ─────────────────────── */}
      {!fullscreen && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <View style={styles.contentPad}>

              {/* Channel name + live */}
              <View style={styles.channelRow}>
                <View style={[styles.channelLogoSmall, { borderColor: accent + "50", backgroundColor: accent + "18" }]}>
                  <Image source={{ uri: channelImage }} style={styles.channelLogoSmallImg} resizeMode="contain" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.liveRow}>
                    <View style={[styles.livePill, { backgroundColor: accent + "28", borderColor: accent + "55" }]}>
                      <Animated.View style={[styles.liveDotSmall, { backgroundColor: accent, opacity: pulseAnim }]} />
                      <Text style={[styles.livePillText, { color: accent }]}>AO VIVO</Text>
                    </View>
                    <Text style={styles.viewersText}>{viewers} assistindo</Text>
                  </View>
                  <Text style={styles.channelNameText}>{channelName}</Text>
                </View>
              </View>

              {/* EPG title + meta */}
              <Text style={styles.epgTitle} numberOfLines={2}>{epgTitle}</Text>
              <View style={styles.metaRow}>
                <View style={[styles.metaTag, { backgroundColor: accent + "20", borderColor: accent + "50" }]}>
                  <Text style={[styles.metaTagText, { color: accent }]}>{genreLabel}</Text>
                </View>
                <Text style={styles.metaSep}>•</Text>
                <Text style={styles.metaText}>Ao Vivo</Text>
                <Text style={styles.metaSep}>•</Text>
                <Text style={styles.metaText}>HD</Text>
                <Text style={styles.metaSep}>•</Text>
                <Text style={styles.metaText}>{remaining}</Text>
              </View>

              {/* Progress */}
              <View style={styles.progressWrap}>
                <View style={styles.progressBg}>
                  <View style={[styles.progressFill, { width: `${progress}%` as any, backgroundColor: accent, shadowColor: accent }]} />
                </View>
                <Text style={styles.progressLabel}>{Math.round(progress)}% transmitido</Text>
              </View>

              {/* Synopsis */}
              {!!epgDesc && (
                <Text style={styles.synopsis}>{epgDesc}</Text>
              )}

              {/* Action buttons */}
              <View style={styles.actionsRow}>
                <Pressable
                  style={({ pressed }) => [styles.watchBtn, { backgroundColor: accent, shadowColor: accent, opacity: pressed ? 0.85 : 1 }]}
                  onPress={() => { setIsPlaying(true); }}
                >
                  <Text style={styles.watchBtnPlay}>▶</Text>
                  <Text style={styles.watchBtnText}>Assistir Agora</Text>
                </Pressable>
                <Pressable
                  onPress={() => setFavorited((v) => !v)}
                  style={[styles.iconAction, favorited && { backgroundColor: accent + "25", borderColor: accent + "60" }]}
                >
                  <Text style={[styles.iconActionText, favorited && { color: accent }]}>{favorited ? "★" : "☆"}</Text>
                </Pressable>
                <Pressable style={styles.iconAction}>
                  <Feather name="share-2" size={18} color="rgba(255,255,255,0.7)" />
                </Pressable>
              </View>

              {/* Details grid */}
              <View style={styles.detailsGrid}>
                {([
                  { icon: "globe", label: "Idioma", value: "Português" },
                  { icon: "monitor", label: "Qualidade", value: "HD 1080p" },
                  { icon: "radio", label: "Transmissão", value: "Ao Vivo" },
                  { icon: "lock", label: "Classificação", value: "Livre" },
                  { icon: "clock", label: "Restante", value: remaining },
                  { icon: "eye", label: "Assistindo", value: viewers },
                ] as const).map((d) => (
                  <View key={d.label} style={styles.detailCell}>
                    <Feather name={d.icon as any} size={16} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.detailLabel}>{d.label}</Text>
                    <Text style={styles.detailValue}>{d.value}</Text>
                  </View>
                ))}
              </View>

              {/* Next programs (real EPG slots) */}
              {nextSlots.length > 0 && (
                <View style={styles.nextSection}>
                  <View style={styles.nextHeader}>
                    <Text style={styles.nextTitle}>Próximos Programas</Text>
                  </View>
                  {nextSlots.map((p, i) => (
                    <View key={i} style={styles.nextItem}>
                      <Text style={[styles.nextTime, { color: accent }]}>{p.time}</Text>
                      <Text style={styles.nextProg}>{p.title}</Text>
                      <Text style={styles.nextDur}>{p.duration}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },

  /* Player */
  playerWrap: { width: "100%", backgroundColor: "#000", position: "relative", overflow: "hidden" },
  playerFullscreen: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, height: undefined,
  } as any,

  backBtn: {
    position: "absolute", left: 14, zIndex: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  backBtnPlayer: {
    position: "absolute", left: 14, zIndex: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },

  thumbLogoWrap: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },
  thumbLogo: {
    width: 64, height: 64, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, overflow: "hidden",
  },
  thumbLogoImg: { width: 50, height: 50 },

  bigPlayBtn: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },
  bigPlayGradient: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
    opacity: 0.92,
  },
  bigPlayIcon: { color: "#fff", fontSize: 24, marginLeft: 5 },

  thumbLiveBadge: {
    position: "absolute", bottom: 12, left: 14,
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#e50914", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  thumbLiveText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },

  fsBtn: {
    position: "absolute", bottom: 12, right: 14, zIndex: 30,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  fsExitBtn: {
    position: "absolute", top: 16, right: 16, zIndex: 30,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center", justifyContent: "center",
  },

  /* Info section */
  contentPad: { padding: 20, paddingTop: 16 },

  channelRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  channelLogoSmall: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: "center", justifyContent: "center", borderWidth: 1, overflow: "hidden",
  },
  channelLogoSmallImg: { width: 38, height: 38 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  livePill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1,
  },
  liveDotSmall: { width: 5, height: 5, borderRadius: 3 },
  livePillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  viewersText: { color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: "500" },
  channelNameText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  epgTitle: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.5, marginBottom: 8, lineHeight: 28 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  metaTag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  metaTagText: { fontSize: 11, fontWeight: "700" },
  metaSep: { color: "rgba(255,255,255,0.25)", fontSize: 11 },
  metaText: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "500" },

  progressWrap: { marginBottom: 14 },
  progressBg: { height: 3, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden", marginBottom: 4 },
  progressFill: {
    height: 3, borderRadius: 2,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 6, elevation: 3,
  },
  progressLabel: { color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: "600" },

  synopsis: { color: "rgba(255,255,255,0.65)", fontSize: 13, lineHeight: 20, marginBottom: 16 },

  actionsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  watchBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 13, borderRadius: 14,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 6,
  },
  watchBtnPlay: { color: "#fff", fontSize: 13 },
  watchBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  iconAction: {
    width: 46, height: 46, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  iconActionText: { fontSize: 20, color: "rgba(255,255,255,0.7)" },

  detailsGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 22,
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 14,
  },
  detailCell: { width: "30%", alignItems: "center", gap: 4 },
  detailLabel: { color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  detailValue: { color: "#fff", fontSize: 10, fontWeight: "600", textAlign: "center" },

  nextSection: { marginTop: 4 },
  nextHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  nextTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  nextItem: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 11, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", marginBottom: 8, gap: 12,
  },
  nextTime: { fontSize: 13, fontWeight: "800", minWidth: 38 } as any,
  nextProg: { flex: 1, color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "500" },
  nextDur: { color: "rgba(255,255,255,0.35)", fontSize: 11 },
});
