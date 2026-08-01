/**
 * The platform-dispatching notifier.
 *
 * This module is the ONLY place that chooses between the Phase 3 native
 * notification bridge and the web PWA notification fallback. Before it existed,
 * `pwaNotifications.ts` was the *only* branch, and inside the Capacitor WebView
 * `"Notification" in globalThis` is false — so the entire notification path was
 * a no-op on Android and the shell's ten-method bridge had no caller outside
 * `#advanced/push-debug`.
 *
 * `pwaNotifications.ts` is now the WEB-ONLY branch and must not grow a native
 * branch: one module, one platform responsibility. Its
 * `document.visibilityState` early return stays exactly as it is — see the
 * comment at the fallback call site below for why that check is a legitimate
 * *web alert* gate rather than the record-dropping bug it used to be.
 */
import {
  postNativeLocalNotification,
  supportsNativeLocalNotifications,
  type NativeLocalNotificationPayload,
  type NativeLocalNotificationPostResult,
} from "../../platform/nativeBridge";
import type { NotificationAlertDecision } from "./notificationAlert";
import { enqueueNotificationBanner } from "./notificationBannerQueue";
import type { NotificationRecord } from "./notificationRecord";
import { readDocumentVisible } from "./notificationSurface";
import { showPwaNotification } from "./pwaNotifications";

export interface NotifyInput {
  appTitle: string;
  /**
   * `"no-post"` is accepted and short-circuits, so callers can hand over the
   * decision `resolveNotificationAlert` produced without branching first.
   */
  decision: NotificationAlertDecision;
  /**
   * Defaults to `readDocumentVisible()`. Optional so none of the five existing
   * call sites changes; injected in tests.
   */
  documentVisible?: boolean;
  /** Defaults to `Date.now()`. Optional for the same reason; injected in tests. */
  nowMs?: number;
  /**
   * MY OWN pubkey hex — the wrap's recipient, not the sender.
   *
   * `readNotificationOpenTarget` hard-requires this field
   * (`notificationOpenTarget.ts`: `if (!outerEventId || !recipientPubkey) return null`)
   * and `useScanNativeComposition` compares it against the live identity before
   * opening anything. Without it a tapped conversation notification can never
   * resolve to a chat, which is exactly the Phase 8 defect.
   *
   * Threaded through `NotifyInput` rather than added to `NotificationRecord` on
   * purpose: the record is PERSISTED, so growing its schema would mean a new
   * `isNotificationRecord` branch and a migration story for a value that is a
   * property of the current session, not of the event. It is also NOT read from
   * a store inside this module — `notify.ts` is a pure dispatcher and must not
   * grow an identity dependency.
   *
   * Optional, so the existing call sites compile unchanged and an omitted value
   * degrades to today's behaviour rather than throwing.
   */
  recipientPubkey?: string;
  /**
   * The record as the store holds it — i.e. the value `notificationRecordStore.upsert`
   * RETURNED, never the freshly built one. The record is written before this
   * function runs; `"no-post"` never means "no record".
   */
  record: NotificationRecord;
}

export interface NotifyResult {
  /** True exactly when this call enqueued an in-app banner. */
  banner: boolean;
  /** The raw bridge result, so a `status: "error"` device stays diagnosable. Null when nothing was posted. */
  nativeResult: NativeLocalNotificationPostResult | null;
  posted: "native" | "none" | "web";
}

/**
 * A record id containing `":"` is a kind-prefixed synthetic id (currently only
 * `npubCashClaim:<tokenId>`). Prefixing non-wrap ids with their kind is exactly
 * what keeps them from colliding with a 64-hex wrap id, so the presence of the
 * separator is the test for "this is not an outer event id".
 */
const isOuterEventId = (recordId: string): boolean => !recordId.includes(":");

/**
 * Built with the `...(x ? { x } : {})` spread idiom so absent optional keys stay
 * absent under `exactOptionalPropertyTypes` and never reach the bridge as an
 * explicit `undefined`.
 *
 * `quiet` is passed in rather than derived from the decision, because the
 * channel is no longer a pure function of the decision — see the call site.
 */
const buildNativePayload = (
  record: NotificationRecord,
  quiet: boolean,
  recipientPubkey: string | undefined,
): NativeLocalNotificationPayload => ({
  // npubCashClaim has no peer pubkey, so its own id is the conversation.
  conversationKey: record.conversationKey ?? record.id,
  quiet,
  text: record.preview,
  ...(record.senderLabel ? { senderName: record.senderLabel } : {}),
  ...(isOuterEventId(record.id) ? { outerEventId: record.id } : {}),
  ...(record.eventCreatedAtSec === undefined
    ? {}
    : { eventCreatedAtSec: record.eventCreatedAtSec }),
  // Layer 1 of the D3 fix: with this key the payload finally satisfies
  // `readNotificationOpenTarget`'s hard requirement
  // (`if (!outerEventId || !recipientPubkey) return null`), so a tapped shade
  // entry can resolve to a chat instead of falling through to `"#contacts"`.
  // Plan 09-06 adds layer 2 — resolving from the record store first, so the
  // common case needs no relay round-trip at all.
  //
  // `relayHints` and `senderPubkey` stay deliberately unpopulated: both are
  // optional in that parser, `senderPubkey` has no producer anywhere in the
  // codebase, and 09-06's record-store-first path removes the relay round-trip
  // `relayHints` would have fed.
  //
  // Same spread idiom as every other optional key: under
  // `exactOptionalPropertyTypes` an absent value must stay ABSENT, never reach
  // the bridge as an explicit `undefined`.
  ...(recipientPubkey ? { recipientPubkey } : {}),
});

/**
 * Turns an alert decision plus a durable record into an OS notification.
 *
 * Never throws: the native wrapper already swallows bridge throws and returns
 * `null`, and the web branch's await is wrapped, so a rejected notification
 * cannot break inbox sync.
 */
export const notifyNotificationRecord = async (
  input: NotifyInput,
): Promise<NotifyResult> => {
  if (input.decision === "no-post") {
    return { banner: false, nativeResult: null, posted: "none" };
  }

  const { record } = input;

  const nowMs = input.nowMs ?? Date.now();
  const documentVisible = input.documentVisible ?? readDocumentVisible();
  // The ONLY banner enqueue in src/, pinned by a source-walking test in
  // notify.test.ts. It is reachable only from `post-and-alert` — because it sits
  // BELOW the `no-post` short circuit and reads the decision only
  // `resolveNotificationAlert` produces — and only while the user can actually
  // see the app. Enqueuing anywhere upstream of the decision reintroduces the
  // cold-start banner storm and breaks criterion 5: a message arriving while
  // that exact chat is open must produce no banner, which is row 5's `no-post`
  // returning above this line.
  const showBanner = input.decision === "post-and-alert" && documentVisible;
  if (showBanner) enqueueNotificationBanner(record, nowMs);

  if (supportsNativeLocalNotifications()) {
    // Returns unconditionally, including on a null result: falling through here
    // would double-post the same record on a device that did receive it.
    //
    // The banner is carrying this alert, so the shade entry must not peek over
    // it. `linky_messages_quiet_v1` is IMPORTANCE_DEFAULT, so the platform's
    // PeekNotImportantSuppressor keeps it out of the heads-up while the entry
    // still posts to the shade with the decrypted sender and preview (the
    // channel shipped in plan 04-09 and was verified on device under plan
    // 04-10's assumption A2). `setSilent()` stays banned — channel importance is
    // the only silencing mechanism.
    //
    // SUPERSESSION — read before treating this as a Phase 4 regression:
    // This plan deliberately supersedes plan 04-10's criterion-1 observation
    // that a message arriving while the app is FOREGROUNDED posts on the loud
    // channel (`04-10-SUMMARY.md`, "Criterion 1 — foregrounded on the wallet
    // screen"). From Phase 5 the in-app banner carries that alert, so the native
    // post is downgraded to `linky_messages_quiet_v1`. Phase 4's criterion as
    // worded in the ROADMAP — a durable record AND a shade entry — still holds:
    // a quiet post still lands in the shade with the decrypted sender and
    // preview, it simply does not peek. The alternative is a 5 s heads-up
    // overlaying a 10 s banner, which is a double alert and a regression against
    // this phase's own goal. This is NOT a Phase 4 regression; it is the Phase 5
    // design the row-7 comment was promising, relocated to the layer that owns
    // platform rendering.
    //
    // Web already has this shape for free: `showPwaNotification` early-returns
    // while the document is visible (`pwaNotifications.ts:16`), so visible means
    // banner only and hidden means OS notification only. The native branch now
    // matches it.
    //
    // Forward note, NOT implemented here: Android re-peeks on a quiet -> loud
    // update of the same `(tag, id)` and honours the new channel (observed in
    // plan 04-10's open question 1), so escalating a dismissed-unread banner to
    // a real heads-up later is viable. Phase 5 does not do it.
    const nativeResult = postNativeLocalNotification(
      buildNativePayload(
        record,
        input.decision === "post-quietly" || showBanner,
        input.recipientPubkey,
      ),
    );
    return { banner: showBanner, nativeResult, posted: "native" };
  }

  // Web-only fallback. `supportsNativeLocalNotifications()` is
  // `isNativePlatform() && Boolean(bridge?.post)`, so an old APK without `post`
  // degrades to this branch instead of throwing.
  //
  // The visibility check inside this callee is a legitimate *web alert* gate,
  // not a dropped notification: the durable record was already written upstream,
  // and on the web a visible tab genuinely means the user is looking at Linky.
  //
  // That same early return is why the web branch needs nothing extra for the
  // banner: it fires exactly when the document is HIDDEN, and the enqueue above
  // fires exactly when it is VISIBLE. Web is symmetric for free — visible means
  // an in-app card only, hidden means an OS notification only, never both.
  try {
    await showPwaNotification({
      appTitle: input.appTitle,
      body: record.preview,
      tag: record.conversationKey ? `msg_${record.conversationKey}` : record.id,
      title: record.senderLabel || input.appTitle,
    });
  } catch {
    // Best-effort: a rejected web notification must not fail inbox sync.
  }

  return { banner: showBanner, nativeResult: null, posted: "web" };
};
