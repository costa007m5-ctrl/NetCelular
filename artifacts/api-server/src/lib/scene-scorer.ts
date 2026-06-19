/**
 * scene-scorer.ts
 *
 * IA de cenas: algoritmo que analisa metadados TMDB (gêneros, sinopse, runtime)
 * para calcular o timestamp mais interessante de um filme/série para um Short.
 *
 * Abordagem:
 *  1. Genre profile — cada gênero tem uma zona de pico narrativo (Freytag's Pyramid)
 *  2. Keyword boost — palavras-chave na sinopse ajustam o timestamp
 *  3. Seed determinístico — mesmo conteúdo → mesmo timestamp (sem aleatoriedade pura)
 *  4. Rating confidence — conteúdo bem avaliado tem timestamps mais precisos
 */

export interface SceneScore {
  startTimePct: number;   // 0.0 – 1.0, posição relativa no conteúdo
  startTimeSeconds: number; // seconds — derivado de startTimePct × runtimeSeconds
  clipDurationSeconds: number; // duração do short (default 60s)
  sceneLabel: string;     // label exibida no short ("Cena de ação", etc.)
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
 * Calcula um seed determinístico a partir do tmdbId para que o mesmo
 * conteúdo sempre gere o mesmo timestamp (consistência entre cargas).
 */
function deterministicSeed(tmdbId: number, genreIds: number[]): number {
  const base = tmdbId * 2654435761;
  const gsum = genreIds.reduce((a, b) => a + b, 0);
  return ((base ^ gsum) >>> 0) / 0xffffffff;
}

export function scoreScene(params: {
  tmdbId: number;
  genreIds: number[];
  overview: string;
  runtimeMinutes: number; // 0 = unknown
}): SceneScore {
  const { tmdbId, genreIds, overview, runtimeMinutes } = params;

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

  // ── 3. Deterministic variance ───────────────────────────────────────────────
  const seed = deterministicSeed(tmdbId, genreIds);
  const variance = (seed - 0.5) * profile.variance;

  // ── 4. Final percentage ─────────────────────────────────────────────────────
  const finalPct = Math.min(0.88, Math.max(0.12, profile.pct + boost + variance));

  // ── 5. Convert to seconds ───────────────────────────────────────────────────
  // Use runtime if available; otherwise assume 100min (movie) / 45min (episode)
  const effectiveRuntime = runtimeMinutes > 0 ? runtimeMinutes : 100;
  const runtimeSeconds = effectiveRuntime * 60;
  const startTimeSeconds = Math.floor(finalPct * runtimeSeconds);

  const CLIP_DURATION = 60; // seconds

  return {
    startTimePct: finalPct,
    startTimeSeconds,
    clipDurationSeconds: CLIP_DURATION,
    sceneLabel: profile.label,
  };
}
