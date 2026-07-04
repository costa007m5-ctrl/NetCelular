import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBase } from "@/lib/api";

export interface ContentEdit {
  key: string;
  tmdbId?: number;
  tmdbType?: "movie" | "tv";
  title?: string;
  posterPath?: string;
  backdropPath?: string;
  overview?: string;
  year?: number;
  rating?: number;
  updatedAt: number;
}

const STORAGE_KEY = "netplay_content_edits_v1";

let _edits: Record<string, ContentEdit> = {};
let _loaded = false;
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

export function subscribeContentEdits(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getContentEdit(key: string | undefined | null): ContentEdit | undefined {
  if (!key) return undefined;
  return _edits[key];
}

/** Merges a stored edit override into a rendered item (poster, backdrop, title, year, rating, description). */
export function applyContentEdit<T extends { id: string; posterPath?: string; backdropPath?: string; title?: string; year?: number; rating?: number; description?: string }>(item: T): T {
  const edit = _edits[item.id];
  if (!edit) return item;
  return {
    ...item,
    posterPath: edit.posterPath || item.posterPath,
    backdropPath: edit.backdropPath || item.backdropPath,
    title: edit.title || item.title,
    year: edit.year ?? item.year,
    rating: edit.rating ?? item.rating,
    description: edit.overview || item.description,
  };
}

export function useAppliedContentItem<T extends { id: string; posterPath?: string; backdropPath?: string; title?: string; year?: number; rating?: number; description?: string }>(item: T): T {
  const [, setTick] = useState(0);
  useEffect(() => {
    loadContentEdits();
    return subscribeContentEdits(() => setTick((t) => t + 1));
  }, []);
  return applyContentEdit(item);
}

async function persistLocal() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(_edits));
  } catch {}
}

export async function loadContentEdits(force = false): Promise<void> {
  if (_loaded && !force) return;
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEY);
    if (cached) {
      _edits = JSON.parse(cached);
      _loaded = true;
      notify();
    }
  } catch {}

  try {
    const base = getApiBase();
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${base}/content-edits`, { signal: ctrl.signal });
    clearTimeout(tid);
    if (res.ok) {
      const data = await res.json();
      if (data?.ok && data.edits) {
        _edits = data.edits;
        _loaded = true;
        persistLocal();
        notify();
      }
    }
  } catch {}
}

export async function saveContentEdit(
  key: string,
  patch: Partial<Omit<ContentEdit, "key" | "updatedAt">>,
): Promise<ContentEdit | null> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/content-edits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, ...patch }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.ok && data.edit) {
      _edits = { ..._edits, [key]: data.edit };
      persistLocal();
      notify();
      return data.edit as ContentEdit;
    }
    return null;
  } catch {
    return null;
  }
}

export async function removeContentEdit(key: string): Promise<boolean> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/content-edits/${encodeURIComponent(key)}`, { method: "DELETE" });
    if (!res.ok) return false;
    delete _edits[key];
    persistLocal();
    notify();
    return true;
  } catch {
    return false;
  }
}
