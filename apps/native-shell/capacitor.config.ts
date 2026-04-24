import type { CapacitorConfig } from "@capacitor/cli";

const nativeBackgroundColor = "#0b1222";

const resolveLiveReloadUrl = (): string | null => {
  const candidate =
    process.env.LINKY_CAP_SERVER_URL?.trim() ??
    process.env.CAP_SERVER_URL?.trim() ??
    "";

  if (!candidate) return null;

  const normalized = candidate.trim();
  if (!normalized.startsWith("https://")) {
    throw new Error(
      "LINKY_CAP_SERVER_URL/CAP_SERVER_URL must use https:// to avoid mixed-origin wallet state",
    );
  }

  return normalized;
};

const liveReloadUrl = resolveLiveReloadUrl();

const config: CapacitorConfig = {
  appId: "fit.linky.app",
  appName: "Linky",
  webDir: "../web-app/dist",
  android: {
    backgroundColor: nativeBackgroundColor,
  },
  ios: {
    backgroundColor: nativeBackgroundColor,
  },
  ...(liveReloadUrl
    ? {
        server: {
          url: liveReloadUrl,
          cleartext: false,
          androidScheme: "https",
          iosScheme: "https",
        },
      }
    : {}),
};

export default config;
