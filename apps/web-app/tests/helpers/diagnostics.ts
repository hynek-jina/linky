import { expect, type Page } from "@playwright/test";

/**
 * Console messages that indicate a real app fault.
 *
 * This is an allowlist, not a zero-tolerance rule. Playwright funnels
 * Chromium's Log-domain entries into page.on("console") using the entry level
 * as the type, so every "Failed to load resource: net::ERR_*", failed WebSocket
 * handshake and CORS rejection arrives as type "error". Several of those are
 * expected here by design — the local mint has no /favicon.ico (utils/mint.ts
 * deliberately probes it), relays reconnect, and @evolu/common logs errors even
 * with its own logging flag disabled. Failing on all of them would fail always.
 */
const FATAL_CONSOLE_PATTERNS = [
  /^Boot failed at stage /,
  /^ErrorBoundary caught:/,
  /^\[linky\] post-mount/,
  /Maximum update depth exceeded/,
];

/** Dynamic-import recovery reloads the page; that must never happen mid-test. */
const BOOT_RECOVERY_PATTERN =
  /\[linky\]\[boot\] retrying after dev dynamic import fetch failure/;

/**
 * Expected consequences of the test environment, not app faults.
 *
 * "sw register error" fires because contexts are created with
 * serviceWorkers: "block", so navigator.serviceWorker.register() never yields a
 * registration and workbox-window throws reading `.waiting` on it. main.tsx
 * routes that to onRegisterError and carries on — its own registration handling
 * is correctly guarded — so this is noise we create, not a defect. Hiding it
 * keeps the per-account log readable enough that real problems stand out.
 */
const EXPECTED_NOISE = [
  /\[linky\]\[pwa\] sw register error/,
  /\[linky\]\[scan\] getUserMedia failed/,
];

export interface AppErrorWatcher {
  /** Throws if anything fatal was observed. */
  assertClean: () => void;
}

/**
 * Watch a page for genuine faults, and mirror the app's own [linky] logs into
 * the test output prefixed with the account label so three interleaved
 * contexts stay readable.
 */
export const watchAppErrors = (page: Page, label: string): AppErrorWatcher => {
  const failures: string[] = [];

  page.on("pageerror", (error) => {
    failures.push(`[${label}] pageerror: ${error.message}`);
  });

  page.on("console", (message) => {
    const text = message.text();

    const isExpectedNoise = EXPECTED_NOISE.some((pattern) =>
      pattern.test(text),
    );
    if (text.includes("[linky]") && !isExpectedNoise) {
      console.log(`[${label}] ${text}`);
    }

    if (BOOT_RECOVERY_PATTERN.test(text)) {
      failures.push(
        `[${label}] the app reloaded itself to recover from a failed dynamic ` +
          `import; the run is no longer trustworthy: ${text}`,
      );
      return;
    }

    if (message.type() !== "error") return;
    if (!FATAL_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) return;
    failures.push(`[${label}] console.error: ${text}`);
  });

  return {
    assertClean: () => {
      expect(failures, `app faults on ${label}`).toEqual([]);
    },
  };
};

/**
 * The boot-error panel is the ONLY signal for two failure paths that never log
 * "Boot failed at stage": pre-mount unhandled rejections (main.tsx renders the
 * panel directly) and "Boot stuck after 15s at stage:" — which is exactly how a
 * hung boot surfaces.
 */
export const expectNoBootErrorPanel = async (
  page: Page,
  label: string,
): Promise<void> => {
  await expect(
    page.getByRole("heading", { name: "Boot error" }),
    `[${label}] the app rendered its boot-error panel`,
  ).toHaveCount(0);
};
