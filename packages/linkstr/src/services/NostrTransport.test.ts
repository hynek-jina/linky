import { Duration, Effect } from "effect";
import { generateSecretKey, getEventHash, getPublicKey } from "nostr-tools";
import {
  NostrSecretKey,
  Pubkey,
  RelayUrl,
  UnixSeconds,
} from "../domain/primitives";
import { wrapRumorFor } from "../internal/giftWrap";
import { Rumor } from "../internal/nostrEvent";
import { makeRelayPoolTransport } from "./NostrTransport";
import type { RelayPool } from "./NostrTransport";

const secretKey = NostrSecretKey.make(generateSecretKey());
const pubkey = Pubkey.make(getPublicKey(secretKey));

const rumorFields = {
  pubkey,
  created_at: UnixSeconds.make(1_754_000_000),
  kind: 7,
  tags: [["p", pubkey]],
  content: "👍",
};
const event = wrapRumorFor(
  new Rumor({ ...rumorFields, id: getEventHash(rumorFields) }),
  secretKey,
  pubkey,
);

const relayOk = RelayUrl.make("wss://ok.test");
const relayRejecting = RelayUrl.make("wss://rejecting.test");
const relayDown = RelayUrl.make("wss://down.test");
const relayHanging = RelayUrl.make("wss://hanging.test");

const fakePool: RelayPool = {
  ensureRelay: async (url) => {
    if (url === relayDown) throw new Error("connection refused");
    return {
      publish: (published) => {
        expect(published.id).toBe(event.id);
        if (url === relayRejecting) {
          return Promise.reject(new Error("blocked: no active subscription"));
        }
        if (url === relayHanging) return new Promise(() => {});
        return Promise.resolve("stored");
      },
    };
  },
};

const transport = makeRelayPoolTransport(fakePool, {
  publishTimeout: Duration.millis(100),
});

describe("makeRelayPoolTransport", () => {
  it("reports acceptance, rejection, connection failure and timeout per relay", async () => {
    const results = await Effect.runPromise(
      transport.publish(
        [relayOk, relayRejecting, relayDown, relayHanging],
        event,
      ),
    );

    expect(results).toEqual([
      expect.objectContaining({
        relay: relayOk,
        accepted: true,
        detail: "stored",
      }),
      expect.objectContaining({
        relay: relayRejecting,
        accepted: false,
        detail: "Error: blocked: no active subscription",
      }),
      expect.objectContaining({
        relay: relayDown,
        accepted: false,
        detail: "Error: connection refused",
      }),
      expect.objectContaining({
        relay: relayHanging,
        accepted: false,
        detail: "publish timed out",
      }),
    ]);
  });
});
