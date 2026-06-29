/**
 * NetplayHeartbeatLoader — Réplica 100% do vídeo de referência
 *
 * Sequência exata:
 * 1. Anéis concêntricos escuros pulsam do centro para fora (loop desde o início)
 * 2. Traço neon do N se desenha (barra esq. sobe → diagonal → barra dir. sobe) ~950ms
 * 3. Borda rounded-square neon se desenha simultaneamente ~1100ms
 * 4. Pulso lub-dub em loop infinito
 * 5. Estrela sparkle no canto inferior direito
 */

import React, { useEffect, useState } from "react";
import { View } from "react-native";
import Svg, { Path, Rect, Circle, Polygon } from "react-native-svg";
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

const AnimatedPath   = Animated.createAnimatedComponent(Path);
const AnimatedRect   = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Paleta ────────────────────────────────────────────────────────────────────
const NEON        = "#ff2e12";   // vermelho neon brilhante (linha principal)
const NEON_BLOOM  = "#ff5535";   // laranja-vermelho para o glow bloom
const N_BODY      = "#7a0000";   // corpo escuro do N (preenchido)
const N_SHADE     = "#3d0000";   // sombra mais funda
const RING_COL    = "#4a0000";   // anéis concêntricos

// ── Geometria ViewBox 200×200 ─────────────────────────────────────────────────
const VB = 200;

// N preenchido — estilo Netflix
// Começa no canto inferior-esquerdo para que o traço suba da esq. primeiro
const N_FILL_D =
  "M 32,168 L 32,32 L 56,32 L 144,168 L 168,168 L 168,32 L 144,32 L 56,168 Z";

// Neon outline = mesmo path (com fill="none" stroke animado)
// Perímetro: vertical(136) + topo-esq(24) + diag(169.7) + base-dir(24) +
//            vertical(136) + topo-dir(24) + diag(169.7) + base-esq(24) ≈ 707
const N_STROKE_D = N_FILL_D;
const N_PERIM    = 710;

// Rounded rect (borda ícone de app)
const RR_X = 16, RR_Y = 16, RR_W = 168, RR_H = 168, RR_RX = 28;
// Perímetro ≈ 2*(168+168) − 8*28 + 2π*28 ≈ 628
const RR_PERIM = 630;

// ── Timings ───────────────────────────────────────────────────────────────────
const DRAW_N_MS  = 950;    // duração do draw do N
const DRAW_RR_MS = 1100;   // borda demora um pouco mais

const LUB_UP   = 85;
const LUB_DOWN = 65;
const DUB_UP   = 72;
const DUB_DOWN = 52;
const REST_MS  = 880;

const RING_DUR  = 1700;    // duração de cada anel se expandindo
const RING_STEP = 530;     // delay entre anéis consecutivos

// ── Anel concêntrico ──────────────────────────────────────────────────────────
function RippleRing({
  delay,
  svgSize,
}: {
  delay: number;
  svgSize: number;
}) {
  const cx      = svgSize / 2;
  const cy      = svgSize / 2;
  const rStart  = svgSize * 0.22;
  const rEnd    = svgSize * 0.5;

  const r       = useSharedValue(rStart);
  const opacity = useSharedValue(0);

  useEffect(() => {
    r.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(rStart, { duration: 0 }),
          withTiming(rEnd, {
            duration: RING_DUR,
            easing: Easing.out(Easing.cubic),
          }),
        ),
        -1,
        false,
      ),
    );

    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.45, { duration: 80 }),
          withTiming(0, {
            duration: RING_DUR - 80,
            easing: Easing.out(Easing.quad),
          }),
        ),
        -1,
        false,
      ),
    );

    return () => {
      cancelAnimation(r);
      cancelAnimation(opacity);
    };
  }, []);

  const props = useAnimatedProps(() => ({
    r:       r.value,
    opacity: opacity.value,
  }));

  return (
    <AnimatedCircle
      animatedProps={props}
      cx={cx}
      cy={cy}
      fill="none"
      stroke={RING_COL}
      strokeWidth={2}
    />
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
interface Props {
  size?: number;
}

export default function NetplayHeartbeatLoader({ size = 140 }: Props) {
  const nOffset  = useSharedValue(N_PERIM);
  const rrOffset = useSharedValue(RR_PERIM);
  const scale    = useSharedValue(1);
  const [phase2, setPhase2] = useState(false);

  // ── Phase 1: desenha N + rounded rect ─────────────────────────────────────
  useEffect(() => {
    const ease = Easing.out(Easing.cubic);

    nOffset.value = withTiming(
      0,
      { duration: DRAW_N_MS, easing: ease },
      (done) => {
        if (done) runOnJS(setPhase2)(true);
      },
    );

    rrOffset.value = withTiming(0, { duration: DRAW_RR_MS, easing: ease });

    return () => {
      cancelAnimation(nOffset);
      cancelAnimation(rrOffset);
      cancelAnimation(scale);
    };
  }, []);

  // ── Phase 2: heartbeat lub-dub ─────────────────────────────────────────────
  useEffect(() => {
    if (!phase2) return;
    scale.value = withRepeat(
      withSequence(
        withTiming(1.26, { duration: LUB_UP,   easing: Easing.out(Easing.quad) }),
        withTiming(0.96, { duration: LUB_DOWN,  easing: Easing.in(Easing.quad)  }),
        withTiming(1.14, { duration: DUB_UP,    easing: Easing.out(Easing.quad) }),
        withTiming(1.00, { duration: DUB_DOWN,  easing: Easing.in(Easing.quad)  }),
        withTiming(1.00, { duration: REST_MS }),
      ),
      -1,
      false,
    );
  }, [phase2]);

  // ── Animated props ────────────────────────────────────────────────────────
  const nProps  = useAnimatedProps(() => ({ strokeDashoffset: nOffset.value }));
  const rrProps = useAnimatedProps(() => ({ strokeDashoffset: rrOffset.value }));

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // O SVG dos anéis é maior (1.6×) e fica centrado atrás do logo
  const ringSize = size * 1.6;
  const logoSize = size;

  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>

      {/* ── Anéis concêntricos (sem escala, ficam fixos atrás) ── */}
      <View style={{ position: "absolute" }}>
        <Svg
          width={ringSize}
          height={ringSize}
          viewBox={`0 0 ${ringSize} ${ringSize}`}
        >
          <RippleRing delay={0}            svgSize={ringSize} />
          <RippleRing delay={RING_STEP}    svgSize={ringSize} />
          <RippleRing delay={RING_STEP * 2} svgSize={ringSize} />
        </Svg>
      </View>

      {/* ── Logo animado (com escala heartbeat) ── */}
      <Animated.View style={logoStyle}>
        <Svg width={logoSize} height={logoSize} viewBox={`0 0 ${VB} ${VB}`}>

          {/* Fundo escuro translúcido dentro da borda (rounded rect fill) */}
          <Rect
            x={RR_X + 3}
            y={RR_Y + 3}
            width={RR_W - 6}
            height={RR_H - 6}
            rx={RR_RX - 3}
            fill="rgba(30,0,0,0.6)"
          />

          {/* ─ N corpo preenchido (dois layers = sombra + cor) ─ */}
          <Path d={N_FILL_D} fill={N_SHADE} />
          <Path d={N_FILL_D} fill={N_BODY}  opacity={0.85} />

          {/* ─ Rounded rect — bloom glow (mais largo, transparente) ─ */}
          <AnimatedRect
            animatedProps={rrProps}
            x={RR_X}
            y={RR_Y}
            width={RR_W}
            height={RR_H}
            rx={RR_RX}
            fill="none"
            stroke={NEON_BLOOM}
            strokeWidth={14}
            strokeOpacity={0.22}
            strokeDasharray={RR_PERIM}
          />
          {/* ─ Rounded rect — linha neon fina principal ─ */}
          <AnimatedRect
            animatedProps={rrProps}
            x={RR_X}
            y={RR_Y}
            width={RR_W}
            height={RR_H}
            rx={RR_RX}
            fill="none"
            stroke={NEON}
            strokeWidth={3.5}
            strokeDasharray={RR_PERIM}
          />

          {/* ─ N neon — bloom glow externo (grosso, semi-transparente) ─ */}
          <AnimatedPath
            animatedProps={nProps}
            d={N_STROKE_D}
            fill="none"
            stroke={NEON_BLOOM}
            strokeWidth={30}
            strokeOpacity={0.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={N_PERIM}
          />
          {/* ─ N neon — linha principal brilhante ─ */}
          <AnimatedPath
            animatedProps={nProps}
            d={N_STROKE_D}
            fill="none"
            stroke={NEON}
            strokeWidth={14}
            strokeOpacity={0.95}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={N_PERIM}
          />
          {/* ─ N neon — highlight central fino (brilho branco suave) ─ */}
          <AnimatedPath
            animatedProps={nProps}
            d={N_STROKE_D}
            fill="none"
            stroke="rgba(255,200,180,0.25)"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={N_PERIM}
          />

          {/* ─ Estrela sparkle (canto inferior direito) ─ */}
          <Polygon
            points="183,172 184.5,176 188,176 185.5,178.5 186.5,182 183,180 179.5,182 180.5,178.5 178,176 181.5,176"
            fill="white"
            opacity={0.75}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
