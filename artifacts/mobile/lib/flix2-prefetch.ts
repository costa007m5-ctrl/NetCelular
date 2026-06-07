/**
 * flix2-prefetch.ts
 * Background service que baixa TODO o catálogo Flix 2.0 (filmes + séries + animes)
 * em segundo plano no início do app, armazenando no AsyncStorage para acesso
 * instantâneo nas telas.
 *
 * Fluxo:
 *  1. App start → startBackgroundPrefetch() chamado após 4s
 *  2. Verifica se último sync foi há < REFETCH_INTERVAL_MS
 *  3. Se stale: baixa /flix2/catalog-full para cada tipo (sequencial)
 *  4. Salva em catalog-cache (TTL 6h)
 *  5. Emite eventos de progresso para assinantes (home screen, etc.)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { r2Route } from "@/lib/r2-direct";
import { setCachedFull, getCacheTimestamp } from "@/lib/catalog-cache";

// ─── Config ──────────────────────────────────────────────────────────────────
const LAST_FULL_SYNC_KEY   = "flix2_last_full_sync_v2";
const REFETCH_INTERVAL_MS  = 4 * 60 * 60 * 1000;   // 4 horas entre syncs completos
const STALE_CACHE_LIMIT_MS = 2 * 60 * 60 * 1000;   // só baixa se cache < 2h stale

// ─── Types ────────────────────────────────────────────────────────────────────
export type PrefetchPhase =
  | "idle"
  | "checking"
  | "movies"
  | "series"
  | "animes"
  | "done"
  | "error";

export interface PrefetchState {
  phase:       PrefetchPhase;
  completed:   number;   // 0-3
  total:       number;   // 3
  lastSyncAt?: number;   // timestamp do último sync completo
  error?:      string;
}

type Listener = (state: PrefetchState) => void;

// ─── Module state ─────────────────────────────────────────────────────────────
let _state: PrefetchState = { phase: "idle", completed: 0, total: 3 };
let _listeners: Listener[] = [];
let _isRunning = false;

// ─── Internal helpers ─────────────────────────────────────────────────────────
function emit(patch: Partial<PrefetchState>) {
  _state = { ..._state, ...patch };
  for (const fn of _listeners) {
    try { fn(_state); } catch {}
  }
}

async function getLastSyncTs(): Promise<number | null> {
  try {
    const v = await AsyncStorage.getItem(LAST_FULL_SYNC_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

async function setLastSyncTs(ts: number) {
  try { await AsyncStorage.setItem(LAST_FULL_SYNC_KEY, String(ts)); } catch {}
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Retorna o estado atual do prefetch (sincrono). */
export function getPrefetchState(): PrefetchState {
  return _state;
}

/**
 * Inscreve-se em atualizações de estado.
 * Retorna função de limpeza (unsub).
 */
export function subscribePrefetch(fn: Listener): () => void {
  _listeners.push(fn);
  fn(_state); // estado atual imediatamente
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}

/**
 * Inicia o download em segundo plano de todo o catálogo Flix 2.0.
 * - Idempotente: segunda chamada enquanto rodando é ignorada
 * - Verifica TTL: se sync recente existe, apenas emite "done" e retorna
 * - Não lança exceções — falhas são silenciosas por tipo
 */
export async function startBackgroundPrefetch(): Promise<void> {
  if (_isRunning) return;
  _isRunning = true;

  emit({ phase: "checking", completed: 0 });

  try {
    // ── Verificar timestamp do último sync completo ───────────────────────────
    const lastSync = await getLastSyncTs();
    if (lastSync && Date.now() - lastSync < REFETCH_INTERVAL_MS) {
      emit({ phase: "done", completed: 3, lastSyncAt: lastSync });
      _isRunning = false;
      return;
    }

    // ── Verificar cache existente ─────────────────────────────────────────────
    // Se o cache de movies foi atualizado recentemente, pular esse tipo
    const cacheTs = await getCacheTimestamp("movies");
    if (cacheTs && Date.now() - cacheTs < STALE_CACHE_LIMIT_MS) {
      // Cache relativamente recente mas sem full sync marcado —
      // ainda fazemos o sync completo para ter todos os itens
    }

    // ── Baixar cada tipo sequencialmente ─────────────────────────────────────
    const types: Array<"movies" | "series" | "animes"> = ["movies", "series", "animes"];
    let completed = 0;

    for (const type of types) {
      emit({ phase: type, completed });
      try {
        const result = await r2Route<{
          success: boolean;
          data: any[];
          total: number;
          fromCache?: boolean;
        }>(`/flix2/catalog-full?type=${type}`);

        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
          await setCachedFull(type, result.data);
        }
      } catch {
        // Falha silenciosa por tipo — continua com os próximos
      }
      completed++;
    }

    // ── Marcar sync como completo ─────────────────────────────────────────────
    const now = Date.now();
    await setLastSyncTs(now);
    emit({ phase: "done", completed: 3, lastSyncAt: now });
  } catch {
    emit({ phase: "error", error: "Falha no sync do catálogo" });
  } finally {
    _isRunning = false;
  }
}

/**
 * Força um novo sync completo ignorando o TTL.
 * Útil para pull-to-refresh manual.
 */
export async function forceRefreshCatalog(): Promise<void> {
  try { await AsyncStorage.removeItem(LAST_FULL_SYNC_KEY); } catch {}
  _isRunning = false;
  return startBackgroundPrefetch();
}

/** Retorna true se prefetch está rodando agora. */
export function isPrefetchRunning(): boolean {
  return _isRunning;
}
