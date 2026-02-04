import { expect, test } from "@playwright/test";

const NSEC_SENDER =
  "nsec1ffhtvda6f94gmdna2ephkuhek790vgczcrhh855sz0gscvpe4qysfr9nlh";
const SEED_SENDER =
  "happy kitchen noble luggage pioneer input breeze connect genius flame autumn twist";
const NAME_RECEIVER = "Receiver";

test("send token", async ({ page }) => {
  const readBalanceSat = async () => {
    const balance = page.getByLabel("Available balance");
    await expect(balance).toBeVisible();
    const text = await balance.innerText();
    const digits = text.replace(/[^0-9]/g, "");
    return Number(digits || "0");
  };

  try {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem("linky.lang", "en");
      } catch {
        // ignore
      }
    });

    await page.addInitScript(
      ([nsec, mnemonicValue]) => {
        try {
          localStorage.setItem("linky.nostr_nsec", nsec);
          localStorage.setItem("linky.initialMnemonic", mnemonicValue);
        } catch {
          // ignore
        }
      },
      [NSEC_SENDER, SEED_SENDER],
    );

    await page.goto("/");

    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("button", { name: "Advanced" }).click();
    await page.getByRole("button", { name: "Mints" }).click();

    await page.locator("#defaultMintUrl").waitFor({ state: "visible" });

    await page.locator("#defaultMintUrl").fill("https://testnut.cashu.space");
    const saveMintButton = page.getByRole("button", { name: "Save changes" });
    if (await saveMintButton.count()) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          if (await saveMintButton.isVisible()) {
            await saveMintButton.click({ timeout: 5000 });
          }
          break;
        } catch {
          if (attempt === 2) break;
        }
      }
    }

    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "Wallet" }).click();
    let balanceSat = await readBalanceSat();
    if (balanceSat < 50) {
      await page.getByRole("button", { name: "Receive" }).click();

      await page.getByRole("button", { name: "1" }).click();
      await page.getByRole("button", { name: "0" }).click();
      await page.getByRole("button", { name: "0" }).click();

      await page.getByRole("button", { name: "Show top-up invoice" }).click();

      await page.locator("img.qr").waitFor({ state: "visible", timeout: 5000 });

      await page.waitForURL(/#wallet/, { timeout: 5000 });
      balanceSat = await readBalanceSat();
    }

    await page.getByRole("button", { name: "Contacts" }).click();
    await page.waitForURL(/#$/, { timeout: 5000 });
    const contactSearch = page.getByPlaceholder("Search contacts");
    await contactSearch.fill(NAME_RECEIVER);
    const contactCard = page
      .locator('[data-guide="contact-card"]')
      .filter({ hasText: NAME_RECEIVER });
    if (await contactCard.count()) {
      await contactCard.first().click();
    } else {
      await contactSearch.fill("");
      await page.locator('[data-guide="contact-card"]').first().click();
    }

    await page.getByRole("button", { name: "Pay" }).click();

    await page.getByRole("button", { name: "1" }).click();
    await page.getByRole("button", { name: "0" }).click();

    await page.getByRole("button", { name: "Pay" }).click();

    await page.waitForTimeout(3000);
    const lastTime = await page
      .locator(".chat-message")
      .last()
      .locator(".chat-time")
      .innerText();

    const lastTimeText = lastTime.split("·")[0].trim();
    const match = lastTimeText.match(/(\d{1,2}):(\d{2})(?:\s*([AP]M))?/i);
    if (!match) {
      throw new Error(`Unparsable chat time: ${lastTimeText}`);
    }

    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const ampm = match[3]?.toUpperCase();
    if (ampm) {
      if (ampm === "PM" && hour < 12) hour += 12;
      if (ampm === "AM" && hour === 12) hour = 0;
    }

    const now = new Date();
    const base = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute,
      0,
      0,
    );
    const candidates = [
      base,
      new Date(base.getTime() + 86_400_000),
      new Date(base.getTime() - 86_400_000),
    ];
    const diffMs = Math.min(
      ...candidates.map((d) => Math.abs(now.getTime() - d.getTime())),
    );

    expect(diffMs).toBeLessThanOrEqual(60_000);
    return;
  } catch (error) {
    console.error("Test failed", error);
    throw error;
  }
});
