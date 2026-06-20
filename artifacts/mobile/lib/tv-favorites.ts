/**
 * tv-favorites.ts — Canais favoritos do usuário
 *
 * Persiste no AsyncStorage como array de channel IDs.
 * Sem dependência de Supabase — funciona offline.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@netplay_tv_favorites_v1";

export async function loadFavorites(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export async function saveFavorites(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(ids));
  } catch {}
}

export async function toggleFavorite(channelId: string): Promise<{ favorites: string[]; added: boolean }> {
  const current = await loadFavorites();
  const idx = current.indexOf(channelId);
  let next: string[];
  let added: boolean;
  if (idx >= 0) {
    next = current.filter((id) => id !== channelId);
    added = false;
  } else {
    next = [channelId, ...current];
    added = true;
  }
  await saveFavorites(next);
  return { favorites: next, added };
}

export function isFavorite(channelId: string, favorites: string[]): boolean {
  return favorites.includes(channelId);
}
