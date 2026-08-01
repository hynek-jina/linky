import { afterEach, describe, expect, it, vi } from "vitest";
import type { Route } from "../../types/route";
import type { NotificationRouteLike } from "./notificationSurface";
import {
  clearVisibleSurface,
  readDocumentVisible,
  registerVisibleSurface,
  resolveCurrentVisibleSurface,
  resolveVisibleSurface,
  surfaceFromRoute,
} from "./notificationSurface";

/**
 * The route fixtures are typed as the real `Route` union on purpose: this file is
 * also the standing proof that `NotificationRouteLike` stays structurally
 * compatible with `types/route.ts`, so a future route change breaks here first.
 */
const chatRoute: Route = { kind: "chat", id: "c1" };
const offerRoute: Route = {
  chatId: "c1",
  kind: "bankPaymentOffer",
  offerId: "o1",
};
const topupInvoiceRoute: Route = { kind: "topupInvoice" };
const walletRoute: Route = { kind: "wallet" };
const contactsRoute: Route = { kind: "contacts" };
const advancedRoute: Route = { kind: "advanced" };
const topupRoute: Route = { kind: "topup" };

/** A representative slice of the Route union — none of these owns a surface. */
const NON_SURFACE_ROUTES: readonly Route[] = [
  walletRoute,
  contactsRoute,
  advancedRoute,
  topupRoute,
  { kind: "settings" },
  { kind: "settingsUnits" },
  { kind: "profile" },
  { kind: "profileEdit" },
  { kind: "transactions" },
  { kind: "topupNoAmount" },
  { kind: "manualPay" },
  { kind: "cashuTokens" },
  { kind: "cashuTokenNew" },
  { kind: "nostrRelays" },
  { kind: "nostrRelay", id: "relay-1" },
  { kind: "evoluData" },
  { kind: "mints" },
  { kind: "mint", mintUrl: "https://mint.example" },
  { kind: "bankPayment", spdPayload: "SPD*1.0" },
  { kind: "lnAddressPay", lnAddress: "alice@linky.fit" },
];

const stubDocumentVisibility = (state: DocumentVisibilityState): void => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
};

afterEach(() => {
  // The registry is module-level state; leaking it would make test order matter.
  clearVisibleSurface({ kind: "notificationsPage" });
  clearVisibleSurface({ chatId: "c1", kind: "chat" });
  clearVisibleSurface({ chatId: "c2", kind: "chat" });
  clearVisibleSurface({ kind: "topupInvoice" });
  clearVisibleSurface({ kind: "bankPaymentOffer", offerId: "o1" });
  vi.restoreAllMocks();
});

describe("surfaceFromRoute", () => {
  it("maps a chat route to that chat's surface", () => {
    expect(surfaceFromRoute(chatRoute)).toEqual({ chatId: "c1", kind: "chat" });
  });

  it("maps a bankPaymentOffer route to that offer's surface", () => {
    expect(surfaceFromRoute(offerRoute)).toEqual({
      kind: "bankPaymentOffer",
      offerId: "o1",
    });
  });

  it("maps the topup invoice route to the topupInvoice surface", () => {
    expect(surfaceFromRoute(topupInvoiceRoute)).toEqual({
      kind: "topupInvoice",
    });
  });

  it("returns null for routes that own no notification surface", () => {
    for (const route of [
      walletRoute,
      contactsRoute,
      advancedRoute,
      topupRoute,
    ]) {
      expect(surfaceFromRoute(route)).toBeNull();
    }
  });

  it("returns null for a chat route with an empty id — an empty id owns nothing", () => {
    const emptyIdRoute: NotificationRouteLike = { id: "", kind: "chat" };
    expect(surfaceFromRoute(emptyIdRoute)).toBeNull();
  });

  it("returns null for a chat route with a null id", () => {
    const nullIdRoute: NotificationRouteLike = { id: null, kind: "chat" };
    expect(surfaceFromRoute(nullIdRoute)).toBeNull();
  });

  it("returns null for a whitespace-only chat id", () => {
    const blankIdRoute: NotificationRouteLike = { id: "   ", kind: "chat" };
    expect(surfaceFromRoute(blankIdRoute)).toBeNull();
  });

  it("returns null for a bankPaymentOffer route with an empty offerId", () => {
    const emptyOfferRoute: NotificationRouteLike = {
      kind: "bankPaymentOffer",
      offerId: "",
    };
    expect(surfaceFromRoute(emptyOfferRoute)).toBeNull();
  });

  it("never derives the notificationsPage surface from any route — Phase 6 registers it", () => {
    const routes: readonly NotificationRouteLike[] = [
      chatRoute,
      offerRoute,
      topupInvoiceRoute,
      ...NON_SURFACE_ROUTES,
      { kind: "notificationsPage" },
    ];
    for (const route of routes) {
      expect(surfaceFromRoute(route)?.kind).not.toBe("notificationsPage");
    }
  });
});

describe("resolveVisibleSurface", () => {
  it("returns the chat surface when the document is visible", () => {
    expect(resolveVisibleSurface(chatRoute, true)).toEqual({
      chatId: "c1",
      kind: "chat",
    });
  });

  it("returns null for a chat route while the document is hidden", () => {
    // Load-bearing: a backgrounded app sitting on the record's own chat route has
    // NO visible surface, so the record still alerts. Signal clears its
    // `visibleThread` in onPause for exactly this reason.
    expect(resolveVisibleSurface(chatRoute, false)).toBeNull();
  });

  it("returns null for the topup invoice route while the document is hidden", () => {
    expect(resolveVisibleSurface(topupInvoiceRoute, false)).toBeNull();
  });

  it("returns null for the offer route while the document is hidden", () => {
    expect(resolveVisibleSurface(offerRoute, false)).toBeNull();
  });

  it("returns null for a visible wallet route — visibility alone is not a surface", () => {
    expect(resolveVisibleSurface(walletRoute, true)).toBeNull();
  });
});

describe("readDocumentVisible", () => {
  it("is true when the document reports itself visible", () => {
    stubDocumentVisibility("visible");
    expect(readDocumentVisible()).toBe(true);
  });

  it("is false when the document is hidden", () => {
    stubDocumentVisibility("hidden");
    expect(readDocumentVisible()).toBe(false);
  });
});

describe("registerVisibleSurface / clearVisibleSurface", () => {
  it("falls back to route-derived resolution when nothing is registered", () => {
    stubDocumentVisibility("visible");
    expect(resolveCurrentVisibleSurface(chatRoute)).toEqual(
      surfaceFromRoute(chatRoute),
    );
    expect(resolveCurrentVisibleSurface(walletRoute)).toBeNull();
  });

  it("honours a registered notificationsPage surface even on a wallet route", () => {
    stubDocumentVisibility("visible");
    registerVisibleSurface({ kind: "notificationsPage" });
    expect(resolveCurrentVisibleSurface(walletRoute)).toEqual({
      kind: "notificationsPage",
    });
  });

  it("restores route-derived resolution after the registered surface is cleared", () => {
    stubDocumentVisibility("visible");
    registerVisibleSurface({ kind: "notificationsPage" });
    clearVisibleSurface({ kind: "notificationsPage" });
    expect(resolveCurrentVisibleSurface(chatRoute)).toEqual({
      chatId: "c1",
      kind: "chat",
    });
  });

  it("ignores a clear for a DIFFERENT surface — a stale unmount must not clear a newer registration", () => {
    stubDocumentVisibility("visible");
    registerVisibleSurface({ kind: "notificationsPage" });
    clearVisibleSurface({ chatId: "c1", kind: "chat" });
    expect(resolveCurrentVisibleSurface(walletRoute)).toEqual({
      kind: "notificationsPage",
    });
  });

  it("only clears the matching chat surface, not a chat surface for another id", () => {
    stubDocumentVisibility("visible");
    registerVisibleSurface({ chatId: "c1", kind: "chat" });
    clearVisibleSurface({ chatId: "c2", kind: "chat" });
    expect(resolveCurrentVisibleSurface(walletRoute)).toEqual({
      chatId: "c1",
      kind: "chat",
    });
    clearVisibleSurface({ chatId: "c1", kind: "chat" });
    expect(resolveCurrentVisibleSurface(walletRoute)).toBeNull();
  });

  it("ignores a registered surface while the document is hidden", () => {
    stubDocumentVisibility("hidden");
    registerVisibleSurface({ kind: "notificationsPage" });
    expect(resolveCurrentVisibleSurface(walletRoute)).toBeNull();
    expect(resolveCurrentVisibleSurface(chatRoute)).toBeNull();
  });
});
