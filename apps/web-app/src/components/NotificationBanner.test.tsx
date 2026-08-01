// RED-first spec for the in-app notification banner surface (BANNER-01).
//
// Criteria 1, 2, 3, 4a, 4b and 4c are proven HERE, through a really rendered
// component, using the repo's manual `createRoot` + `act` harness
// (BankPaymentOfferBanner.test.tsx:1-12,45-69). No React DOM testing library is
// installed in this workspace and none may be added.
//
// The queue module is the REAL one — its behaviour end to end is the thing under
// test — and only its downstream writers are mocked, so `markDismissed`,
// `openNotificationRecord` and `navigateTo` are observable as spies without ever
// touching localStorage or the hash router.
//
// Two properties need a word of explanation:
//
//   * The dwell clock lives in the component and nowhere else. The "fires
//     fractionally early" case invokes the pending PointerEvent-free timer
//     callback by hand, because fake timers fire EXACTLY and only a hand-fired
//     callback can reproduce a real `window.setTimeout` overshooting downwards.
//   * A partial drag is not a tap: any pointer movement past the tap slop kills
//     the tap path even when it never reaches the swipe threshold.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BANNER_ANCHORED_DWELL_MS,
  BANNER_DWELL_MS,
  BANNER_TAP_ACCEPT_DELAY_MS,
  clearNotificationBanners,
  enqueueNotificationBanner,
  notificationBannerStore,
} from "../app/lib/notificationBannerQueue";
import type { NotificationRecord } from "../app/lib/notificationRecord";
import { notificationRecordStore } from "../app/lib/notificationRecordStore";
import type { NotificationOpenDeps } from "../app/lib/notificationTapRoute";
import { NotificationBanner } from "./NotificationBanner";

const { markDismissedMock, navigateToMock, openNotificationRecordMock } =
  vi.hoisted(() => ({
    markDismissedMock: vi.fn<(id: string, atMs: number) => void>(),
    navigateToMock: vi.fn(),
    openNotificationRecordMock:
      vi.fn<(record: NotificationRecord, deps: NotificationOpenDeps) => void>(),
  }));

vi.mock("../app/lib/notificationRecordStore", () => ({
  notificationRecordStore: { markDismissed: markDismissedMock },
}));

vi.mock("../app/lib/notificationTapRoute", () => ({
  openNotificationRecord: openNotificationRecordMock,
}));

vi.mock("../hooks/useRouting", () => ({ navigateTo: navigateToMock }));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});

/** The single wall-clock origin for every case in this file. */
const T = 1_750_000_000_000;

const makeRecord = (
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord => ({
  alertedAt: null,
  chatId: "chat-alice",
  conversationKey: "pubkey-alice",
  createdAtMs: T,
  deliveredAt: T,
  id: "wrap-1",
  kind: "chatMessage",
  preview: "hello there",
  readAt: null,
  senderLabel: "Alice",
  ...overrides,
});

interface RenderedBanner {
  container: HTMLDivElement;
  root: Root;
}

let rendered: RenderedBanner | null = null;

const spyOnSetTimeout = () => vi.spyOn(window, "setTimeout");
const spyOnClearTimeout = () => vi.spyOn(window, "clearTimeout");
let setTimeoutSpy: ReturnType<typeof spyOnSetTimeout> | null = null;
let clearTimeoutSpy: ReturnType<typeof spyOnClearTimeout> | null = null;

const renderBanner = async (
  translate: (key: string) => string = (key) => key,
): Promise<RenderedBanner> => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<NotificationBanner t={translate} />);
  });

  const next = { container, root };
  rendered = next;
  return next;
};

const enqueue = async (record: NotificationRecord): Promise<void> => {
  await act(async () => {
    enqueueNotificationBanner(record, Date.now());
  });
};

const advance = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const requireElement = (root: ParentNode, selector: string): Element => {
  const found = root.querySelector(selector);
  if (found === null) throw new Error(`missing element: ${selector}`);
  return found;
};

const bannerCount = (container: HTMLDivElement): number =>
  container.querySelectorAll(".notification-banner").length;

const dispatchPointer = async (
  target: Element,
  type: string,
  init: PointerEventInit,
): Promise<void> => {
  await act(async () => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "touch",
        ...init,
      }),
    );
  });
};

const pointerInit = (
  x: number,
  y: number,
  pointerType = "touch",
): PointerEventInit => ({ clientX: x, clientY: y, pointerType });

const pressCard = (card: Element, x = 200, y = 100, pointerType = "touch") =>
  dispatchPointer(card, "pointerdown", pointerInit(x, y, pointerType));

const moveCard = (card: Element, x: number, y: number, pointerType = "touch") =>
  dispatchPointer(card, "pointermove", pointerInit(x, y, pointerType));

const releaseCard = (card: Element, x = 200, y = 100, pointerType = "touch") =>
  dispatchPointer(card, "pointerup", pointerInit(x, y, pointerType));

interface ArmedTimer {
  callback: () => void;
  id: number;
}

/**
 * The most recent full-dwell timeout the component armed, with the id needed to
 * consume it — a real early fire consumes the timer, so the test must too.
 */
const lastArmedDwellTimer = (): ArmedTimer => {
  if (setTimeoutSpy === null)
    throw new Error("setTimeout spy is not installed");
  for (
    let index = setTimeoutSpy.mock.calls.length - 1;
    index >= 0;
    index -= 1
  ) {
    const call = setTimeoutSpy.mock.calls[index];
    const handler = call[0];
    const result = setTimeoutSpy.mock.results[index];
    if (call[1] !== BANNER_ANCHORED_DWELL_MS) continue;
    if (typeof handler !== "function" || result.type !== "return") continue;
    return {
      callback: () => {
        handler();
      },
      id: result.value,
    };
  }
  throw new Error("the component armed no dwell timeout");
};

const armedDwellTimerIds = (): number[] => {
  if (setTimeoutSpy === null)
    throw new Error("setTimeout spy is not installed");
  const ids: number[] = [];
  setTimeoutSpy.mock.calls.forEach((call, index) => {
    const result = setTimeoutSpy?.mock.results[index];
    if (call[1] !== BANNER_ANCHORED_DWELL_MS) return;
    if (result === undefined || result.type !== "return") return;
    ids.push(result.value);
  });
  return ids;
};

/**
 * Vitest's fake `setTimeout` hands back a Node timer HANDLE rather than the
 * numeric id the DOM lib types promise, so these are compared by identity and
 * never narrowed with a `typeof id === "number"` filter — that filter silently
 * matches nothing and makes the accumulation assertion vacuous.
 */
const clearedTimerIds = (): number[] => {
  if (clearTimeoutSpy === null) throw new Error("clearTimeout spy is missing");
  const ids: number[] = [];
  for (const call of clearTimeoutSpy.mock.calls) {
    const id = call[0];
    if (id !== undefined) ids.push(id);
  }
  return ids;
};

beforeEach(() => {
  vi.clearAllMocks();
  clearNotificationBanners();
  vi.useFakeTimers();
  vi.setSystemTime(T);
  setTimeoutSpy = spyOnSetTimeout();
  clearTimeoutSpy = spyOnClearTimeout();
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
  setTimeoutSpy?.mockRestore();
  clearTimeoutSpy?.mockRestore();
  setTimeoutSpy = null;
  clearTimeoutSpy = null;
  clearNotificationBanners();
  vi.useRealTimers();
});

describe("NotificationBanner environment", () => {
  it("has the jsdom PointerEvent constructor the gesture cases need", () => {
    expect(typeof PointerEvent).toBe("function");
    const probe = new PointerEvent("pointerdown", { clientX: 7, clientY: 9 });
    expect(probe.clientX).toBe(7);
    expect(probe.clientY).toBe(9);
  });
});

describe("NotificationBanner render", () => {
  it("renders no container at all while the queue is empty", async () => {
    const { container } = await renderBanner();

    expect(
      container.querySelector(".notification-banner-container"),
    ).toBeNull();
    expect(bannerCount(container)).toBe(0);
  });

  it("renders the sender and the preview as two separate elements", async () => {
    const { container } = await renderBanner();
    await enqueue(makeRecord());

    expect(bannerCount(container)).toBe(1);
    const sender = requireElement(container, ".notification-banner-sender");
    const preview = requireElement(container, ".notification-banner-preview");
    expect(sender).not.toBe(preview);
    expect(sender.textContent).toBe("Alice");
    expect(preview.textContent).toBe("hello there");
  });

  it("renders the preview verbatim, adding no second ellipsis", async () => {
    const alreadyClamped = `${"a".repeat(79)}…`;
    const { container } = await renderBanner();
    await enqueue(makeRecord({ preview: alreadyClamped }));

    const preview = requireElement(container, ".notification-banner-preview");
    expect(preview.textContent).toBe(alreadyClamped);
    expect(preview.textContent?.endsWith("……")).toBe(false);
  });

  it("announces politely and never interrupts a screen reader", async () => {
    const { container } = await renderBanner();
    await enqueue(makeRecord());

    const banners = requireElement(container, ".notification-banner-container");
    expect(banners.getAttribute("role")).toBe("status");
    expect(banners.getAttribute("aria-live")).toBe("polite");
    expect(banners.getAttribute("role")).not.toBe("alert");
    expect(banners.getAttribute("aria-live")).not.toBe("assertive");
    expect(banners.getAttribute("aria-label")).toBe("notificationBannerLabel");
  });

  it("renders a hostile preview as literal text, never as markup", async () => {
    const hostile = "<img src=x onerror=alert(1)>";
    const { container } = await renderBanner();
    await enqueue(makeRecord({ preview: hostile }));

    const preview = requireElement(container, ".notification-banner-preview");
    expect(preview.textContent).toBe(hostile);
    expect(container.querySelector("img")).toBeNull();
  });

  it("labels the card and the close button from the i18n keys", async () => {
    const { container } = await renderBanner();
    await enqueue(makeRecord());

    const card = requireElement(container, ".notification-banner-card");
    const close = requireElement(container, ".notification-banner-close");
    expect(card.getAttribute("aria-label")).toBe("notificationBannerOpen");
    expect(close.getAttribute("aria-label")).toBe("notificationBannerDismiss");
    expect(card.getAttribute("type")).toBe("button");
    expect(close.getAttribute("type")).toBe("button");
  });
});

describe("NotificationBanner collapse", () => {
  it("folds five messages from one sender into one card reading +4", async () => {
    const { container } = await renderBanner();
    for (let index = 1; index <= 5; index += 1) {
      await enqueue(makeRecord({ id: `wrap-${index}` }));
    }

    expect(bannerCount(container)).toBe(1);
    const badge = requireElement(container, ".notification-banner-count");
    expect(badge.textContent).toBe("+4");
  });

  it("renders no badge at all for a single message", async () => {
    const { container } = await renderBanner();
    await enqueue(makeRecord());

    expect(container.querySelector(".notification-banner-count")).toBeNull();
  });

  it("substitutes the count into the badge aria-label", async () => {
    const { container } = await renderBanner((key) =>
      key === "notificationBannerMore" ? "+{count} more" : key,
    );
    for (let index = 1; index <= 5; index += 1) {
      await enqueue(makeRecord({ id: `wrap-${index}` }));
    }

    const badge = requireElement(container, ".notification-banner-count");
    expect(badge.getAttribute("aria-label")).toBe("+4 more");
  });
});

describe("NotificationBanner dwell", () => {
  it("keeps the card for a full 10 000 ms and removes it at the boundary", async () => {
    const { container } = await renderBanner();
    await enqueue(makeRecord());

    // The armed deadline is BANNER_ANCHORED_DWELL_MS — BANNER_DWELL_MS plus the
    // commit-to-paint margin — because the roadmap criterion is a FLOOR rather
    // than a target. Both ends of that floor are asserted here.
    expect(BANNER_ANCHORED_DWELL_MS).toBeGreaterThanOrEqual(BANNER_DWELL_MS);
    await advance(BANNER_DWELL_MS);
    expect(bannerCount(container)).toBe(1);

    await advance(BANNER_ANCHORED_DWELL_MS - BANNER_DWELL_MS - 1);
    expect(bannerCount(container)).toBe(1);

    await advance(1);
    expect(bannerCount(container)).toBe(0);
    expect(
      container.querySelector(".notification-banner-container"),
    ).toBeNull();
  });

  /*
   * The plan 05-08 emulator gate measured the real on-screen dwell of a live gift
   * wrap's banner at 9 646 ms, against a >= 10 000 ms criterion. `notify.ts`
   * enqueues synchronously while decrypting the wrap, but the card only reaches
   * the DOM one React commit later — 125-394 ms later on the Pixel 6 emulator. If
   * the dwell is armed at the enqueue instant, the VISIBLE dwell is
   * `BANNER_DWELL_MS - commitLatency` and can never reach 10 000 ms on a real
   * device. So the component anchors the clock from a layout effect instead.
   *
   * The 500 ms here stands in for that commit latency: fake timers freeze
   * `Date.now()`, so an enqueue instant 500 ms in the past is exactly the shape of
   * a card that took 500 ms to reach the screen.
   */
  it("measures the dwell from the COMMIT, never from the enqueue instant", async () => {
    const { container } = await renderBanner();
    const commitLatencyMs = 500;
    await act(async () => {
      enqueueNotificationBanner(makeRecord(), Date.now() - commitLatencyMs);
    });

    // Armed at the enqueue instant this would already be gone by now.
    await advance(BANNER_ANCHORED_DWELL_MS - 1);
    expect(bannerCount(container)).toBe(1);

    await advance(1);
    expect(bannerCount(container)).toBe(0);
  });

  it("refuses a tap for the full acceptance delay measured from the commit", async () => {
    const { container } = await renderBanner();
    await act(async () => {
      enqueueNotificationBanner(makeRecord(), Date.now() - 500);
    });
    const card = requireElement(container, ".notification-banner-card");

    await advance(BANNER_TAP_ACCEPT_DELAY_MS - 1);
    await pressCard(card);
    await releaseCard(card);
    expect(openNotificationRecordMock).not.toHaveBeenCalled();

    await advance(1);
    await pressCard(card);
    await releaseCard(card);
    expect(openNotificationRecordMock).toHaveBeenCalledTimes(1);
  });

  it("re-arms itself when its own timeout fires fractionally early", async () => {
    const { container } = await renderBanner();
    await enqueue(makeRecord());

    await advance(BANNER_ANCHORED_DWELL_MS - 1);
    expect(bannerCount(container)).toBe(1);

    // A real early fire CONSUMES the timer, so the test consumes it too before
    // hand-firing the callback at `expiresAtMs - 1`.
    const pending = lastArmedDwellTimer();
    window.clearTimeout(pending.id);
    await act(async () => {
      pending.callback();
    });

    // The reducer expired nothing, returned the same snapshot and skipped the
    // emit, so the effect did NOT re-run. Only a self-healing callback survives.
    expect(bannerCount(container)).toBe(1);

    await advance(2);
    expect(bannerCount(container)).toBe(0);
  });

  it("keeps exactly one live timeout across three sequential enqueues", async () => {
    await renderBanner();
    await enqueue(makeRecord({ conversationKey: "pubkey-alice", id: "w-1" }));
    await enqueue(makeRecord({ conversationKey: "pubkey-bob", id: "w-2" }));
    await enqueue(makeRecord({ conversationKey: "pubkey-carol", id: "w-3" }));

    const armed = armedDwellTimerIds();
    const cleared = clearedTimerIds();
    const live = armed.filter((id) => !cleared.includes(id));
    expect(armed.length).toBeGreaterThanOrEqual(3);
    // Non-vacuous: the cleanup really did clear the superseded handles.
    expect(cleared.length).toBeGreaterThanOrEqual(2);
    expect(live).toHaveLength(1);
  });
});

describe("NotificationBanner queue", () => {
  const three = async (): Promise<void> => {
    await enqueue(makeRecord({ conversationKey: "pubkey-alice", id: "w-1" }));
    await enqueue(makeRecord({ conversationKey: "pubkey-bob", id: "w-2" }));
    await enqueue(makeRecord({ conversationKey: "pubkey-carol", id: "w-3" }));
  };

  it("shows only two cards for three senders", async () => {
    const { container } = await renderBanner();
    await three();

    expect(bannerCount(container)).toBe(2);
  });

  it("promotes the third sender the moment a slot frees", async () => {
    const { container } = await renderBanner();
    await three();

    await advance(BANNER_ANCHORED_DWELL_MS);
    expect(bannerCount(container)).toBe(1);
    const promoted = requireElement(container, ".notification-banner");
    expect(promoted.getAttribute("data-collapse-key")).toBe("pubkey-carol");
  });

  it("gives the promoted card a full dwell of its own", async () => {
    const { container } = await renderBanner();
    await three();
    await advance(BANNER_ANCHORED_DWELL_MS);

    await advance(BANNER_ANCHORED_DWELL_MS - 1);
    expect(bannerCount(container)).toBe(1);

    await advance(1);
    expect(bannerCount(container)).toBe(0);
  });

  /*
   * A promoted card reaches the DOM one commit AFTER promotion, exactly like a
   * freshly shown one, so `promoteQueue` clears `dwellAnchoredAtMs` and the
   * layout effect re-anchors it. Asserted on the store rather than on elapsed
   * time: fake timers freeze `Date.now()`, so the promote instant and the commit
   * instant coincide here and no timing assertion could tell the two apart.
   */
  it("re-anchors the promoted card's dwell onto its own commit", async () => {
    await renderBanner();
    await three();

    const queuedBeforePromotion = notificationBannerStore.get().queued;
    expect(queuedBeforePromotion).toHaveLength(1);
    expect(queuedBeforePromotion[0].dwellAnchoredAtMs).toBeNull();

    await advance(BANNER_ANCHORED_DWELL_MS);

    const visible = notificationBannerStore.get().visible;
    expect(visible).toHaveLength(1);
    expect(visible[0].collapseKey).toBe("pubkey-carol");
    expect(visible[0].dwellAnchoredAtMs).not.toBeNull();
    expect(visible[0].expiresAtMs).toBe(
      (visible[0].dwellAnchoredAtMs ?? 0) + BANNER_ANCHORED_DWELL_MS,
    );
  });
});

describe("NotificationBanner pause", () => {
  it("holds the card for as long as the pointer is down", async () => {
    const { container } = await renderBanner();
    await enqueue(makeRecord());
    const card = requireElement(container, ".notification-banner-card");

    await pressCard(card);
    await advance(30_000);
    expect(bannerCount(container)).toBe(1);

    await releaseCard(card);
    await advance(BANNER_ANCHORED_DWELL_MS - 1);
    expect(bannerCount(container)).toBe(1);

    await advance(1);
    expect(bannerCount(container)).toBe(0);
  });

  it("treats a long hold as a hold, never as a tap, on release", async () => {
    const { container } = await renderBanner();
    await enqueue(makeRecord());
    const card = requireElement(container, ".notification-banner-card");

    // Releasing a 30 s hold is well past the 400 ms acceptance delay, so
    // without a press ceiling this release would navigate the reader away from
    // whatever they were holding the card to finish reading.
    await pressCard(card);
    await advance(30_000);
    await releaseCard(card);

    expect(openNotificationRecordMock).not.toHaveBeenCalled();
    expect(navigateToMock).not.toHaveBeenCalled();
    expect(markDismissedMock).not.toHaveBeenCalled();
    expect(bannerCount(container)).toBe(1);
  });

  it("pauses on hover and resumes the remainder on leave", async () => {
    const { container } = await renderBanner();
    await enqueue(makeRecord());
    const card = requireElement(container, ".notification-banner-card");

    // React synthesises onPointerEnter / onPointerLeave from pointerover /
    // pointerout, so those are the native events a hover test must dispatch.
    await dispatchPointer(card, "pointerover", { relatedTarget: null });
    await advance(30_000);
    expect(bannerCount(container)).toBe(1);

    await dispatchPointer(card, "pointerout", { relatedTarget: null });
    await advance(BANNER_ANCHORED_DWELL_MS - 1);
    expect(bannerCount(container)).toBe(1);

    await advance(1);
    expect(bannerCount(container)).toBe(0);
  });
});

describe("NotificationBanner tap", () => {
  it("refuses a tap that lands the instant the card appears", async () => {
    const { container } = await renderBanner();
    await enqueue(makeRecord());
    const card = requireElement(container, ".notification-banner-card");

    await pressCard(card);
    await releaseCard(card);

    expect(openNotificationRecordMock).not.toHaveBeenCalled();
    expect(bannerCount(container)).toBe(1);
  });

  it("still refuses a tap one millisecond inside the acceptance delay", async () => {
    const { container } = await renderBanner();
    await enqueue(makeRecord());
    const card = requireElement(container, ".notification-banner-card");

    await advance(BANNER_TAP_ACCEPT_DELAY_MS - 1);
    await pressCard(card);
    await releaseCard(card);

    expect(openNotificationRecordMock).not.toHaveBeenCalled();
    expect(bannerCount(container)).toBe(1);
  });

  it("opens the record once the acceptance delay has elapsed", async () => {
    const record = makeRecord();
    const { container } = await renderBanner();
    await enqueue(record);
    const card = requireElement(container, ".notification-banner-card");

    await advance(BANNER_TAP_ACCEPT_DELAY_MS);
    await pressCard(card);
    await releaseCard(card);

    expect(openNotificationRecordMock).toHaveBeenCalledTimes(1);
    expect(openNotificationRecordMock).toHaveBeenCalledWith(record, {
      navigate: navigateToMock,
      nowMs: T + BANNER_TAP_ACCEPT_DELAY_MS,
    });
    expect(markDismissedMock).not.toHaveBeenCalled();
    expect(bannerCount(container)).toBe(0);
  });

  it("opens the NEWEST folded record, and only that one", async () => {
    const newest = makeRecord({ id: "wrap-2", preview: "second" });
    const { container } = await renderBanner();
    await enqueue(makeRecord({ id: "wrap-1" }));
    await enqueue(newest);
    const card = requireElement(container, ".notification-banner-card");

    await advance(BANNER_TAP_ACCEPT_DELAY_MS);
    await pressCard(card);
    await releaseCard(card);

    expect(openNotificationRecordMock).toHaveBeenCalledTimes(1);
    const call = openNotificationRecordMock.mock.calls[0];
    expect(call[0]).toBe(newest);
    expect(markDismissedMock).not.toHaveBeenCalled();
  });

  it("passes no scrollToMessage in the deps object", async () => {
    const { container } = await renderBanner();
    await enqueue(makeRecord());
    const card = requireElement(container, ".notification-banner-card");

    await advance(BANNER_TAP_ACCEPT_DELAY_MS);
    await pressCard(card);
    await releaseCard(card);

    const deps = openNotificationRecordMock.mock.calls[0][1];
    expect("scrollToMessage" in deps).toBe(false);
    expect(deps.navigate).toBe(navigateToMock);
  });
});

describe("NotificationBanner dismiss", () => {
  it("marks the record dismissed and never opens it", async () => {
    const { container } = await renderBanner();
    await enqueue(makeRecord());
    const close = requireElement(container, ".notification-banner-close");

    await act(async () => {
      close.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(markDismissedMock).toHaveBeenCalledTimes(1);
    expect(markDismissedMock).toHaveBeenCalledWith("wrap-1", T);
    expect(openNotificationRecordMock).not.toHaveBeenCalled();
    expect(navigateToMock).not.toHaveBeenCalled();
    expect(bannerCount(container)).toBe(0);
  });

  it("marks every folded record dismissed, one call per id", async () => {
    const { container } = await renderBanner();
    await enqueue(makeRecord({ id: "wrap-1" }));
    await enqueue(makeRecord({ id: "wrap-2" }));
    await enqueue(makeRecord({ id: "wrap-3" }));
    const close = requireElement(container, ".notification-banner-close");

    await act(async () => {
      close.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(markDismissedMock).toHaveBeenCalledTimes(3);
    expect(markDismissedMock.mock.calls.map((call) => call[0])).toEqual([
      "wrap-1",
      "wrap-2",
      "wrap-3",
    ]);
  });

  it("cannot reach read state at all: the store exposes only markDismissed", async () => {
    const { container } = await renderBanner();
    await enqueue(makeRecord());
    const close = requireElement(container, ".notification-banner-close");

    await act(async () => {
      close.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(Object.keys(notificationRecordStore)).toEqual(["markDismissed"]);
    expect(openNotificationRecordMock).not.toHaveBeenCalled();
  });
});

describe("NotificationBanner swipe", () => {
  const renderOne = async (): Promise<{
    card: Element;
    container: HTMLDivElement;
  }> => {
    const { container } = await renderBanner();
    await enqueue(makeRecord());
    return {
      card: requireElement(container, ".notification-banner-card"),
      container,
    };
  };

  it("dismisses on a rightward swipe", async () => {
    const { card, container } = await renderOne();

    await pressCard(card, 200, 100);
    await moveCard(card, 260, 100);

    expect(bannerCount(container)).toBe(0);
    expect(markDismissedMock).toHaveBeenCalledWith("wrap-1", T);
  });

  it("dismisses on a leftward swipe too", async () => {
    const { card, container } = await renderOne();

    await pressCard(card, 200, 100);
    await moveCard(card, 140, 100);

    expect(bannerCount(container)).toBe(0);
    expect(markDismissedMock).toHaveBeenCalledTimes(1);
  });

  it("dismisses on an upward swipe, the Android heads-up gesture", async () => {
    const { card, container } = await renderOne();

    await pressCard(card, 200, 100);
    await moveCard(card, 200, 40);

    expect(bannerCount(container)).toBe(0);
    expect(markDismissedMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a drag below the threshold, and does not treat it as a tap", async () => {
    const { card, container } = await renderOne();

    await advance(BANNER_TAP_ACCEPT_DELAY_MS);
    await pressCard(card, 200, 100);
    await moveCard(card, 230, 100);
    await releaseCard(card, 230, 100);

    expect(bannerCount(container)).toBe(1);
    expect(markDismissedMock).not.toHaveBeenCalled();
    expect(openNotificationRecordMock).not.toHaveBeenCalled();
  });

  it("ignores a diagonal drag outside the perpendicular tolerance", async () => {
    const { card, container } = await renderOne();

    await pressCard(card, 200, 100);
    await moveCard(card, 260, 150);

    expect(bannerCount(container)).toBe(1);
    expect(markDismissedMock).not.toHaveBeenCalled();
  });

  it("dismisses a mouse drag too: the touch-only guard is not copied", async () => {
    const { card, container } = await renderOne();

    await pressCard(card, 200, 100, "mouse");
    await moveCard(card, 260, 100, "mouse");

    expect(bannerCount(container)).toBe(0);
    expect(markDismissedMock).toHaveBeenCalledTimes(1);
  });
});
