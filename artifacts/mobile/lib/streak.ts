import AsyncStorage from "@react-native-async-storage/async-storage";

const STREAK_KEY = "netplay_streak_v1";

export interface StreakMilestone {
  days: number;
  emoji: string;
  title: string;
  description: string;
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  totalDays: number;
  lastWatchDate: string | null;
  achievedMilestones: number[];
}

export const STREAK_MILESTONES: StreakMilestone[] = [
  { days: 3,   emoji: "🔥", title: "Aquecendo",     description: "3 dias seguidos" },
  { days: 7,   emoji: "🔥", title: "Semana de Fogo", description: "7 dias seguidos" },
  { days: 14,  emoji: "⚡", title: "Quinzena",       description: "14 dias seguidos" },
  { days: 30,  emoji: "💎", title: "Mês Maratonado", description: "30 dias seguidos" },
  { days: 60,  emoji: "🌟", title: "Dois Meses",     description: "60 dias seguidos" },
  { days: 100, emoji: "🏆", title: "Centurião",      description: "100 dias seguidos" },
];

function toDateStr(iso: string): string {
  return iso.slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 86400000;
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / msPerDay);
}

export function computeStreak(updatedAts: (string | undefined)[]): Pick<StreakData, "currentStreak" | "longestStreak" | "totalDays" | "lastWatchDate"> {
  const dates = updatedAts
    .filter(Boolean)
    .map((d) => toDateStr(d!));

  const uniqueDates = [...new Set(dates)].sort();
  const totalDays = uniqueDates.length;

  if (totalDays === 0) {
    return { currentStreak: 0, longestStreak: 0, totalDays: 0, lastWatchDate: null };
  }

  const today = toDateStr(new Date().toISOString());
  const lastWatchDate = uniqueDates[uniqueDates.length - 1];

  // Compute longest streak
  let longestStreak = 1;
  let tempStreak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const diff = daysBetween(uniqueDates[i], uniqueDates[i - 1]);
    if (diff === 1) {
      tempStreak++;
      if (tempStreak > longestStreak) longestStreak = tempStreak;
    } else {
      tempStreak = 1;
    }
  }

  // Compute current streak (must include today or yesterday to be active)
  const diffFromToday = daysBetween(today, lastWatchDate);
  let currentStreak = 0;

  if (diffFromToday <= 1) {
    currentStreak = 1;
    for (let i = uniqueDates.length - 2; i >= 0; i--) {
      const diff = daysBetween(uniqueDates[i + 1], uniqueDates[i]);
      if (diff === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  return { currentStreak, longestStreak, totalDays, lastWatchDate };
}

export async function loadStreakData(updatedAts: (string | undefined)[]): Promise<StreakData> {
  const computed = computeStreak(updatedAts);

  let stored: Partial<StreakData> = {};
  try {
    const raw = await AsyncStorage.getItem(STREAK_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {}

  // Persist longest streak across history clears
  const longestStreak = Math.max(computed.longestStreak, stored.longestStreak ?? 0);

  const achievedMilestones = STREAK_MILESTONES
    .filter((m) => longestStreak >= m.days)
    .map((m) => m.days);

  const result: StreakData = {
    ...computed,
    longestStreak,
    achievedMilestones,
  };

  try {
    await AsyncStorage.setItem(STREAK_KEY, JSON.stringify({ longestStreak, achievedMilestones }));
  } catch {}

  return result;
}

export function nextMilestone(currentStreak: number): StreakMilestone | null {
  return STREAK_MILESTONES.find((m) => m.days > currentStreak) ?? null;
}
