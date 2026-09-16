"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Browser-local state without hydration warnings or cascading effects.
 *
 * The watchlist and trigger log live in localStorage (no accounts, no
 * database), which means the server render cannot know their value. Reading
 * them in an effect would hydrate late and trip React's cascading-render
 * heuristics, so this uses the subscription model React actually provides for
 * external stores.
 */
const listeners = new Map<string, Set<() => void>>();

function emit(key: string) {
  listeners.get(key)?.forEach((cb) => cb());
}

export function writeLocalStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked or full — the UI keeps working from memory */
  }
  emit(key);
}

export function useLocalStorageJson<T>(
  key: string,
  fallback: T,
): [T, (value: T) => void, string] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const set = listeners.get(key) ?? new Set<() => void>();
      set.add(onChange);
      listeners.set(key, set);
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) onChange();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        set.delete(onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );

  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  }, [key]);

  const getServerSnapshot = useCallback(() => "", []);

  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const value = useMemo(() => {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }, [raw, fallback]);

  const set = useCallback((next: T) => writeLocalStorage(key, next), [key]);

  return [value, set, raw];
}
