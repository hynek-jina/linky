import { describe, expect, it } from "vitest";
import { cs } from "./cs";
import csSource from "./cs.ts?raw";
import { en } from "./en";
import enSource from "./en.ts?raw";

/**
 * Why this guard exists.
 *
 * `TranslationKey` is `keyof (typeof translations)["cs"]`
 * (`app/useAppShellComposition.tsx:101`) and `hasTranslationKey` checks
 * `translations.cs` (`:103-104`). The two failure directions are NOT symmetric:
 *
 * - A key added to `cs.ts` only is a **typecheck error** at
 *   `useAppShellComposition.tsx:113`, because `translations[lang]` is the union
 *   `typeof cs | typeof en` and the `en` member lacks the key. Caught for free.
 * - A key added to `en.ts` only **typechecks fine**. `hasTranslationKey` returns
 *   `false` and `t` falls back to returning the raw key string, so the literal
 *   identifier `notificationBannerDismiss` ships to the user as UI text. Nothing
 *   fails. **Silent.**
 *
 * This file closes that second direction. It is the only thing in the repo that
 * makes an en-only key a build failure rather than a shipped bug.
 *
 * `cs` and `en` are imported from their modules directly rather than through
 * `./index`, so the test does not drag in `getInitialLang` and its `localStorage`
 * access.
 */

// Raw file text, not the evaluated module: `?raw` is a Vite/Vitest transform, so
// this needs no `node:fs` (the web-app tsconfig has no Node types).
const LANGUAGE_SOURCES = { en: enSource, cs: csSource } as const;

/**
 * Top-level keys as they appear in the SOURCE, in source order and WITH any
 * duplicates. `Object.keys()` cannot see a duplicate literal key — the later
 * declaration silently wins and the object exposes one entry — so duplicate
 * detection has to read the file text.
 */
const declaredKeysInSource = (source: string): string[] =>
  [...source.matchAll(/^ {2}([A-Za-z0-9_]+):/gm)].map(
    (match) => match[1] ?? "",
  );

const difference = (a: readonly string[], b: readonly string[]): string[] => {
  const other = new Set(b);
  return a.filter((key) => !other.has(key));
};

const duplicates = (keys: readonly string[]): string[] => {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) repeated.add(key);
    seen.add(key);
  }
  return [...repeated].sort();
};

/** Reads a value without indexing the object type, so this file typechecks before the key exists. */
const valueOf = (
  translations: Record<string, string>,
  key: string,
): string | undefined =>
  Object.entries(translations).find(([k]) => k === key)?.[1];

const NOTIFICATION_BANNER_KEYS = [
  "notificationBannerLabel",
  "notificationBannerOpen",
  "notificationBannerDismiss",
  "notificationBannerMore",
] as const;

const NOTIFICATIONS_PAGE_KEYS = [
  "notifications",
  "notificationsEmpty",
  "notificationsHistory",
  "notificationsMarkAllRead",
  "notificationsMarkRead",
  "notificationsMarkUnread",
  "notificationsUnreadCount",
] as const;

const BANNER_COUNT_KEY = "notificationBannerMore";
const COUNT_PLACEHOLDER = "{count}";

describe("translations", () => {
  it("en and cs declare exactly the same keys", () => {
    const enKeys = Object.keys(en);
    const csKeys = Object.keys(cs);

    // Report the two set differences by name. A raw deep-equal on two sorted
    // 799-element arrays produces an unreadable diff dump.
    expect({
      enOnly: difference(enKeys, csKeys).sort(),
      csOnly: difference(csKeys, enKeys).sort(),
    }).toEqual({ enOnly: [], csOnly: [] });

    expect(enKeys.sort()).toEqual(csKeys.sort());
  });

  it("neither language file declares a duplicate key", () => {
    for (const [lang, source] of Object.entries(LANGUAGE_SOURCES)) {
      const declared = declaredKeysInSource(source);
      expect(declared.length).toBeGreaterThan(0);
      expect({ lang, duplicates: duplicates(declared) }).toEqual({
        lang,
        duplicates: [],
      });
    }
  });

  it("every value is a non-empty string in both languages", () => {
    for (const [lang, translations] of Object.entries({ en, cs })) {
      const bad = Object.entries(translations)
        .filter(([, value]) => typeof value !== "string" || value.trim() === "")
        .map(([key]) => key);
      expect({ lang, bad }).toEqual({ lang, bad: [] });
    }
  });

  it("the notification banner keys exist in both languages", () => {
    const enKeys = Object.keys(en);
    const csKeys = Object.keys(cs);

    for (const key of NOTIFICATION_BANNER_KEYS) {
      expect({
        key,
        en: enKeys.includes(key),
        cs: csKeys.includes(key),
      }).toEqual({ key, en: true, cs: true });
    }
  });

  it("the notifications page keys exist in both languages", () => {
    const enKeys = Object.keys(en);
    const csKeys = Object.keys(cs);

    for (const key of NOTIFICATIONS_PAGE_KEYS) {
      expect({
        key,
        en: enKeys.includes(key),
        cs: csKeys.includes(key),
      }).toEqual({ key, en: true, cs: true });
    }
  });

  // The settings section already renders the push-enable switch under
  // `notifications` (`pages/AdvancedPage.tsx:446-452`). The history entry row
  // lands in that SAME section, so reusing the key would put two
  // identically-labelled rows side by side — one a switch, one a link.
  it("the notifications history label is distinct from the enable-toggle label", () => {
    for (const [lang, translations] of Object.entries({ en, cs })) {
      const toggle = valueOf(translations, "notifications");
      const history = valueOf(translations, "notificationsHistory");
      expect({ lang, distinct: toggle !== history }).toEqual({
        lang,
        distinct: true,
      });
    }
  });

  it("the banner count key carries the {count} placeholder in both languages", () => {
    for (const [lang, translations] of Object.entries({ en, cs })) {
      const value = valueOf(translations, BANNER_COUNT_KEY);
      expect({ lang, value }).toEqual({ lang, value: expect.any(String) });
      expect({
        lang,
        hasPlaceholder: value?.includes(COUNT_PLACEHOLDER),
      }).toEqual({ lang, hasPlaceholder: true });
    }
  });
});
