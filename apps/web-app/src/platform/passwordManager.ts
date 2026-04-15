import type {
  CredentialStoreLike,
  NavigatorWithOptionalUserAgentData,
} from "../types/browser";
import { isNativePlatform } from "./runtime";

export interface PasswordManagerCredential {
  accountName: string;
  seed: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const normalizeStoredValue = (value: unknown): string => {
  return String(value ?? "").trim();
};

const getCredentialsContainer = (): CredentialStoreLike | null => {
  if (typeof navigator === "undefined") return null;

  const credentials = navigator.credentials;
  if (!isRecord(credentials)) return null;

  const rawGet = Reflect.get(credentials, "get");
  if (typeof rawGet === "function") {
    return {
      get: (options) => Reflect.apply(rawGet, credentials, [options]),
    };
  }

  return null;
};

const getBrowserNavigator = (): NavigatorWithOptionalUserAgentData | null => {
  if (typeof navigator === "undefined") return null;
  return navigator;
};

const isMacPlatformValue = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized.includes("mac") || normalized.includes("darwin");
};

export const isMacBrowserPlatform = (): boolean => {
  const nav = getBrowserNavigator();
  if (!nav) return false;

  const userAgentDataPlatform = nav.userAgentData?.platform;
  if (
    typeof userAgentDataPlatform === "string" &&
    isMacPlatformValue(userAgentDataPlatform)
  ) {
    return true;
  }

  if (typeof nav.platform === "string" && isMacPlatformValue(nav.platform)) {
    return true;
  }

  const userAgent = String(nav.userAgent ?? "").toLowerCase();
  return userAgent.includes("macintosh") || userAgent.includes("mac os x");
};

export const isStandaloneWebApp = (): boolean => {
  if (isNativePlatform()) return false;
  const nav = getBrowserNavigator();
  if (!nav) return false;

  if (nav.standalone === true) return true;

  return Boolean(globalThis.matchMedia?.("(display-mode: standalone)").matches);
};

export const shouldOfferOnboardingPasswordManagerSave = (): boolean => {
  if (isNativePlatform()) return false;
  return isStandaloneWebApp() || isMacBrowserPlatform();
};

export const supportsPasswordManagerCredentialAccess = (): boolean => {
  const credentials = getCredentialsContainer();
  return Boolean(credentials?.get);
};

export const requestStoredPasswordManagerCredential =
  async (): Promise<PasswordManagerCredential | null> => {
    const credentials = getCredentialsContainer();
    if (!credentials?.get) return null;

    try {
      const credential = await credentials.get({
        mediation: "optional",
        password: true,
      });
      if (!isRecord(credential)) {
        return null;
      }

      const seed = normalizeStoredValue(Reflect.get(credential, "password"));
      if (!seed) return null;

      const accountName =
        normalizeStoredValue(Reflect.get(credential, "name")) ||
        normalizeStoredValue(Reflect.get(credential, "id")) ||
        "Linky";
      return {
        accountName,
        seed,
      };
    } catch {
      return null;
    }
  };
