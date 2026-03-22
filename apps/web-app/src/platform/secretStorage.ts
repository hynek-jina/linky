import type {
  LinkyNativeBridge,
  NativeSecretStorageBridge,
} from "../types/browser";
import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from "../utils/storage";
import {
  readAndroidStoredSecret,
  removeAndroidStoredSecret,
  writeAndroidStoredSecret,
} from "./nativeBridge";
import { isNativePlatform } from "./runtime";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isNativeSecretStorageBridge = (
  value: unknown,
): value is NativeSecretStorageBridge => {
  return isRecord(value);
};

const isLinkyNativeBridge = (value: unknown): value is LinkyNativeBridge => {
  return isRecord(value);
};

const normalizeStoredValue = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const getNativeSecretStorage = () => {
  const bridge = Reflect.get(globalThis, "LinkyNative");
  if (!isLinkyNativeBridge(bridge)) return null;

  const secretStorage = bridge.secretStorage;
  return isNativeSecretStorageBridge(secretStorage) ? secretStorage : null;
};

const readNativeSecretValue = async (key: string): Promise<string | null> => {
  const secretStorage = getNativeSecretStorage();
  if (!secretStorage) return null;

  const result = await secretStorage.get({ key });
  if (typeof result === "string") {
    return normalizeStoredValue(result);
  }
  if (!isRecord(result)) {
    return null;
  }

  return normalizeStoredValue(Reflect.get(result, "value"));
};

export const readStoredSecret = async (key: string): Promise<string | null> => {
  if (isNativePlatform()) {
    const androidValue = await readAndroidStoredSecret(key);
    if (androidValue !== undefined) {
      return androidValue;
    }

    try {
      const nativeValue = await readNativeSecretValue(key);
      if (nativeValue !== null) {
        return nativeValue;
      }
    } catch {
      // ignore
    }
  }

  return normalizeStoredValue(safeLocalStorageGet(key));
};

export const writeStoredSecret = async (
  key: string,
  value: string,
): Promise<void> => {
  const normalized = normalizeStoredValue(value);
  if (!normalized) {
    await removeStoredSecret(key);
    return;
  }

  if (isNativePlatform()) {
    const wroteToAndroidBridge = await writeAndroidStoredSecret(
      key,
      normalized,
    );

    const secretStorage = getNativeSecretStorage();
    if (secretStorage) {
      try {
        await secretStorage.set({ key, value: normalized });
      } catch {
        // ignore
      }
    }

    if (wroteToAndroidBridge) {
      safeLocalStorageSet(key, normalized);
      return;
    }
  }

  safeLocalStorageSet(key, normalized);
};

export const removeStoredSecret = async (key: string): Promise<void> => {
  if (isNativePlatform()) {
    const removedFromAndroidBridge = await removeAndroidStoredSecret(key);

    const secretStorage = getNativeSecretStorage();
    if (secretStorage) {
      try {
        await secretStorage.remove({ key });
      } catch {
        // ignore
      }
    }

    if (removedFromAndroidBridge) {
      safeLocalStorageRemove(key);
      return;
    }
  }

  safeLocalStorageRemove(key);
};
