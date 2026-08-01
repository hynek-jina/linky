// RED-first spec for the notifications unread badge (UI-03).
//
// ROADMAP criterion 4 — "badge and list share one source, so a record arriving
// while the badge is on screen updates it with no route change and no remount" —
// is a DESIGN property, not an observable. This file makes it observable the
// only way that can genuinely fail: capture the badge's DOM node, mutate the
// REAL `notificationRecordStore` inside `act`, and assert that the SAME node now
// carries different text. A badge that merely happened to be correct on the next
// full re-render would leave that captured node's textContent at its old value,
// while node identity still held.
//
// Two consequences, both load-bearing:
//
//   * There is exactly ONE render call in this file, inside `renderBadge()`.
//     A second one anywhere would let a case fake criterion 4 by re-rendering
//     the tree instead of proving the subscription.
//   * The record store is the REAL module — the subscription under test is the
//     point. Only `../platform/nativeBridge` is mocked, so `markAllRead`'s shade
//     cancel is an observable spy rather than a native no-op.
//
// Timers are faked and NEVER advanced. `mutateRecords` schedules a 250 ms flush
// which re-reads localStorage, merges and can `emit()` a SECOND time; every case
// here is about the FIRST, synchronous emit.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationRecord } from "../app/lib/notificationRecord";
import { notificationRecordStore } from "../app/lib/notificationRecordStore";
import { NotificationsUnreadBadge } from "./NotificationsUnreadBadge";
import badgeSource from "./NotificationsUnreadBadge.tsx?raw";

const { cancelAllMock, cancelConversationMock } = vi.hoisted(() => ({
  cancelAllMock: vi.fn((): boolean => true),
  cancelConversationMock: vi.fn((): boolean => true),
}));

vi.mock("../platform/nativeBridge", () => ({
  cancelAllNativeConversationNotifications: cancelAllMock,
  cancelNativeConversationNotification: cancelConversationMock,
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});

/** The single wall-clock origin for every case in this file. */
const NOW = 1_750_000_000_000;

const OWNER_KEY = "linky.notifications.v1.badge-test";

const BADGE_SELECTOR = ".notifications-unread-badge";

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

interface RenderedBadge {
  container: HTMLDivElement;
  root: Root;
}

let rendered: RenderedBadge | null = null;

/**
 * The ONLY render call in this file. Every case renders once and then drives the
 * store; nothing re-renders the tree by hand.
 */
const renderBadge = async (): Promise<HTMLDivElement> => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<NotificationsUnreadBadge t={(key) => key} />);
  });

  rendered = { container, root };
  return container;
};

/** Fails loudly instead of handing an optional chain to every assertion. */
const requireBadge = (container: HTMLDivElement): Element => {
  const found = container.querySelector(BADGE_SELECTOR);
  if (found === null) {
    throw new Error(`missing element: ${BADGE_SELECTOR}`);
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
  if (rendered !== null) {
    const current = rendered;
    await act(async () => {
      current.root.unmount();
    });
    current.container.remove();
    rendered = null;
  }
  // The store's own reset path: it clears the in-memory records and emits.
  notificationRecordStore.bindOwner(null);
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("NotificationsUnreadBadge zero state", () => {
  it("renders nothing at all when there are no records", async () => {
    const container = await renderBadge();

    expect(container.querySelector(BADGE_SELECTOR)).toBeNull();
    // A `0` pill on the settings row is a failure, not a variant.
    expect(container.textContent).toBe("");
  });

  it("renders nothing when the only record is already read", async () => {
    notificationRecordStore.upsert(makeRecord({ readAt: NOW }));

    const container = await renderBadge();

    expect(container.querySelector(BADGE_SELECTOR)).toBeNull();
    expect(container.textContent).toBe("");
  });
});

describe("NotificationsUnreadBadge renders the count", () => {
  it("renders exactly one pill carrying the unread total", async () => {
    seedUnread(3);

    const container = await renderBadge();

    expect(container.querySelectorAll(BADGE_SELECTOR)).toHaveLength(1);
    expect(requireBadge(container).textContent).toBe("3");
  });

  it("carries both the shared pill class and the modifier", async () => {
    seedUnread(3);

    const container = await renderBadge();
    const node = requireBadge(container);

    expect(node.className).toContain("settings-inline-badge");
    expect(node.className).toContain("notifications-unread-badge");
  });

  it("labels itself with the notificationsUnreadCount key", async () => {
    seedUnread(3);

    const container = await renderBadge();

    // `t` is the identity function here, so the KEY itself is the assertion —
    // this is what pins the i18n key name for plan 06-02.
    expect(requireBadge(container).getAttribute("aria-label")).toBe(
      "notificationsUnreadCount",
    );
  });

  it("carries the stable data-guide hook", async () => {
    seedUnread(3);

    const container = await renderBadge();

    expect(requireBadge(container).getAttribute("data-guide")).toBe(
      "notifications-unread-badge",
    );
  });
});

describe("NotificationsUnreadBadge criterion 4a — an arriving record updates it with no remount", () => {
  it("changes the text of the SAME DOM node when a record is upserted", async () => {
    seedUnread(1);

    const container = await renderBadge();
    const node = requireBadge(container);
    expect(node.textContent).toBe("1");

    await act(async () => {
      notificationRecordStore.upsert(
        makeRecord({ conversationKey: "pubkey-2", id: "wrap-2" }),
      );
    });

    // Identity FIRST: same node means React reconciled in place rather than
    // remounting, and there is no second render pass anywhere in this case —
    // `renderBadge()` ran once, above. That absence is what turns "no route
    // change and no remount" into a real assertion instead of a claim.
    expect(container.querySelector(BADGE_SELECTOR)).toBe(node);
    expect(node.textContent).toBe("2");
  });
});

describe("NotificationsUnreadBadge criterion 4b — mark all read zeroes it immediately", () => {
  it("removes the badge from the DOM on the same commit", async () => {
    seedUnread(3);

    const container = await renderBadge();
    const node = requireBadge(container);
    expect(node.textContent).toBe("3");

    await act(async () => {
      notificationRecordStore.markAllRead(NOW);
    });

    // No navigation, no second render pass: the badge is simply gone.
    expect(container.querySelector(BADGE_SELECTOR)).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("leaves the shade cancel to the store, not to the badge", async () => {
    seedUnread(3);

    const container = await renderBadge();
    requireBadge(container);

    await act(async () => {
      notificationRecordStore.markAllRead(NOW);
    });

    // Exactly once — the badge imports no cancel wrapper at all, so a second
    // call would mean a read-only component grew a native side effect.
    expect(cancelAllMock).toHaveBeenCalledTimes(1);
    expect(cancelConversationMock).not.toHaveBeenCalled();
  });
});

describe("NotificationsUnreadBadge criterion 4c — one mark-read decrements by exactly one", () => {
  it("goes from 3 to the literal 2 on the same node", async () => {
    seedUnread(3);

    const container = await renderBadge();
    const node = requireBadge(container);
    expect(node.textContent).toBe("3");

    await act(async () => {
      notificationRecordStore.markRead("wrap-2", NOW);
    });

    // "1" (marked everything) and an unchanged "3" (never subscribed) are both
    // failures, and this assertion distinguishes them.
    expect(node.textContent).toBe("2");
    expect(container.querySelector(BADGE_SELECTOR)).toBe(node);
  });
});

describe("NotificationsUnreadBadge dismissal does not imply read", () => {
  it("keeps the count at 3 after a record is dismissed", async () => {
    seedUnread(3);

    const container = await renderBadge();
    const node = requireBadge(container);

    await act(async () => {
      notificationRecordStore.markDismissed("wrap-2", NOW);
    });

    // Unread is exactly `readAt === null`; clearing the shade is not reading.
    expect(node.textContent).toBe("3");
    expect(container.querySelector(BADGE_SELECTOR)).toBe(node);
  });
});

/**
 * The walk below uses Vite's `?raw` glob rather than `node:fs`: the web-app
 * tsconfig has no Node types (`types: ["vite/client"]`), so a `node:fs` import
 * does not typecheck. `src/i18n/translations.test.ts` and
 * `src/app/lib/notify.test.ts` read source text the same way.
 */
const RAW_SOURCE_MODULES: Record<string, unknown> = import.meta.glob(
  "../**/*.{ts,tsx}",
  { eager: true, import: "default", query: "?raw" },
);

/**
 * Vite normalises glob keys to the SHORTEST relative path from the importing
 * file, so they are rebased onto `src/` here. This spec's own directory is
 * asserted in the case below, so moving the file breaks the test loudly instead
 * of silently rebasing onto nothing.
 */
const SPEC_DIR_SEGMENTS = ["components"];

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
 * Comment lines are stripped first: a bare line count would read every file that
 * merely EXPLAINS the invariant as a call site.
 */
const codeLines = (path: string, value: unknown): readonly string[] => {
  if (typeof value !== "string") {
    throw new Error(`?raw import produced no text for ${path}`);
  }
  return value.split("\n").filter((line) => {
    const trimmed = line.trim();
    return (
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("*") &&
      !trimmed.startsWith("/*")
    );
  });
};

const badgeCode = (): string => codeLines("badge", badgeSource).join("\n");

const occurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

describe("NotificationsUnreadBadge single call site", () => {
  it("calls useUnreadNotificationCount exactly once and writes nothing", () => {
    const source = badgeCode();

    expect(occurrences(source, "useUnreadNotificationCount(")).toBe(1);

    // The badge READS. It never writes read state and never registers a visible
    // surface — the latter would set the module-level override that suppresses
    // every subsequent alert.
    for (const forbidden of [
      "cancelAllNativeConversationNotifications",
      "cancelNativeConversationNotification",
      "markAllRead",
      "markRead",
      "registerVisibleSurface",
    ]) {
      expect(
        occurrences(source, forbidden),
        `${forbidden} must not appear in NotificationsUnreadBadge.tsx`,
      ).toBe(0);
    }
  });

  it("is the ONLY module in src/ that calls useUnreadNotificationCount", () => {
    expect(
      import.meta.url.endsWith("/components/NotificationsUnreadBadge.test.tsx"),
    ).toBe(true);

    const counts = new Map<string, number>();
    for (const [key, value] of Object.entries(RAW_SOURCE_MODULES)) {
      const path = toSrcRelativePath(key);
      if (isSpecPath(path)) {
        continue;
      }
      counts.set(
        path,
        codeLines(path, value).filter((line) =>
          line.includes("useUnreadNotificationCount"),
        ).length,
      );
    }

    // Guards the walk itself against going vacuous.
    expect(counts.size).toBeGreaterThan(50);
    expect(counts.has("app/lib/notificationRecordStore.ts")).toBe(true);

    // The definition module may name it as often as it likes.
    expect(
      counts.get("app/lib/notificationRecordStore.ts"),
    ).toBeGreaterThanOrEqual(1);

    // The import line plus the ONE call line.
    expect(counts.get("components/NotificationsUnreadBadge.tsx")).toBe(2);

    const offenders = [...counts.entries()]
      .filter(
        ([path, count]) =>
          count > 0 &&
          path !== "app/lib/notificationRecordStore.ts" &&
          path !== "components/NotificationsUnreadBadge.tsx",
      )
      .map(([path, count]) => `${path} (${count})`);

    expect(
      offenders,
      `useUnreadNotificationCount may only be called from components/NotificationsUnreadBadge.tsx; found ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
