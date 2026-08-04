/**
 * Proxy payment (bank payment offer) — happy path, three real app instances.
 *
 * A (offerer) scans a bank QR they need paid and offers it to two contacts.
 * B accepts first and wins the bank details; C accepts too and must end at
 * accepted_by_other WITHOUT ever seeing the bank details. B pays the bank,
 * marks it paid, A confirms settlement, and B receives sats.
 *
 * Runs against docker-compose.dev.yml (nostr relay :7777, evolu relay :4001,
 * nutshell FakeWallet mint :3338) with the app served as a production build on
 * :5176. Start it with:
 *   docker compose -f docker-compose.dev.yml --profile e2e up -d --build --wait
 *
 * Two recipients, not one, is deliberate: with a single recipient the
 * auto-responder's entire reason for existing is dead code. notifyNonWinning-
 * Candidates iterates nothing and the sentCandidateKeys guard is
 * indistinguishable from a per-candidate check, so deleting the lease lock —
 * i.e. broadcasting the payer's bank account to every acceptor — would keep a
 * one-recipient test green.
 *
 * KNOWN GAPS (documented, not covered — do not mistake this for full coverage):
 *  - No induced failures, so requireContactDelivery's contact-wrap-before-self-
 *    copy ordering is invisible; removing it keeps this green. Same for the
 *    settle-then-publish ordering hazard and all multi-relay behaviour.
 *  - The one bug this feature actually shipped (362313d, "offers stalling until
 *    app restart") was a missed-wrap/resubscribe bug. Fresh sockets on a local
 *    relay cannot reproduce it.
 *  - Expiry -> canceled is untested; it needs page.clock or a Date.now seam.
 *    Note the TTL is 5 minutes PER PHASE, restarted at each status change, and
 *    an expired entry renders the expired page ahead of every other branch.
 *  - Service workers are blocked (see below), so src/sw.ts — push decryption,
 *    the "You received money" copy, precaching — is not exercised.
 *  - One mint, so buildCashuMintCandidates' "spend the default mint last" rule
 *    is untestable. isTestMintUrl(localhost) is true, which force-disables
 *    autoswap for the whole run.
 *  - VITE_NPUB_CASH_DISABLED removes the hosted lightning-address layer.
 *  - EUR and bysquare/EPC payloads are unparsed; the kind:24133 payment notice
 *    is not asserted.
 */
import { createRequire } from "node:module";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  expectSingleLoad,
  MOBILE_VIEWPORT,
  readBalanceSat,
  setBaseStorage,
  waitForNetworkReady,
} from "./helpers/appState";
import {
  addContactByNpub,
  waitForContactStatusFetched,
} from "./helpers/contacts";
import { expectNoBootErrorPanel, watchAppErrors } from "./helpers/diagnostics";
import {
  createSeedIdentity,
  setSeedLoginStorage,
  type SeedIdentity,
} from "./helpers/identity";
import {
  FIXTURE_AMOUNT_SAT,
  stubFiatRates,
  stubThirdPartyAssets,
} from "./helpers/network";
import { waitForProfileStatusOnRelay } from "./helpers/relay";
import {
  SPD_ACCOUNT,
  SPD_MESSAGE,
  SPD_PAYLOAD,
  SPD_QR_PNG_BASE64,
  SPD_VARIABLE_SYMBOL,
} from "./fixtures/bankPaymentQr";

/** A funds this much so the offer never trips the insufficient-balance guard. */
const FUNDING_SAT = 100;

/**
 * The local mint charges input_fee_ppk: 100, so redeeming a token costs the
 * receiver a sat. FakeWallet is NOT fee-free, contrary to what is often assumed
 * — which is good (the fee paths are live), but it means the receiver nets
 * slightly less than the offered amount.
 */
const MAX_REDEEM_FEE_SAT = 2;

interface Account {
  context: BrowserContext;
  errors: ReturnType<typeof watchAppErrors>;
  identity: SeedIdentity;
  label: string;
  page: Page;
}

const bootAccount = async (
  browser: Browser,
  label: string,
): Promise<Account> => {
  const identity = await createSeedIdentity();
  const context = await browser.newContext({
    // Playwright cannot intercept requests issued by a service worker, and
    // src/sw.ts registers a Workbox CacheFirst route for image destinations
    // that matches cross-origin URLs. Once the SW claims clients the
    // dicebear/blossom stubs below stop applying and the run silently reaches
    // the real network — and because activation races the first avatar render,
    // it would only misbehave sometimes.
    serviceWorkers: "block",
    viewport: { ...MOBILE_VIEWPORT },
  });

  const page = await context.newPage();
  const errors = watchAppErrors(page, label);

  await setBaseStorage(page);
  await setSeedLoginStorage(page, identity);
  await stubFiatRates(page);
  await stubThirdPartyAssets(page);

  await page.goto("/#wallet");
  await waitForNetworkReady(page);
  await expectNoBootErrorPanel(page, label);
  await expectSingleLoad(page, label);

  return { context, errors, identity, label, page };
};

const topUp = async (page: Page, sats: number): Promise<void> => {
  await page.goto("/#wallet/topup");
  for (const digit of String(sats).split("")) {
    await page.getByRole("button", { exact: true, name: digit }).click();
  }
  await page.locator("[data-guide='topup-show-invoice']").click();
  await page.locator("img.qr").waitFor({ state: "visible", timeout: 60_000 });
  // Leave before the claim completes, exactly as a user would.
  await page.goto("/#wallet");
};

/** Publish the NIP-38 CZK status, then prove it actually landed on the relay. */
const advertiseCzk = async (account: Account): Promise<void> => {
  await account.page.goto("/#profile");
  const chip = account.page.locator("button.profile-status-chip", {
    hasText: "CZK",
  });
  await expect(chip).toBeVisible();
  await chip.click();
  // Re-enabled and still pressed means the publish resolved without reverting.
  await expect(chip).toBeEnabled({ timeout: 30_000 });
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await waitForProfileStatusOnRelay(account.identity.npub, "CZK");
};

const walletBalance = async (page: Page): Promise<number> => {
  const currentHash = new URL(page.url()).hash || "#wallet";
  await page.goto("/#wallet");
  const value = await readBalanceSat(page);
  if (currentHash !== "#wallet") await page.goto(`/${currentHash}`);
  return value;
};

const offerDetailUrl = (page: Page) =>
  new URL(page.url()).hash.match(
    /^#chat\/([^/]+)\/bank-payment-offer\/([^/]+)$/,
  );

test("proxy payment: bank details reach exactly one acceptor, who is paid in sats", async ({
  browser,
}) => {
  const a = await bootAccount(browser, "A");
  const b = await bootAccount(browser, "B");
  const c = await bootAccount(browser, "C");
  const accounts = [a, b, c];

  try {
    await test.step("A funds a wallet", async () => {
      await topUp(a.page, FUNDING_SAT);
      await expect
        .poll(() => readBalanceSat(a.page), { timeout: 120_000 })
        .toBeGreaterThanOrEqual(FUNDING_SAT);
    });

    await test.step("B and C advertise CZK and it reaches the relay", async () => {
      await advertiseCzk(b);
      await advertiseCzk(c);
    });

    // Ordering is load-bearing: A's status prefetch is keyed on its contact
    // list, so B and C are not queried until they are contacts — by which point
    // the status is provably on the relay. A query that came back empty would be
    // cached as null and never retried, silently removing them as candidates.
    await test.step("A adds B and C", async () => {
      // One at a time, letting each status fetch settle: adding the second while
      // the first is still in flight permanently loses the first contact's
      // status (see waitForContactStatusFetched).
      await addContactByNpub(a.page, b.identity.npub);
      await waitForContactStatusFetched(a.page, b.identity.npub);
      await addContactByNpub(a.page, c.identity.npub);
      await waitForContactStatusFetched(a.page, c.identity.npub);
    });

    await test.step("B and C add A and sit in the chat", async () => {
      // ChatPage's auto-open effect lives inside ChatPage, needs a selected
      // contact, and bails on unknown contacts — so A must be a real contact
      // and the acceptors must actually be on the chat route.
      const chatA = await addContactByNpub(b.page, a.identity.npub);
      await b.page.goto(`/#chat/${encodeURIComponent(chatA)}`);
      const chatAForC = await addContactByNpub(c.page, a.identity.npub);
      await c.page.goto(`/#chat/${encodeURIComponent(chatAForC)}`);
    });

    const offerId =
      await test.step("A scans the bank QR and offers it", async () => {
        await a.page.goto("/#wallet");
        // The Send entry point is what sets scanEntryPoint === "send", which is
        // what makes the scanner accept a bank payment at all.
        await a.page.getByRole("button", { name: "Send" }).click();

        // A headless camera failure does not close the scanner (only closeScan
        // does), so the hidden file input is still mounted and usable.
        await a.page.locator(".scan-overlay input[type=file]").setInputFiles({
          buffer: Buffer.from(SPD_QR_PNG_BASE64, "base64"),
          mimeType: "image/png",
          name: "spd-qr.png",
        });

        await a.page.waitForURL(/#wallet\/bank-payment\//, { timeout: 30_000 });

        // buildSpdRows emits RN/ACC/BIC/RF/X-VS/X-SS/X-KS/MSG/DT only, so this
        // fixture yields exactly ACC, X-VS and MSG. AM/CC feed the header.
        await expect(a.page.locator(".bank-payment-row")).toHaveCount(3);

        const chips = a.page.locator("button.bank-payment-offer-contact");
        await expect(chips).toHaveCount(2, { timeout: 60_000 });
        await expect(chips.nth(0)).toHaveAttribute("aria-pressed", "true");
        await expect(chips.nth(1)).toHaveAttribute("aria-pressed", "true");

        // This exact label proves the recipient count AND sufficient balance AND
        // that the fiat rates parsed — amountSat must be non-null to reach it.
        const cta = a.page.getByRole("button", {
          name: "Ask 2 contacts to pay",
        });
        await expect(cta).toBeEnabled();
        await cta.click();

        await a.page.waitForURL(/#chat\/[^/]+\/bank-payment-offer\/[^/]+$/, {
          timeout: 60_000,
        });
        const match = offerDetailUrl(a.page);
        if (!match?.[2]) throw new Error(`no offerId in ${a.page.url()}`);
        return decodeURIComponent(match[2]);
      });

    await test.step("B accepts first, then C", async () => {
      for (const account of [b, c]) {
        await account.page.waitForURL(
          new RegExp(`bank-payment-offer/${offerId}$`),
          { timeout: 120_000 },
        );
        await account.page
          .getByRole("button", { name: "Accept", exact: true })
          .click();
      }
    });

    const { loser, winner } =
      await test.step("the auto-responder sends bank details to exactly one acceptor", async () => {
        const hasBankDetails = async (account: Account) =>
          (await account.page.locator(".bank-payment-fields").count()) > 0;

        // Time-boxed: if this routinely needs the 30s responder retry, the first
        // publish attempt is broken and a blanket long wait would hide it.
        await expect
          .poll(
            async () => (await hasBankDetails(b)) || (await hasBankDetails(c)),
            { timeout: 90_000 },
          )
          .toBe(true);

        const bWon = await hasBankDetails(b);
        return { loser: bWon ? c : b, winner: bWon ? b : c };
      });

    await test.step("the loser never sees the bank details", async () => {
      // The single most valuable assertion here: this is the property the
      // per-offer lease lock and the sentCandidateKeys guard exist to protect.
      await expect(loser.page.locator(".bank-payment-fields")).toHaveCount(0);
      await expect(loser.page.locator(".bank-payment-offer-qr")).toHaveCount(0);
      await expect(
        loser.page.getByText("Someone else accepted the offer first", {
          exact: false,
        }),
      ).toBeVisible({ timeout: 90_000 });

      const record = await a.page.evaluate(
        (id) =>
          localStorage.getItem(
            `linky.bank_payment_offer_spd.v1.${encodeURIComponent(id)}`,
          ),
        offerId,
      );
      expect(record, "A kept an SPD record for the offer").toBeTruthy();
      const parsed: unknown = JSON.parse(String(record));
      const sentTo =
        typeof parsed === "object" && parsed !== null
          ? (parsed as { sentCandidateKeys?: unknown }).sentCandidateKeys
          : undefined;
      expect(
        Array.isArray(sentTo) ? sentTo.length : -1,
        "bank details went to exactly one candidate",
      ).toBe(1);
    });

    await test.step("the winner received the payment info intact", async () => {
      await expect(
        winner.page.locator(".bank-payment-offer-qr-placeholder"),
      ).toHaveCount(0);

      const fields = winner.page.locator(".bank-payment-fields");
      await expect(fields).toContainText(SPD_ACCOUNT);
      await expect(fields).toContainText(SPD_VARIABLE_SYMBOL);
      await expect(fields).toContainText(SPD_MESSAGE);

      // Decode the rendered QR back to the payload: proves it survived
      // offerer -> relay -> acceptor -> re-render byte for byte.
      await winner.page.addScriptTag({
        path: createRequire(import.meta.url).resolve("jsqr"),
      });
      const decoded = await winner.page.evaluate(async () => {
        const img = document.querySelector<HTMLImageElement>(
          "img.bank-payment-offer-qr",
        );
        if (!img) return null;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decode = (
          window as unknown as {
            jsQR?: (
              d: Uint8ClampedArray,
              w: number,
              h: number,
            ) => { data: string } | null;
          }
        ).jsQR;
        return decode?.(data.data, canvas.width, canvas.height)?.data ?? null;
      });
      expect(decoded).toBe(SPD_PAYLOAD);
    });

    await test.step("the winner marks the bank payment paid", async () => {
      const paid = winner.page.getByRole("button", { name: "I paid" });
      await expect(paid).toBeEnabled();
      await paid.click();
      await expect(
        winner.page.getByText("Waiting for your sats", { exact: false }),
      ).toBeVisible({ timeout: 60_000 });
    });

    await test.step("A settles and the winner is paid in sats", async () => {
      const settle = a.page.getByRole("button", {
        name: "Confirm settlement",
      });
      // The button is conditionally rendered, not disabled, so it must be
      // absent before bank_paid rather than merely disabled.
      await expect(settle).toBeVisible({ timeout: 120_000 });

      // settleBankPaymentOffer opens with `if (cashuIsBusy) return;` and shows
      // no toast, so a fire-and-forget click can silently do nothing.
      await expect
        .poll(
          async () => {
            if (await settle.isVisible().catch(() => false)) {
              await settle.click().catch(() => {});
            }
            return walletBalance(winner.page);
          },
          { timeout: 240_000 },
        )
        .toBeGreaterThan(0);

      const received = await walletBalance(winner.page);
      expect(received).toBeLessThanOrEqual(FIXTURE_AMOUNT_SAT);
      expect(received).toBeGreaterThanOrEqual(
        FIXTURE_AMOUNT_SAT - MAX_REDEEM_FEE_SAT,
      );

      const senderBalance = await walletBalance(a.page);
      expect(FUNDING_SAT - senderBalance).toBeGreaterThanOrEqual(
        FIXTURE_AMOUNT_SAT,
      );
    });

    await test.step("A's stored bank details are cleaned up", async () => {
      // Cleanup runs in the auto-responder effect, not inside settle, so poll.
      await expect
        .poll(
          () =>
            a.page.evaluate(
              (id) =>
                localStorage.getItem(
                  `linky.bank_payment_offer_spd.v1.${encodeURIComponent(id)}`,
                ),
              offerId,
            ),
          { timeout: 120_000 },
        )
        .toBeNull();
    });

    for (const account of accounts) {
      await expectSingleLoad(account.page, account.label);
      await expectNoBootErrorPanel(account.page, account.label);
      account.errors.assertClean();
    }
  } finally {
    for (const account of accounts) await account.context.close();
  }
});
