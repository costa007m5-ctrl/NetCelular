import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

const { width: SW, height: SH } = Dimensions.get("window");
const RED = "#e50914";
const TMDB = "https://image.tmdb.org/t/p/w185";

const TOTAL_MS = 4600;
const CARD_W = Math.floor(SW / 4) - 5;
const CARD_H = Math.floor(CARD_W * 1.5);
const CARD_GAP = 5;

const POSTERS_PER_COL = [
  ["/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", "/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg", "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg", "/z1p34vh7dEOnLDmyCrlUVLuoDzd.jpg"],
  ["/czembW0Rk1Ke7lCJGahbOhdNAqa.jpg", "/49WJfeN0moxb9IPfGn8AIqMGskD.jpg", "/7lTnXOy0iNtBAdRP3TZvaKJ77F6.jpg", "/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg"],
  ["/ggFHVNu6YYI5L9pCfOacjizRGt.jpg", "/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg", "/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", "/z1p34vh7dEOnLDmyCrlUVLuoDzd.jpg"],
  ["/7lTnXOy0iNtBAdRP3TZvaKJ77F6.jpg", "/czembW0Rk1Ke7lCJGahbOhdNAqa.jpg", "/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg", "/49WJfeN0moxb9IPfGn8AIqMGskD.jpg"],
];

const COL_DURATIONS = [21000, 27000, 18000, 24000];
const COL_OFFSETS   = [0, 1000, 500, 1600];

function PosterColumn({ posters, duration, initialOffset }: {
  posters: string[];
  duration: number;
  initialOffset: number;
}) {
  const doubled = [...posters, ...posters, ...posters];
  const setH = posters.length * (CARD_H + CARD_GAP);
  const startVal = initialOffset % setH;
  const translateY = useRef(new Animated.Value(startVal)).current;

  useEffect(() => {
    translateY.setValue(startVal);

    const firstLeg = Animated.timing(translateY, {
      toValue: startVal - setH,
      duration: duration * (1 - startVal / setH),
      easing: Easing.linear,
      useNativeDriver: true,
    });

    const loopAnim = Animated.loop(
      Animated.timing(translateY, {
        toValue: -setH,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    firstLeg.start(() => {
      translateY.setValue(0);
      loopAnim.start();
    });

    return () => { firstLeg.stop(); loopAnim.stop(); };
  }, []);

  return (
    <Animated.View style={{ transform: [{ translateY }] }}>
      {doubled.map((src, i) => (
        <Image
          key={i}
          source={{ uri: `${TMDB}${src}` }}
          style={s.posterCard}
          resizeMode="cover"
        />
      ))}
    </Animated.View>
  );
}

interface Props { onFinish: () => void; }

export default function NetplaySplash({ onFinish }: Props) {
  const nd = { useNativeDriver: true };
  const noNd = { useNativeDriver: false };

  // Master entrance/exit
  const masterOp = useRef(new Animated.Value(0)).current;
  const masterSc = useRef(new Animated.Value(0.94)).current;
  const blackoutOp = useRef(new Animated.Value(0)).current;

  // Logo
  const logoOp = useRef(new Animated.Value(0)).current;
  const logoSc = useRef(new Animated.Value(0.72)).current;
  const logoFloatY = useRef(new Animated.Value(0)).current;
  const nOp = useRef(new Animated.Value(0)).current;
  const nSc = useRef(new Animated.Value(0.7)).current;

  // Orb
  const orbOp = useRef(new Animated.Value(0)).current;
  const orbSc = useRef(new Animated.Value(1)).current;

  // Brand: single block, no per-letter Y to avoid font glitch
  const brandOp = useRef(new Animated.Value(0)).current;
  const brandY = useRef(new Animated.Value(14)).current;

  // Subtitle
  const subtitleOp = useRef(new Animated.Value(0)).current;

  // Progress bar
  const loaderOp = useRef(new Animated.Value(0)).current;
  const barW = useRef(new Animated.Value(0)).current;

  const finishedRef = useRef(false);
  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish();
  };

  useEffect(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    const BAR_MAX = SW * 0.68;

    // Entrance: master fade in + scale
    Animated.parallel([
      Animated.timing(masterOp, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), ...nd }),
      Animated.timing(masterSc, { toValue: 1, duration: 480, easing: Easing.out(Easing.quad), ...nd }),
    ]).start();

    // Orb glow in
    Animated.timing(orbOp, { toValue: 1, duration: 700, ...nd }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(orbSc, { toValue: 1.14, duration: 2100, easing: Easing.inOut(Easing.quad), ...nd }),
        Animated.timing(orbSc, { toValue: 1.0, duration: 2100, easing: Easing.inOut(Easing.quad), ...nd }),
      ])
    ).start();

    // Logo box entrance
    const tLogo = setTimeout(() => {
      Animated.parallel([
        Animated.timing(logoOp, { toValue: 1, duration: 340, ...nd }),
        Animated.spring(logoSc, { toValue: 1, friction: 5, tension: 95, ...nd }),
      ]).start();
      // Logo float
      Animated.loop(
        Animated.sequence([
          Animated.timing(logoFloatY, { toValue: -7, duration: 2000, easing: Easing.inOut(Easing.quad), ...nd }),
          Animated.timing(logoFloatY, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.quad), ...nd }),
        ])
      ).start();
    }, 420);

    // N letter pop-in
    const tN = setTimeout(() => {
      Animated.parallel([
        Animated.timing(nOp, { toValue: 1, duration: 280, ...nd }),
        Animated.spring(nSc, { toValue: 1, friction: 5, tension: 110, ...nd }),
      ]).start();
    }, 700);

    // Brand name fade in as one block (no translateY per letter → no rendering glitch)
    const tBrand = setTimeout(() => {
      Animated.parallel([
        Animated.timing(brandOp, { toValue: 1, duration: 400, easing: Easing.out(Easing.quad), ...nd }),
        Animated.timing(brandY, { toValue: 0, duration: 440, easing: Easing.out(Easing.quad), ...nd }),
      ]).start();
    }, 950);

    // Subtitle
    const tSub = setTimeout(() => {
      Animated.timing(subtitleOp, { toValue: 1, duration: 350, ...nd }).start();
    }, 1350);

    // Progress bar + loader text
    const tBar = setTimeout(() => {
      Animated.timing(loaderOp, { toValue: 1, duration: 300, ...nd }).start();
      Animated.timing(barW, {
        toValue: BAR_MAX,
        duration: 2100,
        easing: Easing.bezier(0.22, 0.46, 0.45, 0.94),
        ...noNd,
      }).start();
    }, 1600);

    // Exit
    const tExit = setTimeout(() => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      Animated.parallel([
        Animated.timing(masterOp, { toValue: 0, duration: 440, easing: Easing.in(Easing.quad), ...nd }),
        Animated.timing(blackoutOp, { toValue: 1, duration: 520, ...nd }),
      ]).start(() => finish());
    }, TOTAL_MS - 520);

    const tFallback = setTimeout(() => finish(), TOTAL_MS + 1000);

    return () => {
      [tLogo, tN, tBrand, tSub, tBar, tExit, tFallback].forEach(clearTimeout);
    };
  }, []);

  return (
    <View style={s.root}>
      {/* Background gradient */}
      <LinearGradient
        colors={["#0a0002", "#050001", "#000"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Poster columns */}
      <View style={s.posterBg} pointerEvents="none">
        {POSTERS_PER_COL.map((posters, ci) => (
          <View key={ci} style={s.posterCol}>
            <PosterColumn
              posters={posters}
              duration={COL_DURATIONS[ci]}
              initialOffset={COL_OFFSETS[ci]}
            />
          </View>
        ))}
      </View>

      {/* Gradient vignette over posters (top + bottom fade) */}
      <LinearGradient
        colors={["rgba(10,0,2,0.62)", "rgba(5,0,1,0.22)", "rgba(5,0,1,0.22)", "rgba(5,0,1,0.62)"]}
        locations={[0, 0.3, 0.7, 1]}
        style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
        pointerEvents="none"
      />

      {/* Central radial dark overlay — pure gradient, no shadow artifacts */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.68)"]}
        locations={[0.35, 1]}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 0.0, y: 0.0 }}
        style={[StyleSheet.absoluteFill, { zIndex: 2 }]}
        pointerEvents="none"
      />

      {/* ── Main content (master animated wrapper) ── */}
      <Animated.View
        style={[s.content, { opacity: masterOp, transform: [{ scale: masterSc }] }]}
        pointerEvents="none"
      >
        {/* Orb glow behind logo */}
        <Animated.View style={[s.orbWrap, { opacity: orbOp, transform: [{ scale: orbSc }] }]}>
          <LinearGradient
            colors={["rgba(229,9,20,0.30)", "rgba(229,9,20,0.10)", "transparent"]}
            style={s.orbGradient}
          />
        </Animated.View>

        {/* Ring decorations */}
        <View style={[s.ring, s.ring1]} pointerEvents="none" />
        <View style={[s.ring, s.ring2]} pointerEvents="none" />
        <View style={[s.ring, s.ring3]} pointerEvents="none" />

        {/* Logo box */}
        <Animated.View
          style={[
            s.logoWrap,
            { opacity: logoOp, transform: [{ scale: logoSc }, { translateY: logoFloatY }] },
          ]}
        >
          {/* Glow halo */}
          <View style={s.logoGlowHalo} />

          <LinearGradient
            colors={["#ff4e5a", "#f40309", "#900008"]}
            locations={[0, 0.44, 1]}
            style={s.logoBox}
          >
            {/* Top gloss */}
            <LinearGradient
              colors={["rgba(255,255,255,0.24)", "transparent"]}
              style={s.logoGloss}
            />

            {/* The N letter — centered, no clip tricks */}
            <Animated.View style={[s.nCenter, { opacity: nOp, transform: [{ scale: nSc }] }]}>
              <Text style={s.nText} allowFontScaling={false}>N</Text>
            </Animated.View>

            {/* Play badge — small white circle, bottom-right */}
            <View style={s.playCircle}>
              <View style={s.playArrow} />
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Brand name — NETPLAY rendered in one line, no per-letter Y animation */}
        <Animated.View style={[s.brandWrap, { opacity: brandOp, transform: [{ translateY: brandY }] }]}>
          <Text style={s.brandText} allowFontScaling={false}>
            <Text style={s.brandNet}>NET</Text>
            <Text style={s.brandPlay}>PLAY</Text>
          </Text>
        </Animated.View>

        {/* Subtitle */}
        <Animated.Text style={[s.subtitle, { opacity: subtitleOp }]}>
          CATÁLOGO PREMIUM · ENTRETENIMENTO
        </Animated.Text>

        {/* Progress */}
        <Animated.View style={[s.loaderWrap, { opacity: loaderOp }]}>
          <View style={s.barTrack}>
            <Animated.View style={[s.barFill, { width: barW }]}>
              <LinearGradient
                colors={["#ff1020", "#ff3545", "#ff8898", "#ff2030"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
          <Text style={s.loadText} allowFontScaling={false}>
            Carregando seu conteúdo personalizado...
          </Text>
        </Animated.View>
      </Animated.View>

      {/* Blackout exit overlay */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: blackoutOp, zIndex: 99 }]}
        pointerEvents="none"
      />
    </View>
  );
}

const LOGO_SIZE = 116;
const ORB_SIZE = Math.min(SW * 0.72, 290);
const RING_BASE = Math.min(SW * 0.86, 340);

const s = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  posterBg: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: "row",
    gap: CARD_GAP,
    paddingHorizontal: CARD_GAP,
    overflow: "hidden",
    zIndex: 0,
  } as any,
  posterCol: {
    flex: 1,
    overflow: "hidden",
  },
  posterCard: {
    width: "100%",
    height: CARD_H,
    borderRadius: 7,
    marginBottom: CARD_GAP,
    opacity: 0.27,
  },

  content: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 5,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 20,
  },

  // Orb
  orbWrap: {
    position: "absolute",
    width: ORB_SIZE,
    height: ORB_SIZE,
    alignSelf: "center",
    top: "50%",
    marginTop: -(ORB_SIZE / 2) - 20,
  },
  orbGradient: {
    width: "100%",
    height: "100%",
    borderRadius: ORB_SIZE / 2,
  },

  // Rings
  ring: {
    position: "absolute",
    alignSelf: "center",
    borderRadius: 999,
    borderWidth: 1,
  },
  ring1: {
    width: RING_BASE,
    height: RING_BASE,
    top: "50%",
    marginTop: -(RING_BASE / 2) - 20,
    borderColor: "rgba(255,24,42,0.10)",
  },
  ring2: {
    width: RING_BASE * 0.74,
    height: RING_BASE * 0.74,
    top: "50%",
    marginTop: -(RING_BASE * 0.74 / 2) - 20,
    borderColor: "rgba(255,24,42,0.09)",
  },
  ring3: {
    width: RING_BASE * 0.50,
    height: RING_BASE * 0.50,
    top: "50%",
    marginTop: -(RING_BASE * 0.50 / 2) - 20,
    borderColor: "rgba(255,24,42,0.08)",
  },

  // Logo
  logoWrap: {
    marginBottom: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  logoGlowHalo: {
    position: "absolute",
    width: LOGO_SIZE + 36,
    height: LOGO_SIZE + 36,
    borderRadius: (LOGO_SIZE + 36) / 2,
    backgroundColor: "rgba(229,9,20,0.18)",
    top: -18, left: -18,
  },
  logoBox: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    shadowColor: "#e50914",
    shadowOpacity: 0.45,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  logoGloss: {
    position: "absolute",
    left: 0, right: 0, top: 0,
    height: LOGO_SIZE * 0.45,
  },
  nCenter: {
    alignItems: "center",
    justifyContent: "center",
  },
  nText: {
    color: "#f7f7f8",
    fontSize: 68,
    fontWeight: "900",
    letterSpacing: -2,
    textAlign: "center",
    lineHeight: 76,
    // text shadow for depth
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  playCircle: {
    position: "absolute",
    right: 9, bottom: 9,
    width: 26, height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.94)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  playArrow: {
    width: 0, height: 0,
    borderLeftWidth: 9,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftColor: RED,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    marginLeft: 2,
  },

  // Brand name
  brandWrap: {
    marginBottom: 12,
    alignItems: "center",
  },
  brandText: {
    fontSize: 54,
    fontWeight: "900",
    letterSpacing: 2,
    lineHeight: 62,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  brandNet:  { color: RED },
  brandPlay: { color: "#f5f5f7" },

  subtitle: {
    color: "rgba(210,190,194,0.40)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 3.5,
    textTransform: "uppercase",
    marginBottom: 56,
  },

  loaderWrap: {
    width: SW * 0.68,
    alignItems: "center",
  },
  barTrack: {
    width: "100%",
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    marginBottom: 14,
  },
  barFill: {
    position: "absolute",
    left: 0, top: 0, bottom: 0,
    borderRadius: 999,
    overflow: "hidden",
    minWidth: 0,
  },
  loadText: {
    color: "rgba(255,255,255,0.20)",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
