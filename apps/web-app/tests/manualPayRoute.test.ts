import { afterEach, describe, expect, it } from "vitest";
import { parseRouteFromHash } from "../src/types/route";

const replaceHash = (hash: string) => {
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}${hash}`,
  );
};

afterEach(() => {
  replaceHash("");
});

describe("manual payment route", () => {
  it("parses the manual payment route", () => {
    replaceHash("#wallet/pay");

    expect(parseRouteFromHash()).toEqual({ kind: "manualPay" });
  });
});
