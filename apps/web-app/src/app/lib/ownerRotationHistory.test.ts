import { describe, expect, it } from "vitest";
import { countOwnerHistoryWrites } from "./ownerRotationHistory";

describe("ownerRotationHistory", () => {
  it("groups per row and timestamp so one row update counts once", () => {
    expect(
      countOwnerHistoryWrites({
        entries: [
          {
            id: "contact-1",
            ownerId: "owner-a",
            table: "contact",
            timestampKey: "ts-1",
            timestampMs: 1_000,
          },
          {
            id: "contact-1",
            ownerId: "owner-a",
            table: "contact",
            timestampKey: "ts-1",
            timestampMs: 1_000,
          },
          {
            id: "contact-1",
            ownerId: "owner-a",
            table: "contact",
            timestampKey: "ts-2",
            timestampMs: 1_500,
          },
        ],
        fallbackCount: 99,
        ownerId: "owner-a",
        rotatedAtMs: 900,
        tables: ["contact"],
      }),
    ).toBe(2);
  });

  it("filters by owner, tables, and rotation timestamp", () => {
    expect(
      countOwnerHistoryWrites({
        entries: [
          {
            id: "contact-1",
            ownerId: "owner-a",
            table: "contact",
            timestampKey: "ts-1",
            timestampMs: 1_000,
          },
          {
            id: "contact-2",
            ownerId: "owner-a",
            table: "contact",
            timestampKey: "ts-2",
            timestampMs: 2_000,
          },
          {
            id: "contact-3",
            ownerId: "owner-b",
            table: "contact",
            timestampKey: "ts-3",
            timestampMs: 3_000,
          },
          {
            id: "transaction-1",
            ownerId: "owner-a",
            table: "transaction",
            timestampKey: "ts-4",
            timestampMs: 3_000,
          },
        ],
        fallbackCount: 99,
        ownerId: "owner-a",
        rotatedAtMs: 1_500,
        tables: ["contact"],
      }),
    ).toBe(1);
  });

  it("falls back to row-based delta until a structured snapshot exists", () => {
    expect(
      countOwnerHistoryWrites({
        entries: [],
        fallbackCount: 7,
        ownerId: "owner-a",
        rotatedAtMs: null,
        tables: ["contact"],
      }),
    ).toBe(7);
  });

  it("matches base64url app owner ids against base64 history owner ids", () => {
    expect(
      countOwnerHistoryWrites({
        entries: [
          {
            id: "contact-1",
            ownerId: "YWJjKysvLw==",
            table: "contact",
            timestampKey: "ts-1",
            timestampMs: 2_000,
          },
        ],
        fallbackCount: 0,
        ownerId: "YWJjKysvLw",
        rotatedAtMs: 1_000,
        tables: ["contact"],
      }),
    ).toBe(1);
  });
});
