import type { JsonValue } from "./json";

export type BroadcastMessageHandler<TMessage = JsonValue> =
  | ((event: MessageEvent<TMessage>) => void)
  | null;

export interface BroadcastChannelLike<
  TMessage = JsonValue,
> extends EventTarget {
  readonly name: string;
  onmessage: BroadcastMessageHandler<TMessage>;
  postMessage(message: TMessage): void;
  close(): void;
}

export interface BroadcastChannelConstructorLike<TMessage = JsonValue> {
  new (name: string): BroadcastChannelLike<TMessage>;
}

export interface GlobalWithOptionalBroadcastChannel<TMessage = JsonValue> {
  BroadcastChannel?: BroadcastChannelConstructorLike<TMessage>;
}

export interface LockManagerLike<TResult = JsonValue> {
  request?: (
    name: string,
    callback: () => Promise<TResult>,
  ) => Promise<TResult>;
}

export interface NavigatorWithOptionalLocks<TResult = JsonValue> {
  locks?: LockManagerLike<TResult>;
}

export interface NavigatorWithOptionalStorage {
  storage?: StorageManager;
}

export interface BarcodeDetectionLike {
  rawValue?: string;
}

export interface BarcodeDetectorLike {
  detect(image: HTMLVideoElement): Promise<BarcodeDetectionLike[]>;
}

export interface BarcodeDetectorConstructorLike {
  new (options: { formats: string[] }): BarcodeDetectorLike;
}

export interface WindowWithOptionalBarcodeDetector {
  BarcodeDetector?: BarcodeDetectorConstructorLike;
}

export interface CameraPermissionStatusLike {
  state?: string;
}

export interface NavigatorWithOptionalCameraPermissions {
  permissions?: {
    query?: (descriptor: {
      name: "camera";
    }) => Promise<CameraPermissionStatusLike>;
  };
}

export interface CapacitorLike {
  getPlatform?: () => string;
  getServerUrl?: () => string | undefined;
  isNativePlatform?: () => boolean;
}

export interface GlobalWithOptionalCapacitor {
  Capacitor?: CapacitorLike;
}

export interface NativeSecretStorageBridge {
  get(options: {
    key: string;
  }): Promise<{ value?: string | null } | string | null>;
  remove(options: { key: string }): Promise<void>;
  set(options: { key: string; value: string }): Promise<void>;
}

export interface LinkyNativeBridge {
  secretStorage?: NativeSecretStorageBridge;
}

export interface GlobalWithOptionalLinkyNativeBridge {
  LinkyNative?: LinkyNativeBridge;
}
