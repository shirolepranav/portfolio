// A tiny event store shared by the world and the HUD: read a value, set it, listen for changes.
export function createState<T extends object>(init: T) {
  const s = { ...init };
  const subs: { [K in keyof T]?: Set<(v: T[K]) => void> } = {};
  return {
    get: <K extends keyof T>(k: K) => s[k],
    set<K extends keyof T>(k: K, v: T[K]) {
      if (s[k] === v) return;
      s[k] = v;
      subs[k]?.forEach((f) => f(v));
    },
    /** Calls f on every change of k. Returns a function that stops listening. */
    on<K extends keyof T>(k: K, f: (v: T[K]) => void) {
      const set = (subs[k] ??= new Set());
      set.add(f);
      return () => set.delete(f);
    },
  };
}

/** The world's shared state. progress: 0 to 1 around the loop, 0 at the Trailhead. */
export type WorldState = ReturnType<typeof createState<{ progress: number }>>;
