// Guard for the Node >= 25 Web Storage regression.
//
// Node >= 25 defines `localStorage` / `sessionStorage` on globalThis (localStorage
// resolves to `undefined` without --localstorage-file). Vitest's jsdom environment
// skips any window key that already exists on globalThis, so jsdom's real Storage
// objects are never installed and every direct `localStorage.*` call in a test
// throws. `apps/web-app/vitest.setup.ts` repairs this. This file exists so that
// repair cannot silently regress on a future Node or Vitest bump.
//
// Note: `window === globalThis` under Vitest, so window.* and globalThis.* are
// deliberately asserted to be the same object rather than two independent checks.
import { beforeEach, describe, expect, it } from "vitest";

describe("test storage environment", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("exposes a real Storage on globalThis", () => {
    expect(globalThis.localStorage).toBeInstanceOf(Storage);
    expect(globalThis.sessionStorage).toBeInstanceOf(Storage);
  });

  it("round-trips a value through localStorage", () => {
    localStorage.setItem("linky.test.guard", "value-1");
    expect(localStorage.getItem("linky.test.guard")).toBe("value-1");
    expect(localStorage.length).toBe(1);
  });

  it("resolves window.* and globalThis.* to the same Storage", () => {
    expect(window.localStorage).toBe(globalThis.localStorage);
    expect(window.sessionStorage).toBe(globalThis.sessionStorage);
  });
});
