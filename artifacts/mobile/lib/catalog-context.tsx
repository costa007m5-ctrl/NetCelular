import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { r2Route } from "@/lib/r2-direct";

const CACHE_KEY = "netplay_flix2_catalog_v2";
const TTL_MS   = 60 * 60 * 1000;

interface Flix2Item {
  id: string | number;
  tmdb_id: number;
  title: string;
  poster?: string;
  type?: string;
}

async function fetchFlix2Catalog(): Promise<{
  byType: Record<string, number[]>;
  allIds: number[];
  lastUpdated: string;
  nextUpdate: string;
}> {
  const [movies, series, animes] = await Promise.allSettled([
    r2Route<{ success: boolean; total: number; data: Flix2Item[] }>("/flix2/catalog-full?type=movies"),
    r2Route<{ success: boolean; total: number; data: Flix2Item[] }>("/flix2/catalog-full?type=series"),
    r2Route<{ success: boolean; total: number; data: Flix2Item[] }>("/flix2/catalog-full?type=animes"),
  ]);

  const movieIds = movies.status === "fulfilled" && movies.value.success
    ? movies.value.data.map((i) => i.tmdb_id).filter(Boolean)
    : [];
  const seriesIds = series.status === "fulfilled" && series.value.success
    ? series.value.data.map((i) => i.tmdb_id).filter(Boolean)
    : [];
  const animeIds = animes.status === "fulfilled" && animes.value.success
    ? animes.value.data.map((i) => i.tmdb_id).filter(Boolean)
    : [];

  const allIds = [...new Set([...movieIds, ...seriesIds, ...animeIds])];
  const now = new Date();
  return {
    byType: { movie: movieIds, tv: seriesIds, anime: animeIds },
    allIds,
    lastUpdated: now.toISOString(),
    nextUpdate: new Date(now.getTime() + TTL_MS).toISOString(),
  };
}

interface CatalogState {
  allIds: number[];
  byType: Record<string, number[]>;
  lastUpdated: string;
  nextUpdate: string;
  loading: boolean;
  isAvailable: (id: number) => boolean;
}

const defaultState: CatalogState = {
  allIds: [],
  byType: { movie: [], tv: [], anime: [] },
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
              allIds: cached.allIds,
              byType: cached.byType ?? {},
              lastUpdated: cached.lastUpdated,
              nextUpdate: cached.nextUpdate ?? "",
              loading: false,
            });
            return;
          }
        }
      }
    } catch {}

    try {
      const data = await fetchFlix2Catalog();
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data)).catch(() => {});
      setState({
        allIds: data.allIds,
        byType: data.byType,
        lastUpdated: data.lastUpdated,
        nextUpdate: data.nextUpdate,
        loading: false,
      });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    // Delay the initial catalog fetch by 8 seconds so the home screen and tabs
    // can load their lightweight requests first (catalog-full is very slow: 30-60s).
    const startDelay = setTimeout(() => {
      loadCatalog();
      timerRef.current = setInterval(() => loadCatalog(true), TTL_MS);
    }, 8000);
    return () => {
      clearTimeout(startDelay);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loadCatalog]);

  const idSet = React.useMemo(() => new Set(state.allIds), [state.allIds]);
  const isAvailable = useCallback(
    (id: number) => idSet.has(id),
    [idSet]
  );

  return (
    <CatalogCtx.Provider value={{ ...state, isAvailable }}>
      {children}
    </CatalogCtx.Provider>
  );
}
