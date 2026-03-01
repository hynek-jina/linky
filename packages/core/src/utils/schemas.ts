import { Schema } from "effect";

export const Unit8ArraySchema = Schema.declare(
  (input: unknown): input is Uint8Array => input instanceof Uint8Array,
);
export type Unit8ArraySchema = typeof Unit8ArraySchema.Type;
