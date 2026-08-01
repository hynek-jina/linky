// RED-first spec for the Notifications page (UI-01, UI-02, ALERT-01).
//
// The page is the screen the repo owner asked for: everything that arrived,
// newest first, with a per-item read toggle and a "mark all read" button on top.
// It holds NO read-state authority of its own — every mutation goes through a
// Phase 4/6 writer on `notificationRecordStore`, and tap-to-route goes through
// the shared `openNotificationRecord` helper. This file asserts that, rather
// than asserting the page's own re-implementation of it.
//
// Harness notes, all load-bearing:
//
//   * There is no DOM-testing-library dependency in this workspace and none is
//     being added. Rendering is manual `createRoot` + `act` with raw-DOM
//     assertions, exactly as `BankPaymentOfferDetailPage.test.tsx` does.
//   * The REAL `notificationRecordStore` and the REAL `notificationSurface`
//     registry are driven. Only `../platform/nativeBridge` (so the shade cancel
//     is an observable spy), `../hooks/useRouting` (so navigation is a spy) and
//     `../app/context/AppShellContexts` (so `t` is the identity function and the
//     KEY itself becomes the assertion) are mocked.
//   * Timers are faked and NEVER advanced. `mutateRecords` schedules a 250 ms
//     flush that re-reads localStorage, merges and can `emit()` a SECOND time;
//     every case here is about the FIRST, synchronous emit.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveNotificationAlert } from "../app/lib/notificationAlert";
import {
  buildNotificationRecord,
  type NotificationRecord,
  type NotificationRecordKind,
} from "../app/lib/notificationRecord";
import { notificationRecordStore } from "../app/lib/notificationRecordStore";
import {
  clearVisibleSurface,
  resolveCurrentVisibleSurface,
} from "../app/lib/notificationSurface";
import type { NavigationAction } from "../hooks/useRouting";
import type { Route } from "../types/route";
import { formatContactMessageTimestamp } from "../utils/formatting";
import { NotificationsPage } from "./NotificationsPage";
import pageSource from "./NotificationsPage.tsx?raw";

const { cancelAllMock, cancelConversationMock, navigateToMock } = vi.hoisted(
  () => ({
    cancelAllMock: vi.fn((): boolean => true),
    cancelConversationMock: vi.fn((): boolean => true),
    navigateToMock: vi.fn((action: NavigationAction): void => {
      void action;
    }),
  }),
);

vi.mock("../platform/nativeBridge", () => ({
  cancelAllNativeConversationNotifications: cancelAllMock,
  cancelNativeConversationNotification: cancelConversationMock,
}));

vi.mock("../hooks/useRouting", () => ({
  navigateTo: navigateToMock,
}));

vi.mock("../app/context/AppShellContexts", () => ({
  useAppShellCore: () => ({ lang: "en", t: (key: string) => key }),
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});

/** The single wall-clock origin for every case in this file. */
const NOW = 1_750_000_000_000;

const OWNER_KEY = "linky.notifications.v1.page-test";

const ROW_SELECTOR = '[data-guide="notification-row"]';
const TOGGLE_SELECTOR = '[data-guide="notification-row-toggle"]';
const MARK_ALL_SELECTOR = '[data-guide="notifications-mark-all-read"]';
const DOT_SELECTOR = ".notification-row-unread-dot";

const ALL_KINDS: readonly NotificationRecordKind[] = [
  "bankPaymentOffer",
  "chatMessage",
  "npubCashClaim",
  "paymentReceived",
];

const chatRoute: Route = { id: "c1", kind: "chat" };
const walletRoute: Route = { kind: "wallet" };

const makeRecord = (
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord => ({
  alertedAt: null,
  chatId: "chat-1",
  conversationKey: "pubkey-1",
  createdAtMs: NOW,
  deliveredAt: NOW,
  id: "wrap-1",
  kind: "chatMessage",
  preview: "hello",
  readAt: null,
  senderLabel: "Alice",
  ...overrides,
});

/** Seeds `count` distinct UNREAD records as `wrap-1 … wrap-<count>`. */
const seedUnread = (count: number): void => {
  for (let index = 1; index <= count; index += 1) {
    notificationRecordStore.upsert(
      makeRecord({ conversationKey: `pubkey-${index}`, id: `wrap-${index}` }),
    );
  }
};

interface RenderedPage {
  container: HTMLDivElement;
  root: Root;
}

let rendered: RenderedPage | null = null;

const renderPage = async (): Promise<HTMLDivElement> => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  // Captured BEFORE the render so a throwing component is still cleaned up.
  rendered = { container, root };

  await act(async () => {
    root.render(<NotificationsPage />);
  });

  return container;
};

const unmountPage = async (): Promise<void> => {
  if (rendered === null) return;
  const current = rendered;
  rendered = null;
  await act(async () => {
    current.root.unmount();
  });
  current.container.remove();
};

const rowIds = (container: HTMLDivElement): readonly string[] =>
  [...container.querySelectorAll(ROW_SELECTOR)].map(
    (node) => node.getAttribute("data-guide-record-id") ?? "",
  );

const rows = (container: HTMLDivElement): readonly Element[] => [
  ...container.querySelectorAll(ROW_SELECTOR),
];

const toggles = (container: HTMLDivElement): readonly HTMLButtonElement[] => [
  ...container.querySelectorAll<HTMLButtonElement>(TOGGLE_SELECTOR),
];

const requireElement = (
  container: HTMLDivElement,
  selector: string,
): Element => {
  const found = container.querySelector(selector);
  if (found === null) {
    throw new Error(`missing element: ${selector}`);
  }
  return found;
};

const requireMarkAllButton = (container: HTMLDivElement): HTMLButtonElement => {
  const found = container.querySelector<HTMLButtonElement>(MARK_ALL_SELECTOR);
  if (found === null) {
    throw new Error(`missing element: ${MARK_ALL_SELECTOR}`);
  }
  return found;
};

const storedRecord = (id: string): NotificationRecord => {
  const found = notificationRecordStore.get().find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`missing record: ${id}`);
  }
  return found;
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  notificationRecordStore.bindOwner(OWNER_KEY);
});

afterEach(async () => {
  await unmountPage();
  document.body.innerHTML = "";
  notificationRecordStore.bindOwner(null);
  // The registry is module-level state; leaking it would make test order matter.
  clearVisibleSurface({ kind: "notificationsPage" });
  clearVisibleSurface({ chatId: "c1", kind: "chat" });
  clearVisibleSurface({ chatId: "c2", kind: "chat" });
  clearVisibleSurface({ kind: "topupInvoice" });
  clearVisibleSurface({ kind: "bankPaymentOffer", offerId: "o1" });
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

describe("NotificationsPage criterion 1 — list and order", () => {
  it("renders every record newest-first regardless of arrival order", async () => {
    notificationRecordStore.upsert(
      makeRecord({ createdAtMs: NOW - 2_000, id: "oldest" }),
    );
    notificationRecordStore.upsert(
      makeRecord({ createdAtMs: NOW, id: "newest" }),
    );
    notificationRecordStore.upsert(
      makeRecord({ createdAtMs: NOW - 1_000, id: "middle" }),
    );

    const container = await renderPage();

    expect(rowIds(container)).toEqual(["newest", "middle", "oldest"]);
  });

  it("keeps the store's own id tiebreak for records sharing a createdAtMs", async () => {
    // Seeded b-then-a. `sortNotificationRecords` breaks a createdAtMs tie by id
    // ASCENDING, so the correct render is a, b. A page that re-sorted with its
    // own comparator — or that simply echoed insertion order — fails here.
    notificationRecordStore.upsert(makeRecord({ id: "b" }));
    notificationRecordStore.upsert(makeRecord({ id: "a" }));

    const container = await renderPage();

    expect(rowIds(container)).toEqual(["a", "b"]);
  });

  it("renders senderLabel and preview as separate text nodes", async () => {
    notificationRecordStore.upsert(
      makeRecord({
        id: "wrap-1",
        preview: "see you at six",
        senderLabel: "Alice",
      }),
    );

    const container = await renderPage();

    expect(
      requireElement(container, ".notification-row-sender").textContent,
    ).toBe("Alice");
    expect(
      requireElement(container, ".notification-row-preview").textContent,
    ).toBe("see you at six");
  });

  it("renders a hostile preview as TEXT and never as markup", async () => {
    // `preview` and `senderLabel` are attacker-controlled: any Nostr sender picks
    // them. React's default text escaping is the control (T-06-13).
    const hostile = "<img src=x onerror=alert(1)>";
    notificationRecordStore.upsert(
      makeRecord({ id: "wrap-1", preview: hostile }),
    );

    const container = await renderPage();

    expect(container.querySelector("img")).toBeNull();
    expect(
      requireElement(container, ".notification-row-preview").textContent,
    ).toBe(hostile);
  });

  it("converts createdAtMs to SECONDS for the relative-time cell", async () => {
    const createdAtMs = NOW - 3 * 60 * 60 * 1_000;
    notificationRecordStore.upsert(makeRecord({ createdAtMs, id: "wrap-1" }));

    const container = await renderPage();

    // The expectation calls the REAL helper with the seconds value rather than
    // hardcoding a string, which would drift with the local timezone. The point
    // is to pin the ms -> s conversion, not the format.
    expect(
      requireElement(container, ".notification-row-time").textContent,
    ).toBe(
      formatContactMessageTimestamp(Math.floor(createdAtMs / 1_000), "en"),
    );
  });

  it("does NOT pass the millisecond value to the seconds-taking formatter", async () => {
    const createdAtMs = NOW - 3 * 60 * 60 * 1_000;
    notificationRecordStore.upsert(makeRecord({ createdAtMs, id: "wrap-1" }));

    const container = await renderPage();

    // Both arguments are `number`, so passing milliseconds is a silent bug: it
    // yields a date roughly 53 000 years out with no type error at all.
    expect(
      requireElement(container, ".notification-row-time").textContent,
    ).not.toBe(formatContactMessageTimestamp(createdAtMs, "en"));
  });

  it("renders the SEND time for a record built from an inner rumor timestamp", async () => {
    // D4's one user-visible improvement, pinned. The row's time cell now shows
    // when the message was SENT — the same value the chat bubble renders through
    // `formatContactMessageTimestamp(createdAtSec)` — instead of the moment sync
    // happened to reach it. Built through the REAL `buildNotificationRecord` so
    // this exercises `resolveRecordCreatedAtMs`, not a hand-written createdAtMs.
    const eventCreatedAtSec = Math.floor((NOW - 5 * 60 * 60 * 1_000) / 1_000);
    const record = buildNotificationRecord({
      chatId: "chat-1",
      conversationKey: "pubkey-1",
      eventCreatedAtSec,
      id: "wrap-1",
      kind: "chatMessage",
      nowMs: NOW,
      preview: "sent five hours before it was ingested",
      senderLabel: "Alice",
    });
    notificationRecordStore.upsert(record);

    const container = await renderPage();
    const cell = requireElement(
      container,
      ".notification-row-time",
    ).textContent;

    const sendTime = formatContactMessageTimestamp(eventCreatedAtSec, "en");
    const receiptTime = formatContactMessageTimestamp(
      Math.floor(NOW / 1_000),
      "en",
    );

    // Non-vacuity guard. Five hours is inside the three-day clamp AND inside the
    // formatter's same-day branch, so both sides render as a time-of-day and
    // genuinely differ. If a future formatter change collapses them, WIDEN the
    // offset (staying under three days) — do not delete this half, or the
    // assertion below would pass against the pre-D4 receipt-time sort key too.
    expect(sendTime).not.toBe(receiptTime);

    expect(cell).toBe(sendTime);
    expect(cell).not.toBe(receiptTime);

    // `deliveredAt` is now the SOLE receipt-time field, and it is deliberately
    // not what the row displays.
    expect(record.deliveredAt).toBe(NOW);
  });

  it("renders exactly one icon svg per record kind", async () => {
    for (const kind of ALL_KINDS) {
      notificationRecordStore.upsert(
        makeRecord({ id: `wrap-${kind}`, kind, offerId: "offer-1" }),
      );
    }

    const container = await renderPage();
    const icons = container.querySelectorAll(".notification-row-icon");

    expect(rows(container)).toHaveLength(4);
    expect(icons).toHaveLength(4);
    for (const icon of icons) {
      expect(icon.querySelectorAll("svg")).toHaveLength(1);
    }
  });
});

describe("NotificationsPage empty state", () => {
  it("renders the localized empty state and no list", async () => {
    const container = await renderPage();

    expect(container.querySelector(".notifications-list")).toBeNull();
    expect(rows(container)).toHaveLength(0);
    // `t` is the identity function, so the KEY itself is the assertion.
    expect(requireElement(container, ".muted").textContent).toBe(
      "notificationsEmpty",
    );
  });

  it("still renders the header action, disabled", async () => {
    const container = await renderPage();
    const button = requireMarkAllButton(container);

    expect(button.textContent).toBe("notificationsMarkAllRead");
    expect(button.disabled).toBe(true);
  });
});

describe("NotificationsPage criterion 2 — single mark read", () => {
  beforeEach(() => {
    seedUnread(3);
  });

  it("marks exactly the clicked row read and leaves the others untouched", async () => {
    const container = await renderPage();

    await act(async () => {
      toggles(container)[1]?.click();
    });

    const [first, second, third] = rows(container);
    expect(second?.querySelector(DOT_SELECTOR)).toBeNull();
    expect(second?.classList.contains("is-unread")).toBe(false);
    expect(first?.querySelector(DOT_SELECTOR)).not.toBeNull();
    expect(first?.classList.contains("is-unread")).toBe(true);
    expect(third?.querySelector(DOT_SELECTOR)).not.toBeNull();
    expect(third?.classList.contains("is-unread")).toBe(true);
  });

  it("flips the toggle's aria-label from mark-read to mark-unread", async () => {
    const container = await renderPage();

    expect(toggles(container)[1]?.getAttribute("aria-label")).toBe(
      "notificationsMarkRead",
    );

    await act(async () => {
      toggles(container)[1]?.click();
    });

    expect(toggles(container)[1]?.getAttribute("aria-label")).toBe(
      "notificationsMarkUnread",
    );
  });

  it("does not fire the row's own tap — stopPropagation is load-bearing", async () => {
    const container = await renderPage();

    await act(async () => {
      toggles(container)[1]?.click();
    });

    // Without `stopPropagation` the row's onClick would also run and
    // `openNotificationRecord` would navigate away from the page the user is
    // still reading.
    expect(navigateToMock).not.toHaveBeenCalled();
  });

  it("marks a read record unread again through plan 06-01's writer", async () => {
    const container = await renderPage();

    await act(async () => {
      toggles(container)[1]?.click();
    });
    expect(storedRecord("wrap-2").readAt).not.toBeNull();

    await act(async () => {
      toggles(container)[1]?.click();
    });

    // The dot returns and the store agrees. `markUnread`'s durability across the
    // debounced flush is proven in the store's own spec and is not duplicated
    // here — timers are never advanced in this file.
    expect(rows(container)[1]?.querySelector(DOT_SELECTOR)).not.toBeNull();
    expect(storedRecord("wrap-2").readAt).toBeNull();
    expect(navigateToMock).not.toHaveBeenCalled();
  });
});

describe("NotificationsPage criterion 3 — mark all read", () => {
  it("clears every unread dot and disables itself in one click", async () => {
    seedUnread(3);
    const container = await renderPage();
    expect(container.querySelectorAll(DOT_SELECTOR)).toHaveLength(3);

    await act(async () => {
      requireMarkAllButton(container).click();
    });

    expect(container.querySelectorAll(DOT_SELECTOR)).toHaveLength(0);
    expect(requireMarkAllButton(container).disabled).toBe(true);
  });

  it("leaves the shade cancel to the store — exactly one call, and not the page's", async () => {
    seedUnread(3);
    const container = await renderPage();

    await act(async () => {
      requireMarkAllButton(container).click();
    });

    // `markAllRead` performs the cancel itself, scoped to Linky's own group. The
    // page imports no cancel wrapper at all, so a second call would mean the
    // page grew a native side effect and broke the T-04-12 audit.
    expect(cancelAllMock).toHaveBeenCalledTimes(1);
    expect(cancelConversationMock).not.toHaveBeenCalled();
  });

  it("is disabled before any click when nothing is unread", async () => {
    notificationRecordStore.upsert(makeRecord({ id: "wrap-1", readAt: NOW }));
    notificationRecordStore.upsert(makeRecord({ id: "wrap-2", readAt: NOW }));

    const container = await renderPage();

    expect(rows(container)).toHaveLength(2);
    expect(requireMarkAllButton(container).disabled).toBe(true);
    expect(cancelAllMock).not.toHaveBeenCalled();
  });
});

describe("NotificationsPage tap to open", () => {
  it("marks the record read and navigates to its chat", async () => {
    notificationRecordStore.upsert(
      makeRecord({ chatId: "chat-1", id: "wrap-1" }),
    );
    const container = await renderPage();

    await act(async () => {
      rows(container)[0]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(navigateToMock).toHaveBeenCalledTimes(1);
    expect(navigateToMock).toHaveBeenCalledWith({
      id: "chat-1",
      route: "chat",
    });
    expect(storedRecord("wrap-1").readAt).not.toBeNull();
  });

  it("marks read even when the destination resolves to null", async () => {
    // `openNotificationRecord` calls `markRead` FIRST and UNCONDITIONALLY —
    // before the navigation is even resolved. A chatMessage with a null chatId
    // is the record `resolveNotificationNavigation` maps to null; the user still
    // saw it, so leaving it unread would strand an entry they have dealt with.
    notificationRecordStore.upsert(makeRecord({ chatId: null, id: "wrap-1" }));
    const container = await renderPage();

    await act(async () => {
      rows(container)[0]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(navigateToMock).not.toHaveBeenCalled();
    expect(storedRecord("wrap-1").readAt).not.toBeNull();
  });

  it("routes an npubCashClaim to the wallet", async () => {
    notificationRecordStore.upsert(
      makeRecord({ chatId: null, id: "wrap-1", kind: "npubCashClaim" }),
    );
    const container = await renderPage();

    await act(async () => {
      rows(container)[0]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(navigateToMock).toHaveBeenCalledWith({ route: "wallet" });
  });

  it("opens the record on Enter as well as on tap", async () => {
    notificationRecordStore.upsert(
      makeRecord({ chatId: "chat-1", id: "wrap-1" }),
    );
    const container = await renderPage();

    await act(async () => {
      rows(container)[0]?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      );
    });

    expect(navigateToMock).toHaveBeenCalledTimes(1);
    expect(navigateToMock).toHaveBeenCalledWith({
      id: "chat-1",
      route: "chat",
    });
    expect(storedRecord("wrap-1").readAt).not.toBeNull();
  });
});

describe("NotificationsPage criterion 5a — surface registered while mounted", () => {
  it("wins over the chat route's own surface", async () => {
    await renderPage();

    expect(resolveCurrentVisibleSurface(chatRoute)).toEqual({
      kind: "notificationsPage",
    });
  });

  it("wins over a route that derives no surface at all", async () => {
    await renderPage();

    expect(resolveCurrentVisibleSurface(walletRoute)).toEqual({
      kind: "notificationsPage",
    });
  });
});

describe("NotificationsPage criterion 5b — suppression through the REAL decision function", () => {
  it("resolves a live record to no-post / notifications-page-open / readAt null", async () => {
    await renderPage();
    // The upsert emits, and the mounted page is subscribed, so the arrival is
    // wrapped even though this case asserts on the decision rather than the DOM.
    let stored: NotificationRecord | null = null;
    await act(async () => {
      stored = notificationRecordStore.upsert(
        makeRecord({ id: "live-1", preview: "arrived while the page is open" }),
      );
    });
    if (stored === null) {
      throw new Error("the record store returned nothing");
    }

    // Driven through the decision function, never through the page: the page
    // decides nothing, so asserting on the page would be a vacuous pass.
    const outcome = resolveNotificationAlert({
      nowMs: NOW,
      origin: "live",
      record: stored,
      route: walletRoute,
      syncEpochMs: null,
      visibleSurface: resolveCurrentVisibleSurface(walletRoute),
    });

    expect(outcome.decision).toBe("no-post");
    expect(outcome.rule).toBe("notifications-page-open");
    // Row 6 deliberately does NOT stamp the record read: the page shows it
    // unread, WITH a dot. Do not "improve" that.
    expect(outcome.readAt).toBeNull();
  });
});

describe("NotificationsPage criterion 5c — the unmount leak test", () => {
  it("restores the chat route's own surface after unmount", async () => {
    await renderPage();
    expect(resolveCurrentVisibleSurface(chatRoute)).toEqual({
      kind: "notificationsPage",
    });

    await unmountPage();

    // THE highest-value assertion in this file. A leaked registration has TWO
    // consequences, not one:
    //   1. Decision row 6 matches EVERY record, so every alert app-wide is
    //      suppressed indefinitely — no shade entry, no banner, silently.
    //   2. Decision row 5 (`record-surface-open`) becomes UNREACHABLE, because
    //      `surfaceOwnsRecord` returns false for a `notificationsPage` surface.
    //      Messages arriving in an open chat would therefore stop being marked
    //      read. That is the criterion-6 regression guard.
    expect(resolveCurrentVisibleSurface(chatRoute)).toEqual({
      chatId: "c1",
      kind: "chat",
    });
  });

  it("leaves a wallet route with no surface at all after unmount", async () => {
    await renderPage();

    await unmountPage();

    expect(resolveCurrentVisibleSurface(walletRoute)).toBeNull();
  });
});

/**
 * Comment lines are stripped before counting: several of the invariants below
 * are also EXPLAINED in the page's own source comments, and an unstripped grep
 * would read the explanation as a violation.
 */
const pageCode = (): string =>
  pageSource
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return (
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("*") &&
        !trimmed.startsWith("/*")
      );
    })
    .join("\n");

const occurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

describe("NotificationsPage single writer invariants", () => {
  it("registers and clears the visible surface from exactly one site apiece", () => {
    const source = pageCode();

    expect(occurrences(source, "registerVisibleSurface(")).toBe(1);
    expect(occurrences(source, "clearVisibleSurface(")).toBe(1);
    // The registry IS the "page is open" flag. A `visibilitychange` listener
    // would only add a race: `resolveCurrentVisibleSurface` already gates on
    // `readDocumentVisible()` BEFORE it consults the override.
    expect(occurrences(source, "visibilitychange")).toBe(0);
  });

  it("holds no read-state authority and no shade cancel of its own", () => {
    const source = pageCode();

    for (const forbidden of [
      "cancelAllNativeConversationNotifications",
      "cancelNativeConversationNotification",
      "markChatRead",
    ]) {
      expect(
        occurrences(source, forbidden),
        `${forbidden} must not appear in NotificationsPage.tsx`,
      ).toBe(0);
    }
  });

  it("injects no HTML and re-derives nothing the store already did", () => {
    const source = pageCode();

    for (const forbidden of [
      "dangerouslySetInnerHTML",
      "innerHTML",
      ".sort(",
      "slice(0,",
    ]) {
      expect(
        occurrences(source, forbidden),
        `${forbidden} must not appear in NotificationsPage.tsx`,
      ).toBe(0);
    }
  });

  it("subscribes exactly once and never through the badge's hook", () => {
    const source = pageCode();

    expect(occurrences(source, "useNotificationRecords(")).toBe(1);
    // The page derives its count from the snapshot it already holds;
    // `components/NotificationsUnreadBadge.tsx` is that hook's single call site.
    expect(occurrences(source, "useUnreadNotificationCount")).toBe(0);
  });
});
