// RED-first spec for the platform-dispatching notifier.
//
// The property this file exists to pin: on Android the shade entry is posted
// through the Phase 3 native bridge, and `showPwaNotification` is the WEB-ONLY
// branch rather than the only branch. `pwaNotifications.ts:16` returns early
// whenever `document.visibilityState === "visible"`, and in the Capacitor
// WebView `"Notification" in globalThis` is false, so before this module the
// entire notification path was a no-op on the native shell.
//
// Both dependencies are mocked: the native bridge because jsdom has no injected
// `LinkyNativeNotifications` global, and `pwaNotifications` because its own
// visibility/permission gating is not what is under test here — the DISPATCH is.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  NativeLocalNotificationPayload,
  NativeLocalNotificationPostResult,
} from "../../platform/nativeBridge";
import { resolveNotificationAlert } from "./notificationAlert";
import type { NotificationBannerEnqueueOutcome } from "./notificationBannerQueue";
import { readNotificationOpenTarget } from "./notificationOpenTarget";
import type { NotificationRecord } from "./notificationRecord";
import type { NotificationSurface } from "./notificationSurface";
import { notifyNotificationRecord } from "./notify";

interface WebNotificationParams {
  appTitle: string;
  body: string;
  tag?: string;
  title: string;
}

const POSTED_GRANTED: NativeLocalNotificationPostResult = {
  delivery: "granted",
  reason: null,
  status: "posted",
};

const {
  enqueueNotificationBannerMock,
  postNativeLocalNotificationMock,
  showPwaNotificationMock,
  supportsNativeLocalNotificationsMock,
} = vi.hoisted(() => ({
  enqueueNotificationBannerMock: vi.fn(
    (
      record: NotificationRecord,
      nowMs: number,
    ): NotificationBannerEnqueueOutcome => {
      void record;
      void nowMs;
      return "shown";
    },
  ),
  postNativeLocalNotificationMock: vi.fn(
    (
      payload: NativeLocalNotificationPayload,
    ): NativeLocalNotificationPostResult | null => {
      void payload;
      return { delivery: "granted", reason: null, status: "posted" };
    },
  ),
  showPwaNotificationMock: vi.fn(
    async (params: {
      appTitle: string;
      body: string;
      tag?: string;
      title: string;
    }): Promise<void> => {
      void params;
    },
  ),
  supportsNativeLocalNotificationsMock: vi.fn((): boolean => false),
}));

vi.mock("../../platform/nativeBridge", () => ({
  postNativeLocalNotification: postNativeLocalNotificationMock,
  supportsNativeLocalNotifications: supportsNativeLocalNotificationsMock,
}));

vi.mock("./pwaNotifications", () => ({
  showPwaNotification: showPwaNotificationMock,
}));

vi.mock("./notificationBannerQueue", () => ({
  enqueueNotificationBanner: enqueueNotificationBannerMock,
}));

const BASE_NOW = 1_750_000_000_000;
/** A bare wrap id: 64 hex chars, no `:` — this IS an outer event id. */
const WRAP_ID = "a".repeat(64);
const CONVERSATION_KEY = "b".repeat(64);
const APP_TITLE = "Linky";

const makeRecord = (
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord => ({
  alertedAt: null,
  chatId: "chat-1",
  conversationKey: CONVERSATION_KEY,
  createdAtMs: BASE_NOW,
  deliveredAt: BASE_NOW,
  id: WRAP_ID,
  kind: "chatMessage",
  preview: "hello there",
  readAt: null,
  senderLabel: "Alice",
  ...overrides,
});

/** Re-reads the captured payload without a cast. */
const capturedNativePayload = (): NativeLocalNotificationPayload => {
  const call = postNativeLocalNotificationMock.mock.calls.at(0);
  if (call === undefined) {
    throw new Error("postNativeLocalNotification was never invoked");
  }
  return call[0];
};

/** Re-reads the captured web params without a cast. */
const capturedWebParams = (): WebNotificationParams => {
  const call = showPwaNotificationMock.mock.calls.at(0);
  if (call === undefined) {
    throw new Error("showPwaNotification was never invoked");
  }
  return call[0];
};

/**
 * jsdom declares `visibilityState` as a getter on `Document.prototype`, so this
 * installs an OWN property on the instance and `Reflect.deleteProperty` puts
 * jsdom's own value back. `readDocumentVisible()` is NOT mocked anywhere in this
 * file — the point of these cases is that the real environment read is what
 * `notify.ts` falls back to.
 */
const setDocumentVisibility = (state: "hidden" | "visible"): void => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
};

const restoreDocumentVisibility = (): void => {
  Reflect.deleteProperty(document, "visibilityState");
};

/** The single call the enqueue mock recorded, without a cast. */
const capturedEnqueueCall = (): [NotificationRecord, number] => {
  const call = enqueueNotificationBannerMock.mock.calls.at(0);
  if (call === undefined) {
    throw new Error("enqueueNotificationBanner was never invoked");
  }
  return call;
};

beforeEach(() => {
  vi.clearAllMocks();
  supportsNativeLocalNotificationsMock.mockReturnValue(false);
  postNativeLocalNotificationMock.mockReturnValue(POSTED_GRANTED);
  showPwaNotificationMock.mockResolvedValue(undefined);
  enqueueNotificationBannerMock.mockReturnValue("shown");
});

afterEach(() => {
  restoreDocumentVisibility();
  vi.restoreAllMocks();
});

describe("notifyNotificationRecord — the no-post short circuit", () => {
  it("posts nothing on either platform when the decision is no-post", async () => {
    supportsNativeLocalNotificationsMock.mockReturnValue(true);

    const result = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "no-post",
      record: makeRecord(),
    });

    expect(result).toEqual({
      banner: false,
      nativeResult: null,
      posted: "none",
    });
    expect(postNativeLocalNotificationMock).not.toHaveBeenCalled();
    expect(showPwaNotificationMock).not.toHaveBeenCalled();
  });

  it("short circuits on the web platform too, so callers never branch", async () => {
    supportsNativeLocalNotificationsMock.mockReturnValue(false);

    const result = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "no-post",
      record: makeRecord(),
    });

    expect(result).toEqual({
      banner: false,
      nativeResult: null,
      posted: "none",
    });
    expect(showPwaNotificationMock).not.toHaveBeenCalled();
    expect(postNativeLocalNotificationMock).not.toHaveBeenCalled();
  });
});

describe("notifyNotificationRecord — the native branch", () => {
  beforeEach(() => {
    supportsNativeLocalNotificationsMock.mockReturnValue(true);
  });

  it("posts through the native bridge and never double-posts on the web", async () => {
    const record = makeRecord();

    // Backgrounded on purpose. jsdom defaults to VISIBLE, and from plan 05-07 a
    // visible `post-and-alert` downgrades the post to quiet, so leaving the
    // visibility implicit here would make the `quiet` assertion below drift with
    // the banner rule instead of pinning the loud dispatch it is about.
    const result = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      documentVisible: false,
      record,
    });

    expect(postNativeLocalNotificationMock).toHaveBeenCalledTimes(1);
    expect(showPwaNotificationMock).not.toHaveBeenCalled();
    expect(result.posted).toBe("native");
    expect(result.nativeResult).toEqual(POSTED_GRANTED);

    const payload = capturedNativePayload();
    expect(payload.conversationKey).toBe(record.conversationKey);
    expect(payload.text).toBe(record.preview);
    expect(payload.senderName).toBe(record.senderLabel);
    expect(payload.quiet).toBe(false);
  });

  it("sets quiet true when the decision is post-quietly", async () => {
    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-quietly",
      record: makeRecord(),
    });

    expect(capturedNativePayload().quiet).toBe(true);
  });

  it("sets quiet false for a backgrounded post-and-alert, never omitting it", async () => {
    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      documentVisible: false,
      record: makeRecord(),
    });

    const payload = capturedNativePayload();
    expect("quiet" in payload).toBe(true);
    expect(payload.quiet).toBe(false);
  });

  // Plan 05-07. The banner and the heads-up are two renderings of ONE alert, so
  // exactly one of them may fire. `quiet` is therefore true whenever the banner
  // is showing, and the loud channel survives only for the backgrounded case the
  // user cannot see in-app.
  it("downgrades the native post to quiet while the banner carries the alert", async () => {
    const result = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      documentVisible: true,
      record: makeRecord(),
    });

    const payload = capturedNativePayload();
    expect(payload.quiet).toBe(true);
    expect(enqueueNotificationBannerMock).toHaveBeenCalledTimes(1);
    // The two surfaces cannot drift: one alert, rendered once.
    expect(result.banner).toBe(payload.quiet);
  });

  it("keeps the loud channel for a backgrounded post-and-alert, with no banner", async () => {
    const result = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      documentVisible: false,
      record: makeRecord(),
    });

    const payload = capturedNativePayload();
    expect(payload.quiet).toBe(false);
    expect(enqueueNotificationBannerMock).not.toHaveBeenCalled();
    expect(result.banner).toBe(payload.quiet);
  });

  it("stays quiet for post-quietly while the document is visible, and enqueues nothing", async () => {
    const result = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-quietly",
      documentVisible: true,
      record: makeRecord(),
    });

    expect(capturedNativePayload().quiet).toBe(true);
    expect(result.banner).toBe(false);
    expect(enqueueNotificationBannerMock).not.toHaveBeenCalled();
  });

  it("stays quiet for post-quietly while the document is hidden — unchanged Phase 4 behaviour", async () => {
    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-quietly",
      documentVisible: false,
      record: makeRecord(),
    });

    expect(capturedNativePayload().quiet).toBe(true);
  });

  it("serializes quiet explicitly in every native case, never omitting a false", async () => {
    // Plan 04-04 must-have truth 4: an explicit `false` has to remain a real
    // serialized value. An omission would let the Java side fall back to its own
    // default and silently pick a channel this module did not choose.
    const cases: readonly {
      decision: "post-and-alert" | "post-quietly";
      documentVisible: boolean;
      quiet: boolean;
    }[] = [
      { decision: "post-and-alert", documentVisible: true, quiet: true },
      { decision: "post-and-alert", documentVisible: false, quiet: false },
      { decision: "post-quietly", documentVisible: true, quiet: true },
      { decision: "post-quietly", documentVisible: false, quiet: true },
    ];

    for (const testCase of cases) {
      postNativeLocalNotificationMock.mockClear();

      await notifyNotificationRecord({
        appTitle: APP_TITLE,
        decision: testCase.decision,
        documentVisible: testCase.documentVisible,
        record: makeRecord(),
      });

      const payload = capturedNativePayload();
      expect("quiet" in payload).toBe(true);
      expect(payload.quiet).toBe(testCase.quiet);
    }
  });

  it("falls back to the record id as the conversation key for an npubCashClaim", async () => {
    const record = makeRecord({
      chatId: null,
      conversationKey: null,
      id: "npubCashClaim:token-1",
      kind: "npubCashClaim",
      senderLabel: "npub.cash",
    });

    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record,
    });

    expect(capturedNativePayload().conversationKey).toBe(record.id);
  });

  it("omits outerEventId for a kind-prefixed synthetic id", async () => {
    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-quietly",
      record: makeRecord({
        conversationKey: null,
        id: "npubCashClaim:abc",
        kind: "npubCashClaim",
      }),
    });

    expect("outerEventId" in capturedNativePayload()).toBe(false);
  });

  it("forwards a bare wrap id as outerEventId", async () => {
    const record = makeRecord();

    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record,
    });

    expect(capturedNativePayload().outerEventId).toBe(record.id);
  });

  it("forwards eventCreatedAtSec when the record carries one", async () => {
    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record: makeRecord({ eventCreatedAtSec: 1_749_000_000 }),
    });

    expect(capturedNativePayload().eventCreatedAtSec).toBe(1_749_000_000);
  });

  it("omits eventCreatedAtSec entirely when the record has none", async () => {
    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record: makeRecord(),
    });

    expect("eventCreatedAtSec" in capturedNativePayload()).toBe(false);
  });

  it("omits senderName when the record has an empty sender label", async () => {
    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record: makeRecord({ senderLabel: "" }),
    });

    expect("senderName" in capturedNativePayload()).toBe(false);
  });

  it("surfaces an error post result to the caller instead of swallowing it", async () => {
    const errorResult: NativeLocalNotificationPostResult = {
      delivery: "channel_blocked",
      reason: null,
      status: "error",
    };
    postNativeLocalNotificationMock.mockReturnValue(errorResult);

    const result = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record: makeRecord(),
    });

    expect(result.nativeResult).toEqual(errorResult);
    expect(result.posted).toBe("native");
  });

  it("does not fall through to the web branch when the bridge returns null", async () => {
    postNativeLocalNotificationMock.mockReturnValue(null);

    const result = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record: makeRecord(),
    });

    expect(result).toEqual({
      banner: true,
      nativeResult: null,
      posted: "native",
    });
    expect(showPwaNotificationMock).not.toHaveBeenCalled();
  });
});

/**
 * Plan 09-03, defect D3. `buildNativePayload` never set `recipientPubkey`, while
 * `readNotificationOpenTarget` hard-requires it
 * (`notificationOpenTarget.ts`: `if (!outerEventId || !recipientPubkey) return null`).
 * A `null` target short-circuits `openNotificationChat` to `false` and the caller
 * falls through to the `"#contacts"` route, so a tapped LOCAL conversation
 * notification could never resolve to a chat — on any start path, for any sender.
 *
 * These cases therefore do NOT stop at the payload's shape. Each one feeds the
 * payload that `notify.ts` actually built to the REAL `readNotificationOpenTarget`
 * and asserts what that parser returns. A shape-only assertion is exactly the kind
 * of test that let D3 survive five phases: Phase 3's gate verified payload fidelity
 * and never asserted chat resolution, and its summary recorded `#contacts` as the
 * *expected* outcome. The property under test is not "the key is present", it is
 * "the payload is SUFFICIENT TO RESOLVE A CHAT".
 */
describe("notifyNotificationRecord — the notification-open payload", () => {
  /** MY OWN pubkey hex — the wrap's recipient, not the sender. 64 hex. */
  const RECIPIENT_PUBKEY = "c".repeat(64);

  beforeEach(() => {
    supportsNativeLocalNotificationsMock.mockReturnValue(true);
  });

  it("puts recipientPubkey in the native payload when NotifyInput supplies it", async () => {
    const record = makeRecord();

    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      recipientPubkey: RECIPIENT_PUBKEY,
      record,
    });

    const payload = capturedNativePayload();
    expect(payload.recipientPubkey).toBe(RECIPIENT_PUBKEY);
    expect(payload.outerEventId).toBe(record.id);

    // The load-bearing half: the real parser, not a shape assertion.
    const target = readNotificationOpenTarget(payload);
    if (target === null) {
      throw new Error(
        "the built payload did not resolve to a notification-open target",
      );
    }
    expect(target.outerEventId).toBe(record.id);
    expect(target.recipientPubkey).toBe(RECIPIENT_PUBKEY);
  });

  it("omits recipientPubkey entirely when NotifyInput supplies none", async () => {
    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record: makeRecord(),
    });

    const payload = capturedNativePayload();
    // `in`, not `toBeUndefined()`: an explicit `recipientPubkey: undefined` would
    // satisfy `toBeUndefined()` while violating `exactOptionalPropertyTypes`
    // discipline and reaching the bridge as a serialized null.
    expect("recipientPubkey" in payload).toBe(false);
    // The deliberate degraded path, and the pre-fix behaviour of EVERY local
    // conversation notification: no recipient means no resolvable chat.
    expect(readNotificationOpenTarget(payload)).toBeNull();
  });

  it("rejects a non-hex recipientPubkey at the target parser", async () => {
    // The literal value Phase 3's synthetic debug trigger used. It IS carried on
    // the wire, so a fidelity-only gate sees a complete payload — but
    // `normalizePubkeyHex` requires exactly 64 hex chars, so the target is still
    // null. This is why Phase 3 could not have caught D3.
    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      recipientPubkey: "linky-debug-recipient",
      record: makeRecord(),
    });

    const payload = capturedNativePayload();
    expect(payload.recipientPubkey).toBe("linky-debug-recipient");
    expect(readNotificationOpenTarget(payload)).toBeNull();
  });

  it("never puts createdAtMs or deliveredAt in the native payload", async () => {
    // D4's web-side guard. `LinkyNotificationSupport.resolveWhen(Long, long)`
    // ignores its timestamp argument entirely and returns receipt time — pinned
    // by three JVM tests — and `LinkyLocalNotifications` derives the
    // `MessagingStyle` per-message `time` from that same value. The Android
    // `when` is therefore structurally immune to plan 09-01's D4 change and NO
    // Java change is needed. This case keeps it that way from the web side,
    // because the platform's `PeekOldWhenSuppressor` silently drops the heads-up
    // for any `when` older than 24 h.
    const record = makeRecord({
      createdAtMs: BASE_NOW - 90_000_000,
      deliveredAt: BASE_NOW - 45_000_000,
      eventCreatedAtSec: 1_749_000_000,
    });

    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      recipientPubkey: RECIPIENT_PUBKEY,
      record,
    });

    const payload = capturedNativePayload();
    expect("createdAtMs" in payload).toBe(false);
    expect("deliveredAt" in payload).toBe(false);
    // Without this the case would pass vacuously against a builder that forwards
    // nothing at all.
    expect(payload.eventCreatedAtSec).toBe(record.eventCreatedAtSec);
  });
});

describe("notifyNotificationRecord — the web fallback branch", () => {
  beforeEach(() => {
    supportsNativeLocalNotificationsMock.mockReturnValue(false);
  });

  it("degrades to showPwaNotification in the browser PWA and on an old APK", async () => {
    const record = makeRecord();

    const result = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record,
    });

    expect(showPwaNotificationMock).toHaveBeenCalledTimes(1);
    expect(postNativeLocalNotificationMock).not.toHaveBeenCalled();
    expect(result).toEqual({ banner: true, nativeResult: null, posted: "web" });

    expect(capturedWebParams()).toEqual({
      appTitle: APP_TITLE,
      body: record.preview,
      tag: `msg_${CONVERSATION_KEY}`,
      title: record.senderLabel,
    });
  });

  it("takes the web branch for post-quietly as well as post-and-alert", async () => {
    const result = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-quietly",
      record: makeRecord(),
    });

    expect(result.posted).toBe("web");
    expect(showPwaNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("tags with the record id when the record has no conversation key", async () => {
    const record = makeRecord({
      chatId: null,
      conversationKey: null,
      id: "npubCashClaim:abc",
      kind: "npubCashClaim",
    });

    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record,
    });

    expect(capturedWebParams().tag).toBe(record.id);
  });

  it("falls back to the app title when the sender label is empty", async () => {
    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record: makeRecord({ senderLabel: "" }),
    });

    expect(capturedWebParams().title).toBe(APP_TITLE);
  });

  it("resolves instead of throwing when showPwaNotification rejects", async () => {
    showPwaNotificationMock.mockRejectedValue(new Error("notification failed"));

    const result = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record: makeRecord(),
    });

    expect(result).toEqual({ banner: true, nativeResult: null, posted: "web" });
  });
});

describe("notifyNotificationRecord — the banner enqueue", () => {
  it("starts from a VISIBLE jsdom document, which the exact-equality cases above rely on", () => {
    // The five `toEqual({ banner, nativeResult, posted })` cases inject no
    // visibility, so their expected `banner` value is jsdom's default. Pinning
    // it here means a jsdom change fails HERE rather than confusingly there.
    expect(document.visibilityState).toBe("visible");
  });

  it("enqueues exactly once for post-and-alert while the document is visible", async () => {
    vi.spyOn(Date, "now").mockReturnValue(BASE_NOW);
    setDocumentVisibility("visible");
    const record = makeRecord();

    const result = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record,
    });

    expect(result.banner).toBe(true);
    expect(enqueueNotificationBannerMock).toHaveBeenCalledTimes(1);
    const [enqueuedRecord, enqueuedNowMs] = capturedEnqueueCall();
    // Identity, not deep equality: the banner must hold the SAME object the
    // store returned, so a later merge is visible through the queue entry.
    expect(enqueuedRecord).toBe(record);
    expect(enqueuedNowMs).toBe(BASE_NOW);
  });

  it("does not enqueue while the document is hidden", async () => {
    setDocumentVisibility("hidden");

    const result = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record: makeRecord(),
    });

    expect(result.banner).toBe(false);
    expect(enqueueNotificationBannerMock).not.toHaveBeenCalled();
    expect(showPwaNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("never enqueues for post-quietly, so the banner is reachable only from post-and-alert", async () => {
    setDocumentVisibility("visible");

    const result = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-quietly",
      record: makeRecord(),
    });

    expect(result.banner).toBe(false);
    expect(enqueueNotificationBannerMock).not.toHaveBeenCalled();
  });

  it("never enqueues for no-post on either platform", async () => {
    setDocumentVisibility("visible");

    supportsNativeLocalNotificationsMock.mockReturnValue(true);
    const nativeResult = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "no-post",
      record: makeRecord(),
    });

    supportsNativeLocalNotificationsMock.mockReturnValue(false);
    const webResult = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "no-post",
      record: makeRecord(),
    });

    expect(nativeResult.banner).toBe(false);
    expect(webResult.banner).toBe(false);
    expect(enqueueNotificationBannerMock).not.toHaveBeenCalled();
  });

  it("enqueues on the native branch as well as the web branch", async () => {
    setDocumentVisibility("visible");

    supportsNativeLocalNotificationsMock.mockReturnValue(true);
    const nativeResult = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record: makeRecord(),
    });

    expect(nativeResult.posted).toBe("native");
    expect(nativeResult.banner).toBe(true);
    expect(enqueueNotificationBannerMock).toHaveBeenCalledTimes(1);

    supportsNativeLocalNotificationsMock.mockReturnValue(false);
    const webResult = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record: makeRecord({ id: "e".repeat(64) }),
    });

    expect(webResult.posted).toBe("web");
    expect(webResult.banner).toBe(true);
    // The banner is a platform-independent surface: both branches enqueue.
    expect(enqueueNotificationBannerMock).toHaveBeenCalledTimes(2);
  });

  it("reports whether it showed a banner through NotifyResult.banner", async () => {
    setDocumentVisibility("visible");

    const shown = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record: makeRecord(),
    });

    setDocumentVisibility("hidden");

    const suppressed = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record: makeRecord({ id: "9".repeat(64) }),
    });

    expect(shown.banner).toBe(true);
    expect(suppressed.banner).toBe(false);
  });

  it("reads document.visibilityState when no visibility is injected", async () => {
    setDocumentVisibility("visible");
    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record: makeRecord(),
    });
    expect(enqueueNotificationBannerMock).toHaveBeenCalledTimes(1);

    setDocumentVisibility("hidden");
    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record: makeRecord({ id: "f".repeat(64) }),
    });
    expect(enqueueNotificationBannerMock).toHaveBeenCalledTimes(1);
  });

  it("uses the injected documentVisible in preference to the document", async () => {
    // Injected false while the document is visible: nothing enqueues.
    setDocumentVisibility("visible");

    const suppressed = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      documentVisible: false,
      record: makeRecord(),
    });

    expect(suppressed.banner).toBe(false);
    expect(enqueueNotificationBannerMock).not.toHaveBeenCalled();

    // Injected true while the document is hidden: the injection wins.
    setDocumentVisibility("hidden");

    const shown = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      documentVisible: true,
      record: makeRecord({ id: "8".repeat(64) }),
    });

    expect(shown.banner).toBe(true);
    expect(enqueueNotificationBannerMock).toHaveBeenCalledTimes(1);
  });

  it("uses the injected nowMs as the enqueue instant", async () => {
    vi.spyOn(Date, "now").mockReturnValue(BASE_NOW);

    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      documentVisible: true,
      nowMs: BASE_NOW + 4242,
      record: makeRecord(),
    });

    expect(capturedEnqueueCall()[1]).toBe(BASE_NOW + 4242);
  });

  it("defaults the enqueue instant to the wall clock", async () => {
    setDocumentVisibility("visible");

    const before = Date.now();
    await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: "post-and-alert",
      record: makeRecord(),
    });
    const after = Date.now();

    const [, enqueuedNowMs] = capturedEnqueueCall();
    expect(enqueuedNowMs).toBeGreaterThanOrEqual(before);
    expect(enqueuedNowMs).toBeLessThanOrEqual(after);
  });
});

/**
 * Criterion 5, driven end to end through the REAL `resolveNotificationAlert`.
 * `resolveNotificationAlert` is deliberately NOT mocked: the whole assertion is
 * that the DECISION is what prevents the enqueue, so a hand-written decision
 * literal would make these cases pass vacuously.
 */
describe("notifyNotificationRecord — open chat", () => {
  const OPEN_CHAT_ROUTE = { id: "c1", kind: "chat" };
  const OPEN_CHAT_SURFACE: NotificationSurface = { chatId: "c1", kind: "chat" };

  it("a message in the open chat produces no banner while another sender's does", async () => {
    const openChatRecord = makeRecord({
      chatId: "c1",
      conversationKey: "pubkey-a",
      id: "1".repeat(64),
    });
    const elsewhereRecord = makeRecord({
      chatId: "c2",
      conversationKey: "pubkey-b",
      id: "2".repeat(64),
    });

    const openChatOutcome = resolveNotificationAlert({
      nowMs: BASE_NOW,
      origin: "live",
      record: openChatRecord,
      route: OPEN_CHAT_ROUTE,
      syncEpochMs: null,
      visibleSurface: OPEN_CHAT_SURFACE,
    });

    expect(openChatOutcome.decision).toBe("no-post");
    expect(openChatOutcome.rule).toBe("record-surface-open");

    const openChatResult = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: openChatOutcome.decision,
      documentVisible: true,
      nowMs: BASE_NOW,
      record: openChatRecord,
    });

    expect(openChatResult.posted).toBe("none");
    expect(openChatResult.banner).toBe(false);
    expect(enqueueNotificationBannerMock).not.toHaveBeenCalled();

    const elsewhereOutcome = resolveNotificationAlert({
      nowMs: BASE_NOW,
      origin: "live",
      record: elsewhereRecord,
      route: OPEN_CHAT_ROUTE,
      syncEpochMs: null,
      visibleSurface: OPEN_CHAT_SURFACE,
    });

    expect(elsewhereOutcome.decision).toBe("post-and-alert");
    expect(elsewhereOutcome.rule).toBe("elsewhere");

    const elsewhereResult = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: elsewhereOutcome.decision,
      documentVisible: true,
      nowMs: BASE_NOW,
      record: elsewhereRecord,
    });

    expect(elsewhereResult.banner).toBe(true);
    expect(enqueueNotificationBannerMock).toHaveBeenCalledTimes(1);
    expect(capturedEnqueueCall()).toEqual([elsewhereRecord, BASE_NOW]);
    expect(capturedEnqueueCall()[0]).toBe(elsewhereRecord);
  });

  it("alerts without a banner when the app is backgrounded on the record's own chat", async () => {
    // A hidden document has no visible surface, so row 5 cannot match and the
    // record still alerts — it just must not paint an in-app banner.
    const record = makeRecord({ chatId: "c1", conversationKey: "pubkey-a" });

    const outcome = resolveNotificationAlert({
      nowMs: BASE_NOW,
      origin: "live",
      record,
      route: OPEN_CHAT_ROUTE,
      syncEpochMs: null,
      visibleSurface: null,
    });

    expect(outcome.decision).toBe("post-and-alert");

    const result = await notifyNotificationRecord({
      appTitle: APP_TITLE,
      decision: outcome.decision,
      documentVisible: false,
      nowMs: BASE_NOW,
      record,
    });

    expect(result.posted).toBe("web");
    expect(result.banner).toBe(false);
    expect(showPwaNotificationMock).toHaveBeenCalledTimes(1);
    expect(enqueueNotificationBannerMock).not.toHaveBeenCalled();
  });
});

describe("notifyNotificationRecord — catch-up", () => {
  it("a cold-start catch-up batch of 10 produces zero banners", async () => {
    const records = Array.from({ length: 10 }, (_unused, index) =>
      makeRecord({
        chatId: `chat-${index}`,
        conversationKey: `pubkey-${index}`,
        id: String(index).padStart(64, "d"),
      }),
    );

    for (const record of records) {
      const outcome = resolveNotificationAlert({
        nowMs: BASE_NOW,
        origin: "catch-up",
        record,
        route: { kind: "contacts" },
        syncEpochMs: null,
        visibleSurface: null,
      });

      expect(outcome.decision).toBe("no-post");

      const result = await notifyNotificationRecord({
        appTitle: APP_TITLE,
        decision: outcome.decision,
        documentVisible: true,
        nowMs: BASE_NOW,
        record,
      });

      expect(result.posted).toBe("none");
      expect(result.banner).toBe(false);
    }

    expect(enqueueNotificationBannerMock).not.toHaveBeenCalled();
  });
});

/**
 * The structural invariant behind criterion 5 — a SOURCE-level assertion, not a
 * behaviour test. The banner must be enqueued from exactly one line in `src/`,
 * and that line must sit inside `notify.ts` below the `no-post` short circuit.
 * Any other call site (the old `isLive && !isActiveChatContact` toast gate, a
 * `useNotificationRecords()` subscription, anything upstream of the decision)
 * reintroduces the cold-start storm and breaks criterion 5.
 *
 * The walk uses Vite's `?raw` glob rather than `node:fs`: the web-app tsconfig
 * has no Node types (`types: ["vite/client"]`), so a `node:fs` import does not
 * typecheck. `src/i18n/translations.test.ts` reads source text the same way.
 */
const RAW_SOURCE_MODULES: Record<string, unknown> = import.meta.glob(
  "../../**/*.{ts,tsx}",
  { eager: true, import: "default", query: "?raw" },
);

/**
 * Vite normalises glob keys to the SHORTEST relative path from the importing
 * file (`./notify.ts`, `../hooks/x.ts`, `../../App.tsx`), so they are rebased
 * onto `src/` here. The directory of this spec is asserted below, so moving the
 * file breaks the test loudly instead of silently rebasing onto nothing.
 */
const SPEC_DIR_SEGMENTS = ["app", "lib"];

const toSrcRelativePath = (key: string): string => {
  const segments = [...SPEC_DIR_SEGMENTS];
  for (const part of key.split("/")) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  return segments.join("/");
};

const isSpecPath = (path: string): boolean =>
  path.endsWith(".test.ts") || path.endsWith(".test.tsx");

/**
 * Comment lines are stripped first: a bare `grep -c` counts comment prose, and
 * every file that merely *explains* the invariant would read as a call site.
 */
const countEnqueueCallLines = (path: string, value: unknown): number => {
  if (typeof value !== "string") {
    throw new Error(`?raw import produced no text for ${path}`);
  }
  return value
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return (
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("*") &&
        !trimmed.startsWith("/*")
      );
    })
    .filter((line) => line.includes("enqueueNotificationBanner")).length;
};

describe("notifyNotificationRecord — single enqueue", () => {
  it("exactly one enqueueNotificationBanner call site in src/, and it is notify.ts", () => {
    expect(import.meta.url.endsWith("/app/lib/notify.test.ts")).toBe(true);

    const counts = new Map<string, number>();
    for (const [key, value] of Object.entries(RAW_SOURCE_MODULES)) {
      const path = toSrcRelativePath(key);
      if (isSpecPath(path)) {
        continue;
      }
      counts.set(path, countEnqueueCallLines(path, value));
    }

    // Guards the walk itself against going vacuous.
    expect(counts.size).toBeGreaterThan(50);
    expect(counts.has("app/lib/notify.ts")).toBe(true);

    // The definition module is allowed to name it as often as it likes.
    expect(
      counts.get("app/lib/notificationBannerQueue.ts"),
    ).toBeGreaterThanOrEqual(1);

    // The import line plus the ONE call line.
    expect(counts.get("app/lib/notify.ts")).toBe(2);

    const offenders = [...counts.entries()]
      .filter(
        ([path, count]) =>
          count > 0 &&
          path !== "app/lib/notify.ts" &&
          path !== "app/lib/notificationBannerQueue.ts",
      )
      .map(([path, count]) => `${path} (${count})`);

    expect(
      offenders,
      `enqueueNotificationBanner may only be called from app/lib/notify.ts; found ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
