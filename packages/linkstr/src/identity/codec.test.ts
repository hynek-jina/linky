import { getPublicKey, nip19 } from "nostr-tools";
import { NostrSecretKey, Pubkey } from "../domain/primitives";
import {
  decodeNpub,
  decodeNsec,
  derivePubkey,
  encodeNpub,
  encodeNsec,
  identityFromNsec,
  parsePubkey,
} from "./codec";

const secretKey = NostrSecretKey.make(new Uint8Array(32).fill(1));
const pubkey = Pubkey.make(getPublicKey(secretKey));

describe("identity codec", () => {
  it("round-trips nsec values against nostr-tools", () => {
    const nsec = nip19.nsecEncode(secretKey);

    expect(encodeNsec(secretKey)).toBe(nsec);
    expect(decodeNsec(nsec)).toEqual(secretKey);
  });

  it("round-trips npub values against nostr-tools", () => {
    const npub = nip19.npubEncode(pubkey);

    expect(encodeNpub(pubkey)).toBe(npub);
    expect(decodeNpub(npub)).toBe(pubkey);
  });

  it("derives the same pubkey as nostr-tools", () => {
    expect(derivePubkey(secretKey)).toBe(getPublicKey(secretKey));
  });

  it("parses npub and case-insensitive raw hex", () => {
    expect(parsePubkey(nip19.npubEncode(pubkey))).toBe(pubkey);
    expect(parsePubkey(pubkey.toUpperCase())).toBe(pubkey);
  });

  it("rejects invalid pubkeys", () => {
    expect(parsePubkey("garbage")).toBeNull();
    expect(parsePubkey(` ${pubkey}`)).toBeNull();
  });

  it("builds an identity from nsec and rejects invalid input", () => {
    expect(identityFromNsec(nip19.nsecEncode(secretKey))).toEqual({
      pubkey,
      secretKey,
    });
    expect(identityFromNsec("invalid")).toBeNull();
  });
});
