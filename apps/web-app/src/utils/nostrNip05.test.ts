import { nip19 } from "nostr-tools";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDefaultNip05IdentifierFromAddress,
  parseNip05IdentifierInput,
  resolveNip05Input,
  resolveVerifiedNip05Identifier,
} from "./nostrNip05";

const pubkeyHex =
  "b0635d6a9851d3aed0cd6c495b282167acf761729078d975fc341b22650b07b9";

const mockFetchJson = (body: unknown, ok = true) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      json: async () => body,
      ok,
      type: "basic",
    })),
  );
};

describe("parseNip05IdentifierInput", () => {
  it("defaults bare names to linky.fit", () => {
    expect(parseNip05IdentifierInput("Hynek")).toEqual({
      domain: "linky.fit",
      identifier: "hynek@linky.fit",
      localPart: "hynek",
    });
  });

  it("keeps explicit NIP-05 domains", () => {
    expect(parseNip05IdentifierInput("Hynek@Nostr.com")).toEqual({
      domain: "nostr.com",
      identifier: "hynek@nostr.com",
      localPart: "hynek",
    });
  });

  it("does not treat direct npubs as NIP-05 identifiers", () => {
    expect(parseNip05IdentifierInput("npub1abc")).toBeNull();
    expect(parseNip05IdentifierInput("nostr:npub1abc")).toBeNull();
    expect(parseNip05IdentifierInput("npub1abc@npub.cash")).toBeNull();
  });
});

describe("getDefaultNip05IdentifierFromAddress", () => {
  it("normalizes linky.fit addresses", () => {
    expect(getDefaultNip05IdentifierFromAddress("Hynek@Linky.Fit")).toBe(
      "hynek@linky.fit",
    );
  });

  it("ignores other domains", () => {
    expect(getDefaultNip05IdentifierFromAddress("hynek@nostr.com")).toBeNull();
  });
});

describe("resolveNip05Input", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the NIP-05 well-known document and encodes the npub", async () => {
    mockFetchJson({
      names: {
        hynek: pubkeyHex,
      },
      relays: {
        [pubkeyHex]: ["wss://relay.example.com", "https://ignored.test"],
      },
    });

    const result = await resolveNip05Input("hynek");

    expect(fetch).toHaveBeenCalledWith(
      new URL("https://linky.fit/.well-known/nostr.json?name=hynek"),
      {
        headers: { Accept: "application/json" },
        redirect: "manual",
      },
    );
    expect(result).toEqual({
      identifier: {
        domain: "linky.fit",
        identifier: "hynek@linky.fit",
        localPart: "hynek",
      },
      kind: "resolved",
      npub: nip19.npubEncode(pubkeyHex),
      relays: ["wss://relay.example.com"],
    });
  });

  it("returns not_found when the name is missing", async () => {
    mockFetchJson({ names: {} });

    await expect(resolveNip05Input("missing@nostr.com")).resolves.toEqual({
      identifier: {
        domain: "nostr.com",
        identifier: "missing@nostr.com",
        localPart: "missing",
      },
      kind: "not_found",
    });
  });
});

describe("resolveVerifiedNip05Identifier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the normalized identifier when it resolves to the expected npub", async () => {
    mockFetchJson({ names: { hynek: pubkeyHex } });

    await expect(
      resolveVerifiedNip05Identifier(
        "Hynek@Linky.Fit",
        nip19.npubEncode(pubkeyHex),
      ),
    ).resolves.toBe("hynek@linky.fit");
  });

  it("does not verify an identifier that resolves to another npub", async () => {
    mockFetchJson({ names: { hynek: pubkeyHex } });

    await expect(
      resolveVerifiedNip05Identifier(
        "hynek@linky.fit",
        nip19.npubEncode("a".repeat(64)),
      ),
    ).resolves.toBeNull();
  });
});
