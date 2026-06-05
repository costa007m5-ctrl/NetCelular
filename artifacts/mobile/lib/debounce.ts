/** Creates a debounced version of a function */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delay);
  };
}

/** Creates a throttled version of a function */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let last = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - last >= limit) {
      last = now;
      fn(...args);
    }
  };
}

/** Creates a memoized version of a function */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  keyFn?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, ReturnType<T>>();
  return ((...args: Parameters<T>) => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    if (cache.has(key)) return cache.get(key) as ReturnType<T>;
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}
