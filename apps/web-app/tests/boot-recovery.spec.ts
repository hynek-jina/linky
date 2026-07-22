import { expect, test } from "@playwright/test";

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
  await page.route("**/src/main.tsx", async (route) => {
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
