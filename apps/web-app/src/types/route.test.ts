/**
 * Hash <-> route round trip, both directions in one file.
 *
 * `parseRouteFromHash` (hash -> route) and `navigateTo` (route -> hash) are two
 * halves of the same contract: a route variant is only reachable when both
 * agree on the exact literal. Testing them apart lets the two literals drift
 * (`#settings/notifications` vs `#settings/notification`) with both suites
 * still green, so they are asserted together here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { navigateTo } from "../hooks/useRouting";
import { parseRouteFromHash, type Route } from "./route";

const assignMock = vi.fn<(hash: string) => void>();

/**
 * `parseRouteFromHash` reads `globalThis.location?.hash` and
 * `globalThis.location?.href`, so both are stubbed. Same shape as
 * `app/lib/topbarConfig.test.ts`'s location stub, which `navigateTo` also
 * writes through.
 */
const stubLocation = (hash: string): void => {
  vi.stubGlobal("location", {
    assign: assignMock,
    hash,
    href: `https://app.linky.fit/${hash}`,
  });
};

stubLocation("");

const parseHash = (hash: string): Route => {
  stubLocation(hash);
  return parseRouteFromHash();
};

const lastAssignedHash = (): string => assignMock.mock.calls.at(-1)?.[0] ?? "";

beforeEach(() => {
  stubLocation("");
  assignMock.mockClear();
});

describe("parseRouteFromHash", () => {
  it("parses the notifications hash to the notifications route", () => {
    expect(parseHash("#settings/notifications")).toEqual({
      kind: "settingsNotifications",
    });
  });

  it("ignores a query string on the notifications hash", () => {
    // The parser splits on "?" before any comparison.
    expect(parseHash("#settings/notifications?x=1")).toEqual({
      kind: "settingsNotifications",
    });
  });

  it("does not shadow the neighbouring settings routes", () => {
    // Every check ahead of the prefix-based `decodeHashSegment` calls is exact
    // string equality, and no prefix branch uses a "#settings/" prefix, so the
    // insertion order of the new branch cannot matter.
    expect(parseHash("#settings")).toEqual({ kind: "settings" });
    expect(parseHash("#settings/units")).toEqual({ kind: "settingsUnits" });
    expect(parseHash("#settings/master-keys")).toEqual({
      kind: "settingsMasterKeys",
    });
  });

  it("does not accept the singular near-miss hash", () => {
    expect(parseHash("#settings/notification").kind).not.toBe(
      "settingsNotifications",
    );
  });
});

describe("navigateTo", () => {
  it("assigns exactly the notifications hash", () => {
    navigateTo({ route: "settingsNotifications" });

    expect(assignMock).toHaveBeenCalledTimes(1);
    expect(lastAssignedHash()).toBe("#settings/notifications");
  });
});

describe("hash round trip", () => {
  it("parses back the hash navigateTo assigned", () => {
    navigateTo({ route: "settingsNotifications" });

    // The assertion that fails the moment the two literals drift apart.
    expect(parseHash(lastAssignedHash())).toEqual({
      kind: "settingsNotifications",
    });
  });
});
