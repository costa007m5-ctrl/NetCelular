/**
 * shorts-challenge.ts — Desafio Semanal de Shorts
 *
 * Each ISO week has a themed challenge (e.g. "Maratona de Terror 🎃").
 * The user earns a badge after watching GOAL Shorts of the matching genre.
 * Challenges rotate deterministically from the CHALLENGES array by week number.
 * Progress and earned badges are stored in AsyncStorage — no server needed.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const PROGRESS_PREFIX = "netplay_challenge_progress_v1:";
const BADGES_KEY      = "netplay_challenge_badges_v1";

export const GOAL = 5; // Shorts to watch to complete the challenge

export interface WeeklyChallenge {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  genreId: number;
  color: string; // accent colour for the badge
}

export interface ChallengeProgress {
  weekKey: string;
  watched: number;    // how many qualifying Shorts watched this week
  completed: boolean;
  completedAt?: number;
}

export interface EarnedBadge {
  weekKey: string;
  challengeId: string;
  emoji: string;
  title: string;
  completedAt: number;
}

// ── 12 rotating challenges ────────────────────────────────────────────────────

export const CHALLENGES: WeeklyChallenge[] = [
  { id: "terror",      emoji: "🎃", title: "Maratona de Terror",    subtitle: "Assista 5 Shorts de Terror",           genreId: 27,    color: "#ff6b35" },
  { id: "scifi",       emoji: "🚀", title: "Semana Sci-Fi",         subtitle: "Assista 5 Shorts de Ficção Científica", genreId: 878,   color: "#3b82f6" },
  { id: "action",      emoji: "💥", title: "Adrenalina Total",      subtitle: "Assista 5 Shorts de Ação",             genreId: 28,    color: "#e50914" },
  { id: "comedy",      emoji: "😂", title: "Rindo sem Parar",       subtitle: "Assista 5 Shorts de Comédia",          genreId: 35,    color: "#fbbf24" },
  { id: "romance",     emoji: "❤️", title: "Romance em Alta",       subtitle: "Assista 5 Shorts de Romance",          genreId: 10749, color: "#f472b6" },
  { id: "thriller",    emoji: "😰", title: "Suspense Perfeito",     subtitle: "Assista 5 Shorts de Thriller",         genreId: 53,    color: "#8b5cf6" },
  { id: "animation",   emoji: "✨", title: "Animação Especial",     subtitle: "Assista 5 Shorts de Animação",         genreId: 16,    color: "#06b6d4" },
  { id: "drama",       emoji: "🎭", title: "Drama Intenso",         subtitle: "Assista 5 Shorts de Drama",            genreId: 18,    color: "#a78bfa" },
  { id: "fantasy",     emoji: "🧙", title: "Mundo Fantástico",      subtitle: "Assista 5 Shorts de Fantasia",         genreId: 14,    color: "#10b981" },
  { id: "documentary", emoji: "🌍", title: "Mundo Real",            subtitle: "Assista 5 Shorts de Documentário",     genreId: 99,    color: "#6ee7b7" },
  { id: "adventure",   emoji: "🗺️", title: "Grande Aventura",       subtitle: "Assista 5 Shorts de Aventura",         genreId: 12,    color: "#f59e0b" },
  { id: "crime",       emoji: "🔍", title: "Crime Perfeito",        subtitle: "Assista 5 Shorts de Crime",            genreId: 80,    color: "#64748b" },
];

// ── ISO week helpers ──────────────────────────────────────────────────────────

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getWeekKey(date = new Date()): string {
  return `${date.getFullYear()}-W${String(getISOWeek(date)).padStart(2, "0")}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns this week's challenge (deterministic from week number). */
export function getCurrentChallenge(): WeeklyChallenge {
  const week = getISOWeek(new Date());
  return CHALLENGES[week % CHALLENGES.length];
}

/** Returns the week key string (e.g. "2026-W25") for the current week. */
export function getCurrentWeekKey(): string {
  return getWeekKey();
}

/** Reads this week's challenge progress from AsyncStorage. */
export async function getChallengeProgress(): Promise<ChallengeProgress> {
  const weekKey = getWeekKey();
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_PREFIX + weekKey);
    if (raw) return JSON.parse(raw) as ChallengeProgress;
  } catch {}
  return { weekKey, watched: 0, completed: false };
}

/**
 * Called when a Short is watched.
 * @param genreIds  Genre IDs of the watched Short (from ShortItem.genreIds)
 * @returns Updated progress — check `completed` to show the badge toast
 */
export async function trackChallengeProgress(
  genreIds: number[],
): Promise<ChallengeProgress> {
  const challenge = getCurrentChallenge();
  const weekKey   = getWeekKey();

  // Only count if this Short belongs to this week's challenge genre
  if (!genreIds.includes(challenge.genreId)) {
    return getChallengeProgress();
  }

  const prev = await getChallengeProgress();
  if (prev.completed) return prev; // already done, don't double-count

  const watched   = prev.watched + 1;
  const completed = watched >= GOAL;
  const next: ChallengeProgress = {
    weekKey,
    watched,
    completed,
    ...(completed ? { completedAt: Date.now() } : {}),
  };

  try {
    await AsyncStorage.setItem(PROGRESS_PREFIX + weekKey, JSON.stringify(next));

    // If just completed, add to earned badges list
    if (completed && !prev.completed) {
      await _addEarnedBadge(weekKey, challenge);
    }
  } catch {}

  return next;
}

/** Returns all badges earned so far (newest first). */
export async function getEarnedBadges(): Promise<EarnedBadge[]> {
  try {
    const raw = await AsyncStorage.getItem(BADGES_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as EarnedBadge[]).sort(
      (a, b) => b.completedAt - a.completedAt
    );
  } catch {
    return [];
  }
}

async function _addEarnedBadge(weekKey: string, challenge: WeeklyChallenge): Promise<void> {
  try {
    const existing = await getEarnedBadges();
    // Deduplicate by weekKey
    const deduped  = existing.filter((b) => b.weekKey !== weekKey);
    const badge: EarnedBadge = {
      weekKey,
      challengeId: challenge.id,
      emoji: challenge.emoji,
      title: challenge.title,
      completedAt: Date.now(),
    };
    await AsyncStorage.setItem(BADGES_KEY, JSON.stringify([badge, ...deduped]));
  } catch {}
}
