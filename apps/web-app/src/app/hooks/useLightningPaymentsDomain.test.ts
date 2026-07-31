import { describe, expect, it } from "vitest";
import { createCashuTokenRowFixture } from "../../testUtils/cashuTokenRow";
import { findAcceptedCashuRowsToDelete } from "./useLightningPaymentsDomain";

describe("findAcceptedCashuRowsToDelete", () => {
  const normalizeMintUrl = (url: unknown): string | null => {
    const trimmed = String(url ?? "")
      .trim()
      .toLowerCase();
    return trimmed || null;
  };

  it("returns every accepted duplicate row matching a spent token alias", () => {
    const activeRow = createCashuTokenRowFixture({
      id: "cashu-token-active",
      mint: "https://mint.example",
      rawToken: "cashu-spent",
      state: "accepted",
      token: "cashu-canonical",
    });
    const olderCopy = createCashuTokenRowFixture({
      id: "cashu-token-older-copy",
      mint: "https://mint.example",
      rawToken: "cashu-spent",
      state: "accepted",
      token: "cashu-canonical",
    });
    const rows = findAcceptedCashuRowsToDelete({
      fallbackMintUrl: "https://mint.example",
      normalizeMintUrl,
      rows: [
        activeRow,
        olderCopy,
        createCashuTokenRowFixture({
          id: "cashu-token-deleted-copy",
          isDeleted: true,
          mint: "https://mint.example",
          rawToken: "cashu-spent",
          state: "accepted",
          token: "cashu-canonical",
        }),
        createCashuTokenRowFixture({
          id: "cashu-token-error-copy",
          mint: "https://mint.example",
          rawToken: "cashu-spent",
          state: "error",
          token: "cashu-canonical",
        }),
        createCashuTokenRowFixture({
          id: "cashu-token-reserved-copy",
          mint: "https://mint.example",
          rawToken: "cashu-spent",
          state: "reserved",
          token: "cashu-canonical",
        }),
        createCashuTokenRowFixture({
          id: "cashu-token-pending-copy",
          mint: "https://mint.example",
          rawToken: "cashu-spent",
          state: "pending",
          token: "cashu-canonical",
        }),
        createCashuTokenRowFixture({
          id: "cashu-token-other-mint-copy",
          mint: "https://other.example",
          rawToken: "cashu-spent",
          state: "accepted",
          token: "cashu-canonical",
        }),
      ],
      tokenTexts: ["cashu-canonical"],
    });

    expect(rows.map((row) => row.id)).toEqual([activeRow.id, olderCopy.id]);
  });

  it("falls back to accepted rows on the spent mint when exact text is missing", () => {
    const sameMintRow = createCashuTokenRowFixture({
      id: "cashu-token-same-mint",
      mint: "https://mint.example",
      state: "accepted",
      token: "cashu-local",
    });
    const rows = findAcceptedCashuRowsToDelete({
      fallbackMintUrl: "https://mint.example",
      normalizeMintUrl,
      rows: [
        sameMintRow,
        createCashuTokenRowFixture({
          id: "cashu-token-other-mint",
          mint: "https://other.example",
          state: "accepted",
          token: "cashu-other",
        }),
        createCashuTokenRowFixture({
          id: "cashu-token-same-mint-error",
          mint: "https://mint.example",
          state: "error",
          token: "cashu-error",
        }),
        createCashuTokenRowFixture({
          id: "cashu-token-same-mint-reserved",
          mint: "https://mint.example",
          state: "reserved",
          token: "cashu-reserved",
        }),
        createCashuTokenRowFixture({
          id: "cashu-token-same-mint-pending",
          mint: "https://mint.example",
          state: "pending",
          token: "cashu-pending",
        }),
        createCashuTokenRowFixture({
          id: "cashu-token-same-mint-deleted",
          isDeleted: true,
          mint: "https://mint.example",
          state: "accepted",
          token: "cashu-deleted",
        }),
      ],
      tokenTexts: ["cashu-runtime-token"],
    });

    expect(rows.map((row) => row.id)).toEqual([sameMintRow.id]);
  });
});
