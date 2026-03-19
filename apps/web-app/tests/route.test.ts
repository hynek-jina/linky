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

describe("parseRouteFromHash", () => {
  it("defaults to wallet when the url has no hash", () => {
    replaceHash("");

    expect(parseRouteFromHash()).toEqual({ kind: "wallet" });
  });

  it("keeps explicit contacts hash on the contacts route", () => {
    replaceHash("#");

    expect(parseRouteFromHash()).toEqual({ kind: "contacts" });
  });

  it("supports the explicit contacts route hash", () => {
    replaceHash("#contacts");

    expect(parseRouteFromHash()).toEqual({ kind: "contacts" });
  });

  it("falls back to wallet for unknown hashes", () => {
    replaceHash("#unknown-route");

    expect(parseRouteFromHash()).toEqual({ kind: "wallet" });
  });
});
