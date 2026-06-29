/**
 * NetplayHeartbeatLoader
 *
 * O "N" do NETPLAY se desenha (stroke draw) e depois pulsa
 * com ritmo de batimento cardíaco — lub-dub — em loop.
 */

import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const AnimatedPath = Animated.createAnimatedComponent(Path);

const RED       = "#e50914";
const RED_DARK  = "#b0070f";
const RED_GLOW  = "#ff3020";

// ── Geometria do "N" ────────────────────────────────────────────────────────
// ViewBox 0 0 80 110  — proporções de um "N" bold estilizado
const VB_W = 80;
const VB_H = 110;

// Pontos (x, y)
const LX = 8;   // coluna esquerda
const RX = 72;  // coluna direita
const TY = 8;   // topo
const BY = 102; // base

// Path: baixo-esq → cima-esq → diagonal para baixo-dir → cima-dir
const N_PATH = `M ${LX},${BY} L ${LX},${TY} L ${RX},${BY} L ${RX},${TY}`;

// Comprimento total aproximado do path (calculado)
// segmento 1 (vertical esq): BY - TY = 94
// segmento 2 (diagonal):     sqrt((RX-LX)² + (BY-TY)²) = sqrt(64²+94²) ≈ 113.7
// segmento 3 (vertical dir): BY - TY = 94
// total ≈ 301.7  →  arredondamos para 306 com folga
const PATH_LENGTH = 306;

// ── Fase 1: draw (strokeDashoffset de PATH_LENGTH → 0) ──────────────────────
const DRAW_DURATION_MS   = 900;

// ── Fase 2: heartbeat lub-dub loop ──────────────────────────────────────────
//  lub: scale 1 → 1.28 → 1.0  (160 ms)
//  dub: scale 1 → 1.15 → 1.0  (130 ms)
//  pausa:                       (780 ms)
const LUB_UP_MS   = 90;
const LUB_DOWN_MS = 70;
const DUB_UP_MS   = 75;
const DUB_DOWN_MS = 55;
const REST_MS     = 780;

interface Props {
  size?: number;
}

export default function NetplayHeartbeatLoader({ size = 96 }: Props) {
  const dashOffset  = useSharedValue(PATH_LENGTH);
  const scale       = useSharedValue(1);
  const glowOpacity = useSharedValue(0);
  const [heartbeat, setHeartbeat] = useState(false);

  const startHeartbeat = () => {
    setHeartbeat(true);
  };

  useEffect(() => {
    // ── Phase 1: draw the N ─────────────────────────────────────────────────
    dashOffset.value = withTiming(
      0,
      { duration: DRAW_DURATION_MS, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (!finished) return;
        runOnJS(startHeartbeat)();
      }
    );

    // Glow fades in while drawing
    glowOpacity.value = withDelay(
      DRAW_DURATION_MS * 0.5,
      withTiming(1, { duration: DRAW_DURATION_MS * 0.5 })
    );

    return () => {
      cancelAnimation(dashOffset);
      cancelAnimation(scale);
      cancelAnimation(glowOpacity);
    };
  }, []);

  // ── Phase 2: heartbeat loop (starts after draw) ──────────────────────────
  useEffect(() => {
    if (!heartbeat) return;
    scale.value = withRepeat(
      withSequence(
        // lub — batida forte
        withTiming(1.30, { duration: LUB_UP_MS,   easing: Easing.out(Easing.quad) }),
        withTiming(0.97, { duration: LUB_DOWN_MS,  easing: Easing.in(Easing.quad) }),
        // dub — eco rápido
        withTiming(1.16, { duration: DUB_UP_MS,    easing: Easing.out(Easing.quad) }),
        withTiming(1.00, { duration: DUB_DOWN_MS,  easing: Easing.in(Easing.quad) }),
        // repouso
        withTiming(1.00, { duration: REST_MS }),
      ),
      -1,
      false,
    );

    // Glow pulsa em sync com o lub
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(1,    { duration: LUB_UP_MS }),
        withTiming(0.55, { duration: LUB_DOWN_MS + DUB_UP_MS + DUB_DOWN_MS + REST_MS }),
      ),
      -1,
      false,
    );
  }, [heartbeat]);

  // Animated props para o stroke draw
  const pathProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  // Container pulsa na fase heartbeat
  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Glow halo
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const svgSize = size;
  const strokeW = size * 0.145; // ~14% do tamanho = traço bold

  return (
    <View style={styles.wrapper}>
      {/* Halo glow por trás do N */}
      <Animated.View
        style={[
          styles.glow,
          {
            width:  svgSize * 1.6,
            height: svgSize * 1.6,
            borderRadius: svgSize * 0.8,
          },
          glowStyle,
        ]}
      />

      {/* N animado */}
      <Animated.View style={containerStyle}>
        <Svg
          width={svgSize}
          height={svgSize}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
        >
          <Defs>
            <LinearGradient id="ng" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0"   stopColor={RED_GLOW} stopOpacity="1" />
              <Stop offset="0.6" stopColor={RED}      stopOpacity="1" />
              <Stop offset="1"   stopColor={RED_DARK} stopOpacity="1" />
            </LinearGradient>
          </Defs>

          {/* Sombra / glow stroke (ligeiramente mais largo, mais opaco) */}
          <Path
            d={N_PATH}
            stroke={RED}
            strokeWidth={strokeW + 4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.25}
            fill="none"
          />

          {/* Stroke principal animado */}
          <AnimatedPath
            animatedProps={pathProps}
            d={N_PATH}
            stroke="url(#ng)"
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={PATH_LENGTH}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    backgroundColor: RED,
    shadowColor: RED_GLOW,
    shadowRadius: 40,
    shadowOpacity: 0.75,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
    opacity: 0,
  },
});
