/**
 * Progressive image preloader for Expo (expo-image).
 *
 * - Maintains a priority queue: "high" items jump to the front.
 * - Processes up to BATCH_SIZE images concurrently.
 * - Tracks what is already cached so the same URL is never fetched twice.
 * - Inserts a small pause between batches to avoid starving the network on
 *   lower-end Android devices.
 */

import { Image } from "expo-image";

const BATCH_SIZE   = 5;   // concurrent downloads per batch
const BATCH_DELAY  = 80;  // ms between batches (keeps UI responsive)

const preloaded = new Set<string>();
let highQueue: string[] = [];
let lowQueue:  string[] = [];
let running = false;

function dequeue(): string | undefined {
  return highQueue.shift() ?? lowQueue.shift();
}

function hasWork(): boolean {
  return highQueue.length > 0 || lowQueue.length > 0;
}

async function tick() {
  if (running || !hasWork()) return;
  running = true;

  const batch: string[] = [];
  while (batch.length < BATCH_SIZE && hasWork()) {
    const url = dequeue()!;
    if (!preloaded.has(url)) batch.push(url);
  }

  if (batch.length > 0) {
    await Promise.allSettled(
      batch.map((url) =>
        (Image.prefetch(url) as Promise<boolean>)
          .then(() => { preloaded.add(url); })
          .catch(() => {})
      )
    );
  }

  running = false;

  if (hasWork()) {
    setTimeout(tick, BATCH_DELAY);
  }
}

/**
 * Enqueue image URLs for background prefetching.
 *
 * @param urls     Array of fully-resolved image URLs.
 * @param priority "high" → prepended (loads first); "low" → appended.
 */
export function preloadImages(
  urls: string[],
  priority: "high" | "low" = "low"
): void {
  const fresh = urls.filter((u) => u && !preloaded.has(u));
  if (fresh.length === 0) return;

  if (priority === "high") {
    // Deduplicate against existing high-queue entries then prepend.
    const existing = new Set(highQueue);
    const toAdd = fresh.filter((u) => !existing.has(u));
    highQueue = [...toAdd, ...highQueue];
  } else {
    const existing = new Set(lowQueue);
    const toAdd = fresh.filter((u) => !existing.has(u));
    lowQueue.push(...toAdd);
  }

  tick();
}

/** Cancel all pending work (e.g. on logout / hard refresh). */
export function clearPreloadQueue(): void {
  highQueue = [];
  lowQueue  = [];
}

/** How many URLs have been resolved into cache this session. */
export function preloadedCount(): number {
  return preloaded.size;
}
