import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { expect, test, type Page } from "@playwright/test";
import { generateSecretKey, nip19 } from "nostr-tools";

const CONTACT_NPUB =
  "npub12g0qmc3xa4hc9nxca936chppd6zhkr494xyypstcd7wg0gaa2xzswunml3";

const setBaseStorage = async (page: Page) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem("linky.lang", "en");
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {},
        },
      });
    } catch {
      // ignore
    }
  });
};

const setAuthenticatedStorage = async (page: Page) => {
  const nsec = nip19.nsecEncode(generateSecretKey());
  const mnemonic = generateMnemonic(wordlist, 128);

  await setBaseStorage(page);
  await page.addInitScript(
    ([nextNsec, nextMnemonic]) => {
      try {
        localStorage.setItem("linky.nostr_nsec", nextNsec);
        localStorage.setItem("linky.initialMnemonic", nextMnemonic);
        localStorage.setItem("linky.allow_promises", "1");
        localStorage.setItem("linky.pay_with_cashu", "1");
      } catch {
        // ignore
      }
    },
    [nsec, mnemonic],
  );
};

const createContactAndOpenChat = async (page: Page, contactName: string) => {
  await page.goto("/#");
  await page.locator("[data-guide='contact-add-button']").first().click();
  await page.waitForURL(/#contact\/new$/, { timeout: 10_000 });

  const formInputs = page.locator(".form-col input");
  await expect(formInputs.nth(0)).toBeVisible();
  await formInputs.nth(0).fill(contactName);
  await formInputs.nth(1).fill(CONTACT_NPUB);
  await page.getByRole("button", { name: "Save contact" }).click();

  await page.waitForURL(/#$/, { timeout: 10_000 });
  const contactCards = page.locator("[data-guide='contact-card']");
  await expect
    .poll(async () => contactCards.count(), { timeout: 20_000 })
    .toBeGreaterThan(0);
  await contactCards.first().click();
  await page.waitForURL(/#chat\/[^/]+$/, { timeout: 10_000 });
  await expect(page.locator("[data-guide='chat-input']")).toBeVisible();
};

test("keeps unauthenticated auth gating", async ({ page }) => {
  await setBaseStorage(page);

  await page.goto("/#wallet");

  await expect(
    page.getByRole("button", { name: "Create account" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Paste nsec" })).toBeVisible();
  await expect(page.locator("[data-guide='contact-add-button']")).toHaveCount(
    0,
  );
});

test("preserves route parity and critical handlers", async ({ page }) => {
  await setAuthenticatedStorage(page);

  const contactName = `Parity Contact ${Date.now()}`;

  await page.goto("/#");
  await expect(
    page.locator("[data-guide='contact-add-button']").first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Wallet" }).click();
  await page.waitForURL(/#wallet$/, { timeout: 10_000 });
  await expect(page.getByLabel("Available balance")).toBeVisible();

  await page.goto("/#profile");
  await page.waitForURL(/#profile$/, { timeout: 10_000 });
  await expect(page.locator(".profile-detail")).toBeVisible();

  await page.goto("/#");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.locator("[data-guide='open-advanced']").click();
  await page.waitForURL(/#advanced$/, { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Mints" })).toBeVisible();

  await page.goto("/#");
  await page.locator("[data-guide='contact-add-button']").first().click();
  await page.waitForURL(/#contact\/new$/, { timeout: 10_000 });

  await page.locator("[data-guide='scan-contact-button']").click();
  const scanDialog = page.getByRole("dialog", { name: "Scan" });
  await expect(scanDialog).toBeVisible();
  await scanDialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog", { name: "Scan" })).toHaveCount(0);

  const formInputs = page.locator(".form-col input");
  await expect(formInputs.nth(0)).toBeVisible();
  await formInputs.nth(0).fill(contactName);
  await formInputs.nth(1).fill(CONTACT_NPUB);
  await page.getByRole("button", { name: "Save contact" }).click();

  await page.waitForURL(/#$/, { timeout: 10_000 });
  await expect(page.locator(".toast")).toContainText("Contact saved");

  const contactCards = page.locator("[data-guide='contact-card']");
  await expect
    .poll(async () => contactCards.count(), { timeout: 20_000 })
    .toBeGreaterThan(0);

  await contactCards.first().click();
  await page.waitForURL(/#chat\/[^/]+$/, { timeout: 10_000 });
  await expect(page.locator("[data-guide='chat-input']")).toBeVisible();

  const contactUrl = new URL(page.url());
  const contactMatch = contactUrl.hash.match(/^#chat\/([^/]+)$/);
  if (!contactMatch?.[1]) {
    throw new Error(`Could not parse contact id from ${contactUrl.hash}`);
  }
  const contactId = decodeURIComponent(contactMatch[1]);

  await page.goto(`/#contact/${encodeURIComponent(contactId)}`);
  await page.waitForURL(
    new RegExp(`#contact/${encodeURIComponent(contactId)}$`),
    {
      timeout: 10_000,
    },
  );
  await expect(page.locator("[data-guide='contact-message']")).toBeVisible();
  await expect(page.locator("[data-guide='contact-pay']")).toBeVisible();

  await page.locator("[data-guide='contact-message']").click();
  await page.waitForURL(new RegExp(`#chat/${contactId}$`), { timeout: 10_000 });
  await expect(page.locator("[data-guide='chat-input']")).toBeVisible();

  await page.getByRole("banner").getByRole("button", { name: "Close" }).click();
  await page.waitForURL(/#$/, { timeout: 10_000 });
  await page.getByRole("button", { name: "Wallet" }).click();
  await page.waitForURL(/#wallet$/, { timeout: 10_000 });
  await expect(page.getByLabel("Available balance")).toBeVisible();

  await page.goto(`/#contact/${encodeURIComponent(contactId)}/pay`);
  await page.waitForURL(
    new RegExp(`#contact/${encodeURIComponent(contactId)}/pay$`),
    {
      timeout: 10_000,
    },
  );

  await page.getByRole("button", { name: "1" }).click();
  await page.getByRole("button", { name: "0" }).click();
  const paySend = page.locator("[data-guide='pay-send']");
  await expect(paySend).toBeVisible();
  await expect(paySend).toBeEnabled();

  await paySend.click();
  await expect(page.locator(".page")).toBeVisible();
});

test("supports chat reply, edit, reaction toggle, and copy actions", async ({
  page,
}) => {
  await setAuthenticatedStorage(page);
  await createContactAndOpenChat(page, `Action Contact ${Date.now()}`);

  const chatInput = page.locator("[data-guide='chat-input']");
  const sendButton = page.locator("[data-guide='chat-send']");

  await chatInput.fill("First message");
  await sendButton.click();
  await expect(
    page.locator(".chat-bubble").filter({ hasText: "First message" }),
  ).toBeVisible();

  await page
    .locator(".chat-message .chat-bubble")
    .filter({ hasText: "First message" })
    .first()
    .click({ button: "right" });
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  const replyPreview = page.locator(".reply-preview");
  await expect(replyPreview).toContainText("Replying to");
  await expect(replyPreview).toContainText("First message");

  await chatInput.fill("Reply body");
  await sendButton.click();
  const replyBubble = page
    .locator(".chat-message")
    .filter({ hasText: "Reply body" })
    .first();
  await expect(replyBubble).toBeVisible();
  await expect(replyBubble).toHaveAttribute("data-reply-to-id", /.+/);
  await expect(replyBubble.locator(".chat-reply-quote")).toContainText(
    "First message",
  );

  await replyBubble.locator(".chat-bubble").click({ button: "right" });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await chatInput.fill("Reply body edited");
  await page.getByRole("button", { name: "Save" }).click();
  const editedBubble = page
    .locator(".chat-message")
    .filter({ hasText: "Reply body edited" })
    .first();
  await expect(editedBubble).toContainText("edited");

  await editedBubble.locator(".chat-bubble").click({ button: "right" });
  await page.getByRole("button", { name: "React", exact: true }).click();
  await page.getByRole("button", { name: "👍" }).click();
  const reactionChip = editedBubble.locator(".reaction-chip", {
    hasText: "👍",
  });
  await expect(reactionChip).toBeVisible();
  await reactionChip.click();
  await expect(reactionChip).toHaveCount(0);

  await editedBubble.locator(".chat-bubble").click({ button: "right" });
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("Copied to clipboard");
});
