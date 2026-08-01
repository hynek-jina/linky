// The FIRST spec for `readNotificationOpenTarget`.
//
// Until this file existed the parser had ZERO test coverage, and that absence
// is a direct cause of D3 — "a tapped local notification never reaches its
// chat" — surviving five phases. Nothing pinned the fact that the parser
// hard-requires `recipientPubkey` while the producer never supplied it.
//
// The fixtures are faithful rather than invented: they mirror what
// `MainActivity.buildNotificationOpenDetail`
// (apps/native-shell/android/app/src/main/java/fit/linky/app/MainActivity.java,
// read at plan time) actually puts on the notification-open event — a JSON
// object carrying `route` plus the OPTIONAL `outerEventId`, `recipientPubkey`
// and `relayHints` extras. `relayHints` arrives as a JSON-encoded string array
// because the Android intent extra is a `String`
// (`platform/nativeBridge.ts`'s `relayHints?: string`), which
// `notificationOpen.ts` then unwraps.
import { describe, expect, it } from "vitest";
import {
  readNotificationOpenOuterEventId,
  readNotificationOpenRoute,
  readNotificationOpenTarget,
} from "./notificationOpenTarget";

const OUTER_EVENT_ID = "a".repeat(64);
const RECIPIENT_PUBKEY = "b".repeat(64);
const SENDER_PUBKEY = "c".repeat(64);

const RELAY_HINTS = JSON.stringify(["wss://relay.damus.io", "wss://nos.lol"]);

/**
 * A per-file factory, mirroring `notificationTapRoute.test.ts`'s local
 * `makeRecord`. Deliberately NOT a shared test-utils module.
 */
const makeDetail = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  outerEventId: OUTER_EVENT_ID,
  recipientPubkey: RECIPIENT_PUBKEY,
  relayHints: RELAY_HINTS,
  route: "#contacts",
  ...overrides,
});

/** Omission is not the same as a bad value — see the D3 case below. */
const withoutField = (
  detail: Record<string, unknown>,
  field: string,
): Record<string, unknown> => {
  const next = { ...detail };
  Reflect.deleteProperty(next, field);
  return next;
};

describe("readNotificationOpenTarget — T-08", () => {
  it("accepts a complete local-notification detail and rejects a non-hex recipientPubkey", () => {
    expect(readNotificationOpenTarget(makeDetail())).toEqual({
      outerEventId: OUTER_EVENT_ID,
      recipientPubkey: RECIPIENT_PUBKEY,
      relayHints: ["wss://relay.damus.io", "wss://nos.lol"],
      senderPubkey: null,
    });

    // The literal Phase 3 synthetic value. `normalizePubkeyHex` requires
    // /^[a-f0-9]{64}$/, so this can never satisfy the strict parse.
    expect(
      readNotificationOpenTarget(
        makeDetail({ recipientPubkey: "linky-debug-recipient" }),
      ),
    ).toBeNull();

    // THE CASE THAT NAMES THE DEFECT (D3). Not the non-hex value above:
    // `buildNativePayload` omitted `recipientPubkey` ENTIRELY for every local
    // conversation notification before plan 09-03, so the detail Android handed
    // back on a tap simply had no such key. `readNotificationOpenTarget`
    // therefore returned `null` on every tap, and the tap could never reach a
    // chat. The fix is to SUPPLY the field (09-03) and to add a local
    // record-store path around the parser (09-04 + 09-06) — never to weaken
    // this guard.
    expect(
      readNotificationOpenTarget(withoutField(makeDetail(), "recipientPubkey")),
    ).toBeNull();
  });

  it("returns null when the outerEventId is absent", () => {
    expect(
      readNotificationOpenTarget(withoutField(makeDetail(), "outerEventId")),
    ).toBeNull();
  });

  it("returns null when the outerEventId is whitespace-only", () => {
    expect(
      readNotificationOpenTarget(makeDetail({ outerEventId: "   " })),
    ).toBeNull();
  });

  it("filters non-ws(s) relay hints and de-duplicates them", () => {
    const target = readNotificationOpenTarget(
      makeDetail({
        relayHints: JSON.stringify([
          "wss://relay.damus.io",
          "https://relay.example",
          "wss://relay.damus.io",
          "ws://127.0.0.1:7777",
          "   ",
        ]),
      }),
    );

    expect(target?.relayHints).toEqual([
      "wss://relay.damus.io",
      "ws://127.0.0.1:7777",
    ]);
  });

  it("yields an empty relay hint list for a malformed relayHints value", () => {
    // The bare-string form `#advanced/push-debug` sends, and a truncated JSON
    // blob. Neither parses to an array, so neither contributes a hint.
    expect(
      readNotificationOpenTarget(
        makeDetail({ relayHints: "wss://relay.damus.io" }),
      )?.relayHints,
    ).toEqual([]);
    expect(
      readNotificationOpenTarget(makeDetail({ relayHints: '["wss://a"' }))
        ?.relayHints,
    ).toEqual([]);
  });

  it("returns a null senderPubkey when absent and a normalised hex when present", () => {
    // Absent is the ONLY shape the Android local-notification path produces —
    // `notify.ts` leaves `senderPubkey` unpopulated; only the web service
    // worker (`sw.ts`) ever sets it.
    expect(readNotificationOpenTarget(makeDetail())?.senderPubkey).toBeNull();
    expect(
      readNotificationOpenTarget(
        makeDetail({ senderPubkey: SENDER_PUBKEY.toUpperCase() }),
      )?.senderPubkey,
    ).toBe(SENDER_PUBKEY);
  });

  it("returns null for a non-object detail", () => {
    expect(readNotificationOpenTarget("#contacts")).toBeNull();
    expect(readNotificationOpenTarget(null)).toBeNull();
  });

  it("reads the fallback route from the same detail", () => {
    expect(readNotificationOpenRoute(makeDetail())).toBe("#contacts");
    expect(
      readNotificationOpenRoute(JSON.stringify(makeDetail({ route: "#chat" }))),
    ).toBe("#chat");
  });
});

describe("readNotificationOpenOuterEventId — T-08 companion", () => {
  // The pair below is the whole point of the split, so both halves are asserted
  // in ONE case: they cannot be allowed to drift apart.
  it("reads the outer event id without requiring recipientPubkey", () => {
    const detail = withoutField(makeDetail(), "recipientPubkey");

    expect(readNotificationOpenOuterEventId(detail)).toBe(OUTER_EVENT_ID);
    expect(readNotificationOpenTarget(detail)).toBeNull();
  });

  it("still reads the id from a complete detail, and from its JSON string form", () => {
    expect(readNotificationOpenOuterEventId(makeDetail())).toBe(OUTER_EVENT_ID);
    expect(readNotificationOpenOuterEventId(JSON.stringify(makeDetail()))).toBe(
      OUTER_EVENT_ID,
    );
  });

  it("trims the id, exactly like the strict parser does", () => {
    expect(
      readNotificationOpenOuterEventId(
        makeDetail({ outerEventId: `  ${OUTER_EVENT_ID}  ` }),
      ),
    ).toBe(OUTER_EVENT_ID);
  });

  it("returns null for a blank, whitespace-only or absent id", () => {
    expect(
      readNotificationOpenOuterEventId(makeDetail({ outerEventId: "" })),
    ).toBeNull();
    expect(
      readNotificationOpenOuterEventId(makeDetail({ outerEventId: "   " })),
    ).toBeNull();
    expect(
      readNotificationOpenOuterEventId(
        withoutField(makeDetail(), "outerEventId"),
      ),
    ).toBeNull();
  });

  it("returns null for a non-object value", () => {
    expect(readNotificationOpenOuterEventId("#contacts")).toBeNull();
    expect(readNotificationOpenOuterEventId(null)).toBeNull();
    expect(readNotificationOpenOuterEventId(undefined)).toBeNull();
    expect(readNotificationOpenOuterEventId(42)).toBeNull();
  });

  // It is a LOOKUP KEY against the current owner's own records, never a network
  // parameter and never a branded id, so it is deliberately not 64-hex-gated: a
  // garbage value simply finds nothing.
  it("does not require the id to be 64-hex", () => {
    expect(
      readNotificationOpenOuterEventId(makeDetail({ outerEventId: "wrap-1" })),
    ).toBe("wrap-1");
  });
});
