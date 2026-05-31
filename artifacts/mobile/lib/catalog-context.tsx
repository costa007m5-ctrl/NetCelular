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

      const base = getApiBase();
      const res = await fetch(`${base}/redeflix/catalog`);
      if (!res.ok) throw new Error("catalog fetch failed");
      const data = await res.json();

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
