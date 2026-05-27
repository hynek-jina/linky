import { describe, expect, it } from "vitest";
import {
  alignMainSwipeToTarget,
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
