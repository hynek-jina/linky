import React from "react";

import { clientInspectorStore } from "./clientInspectorStore";

export const INSPECTOR_ENABLED_STORAGE_KEY = "linky.inspector_enabled";

const readPreference = (): boolean | null => {
  try {
    const stored = globalThis.localStorage.getItem(
      INSPECTOR_ENABLED_STORAGE_KEY,
    );
    if (stored === "true") return true;
    if (stored === "false") return false;
    return null;
  } catch {
    return null;
  }
};

let preference = readPreference();
const listeners = new Set<() => void>();

export const resolveInspectorEnabled = (
  storedPreference: boolean | null,
  isDev: boolean,
): boolean => storedPreference ?? isDev;

export const getInspectorEnabled = (): boolean =>
  resolveInspectorEnabled(preference, import.meta.env.DEV);

export const setInspectorEnabled = (enabled: boolean): void => {
  const changed = preference !== enabled;
  preference = enabled;
  try {
    globalThis.localStorage.setItem(
      INSPECTOR_ENABLED_STORAGE_KEY,
      String(enabled),
    );
  } catch {
    // The setting still applies for this session when storage is unavailable.
  }

  if (!enabled) clientInspectorStore.clear();
  if (changed) {
    for (const listener of listeners) listener();
  }
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useInspectorEnabled = (): boolean =>
  React.useSyncExternalStore(subscribe, getInspectorEnabled, () => false);
