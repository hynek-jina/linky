import { expect, test } from "@playwright/test";
import { setBaseStorage } from "./helpers/appState";
import { stubFiatRates } from "./helpers/network";

test("password save returns an inert document and signup reaches the wallet", async ({
  page,
}) => {
  const nestedScriptRequests: string[] = [];
  await setBaseStorage(page);
  await stubFiatRates(page);
  page.on("request", (request) => {
    if (
      request.resourceType() === "script" &&
      request.frame() !== page.mainFrame()
    ) {
      nestedScriptRequests.push(request.url());
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Create a profile" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm profile" }),
  ).toBeVisible();

  const saveResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/password-save.html" &&
      response.request().method() === "POST",
  );
  await page.locator(".onboarding-password-save-form").evaluate((element) => {
    if (!(element instanceof HTMLFormElement)) {
      throw new Error("Expected password-save form");
    }
    element.requestSubmit();
  });

  const saveResponse = await saveResponsePromise;
  expect(saveResponse.status()).toBe(200);
  expect(saveResponse.headers()["content-type"]).toContain("text/html");
  await saveResponse.finished();
  const saveFrame = saveResponse.frame();
  expect(saveFrame.parentFrame()).toBe(page.mainFrame());
  await saveFrame.waitForURL("**/password-save.html");
  await expect(saveFrame.locator("html")).toHaveAttribute("lang", "en");
  await expect(saveFrame.locator("body")).toBeEmpty();
  await expect(saveFrame.locator("script, #root")).toHaveCount(0);
  expect(nestedScriptRequests).toEqual([]);

  await page.getByRole("button", { name: "Confirm profile" }).click();
  await expect(page.getByLabel("Available balance")).toBeVisible();
  expect(nestedScriptRequests).toEqual([]);
});
