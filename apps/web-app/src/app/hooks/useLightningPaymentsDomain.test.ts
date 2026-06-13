import { describe, expect, it } from "vitest";
import { findAcceptedCashuRowsToDelete } from "./useLightningPaymentsDomain";

describe("findAcceptedCashuRowsToDelete", () => {
  const normalizeMintUrl = (url: unknown): string | null => {
    const trimmed = String(url ?? "")
      .trim()
      .toLowerCase();
    return trimmed || null;
  };

  it("returns every accepted duplicate row matching a spent token alias", () => {
    const rows = findAcceptedCashuRowsToDelete({
      fallbackMintUrl: "https://mint.example",
      normalizeMintUrl,
      rows: [
        {
          id: "cashu-token-active",
          mint: "https://mint.example",
          rawToken: "cashu-spent",
          state: "accepted",
          token: "cashu-canonical",
        },
        {
          id: "cashu-token-older-copy",
          mint: "https://mint.example",
          rawToken: "cashu-spent",
          state: "accepted",
          token: "cashu-canonical",
        },
        {
          id: "cashu-token-deleted-copy",
          isDeleted: "1",
          mint: "https://mint.example",
          rawToken: "cashu-spent",
          state: "accepted",
          token: "cashu-canonical",
        },
      ],
      tokenTexts: ["cashu-canonical"],
    });

    expect(rows.map((row) => row.id)).toEqual([
      "cashu-token-active",
      "cashu-token-older-copy",
    ]);
  });

  it("falls back to accepted rows on the spent mint when exact text is missing", () => {
    const rows = findAcceptedCashuRowsToDelete({
      fallbackMintUrl: "https://mint.example",
      normalizeMintUrl,
      rows: [
        {
          id: "cashu-token-same-mint",
          mint: "https://mint.example",
          state: "accepted",
          token: "cashu-local",
        },
        {
          id: "cashu-token-other-mint",
          mint: "https://other.example",
          state: "accepted",
          token: "cashu-other",
        },
      ],
      tokenTexts: ["cashu-runtime-token"],
    });

    expect(rows.map((row) => row.id)).toEqual(["cashu-token-same-mint"]);
  });
});
