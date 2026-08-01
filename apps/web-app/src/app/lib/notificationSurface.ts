/**
 * What the user is currently LOOKING AT, as opposed to whether the app happens to
 * be foregrounded.
 *
 * Signal keeps a single `visibleThread` that is set in onResume and cleared in
 * onPause, and suppresses an alert only when the incoming message belongs to that
 * exact thread. Copying that shape is the whole point of this module: "the app is
 * in the foreground" is not a reason to swallow a notification, and a hidden
 * document is not a surface even when a chat route is still parsed from the hash.
 */

/**
 * Structurally compatible with `types/route.ts`'s `Route` union and with
 * `inboxNotificationRoute.ts`'s parameter, so the same route object can be handed
 * to both without a conversion step.
 */
export interface NotificationRouteLike {
  id?: string | null | undefined;
  kind: string;
  offerId?: string | undefined;
}

/**
 * The surfaces that can own a notification record.
 *
 * `notificationsPage` is deliberately NOT route-derived in Phase 4: the page does
 * not exist yet, and Phase 6 will register it through `registerVisibleSurface`
 * rather than by adding a route case below.
 */
export type NotificationSurface =
  | { chatId: string; kind: "chat" }
  | { kind: "bankPaymentOffer"; offerId: string }
  | { kind: "notificationsPage" }
  | { kind: "topupInvoice" };

/** Route ids arrive from the hash, so an empty or whitespace-only id owns nothing. */
const normalizeRouteId = (value: string | null | undefined): string =>
  String(value ?? "").trim();

/**
 * PURE. Route -> the surface that route would show, ignoring visibility.
 *
 * Exactly three route kinds map to a surface in Phase 4. Everything else is null,
 * including every settings/wallet/list screen: those show none of the four record
 * kinds, so a record arriving while they are open must still alert.
 */
export const surfaceFromRoute = (
  route: NotificationRouteLike,
): NotificationSurface | null => {
  switch (route.kind) {
    case "bankPaymentOffer": {
      const offerId = normalizeRouteId(route.offerId);
      return offerId === "" ? null : { kind: "bankPaymentOffer", offerId };
    }
    case "chat": {
      const chatId = normalizeRouteId(route.id);
      return chatId === "" ? null : { chatId, kind: "chat" };
    }
    case "topupInvoice":
      // The wallet top-up screen is the npub.cash claim's own surface.
      return { kind: "topupInvoice" };
    default:
      return null;
  }
};

/**
 * PURE. A hidden document has NO visible surface — backgrounding the app clears
 * it, exactly as Signal clears `visibleThread` in onPause.
 *
 * `documentVisible` is ONE CONJUNCT here, never the gate on its own: a visible
 * document on the wallet route still yields null, and a hidden document on the
 * record's own chat route also yields null so the record still alerts.
 */
export const resolveVisibleSurface = (
  route: NotificationRouteLike,
  documentVisible: boolean,
): NotificationSurface | null =>
  documentVisible ? surfaceFromRoute(route) : null;

/**
 * The only impure read in this module. `document` is absent in the service worker
 * and in non-browser test environments, so a throw means "not visible" rather
 * than an unhandled error on a notification path.
 */
export const readDocumentVisible = (): boolean => {
  try {
    return document.visibilityState === "visible";
  } catch {
    return false;
  }
};

/**
 * Two surfaces are the same registration when their kind matches and, for the
 * kinds that carry an identity, that identity matches too.
 */
const isSameSurface = (
  left: NotificationSurface,
  right: NotificationSurface,
): boolean => {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "chat" && right.kind === "chat") {
    return left.chatId === right.chatId;
  }
  if (left.kind === "bankPaymentOffer" && right.kind === "bankPaymentOffer") {
    return left.offerId === right.offerId;
  }
  return true;
};

/**
 * Phase 6 seam. Phase 4 ships the registry and never calls `register` itself, so
 * the override is always null in this phase and resolution stays route-derived.
 */
let registeredSurface: NotificationSurface | null = null;

export const registerVisibleSurface = (surface: NotificationSurface): void => {
  registeredSurface = surface;
};

/**
 * Clears ONLY when the argument matches the registered value: React unmount order
 * is not guaranteed, so a stale screen's cleanup must not clear the registration
 * a newer screen just made.
 */
export const clearVisibleSurface = (surface: NotificationSurface): void => {
  if (registeredSurface !== null && isSameSurface(registeredSurface, surface)) {
    registeredSurface = null;
  }
};

/**
 * Impure convenience: the registered override (only while the document is
 * visible) ?? the route-derived surface.
 *
 * Phase 6 adds the CALLER, not a parameter — the signature is fixed here so
 * plans 04-06/04-07/04-08 compile against it unchanged.
 */
export const resolveCurrentVisibleSurface = (
  route: NotificationRouteLike,
): NotificationSurface | null => {
  if (!readDocumentVisible()) {
    return null;
  }
  return registeredSurface ?? surfaceFromRoute(route);
};
