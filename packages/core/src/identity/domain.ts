import { Schema } from "effect";
import { Unit8ArraySchema } from "../utils/schemas";

export const MasterSecret = Unit8ArraySchema.pipe(Schema.brand("MasterSecret"));
export type MasterSecret = typeof MasterSecret.Type;

export const NostrPrivateKey = Unit8ArraySchema.pipe(
  Schema.brand("NostrPrivateKey"),
);
export type NostrPrivateKey = typeof NostrPrivateKey.Type;

export const NostrPublicKeyHex = Schema.String.pipe(
  Schema.brand("NostrPublicKeyHex"),
);
export type NostrPublicKeyHex = typeof NostrPublicKeyHex.Type;

export const CashuSeed = Unit8ArraySchema.pipe(Schema.brand("CashuSeed"));
export type CashuSeed = typeof CashuSeed.Type;

export const OwnerKey = Unit8ArraySchema.pipe(Schema.brand("OwnerKey"));
export type OwnerKey = typeof OwnerKey.Type;
