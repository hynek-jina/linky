import { getPublicKey, nip19 } from "nostr-tools";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// This file covers two disjoint branches of `registerPushNotifications`:
// the native FCM-availability gate (D-P2-15) and the browser subscription lifecycle.
// `nativeFlag` is the switch between them, so the two suites can share one module mock set.

const nativeFlag = vi.hoisted(() => ({ value: true }));

const bridgeState = vi.hoisted<{
  permissionState: string | null;
  remotePush: boolean;
}>(() => ({
  permissionState: "granted",
  remotePush: false,
}));

const pushSpies = vi.hoisted(() => ({
  addListener: vi.fn(() => Promise.resolve({ remove: () => {} })),
  register: vi.fn(() => Promise.resolve()),
  unregister: vi.fn(() => Promise.resolve()),
}));

const debugLog = vi.hoisted(() => ({
  append: vi.fn<
    (source: string, message: string, details?: unknown) => Promise<void>
  >(() => Promise.resolve()),
}));

const permissionSpy = vi.hoisted(() => ({
  request: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: pushSpies,
}));

vi.mock("./pushDebugLog", () => ({
  appendPushDebugLog: debugLog.append,
}));

vi.mock("../platform/runtime", async () => {
  const actual = await vi.importActual<typeof import("../platform/runtime")>(
    "../platform/runtime",
  );
  return { ...actual, isNativePlatform: () => nativeFlag.value };
});

vi.mock("../platform/nativeBridge", () => ({
  NATIVE_PUSH_ACTION_EVENT: "linky-native-push-action",
  getNativeNotificationPermissionState: () => bridgeState.permissionState,
  requestNativeNotificationPermission: permissionSpy.request,
  supportsNativeRemotePush: () => bridgeState.remotePush,
}));

import {
  registerPushNotifications,
  unregisterPushNotifications,
} from "./pushNotifications";

// Never decoded by the native suite: none of its cases reach `derivePushIdentity` (D-P2-14).
const TEST_NSEC = "nsec1testtesttest";

const SECRET_KEY = new Uint8Array(32).fill(7);
const NSEC = nip19.nsecEncode(SECRET_KEY);
const PUBKEY = getPublicKey(SECRET_KEY);
const VAPID_KEY = "AQID";

const readLoggedPermissionState = (details: unknown): unknown => {
  if (typeof details !== "object" || details === null) {
    return undefined;
  }

  return Reflect.get(details, "permissionState");
};

type DebugLogCall = [source: string, message: string, details?: unknown];

const findUnsupportedDebugLogCall = (): DebugLogCall | undefined => {
  return debugLog.append.mock.calls.find(
    (call) => call[1] === "native push unsupported",
  );
};

interface RecordedRequest {
  body: unknown;
  url: string;
}

let originalServiceWorkerDescriptor: PropertyDescriptor | undefined;
let recordedRequests: RecordedRequest[];
let subscribeSucceeds: boolean;

const isRecord = (
  value: unknown,
): value is Record<string | number | symbol, unknown> =>
  typeof value === "object" && value !== null;

const parseBody = (body: BodyInit | null | undefined): unknown => {
  if (typeof body !== "string") return null;
  return JSON.parse(body);
};

const readRequestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};

const createSubscription = (
  endpoint: string,
  applicationServerKey: number[],
) => {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  return {
    endpoint,
    expirationTime: null,
    getKey: vi.fn((name: PushEncryptionKeyName) => {
      return new Uint8Array(name === "auth" ? [4, 5] : [6, 7]).buffer;
    }),
    options: {
      applicationServerKey: new Uint8Array(applicationServerKey).buffer,
      userVisibleOnly: true,
    },
    unsubscribe,
  };
};

const installServiceWorker = (
  activeSubscription: ReturnType<typeof createSubscription>,
  replacementSubscription = activeSubscription,
) => {
  const getSubscription = vi.fn().mockResolvedValue(activeSubscription);
  const subscribe = vi.fn().mockResolvedValue(replacementSubscription);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({
        active: {},
        pushManager: {
          getSubscription,
          subscribe,
        },
      }),
    },
  });
  return { getSubscription, subscribe };
};

const getSubscribeRequests = (): RecordedRequest[] =>
  recordedRequests.filter(({ url }) => url.endsWith("/subscribe"));

const readField = (value: unknown, field: string): unknown =>
  isRecord(value) ? value[field] : undefined;

beforeEach(() => {
  vi.clearAllMocks();
  nativeFlag.value = true;
  bridgeState.permissionState = "granted";
  bridgeState.remotePush = false;

  localStorage.clear();
  originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    "serviceWorker",
  );
  recordedRequests = [];
  subscribeSucceeds = true;

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = readRequestUrl(input);
      const body = parseBody(init?.body);
      recordedRequests.push({ body, url });

      if (url.endsWith("/vapid-public-key")) {
        return Response.json({ vapidPublicKey: VAPID_KEY });
      }
      if (url.endsWith("/auth/challenge")) {
        const requestedAction = readField(body, "action");
        const action =
          requestedAction === "unsubscribe" ? "unsubscribe" : "subscribe";
        return Response.json({
          action,
          challenge: `challenge-${action}`,
          expiresAt: Date.now() + 60_000,
          pubkey: PUBKEY,
        });
      }
      if (url.endsWith("/subscribe")) {
        return new Response(subscribeSucceeds ? "" : "registration failed", {
          status: subscribeSucceeds ? 200 : 500,
        });
      }
      if (url.endsWith("/unsubscribe")) {
        return new Response("", { status: 200 });
      }
      return new Response("", { status: 404 });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  if (originalServiceWorkerDescriptor) {
    Object.defineProperty(
      navigator,
      "serviceWorker",
      originalServiceWorkerDescriptor,
    );
  } else {
    Reflect.deleteProperty(navigator, "serviceWorker");
  }
});

describe("registerPushNotifications - native FCM-availability gate", () => {
  it("closes the gate on a debug build where the permission is granted but FCM is absent", async () => {
    bridgeState.permissionState = "granted";
    bridgeState.remotePush = false;

    const result = await registerPushNotifications(TEST_NSEC);

    expect(permissionSpy.request).not.toHaveBeenCalled();
    expect(pushSpies.register).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(String(result.error ?? "")).toContain("google-services.json");
  });

  it("closes the gate when there is no native notifications bridge at all", async () => {
    bridgeState.permissionState = null;
    bridgeState.remotePush = false;

    const result = await registerPushNotifications(TEST_NSEC);

    expect(permissionSpy.request).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(String(result.error ?? "")).toContain("google-services.json");
  });

  it("still opens the gate on a release build where FCM is configured", async () => {
    bridgeState.permissionState = "granted";
    bridgeState.remotePush = true;

    await registerPushNotifications(TEST_NSEC);

    expect(permissionSpy.request).toHaveBeenCalled();
  });

  it("never reaches PushNotifications.register while FCM is unavailable", async () => {
    bridgeState.permissionState = "granted";
    bridgeState.remotePush = false;

    await registerPushNotifications(TEST_NSEC);

    // The 15 000 ms `waitForNativePushToken` timeout is armed by `register()`.
    // Keeping this call unreachable is what keeps the Advanced toggle responsive.
    expect(pushSpies.register).not.toHaveBeenCalled();
  });

  it("records the observed permission state in the push debug log when it skips registration", async () => {
    bridgeState.permissionState = "granted";
    bridgeState.remotePush = false;

    await registerPushNotifications(TEST_NSEC);

    const unsupportedCall = findUnsupportedDebugLogCall();
    expect(unsupportedCall).toBeDefined();
    expect(readLoggedPermissionState(unsupportedCall?.[2])).toBe("granted");
  });
});

describe("unregisterPushNotifications - native FCM-availability gate", () => {
  it("never reaches PushNotifications.unregister while FCM is unavailable", async () => {
    bridgeState.permissionState = "granted";
    bridgeState.remotePush = false;

    const result = await unregisterPushNotifications(TEST_NSEC);

    // On a build without google-services.json, PushNotifications.unregister() throws
    // "Default FirebaseApp is not initialized" on the NATIVE thread — the JS .catch()
    // never runs and the process dies. The call must stay unreachable, exactly like
    // register(); and since nothing was ever registered, skipping counts as success.
    expect(pushSpies.unregister).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("still reaches PushNotifications.unregister on a release build where FCM is configured", async () => {
    bridgeState.permissionState = "granted";
    bridgeState.remotePush = true;

    await unregisterPushNotifications(TEST_NSEC);

    expect(pushSpies.unregister).toHaveBeenCalled();
  });
});

describe("registerPushNotifications browser lifecycle", () => {
  beforeEach(() => {
    nativeFlag.value = false;
  });

  it("reuses a subscription with the current VAPID key and persists registration", async () => {
    const subscription = createSubscription(
      "https://push.example/current",
      [1, 2, 3],
    );
    const pushManager = installServiceWorker(subscription);

    await expect(registerPushNotifications(NSEC)).resolves.toEqual({
      success: true,
    });

    expect(subscription.unsubscribe).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(localStorage.getItem("linky.push_vapid_public_key")).toBe(VAPID_KEY);
    expect(localStorage.getItem("linky.push_subscription_endpoint")).toBe(
      subscription.endpoint,
    );
    expect(localStorage.getItem("linky.push_subscription_pubkey")).toBe(PUBKEY);
  });

  it("replaces a mismatched VAPID subscription and cleans up its endpoint", async () => {
    const staleSubscription = createSubscription(
      "https://push.example/stale",
      [9, 9, 9],
    );
    const replacementSubscription = createSubscription(
      "https://push.example/replacement",
      [1, 2, 3],
    );
    const pushManager = installServiceWorker(
      staleSubscription,
      replacementSubscription,
    );

    await expect(registerPushNotifications(NSEC)).resolves.toEqual({
      success: true,
    });

    expect(staleSubscription.unsubscribe).toHaveBeenCalledOnce();
    expect(pushManager.subscribe).toHaveBeenCalledOnce();
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      applicationServerKey: new Uint8Array([1, 2, 3]).buffer,
      userVisibleOnly: true,
    });
    expect(
      recordedRequests.some(
        ({ body, url }) =>
          url.endsWith("/unsubscribe") &&
          readField(body, "endpoint") === staleSubscription.endpoint,
      ),
    ).toBe(true);
    expect(localStorage.getItem("linky.push_subscription_endpoint")).toBe(
      replacementSubscription.endpoint,
    );
  });

  it("creates one installation ID and reuses it on later registrations", async () => {
    const subscription = createSubscription(
      "https://push.example/current",
      [1, 2, 3],
    );
    installServiceWorker(subscription);

    await registerPushNotifications(NSEC);
    await registerPushNotifications(NSEC);

    const subscribeRequests = getSubscribeRequests();
    expect(subscribeRequests).toHaveLength(2);
    const firstInstallationId = readField(
      subscribeRequests[0]?.body,
      "installationId",
    );
    expect(typeof firstInstallationId).toBe("string");
    expect(firstInstallationId).not.toBe("");
    expect(readField(subscribeRequests[1]?.body, "installationId")).toBe(
      firstInstallationId,
    );
    expect(localStorage.getItem("linky.push_installation_id")).toBe(
      firstInstallationId,
    );
  });

  it("does not overwrite stored registration identity after server failure", async () => {
    localStorage.setItem(
      "linky.push_subscription_endpoint",
      "https://push.example/previous",
    );
    localStorage.setItem("linky.push_subscription_pubkey", "previous-pubkey");
    const subscription = createSubscription(
      "https://push.example/current",
      [1, 2, 3],
    );
    installServiceWorker(subscription);
    subscribeSucceeds = false;

    const result = await registerPushNotifications(NSEC);

    expect(result.success).toBe(false);
    expect(localStorage.getItem("linky.push_subscription_endpoint")).toBe(
      "https://push.example/previous",
    );
    expect(localStorage.getItem("linky.push_subscription_pubkey")).toBe(
      "previous-pubkey",
    );
  });
});
