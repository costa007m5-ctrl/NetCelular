import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const { width: SW } = Dimensions.get("window");

const RED       = "#ff2034";
const RED_SOFT  = "#ff6672";
const TOTAL_MS  = 5000;
const LOADER_SZ = 128;

function SpinArc({
  size,
  bw,
  top,
  right,
  bottom,
  left,
  duration,
  reverse = false,
}: {
  size: number; bw: number;
  top: string; right: string; bottom: string; left: string;
  duration: number; reverse?: boolean;
}) {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(rot, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);
  const rotate = rot.interpolate({
    inputRange:  [0, 1],
    outputRange: reverse ? ["360deg", "0deg"] : ["0deg", "360deg"],
  });
  return (
    <Animated.View style={{
      position: "absolute",
      width: size, height: size,
      borderRadius: size / 2,
      borderWidth: bw,
      borderTopColor: top,
      borderRightColor: right,
      borderBottomColor: bottom,
      borderLeftColor: left,
      transform: [{ rotate }],
    }} />
  );
}

function OrbitDot({ size }: { size: number }) {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(rot, { toValue: 1, duration: 5000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);
  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View style={{ position: "absolute", width: size, height: size, transform: [{ rotate }] }}>
      <View style={{
        position: "absolute",
        top: 4,
        left: size / 2 - 3.5,
        width: 7, height: 7,
        borderRadius: 3.5,
        backgroundColor: RED_SOFT,
      }} />
    </Animated.View>
  );
}

function EqBar({ barH, delay }: { barH: number; delay: number }) {
  const sc = useRef(new Animated.Value(0.72)).current;
  const op = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(sc, { toValue: 1.26, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(op, { toValue: 1,    duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(sc, { toValue: 0.72, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(op, { toValue: 0.55, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
        ])
      ).start();
    }, delay);
    return () => clearTimeout(t);
  }, []);
  return (
    <Animated.View style={{ width: 7, height: barH, borderRadius: 999, backgroundColor: RED_SOFT, opacity: op, transform: [{ scaleY: sc }] }} />
  );
}

interface Props { onFinish: () => void; }

export default function NetplaySplash({ onFinish }: Props) {
  const masterOp    = useRef(new Animated.Value(0)).current;
  const centerSc    = useRef(new Animated.Value(1)).current;
  const haloSc      = useRef(new Animated.Value(1)).current;
  const textOp      = useRef(new Animated.Value(0.58)).current;
  const playPulseSc = useRef(new Animated.Value(1)).current;

  const [dots, setDots] = useState("");
  const finishedRef = useRef(false);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish();
  };

  useEffect(() => {
    Animated.timing(masterOp, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();

    const pulse = (anim: Animated.Value, lo: number, hi: number, half: number) =>
      Animated.loop(Animated.sequence([
        Animated.timing(anim, { toValue: hi, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(anim, { toValue: lo, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));

    pulse(centerSc,    1,    1.06, 2000).start();
    pulse(haloSc,      1,    1.10, 2200).start();
    pulse(textOp,      0.58, 1,    950).start();
    pulse(playPulseSc, 1,    1.08, 1900).start();

    const DOTS = ["", ".", "..", "..."];
    let di = 0;
    const dotsTimer = setInterval(() => { di = (di + 1) % 4; setDots(DOTS[di]); }, 325);

    const tExit = setTimeout(() => {
      Animated.timing(masterOp, { toValue: 0, duration: 480, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => finish());
    }, TOTAL_MS - 480);

    const tFallback = setTimeout(finish, TOTAL_MS + 600);

    return () => {
      clearInterval(dotsTimer);
      clearTimeout(tExit);
      clearTimeout(tFallback);
    };
  }, []);

  return (
    <Animated.View style={[s.root, { opacity: masterOp }]}>
      <LinearGradient
        colors={["#090103", "#030001", "#000000"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Ambient glow */}
      <View style={s.ambientGlow} />

      {/* Rings */}
      <View style={[s.ring, { width: Math.min(SW * 0.76, 470), height: Math.min(SW * 0.76, 470) }]} />
      <View style={[s.ring, { width: Math.min(SW * 0.56, 340), height: Math.min(SW * 0.56, 340) }]} />
      <View style={[s.ring, { width: Math.min(SW * 0.38, 220), height: Math.min(SW * 0.38, 220) }]} />

      {/* Central content */}
      <View style={s.loaderWrap}>

        {/* Spinning arcs + center */}
        <View style={{ width: LOADER_SZ, height: LOADER_SZ, alignItems: "center", justifyContent: "center" }}>
          {/* Halo */}
          <Animated.View style={[s.halo, { transform: [{ scale: haloSc }] }]} />

          {/* Track */}
          <View style={s.track} />

          {/* Arc 1 — outer, top+right colored */}
          <SpinArc size={LOADER_SZ}      bw={4} top={RED}                      right={RED_SOFT}               bottom="transparent" left="transparent" duration={1050} />
          {/* Arc 2 — middle, bottom+left colored, reverse */}
          <SpinArc size={LOADER_SZ - 24} bw={3} top="transparent"              right="transparent"            bottom="rgba(255,105,116,.88)" left="rgba(255,31,51,.78)" duration={1750} reverse />
          {/* Arc 3 — inner, faint top+right */}
          <SpinArc size={LOADER_SZ - 44} bw={2} top="rgba(255,255,255,.16)"    right="rgba(255,255,255,.05)"  bottom="transparent" left="transparent" duration={2400} />

          {/* Orbit dot */}
          <OrbitDot size={LOADER_SZ} />

          {/* Center N button */}
          <Animated.View style={[s.centerWrap, { transform: [{ scale: centerSc }] }]}>
            <LinearGradient
              colors={["#ff4c58", "#f40408", "#980008"]}
              locations={[0, 0.46, 1]}
              style={s.centerGrad}
            >
              <LinearGradient colors={["rgba(255,255,255,.24)", "transparent"]} style={s.gloss} />
              <Text style={s.nText} allowFontScaling={false}>N</Text>
              <Animated.View style={[s.playCircle, { transform: [{ scale: playPulseSc }] }]}>
                <View style={s.playArrow} />
              </Animated.View>
            </LinearGradient>
          </Animated.View>
        </View>

        {/* Equalizer */}
        <View style={s.equalizer}>
          <EqBar barH={8}  delay={0}   />
          <EqBar barH={16} delay={120} />
          <EqBar barH={11} delay={240} />
          <EqBar barH={16} delay={360} />
          <EqBar barH={8}  delay={480} />
        </View>

        {/* "Carregando..." */}
        <Animated.Text style={[s.loadText, { opacity: textOp }]}>
          <Text style={s.loadBold}>Carregando</Text>{dots}
        </Animated.Text>

        {/* Subtitle */}
        <Text style={s.subtitle}>netplay streaming</Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#000",
  },

  ambientGlow: {
    position: "absolute",
    width: Math.min(SW * 0.6, 420),
    height: Math.min(SW * 0.6, 420),
    borderRadius: 999,
    backgroundColor: "rgba(255,30,45,.13)",
    alignSelf: "center",
    top: "50%",
    marginTop: -Math.min(SW * 0.6, 420) / 2,
  },

  ring: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,36,52,.11)",
    backgroundColor: "rgba(255,0,0,.015)",
    transform: [{ translateY: -0 }],
  },

  loaderWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    zIndex: 3,
  },

  halo: {
    position: "absolute",
    width: LOADER_SZ + 36,
    height: LOADER_SZ + 36,
    borderRadius: 999,
    backgroundColor: "rgba(255,45,60,.14)",
    top: -18, left: -18,
  },

  track: {
    position: "absolute",
    width: LOADER_SZ - 16,
    height: LOADER_SZ - 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.08)",
  },

  centerWrap: {
    position: "absolute",
    width: 68, height: 68,
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: "#ff2032",
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },

  centerGrad: {
    width: "100%", height: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  gloss: {
    position: "absolute",
    left: 0, right: 0, top: 0,
    height: "50%",
  },

  nText: {
    color: "#f6f7f8",
    fontSize: 40,
    fontWeight: "900",
    lineHeight: 44,
    letterSpacing: -2,
    textAlign: "center",
    marginTop: -2,
  },

  playCircle: {
    position: "absolute",
    right: -2, bottom: -2,
    width: 26, height: 26,
    borderRadius: 13,
    backgroundColor: "#f5f5f7",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  playArrow: {
    width: 0, height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 9,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#df1e2d",
    marginLeft: 2,
  },

  equalizer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 7,
    height: 18,
  },

  loadText: {
    color: "rgba(255,255,255,.32)",
    fontSize: Platform.OS === "web" ? 19 : 17,
    fontWeight: "600",
    textAlign: "center",
  },

  loadBold: {
    color: "rgba(255,255,255,.84)",
    fontWeight: "700",
  },

  subtitle: {
    color: "rgba(255,255,255,.14)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3.5,
    textTransform: "uppercase",
    marginTop: -6,
  },
});
