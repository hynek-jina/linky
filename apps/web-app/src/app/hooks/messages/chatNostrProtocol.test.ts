import { getPublicKey } from "nostr-tools";
import { encrypt, getConversationKey } from "nostr-tools/nip44";
import { wrapEvent } from "nostr-tools/nip59";
import { describe, expect, it } from "vitest";
import {
  isInvalidInnerRumorPubkey,
  isNestedEncryptedNip44PayloadForAnyPubkey,
} from "./chatNostrProtocol";

const createSecretKey = (lastByte: number): Uint8Array => {
  const secretKey = new Uint8Array(32);
  secretKey[31] = lastByte;
  return secretKey;
};

describe("isNestedEncryptedNip44PayloadForAnyPubkey", () => {
  it("detects nested payloads encrypted by the sender pubkey", () => {
    const senderPrivkey = createSecretKey(1);
    const recipientPrivkey = createSecretKey(2);
    const recipientPubkey = getPublicKey(recipientPrivkey);
    const senderPubkey = getPublicKey(senderPrivkey);
    const nestedCiphertext = encrypt(
      "nested secret",
      getConversationKey(senderPrivkey, recipientPubkey),
    );

    expect(
      isNestedEncryptedNip44PayloadForAnyPubkey(
        nestedCiphertext,
        [senderPubkey],
        recipientPrivkey,
      ),
    ).toBe(true);
  });

  it("detects outer gift-wrap ciphertext when the wrap pubkey is checked", () => {
    const senderPrivkey = createSecretKey(3);
    const recipientPrivkey = createSecretKey(4);
    const senderPubkey = getPublicKey(senderPrivkey);
    const recipientPubkey = getPublicKey(recipientPrivkey);
    const wrap = wrapEvent(
      {
        kind: 14,
        created_at: 123,
        content: "hello",
        tags: [
          ["p", recipientPubkey],
          ["p", senderPubkey],
        ],
      },
      senderPrivkey,
      recipientPubkey,
    );

    expect(
      isNestedEncryptedNip44PayloadForAnyPubkey(
        wrap.content,
        [senderPubkey],
        recipientPrivkey,
      ),
    ).toBe(false);
    expect(
      isNestedEncryptedNip44PayloadForAnyPubkey(
        wrap.content,
        [senderPubkey, wrap.pubkey],
        recipientPrivkey,
      ),
    ).toBe(true);
  });

  it("rejects inner rumors that reuse the outer wrap pubkey", () => {
    const senderPrivkey = createSecretKey(5);
    const recipientPrivkey = createSecretKey(6);
    const recipientPubkey = getPublicKey(recipientPrivkey);
    const wrap = wrapEvent(
      {
        kind: 14,
        created_at: 123,
        content: "hello",
        tags: [["p", recipientPubkey]],
      },
      senderPrivkey,
      recipientPubkey,
    );

    expect(isInvalidInnerRumorPubkey(wrap.pubkey, wrap.pubkey)).toBe(true);
    expect(
      isInvalidInnerRumorPubkey(getPublicKey(senderPrivkey), wrap.pubkey),
    ).toBe(false);
  });
});
