import { expect, test } from "@playwright/test";

test("password save does not boot a nested app instance", async ({ page }) => {
  let mainBundleRequests = 0;
  let passwordSaveMethod = "";

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("linky.lang", "en");
  });
  page.on("request", (request) => {
    if (request.url().includes("/src/main.tsx")) {
      mainBundleRequests += 1;
    }
  });
  await page.route("**/password-save.html", async (route) => {
    passwordSaveMethod = route.request().method();
    await route.fulfill({
      body: "<!doctype html><html><body>Password saved</body></html>",
      contentType: "text/html",
      status: 200,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "I'm getting started" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm profile" }),
  ).toBeVisible({ timeout: 20_000 });

  const mainBundleRequestsBeforeSave = mainBundleRequests;
  const saveForm = page.locator(".onboarding-password-save-form");
  await expect(saveForm).toHaveCount(1);
  await saveForm.evaluate((element) => {
    if (!(element instanceof HTMLFormElement)) {
      throw new Error("Expected password-save form");
    }
    element.requestSubmit();
  });

  await expect.poll(() => passwordSaveMethod, { timeout: 10_000 }).toBe("POST");
  await expect(
    page
      .frameLocator('iframe[name="linky-password-manager-save-target"]')
      .getByText("Password saved"),
  ).toHaveCount(1);
  expect(mainBundleRequests).toBe(mainBundleRequestsBeforeSave);
});
