import { Capacitor, registerPlugin } from "@capacitor/core";
import { getPlatformTarget, isNativePlatform } from "./runtime";

type NativeNotificationPermissionState =
  | "denied"
  | "granted"
  | "prompt"
  | "unsupported";

type NativeScanResult = {
  cancelled: boolean;
  message?: string;
  value: string | null;
};

interface IosScannerPluginResult {
  cancelled?: boolean;
  message?: string | null;
  value?: string | null;
}

interface IosScannerPlugin {
  scan(): Promise<IosScannerPluginResult>;
}

const LinkyScanner = registerPlugin<IosScannerPlugin>("LinkyScanner");

interface IosNfcSupportResult {
  supported?: boolean;
}

interface IosNfcPluginResult {
  message?: string | null;
  status?: string | null;
}

interface IosNfcPlugin {
  areSupported(): Promise<IosNfcSupportResult>;
  cancelWrite(): Promise<void>;
  writeUri(options: { url: string }): Promise<IosNfcPluginResult>;
}

const LinkyNfc = registerPlugin<IosNfcPlugin>("LinkyNfc");

interface AndroidSecretStorageBridge {
  get?: (key: string) => string | null;
  remove?: (key: string) => void;
  set?: (key: string, value: string) => void;
}

interface AndroidScannerBridge {
  startScan?: () => void;
}

interface AndroidNotificationsBridge {
  areSupported?: () => boolean;
  getPermissionState?: () => string;
  requestPermission?: () => void;
}

interface AndroidWindowInsetsBridge {
  getBottomInsetPx?: () => number | string;
  getKeyboardInsetPx?: () => number | string;
  getTopInsetPx?: () => number | string;
}

interface AndroidDeepLinksBridge {
  consumePendingUrl?: () => string | null;
}

interface AndroidNfcBridge {
  areSupported?: () => boolean;
  cancelWrite?: () => void;
  writeUri?: (url: string) => void;
}

export const NATIVE_DEEP_LINK_EVENT = "linky-native-deep-link";
export const NATIVE_NFC_WRITE_EVENT = "linky-native-nfc-write";

export type NativeNfcWriteStatus =
  | "armed"
  | "busy"
  | "cancelled"
  | "disabled"
  | "error"
  | "success"
  | "unsupported";

export interface NativeNfcWriteResult {
  message: string | null;
  status: NativeNfcWriteStatus;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isAndroidSecretStorageBridge = (
  value: unknown,
): value is AndroidSecretStorageBridge => {
  return isRecord(value);
};

const isAndroidScannerBridge = (
  value: unknown,
): value is AndroidScannerBridge => {
  return isRecord(value);
};

const isAndroidNotificationsBridge = (
  value: unknown,
): value is AndroidNotificationsBridge => {
  return isRecord(value);
};

const normalizeString = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const getAndroidSecretStorageBridge = (): AndroidSecretStorageBridge | null => {
  const value = Reflect.get(globalThis, "LinkyNativeSecretStorage");
  return isAndroidSecretStorageBridge(value) ? value : null;
};

const getAndroidScannerBridge = (): AndroidScannerBridge | null => {
  const value = Reflect.get(globalThis, "LinkyNativeScanner");
  return isAndroidScannerBridge(value) ? value : null;
};

const getAndroidNotificationsBridge = (): AndroidNotificationsBridge | null => {
  const value = Reflect.get(globalThis, "LinkyNativeNotifications");
  return isAndroidNotificationsBridge(value) ? value : null;
};

const getAndroidWindowInsetsBridge = (): AndroidWindowInsetsBridge | null => {
  const value = Reflect.get(globalThis, "LinkyNativeWindowInsets");
  return isRecord(value) ? value : null;
};

const getAndroidDeepLinksBridge = (): AndroidDeepLinksBridge | null => {
  const value = Reflect.get(globalThis, "LinkyNativeDeepLinks");
  return isRecord(value) ? value : null;
};

const getAndroidNfcBridge = (): AndroidNfcBridge | null => {
  const value = Reflect.get(globalThis, "LinkyNativeNfc");
  return isRecord(value) ? value : null;
};

const isNativeNfcWriteStatus = (
  value: string | null,
): value is NativeNfcWriteStatus => {
  return (
    value === "armed" ||
    value === "busy" ||
    value === "cancelled" ||
    value === "disabled" ||
    value === "error" ||
    value === "success" ||
    value === "unsupported"
  );
};

const supportsIosNativeQrScan = (): boolean => {
  return (
    getPlatformTarget() === "ios" && Capacitor.isPluginAvailable("LinkyScanner")
  );
};

const supportsIosNativeNfcWrite = (): boolean => {
  return (
    getPlatformTarget() === "ios" && Capacitor.isPluginAvailable("LinkyNfc")
  );
};

export const readAndroidStoredSecret = async (
  key: string,
): Promise<string | null | undefined> => {
  const bridge = getAndroidSecretStorageBridge();
  if (!bridge?.get) {
    return undefined;
  }

  return normalizeString(bridge.get(key));
};

export const writeAndroidStoredSecret = async (
  key: string,
  value: string,
): Promise<boolean> => {
  const bridge = getAndroidSecretStorageBridge();
  if (!bridge?.set) {
    return false;
  }

  bridge.set(key, value);
  return true;
};

export const removeAndroidStoredSecret = async (
  key: string,
): Promise<boolean> => {
  const bridge = getAndroidSecretStorageBridge();
  if (!bridge?.remove) {
    return false;
  }

  bridge.remove(key);
  return true;
};

export const supportsNativeQrScan = (): boolean => {
  if (supportsIosNativeQrScan()) {
    return true;
  }

  return isNativePlatform() && Boolean(getAndroidScannerBridge()?.startScan);
};

const normalizeInsetPx = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const nativePxToCssPx = (value: number): number => {
  if (typeof window === "undefined") {
    return value;
  }

  const dpr = window.devicePixelRatio;
  if (!Number.isFinite(dpr) || dpr <= 0) {
    return value;
  }

  return Math.round((value / dpr) * 100) / 100;
};

const applyNativeSafeAreaInsets = () => {
  if (typeof document === "undefined") return;

  const bridge = getAndroidWindowInsetsBridge();
  const rootStyle = document.documentElement.style;

  const topInset = normalizeInsetPx(bridge?.getTopInsetPx?.());
  const bottomInset = normalizeInsetPx(bridge?.getBottomInsetPx?.());
  const keyboardInset = normalizeInsetPx(bridge?.getKeyboardInsetPx?.());

  if (topInset !== null) {
    rootStyle.setProperty("--safe-area-top", `${nativePxToCssPx(topInset)}px`);
  }

  if (bottomInset !== null) {
    rootStyle.setProperty(
      "--safe-area-bottom",
      `${nativePxToCssPx(bottomInset)}px`,
    );
  }

  if (keyboardInset !== null) {
    rootStyle.setProperty(
      "--native-keyboard-inset",
      `${nativePxToCssPx(keyboardInset)}px`,
    );
  }
};

if (typeof window !== "undefined") {
  const applyInsets = () => {
    applyNativeSafeAreaInsets();
  };

  applyInsets();
  window.addEventListener("linky-native-window-insets", applyInsets);
  window.addEventListener("resize", applyInsets);
  window.addEventListener("orientationchange", applyInsets);
}

export const startNativeQrScan = (): Promise<NativeScanResult> | null => {
  if (supportsIosNativeQrScan()) {
    return LinkyScanner.scan().then((result) => {
      const value = normalizeString(result.value);
      const message = normalizeString(result.message);
      const cancelled = result.cancelled === true;

      return message === null
        ? { cancelled, value }
        : { cancelled, message, value };
    });
  }

  const bridge = getAndroidScannerBridge();
  if (!isNativePlatform() || !bridge?.startScan) {
    return null;
  }

  return new Promise<NativeScanResult>((resolve) => {
    const eventName = "linky-native-scan-result";

    const onResult: EventListener = (event) => {
      if (!(event instanceof CustomEvent) || !isRecord(event.detail)) {
        return;
      }

      cleanup();

      const status = normalizeString(Reflect.get(event.detail, "status"));
      const value = normalizeString(Reflect.get(event.detail, "value"));
      const message = normalizeString(Reflect.get(event.detail, "message"));

      if (status === "success" && value) {
        resolve(
          message === null
            ? { cancelled: false, value }
            : { cancelled: false, message, value },
        );
        return;
      }

      resolve(
        message === null
          ? { cancelled: status !== "error", value: null }
          : { cancelled: status !== "error", message, value: null },
      );
    };

    const cleanup = () => {
      window.removeEventListener(eventName, onResult);
    };

    window.addEventListener(eventName, onResult, {
      once: true,
    });

    try {
      if (!bridge.startScan) {
        cleanup();
        resolve({ cancelled: true, value: null });
        return;
      }

      bridge.startScan();
    } catch (error) {
      cleanup();
      resolve({
        cancelled: false,
        message: String(error ?? "Native scanner failed"),
        value: null,
      });
    }
  });
};

export const getNativeNotificationPermissionState =
  (): NativeNotificationPermissionState | null => {
    const bridge = getAndroidNotificationsBridge();
    if (!isNativePlatform() || !bridge?.areSupported?.()) {
      return null;
    }

    const rawState = normalizeString(bridge.getPermissionState?.());
    if (
      rawState === "denied" ||
      rawState === "granted" ||
      rawState === "prompt" ||
      rawState === "unsupported"
    ) {
      return rawState;
    }

    return "unsupported";
  };

export const requestNativeNotificationPermission = async (): Promise<
  boolean | null
> => {
  const bridge = getAndroidNotificationsBridge();
  if (
    !isNativePlatform() ||
    !bridge?.areSupported?.() ||
    !bridge.requestPermission
  ) {
    return null;
  }

  const currentState = getNativeNotificationPermissionState();
  if (currentState === "granted") {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    const eventName = "linky-native-notification-permission";

    const onResult: EventListener = (event) => {
      if (!(event instanceof CustomEvent) || !isRecord(event.detail)) {
        return;
      }

      cleanup();
      const permission = normalizeString(
        Reflect.get(event.detail, "permission"),
      );
      resolve(permission === "granted");
    };

    const cleanup = () => {
      window.removeEventListener(eventName, onResult);
    };

    window.addEventListener(eventName, onResult, {
      once: true,
    });

    try {
      if (!bridge.requestPermission) {
        cleanup();
        resolve(false);
        return;
      }

      bridge.requestPermission();
    } catch {
      cleanup();
      resolve(false);
    }
  });
};

export const supportsNativeNfcWrite = (): boolean => {
  if (supportsIosNativeNfcWrite()) {
    return true;
  }

  const bridge = getAndroidNfcBridge();
  if (!isNativePlatform() || !bridge?.areSupported) {
    return false;
  }

  try {
    return Boolean(bridge.areSupported());
  } catch {
    return false;
  }
};

export const startNativeNfcWrite = async (
  url: string,
  onProgress?: (result: NativeNfcWriteResult) => void,
): Promise<NativeNfcWriteResult | null> => {
  if (supportsIosNativeNfcWrite()) {
    try {
      const supportResult = await LinkyNfc.areSupported();
      if (supportResult.supported !== true) {
        return null;
      }

      onProgress?.({
        message: null,
        status: "armed",
      });

      const result = await LinkyNfc.writeUri({ url });
      const status = normalizeString(result.status);

      if (!isNativeNfcWriteStatus(status) || status === "armed") {
        return {
          message: normalizeString(result.message),
          status: "error",
        };
      }

      return {
        message: normalizeString(result.message),
        status,
      };
    } catch (error) {
      return {
        message: String(error ?? "Native NFC write failed"),
        status: "error",
      };
    }
  }

  const bridge = getAndroidNfcBridge();
  if (!isNativePlatform() || !bridge?.areSupported || !bridge.writeUri) {
    return null;
  }

  if (!bridge.areSupported()) {
    return null;
  }

  return new Promise<NativeNfcWriteResult>((resolve) => {
    const onResult: EventListener = (event) => {
      if (!(event instanceof CustomEvent) || !isRecord(event.detail)) {
        return;
      }

      const rawStatus = normalizeString(Reflect.get(event.detail, "status"));
      if (!isNativeNfcWriteStatus(rawStatus)) {
        return;
      }

      const result: NativeNfcWriteResult = {
        message: normalizeString(Reflect.get(event.detail, "message")),
        status: rawStatus,
      };

      if (result.status === "armed") {
        onProgress?.(result);
        return;
      }

      cleanup();
      resolve(result);
    };

    const cleanup = () => {
      window.removeEventListener(NATIVE_NFC_WRITE_EVENT, onResult);
    };

    window.addEventListener(NATIVE_NFC_WRITE_EVENT, onResult);

    try {
      bridge.writeUri?.(url);
    } catch (error) {
      cleanup();
      resolve({
        message: String(error ?? "Native NFC write failed"),
        status: "error",
      });
    }
  });
};

export const cancelNativeNfcWrite = (): boolean => {
  if (supportsIosNativeNfcWrite()) {
    void LinkyNfc.cancelWrite().catch(() => undefined);
    return true;
  }

  const bridge = getAndroidNfcBridge();
  if (!isNativePlatform() || !bridge?.cancelWrite) {
    return false;
  }

  try {
    bridge.cancelWrite();
    return true;
  } catch {
    return false;
  }
};

export const consumePendingNativeDeepLinkUrl = (): string | null => {
  const bridge = getAndroidDeepLinksBridge();
  if (!isNativePlatform() || !bridge?.consumePendingUrl) {
    return null;
  }

  try {
    return normalizeString(bridge.consumePendingUrl());
  } catch {
    return null;
  }
};
