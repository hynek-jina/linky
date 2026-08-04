import { expect, type Page } from "@playwright/test";

/** The app renders a different shell at >=961px (useDesktopSplitView.ts:3). */
export const MOBILE_VIEWPORT = { height: 844, width: 390 } as const;

/** Counts page loads so a mid-test reload cannot pass unnoticed. */
export const LOAD_COUNTER_KEY = "e2e.loads";

/**
 * Clear storage once per session and pin the locale/currency.
 *
 * The clear is guarded by a sessionStorage sentinel because the app reloads
 * itself on some paths; without the guard the reload would wipe the very state
 * we just seeded.
 */
export const setBaseStorage = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    try {
      const initializedKey = "linky.test.base-storage-initialized";
      if (sessionStorage.getItem(initializedKey) !== "1") {
        localStorage.clear();
        sessionStorage.clear();
        sessionStorage.setItem(initializedKey, "1");
      }

      sessionStorage.setItem(
        "e2e.loads",
        String(Number(sessionStorage.getItem("e2e.loads") ?? "0") + 1),
      );

      localStorage.setItem("linky.lang", "en");
      // Pin the displayed unit so amount assertions are not at the mercy of the
      // currency-cycling UI.
      localStorage.setItem("linky.display_currency.v1", "sat");
      localStorage.setItem(
        "linky.display_allowed_currencies.v1",
        JSON.stringify(["sat"]),
      );

      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async () => {} },
      });
    } catch {
      // ignore
    }
  });
};

/**
 * Assert the app booted exactly once.
 *
 * Two different bugs show up as a second load and need different fixes:
 *  - the seed/nsec mismatch reload (useProfileAuthDomain.ts:545-585)
 *  - isLocalDevOrigin()'s dynamic-import recovery (main.tsx:340-343, 387-426),
 *    which is gated on hostname, not env, so it is live on localhost even in a
 *    production build.
 */
export const expectSingleLoad = async (
  page: Page,
  label: string,
): Promise<void> => {
  const loads = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    LOAD_COUNTER_KEY,
  );
  expect(
    loads,
    `[${label}] app reloaded mid-test (loads=${loads}). Either the stored nsec ` +
      `does not match the one derived from the SLIP-39 share, or a dynamic ` +
      `import failed and main.tsx's local-dev recovery reloaded the page.`,
  ).toBe("1");
};

/** Wait until the shell has mounted and Evolu has produced a balance. */
export const waitForNetworkReady = async (page: Page): Promise<void> => {
  await expect(page.getByLabel("Available balance")).toBeVisible({
    timeout: 60_000,
  });
};

export const readBalanceSat = async (page: Page): Promise<number> => {
  const balance = page.getByLabel("Available balance");
  await expect(balance).toBeVisible();
  const text = await balance.innerText();
  return Number(text.replace(/[^0-9]/g, "") || "0");
};
