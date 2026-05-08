import { Capacitor } from "@capacitor/core";
import type { CapacitorLike } from "../types/browser";

export type PlatformTarget = "android" | "ios" | "web";
export type TelemetryAppRuntime = "native" | "pwa" | "web";
export type TelemetryDevicePlatform =
  | "android"
  | "iphone"
  | "ipad"
  | "linux"
  | "mac"
  | "windows"
  | "unknown";

export const getTelemetryAppHost = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const host = String(window.location.host ?? "")
    .trim()
    .toLowerCase();

  return host ? host.slice(0, 255) : null;
};

const isCapacitorLike = (value: unknown): value is CapacitorLike => {
  return typeof value === "object" && value !== null;
};

const getCapacitorGlobal = () => {
  const capacitor = Reflect.get(globalThis, "Capacitor");
  return isCapacitorLike(capacitor) ? capacitor : null;
};

const getCapacitorInstance = (): CapacitorLike | null => {
  if (isCapacitorLike(Capacitor)) {
    return Capacitor;
  }

  return getCapacitorGlobal();
};

const getNavigator = (): Navigator | null => {
  return typeof navigator === "undefined" ? null : navigator;
};

const getLowercaseUserAgent = (): string => {
  const browserNavigator = getNavigator();
  return String(browserNavigator?.userAgent ?? "").toLowerCase();
};

const getNavigatorStandalone = (): boolean => {
  const browserNavigator = getNavigator();
  const standalone = Reflect.get(browserNavigator ?? {}, "standalone");
  return standalone === true;
};

const getNavigatorMaxTouchPoints = (): number => {
  const browserNavigator = getNavigator();
  return typeof browserNavigator?.maxTouchPoints === "number"
    ? browserNavigator.maxTouchPoints
    : 0;
};

export const getCapacitorServerUrl = (): string | null => {
  const capacitor = getCapacitorInstance();
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
  const capacitor = getCapacitorInstance();
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
  const capacitor = getCapacitorInstance();
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

export const getTelemetryAppRuntime = (): TelemetryAppRuntime => {
  if (isNativePlatform()) {
    return "native";
  }

  if (typeof window !== "undefined") {
    try {
      if (window.matchMedia("(display-mode: standalone)").matches) {
        return "pwa";
      }
    } catch {
      // ignore
    }
  }

  if (getNavigatorStandalone()) {
    return "pwa";
  }

  return "web";
};

export const getTelemetryDevicePlatform = (): TelemetryDevicePlatform => {
  const platformTarget = getPlatformTarget();
  const userAgent = getLowercaseUserAgent();
  const maxTouchPoints = getNavigatorMaxTouchPoints();

  if (platformTarget === "android" || userAgent.includes("android")) {
    return "android";
  }

  if (userAgent.includes("iphone") || userAgent.includes("ipod")) {
    return "iphone";
  }

  if (userAgent.includes("ipad")) {
    return "ipad";
  }

  if (platformTarget === "ios") {
    return "iphone";
  }

  if (userAgent.includes("macintosh") && maxTouchPoints > 1) {
    return "ipad";
  }

  if (userAgent.includes("macintosh") || userAgent.includes("mac os x")) {
    return "mac";
  }

  if (userAgent.includes("windows")) {
    return "windows";
  }

  if (userAgent.includes("linux") || userAgent.includes("x11")) {
    return "linux";
  }

  return "unknown";
};
