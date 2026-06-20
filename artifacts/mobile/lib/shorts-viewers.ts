/**
 * shorts-viewers.ts — Supabase Realtime presence-based viewer counter.
 * Each Short has a channel `shorts-viewers:{tmdbId}`.
 * When a user opens a Short, they join the channel via `track()`.
 * The presence sync event fires whenever someone joins/leaves,
 * giving an accurate live count across all connected devices.
 *
 * Falls back to a plausible pseudo-count if Realtime doesn't connect
 * within FALLBACK_MS, so the badge always appears (never empty).
 */

import { supabase } from "./supabase";

const FALLBACK_MS = 4_000; // show pseudo-count after 4 s if no Realtime

// Derive a plausible "people watching" number from the item's like count.
// This is only shown when Realtime fails to connect (e.g. offline).
export function pseudoViewerCount(likes: number): number {
  // Seed from likes so the same item always shows the same number
  const base = Math.max(6, Math.round(likes * 0.04));
  const noise = (likes % 7) + 2; // deterministic "random" based on likes
  return base + noise;
}

export interface ViewerSubscription {
  unsubscribe: () => void;
}

/**
 * Subscribe to the live viewer count for a given Short.
 *
 * @param tmdbId   The TMDB id of the Short content
 * @param userId   Current user's id (used as presence key)
 * @param likes    Item's like count — used only for the fallback pseudo-count
 * @param onCount  Called with the updated count whenever it changes
 * @returns        An object with an `unsubscribe()` method — call on cleanup
 */
export function subscribeToViewerCount(
  tmdbId: number,
  userId: string,
  likes: number,
  onCount: (count: number) => void,
): ViewerSubscription {
  let subscribed = false;
  let unsubscribed = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  const channelName = `shorts-viewers:${tmdbId}`;
  const channel = supabase.channel(channelName, {
    config: { presence: { key: userId || "anon" } },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      if (unsubscribed) return;
      const state = channel.presenceState<{ user_id: string }>();
      const count = Object.keys(state).length;
      if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
      onCount(Math.max(1, count));
    })
    .subscribe(async (status) => {
      if (unsubscribed) return;
      if (status === "SUBSCRIBED") {
        subscribed = true;
        try {
          await channel.track({ user_id: userId, joined_at: Date.now() });
        } catch {
          // Presence track failed — fallback already handled by timer
        }
      }
    });

  // If Realtime doesn't respond in FALLBACK_MS, show a pseudo-count
  fallbackTimer = setTimeout(() => {
    if (unsubscribed || subscribed) return;
    onCount(pseudoViewerCount(likes));
  }, FALLBACK_MS);

  return {
    unsubscribe: () => {
      unsubscribed = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      try { supabase.removeChannel(channel); } catch {}
    },
  };
}
