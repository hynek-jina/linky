import { expect, test } from "@playwright/test";
import {
  fundToken,
  loadMintWallet,
  targetMintUrl,
} from "../../../packages/linkshu/tests/integration/helpers";

for (const mode of [
  "direct",
  "proxy",
  "interrupted",
  "swap-interrupted",
] as const) {
  test(`redeem a token through ${mode} LNURL and preserve payment across reload`, async ({
    page,
  }) => {
    const token = await fundToken(64);
    const target = await loadMintWallet(targetMintUrl);
    const paidQuotes: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem("linky.display_currency.v1", "sat");
      localStorage.setItem("linky.lang", "en");
    });
    let proxyCalls = 0;
    const metadata = JSON.stringify([["text/plain", "Site test"]]);
    const lnurlResponse = async (url: URL) => {
      const amount = url.searchParams.get("amount");
      if (!amount)
        return {
          tag: "payRequest",
          minSendable: 1000,
          maxSendable: 1_000_000,
          callback: "https://site-lnurl.example/invoice",
          metadata,
          commentAllowed: 100,
        };
      const quote = await target.createMintQuoteBolt11(Number(amount) / 1000);
      paidQuotes.push(quote.quote);
      return { pr: quote.request };
    };
    await page.route("https://site-lnurl.example/**", async (route) => {
      if (mode === "proxy") return route.abort("failed");
      await route.fulfill({
        json: await lnurlResponse(new URL(route.request().url())),
      });
    });
    await page.route("**/api/lnurlp?**", async (route) => {
      proxyCalls += 1;
      const url = new URL(route.request().url());
      expect(url.searchParams.get("address")).toBe("alice@site-lnurl.example");
      expect(url.searchParams.has("url")).toBe(false);
      await route.fulfill({ json: await lnurlResponse(url) });
    });
    let interrupted = false;
    let reloaded = false;
    let meltCalls = 0;
    if (mode === "interrupted" || mode === "swap-interrupted") {
      await page.route(
        mode === "swap-interrupted"
          ? "http://localhost:3338/v1/swap"
          : "http://localhost:3338/v1/melt/bolt11",
        async (route) => {
          if (route.request().method() !== "POST" || interrupted)
            return route.continue();
          meltCalls += 1;
          const response = await route.fetch();
          expect(response.ok()).toBe(true);
          interrupted = true;
          await route.abort("failed");
        },
      );
      await page.route(
        "http://localhost:3338/v1/melt/quote/bolt11/*",
        (route) =>
          interrupted && !reloaded ? route.abort("failed") : route.continue(),
      );
    }
    await page.goto("/cashu/");
    await page.locator("#cashu-token-input").fill(token);
    await page.locator(".cashu-form button[type=submit]").click();
    await expect(page.locator(".cashu-token-amount")).toContainText("64");
    await page
      .getByRole("button", { name: /Show options|Další možnosti/ })
      .click();
    await page.locator("#cashu-ln-address").fill("alice@site-lnurl.example");
    await page.locator(".cashu-redeem-form button[type=submit]").click();
    if (mode === "interrupted" || mode === "swap-interrupted") {
      await expect.poll(() => interrupted).toBe(true);
      const invoiceCount = paidQuotes.length;
      await page.reload();
      reloaded = true;
      await expect(page.locator(".cashu-token-amount")).not.toContainText(
        "0 sat",
      );
      await page
        .getByRole("button", { name: /Show options|Další možnosti/ })
        .click();
      await page
        .locator("#cashu-ln-address")
        .fill(
          mode === "interrupted"
            ? "different@site-lnurl.example"
            : "alice@site-lnurl.example",
        );
      await page.locator(".cashu-redeem-form button[type=submit]").click();
      await expect(page.locator(".cashu-success-address")).toContainText(
        "alice@site-lnurl.example",
        { timeout: 45_000 },
      );
      if (mode === "interrupted") expect(paidQuotes).toHaveLength(invoiceCount);
      expect(meltCalls).toBe(1);
    }
    await expect(page.locator(".cashu-success-title")).toBeVisible({
      timeout: 45_000,
    });
    expect(paidQuotes.length).toBeGreaterThan(0);
    const source = await loadMintWallet();
    const states = await source.checkProofsStates(
      source.decodeToken(token).proofs,
    );
    expect(states.every((state) => state.state === "SPENT")).toBe(true);
    expect(errors).toEqual([]);
    if (mode === "proxy") expect(proxyCalls).toBeGreaterThan(1);
    if (mode === "interrupted") expect(interrupted).toBe(true);
    await page.reload();
    await expect(page.locator("#cashu-token-input")).toBeVisible();
  });
}
