import { expect, type Page } from "@playwright/test";

/**
 * Add a contact by npub and return its local contact id.
 *
 * addNewContactFromSearchResult navigates to #contacts (useContactEditor.ts),
 * not into a chat, so the id has to be read after opening the card.
 * The search does a Nostr metadata lookup, hence the generous timeout.
 */
export const addContactByNpub = async (
  page: Page,
  npub: string,
): Promise<string> => {
  await page.goto("/#contacts");
  await page.locator("[data-guide='contact-add-button']").first().click();
  await page.waitForURL(/#contact\/new$/, { timeout: 20_000 });

  const searchInput = page.locator("[data-guide='contact-search-input']");
  await expect(searchInput).toBeVisible();
  await searchInput.fill(npub);
  await searchInput.press("Enter");

  await page.getByRole("button", { exact: true, name: "Add" }).click({
    timeout: 30_000,
  });
  await page.waitForURL(/#(?:contacts)?$/, { timeout: 20_000 });

  const cards = page.locator("[data-guide='contact-card']");
  await expect
    .poll(() => cards.count(), { timeout: 20_000 })
    .toBeGreaterThan(0);
  await cards.first().click();
  await page.waitForURL(/#chat\/[^/]+$/, { timeout: 20_000 });

  const match = new URL(page.url()).hash.match(/^#chat\/([^/]+)$/);
  if (!match?.[1]) {
    throw new Error(`Could not parse contact id from ${page.url()}`);
  }
  return decodeURIComponent(match[1]);
};

/**
 * Wait until this contact's NIP-38 status has been fetched and stored.
 *
 * This is a workaround for a real race in useContactsNostrPrefetchEffects
 * (:437-475), not just test tidiness. Adding a second contact while the first
 * contact's status fetch is still in flight changes `uniqueNpubsKey`, which
 * cancels the effect and re-runs it. The re-run skips the in-flight npub
 * (`if (nostrStatusInFlight.current.has(npub)) continue`) without marking it
 * complete, and when the original fetch resolves it writes the cache but then
 * bails on `if (cancelled) return` before updating state. Since the deps never
 * change again, that contact's status stays missing from `nostrStatusByNpub`
 * for the life of the page — so it silently disappears from the proxy-payment
 * recipient list even though the value sits in localStorage.
 *
 * Letting each fetch settle before adding the next contact avoids the race.
 */
export const waitForContactStatusFetched = async (
  page: Page,
  npub: string,
): Promise<void> => {
  await expect
    .poll(
      () =>
        page.evaluate(
          (key) => localStorage.getItem(key),
          `linky_nostr_status_v1:${npub}`,
        ),
      { timeout: 60_000 },
    )
    .not.toBeNull();
};
