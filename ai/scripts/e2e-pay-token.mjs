import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173/";
const NSEC = "nsec136rukn6mxqamf5gnv87ylq9l9t6e7shkkxg39rsyl546aeqe9yjqjnmpca";
const FEEDBACK_NPUB =
  "npub1kkht6jvgr8mt4844saf80j5jjwyy6fdy90sxsuxt4hfv8pel499s96jvz8";

const STORAGE = {
  nsec: "linky.nostr_nsec",
  payWithCashu: "linky.pay_with_cashu",
  allowPromises: "linky.allow_promises",
  onboardingDismissed: "linky.contacts_onboarding_dismissed",
  onboardingHasPaid: "linky.contacts_onboarding_has_paid",
};

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
  });

  await page.addInitScript(
    ({ nsec, storage }) => {
      localStorage.setItem(storage.nsec, nsec);
      localStorage.setItem(storage.payWithCashu, "1");
      localStorage.setItem(storage.allowPromises, "0");
      localStorage.setItem(storage.onboardingDismissed, "1");
      localStorage.setItem(storage.onboardingHasPaid, "1");
    },
    { nsec: NSEC, storage: STORAGE },
  );

  await page.goto(APP_URL, { waitUntil: "networkidle" });

  await page.waitForSelector(".contacts-fab", { timeout: 15000 });
  await page.click(".contacts-fab");

  await page.waitForSelector(".form-grid input", { timeout: 15000 });
  const inputs = page.locator(".form-grid input");
  await inputs.nth(0).fill("Playwright Test");
  await inputs.nth(1).fill(FEEDBACK_NPUB);
  await inputs.nth(2).fill("");
  await inputs.nth(3).fill("");

  await page.locator(".actions button").first().click();

  await page.waitForSelector("[data-guide='contact-card']", { timeout: 15000 });
  await page.locator("[data-guide='contact-card']").first().click();

  await page.waitForSelector("[data-guide='contact-pay']", { timeout: 15000 });
  await page.click("[data-guide='contact-pay']");

  await page.waitForSelector(".keypad", { timeout: 15000 });
  await page.getByRole("button", { name: "1" }).click();
  await page.click("[data-guide='pay-send']");

  await page.waitForURL(/#chat\//, { timeout: 20000 });
  await page.waitForSelector(".chat-messages", { timeout: 15000 });

  const chatMessageCount = await page.locator(".chat-message").count();
  console.log("chat-message count after pay:", chatMessageCount);

  if (chatMessageCount === 0) {
    await page.screenshot({
      path: "ai/scripts/e2e-pay-token-empty.png",
      fullPage: true,
    });
    console.log(
      "No chat messages. Screenshot saved: ai/scripts/e2e-pay-token-empty.png",
    );
  } else {
    await page.screenshot({
      path: "ai/scripts/e2e-pay-token-ok.png",
      fullPage: true,
    });
    console.log(
      "Chat messages present. Screenshot saved: ai/scripts/e2e-pay-token-ok.png",
    );
  }

  await browser.close();
};

run().catch((error) => {
  console.error("Playwright run failed:", error);
  process.exit(1);
});
