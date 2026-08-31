import { afterEach, describe, expect, it } from "vitest";
import { wipeLinkshuSeedBoundState } from "./wipeLinkshuSeedBoundState";

const MNEMONIC =
  "legal winner thank year wave sausage worth useful legal winner thank yellow";

const VALUE_PREFIX = "linky.linkshu.value.";

afterEach(() => {
  localStorage.clear();
});

describe("wipeLinkshuSeedBoundState", () => {
  it("removes counters, cursors, and leases but keeps seed-independent state", async () => {
    const seedBound = [
      `${VALUE_PREFIX}linkshu.detCounter.https%3A%2F%2Fmint.example.sat.00ff`,
      `${VALUE_PREFIX}linkshu.detCounterLock.https%3A%2F%2Fmint.example.sat.00ff`,
      `${VALUE_PREFIX}linkshu.restoreCursor.https%3A%2F%2Fmint.example.sat.00ff`,
    ];
    const kept = [
      `${VALUE_PREFIX}linkshu.seenMints.https%3A%2F%2Fmint.example`,
      `${VALUE_PREFIX}linkshu.seenKeysets.https%3A%2F%2Fmint.example.sat.00ff`,
      "linky.lang",
    ];
    for (const key of [...seedBound, ...kept]) {
      localStorage.setItem(key, "42");
    }

    await wipeLinkshuSeedBoundState(MNEMONIC);

    for (const key of seedBound) {
      expect(localStorage.getItem(key)).toBeNull();
    }
    for (const key of kept) {
      expect(localStorage.getItem(key)).toBe("42");
    }
  });
});
