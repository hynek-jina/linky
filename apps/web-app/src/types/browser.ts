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

interface BroadcastChannelConstructorLike<TMessage = JsonValue> {
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

// `beforeinstallprompt` event (Chromium-only). The spec is still draft, so
// declare the bits we need.
export interface BeforeInstallPromptEventLike extends Event {
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  prompt(): Promise<void>;
}

interface BarcodeDetectionLike {
  rawValue?: string;
}

type BarcodeDetectSourceLike =
  | HTMLCanvasElement
  | HTMLImageElement
  | HTMLVideoElement
  | ImageBitmap
  | OffscreenCanvas;

interface BarcodeDetectorLike {
  detect(image: BarcodeDetectSourceLike): Promise<BarcodeDetectionLike[]>;
}

interface BarcodeDetectorConstructorLike {
  new (options: { formats: string[] }): BarcodeDetectorLike;
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructorLike;
  }
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
