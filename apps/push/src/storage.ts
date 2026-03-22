import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { Database } from "bun:sqlite";

import { isRecord } from "./guards";
import type {
  ChallengeRecord,
  NativePushSubscriptionData,
  ProofAction,
  StoredNativeSubscription,
  StoredSubscription,
  WebPushSubscriptionData,
} from "./types";

interface RegisterSubscriptionParams {
  cleanupLegacySubscriptions: boolean;
  installationId: string | null;
  subscription: WebPushSubscriptionData;
  recipientPubkeys: string[];
  consumedChallengeNonces: string[];
  maxPubkeysPerSubscription: number;
  maxSubscriptionsPerPubkey: number;
  nowMs: number;
}

interface UnregisterSubscriptionPubkeysParams {
  endpoint: string;
  recipientPubkeys: string[];
  consumedChallengeNonces: string[];
  nowMs: number;
}

interface UnregisterSubscriptionPubkeysResult {
  removedPubkeys: number;
  removedSubscription: boolean;
}

interface RegisterNativeSubscriptionParams {
  cleanupLegacySubscriptions: boolean;
  installationId: string | null;
  device: NativePushSubscriptionData;
  recipientPubkeys: string[];
  consumedChallengeNonces: string[];
  maxPubkeysPerSubscription: number;
  maxSubscriptionsPerPubkey: number;
  nowMs: number;
}

interface UnregisterNativeSubscriptionPubkeysParams {
  token: string;
  recipientPubkeys: string[];
  consumedChallengeNonces: string[];
  nowMs: number;
}

export class StorageLimitError extends Error {
  readonly status = 409;
  readonly code = "subscription_limit";
}

export class StorageConflictError extends Error {
  readonly status = 409;
  readonly code = "storage_conflict";
}

function readSafeInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? value : null;
  }
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : null;
  }
  return null;
}

function readNumberField(
  record: Record<string | number | symbol, unknown>,
  key: string,
): number | null {
  return readSafeInteger(record[key]);
}

function readNullableNumberField(
  record: Record<string | number | symbol, unknown>,
  key: string,
): number | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }
  return readNumberField(record, key);
}

function readStringField(
  record: Record<string | number | symbol, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function createNonce(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export class PushStorage {
  private readonly db: Database;
  private readonly registerSubscriptionTransaction;
  private readonly unregisterSubscriptionPubkeysTransaction;
  private readonly registerNativeSubscriptionTransaction;
  private readonly unregisterNativeSubscriptionPubkeysTransaction;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });

    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT NOT NULL UNIQUE,
        installation_id TEXT,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        expiration_time INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS subscription_pubkeys (
        subscription_id INTEGER NOT NULL,
        pubkey TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (subscription_id, pubkey),
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_subscription_pubkeys_pubkey
      ON subscription_pubkeys (pubkey);

      CREATE TABLE IF NOT EXISTS native_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL UNIQUE,
        installation_id TEXT,
        platform TEXT NOT NULL CHECK (platform IN ('android')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS native_subscription_pubkeys (
        subscription_id INTEGER NOT NULL,
        pubkey TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (subscription_id, pubkey),
        FOREIGN KEY (subscription_id) REFERENCES native_subscriptions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_native_subscription_pubkeys_pubkey
      ON native_subscription_pubkeys (pubkey);

      CREATE TABLE IF NOT EXISTS challenges (
        nonce TEXT PRIMARY KEY,
        pubkey TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('subscribe', 'unsubscribe')),
        expires_at INTEGER NOT NULL,
        used_at INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_challenges_pubkey_action
      ON challenges (pubkey, action);

      CREATE TABLE IF NOT EXISTS seen_events (
        event_id TEXT PRIMARY KEY,
        first_seen_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_seen_events_first_seen_at
      ON seen_events (first_seen_at);
    `);
    this.ensureSubscriptionsInstallationIdColumn();
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_installation_id
      ON subscriptions (installation_id)
      WHERE installation_id IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_native_subscriptions_installation_id
      ON native_subscriptions (installation_id)
      WHERE installation_id IS NOT NULL;
    `);

    this.registerSubscriptionTransaction = this.db.transaction(
      (params: RegisterSubscriptionParams) =>
        this.registerSubscriptionInternal(params),
    );
    this.unregisterSubscriptionPubkeysTransaction = this.db.transaction(
      (params: UnregisterSubscriptionPubkeysParams) =>
        this.unregisterSubscriptionPubkeysInternal(params),
    );
    this.registerNativeSubscriptionTransaction = this.db.transaction(
      (params: RegisterNativeSubscriptionParams) =>
        this.registerNativeSubscriptionInternal(params),
    );
    this.unregisterNativeSubscriptionPubkeysTransaction = this.db.transaction(
      (params: UnregisterNativeSubscriptionPubkeysParams) =>
        this.unregisterNativeSubscriptionPubkeysInternal(params),
    );
  }

  private ensureSubscriptionsInstallationIdColumn(): void {
    const rows = this.db.query("PRAGMA table_info(subscriptions)").all();
    const hasColumn = rows.some((row) => {
      if (!isRecord(row)) {
        return false;
      }
      return readStringField(row, "name") === "installation_id";
    });
    if (hasColumn) {
      return;
    }
    this.db.exec("ALTER TABLE subscriptions ADD COLUMN installation_id TEXT;");
  }

  close(): void {
    this.db.close();
  }

  createChallenge(
    pubkey: string,
    action: ProofAction,
    expiresAt: number,
    nowMs: number,
  ): string {
    this.pruneChallenges(nowMs);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const nonce = createNonce();
      const result = this.db
        .query(
          `
            INSERT OR IGNORE INTO challenges (
              nonce,
              pubkey,
              action,
              expires_at,
              used_at,
              created_at
            ) VALUES (?, ?, ?, ?, NULL, ?)
          `,
        )
        .run(nonce, pubkey, action, expiresAt, nowMs);

      if (result.changes === 1) {
        return nonce;
      }
    }

    throw new StorageConflictError(
      "Failed to allocate a unique challenge nonce",
    );
  }

  getChallenge(nonce: string): ChallengeRecord | null {
    const row = this.db
      .query(
        `
          SELECT nonce, pubkey, action, expires_at AS expiresAt, used_at AS usedAt
          FROM challenges
          WHERE nonce = ?
        `,
      )
      .get(nonce);

    if (!isRecord(row)) {
      return null;
    }

    const storedNonce = readStringField(row, "nonce");
    const pubkey = readStringField(row, "pubkey");
    const action = readStringField(row, "action");
    const expiresAt = readNumberField(row, "expiresAt");
    const usedAt = readNullableNumberField(row, "usedAt");

    if (
      storedNonce === null ||
      pubkey === null ||
      (action !== "subscribe" && action !== "unsubscribe") ||
      expiresAt === null
    ) {
      return null;
    }

    return {
      nonce: storedNonce,
      pubkey,
      action,
      expiresAt,
      usedAt,
    };
  }

  registerSubscription(params: RegisterSubscriptionParams): void {
    this.registerSubscriptionTransaction(params);
  }

  unregisterSubscription(endpoint: string): boolean {
    const result = this.db
      .query("DELETE FROM subscriptions WHERE endpoint = ?")
      .run(endpoint);
    return result.changes > 0;
  }

  unregisterSubscriptionPubkeys(
    params: UnregisterSubscriptionPubkeysParams,
  ): UnregisterSubscriptionPubkeysResult {
    return this.unregisterSubscriptionPubkeysTransaction(params);
  }

  registerNativeSubscription(params: RegisterNativeSubscriptionParams): void {
    this.registerNativeSubscriptionTransaction(params);
  }

  unregisterNativeSubscription(token: string): boolean {
    const result = this.db
      .query("DELETE FROM native_subscriptions WHERE token = ?")
      .run(token);
    return result.changes > 0;
  }

  unregisterNativeSubscriptionPubkeys(
    params: UnregisterNativeSubscriptionPubkeysParams,
  ): UnregisterSubscriptionPubkeysResult {
    return this.unregisterNativeSubscriptionPubkeysTransaction(params);
  }

  removeSubscriptionById(subscriptionId: number): void {
    this.db.query("DELETE FROM subscriptions WHERE id = ?").run(subscriptionId);
  }

  removeNativeSubscriptionById(subscriptionId: number): void {
    this.db
      .query("DELETE FROM native_subscriptions WHERE id = ?")
      .run(subscriptionId);
  }

  recordSeenEvent(eventId: string, firstSeenAt: number): boolean {
    const result = this.db
      .query(
        `
          INSERT OR IGNORE INTO seen_events (
            event_id,
            first_seen_at
          ) VALUES (?, ?)
        `,
      )
      .run(eventId, firstSeenAt);
    return result.changes === 1;
  }

  pruneSeenEvents(nowMs: number, maxAgeMs: number): void {
    this.db
      .query(
        `
          DELETE FROM seen_events
          WHERE first_seen_at <= ?
        `,
      )
      .run(nowMs - maxAgeMs);
  }

  getSubscriptionsForPubkeys(
    pubkeys: string[],
  ): Map<string, StoredSubscription[]> {
    const uniquePubkeys = [...new Set(pubkeys)];
    const out = new Map<string, StoredSubscription[]>();
    if (uniquePubkeys.length === 0) {
      return out;
    }

    const placeholders = uniquePubkeys.map(() => "?").join(", ");
    const rows = this.db
      .query(
        `
          SELECT
            sp.pubkey AS pubkey,
            s.id AS id,
            s.endpoint AS endpoint,
            s.p256dh AS p256dh,
            s.auth AS auth,
            s.expiration_time AS expirationTime
          FROM subscription_pubkeys sp
          INNER JOIN subscriptions s ON s.id = sp.subscription_id
          WHERE sp.pubkey IN (${placeholders})
        `,
      )
      .all(...uniquePubkeys);

    for (const row of rows) {
      if (!isRecord(row)) {
        continue;
      }
      const pubkey = readStringField(row, "pubkey");
      const id = readNumberField(row, "id");
      const endpoint = readStringField(row, "endpoint");
      const p256dh = readStringField(row, "p256dh");
      const auth = readStringField(row, "auth");
      const expirationTime = readNullableNumberField(row, "expirationTime");

      if (
        pubkey === null ||
        id === null ||
        endpoint === null ||
        p256dh === null ||
        auth === null
      ) {
        continue;
      }

      const existing = out.get(pubkey);
      const stored: StoredSubscription = {
        id,
        endpoint,
        installationId: null,
        expirationTime,
        keys: {
          p256dh,
          auth,
        },
      };

      if (existing) {
        existing.push(stored);
      } else {
        out.set(pubkey, [stored]);
      }
    }

    return out;
  }

  getNativeSubscriptionsForPubkeys(
    pubkeys: string[],
  ): Map<string, StoredNativeSubscription[]> {
    const uniquePubkeys = [...new Set(pubkeys)];
    const out = new Map<string, StoredNativeSubscription[]>();
    if (uniquePubkeys.length === 0) {
      return out;
    }

    const placeholders = uniquePubkeys.map(() => "?").join(", ");
    const rows = this.db
      .query(
        `
          SELECT
            sp.pubkey AS pubkey,
            s.id AS id,
            s.installation_id AS installationId,
            s.platform AS platform,
            s.token AS token
          FROM native_subscription_pubkeys sp
          INNER JOIN native_subscriptions s ON s.id = sp.subscription_id
          WHERE sp.pubkey IN (${placeholders})
        `,
      )
      .all(...uniquePubkeys);

    for (const row of rows) {
      if (!isRecord(row)) {
        continue;
      }
      const pubkey = readStringField(row, "pubkey");
      const id = readNumberField(row, "id");
      const installationId = readStringField(row, "installationId");
      const platform = readStringField(row, "platform");
      const token = readStringField(row, "token");

      if (
        pubkey === null ||
        id === null ||
        token === null ||
        platform !== "android"
      ) {
        continue;
      }

      const existing = out.get(pubkey);
      const stored: StoredNativeSubscription = {
        id,
        installationId,
        platform,
        token,
      };

      if (existing) {
        existing.push(stored);
      } else {
        out.set(pubkey, [stored]);
      }
    }

    return out;
  }

  pruneChallenges(nowMs: number): void {
    this.db
      .query(
        `
          DELETE FROM challenges
          WHERE expires_at <= ? OR (used_at IS NOT NULL AND used_at <= ?)
        `,
      )
      .run(nowMs, nowMs - 24 * 60 * 60 * 1000);
  }

  private registerSubscriptionInternal(
    params: RegisterSubscriptionParams,
  ): void {
    if (params.recipientPubkeys.length > params.maxPubkeysPerSubscription) {
      throw new StorageLimitError(
        `Subscriptions may track at most ${params.maxPubkeysPerSubscription} pubkeys`,
      );
    }

    const existingSubscriptionId =
      this.getSubscriptionIdByEndpoint(params.subscription.endpoint) ??
      (params.installationId === null
        ? null
        : this.getSubscriptionIdByInstallationId(params.installationId));
    const currentPubkeys =
      existingSubscriptionId === null
        ? new Set<string>()
        : this.getSubscriptionPubkeysInternal(existingSubscriptionId);
    const comparisonSubscriptionId = existingSubscriptionId ?? 0;

    for (const pubkey of params.recipientPubkeys) {
      if (currentPubkeys.has(pubkey)) {
        continue;
      }
      const currentCount = this.countSubscriptionsForPubkeyInternal(
        pubkey,
        comparisonSubscriptionId,
      );
      if (currentCount >= params.maxSubscriptionsPerPubkey) {
        throw new StorageLimitError(
          `Pubkey ${pubkey} already has the maximum ${params.maxSubscriptionsPerPubkey} subscriptions`,
        );
      }
    }

    this.consumeChallengesInternal(
      params.consumedChallengeNonces,
      params.nowMs,
    );

    const subscriptionId = this.upsertSubscriptionInternal(
      params.installationId,
      params.subscription,
      params.nowMs,
    );

    if (params.cleanupLegacySubscriptions) {
      this.pruneLegacySubscriptionsForPubkeys(
        params.recipientPubkeys,
        subscriptionId,
      );
    }

    this.db
      .query("DELETE FROM subscription_pubkeys WHERE subscription_id = ?")
      .run(subscriptionId);

    for (const pubkey of params.recipientPubkeys) {
      this.db
        .query(
          `
            INSERT INTO subscription_pubkeys (
              subscription_id,
              pubkey,
              created_at
            ) VALUES (?, ?, ?)
          `,
        )
        .run(subscriptionId, pubkey, params.nowMs);
    }
  }

  private unregisterSubscriptionPubkeysInternal(
    params: UnregisterSubscriptionPubkeysParams,
  ): UnregisterSubscriptionPubkeysResult {
    const subscriptionId = this.getSubscriptionIdByEndpoint(params.endpoint);
    if (subscriptionId === null) {
      return {
        removedPubkeys: 0,
        removedSubscription: false,
      };
    }

    this.consumeChallengesInternal(
      params.consumedChallengeNonces,
      params.nowMs,
    );

    let removedPubkeys = 0;
    for (const pubkey of params.recipientPubkeys) {
      const result = this.db
        .query(
          `
            DELETE FROM subscription_pubkeys
            WHERE subscription_id = ? AND pubkey = ?
          `,
        )
        .run(subscriptionId, pubkey);
      removedPubkeys += result.changes;
    }

    const remaining = this.countPubkeysForSubscriptionInternal(subscriptionId);
    if (remaining === 0) {
      this.db
        .query("DELETE FROM subscriptions WHERE id = ?")
        .run(subscriptionId);
      return {
        removedPubkeys,
        removedSubscription: true,
      };
    }

    return {
      removedPubkeys,
      removedSubscription: false,
    };
  }

  private registerNativeSubscriptionInternal(
    params: RegisterNativeSubscriptionParams,
  ): void {
    if (params.recipientPubkeys.length > params.maxPubkeysPerSubscription) {
      throw new StorageLimitError(
        `Subscriptions may track at most ${params.maxPubkeysPerSubscription} pubkeys`,
      );
    }

    const existingSubscriptionId =
      this.getNativeSubscriptionIdByToken(params.device.token) ??
      (params.installationId === null
        ? null
        : this.getNativeSubscriptionIdByInstallationId(params.installationId));
    const currentPubkeys =
      existingSubscriptionId === null
        ? new Set<string>()
        : this.getNativeSubscriptionPubkeysInternal(existingSubscriptionId);
    const comparisonSubscriptionId = existingSubscriptionId ?? 0;

    for (const pubkey of params.recipientPubkeys) {
      if (currentPubkeys.has(pubkey)) {
        continue;
      }
      const currentCount = this.countNativeSubscriptionsForPubkeyInternal(
        pubkey,
        comparisonSubscriptionId,
      );
      if (currentCount >= params.maxSubscriptionsPerPubkey) {
        throw new StorageLimitError(
          `Pubkey ${pubkey} already has the maximum ${params.maxSubscriptionsPerPubkey} subscriptions`,
        );
      }
    }

    this.consumeChallengesInternal(
      params.consumedChallengeNonces,
      params.nowMs,
    );

    const subscriptionId = this.upsertNativeSubscriptionInternal(
      params.installationId,
      params.device,
      params.nowMs,
    );

    if (params.cleanupLegacySubscriptions) {
      this.pruneLegacyNativeSubscriptionsForPubkeys(
        params.recipientPubkeys,
        subscriptionId,
      );
    }

    this.db
      .query(
        "DELETE FROM native_subscription_pubkeys WHERE subscription_id = ?",
      )
      .run(subscriptionId);

    for (const pubkey of params.recipientPubkeys) {
      this.db
        .query(
          `
            INSERT INTO native_subscription_pubkeys (
              subscription_id,
              pubkey,
              created_at
            ) VALUES (?, ?, ?)
          `,
        )
        .run(subscriptionId, pubkey, params.nowMs);
    }
  }

  private unregisterNativeSubscriptionPubkeysInternal(
    params: UnregisterNativeSubscriptionPubkeysParams,
  ): UnregisterSubscriptionPubkeysResult {
    const subscriptionId = this.getNativeSubscriptionIdByToken(params.token);
    if (subscriptionId === null) {
      return {
        removedPubkeys: 0,
        removedSubscription: false,
      };
    }

    this.consumeChallengesInternal(
      params.consumedChallengeNonces,
      params.nowMs,
    );

    let removedPubkeys = 0;
    for (const pubkey of params.recipientPubkeys) {
      const result = this.db
        .query(
          `
            DELETE FROM native_subscription_pubkeys
            WHERE subscription_id = ? AND pubkey = ?
          `,
        )
        .run(subscriptionId, pubkey);
      removedPubkeys += result.changes;
    }

    const remaining =
      this.countNativePubkeysForSubscriptionInternal(subscriptionId);
    if (remaining === 0) {
      this.db
        .query("DELETE FROM native_subscriptions WHERE id = ?")
        .run(subscriptionId);
      return {
        removedPubkeys,
        removedSubscription: true,
      };
    }

    return {
      removedPubkeys,
      removedSubscription: false,
    };
  }

  private consumeChallengesInternal(nonces: string[], nowMs: number): void {
    for (const nonce of nonces) {
      const result = this.db
        .query(
          `
            UPDATE challenges
            SET used_at = ?
            WHERE nonce = ? AND used_at IS NULL AND expires_at > ?
          `,
        )
        .run(nowMs, nonce, nowMs);
      if (result.changes !== 1) {
        throw new StorageConflictError("Challenge is expired or already used");
      }
    }
  }

  private upsertSubscriptionInternal(
    installationId: string | null,
    subscription: WebPushSubscriptionData,
    nowMs: number,
  ): number {
    const existingId =
      this.getSubscriptionIdByEndpoint(subscription.endpoint) ??
      (installationId === null
        ? null
        : this.getSubscriptionIdByInstallationId(installationId));
    if (existingId !== null) {
      this.db
        .query(
          `
            UPDATE subscriptions
            SET
              endpoint = ?,
              installation_id = ?,
              p256dh = ?,
              auth = ?,
              expiration_time = ?,
              updated_at = ?
            WHERE id = ?
          `,
        )
        .run(
          subscription.endpoint,
          installationId,
          subscription.keys.p256dh,
          subscription.keys.auth,
          subscription.expirationTime,
          nowMs,
          existingId,
        );
      return existingId;
    }

    const result = this.db
      .query(
        `
          INSERT INTO subscriptions (
            endpoint,
            installation_id,
            p256dh,
            auth,
            expiration_time,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        subscription.endpoint,
        installationId,
        subscription.keys.p256dh,
        subscription.keys.auth,
        subscription.expirationTime,
        nowMs,
        nowMs,
      );

    const subscriptionId = readSafeInteger(result.lastInsertRowid);
    if (subscriptionId === null) {
      throw new Error("Subscription rowid exceeds Number.MAX_SAFE_INTEGER");
    }
    return subscriptionId;
  }

  private getSubscriptionIdByEndpoint(endpoint: string): number | null {
    const row = this.db
      .query("SELECT id AS id FROM subscriptions WHERE endpoint = ?")
      .get(endpoint);
    if (!isRecord(row)) {
      return null;
    }
    return readNumberField(row, "id");
  }

  private getSubscriptionIdByInstallationId(
    installationId: string,
  ): number | null {
    const row = this.db
      .query("SELECT id AS id FROM subscriptions WHERE installation_id = ?")
      .get(installationId);
    if (!isRecord(row)) {
      return null;
    }
    return readNumberField(row, "id");
  }

  private getNativeSubscriptionIdByToken(token: string): number | null {
    const row = this.db
      .query("SELECT id AS id FROM native_subscriptions WHERE token = ?")
      .get(token);
    if (!isRecord(row)) {
      return null;
    }
    return readNumberField(row, "id");
  }

  private getNativeSubscriptionIdByInstallationId(
    installationId: string,
  ): number | null {
    const row = this.db
      .query(
        "SELECT id AS id FROM native_subscriptions WHERE installation_id = ?",
      )
      .get(installationId);
    if (!isRecord(row)) {
      return null;
    }
    return readNumberField(row, "id");
  }

  private getSubscriptionPubkeysInternal(subscriptionId: number): Set<string> {
    const rows = this.db
      .query(
        `
          SELECT pubkey AS pubkey
          FROM subscription_pubkeys
          WHERE subscription_id = ?
        `,
      )
      .all(subscriptionId);

    const out = new Set<string>();
    for (const row of rows) {
      if (!isRecord(row)) {
        continue;
      }
      const pubkey = readStringField(row, "pubkey");
      if (pubkey !== null) {
        out.add(pubkey);
      }
    }
    return out;
  }

  private getNativeSubscriptionPubkeysInternal(
    subscriptionId: number,
  ): Set<string> {
    const rows = this.db
      .query(
        `
          SELECT pubkey AS pubkey
          FROM native_subscription_pubkeys
          WHERE subscription_id = ?
        `,
      )
      .all(subscriptionId);

    const out = new Set<string>();
    for (const row of rows) {
      if (!isRecord(row)) {
        continue;
      }
      const pubkey = readStringField(row, "pubkey");
      if (pubkey !== null) {
        out.add(pubkey);
      }
    }
    return out;
  }

  private pruneLegacySubscriptionsForPubkeys(
    pubkeys: readonly string[],
    keepSubscriptionId: number,
  ): void {
    const affectedSubscriptionIds = new Set<number>();

    for (const pubkey of pubkeys) {
      const rows = this.db
        .query(
          `
            SELECT sp.subscription_id AS subscriptionId
            FROM subscription_pubkeys sp
            INNER JOIN subscriptions s ON s.id = sp.subscription_id
            WHERE sp.pubkey = ?
              AND sp.subscription_id != ?
              AND s.installation_id IS NULL
          `,
        )
        .all(pubkey, keepSubscriptionId);

      for (const row of rows) {
        if (!isRecord(row)) {
          continue;
        }
        const subscriptionId = readNumberField(row, "subscriptionId");
        if (subscriptionId === null) {
          continue;
        }
        const result = this.db
          .query(
            `
              DELETE FROM subscription_pubkeys
              WHERE subscription_id = ? AND pubkey = ?
            `,
          )
          .run(subscriptionId, pubkey);
        if (result.changes > 0) {
          affectedSubscriptionIds.add(subscriptionId);
        }
      }
    }

    for (const subscriptionId of affectedSubscriptionIds) {
      if (this.countPubkeysForSubscriptionInternal(subscriptionId) > 0) {
        continue;
      }
      this.db
        .query("DELETE FROM subscriptions WHERE id = ?")
        .run(subscriptionId);
    }
  }

  private upsertNativeSubscriptionInternal(
    installationId: string | null,
    device: NativePushSubscriptionData,
    nowMs: number,
  ): number {
    const existingId =
      this.getNativeSubscriptionIdByToken(device.token) ??
      (installationId === null
        ? null
        : this.getNativeSubscriptionIdByInstallationId(installationId));
    if (existingId !== null) {
      this.db
        .query(
          `
            UPDATE native_subscriptions
            SET
              token = ?,
              installation_id = ?,
              platform = ?,
              updated_at = ?
            WHERE id = ?
          `,
        )
        .run(device.token, installationId, device.platform, nowMs, existingId);
      return existingId;
    }

    const result = this.db
      .query(
        `
          INSERT INTO native_subscriptions (
            token,
            installation_id,
            platform,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(device.token, installationId, device.platform, nowMs, nowMs);

    const subscriptionId = readSafeInteger(result.lastInsertRowid);
    if (subscriptionId === null) {
      throw new Error(
        "Native subscription rowid exceeds Number.MAX_SAFE_INTEGER",
      );
    }
    return subscriptionId;
  }

  private pruneLegacyNativeSubscriptionsForPubkeys(
    pubkeys: readonly string[],
    keepSubscriptionId: number,
  ): void {
    const affectedSubscriptionIds = new Set<number>();

    for (const pubkey of pubkeys) {
      const rows = this.db
        .query(
          `
            SELECT sp.subscription_id AS subscriptionId
            FROM native_subscription_pubkeys sp
            INNER JOIN native_subscriptions s ON s.id = sp.subscription_id
            WHERE sp.pubkey = ?
              AND sp.subscription_id != ?
              AND s.installation_id IS NULL
          `,
        )
        .all(pubkey, keepSubscriptionId);

      for (const row of rows) {
        if (!isRecord(row)) {
          continue;
        }
        const subscriptionId = readNumberField(row, "subscriptionId");
        if (subscriptionId === null) {
          continue;
        }
        const result = this.db
          .query(
            `
              DELETE FROM native_subscription_pubkeys
              WHERE subscription_id = ? AND pubkey = ?
            `,
          )
          .run(subscriptionId, pubkey);
        if (result.changes > 0) {
          affectedSubscriptionIds.add(subscriptionId);
        }
      }
    }

    for (const subscriptionId of affectedSubscriptionIds) {
      if (this.countNativePubkeysForSubscriptionInternal(subscriptionId) > 0) {
        continue;
      }
      this.db
        .query("DELETE FROM native_subscriptions WHERE id = ?")
        .run(subscriptionId);
    }
  }

  private countSubscriptionsForPubkeyInternal(
    pubkey: string,
    excludedSubscriptionId: number,
  ): number {
    const row = this.db
      .query(
        `
          SELECT COUNT(*) AS total
          FROM subscription_pubkeys
          WHERE pubkey = ? AND subscription_id != ?
        `,
      )
      .get(pubkey, excludedSubscriptionId);

    if (!isRecord(row)) {
      return 0;
    }
    return readNumberField(row, "total") ?? 0;
  }

  private countNativeSubscriptionsForPubkeyInternal(
    pubkey: string,
    excludedSubscriptionId: number,
  ): number {
    const row = this.db
      .query(
        `
          SELECT COUNT(*) AS total
          FROM native_subscription_pubkeys
          WHERE pubkey = ? AND subscription_id != ?
        `,
      )
      .get(pubkey, excludedSubscriptionId);

    if (!isRecord(row)) {
      return 0;
    }
    return readNumberField(row, "total") ?? 0;
  }

  private countPubkeysForSubscriptionInternal(subscriptionId: number): number {
    const row = this.db
      .query(
        `
          SELECT COUNT(*) AS total
          FROM subscription_pubkeys
          WHERE subscription_id = ?
        `,
      )
      .get(subscriptionId);

    if (!isRecord(row)) {
      return 0;
    }
    return readNumberField(row, "total") ?? 0;
  }

  private countNativePubkeysForSubscriptionInternal(
    subscriptionId: number,
  ): number {
    const row = this.db
      .query(
        `
          SELECT COUNT(*) AS total
          FROM native_subscription_pubkeys
          WHERE subscription_id = ?
        `,
      )
      .get(subscriptionId);

    if (!isRecord(row)) {
      return 0;
    }
    return readNumberField(row, "total") ?? 0;
  }
}
