import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { expect, test } from "@playwright/test";
import { generateSecretKey, nip19 } from "nostr-tools";

const NPUB_RECEIVER =
  "npub12g0qmc3xa4hc9nxca936chppd6zhkr494xyypstcd7wg0gaa2xzswunml3";

test("send token", async ({ page }) => {
  const senderNsec = nip19.nsecEncode(generateSecretKey());
  const senderMnemonic = generateMnemonic(wordlist, 128);
  const receiverName = `Receiver ${Date.now()}`;

  const readBalanceSat = async (timeoutMs = 5_000) => {
    const balance = page.getByLabel("Available balance");
    await expect(balance).toBeVisible({ timeout: timeoutMs });
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
      [senderNsec, senderMnemonic],
    );

    await page.goto("/");

    page.on("console", (msg) => {
      if (
        msg.text().includes("[linky][pay]") ||
        msg.text().includes("[linky][debug]")
      ) {
        console.log(`APP LOG: ${msg.text()}`);
      }
    });

    // Navigate to Wallet first so Evolu initializes (ownerId is set).
    // Without this, saving mint URL uses "anon" key and the app never reads it back.
    await page.getByRole("button", { name: "Wallet" }).click();
    await readBalanceSat();

    // Now configure the test mint URL (Evolu ownerId is ready)
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

    // Back to Wallet for topup
    await page.getByRole("button", { name: "Wallet" }).click();
    await page.getByRole("button", { name: "Receive" }).click();

    await page.getByRole("button", { name: "1" }).click();
    await page.getByRole("button", { name: "0" }).click();
    await page.getByRole("button", { name: "0" }).click();

    await page.getByRole("button", { name: "Show top-up invoice" }).click();

    await page.locator("img.qr").waitFor({ state: "visible", timeout: 30_000 });

    const balanceAfterTopup = await readBalanceSat(120_000);
    expect(balanceAfterTopup).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Contacts" }).click();
    await page.waitForURL(/#$/, { timeout: 5000 });

    await page.getByRole("button", { name: "Add contact" }).click();
    const contactFormInputs = page.locator(".form-col input");
    await expect(contactFormInputs.nth(0)).toBeVisible();
    await contactFormInputs.nth(0).fill(receiverName);
    await contactFormInputs.nth(1).fill(NPUB_RECEIVER);
    await page.getByRole("button", { name: "Save contact" }).click();
    await page.waitForURL(/#$/, { timeout: 5000 });

    const contactCards = page.locator('[data-guide="contact-card"]');
    await expect
      .poll(async () => await contactCards.count(), { timeout: 20_000 })
      .toBeGreaterThan(0);
    await contactCards.first().click();

    await page.getByRole("button", { name: "Pay" }).click();

    await page.getByRole("button", { name: "1" }).click();
    await page.getByRole("button", { name: "0" }).click();

    const chatMessages = page.locator(".chat-message");
    const messageCountBeforePay = await chatMessages.count();

    await page.getByRole("button", { name: "Pay" }).click();

    await expect
      .poll(async () => await chatMessages.count(), { timeout: 120_000 })
      .toBeGreaterThan(messageCountBeforePay);

    const messageCountAfterPay = await chatMessages.count();
    const latestMessage = chatMessages.nth(
      Math.max(0, messageCountAfterPay - 1),
    );
    const lastTime = await latestMessage.locator(".chat-time").innerText();

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
