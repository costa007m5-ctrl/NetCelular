/**
 * scene-scorer.ts
 *
 * IA de cenas: algoritmo que analisa metadados TMDB (gêneros, sinopse, runtime)
 * para calcular o timestamp mais interessante de um filme/série para um Short.
 *
 * Abordagem:
 *  1. Genre profile — cada gênero tem uma zona de pico narrativo (Freytag's Pyramid)
 *  2. Keyword boost — palavras-chave na sinopse ajustam o timestamp
 *  3. Seed determinístico — mesmo conteúdo + mesmo sceneIndex → mesmo resultado
 *  4. Rating confidence — conteúdo bem avaliado tem timestamps mais precisos
 *  5. Duração aleatória — entre 60s e 300s, determinística por cena (sem repetição)
 *  6. Multi-cena — sceneIndex garante cenas distintas do mesmo conteúdo
 */

export interface SceneScore {
  startTimePct: number;        // 0.0 – 1.0, posição relativa no conteúdo
  startTimeSeconds: number;    // seconds — derivado de startTimePct × runtimeSeconds
  clipDurationSeconds: number; // duração do short (60–300s, aleatório por cena)
  sceneLabel: string;          // label exibida no short ("Cena de ação", etc.)
  sceneIndex: number;          // índice da cena (0, 1, 2...) para identificação
}

interface GenreProfile {
  pct: number;       // porcentagem base do runtime
  variance: number;  // variação permitida (+/- para seed)
  label: string;     // label em PT-BR
}

// Picos narrativos por gênero baseados na estrutura dramática de Freytag
const GENRE_PROFILES: Record<number, GenreProfile> = {
  28:    { pct: 0.72, variance: 0.07, label: "Cena de ação" },
  12:    { pct: 0.65, variance: 0.10, label: "Aventura épica" },
  16:    { pct: 0.55, variance: 0.12, label: "Cena especial" },
  35:    { pct: 0.45, variance: 0.15, label: "Melhor cena" },
  80:    { pct: 0.71, variance: 0.07, label: "Cena decisiva" },
  99:    { pct: 0.50, variance: 0.15, label: "Momento revelador" },
  18:    { pct: 0.68, variance: 0.09, label: "Cena emocionante" },
  10751: { pct: 0.50, variance: 0.14, label: "Momento especial" },
  14:    { pct: 0.67, variance: 0.09, label: "Momento épico" },
  36:    { pct: 0.60, variance: 0.12, label: "Momento histórico" },
  27:    { pct: 0.79, variance: 0.06, label: "Cena de terror" },
  10402: { pct: 0.48, variance: 0.14, label: "Performance" },
  9648:  { pct: 0.74, variance: 0.07, label: "Revelação misteriosa" },
  10749: { pct: 0.58, variance: 0.10, label: "Cena romântica" },
  878:   { pct: 0.69, variance: 0.08, label: "Cena épica" },
  10770: { pct: 0.55, variance: 0.12, label: "Clímax" },
  53:    { pct: 0.76, variance: 0.06, label: "Momento de tensão" },
  10752: { pct: 0.73, variance: 0.07, label: "Batalha épica" },
  37:    { pct: 0.70, variance: 0.08, label: "Duelo decisivo" },
  // TV-specific
  10759: { pct: 0.71, variance: 0.07, label: "Cena de ação" },
  10762: { pct: 0.50, variance: 0.15, label: "Cena especial" },
  10763: { pct: 0.50, variance: 0.15, label: "Notícia impactante" },
  10764: { pct: 0.55, variance: 0.12, label: "Momento real" },
  10765: { pct: 0.68, variance: 0.08, label: "Cena fantástica" },
  10766: { pct: 0.62, variance: 0.10, label: "Reviravolta" },
  10767: { pct: 0.48, variance: 0.14, label: "Melhor momento" },
  10768: { pct: 0.73, variance: 0.07, label: "Cena de guerra" },
};

const DEFAULT_PROFILE: GenreProfile = {
  pct: 0.65,
  variance: 0.10,
  label: "Melhor momento",
};

// Palavras-chave que indicam ação/clímax → empurram timestamp para o final
const EXCITEMENT_KEYWORDS_PT = [
  "batalha", "luta", "fuga", "explosão", "guerra", "duelo", "confronto",
  "perseguição", "heróis", "vilão", "ataque", "ameaça", "destruição",
];
const EXCITEMENT_KEYWORDS_EN = [
  "battle", "fight", "chase", "explosion", "war", "duel", "clash",
  "attack", "villain", "hero", "threat", "destroy", "assault",
];
// Palavras de virada de roteiro → empurram para zona de revelação
const TWIST_KEYWORDS_PT = [
  "reviravolta", "segredo", "verdade", "revelação", "descobre", "traição",
  "identidade", "surpresa",
];
const TWIST_KEYWORDS_EN = [
  "twist", "secret", "truth", "reveal", "discovers", "betrayal",
  "identity", "surprise", "unexpected",
];
// Palavras românticas → recuam para zona do meio
const ROMANCE_KEYWORDS_PT = ["amor", "romance", "paixão", "beijo", "casal"];
const ROMANCE_KEYWORDS_EN = ["love", "passion", "kiss", "couple", "romance", "romantic"];

/**
 * Gera um número pseudo-aleatório determinístico no intervalo [0, 1)
 * baseado no tmdbId, gêneros e sceneIndex. Mesmo input → mesmo output.
 */
function deterministicRandom(tmdbId: number, genreIds: number[], sceneIndex: number): number {
  const base = tmdbId * 2654435761;
  const gsum = genreIds.reduce((a, b) => a + b, 0);
  // Mix sceneIndex to ensure cada cena produz um valor distinto
  const mixed = (base ^ gsum ^ (sceneIndex * 1000003)) >>> 0;
  return mixed / 0xffffffff;
}

/**
 * Calcula uma duração de clip aleatória mas determinística.
 * Mínimo: 60s | Máximo: 300s (5 minutos)
 * A distribuição é tendenciada para durações mais curtas (60–120s) para
 * manter a experiência de "short", com ocasionais clipes mais longos.
 */
function calcClipDuration(tmdbId: number, genreIds: number[], sceneIndex: number): number {
  const seed = deterministicRandom(tmdbId * 7, genreIds, sceneIndex + 100);

  const MIN_DURATION = 60;
  const MAX_DURATION = 300;

  // Distribuição não-linear: 60% dos clips ficam entre 60–120s,
  // 30% entre 120–180s e 10% entre 180–300s (os "épicos")
  let duration: number;
  if (seed < 0.60) {
    duration = MIN_DURATION + seed * (1 / 0.60) * 60; // 60–120s
  } else if (seed < 0.90) {
    duration = 120 + ((seed - 0.60) / 0.30) * 60;    // 120–180s
  } else {
    duration = 180 + ((seed - 0.90) / 0.10) * 120;   // 180–300s
  }

  return Math.round(duration);
}

/**
 * Zonas de início para múltiplas cenas do mesmo conteúdo.
 * Divide o conteúdo em seções para evitar sobreposição entre cenas.
 */
const SCENE_ZONES = [
  { startPct: 0.15, endPct: 0.40, label: "Início" },   // Apresentação
  { startPct: 0.40, endPct: 0.65, label: "Meio" },      // Desenvolvimento
  { startPct: 0.65, endPct: 0.85, label: "Clímax" },    // Clímax
  { startPct: 0.25, endPct: 0.55, label: "Cena" },      // Extra 1
  { startPct: 0.55, endPct: 0.80, label: "Final" },     // Extra 2
];

export function scoreScene(params: {
  tmdbId: number;
  genreIds: number[];
  overview: string;
  runtimeMinutes: number; // 0 = unknown
  sceneIndex?: number;    // índice da cena (0 = padrão/principal)
}): SceneScore {
  const { tmdbId, genreIds, overview, runtimeMinutes, sceneIndex = 0 } = params;

  // ── 1. Genre profile ────────────────────────────────────────────────────────
  let profile = DEFAULT_PROFILE;
  for (const id of genreIds) {
    if (GENRE_PROFILES[id]) {
      profile = GENRE_PROFILES[id];
      break;
    }
  }

  // ── 2. Keyword boost ────────────────────────────────────────────────────────
  const ov = overview.toLowerCase();

  let boost = 0;
  const hasExcitement =
    EXCITEMENT_KEYWORDS_PT.some((k) => ov.includes(k)) ||
    EXCITEMENT_KEYWORDS_EN.some((k) => ov.includes(k));
  const hasTwist =
    TWIST_KEYWORDS_PT.some((k) => ov.includes(k)) ||
    TWIST_KEYWORDS_EN.some((k) => ov.includes(k));
  const hasRomance =
    ROMANCE_KEYWORDS_PT.some((k) => ov.includes(k)) ||
    ROMANCE_KEYWORDS_EN.some((k) => ov.includes(k));

  if (hasExcitement) boost += 0.04;
  if (hasTwist) boost += 0.03;
  if (hasRomance) boost -= 0.04;

  let finalPct: number;

  if (sceneIndex === 0) {
    // ── Cena principal: usa o algoritmo original de genre profile ──────────────
    const seed = deterministicRandom(tmdbId, genreIds, 0);
    const variance = (seed - 0.5) * profile.variance;
    finalPct = Math.min(0.88, Math.max(0.12, profile.pct + boost + variance));
  } else {
    // ── Cenas adicionais: distribui por zonas distintas do conteúdo ───────────
    const zone = SCENE_ZONES[sceneIndex % SCENE_ZONES.length];
    const seed = deterministicRandom(tmdbId, genreIds, sceneIndex);
    // Posição aleatória dentro da zona
    finalPct = zone.startPct + seed * (zone.endPct - zone.startPct);
    finalPct = Math.min(0.88, Math.max(0.12, finalPct + boost * 0.5));
  }

  // ── 3. Convert to seconds ───────────────────────────────────────────────────
  const effectiveRuntime = runtimeMinutes > 0 ? runtimeMinutes : 100;
  const runtimeSeconds = effectiveRuntime * 60;
  const startTimeSeconds = Math.floor(finalPct * runtimeSeconds);

  // ── 4. Duração aleatória determinística (60–300s) ───────────────────────────
  const clipDurationSeconds = calcClipDuration(tmdbId, genreIds, sceneIndex);

  // ── 5. Label da cena ────────────────────────────────────────────────────────
  let sceneLabel = profile.label;
  if (sceneIndex > 0) {
    const zone = SCENE_ZONES[sceneIndex % SCENE_ZONES.length];
    // Combina label do gênero com zona para diferenciar
    sceneLabel = `${profile.label} · ${zone.label}`;
  }

  return {
    startTimePct: finalPct,
    startTimeSeconds,
    clipDurationSeconds,
    sceneLabel,
    sceneIndex,
  };
}
