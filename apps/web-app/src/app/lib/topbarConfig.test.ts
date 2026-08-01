import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CashuTokenId, ContactId } from "../../evolu";
import type { Route } from "../../types/route";
import { setLinkyBankPaymentOfferMinimized } from "./bankPaymentOffer";
import {
  buildTopbarRight,
  buildTopbarTitle,
  resolveBackAction,
  type BackActionContext,
} from "./topbarConfig";

vi.mock("./bankPaymentOffer", () => ({
  setLinkyBankPaymentOfferMinimized: vi.fn(),
}));

const assignMock = vi.fn();

vi.stubGlobal("location", { assign: assignMock, hash: "" });

const contactId = "contact-1" as ContactId;
const tokenId = "token-1" as CashuTokenId;

const closeContactDetail = vi.fn();
const navigateToMainReturn = vi.fn();

const baseContext: BackActionContext = {
  closeContactDetail,
  contactPayBackToChatId: null,
  navigateToMainReturn,
};

/**
 * One sample per Route kind, as a Record keyed by `Route["kind"]`.
 *
 * `buildTopbarRight` and `buildTopbarTitle` are if-chains, NOT exhaustive
 * switches: a new route kind that neither handles produces the hamburger button
 * and a blank title, silently, with no compile error. This map is the guard —
 * adding a kind to the union without adding it here is a TYPE error, and the
 * cases below then exercise the new kind automatically.
 */
const ROUTE_SAMPLES: Record<Route["kind"], Route> = {
  advanced: { kind: "advanced" },
  advancedAutoPayLimit: { kind: "advancedAutoPayLimit" },
  advancedPushDebug: { kind: "advancedPushDebug" },
  bankPayment: { kind: "bankPayment", spdPayload: "SPD*1.0" },
  bankPaymentOffer: {
    kind: "bankPaymentOffer",
    chatId: "chat-1",
    offerId: "offer-1",
  },
  cashuToken: { kind: "cashuToken", id: tokenId },
  cashuTokenEmit: { kind: "cashuTokenEmit" },
  cashuTokenNew: { kind: "cashuTokenNew" },
  cashuTokens: { kind: "cashuTokens" },
  chat: { kind: "chat", id: "chat-1" },
  contact: { kind: "contact", id: contactId },
  contactEdit: { kind: "contactEdit", id: contactId },
  contactNew: { kind: "contactNew" },
  contactPay: { kind: "contactPay", id: contactId },
  contacts: { kind: "contacts" },
  evoluCurrentData: { kind: "evoluCurrentData" },
  evoluData: { kind: "evoluData" },
  evoluHistoryData: { kind: "evoluHistoryData" },
  evoluServer: { kind: "evoluServer", id: "server-1" },
  evoluServerNew: { kind: "evoluServerNew" },
  evoluServers: { kind: "evoluServers" },
  lnAddressPay: { kind: "lnAddressPay", lnAddress: "a@b.c" },
  manualPay: { kind: "manualPay" },
  mint: { kind: "mint", mintUrl: "https://mint.example" },
  mints: { kind: "mints" },
  nostrRelay: { kind: "nostrRelay", id: "relay-1" },
  nostrRelayNew: { kind: "nostrRelayNew" },
  nostrRelays: { kind: "nostrRelays" },
  profile: { kind: "profile" },
  profileEdit: { kind: "profileEdit" },
  settings: { kind: "settings" },
  settingsMasterKeys: { kind: "settingsMasterKeys" },
  settingsNotifications: { kind: "settingsNotifications" },
  settingsUnits: { kind: "settingsUnits" },
  topup: { kind: "topup" },
  topupInvoice: { kind: "topupInvoice" },
  topupNoAmount: { kind: "topupNoAmount" },
  transactions: { kind: "transactions" },
  wallet: { kind: "wallet" },
};

const openScan = vi.fn();
const toggleMenu = vi.fn();

const rightSlotFor = (route: Route) =>
  buildTopbarRight({
    chatEditContactId: null,
    isProfileEditing: false,
    openScan,
    route,
    t: (key) => key,
    toggleMenu,
  });

const backHashFor = (
  route: Route,
  context: BackActionContext = baseContext,
): string | null => {
  const action = resolveBackAction(route, context);
  if (!action) return null;
  action();
  return assignMock.mock.calls.at(-1)?.[0] ?? null;
};

beforeEach(() => {
  assignMock.mockClear();
  closeContactDetail.mockClear();
  navigateToMainReturn.mockClear();
  openScan.mockClear();
  toggleMenu.mockClear();
});

describe("resolveBackAction", () => {
  it("returns null on root screens so the app can exit", () => {
    expect(resolveBackAction({ kind: "contacts" }, baseContext)).toBeNull();
    expect(resolveBackAction({ kind: "wallet" }, baseContext)).toBeNull();
  });

  it("returns a handler for every non-root route", () => {
    const nonRootRoutes: Route[] = [
      { kind: "settings" },
      { kind: "settingsUnits" },
      { kind: "settingsMasterKeys" },
      { kind: "settingsNotifications" },
      { kind: "advanced" },
      { kind: "advancedAutoPayLimit" },
      { kind: "advancedPushDebug" },
      { kind: "mints" },
      { kind: "mint", mintUrl: "https://mint.example" },
      { kind: "profile" },
      { kind: "profileEdit" },
      { kind: "transactions" },
      { kind: "topup" },
      { kind: "topupNoAmount" },
      { kind: "topupInvoice" },
      { kind: "manualPay" },
      { kind: "bankPayment", spdPayload: "SPD*1.0" },
      { kind: "lnAddressPay", lnAddress: "a@b.c" },
      { kind: "cashuTokens" },
      { kind: "cashuTokenNew" },
      { kind: "cashuTokenEmit" },
      { kind: "cashuToken", id: tokenId },
      { kind: "nostrRelays" },
      { kind: "nostrRelay", id: "relay-1" },
      { kind: "nostrRelayNew" },
      { kind: "evoluServers" },
      { kind: "evoluServer", id: "server-1" },
      { kind: "evoluServerNew" },
      { kind: "evoluData" },
      { kind: "evoluCurrentData" },
      { kind: "evoluHistoryData" },
      { kind: "contactNew" },
      { kind: "contact", id: contactId },
      { kind: "contactEdit", id: contactId },
      { kind: "contactPay", id: contactId },
      { kind: "bankPaymentOffer", chatId: "chat-1", offerId: "offer-1" },
      { kind: "chat", id: "chat-1" },
    ];

    for (const route of nonRootRoutes) {
      expect(
        resolveBackAction(route, baseContext),
        `expected a back action for route ${route.kind}`,
      ).not.toBeNull();
    }
  });

  it("walks settings sub-pages back up to settings", () => {
    expect(backHashFor({ kind: "settingsUnits" })).toBe("#settings");
    expect(backHashFor({ kind: "settingsMasterKeys" })).toBe("#settings");
    expect(backHashFor({ kind: "settingsNotifications" })).toBe("#settings");
    expect(backHashFor({ kind: "advancedAutoPayLimit" })).toBe("#settings");
    expect(backHashFor({ kind: "advancedPushDebug" })).toBe("#settings");
    expect(backHashFor({ kind: "mints" })).toBe("#settings");
    expect(backHashFor({ kind: "nostrRelays" })).toBe("#settings");
    expect(backHashFor({ kind: "evoluServers" })).toBe("#settings");
  });

  it("walks wallet sub-pages back up one level at a time", () => {
    expect(backHashFor({ kind: "transactions" })).toBe("#wallet");
    expect(backHashFor({ kind: "topup" })).toBe("#wallet");
    expect(backHashFor({ kind: "topupNoAmount" })).toBe("#wallet/topup");
    expect(backHashFor({ kind: "topupInvoice" })).toBe("#wallet/topup");
    expect(backHashFor({ kind: "cashuTokens" })).toBe("#wallet");
    expect(backHashFor({ kind: "cashuTokenEmit" })).toBe("#wallet");
    expect(backHashFor({ kind: "cashuTokenNew" })).toBe("#wallet/tokens");
    expect(backHashFor({ kind: "cashuToken", id: tokenId })).toBe(
      "#wallet/tokens",
    );
  });

  it("returns to the main screen the user came from", () => {
    resolveBackAction({ kind: "settings" }, baseContext)?.();
    resolveBackAction({ kind: "advanced" }, baseContext)?.();
    resolveBackAction({ kind: "profile" }, baseContext)?.();

    expect(navigateToMainReturn).toHaveBeenCalledTimes(3);
  });

  it("closes the contact detail rather than navigating by hash", () => {
    resolveBackAction({ kind: "contact", id: contactId }, baseContext)?.();
    resolveBackAction({ kind: "contactNew" }, baseContext)?.();

    expect(closeContactDetail).toHaveBeenCalledTimes(2);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("sends contact pay back to the chat it was opened from", () => {
    expect(
      backHashFor(
        { kind: "contactPay", id: contactId },
        { ...baseContext, contactPayBackToChatId: contactId },
      ),
    ).toBe(`#chat/${contactId}`);
  });

  it("sends contact pay back to the contact when not opened from a chat", () => {
    expect(backHashFor({ kind: "contactPay", id: contactId })).toBe(
      `#contact/${contactId}`,
    );
  });

  it("sends a bank payment offer back to its chat", () => {
    expect(
      backHashFor({
        kind: "bankPaymentOffer",
        chatId: "chat-1",
        offerId: "offer-1",
      }),
    ).toBe("#chat/chat-1");
  });

  it("marks a bank payment offer minimized on the way back", () => {
    resolveBackAction(
      { kind: "bankPaymentOffer", chatId: "chat-1", offerId: "offer-1" },
      baseContext,
    )?.();

    expect(setLinkyBankPaymentOfferMinimized).toHaveBeenCalledWith(
      "chat-1",
      "offer-1",
      true,
    );
  });
});

describe("ROUTE_SAMPLES", () => {
  it("keys every sample by its own route kind", () => {
    // `Record<Route["kind"], Route>` forces an entry for every kind, but not
    // that the entry describes that kind. A copy-paste would otherwise drop a
    // kind from the coverage below without any signal.
    for (const [kind, route] of Object.entries(ROUTE_SAMPLES)) {
      expect(route.kind).toBe(kind);
    }
  });
});

describe("buildTopbarTitle", () => {
  it("gives every route kind a title", () => {
    for (const route of Object.values(ROUTE_SAMPLES)) {
      const title = buildTopbarTitle(route, (key) => key);
      // Report the kind by name: a bare toBeTruthy() diff says only "null".
      expect({ kind: route.kind, title }).toEqual({
        kind: route.kind,
        title: expect.any(String),
      });
    }
  });

  it("titles the notifications page with the shared history key", () => {
    // The harness passes `t = (key) => key`, so this is an identity assertion
    // on the translation key itself.
    expect(
      buildTopbarTitle({ kind: "settingsNotifications" }, (key) => key),
    ).toBe("notificationsHistory");
  });

  it("does not title the notifications page with a colliding key", () => {
    const title = buildTopbarTitle(
      { kind: "settingsNotifications" },
      (key) => key,
    );

    expect(typeof title).toBe("string");
    // "notifications" labels AdvancedPage's push-enable toggle; the page title
    // must not read as that switch. The other two keys do not exist and must
    // not be created.
    expect(title).not.toBe("notifications");
    expect(title).not.toBe("notificationsTitle");
    expect(title).not.toBe("notificationsPageTitle");
  });
});

describe("buildTopbarRight", () => {
  it("renders no right-slot button on the notifications page", () => {
    expect(rightSlotFor({ kind: "settingsNotifications" })).toBeNull();
  });

  it("renders no hamburger button on the settings family", () => {
    // Deliberately NOT exhaustive: `mint`, `nostrRelay`, `nostrRelayNew`,
    // `evoluServer` and `evoluServerNew` are settings sub-pages that DO fall
    // through to the hamburger button today. That inconsistency is
    // pre-existing; Phase 6 does not change it, and naming it here stops a
    // future reader from assuming the list below covers every settings screen.
    const settingsFamily: Route[] = [
      { kind: "settings" },
      { kind: "settingsUnits" },
      { kind: "settingsMasterKeys" },
      { kind: "settingsNotifications" },
      { kind: "advanced" },
      { kind: "advancedAutoPayLimit" },
      { kind: "advancedPushDebug" },
      { kind: "mints" },
    ];

    for (const route of settingsFamily) {
      expect(
        rightSlotFor(route),
        `expected no right-slot button for route ${route.kind}`,
      ).toBeNull();
    }
  });
});
