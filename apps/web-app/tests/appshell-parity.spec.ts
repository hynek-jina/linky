import { createSlip39Share } from "@linky/identity";
import { expect, test, type Page } from "@playwright/test";
import { Effect } from "effect";
import { nip19 } from "nostr-tools";
import { MOBILE_VIEWPORT, setBaseStorage } from "./helpers/appState";
import { setRandomIdentityStorage } from "./helpers/identity";

const CONTACT_NPUB =
  "npub12g0qmc3xa4hc9nxca936chppd6zhkr494xyypstcd7wg0gaa2xzswunml3";
const decodedContactNpub = nip19.decode(CONTACT_NPUB);
if (
  decodedContactNpub.type !== "npub" ||
  typeof decodedContactNpub.data !== "string"
) {
  throw new Error("Invalid test contact npub");
}
const CONTACT_PUBKEY_HEX = decodedContactNpub.data;

const setAuthenticatedStorage = async (page: Page) => {
  await setBaseStorage(page);
  await setRandomIdentityStorage(page);
};

const disableOpfs = async (page: Page) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, "getDirectory", {
      configurable: true,
      value: () =>
        Promise.reject(
          new DOMException("OPFS is unavailable", "NotSupportedError"),
        ),
      writable: true,
    });
  });
};

const createContactAndOpenChat = async (page: Page): Promise<string> => {
  await page.goto("/#");
  await page.locator("[data-guide='contact-add-button']").first().click();
  await page.waitForURL(/#contact\/new$/, { timeout: 10_000 });

  const searchInput = page.locator("[data-guide='contact-search-input']");
  await expect(searchInput).toBeVisible();
  await searchInput.fill(CONTACT_NPUB);
  await searchInput.press("Enter");
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await page.waitForURL(/#(?:contacts)?$/, { timeout: 20_000 });
  const contactCards = page.locator("[data-guide='contact-card']");
  await expect
    .poll(async () => contactCards.count(), { timeout: 20_000 })
    .toBeGreaterThan(0);
  await contactCards.first().click();
  await page.waitForURL(/#chat\/[^/]+$/, { timeout: 10_000 });
  await expect(page.locator("[data-guide='chat-input']")).toBeVisible();

  const contactMatch = new URL(page.url()).hash.match(/^#chat\/([^/]+)$/);
  if (!contactMatch?.[1]) {
    throw new Error(`Could not parse contact id from ${page.url()}`);
  }
  return decodeURIComponent(contactMatch[1]);
};

test("keeps authenticated screen gutters aligned", async ({ page }) => {
  await setAuthenticatedStorage(page);
  await page.setViewportSize({ ...MOBILE_VIEWPORT });

  for (const route of [
    "/#settings",
    "/#wallet/transactions",
    "/#wallet/topup",
    "/#contact/new",
  ]) {
    await page.goto(route);

    const shell = page.locator(".page.authenticated-page");
    // First navigation of the suite: with parallel workers the dev server may
    // still be compiling, and the default 5s expect timeout makes this flaky.
    await expect(shell).toBeVisible({ timeout: 30_000 });
    await expect(shell).toHaveCSS("padding-left", "20px");
    await expect(shell).toHaveCSS("padding-right", "20px");
    await expect(page.locator(".topbar")).toHaveCSS("padding-left", "20px");
    await expect(page.locator(".topbar")).toHaveCSS("padding-right", "20px");

    const rootPanel = page.locator(".page.authenticated-page > .panel");
    await expect(rootPanel).toHaveCount(1);
    await expect(rootPanel).toHaveCSS("padding-left", "0px");
    await expect(rootPanel).toHaveCSS("padding-right", "0px");
  }

  await page.goto("/#profile");
  await expect(page.locator(".topbar-left .topbar-btn")).toHaveCSS(
    "justify-content",
    "flex-start",
  );
  await expect(page.locator(".topbar > .topbar-btn")).toHaveCSS(
    "justify-content",
    "flex-end",
  );
});

test("keeps unauthenticated auth gating without render loops", async ({
  page,
}) => {
  const maximumDepthErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      message.text().includes("Maximum update depth exceeded")
    ) {
      maximumDepthErrors.push(message.text());
    }
  });
  await setBaseStorage(page);

  await page.goto("/#wallet");

  await expect(
    page.getByRole("button", { name: "I'm getting started" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "I'm returning" }),
  ).toBeVisible();
  await expect(page.locator("[data-guide='contact-add-button']")).toHaveCount(
    0,
  );
  await page.waitForTimeout(3_000);
  expect(maximumDepthErrors).toEqual([]);
});

test("restores an account from SLIP-39 without getting stuck", async ({
  page,
}) => {
  const slip39Share = await Effect.runPromise(createSlip39Share());
  await setBaseStorage(page);
  await page.setViewportSize({ ...MOBILE_VIEWPORT });

  await page.goto("/#wallet");
  await page.getByRole("button", { name: "I'm returning" }).click();
  await page.getByLabel("Keys").fill(slip39Share);
  const reloadFinished = page.waitForEvent("load");
  await page.getByRole("button", { name: "Continue" }).click();

  // Restore intentionally resets the route to the legacy contacts root.
  await reloadFinished;
  await page.waitForURL(/#$/, { timeout: 30_000 });
  await page.goto("/#wallet");
  await expect(page.getByLabel("Available balance")).toBeVisible({
    timeout: 30_000,
  });
});

test("restores an account when private browsing disables OPFS", async ({
  page,
}) => {
  const slip39Share = await Effect.runPromise(createSlip39Share());
  await setBaseStorage(page);
  await disableOpfs(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/#wallet");
  await page
    .getByRole("button", { name: "Continue with temporary session" })
    .click();
  await page.getByRole("button", { name: "I'm returning" }).click();
  await page.getByLabel("Keys").fill(slip39Share);
  const reloadFinished = page.waitForEvent("load");
  await page.getByRole("button", { name: "Continue" }).click();

  // The consent is remembered in sessionStorage, so the post-restore reload
  // must boot straight into the in-memory session without re-prompting.
  await reloadFinished;
  await page.waitForURL(/#$/, { timeout: 30_000 });
  await page.goto("/#wallet");
  await expect(page.getByLabel("Available balance")).toBeVisible({
    timeout: 30_000,
  });
});

test("preserves route parity and critical handlers", async ({ page }) => {
  await setAuthenticatedStorage(page);
  await page.setViewportSize({ ...MOBILE_VIEWPORT });

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
  await page.waitForURL(/#settings$/, { timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^Mint\b/ })).toBeVisible();

  await page.goto("/#");
  await page.locator("[data-guide='contact-add-button']").first().click();
  await page.waitForURL(/#contact\/new$/, { timeout: 10_000 });

  await page.locator("[data-guide='scan-contact-button']").click();
  const scanDialog = page.getByRole("dialog", { name: "Add contact" });
  await expect(scanDialog).toBeVisible();
  await scanDialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog", { name: "Add contact" })).toHaveCount(
    0,
  );

  const searchInput = page.locator("[data-guide='contact-search-input']");
  await expect(searchInput).toBeVisible();
  await searchInput.fill(CONTACT_NPUB);
  await searchInput.press("Enter");
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await page.waitForURL(/#(?:contacts)?$/, { timeout: 10_000 });
  await expect(
    page.locator(".toast").filter({ hasText: "Contact saved" }),
  ).toBeVisible();

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
  await page.waitForURL(/#(?:contacts)?$/, { timeout: 10_000 });
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

  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.getByRole("button", { name: "0", exact: true }).click();
  const paySend = page.locator("[data-guide='pay-send']");
  await expect(paySend).toBeVisible();
  await expect(paySend).toBeDisabled();
});

test("keeps long chat drafts visible above iPhone 8 and iPhone 16 keyboards", async ({
  page,
}) => {
  await setAuthenticatedStorage(page);
  await page.setViewportSize({ height: 667, width: 375 });
  await createContactAndOpenChat(page);

  const chatInput = page.locator("[data-guide='chat-input']");
  await chatInput.fill(
    Array.from({ length: 20 }, (_, index) => `Draft line ${index + 1}`).join(
      "\n",
    ),
  );
  await chatInput.evaluate((element) => element.blur());
  await page.waitForTimeout(300);

  for (const device of [
    { height: 667, keyboardTop: 330, width: 375 },
    { height: 852, keyboardTop: 430, width: 393 },
  ]) {
    await page.setViewportSize({ height: device.height, width: device.width });
    await page.waitForTimeout(50);
    await page.evaluate(({ height, keyboardTop }) => {
      document.documentElement.style.setProperty(
        "--chat-viewport-height",
        `${keyboardTop}px`,
      );
      document.documentElement.style.setProperty(
        "--chat-keyboard-inset",
        `${height - keyboardTop}px`,
      );
    }, device);

    const topbarBox = await page.locator(".topbar").boundingBox();
    const chatInputBox = await chatInput.boundingBox();
    expect(topbarBox).not.toBeNull();
    expect(chatInputBox).not.toBeNull();
    if (!topbarBox || !chatInputBox) throw new Error("Missing chat geometry");
    expect(chatInputBox.height).toBeLessThanOrEqual(160);
    expect(chatInputBox.y).toBeGreaterThanOrEqual(
      topbarBox.y + topbarBox.height,
    );
    expect(chatInputBox.y + chatInputBox.height).toBeLessThanOrEqual(
      device.keyboardTop,
    );
  }
});

test("supports chat reply, edit, reaction toggle, and copy actions", async ({
  page,
}) => {
  await setAuthenticatedStorage(page);
  await page.setViewportSize({ ...MOBILE_VIEWPORT });
  const contactId = await createContactAndOpenChat(page);

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
  await page
    .getByRole("menu")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await chatInput.fill("Reply body edited");
  await page.getByRole("button", { name: "Save" }).click();
  const editedBubble = page
    .locator(".chat-message")
    .filter({ hasText: "Reply body edited" })
    .first();
  await expect(editedBubble).toContainText("edited");

  await editedBubble.locator(".chat-bubble").click({ button: "right" });
  await page
    .getByRole("listbox", { name: "Emoji picker" })
    .getByRole("button", { name: "👍", exact: true })
    .click();
  const reactionChip = editedBubble.locator(".reaction-chip", {
    hasText: "👍",
  });
  await expect(reactionChip).toBeVisible();
  await reactionChip.click();
  await expect(reactionChip).toHaveCount(0);

  await editedBubble.locator(".chat-bubble").click({ button: "right" });
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(
    page.locator(".toast").filter({ hasText: "Copied to clipboard" }),
  ).toBeVisible();

  await page.goto(`/#contact/${encodeURIComponent(contactId)}/edit`);
  const archiveButton = page.getByRole("button", {
    name: "Archive contact",
    exact: true,
  });
  await archiveButton.click();
  await archiveButton.click();
  await page.waitForURL(/#(?:contacts)?$/, { timeout: 10_000 });

  const unknownContactId = `unknown:${CONTACT_PUBKEY_HEX}`;
  await page.goto(`/#chat/${encodeURIComponent(unknownContactId)}`);
  await expect(
    page.locator(".chat-message").filter({ hasText: "First message" }).first(),
  ).toBeVisible();
});
