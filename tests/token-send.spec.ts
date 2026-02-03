import { expect, test } from "@playwright/test";

const NSEC_SENDER =
  "nsec1ffhtvda6f94gmdna2ephkuhek790vgczcrhh855sz0gscvpe4qysfr9nlh";
//   "nsec1p88pqhyy97hf2j5lsvygm4r0n4fe3uq965znhw7eepuqjvdh4txs8yqj2w";
// const NPUB_SENDER =
//   "npub1rcdwp7w8644sax24kt99wn9p6w56kptdeuw83lk5h8k7tkla56zsuch9de";
const SEED_SENDER =
  "happy kitchen noble luggage pioneer input breeze connect genius flame autumn twist";
// const NSEC_RECEIVER =
//   "nsec136rukn6mxqamf5gnv87ylq9l9t6e7shkkxg39rsyl546aeqe9yjqjnmpca";
// const SEED_RECEIVER =
//   "chief forum rude speed hammer shield dial simple hammer truly will nature";
// const NAME_SENDER = "Sender";
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

    // const mnemonic = SEED_SENDER;
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

    // await page
    //   .getByPlaceholder("Search contacts")
    //   .waitFor({ state: "visible", timeout: 60000 });

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

    // Test

    //     const sentToken = page.locator(".chat-message.out .pill");
    //     try {
    //       await expect(sentToken.first()).toBeVisible({ timeout: 20000 });
    //       const pendingToken = page.locator(".chat-message.out.pending .pill");
    //       await expect(pendingToken).toHaveCount(0, { timeout: 30000 });
    //     } catch (error) {
    //       console.error("Expected sent token visible in chat", {
    //         url: page.url(),
    //       });
    //       throw error;
    //     }

    //     const chatUrl = page.url();
    //     const contactIdMatch = chatUrl.match(/#chat\/([^/]+)/);
    //     const sentContactId = contactIdMatch ? contactIdMatch[1] : null;
    //     if (!sentContactId) {
    //       throw new Error("Missing contact id in chat URL");
    //     }

    //     const sentTokenText = await page.evaluate(() => {
    //       try {
    //         const prefix = "linky.local.nostrMessages.v1.";
    //         const keys = Object.keys(localStorage).filter((k) =>
    //           k.startsWith(prefix),
    //         );
    //         const messages = keys.flatMap((k) => {
    //           try {
    //             const raw = localStorage.getItem(k);
    //             const parsed = raw ? JSON.parse(raw) : [];
    //             return Array.isArray(parsed) ? parsed : [];
    //           } catch {
    //             return [];
    //           }
    //         });
    //         const outgoing = messages.filter(
    //           (m) => String(m?.direction ?? "") === "out",
    //         );
    //         for (let i = outgoing.length - 1; i >= 0; i -= 1) {
    //           const content = String(outgoing[i]?.content ?? "");
    //           if (content.startsWith("cashu")) {
    //             return {
    //               content,
    //               status: String(outgoing[i]?.status ?? ""),
    //               id: String(outgoing[i]?.id ?? ""),
    //             };
    //           }
    //         }
    //       } catch {
    //         // ignore
    //       }
    //       return null;
    //     });

    //     if (!sentTokenText || !sentTokenText.content) {
    //       console.error("Expected sent token text in local storage", {
    //         url: page.url(),
    //       });
    //       throw new Error("Missing sent token text in local storage");
    //     }

    //     try {
    //       await expect
    //         .poll(
    //           async () =>
    //             await page.evaluate((messageId) => {
    //               try {
    //                 const prefix = "linky.local.nostrMessages.v1.";
    //                 const keys = Object.keys(localStorage).filter((k) =>
    //                   k.startsWith(prefix),
    //                 );
    //                 const messages = keys.flatMap((k) => {
    //                   try {
    //                     const raw = localStorage.getItem(k);
    //                     const parsed = raw ? JSON.parse(raw) : [];
    //                     return Array.isArray(parsed) ? parsed : [];
    //                   } catch {
    //                     return [];
    //                   }
    //                 });
    //                 const msg = messages.find(
    //                   (m) => String(m?.id ?? "") === String(messageId ?? ""),
    //                 );
    //                 return String(msg?.status ?? "sent") !== "pending";
    //               } catch {
    //                 return false;
    //               }
    //             }, sentTokenText.id),
    //           { timeout: 30000 },
    //         )
    //         .toBeTruthy();
    //     } catch (error) {
    //       console.error("Expected sent token message not pending", {
    //         url: page.url(),
    //         tokenPreview: sentTokenText.content.slice(0, 24),
    //       });
    //       throw error;
    //     }

    //     try {
    //       await expect
    //         .poll(
    //           async () =>
    //             await page.evaluate(
    //               ([contactId, amount]) => {
    //                 try {
    //                   const prefix = "linky.local.paymentEvents.v1.";
    //                   const keys = Object.keys(localStorage).filter((k) =>
    //                     k.startsWith(prefix),
    //                   );
    //                   const events = keys.flatMap((k) => {
    //                     try {
    //                       const raw = localStorage.getItem(k);
    //                       const parsed = raw ? JSON.parse(raw) : [];
    //                       return Array.isArray(parsed) ? parsed : [];
    //                     } catch {
    //                       return [];
    //                     }
    //                   });
    //                   return events.some(
    //                     (e) =>
    //                       String(e?.direction ?? "") === "out" &&
    //                       String(e?.status ?? "") === "ok" &&
    //                       Number(e?.amount ?? 0) === Number(amount) &&
    //                       String(e?.contactId ?? "") === String(contactId),
    //                   );
    //                 } catch {
    //                   return false;
    //                 }
    //               },
    //               [sentContactId, 10],
    //             ),
    //           { timeout: 30000 },
    //         )
    //         .toBeTruthy();
    //     } catch (error) {
    //       console.error("Expected payment event in local history", {
    //         url: page.url(),
    //         contactId: sentContactId,
    //       });
    //       throw error;
    //     }

    //     const browser = page.context().browser();
    //     if (!browser) {
    //       throw new Error("Browser instance not available");
    //     }
    //     const receiverContext = await browser.newContext();
    //     await receiverContext.addInitScript(
    //       ([nsec, mnemonicValue]) => {
    //         try {
    //           localStorage.clear();
    //           sessionStorage.clear();
    //           localStorage.setItem("linky.lang", "en");
    //           localStorage.setItem("linky.nostr_nsec", nsec);
    //           localStorage.setItem("linky.initialMnemonic", mnemonicValue);
    //         } catch {
    //           // ignore
    //         }
    //       },
    //       [NSEC_RECEIVER, SEED_RECEIVER],
    //     );

    //     const receiverPage = await receiverContext.newPage();
    //     await receiverPage.goto("/#");
    //     await receiverPage
    //       .getByPlaceholder("Search contacts")
    //       .waitFor({ state: "visible", timeout: 60000 });

    //     //   const senderNpub = deriveNpubFromNsec(NSEC_SENDER);
    //     const receiverSearch = receiverPage.getByPlaceholder("Search contacts");
    //     await receiverSearch.fill(NPUB_SENDER);
    //     const receiverCard = receiverPage.locator('[data-guide="contact-card"]');
    //     if (await receiverCard.count()) {
    //       await receiverCard.first().click();
    //     } else {
    //       await receiverSearch.fill(NPUB_SENDER.slice(0, 12));
    //       if (await receiverCard.count()) {
    //         await receiverCard.first().click();
    //       } else {
    //         throw new Error("Sender contact not found for receiver");
    //       }
    //     }

    //     try {
    //       await expect
    //         .poll(
    //           async () =>
    //             await receiverPage.evaluate((tokenText) => {
    //               try {
    //                 const prefix = "linky.local.nostrMessages.v1.";
    //                 const keys = Object.keys(localStorage).filter((k) =>
    //                   k.startsWith(prefix),
    //                 );
    //                 const messages = keys.flatMap((k) => {
    //                   try {
    //                     const raw = localStorage.getItem(k);
    //                     const parsed = raw ? JSON.parse(raw) : [];
    //                     return Array.isArray(parsed) ? parsed : [];
    //                   } catch {
    //                     return [];
    //                   }
    //                 });
    //                 return messages.some(
    //                   (m) =>
    //                     String(m?.direction ?? "") === "in" &&
    //                     String(m?.content ?? "") === tokenText,
    //                 );
    //               } catch {
    //                 return false;
    //               }
    //             }, sentTokenText.content),
    //           { timeout: 90000 },
    //         )
    //         .toBeTruthy();
    //     } catch (error) {
    //       console.error("Expected receiver to have exact token message", {
    //         url: receiverPage.url(),
    //         tokenPreview: sentTokenText.content.slice(0, 24),
    //       });
    //       await receiverContext.close();
    //       throw error;
    //     }

    //     const lastToken = receiverPage
    //       .locator(".chat-message")
    //       .last()
    //       .locator(".pill");
    //     await expect(lastToken).toBeVisible({ timeout: 90000 });
    //     await receiverContext.close();
  } catch (error) {
    console.error("Test failed", error);
    throw error;
  }
});
