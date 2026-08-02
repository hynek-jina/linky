import { expect, test } from "@playwright/test";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { generateSecretKey, nip19 } from "nostr-tools";

test("recovers once when the main bundle cannot start", async ({ page }) => {
  let mainBundleRequests = 0;

  await page.addInitScript(() => {
    const initializedKey = "linky.test.boot-recovery-initialized";
    if (sessionStorage.getItem(initializedKey) !== "1") {
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem(initializedKey, "1");
    }
    Object.defineProperty(window, "__linkyBootWatchdogMs", {
      configurable: true,
      value: 50,
    });
  });
  await page.route("**/src/main.tsx*", async (route) => {
    mainBundleRequests += 1;
    await route.abort();
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "The app failed to start" }),
  ).toBeVisible({ timeout: 10_000 });
  expect(mainBundleRequests).toBeGreaterThanOrEqual(2);
  await expect(
    page.getByRole("button", { name: "Clear cache and reload" }),
  ).toBeVisible();
});

test("does not reload forever when session storage is unavailable", async ({
  page,
}) => {
  let mainBundleRequests = 0;

  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage unavailable", "SecurityError");
      },
    });
    Object.defineProperty(window, "__linkyBootWatchdogMs", {
      configurable: true,
      value: 50,
    });
  });
  await page.route("**/src/main.tsx*", async (route) => {
    mainBundleRequests += 1;
    await route.abort();
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "The app failed to start" }),
  ).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(250);
  expect(mainBundleRequests).toBe(1);
});

test("recovers when the authenticated app never commits", async ({ page }) => {
  const nsec = nip19.nsecEncode(generateSecretKey());
  const mnemonic = generateMnemonic(wordlist, 128);
  let databaseWorkerRequests = 0;

  await page.addInitScript(
    ([nextNsec, nextMnemonic]) => {
      const initializedKey = "linky.test.commit-recovery-initialized";
      if (sessionStorage.getItem(initializedKey) !== "1") {
        localStorage.clear();
        sessionStorage.clear();
        sessionStorage.setItem(initializedKey, "1");
      }
      localStorage.setItem("linky.lang", "en");
      localStorage.setItem("linky.nostr_nsec", nextNsec);
      localStorage.setItem("linky.initialMnemonic", nextMnemonic);
      Object.defineProperty(window, "__linkyBootWatchdogMs", {
        configurable: true,
        value: 2_000,
      });
    },
    [nsec, mnemonic],
  );
  await page.route("**/*Db.worker*", async (route) => {
    databaseWorkerRequests += 1;
    await route.abort();
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "The app failed to start" }),
  ).toBeVisible({ timeout: 15_000 });
  expect(databaseWorkerRequests).toBeGreaterThanOrEqual(1);
});
