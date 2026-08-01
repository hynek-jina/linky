import { afterEach, describe, expect, it, vi } from "vitest";

const nativeFlag = vi.hoisted(() => ({ value: true }));

vi.mock("./runtime", async () => {
  const actual = await vi.importActual<typeof import("./runtime")>("./runtime");
  return { ...actual, isNativePlatform: () => nativeFlag.value };
});

import {
  cancelAllNativeConversationNotifications,
  cancelNativeConversationNotification,
  cancelNativePushPlaceholder,
  getNativeNotificationDeliveryState,
  getNativeNotificationPermissionState,
  openNativeSystemNotificationSettings,
  postNativeLocalNotification,
  requestNativeNotificationPermission,
  supportsNativeLocalNotifications,
  supportsNativeRemotePush,
  type NativeLocalNotificationPayload,
} from "./nativeBridge";

const PERMISSION_EVENT = "linky-native-notification-permission";

const dispatchPermissionLater = (permission: string): void => {
  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent(PERMISSION_EVENT, { detail: { permission } }),
    );
  }, 0);
};

const readPermissionDetail = (event: Event): string | null => {
  if (!(event instanceof CustomEvent)) {
    return null;
  }

  const detail: unknown = event.detail;
  if (typeof detail !== "object" || detail === null) {
    return null;
  }

  const permission: unknown = Reflect.get(detail, "permission");
  return typeof permission === "string" ? permission : null;
};

afterEach(() => {
  nativeFlag.value = true;
  Reflect.deleteProperty(globalThis, "LinkyNativeNotifications");
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("getNativeNotificationPermissionState", () => {
  it("surfaces blocked instead of degrading it to unsupported", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      areSupported: () => true,
      getPermissionState: () => "blocked",
    });

    expect(getNativeNotificationPermissionState()).toBe("blocked");
  });

  it("returns granted unchanged", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getPermissionState: () => "granted",
    });

    expect(getNativeNotificationPermissionState()).toBe("granted");
  });

  it("returns denied unchanged", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getPermissionState: () => "denied",
    });

    expect(getNativeNotificationPermissionState()).toBe("denied");
  });

  it("returns prompt unchanged", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getPermissionState: () => "prompt",
    });

    expect(getNativeNotificationPermissionState()).toBe("prompt");
  });

  it("maps an unrecognised string from a live bridge to unsupported", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getPermissionState: () => "wat",
    });

    expect(getNativeNotificationPermissionState()).toBe("unsupported");
  });

  it("ignores areSupported() === false, which used to suppress the whole feature on debug builds", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      areSupported: () => false,
      getPermissionState: () => "prompt",
    });

    expect(getNativeNotificationPermissionState()).toBe("prompt");
  });

  it("returns null when getPermissionState is missing on an older shell", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      areSupported: () => true,
    });

    expect(getNativeNotificationPermissionState()).toBeNull();
  });

  it("returns null in the browser PWA where no bridge global exists", () => {
    expect(getNativeNotificationPermissionState()).toBeNull();
  });

  it("returns null when the runtime is not native even with a bridge global", () => {
    nativeFlag.value = false;
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getPermissionState: () => "granted",
    });

    expect(getNativeNotificationPermissionState()).toBeNull();
  });

  it("returns null when the bridge method throws", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getPermissionState: () => {
        throw new Error("bridge call rejected");
      },
    });

    expect(getNativeNotificationPermissionState()).toBeNull();
  });
});

describe("getNativeNotificationDeliveryState", () => {
  it("narrows granted", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getDeliveryState: () => "granted",
    });

    expect(getNativeNotificationDeliveryState()).toBe("granted");
  });

  it("narrows permission_denied", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getDeliveryState: () => "permission_denied",
    });

    expect(getNativeNotificationDeliveryState()).toBe("permission_denied");
  });

  it("narrows app_blocked", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getDeliveryState: () => "app_blocked",
    });

    expect(getNativeNotificationDeliveryState()).toBe("app_blocked");
  });

  it("narrows channel_missing", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getDeliveryState: () => "channel_missing",
    });

    expect(getNativeNotificationDeliveryState()).toBe("channel_missing");
  });

  it("narrows channel_blocked", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getDeliveryState: () => "channel_blocked",
    });

    expect(getNativeNotificationDeliveryState()).toBe("channel_blocked");
  });

  it("narrows channel_silent", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getDeliveryState: () => "channel_silent",
    });

    expect(getNativeNotificationDeliveryState()).toBe("channel_silent");
  });

  it("rejects unsupported, which is not a delivery state", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getDeliveryState: () => "unsupported",
    });

    expect(getNativeNotificationDeliveryState()).toBeNull();
  });

  it("returns null when getDeliveryState is missing on an older shell", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      areSupported: () => true,
      getPermissionState: () => "granted",
    });

    expect(getNativeNotificationDeliveryState()).toBeNull();
  });

  it("returns null when the bridge method throws", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getDeliveryState: () => {
        throw new Error("bridge call rejected");
      },
    });

    expect(getNativeNotificationDeliveryState()).toBeNull();
  });

  it("returns null when the runtime is not native", () => {
    nativeFlag.value = false;
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getDeliveryState: () => "granted",
    });

    expect(getNativeNotificationDeliveryState()).toBeNull();
  });
});

describe("supportsNativeRemotePush", () => {
  it("is true when the shell reports a usable FCM sender id", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      isPushSupported: () => true,
    });

    expect(supportsNativeRemotePush()).toBe(true);
  });

  it("is false when the shell reports no FCM sender id", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      isPushSupported: () => false,
    });

    expect(supportsNativeRemotePush()).toBe(false);
  });

  it("is false when isPushSupported is missing on an older shell", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      areSupported: () => true,
      getPermissionState: () => "granted",
    });

    expect(supportsNativeRemotePush()).toBe(false);
  });

  it("is false when isPushSupported throws", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      isPushSupported: () => {
        throw new Error("bridge call rejected");
      },
    });

    expect(supportsNativeRemotePush()).toBe(false);
  });

  it("is false when the runtime is not native", () => {
    nativeFlag.value = false;
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      isPushSupported: () => true,
    });

    expect(supportsNativeRemotePush()).toBe(false);
  });
});

describe("openNativeSystemNotificationSettings", () => {
  it("opens the system settings screen exactly once", () => {
    const openSystemSettings = vi.fn();
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      openSystemSettings,
    });

    expect(openNativeSystemNotificationSettings()).toBe(true);
    expect(openSystemSettings).toHaveBeenCalledTimes(1);
  });

  it("invokes openSystemSettings on the bridge receiver, never detached", () => {
    const receivers: object[] = [];
    const bridge = {
      openSystemSettings() {
        receivers.push(this);
      },
    };
    Reflect.set(globalThis, "LinkyNativeNotifications", bridge);

    expect(openNativeSystemNotificationSettings()).toBe(true);
    expect(receivers).toHaveLength(1);
    expect(receivers[0]).toBe(bridge);
  });

  it("is false when openSystemSettings is missing on an older shell", () => {
    const requestPermission = vi.fn();
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      requestPermission,
    });

    expect(openNativeSystemNotificationSettings()).toBe(false);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("is false when openSystemSettings throws", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      openSystemSettings: () => {
        throw new Error("no activity to handle the intent");
      },
    });

    expect(openNativeSystemNotificationSettings()).toBe(false);
  });

  it("is false when the runtime is not native", () => {
    nativeFlag.value = false;
    const openSystemSettings = vi.fn();
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      openSystemSettings,
    });

    expect(openNativeSystemNotificationSettings()).toBe(false);
    expect(openSystemSettings).not.toHaveBeenCalled();
  });
});

describe("requestNativeNotificationPermission", () => {
  it("resolves true when the launcher dispatches granted", async () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getPermissionState: () => "prompt",
      requestPermission: () => dispatchPermissionLater("granted"),
    });

    await expect(requestNativeNotificationPermission()).resolves.toBe(true);
  });

  it("resolves a blocked permission result rather than discarding it", async () => {
    const observed: string[] = [];
    const onPermission: EventListener = (event) => {
      const permission = readPermissionDetail(event);
      if (permission !== null) observed.push(permission);
    };
    window.addEventListener(PERMISSION_EVENT, onPermission);

    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getPermissionState: () => "blocked",
      requestPermission: () => dispatchPermissionLater("blocked"),
    });

    try {
      await expect(requestNativeNotificationPermission()).resolves.toBe(false);
    } finally {
      window.removeEventListener(PERMISSION_EVENT, onPermission);
    }

    expect(observed).toEqual(["blocked"]);
    expect(getNativeNotificationPermissionState()).toBe("blocked");
  });

  it("resolves false when the launcher dispatches denied", async () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getPermissionState: () => "prompt",
      requestPermission: () => dispatchPermissionLater("denied"),
    });

    await expect(requestNativeNotificationPermission()).resolves.toBe(false);
  });

  it("ignores areSupported() === false while requesting the permission", async () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      areSupported: () => false,
      getPermissionState: () => "prompt",
      requestPermission: () => dispatchPermissionLater("granted"),
    });

    await expect(requestNativeNotificationPermission()).resolves.toBe(true);
  });

  it("resolves null when requestPermission is missing on an older shell", async () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      areSupported: () => true,
      getPermissionState: () => "prompt",
    });

    await expect(requestNativeNotificationPermission()).resolves.toBeNull();
  });

  it("short circuits to true when the permission is already granted", async () => {
    const requestPermission = vi.fn();
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getPermissionState: () => "granted",
      requestPermission,
    });

    await expect(requestNativeNotificationPermission()).resolves.toBe(true);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("resolves false after the 30s timeout when nothing is ever dispatched", async () => {
    vi.useFakeTimers();
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      getPermissionState: () => "prompt",
      requestPermission: () => undefined,
    });

    const pending = requestNativeNotificationPermission();
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(pending).resolves.toBe(false);
  });
});

const POSTED_GRANTED_JSON = '{"status":"posted","delivery":"granted"}';

const buildPostPayload = () => ({
  conversationKey: "k1",
  eventCreatedAtSec: 123,
  senderName: "Alice",
  text: "hi",
});

const isJsonRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

/**
 * Typed on purpose: `quiet` is the Android channel selector, so a payload that
 * only carries it structurally would still serialize while the published
 * `NativeLocalNotificationPayload` contract said otherwise.
 */
const buildQuietPostPayload = (
  quiet: boolean,
): NativeLocalNotificationPayload => ({
  conversationKey: "k1",
  quiet,
  text: "hi",
});

/** Captures the single JSON string the bridge received, re-parsed without a cast. */
const captureBridgePayload = (
  payload: NativeLocalNotificationPayload,
): Record<string, unknown> => {
  const received: string[] = [];
  Reflect.set(globalThis, "LinkyNativeNotifications", {
    post: (payloadJson: string) => {
      received.push(payloadJson);
      return POSTED_GRANTED_JSON;
    },
  });

  postNativeLocalNotification(payload);

  const capturedJson = received.at(0);
  if (capturedJson === undefined) {
    throw new Error("post was never invoked");
  }

  const parsed: unknown = JSON.parse(capturedJson);
  if (!isJsonRecord(parsed)) {
    throw new Error("bridge payload did not parse to an object");
  }

  return parsed;
};

describe("supportsNativeLocalNotifications", () => {
  it("is true when the shell exposes post", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      post: () => POSTED_GRANTED_JSON,
    });

    expect(supportsNativeLocalNotifications()).toBe(true);
  });

  it("is false when post is missing on an older shell", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {});

    expect(supportsNativeLocalNotifications()).toBe(false);
  });

  it("is false in the browser PWA where no bridge global exists", () => {
    expect(supportsNativeLocalNotifications()).toBe(false);
  });

  it("is false when the runtime is not native even with a bridge global", () => {
    nativeFlag.value = false;
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      post: () => POSTED_GRANTED_JSON,
    });

    expect(supportsNativeLocalNotifications()).toBe(false);
  });
});

describe("postNativeLocalNotification", () => {
  it("parses a posted result with granted delivery", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      post: () => POSTED_GRANTED_JSON,
    });

    expect(postNativeLocalNotification(buildPostPayload())).toEqual({
      delivery: "granted",
      reason: null,
      status: "posted",
    });
  });

  it("parses channel_silent delivery on a posted result", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      post: () => '{"status":"posted","delivery":"channel_silent"}',
    });

    expect(postNativeLocalNotification(buildPostPayload())).toEqual({
      delivery: "channel_silent",
      reason: null,
      status: "posted",
    });
  });

  it("parses an error result with its reason", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      post: () => '{"status":"error","reason":"invalid_payload"}',
    });

    expect(postNativeLocalNotification(buildPostPayload())).toEqual({
      delivery: null,
      reason: "invalid_payload",
      status: "error",
    });
  });

  it("invokes post on the bridge receiver, never detached", () => {
    const receivers: object[] = [];
    const bridge = {
      post() {
        receivers.push(this);
        return POSTED_GRANTED_JSON;
      },
    };
    Reflect.set(globalThis, "LinkyNativeNotifications", bridge);

    expect(postNativeLocalNotification(buildPostPayload())).toEqual({
      delivery: "granted",
      reason: null,
      status: "posted",
    });
    expect(receivers).toHaveLength(1);
    expect(receivers[0]).toBe(bridge);
  });

  it("serializes the payload for the bridge and omits absent optional keys", () => {
    const received: string[] = [];
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      post: (payloadJson: string) => {
        received.push(payloadJson);
        return POSTED_GRANTED_JSON;
      },
    });

    postNativeLocalNotification(buildPostPayload());

    expect(received).toHaveLength(1);
    const capturedJson = received.at(0);
    if (capturedJson === undefined) {
      throw new Error("post was never invoked");
    }

    const parsed: unknown = JSON.parse(capturedJson);
    if (!isJsonRecord(parsed)) {
      throw new Error("bridge payload did not parse to an object");
    }

    expect(Reflect.get(parsed, "conversationKey")).toBe("k1");
    expect(Reflect.get(parsed, "senderName")).toBe("Alice");
    expect(Reflect.get(parsed, "text")).toBe("hi");
    expect(Reflect.get(parsed, "eventCreatedAtSec")).toBe(123);
    expect("outerEventId" in parsed).toBe(false);
  });

  it("serializes quiet true so the Java side can pick the quiet channel", () => {
    expect(
      Reflect.get(captureBridgePayload(buildQuietPostPayload(true)), "quiet"),
    ).toBe(true);
  });

  it("serializes an explicit quiet false as a real value, not an omission", () => {
    const parsed = captureBridgePayload(buildQuietPostPayload(false));

    expect("quiet" in parsed).toBe(true);
    expect(Reflect.get(parsed, "quiet")).toBe(false);
  });

  it("omits quiet entirely when the payload does not carry it", () => {
    expect("quiet" in captureBridgePayload(buildPostPayload())).toBe(false);
  });

  it("returns null when the bridge answers with something that is not JSON", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      post: () => "not json",
    });

    expect(postNativeLocalNotification(buildPostPayload())).toBeNull();
  });

  it("returns null for an unknown status", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      post: () => '{"status":"wat"}',
    });

    expect(postNativeLocalNotification(buildPostPayload())).toBeNull();
  });

  it("nulls an unknown delivery while preserving the posted status", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      post: () => '{"status":"posted","delivery":"wat"}',
    });

    expect(postNativeLocalNotification(buildPostPayload())).toEqual({
      delivery: null,
      reason: null,
      status: "posted",
    });
  });

  it("returns null when post throws", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      post: () => {
        throw new Error("bridge call rejected");
      },
    });

    expect(postNativeLocalNotification(buildPostPayload())).toBeNull();
  });

  it("returns null when post is missing on an older shell", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      areSupported: () => true,
    });

    expect(postNativeLocalNotification(buildPostPayload())).toBeNull();
  });

  it("returns null and never invokes the stub when the runtime is not native", () => {
    nativeFlag.value = false;
    const post = vi.fn(() => POSTED_GRANTED_JSON);
    Reflect.set(globalThis, "LinkyNativeNotifications", { post });

    expect(postNativeLocalNotification(buildPostPayload())).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});

describe("cancelNativeConversationNotification", () => {
  it("cancels the conversation notification exactly once", () => {
    const cancelConversation = vi.fn();
    Reflect.set(globalThis, "LinkyNativeNotifications", { cancelConversation });

    expect(cancelNativeConversationNotification("k1")).toBe(true);
    expect(cancelConversation).toHaveBeenCalledTimes(1);
    expect(cancelConversation).toHaveBeenCalledWith("k1");
  });

  it("is false when cancelConversation is missing on an older shell", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      areSupported: () => true,
    });

    expect(cancelNativeConversationNotification("k1")).toBe(false);
  });

  it("is false when cancelConversation throws", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      cancelConversation: () => {
        throw new Error("bridge call rejected");
      },
    });

    expect(cancelNativeConversationNotification("k1")).toBe(false);
  });

  it("is false and never invokes the stub when the runtime is not native", () => {
    nativeFlag.value = false;
    const cancelConversation = vi.fn();
    Reflect.set(globalThis, "LinkyNativeNotifications", { cancelConversation });

    expect(cancelNativeConversationNotification("k1")).toBe(false);
    expect(cancelConversation).not.toHaveBeenCalled();
  });
});

describe("cancelAllNativeConversationNotifications", () => {
  it("cancels all conversation notifications exactly once with no arguments", () => {
    const cancelAll = vi.fn();
    Reflect.set(globalThis, "LinkyNativeNotifications", { cancelAll });

    expect(cancelAllNativeConversationNotifications()).toBe(true);
    expect(cancelAll).toHaveBeenCalledTimes(1);
    expect(cancelAll).toHaveBeenCalledWith();
  });

  it("is false when cancelAll is missing on an older shell", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      areSupported: () => true,
    });

    expect(cancelAllNativeConversationNotifications()).toBe(false);
  });

  it("is false when cancelAll throws", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      cancelAll: () => {
        throw new Error("bridge call rejected");
      },
    });

    expect(cancelAllNativeConversationNotifications()).toBe(false);
  });

  it("is false and never invokes the stub when the runtime is not native", () => {
    nativeFlag.value = false;
    const cancelAll = vi.fn();
    Reflect.set(globalThis, "LinkyNativeNotifications", { cancelAll });

    expect(cancelAllNativeConversationNotifications()).toBe(false);
    expect(cancelAll).not.toHaveBeenCalled();
  });
});

describe("cancelNativePushPlaceholder", () => {
  it("cancels the push placeholder exactly once", () => {
    const cancelPushPlaceholder = vi.fn();
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      cancelPushPlaceholder,
    });

    expect(cancelNativePushPlaceholder("evt1")).toBe(true);
    expect(cancelPushPlaceholder).toHaveBeenCalledTimes(1);
    expect(cancelPushPlaceholder).toHaveBeenCalledWith("evt1");
  });

  it("is false when cancelPushPlaceholder is missing on an older shell", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      areSupported: () => true,
    });

    expect(cancelNativePushPlaceholder("evt1")).toBe(false);
  });

  it("is false when cancelPushPlaceholder throws", () => {
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      cancelPushPlaceholder: () => {
        throw new Error("bridge call rejected");
      },
    });

    expect(cancelNativePushPlaceholder("evt1")).toBe(false);
  });

  it("is false and never invokes the stub when the runtime is not native", () => {
    nativeFlag.value = false;
    const cancelPushPlaceholder = vi.fn();
    Reflect.set(globalThis, "LinkyNativeNotifications", {
      cancelPushPlaceholder,
    });

    expect(cancelNativePushPlaceholder("evt1")).toBe(false);
    expect(cancelPushPlaceholder).not.toHaveBeenCalled();
  });
});
