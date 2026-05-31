import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBase } from "@/lib/api";

const CACHE_KEY = "netplay_catalog_v1";
const TTL_MS   = 60 * 60 * 1000;

const DIRECT_LISTS: Record<string, string> = {
  movie:  "https://redeflixapi.store/list-movie-ids.txt",
  tv:     "https://redeflixapi.store/list-tv-ids.txt",
  anime:  "https://redeflixapi.store/list-anime-ids.txt",
  dorama: "https://redeflixapi.store/list-dorama-ids.txt",
};

function parseIds(txt: string): number[] {
  return txt
    .split("\n")
    .map((l) => parseInt(l.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
}

async function fetchDirectCatalog(): Promise<{
  byType: Record<string, number[]>;
  allIds: number[];
  lastUpdated: string;
  nextUpdate: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const [movieTxt, tvTxt, animeTxt, doramaTxt] = await Promise.all([
      fetch(DIRECT_LISTS.movie,  { signal: controller.signal }).then((r) => r.ok ? r.text() : "").catch(() => ""),
      fetch(DIRECT_LISTS.tv,     { signal: controller.signal }).then((r) => r.ok ? r.text() : "").catch(() => ""),
      fetch(DIRECT_LISTS.anime,  { signal: controller.signal }).then((r) => r.ok ? r.text() : "").catch(() => ""),
      fetch(DIRECT_LISTS.dorama, { signal: controller.signal }).then((r) => r.ok ? r.text() : "").catch(() => ""),
    ]);
    clearTimeout(timer);

    const movie  = parseIds(movieTxt);
    const tv     = parseIds(tvTxt);
    const anime  = parseIds(animeTxt);
    const dorama = parseIds(doramaTxt);
    const allIds = [...new Set([...movie, ...tv, ...anime, ...dorama])];

    const now = new Date();
    return {
      byType: { movie, tv, anime, dorama },
      allIds,
      lastUpdated: now.toISOString(),
      nextUpdate: new Date(now.getTime() + TTL_MS).toISOString(),
    };
  } catch {
    clearTimeout(timer);
    throw new Error("direct catalog fetch failed");
  }
}

interface CatalogState {
  allIds: Set<number>;
  byType: Record<string, number[]>;
  lastUpdated: string;
  nextUpdate: string;
  loading: boolean;
  isAvailable: (id: number) => boolean;
}

const defaultState: CatalogState = {
  allIds: new Set(),
  byType: { movie: [], tv: [], anime: [], dorama: [] },
  lastUpdated: "",
  nextUpdate: "",
  loading: true,
  isAvailable: () => false,
};

const CatalogCtx = createContext<CatalogState>(defaultState);

export function useCatalog() {
  return useContext(CatalogCtx);
}

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<CatalogState, "isAvailable">>(defaultState);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadCatalog = useCallback(async (force = false) => {
    try {
      if (!force) {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          const age = Date.now() - new Date(cached.lastUpdated).getTime();
          if (age < TTL_MS && cached.allIds?.length > 0) {
            setState({
              allIds: new Set<number>(cached.allIds),
              byType: cached.byType,
              lastUpdated: cached.lastUpdated,
              nextUpdate: cached.nextUpdate,
              loading: false,
            });
            return;
          }
        }
      }

      let data: { byType: Record<string, number[]>; allIds: number[]; lastUpdated: string; nextUpdate: string } | null = null;

      const base = getApiBase();
      if (base) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(`${base}/redeflix/catalog`, { signal: controller.signal });
          clearTimeout(timer);
          if (res.ok) {
            data = await res.json();
          }
        } catch {
          data = null;
        }
      }

      if (!data || !data.allIds?.length) {
        data = await fetchDirectCatalog();
      }

      const allIds = new Set<number>(data.allIds as number[]);

      const snapshot = {
        allIds,
        byType: data.byType,
        lastUpdated: data.lastUpdated,
        nextUpdate: data.nextUpdate,
        loading: false,
      };
      setState(snapshot);

      await AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ...snapshot, allIds: [...allIds] })
      );
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    loadCatalog();

    timerRef.current = setInterval(() => {
      loadCatalog(true);
    }, TTL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loadCatalog]);

  const isAvailable = useCallback(
    (id: number) => state.allIds.size === 0 || state.allIds.has(id),
    [state.allIds]
  );

  return (
    <CatalogCtx.Provider value={{ ...state, isAvailable }}>
      {children}
    </CatalogCtx.Provider>
  );
}
