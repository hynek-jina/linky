import { describe, expect, it } from "vitest";
import { formatShortLightningAddress } from "./formatting";

describe("formatShortLightningAddress", () => {
  it("shortens npub local parts while preserving the lightning domain", () => {
    expect(
      formatShortLightningAddress(
        "npub1sages7tvxdmmtu9gadt80dk2jzws767l30r6xntq39ffhrp0ytlsax9yar@npub.cash",
      ),
    ).toBe("npub1sages…ax9yar@npub.cash");

    expect(
      formatShortLightningAddress(
        "npub1sages7tvxdmmtu9gadt80dk2jzws767l30r6xntq39ffhrp0ytlsax9yar@linky.fit",
      ),
    ).toBe("npub1sages…ax9yar@linky.fit");
  });
});
