import {
  derivePubkey,
  makePushOwnershipProof,
  NostrSecretKey,
  UnixSeconds,
} from "@linky/linkstr";
import { describe, expect, it } from "bun:test";

import { RequestError } from "./guards";
import { OwnershipVerifier } from "./ownership";
import type { ChallengeRecord, ProofAction } from "./types";

const secretKey = NostrSecretKey.make(new Uint8Array(32).fill(1));
const pubkey = derivePubkey(secretKey);
const nowSeconds = UnixSeconds.make(1_754_000_000);
const nowMs = nowSeconds * 1000;

const challengeFor = (action: ProofAction): ChallengeRecord => ({
  nonce: "challenge-1",
  pubkey,
  action,
  expiresAt: nowMs + 60_000,
  usedAt: null,
});

describe("OwnershipVerifier", () => {
  it("accepts proofs produced by linkstr's shared codec", () => {
    const challenge = challengeFor("subscribe");
    const verifier = new OwnershipVerifier({
      proofMaxAgeSeconds: 60,
      loadChallenge: (nonce) => (nonce === challenge.nonce ? challenge : null),
    });
    const event = makePushOwnershipProof(
      { action: "subscribe", challenge: challenge.nonce },
      secretKey,
      nowSeconds,
    );

    expect(
      verifier.verifyProofs("subscribe", [pubkey], [{ pubkey, event }], nowMs),
    ).toEqual([challenge.nonce]);
  });

  it("rejects a proof for a different requested action", () => {
    const challenge = challengeFor("unsubscribe");
    const verifier = new OwnershipVerifier({
      proofMaxAgeSeconds: 60,
      loadChallenge: () => challenge,
    });
    const event = makePushOwnershipProof(
      { action: "unsubscribe", challenge: challenge.nonce },
      secretKey,
      nowSeconds,
    );

    expect(() =>
      verifier.verifyProofs("subscribe", [pubkey], [{ pubkey, event }], nowMs),
    ).toThrow(RequestError);
  });
});
