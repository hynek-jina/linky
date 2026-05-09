import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fetchNostrProfilePicture,
  isDisplayableProfilePictureUrl,
  saveCachedProfileMetadata,
} from "./nostrProfile";

const TEST_NPUB =
  "npub180cvv07tqw7jwr9wnh4hp24w3wl74x64l0n6ms4qxp2vj8qz9c8sv96q8j";

describe("isDisplayableProfilePictureUrl", () => {
  it("allows http and raster data image profile pictures", () => {
    expect(isDisplayableProfilePictureUrl("https://example.com/a.jpg")).toBe(
      true,
    );
    expect(isDisplayableProfilePictureUrl("data:image/jpeg;base64,AAAA")).toBe(
      true,
    );
  });

  it("rejects non-image and svg data urls", () => {
    expect(isDisplayableProfilePictureUrl("data:text/plain;base64,AAAA")).toBe(
      false,
    );
    expect(
      isDisplayableProfilePictureUrl("data:image/svg+xml;base64,AAAA"),
    ).toBe(false);
  });
});

describe("fetchNostrProfilePicture", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => Array.from(values.keys())[index] ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => values.set(key, value),
    };
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("uses cached raster data image metadata as a profile picture", async () => {
    const picture = "data:image/jpeg;base64,AAAA";
    saveCachedProfileMetadata(TEST_NPUB, { picture });

    await expect(fetchNostrProfilePicture(TEST_NPUB)).resolves.toBe(picture);
  });
});
