import { describe, expect, it } from "vitest";
import {
  alignMainSwipeToTarget,
  clampMainSwipeLeft,
  getMainSwipeGestureDecision,
  isAllowedMainSwipeDrag,
  shouldDisableWalletReturnAnimation,
} from "./useMainSwipeNavigation";

interface MockMainSwipeElement {
  clientWidth: number;
  scrollToCalls: Array<{ behavior: ScrollBehavior; left: number }>;
  scrollLeft: number;
  scrollTo: (options: { behavior: ScrollBehavior; left: number }) => void;
}

const createElement = (
  clientWidth: number,
  scrollLeft: number,
): MockMainSwipeElement => {
  const scrollToCalls: Array<{ behavior: ScrollBehavior; left: number }> = [];

  return {
    clientWidth,
    scrollLeft,
    scrollToCalls,
    scrollTo: (options) => {
      scrollToCalls.push(options);
    },
  };
};

describe("alignMainSwipeToTarget", () => {
  it("snaps contacts back to the exact left edge", () => {
    const element = createElement(390, 0.4);

    alignMainSwipeToTarget(element, "contacts");

    expect(element.scrollToCalls).toEqual([
      {
        behavior: "auto",
        left: 0,
      },
    ]);
  });

  it("snaps wallet back to the exact right edge", () => {
    const element = createElement(390, 389.4);

    alignMainSwipeToTarget(element, "wallet");

    expect(element.scrollToCalls).toEqual([
      {
        behavior: "auto",
        left: 390,
      },
    ]);
  });

  it("does nothing when already aligned", () => {
    const element = createElement(390, 390);

    alignMainSwipeToTarget(element, "wallet");

    expect(element.scrollToCalls).toEqual([]);
  });
});

describe("shouldDisableWalletReturnAnimation", () => {
  it("allows the wallet slide only when moving from contacts", () => {
    expect(shouldDisableWalletReturnAnimation("wallet", "contacts")).toBe(
      false,
    );
  });

  it("disables the wallet slide when returning from another page", () => {
    expect(shouldDisableWalletReturnAnimation("wallet", "cashuTokens")).toBe(
      true,
    );
    expect(shouldDisableWalletReturnAnimation("wallet", "profile")).toBe(true);
    expect(shouldDisableWalletReturnAnimation("wallet", "wallet")).toBe(true);
  });

  it("does not affect contacts alignment", () => {
    expect(shouldDisableWalletReturnAnimation("contacts", "wallet")).toBe(
      false,
    );
  });
});

describe("isAllowedMainSwipeDrag", () => {
  it("only allows contacts to drag toward wallet", () => {
    expect(isAllowedMainSwipeDrag("contacts", -24)).toBe(true);
    expect(isAllowedMainSwipeDrag("contacts", 24)).toBe(false);
  });

  it("only allows wallet to drag back toward contacts", () => {
    expect(isAllowedMainSwipeDrag("wallet", 24)).toBe(true);
    expect(isAllowedMainSwipeDrag("wallet", -24)).toBe(false);
  });
});

describe("getMainSwipeGestureDecision", () => {
  it("waits through small diagonal noise before locking contacts swipe", () => {
    expect(getMainSwipeGestureDecision("contacts", -8, 7)).toBe("wait");
    expect(getMainSwipeGestureDecision("contacts", -18, 12)).toBe("lock");
  });

  it("does not cancel a touch sequence for early vertical movement", () => {
    expect(getMainSwipeGestureDecision("wallet", 10, 18)).toBe("wait");
  });

  it("does not cancel a touch sequence for an early opposite-direction nudge", () => {
    expect(getMainSwipeGestureDecision("contacts", 18, 2)).toBe("wait");
    expect(getMainSwipeGestureDecision("wallet", -18, 2)).toBe("wait");
  });
});

describe("clampMainSwipeLeft", () => {
  it("clamps past the contacts edge", () => {
    expect(clampMainSwipeLeft(-32, 390)).toBe(0);
  });

  it("clamps past the wallet edge", () => {
    expect(clampMainSwipeLeft(512, 390)).toBe(390);
  });

  it("preserves values inside the swipe range", () => {
    expect(clampMainSwipeLeft(128, 390)).toBe(128);
  });
});
