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

const TOTAL_MS = 4400;
const CARD_W = Math.floor(SW / 4) - 5;
const CARD_H = Math.floor(CARD_W * 1.5);
const CARD_GAP = 6;

const POSTERS = [
  "/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
  "/czembW0Rk1Ke7lCJGahbOhdNAqa.jpg",
  "/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg",
  "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
  "/49WJfeN0moxb9IPfGn8AIqMGskD.jpg",
  "/z1p34vh7dEOnLDmyCrlUVLuoDzd.jpg",
  "/7lTnXOy0iNtBAdRP3TZvaKJ77F6.jpg",
  "/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg",
];

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

const COL_POSTERS = chunk(POSTERS, 2);
while (COL_POSTERS.length < 4) COL_POSTERS.push([...POSTERS].slice(0, 2));

const COL_COUNT = 4;
const COL_POSTERS_FULL = [
  [POSTERS[0], POSTERS[1], POSTERS[2]],
  [POSTERS[3], POSTERS[4], POSTERS[5]],
  [POSTERS[6], POSTERS[7], POSTERS[0]],
  [POSTERS[1], POSTERS[2], POSTERS[3]],
];

function PosterColumn({ posters, duration, startOffset }: {
  posters: string[];
  duration: number;
  startOffset: number;
}) {
  const items = [...posters, ...posters, ...posters];
  const setH = posters.length * (CARD_H + CARD_GAP);
  const translateY = useRef(new Animated.Value(startOffset % setH)).current;

  useEffect(() => {
    const startVal = startOffset % setH;
    translateY.setValue(startVal);

    const anim = Animated.loop(
      Animated.timing(translateY, {
        toValue: startVal - setH,
        duration: duration * (1 - startVal / setH),
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      { iterations: 1 },
    );

    anim.start(() => {
      translateY.setValue(0);
      Animated.loop(
        Animated.timing(translateY, {
          toValue: -setH,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    });

    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={{ transform: [{ translateY }] }}>
      {items.map((src, i) => (
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

interface Props {
  onFinish: () => void;
}

export default function NetplaySplash({ onFinish }: Props) {
  const masterOp = useRef(new Animated.Value(0)).current;
  const masterSc = useRef(new Animated.Value(0.96)).current;
  const blackoutOp = useRef(new Animated.Value(0)).current;

  const glowOp = useRef(new Animated.Value(0)).current;
  const orbSc = useRef(new Animated.Value(1)).current;

  const logoOp = useRef(new Animated.Value(0)).current;
  const logoSc = useRef(new Animated.Value(0.75)).current;
  const logoFloat = useRef(new Animated.Value(0)).current;

  const nLeftX = useRef(new Animated.Value(-20)).current;
  const nRightX = useRef(new Animated.Value(20)).current;
  const nOp = useRef(new Animated.Value(0)).current;

  const letterOps = useRef(Array.from({ length: 7 }, () => new Animated.Value(0))).current;
  const letterYs = useRef(Array.from({ length: 7 }, () => new Animated.Value(18))).current;

  const subtitleOp = useRef(new Animated.Value(0)).current;
  const barW = useRef(new Animated.Value(0)).current;
  const loaderOp = useRef(new Animated.Value(0)).current;

  const finishedRef = useRef(false);

  const nd = { useNativeDriver: true };
  const noNd = { useNativeDriver: false };

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish();
  };

  useEffect(() => {
    if (Platform.OS !== "web") {
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), 200);
    }

    const BAR_MAX = SW * 0.68;

    // Entrance
    Animated.parallel([
      Animated.timing(masterOp, { toValue: 1, duration: 400, ...nd }),
      Animated.timing(masterSc, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), ...nd }),
    ]).start();

    // Orb glow
    Animated.timing(glowOp, { toValue: 1, duration: 600, ...nd }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(orbSc, { toValue: 1.12, duration: 2000, easing: Easing.inOut(Easing.sine), ...nd }),
        Animated.timing(orbSc, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sine), ...nd }),
      ])
    ).start();

    // Logo entrance
    const tLogo = setTimeout(() => {
      Animated.parallel([
        Animated.timing(logoOp, { toValue: 1, duration: 320, ...nd }),
        Animated.spring(logoSc, { toValue: 1, friction: 6, tension: 100, ...nd }),
      ]).start();

      // Logo float
      Animated.loop(
        Animated.sequence([
          Animated.timing(logoFloat, { toValue: -7, duration: 1900, easing: Easing.inOut(Easing.sine), ...nd }),
          Animated.timing(logoFloat, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.sine), ...nd }),
        ])
      ).start();
    }, 500);

    // N split in
    const tN = setTimeout(() => {
      Animated.parallel([
        Animated.timing(nOp, { toValue: 1, duration: 280, ...nd }),
        Animated.spring(nLeftX, { toValue: 0, friction: 7, tension: 120, ...nd }),
        Animated.spring(nRightX, { toValue: 0, friction: 7, tension: 120, ...nd }),
      ]).start();
    }, 700);

    // Letters stagger in
    const tLetters = setTimeout(() => {
      letterOps.forEach((op, i) => {
        setTimeout(() => {
          Animated.parallel([
            Animated.timing(op, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), ...nd }),
            Animated.timing(letterYs[i], { toValue: 0, duration: 300, easing: Easing.out(Easing.back(1.5)), ...nd }),
          ]).start();
        }, i * 75);
      });
    }, 1050);

    // Subtitle
    const tSub = setTimeout(() => {
      Animated.timing(subtitleOp, { toValue: 1, duration: 400, ...nd }).start();
    }, 1650);

    // Loader + progress bar
    const tBar = setTimeout(() => {
      Animated.timing(loaderOp, { toValue: 1, duration: 350, ...nd }).start();
      Animated.timing(barW, {
        toValue: BAR_MAX,
        duration: 1900,
        easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
        ...noNd,
      }).start();
    }, 1850);

    // Exit sequence
    const tExit = setTimeout(() => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      Animated.parallel([
        Animated.timing(masterOp, { toValue: 0, duration: 420, easing: Easing.in(Easing.quad), ...nd }),
        Animated.timing(blackoutOp, { toValue: 1, duration: 500, ...nd }),
      ]).start(() => finish());
    }, TOTAL_MS - 500);

    const tFallback = setTimeout(() => finish(), TOTAL_MS + 800);

    return () => {
      clearTimeout(tLogo);
      clearTimeout(tN);
      clearTimeout(tLetters);
      clearTimeout(tSub);
      clearTimeout(tBar);
      clearTimeout(tExit);
      clearTimeout(tFallback);
    };
  }, []);

  const colDurations = [22000, 28000, 19000, 25000];
  const colOffsets   = [0,     1100,  550,   1800];

  return (
    <View style={s.root}>
      {/* ── Background gradient ── */}
      <LinearGradient
        colors={["#090002", "#040001", "#000"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* ── Poster columns ── */}
      <View style={s.posterBg} pointerEvents="none">
        {COL_POSTERS_FULL.map((posters, ci) => (
          <View key={ci} style={s.posterCol}>
            <PosterColumn
              posters={posters}
              duration={colDurations[ci]}
              startOffset={colOffsets[ci]}
            />
          </View>
        ))}
      </View>

      {/* ── Vignette over posters ── */}
      <LinearGradient
        colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0.18)", "rgba(0,0,0,0.18)", "rgba(0,0,0,0.55)"]}
        locations={[0, 0.35, 0.65, 1]}
        style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
        pointerEvents="none"
      />
      <View style={s.vignetteCenter} pointerEvents="none" />

      {/* ── Main animated content wrapper ── */}
      <Animated.View
        style={[s.content, { opacity: masterOp, transform: [{ scale: masterSc }] }]}
        pointerEvents="none"
      >
        {/* Orb glow */}
        <Animated.View style={[s.orb, { opacity: glowOp, transform: [{ scale: orbSc }] }]} />
        <View style={s.ring1} />
        <View style={s.ring2} />
        <View style={s.ring3} />

        {/* Logo */}
        <Animated.View style={[s.logoWrap, { opacity: logoOp, transform: [{ scale: logoSc }, { translateY: logoFloat }] }]}>
          <View style={s.logoGlow} />
          <LinearGradient
            colors={["#ff4954", "#f40309", "#970008"]}
            locations={[0, 0.45, 1]}
            style={s.logoBox}
          >
            {/* Gloss top */}
            <LinearGradient
              colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]}
              style={s.logoShineTop}
            />

            {/* N split — left half shows left portion, right half shows right portion */}
            <Animated.View style={[s.nHalf, s.nLeft, {
              opacity: nOp,
              transform: [{ translateX: nLeftX }],
            }]}>
              {/* Text is 112px wide, centered; view clips right half → shows left half of N */}
              <Text style={s.nText} allowFontScaling={false}>N</Text>
            </Animated.View>
            <Animated.View style={[s.nHalf, s.nRight, {
              opacity: nOp,
              transform: [{ translateX: nRightX }],
            }]}>
              {/* marginLeft=-56 aligns text with logoBox origin so view clips left half → shows right half of N */}
              <Text style={[s.nText, { marginLeft: -56 }]} allowFontScaling={false}>N</Text>
            </Animated.View>

            {/* Play badge */}
            <View style={s.playCircle}>
              <View style={s.playArrow} />
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Brand NETPLAY */}
        <View style={s.brandRow}>
          {["N","E","T","P","L","A","Y"].map((ch, i) => (
            <Animated.Text
              key={i}
              style={[
                s.brandLetter,
                i < 3 ? s.brandNet : s.brandPlay,
                {
                  opacity: letterOps[i],
                  transform: [{ translateY: letterYs[i] }],
                },
              ]}
              allowFontScaling={false}
            >
              {ch}
            </Animated.Text>
          ))}
        </View>

        {/* Subtitle */}
        <Animated.Text style={[s.subtitle, { opacity: subtitleOp }]}>
          CATÁLOGO PREMIUM · ENTRETENIMENTO
        </Animated.Text>

        {/* Progress bar */}
        <Animated.View style={[s.loaderWrap, { opacity: loaderOp }]}>
          <View style={s.barTrack}>
            <Animated.View style={[s.barFill, { width: barW }]}>
              <LinearGradient
                colors={["#ff1125", "#ff3345", "#ff7881", "#ff2335"]}
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

      {/* ── Blackout exit overlay ── */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: blackoutOp, zIndex: 99 }]} pointerEvents="none" />
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  // Poster BG
  posterBg: {
    position: "absolute",
    inset: 0,
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
    borderRadius: 6,
    marginBottom: CARD_GAP,
    opacity: 0.28,
  },

  // Vignette center radial (dark edges around center)
  vignetteCenter: {
    position: "absolute",
    zIndex: 2,
    width: SW * 1.4,
    height: SW * 1.4,
    borderRadius: SW * 0.7,
    top: SH / 2 - SW * 0.7,
    left: SW / 2 - SW * 0.7,
    backgroundColor: "transparent",
    shadowColor: "#000",
    shadowOpacity: 0.9,
    shadowRadius: 80,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },

  // Main content
  content: {
    position: "absolute",
    zIndex: 5,
    alignItems: "center",
    justifyContent: "center",
    width: SW,
    top: 0, bottom: 0,
    paddingBottom: 30,
  },

  // Orb
  orb: {
    position: "absolute",
    width: Math.min(SW * 0.75, 300),
    height: Math.min(SW * 0.75, 300),
    borderRadius: 999,
    backgroundColor: "rgba(200,10,22,0.13)",
    top: SH * 0.24 - Math.min(SW * 0.375, 150),
    alignSelf: "center",
  },
  ring1: {
    position: "absolute",
    width: Math.min(SW * 0.88, 360),
    height: Math.min(SW * 0.88, 360),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,24,42,0.1)",
    top: SH * 0.24 - Math.min(SW * 0.44, 180),
    alignSelf: "center",
  },
  ring2: {
    position: "absolute",
    width: Math.min(SW * 0.68, 280),
    height: Math.min(SW * 0.68, 280),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,24,42,0.09)",
    top: SH * 0.24 - Math.min(SW * 0.34, 140),
    alignSelf: "center",
  },
  ring3: {
    position: "absolute",
    width: Math.min(SW * 0.46, 190),
    height: Math.min(SW * 0.46, 190),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,24,42,0.08)",
    top: SH * 0.24 - Math.min(SW * 0.23, 95),
    alignSelf: "center",
  },

  // Logo
  logoWrap: {
    marginBottom: 22,
  },
  logoGlow: {
    position: "absolute",
    inset: -18,
    borderRadius: 999,
    backgroundColor: "rgba(229,9,20,0.22)",
  } as any,
  logoBox: {
    width: 112,
    height: 112,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#ff1120",
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  logoShineTop: {
    position: "absolute",
    left: 0, right: 0, top: 0,
    height: 50,
  },

  // N split halves — each half covers the full logo and clips to its side
  nHalf: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  } as any,
  nLeft: {
    right: "50%",
    left: 0,
  },
  nRight: {
    left: "50%",
    right: 0,
  },
  nText: {
    color: "#f7f7f8",
    fontSize: 70,
    fontWeight: "900",
    letterSpacing: -1,
    width: 112,
    textAlign: "center",
  },

  // Play badge
  playCircle: {
    position: "absolute",
    right: 10, bottom: 8,
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  playArrow: {
    width: 0, height: 0,
    borderLeftWidth: 9, borderTopWidth: 6, borderBottomWidth: 6,
    borderLeftColor: RED,
    borderTopColor: "transparent", borderBottomColor: "transparent",
    marginLeft: 2,
  },

  // Brand
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  brandLetter: {
    fontSize: 52,
    fontWeight: "900",
    letterSpacing: 4,
  },
  brandNet:  { color: RED },
  brandPlay: { color: "#f6f6f8" },

  // Subtitle
  subtitle: {
    color: "rgba(214,194,198,0.42)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 3.5,
    textTransform: "uppercase",
    marginBottom: 52,
  },

  // Progress bar
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
    marginBottom: 16,
  },
  barFill: {
    position: "absolute",
    left: 0, top: 0, bottom: 0,
    borderRadius: 999,
    overflow: "hidden",
    minWidth: 0,
  },
  loadText: {
    color: "rgba(255,255,255,0.22)",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
