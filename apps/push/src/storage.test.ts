import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";

import { PushStorage } from "./storage";

const unsafeInteger = BigInt(Number.MAX_SAFE_INTEGER) + 1n;

function createStoragePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "linky-push-storage-"));
  return join(directory, "push.sqlite");
}

function removeStoragePath(path: string): void {
  rmSync(path, { force: true });
  rmSync(`${path}-shm`, { force: true });
  rmSync(`${path}-wal`, { force: true });
  rmSync(join(path, ".."), { recursive: true, force: true });
}

describe("PushStorage", () => {
  it("skips subscriptions whose ids exceed Number.MAX_SAFE_INTEGER", () => {
    const storagePath = createStoragePath();
    const storage = new PushStorage(storagePath);
    const db = new Database(storagePath);

    db.query(
      `
        INSERT INTO subscriptions (
          id,
          endpoint,
          installation_id,
          p256dh,
          auth,
          expiration_time,
          created_at,
          updated_at
        ) VALUES (?, ?, NULL, ?, ?, NULL, ?, ?)
      `,
    ).run(
      unsafeInteger,
      "https://example.com/push-unsafe",
      "p256dh",
      "auth",
      1,
      1,
    );
    db.query(
      `
        INSERT INTO subscription_pubkeys (
          subscription_id,
          pubkey,
          created_at
        ) VALUES (?, ?, ?)
      `,
    ).run(unsafeInteger, "pubkey-1", 1);
    db.close();

    try {
      expect(storage.getSubscriptionsForPubkeys(["pubkey-1"]).size).toBe(0);
    } finally {
      storage.close();
      removeStoragePath(storagePath);
    }
  });

  it("throws when a new subscription rowid exceeds Number.MAX_SAFE_INTEGER", () => {
    const storagePath = createStoragePath();
    const storage = new PushStorage(storagePath);
    const db = new Database(storagePath);

    db.query(
      `
        INSERT INTO subscriptions (
          endpoint,
          installation_id,
          p256dh,
          auth,
          expiration_time,
          created_at,
          updated_at
        ) VALUES (?, NULL, ?, ?, NULL, ?, ?)
      `,
    ).run("https://example.com/bootstrap", "p256dh", "auth", 1, 1);
    db.query("DELETE FROM subscriptions WHERE endpoint = ?").run(
      "https://example.com/bootstrap",
    );
    db.query(
      `
        UPDATE sqlite_sequence
        SET seq = ?
        WHERE name = 'subscriptions'
      `,
    ).run(BigInt(Number.MAX_SAFE_INTEGER));
    db.close();

    try {
      expect(() =>
        storage.registerSubscription({
          cleanupLegacySubscriptions: false,
          installationId: null,
          subscription: {
            endpoint: "https://example.com/overflow",
            expirationTime: null,
            keys: {
              p256dh: "p256dh",
              auth: "auth",
            },
          },
          recipientPubkeys: [],
          consumedChallengeNonces: [],
          maxPubkeysPerSubscription: 1,
          maxSubscriptionsPerPubkey: 1,
          nowMs: 1,
        }),
      ).toThrow("Subscription rowid exceeds Number.MAX_SAFE_INTEGER");
    } finally {
      storage.close();
      removeStoragePath(storagePath);
    }
  });
});
