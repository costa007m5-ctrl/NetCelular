/**
 * NetplayHeartbeatLoader
 *
 * Replica do estilo Netflix:
 * – O "N" se desenha em traço (stroke draw) sobre fundo escuro
 * – Depois pulsa com ritmo lub-dub de batimento cardíaco
 * – Sem círculo sólido — só o glow de luz em volta do traço
 */

import React, { useEffect, useState } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
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

const RED      = "#e50914";
const RED_SOFT = "#ff2a1a";

// ── Forma do "N" ─────────────────────────────────────────────────────────────
// ViewBox 100 × 120  —  N bem bold, estilo Netflix
const VB_W  = 100;
const VB_H  = 120;
const LX    = 14;   // borda esquerda do traço
const RX    = 86;   // borda direita do traço
const TY    = 12;   // topo
const BY    = 108;  // base

// M baixo-esq → topo-esq → diagonal → topo-dir (igual ao "N" da Netflix)
const N_PATH = `M ${LX},${BY} L ${LX},${TY} L ${RX},${BY} L ${RX},${TY}`;

// Comprimento do path  (vertical + diagonal + vertical)
// seg1: 96  |  seg2: sqrt(72²+96²) ≈ 120  |  seg3: 96  → total ≈ 312
const PATH_LEN = 316;

// ── Durações ─────────────────────────────────────────────────────────────────
const DRAW_MS     = 800;   // traço se formando

// Lub-dub: batida forte + eco
const LUB_UP   = 85;
const LUB_DOWN = 65;
const DUB_UP   = 70;
const DUB_DOWN = 50;
const REST     = 820;

interface Props { size?: number }

export default function NetplayHeartbeatLoader({ size = 96 }: Props) {
  const dashOffset  = useSharedValue(PATH_LEN);
  const scale       = useSharedValue(1);
  const glowW       = useSharedValue(2);      // strokeWidth do halo
  const glowAlpha   = useSharedValue(0);      // opacidade do halo
  const [phase2, setPhase2] = useState(false);

  // ── Phase 1: desenha o N ──────────────────────────────────────────────────
  useEffect(() => {
    dashOffset.value = withTiming(
      0,
      { duration: DRAW_MS, easing: Easing.out(Easing.cubic) },
      (done) => { if (done) runOnJS(setPhase2)(true); }
    );

    // halo faz um bloom suave enquanto desenha
    glowAlpha.value = withDelay(
      DRAW_MS * 0.4,
      withTiming(0.45, { duration: DRAW_MS * 0.6 })
    );

    return () => {
      cancelAnimation(dashOffset);
      cancelAnimation(scale);
      cancelAnimation(glowW);
      cancelAnimation(glowAlpha);
    };
  }, []);

  // ── Phase 2: heartbeat lub-dub ────────────────────────────────────────────
  useEffect(() => {
    if (!phase2) return;

    // Escala do N inteiro
    scale.value = withRepeat(
      withSequence(
        withTiming(1.28, { duration: LUB_UP,   easing: Easing.out(Easing.quad) }),
        withTiming(0.96, { duration: LUB_DOWN,  easing: Easing.in(Easing.quad)  }),
        withTiming(1.14, { duration: DUB_UP,    easing: Easing.out(Easing.quad) }),
        withTiming(1.00, { duration: DUB_DOWN,  easing: Easing.in(Easing.quad)  }),
        withTiming(1.00, { duration: REST }),
      ),
      -1, false,
    );

    // Halo expande e encolhe em sync com o lub
    glowW.value = withRepeat(
      withSequence(
        withTiming(18, { duration: LUB_UP   }),
        withTiming(6,  { duration: LUB_DOWN }),
        withTiming(12, { duration: DUB_UP   }),
        withTiming(4,  { duration: DUB_DOWN }),
        withTiming(4,  { duration: REST     }),
      ),
      -1, false,
    );

    glowAlpha.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: LUB_UP   }),
        withTiming(0.25, { duration: LUB_DOWN }),
        withTiming(0.40, { duration: DUB_UP   }),
        withTiming(0.20, { duration: DUB_DOWN }),
        withTiming(0.20, { duration: REST     }),
      ),
      -1, false,
    );
  }, [phase2]);

  // ── Animated props ────────────────────────────────────────────────────────
  const mainProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  const haloProps = useAnimatedProps(() => ({
    strokeWidth:   glowW.value,
    strokeOpacity: glowAlpha.value,
    // halo acompanha o mesmo offset do traço principal
    strokeDashoffset: dashOffset.value,
  }));

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const strokeW = size * 0.16;   // traço bold ~16% do tamanho

  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={containerStyle}>
        <Svg
          width={size}
          height={size * (VB_H / VB_W)}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
        >
          {/* ── Halo glow (traço bem largo, semi-transparente, mesma forma) ── */}
          <AnimatedPath
            animatedProps={haloProps}
            d={N_PATH}
            stroke={RED_SOFT}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={PATH_LEN}
          />

          {/* ── Traço principal animado ─────────────────────────────────── */}
          <AnimatedPath
            animatedProps={mainProps}
            d={N_PATH}
            stroke={RED}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={PATH_LEN}
          />

          {/* ── Brilho no topo do traço (highlight claro) ─────────────── */}
          <AnimatedPath
            animatedProps={mainProps}
            d={N_PATH}
            stroke="rgba(255,160,140,0.18)"
            strokeWidth={strokeW * 0.3}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={PATH_LEN}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
