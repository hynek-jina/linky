import {
  OperationFailed,
  OperationSucceeded,
  QuoteId,
  QuoteStateChanged,
  TokenLifecycleChanged,
  TokenRowId,
  parseMintUrl,
} from "@linky/linkshu";
import { describe, expect, it } from "vitest";
import { isInspectorChannel, parseInspectorRow } from "./inspectorRows";
import { linkshuEventToRow } from "./linkshuRows";

const mint = (() => {
  const parsed = parseMintUrl("https://mint.example.com");
  if (parsed === null) throw new Error("fixture mint url invalid");
  return parsed;
})();

describe("linkshuEventToRow", () => {
  it("lifts correlating ids out of operation params and results", () => {
    const row = linkshuEventToRow(
      new OperationSucceeded({
        name: "receive.receive",
        params: { tokenText: "cashuB…" },
        result: { rowId: "row-1", quoteId: "quote-1" },
      }),
      1_000,
    );

    expect(row.channel).toBe("cashu");
    expect(row.tag).toBe("receive.receive");
    expect(row.links).toEqual({ row: ["row-1"], quote: ["quote-1"] });
  });

  it("names the failure in the summary", () => {
    const row = linkshuEventToRow(
      new OperationFailed({
        name: "melt.pay",
        params: { rowId: "row-2" },
        error: { _tag: "MintUnreachable" },
      }),
      1_000,
    );

    expect(row.summary).toBe("melt.pay — failed: MintUnreachable");
    expect(row.links).toEqual({ row: ["row-2"] });
  });

  it("produces rows the inspector pipeline accepts unchanged", () => {
    const rows = [
      linkshuEventToRow(
        new TokenLifecycleChanged({
          rowId: TokenRowId.make("row-3"),
          from: "accepted",
          to: "issued",
          reason: "markIssued",
        }),
        1_000,
      ),
      linkshuEventToRow(
        new QuoteStateChanged({
          flow: "topup",
          quoteId: QuoteId.make("quote-2"),
          mint,
          state: "PAID",
        }),
        2_000,
      ),
    ];

    for (const row of rows) {
      expect(isInspectorChannel(row.channel)).toBe(true);
      expect(parseInspectorRow(JSON.parse(JSON.stringify(row)))).toEqual(row);
    }
  });
});
