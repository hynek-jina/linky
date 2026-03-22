import type { CapacitorLike } from "../types/browser";

export type PlatformTarget = "android" | "ios" | "web";

const isCapacitorLike = (value: unknown): value is CapacitorLike => {
  return typeof value === "object" && value !== null;
};

const getCapacitorGlobal = () => {
  const capacitor = Reflect.get(globalThis, "Capacitor");
  return isCapacitorLike(capacitor) ? capacitor : null;
};

export const getCapacitorServerUrl = (): string | null => {
  const capacitor = getCapacitorGlobal();
  if (!capacitor) return null;

  try {
    const serverUrl = capacitor.getServerUrl?.();
    return typeof serverUrl === "string" && serverUrl.trim()
      ? serverUrl.trim()
      : null;
  } catch {
    return null;
  }
};

export const getPlatformTarget = (): PlatformTarget => {
  const capacitor = getCapacitorGlobal();
  if (!capacitor) return "web";

  try {
    const platform = capacitor.getPlatform?.();
    if (platform === "android" || platform === "ios") {
      return platform;
    }
  } catch {
    // ignore
  }

  return "web";
};

export const isNativePlatform = (): boolean => {
  const capacitor = getCapacitorGlobal();
  if (!capacitor) return false;

  try {
    if (capacitor.isNativePlatform?.()) {
      return true;
    }
  } catch {
    // ignore
  }

  return getPlatformTarget() !== "web";
};
