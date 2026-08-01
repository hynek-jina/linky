/**
 * The SHARED tap-to-route helper for notification records.
 *
 * Both notification surfaces call this: the in-app banner (phase 5) and the
 * Notifications page (phase 6). That is the entire point — shipping "what
 * happens when the user taps this" once is what stops the two surfaces from
 * drifting into two subtly different destinations for the same record.
 *
 * Split in two on purpose:
 *   `resolveNotificationNavigation` — PURE. record in, navigation action out.
 *   `openNotificationRecord`        — IMPURE. marks read, then navigates.
 */
import type { NavigationAction } from "../../hooks/useRouting";
import type { NotificationRecord } from "./notificationRecord";
import { notificationRecordStore } from "./notificationRecordStore";

/**
 * Injected rather than imported, so the helper stays testable and holds no
 * React state.
 *
 * `navigate` is REQUIRED and is not defaulted to `navigateTo`: the tests assert
 * the mark-read-before-navigate ordering with a spy, which needs a seam.
 * Phases 5 and 6 pass `navigateTo` from `hooks/useRouting`.
 */
export interface NotificationOpenDeps {
  navigate: (action: NavigationAction) => void;
  nowMs: number;
  /**
   * The chat viewport scroll trigger. Optional because it is hook-provided
   * (`triggerChatScrollToBottom`), not a module export, so a caller outside the
   * chat composition simply omits it.
   */
  scrollToMessage?: (messageId: string) => void;
}

/**
 * Blank-safe id normalisation. A persisted record can carry an empty or
 * whitespace-only id after tampering or version drift (T-04-17); navigating to
 * `#chat/` on such a value would land the user on a dead route, so a blank id is
 * treated exactly like a missing one.
 */
const normalizeId = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * PURE. Maps one record to the navigation target its tap should reach, or
 * `null` when the record carries no usable destination.
 *
 * The switch is EXHAUSTIVE over `NotificationRecordKind` and deliberately has no
 * `default` clause, matching the discipline `AppRouteContent` and
 * `resolveBackAction` use for routes: adding a fifth kind must be a compile
 * error here, never a silent `null` that swallows the tap.
 *
 * The action union is closed — only `chat`, `bankPaymentOffer` and `wallet` are
 * reachable. In particular the branded contact member (the one carrying an
 * `id: ContactId`) is never produced: `record.chatId` is a plain string that may
 * hold a synthetic `unknown:<pubkeyHex>` id, and feeding that into a branded
 * Evolu slot would let a hostile id masquerade as a real `ContactId` (T-04-17).
 */
export const resolveNotificationNavigation = (
  record: NotificationRecord,
): NavigationAction | null => {
  switch (record.kind) {
    case "bankPaymentOffer": {
      const chatId = normalizeId(record.chatId);
      const offerId = normalizeId(record.offerId);
      if (chatId === null || offerId === null) return null;
      return { chatId, offerId, route: "bankPaymentOffer" };
    }

    // `paymentReceived` shares this case with `chatMessage` on purpose
    // (research open question 4, settled): the payment notice itself is never
    // stored in chat history, but the Cashu token message is — in that same
    // chat — and if the token message has not arrived yet the chat is still the
    // right destination.
    case "chatMessage":
    case "paymentReceived": {
      const chatId = normalizeId(record.chatId);
      if (chatId === null) return null;
      return { id: chatId, route: "chat" };
    }

    // The claim's notification title is `t("mints")`, but the ACTIONABLE
    // destination is the wallet balance — the money has landed, the mint screen
    // has nothing for the user to do (research assumption A1, settled). The
    // roadmap's phase 6 wording is "navigates to wallet / offer detail".
    case "npubCashClaim":
      return { route: "wallet" };
  }
};

/**
 * Finds the stored record a tapped notification refers to.
 *
 * The store's `id` IS the outer wrap id for every chat and payment record
 * (`buildNotificationRecord({ id: wrapId, … })`), and `notify.ts` forwards that
 * same `record.id` as the payload's `outerEventId`. So this is an exact
 * identity match, not a heuristic, and it needs no relay round-trip.
 *
 * PURE: takes the records rather than reading the store, so it is testable and
 * so the caller keeps control of owner scoping — the lookup must only ever run
 * against the CURRENTLY BOUND owner's records.
 *
 * Returns `null` for a blank id, exactly like `normalizeId`, so a tampered
 * detail cannot match a record with a blank id.
 */
export const findNotificationRecordByOuterEventId = (
  records: readonly NotificationRecord[],
  outerEventId: string,
): NotificationRecord | null => {
  const normalized = normalizeId(outerEventId);
  if (normalized === null) return null;

  return records.find((record) => record.id === normalized) ?? null;
};

/**
 * Marks the record read through the store, then navigates, then optionally
 * scrolls.
 *
 * This is the ONE writer path for a tap-driven read. `notificationRecordStore`
 * is the single writer of `readAt`; no consumer may build a read timestamp
 * itself, which is what keeps the invariant grep-provable.
 *
 * `markRead` runs FIRST and UNCONDITIONALLY — before the navigation is even
 * resolved, and even when it resolves to `null`. The user saw the record either
 * way, so leaving it unread because its destination happened to be missing
 * would strand an entry the human has already dealt with.
 *
 * Scrolling generalises the existing `openInboxMessageToast` shape (navigate to
 * the chat, then trigger the scroll) and fires only for `chatMessage`: a
 * `paymentReceived` record shares the chat destination, but its notice is never
 * stored in chat history, so any id it carries would not resolve to a rendered
 * row.
 */
export const openNotificationRecord = (
  record: NotificationRecord,
  deps: NotificationOpenDeps,
): void => {
  notificationRecordStore.markRead(record.id, deps.nowMs);

  const action = resolveNotificationNavigation(record);
  if (action === null) return;

  deps.navigate(action);

  if (record.kind !== "chatMessage") return;
  const messageId = normalizeId(record.messageId);
  if (messageId === null) return;

  deps.scrollToMessage?.(messageId);
};
