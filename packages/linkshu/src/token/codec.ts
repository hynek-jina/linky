import type { TokenText } from "../domain/primitives";
import { notImplementedSync } from "../internal/skeleton";
import type { DecodedToken, ParsedToken } from "./domain";

/**
 * The one token codec. Handles v3 (`cashuA`, base64url JSON), v4 (`cashuB`,
 * base64url CBOR), and legacy cashu.me plain-JSON proof bundles, which are
 * normalized to standard token text. There is exactly one parser in linky;
 * the app's hand-rolled decoders get deleted when it migrates here.
 *
 * All functions are pure and total: malformed input yields `null`, never a
 * throw.
 */

/** Normalizes any supported encoding (including legacy JSON) to token text. */
export const normalizeTokenText = (raw: string): TokenText | null =>
  notImplementedSync("token.normalizeTokenText", { raw });

/**
 * Finds a token inside arbitrary scanned/pasted text: bare tokens,
 * `cashu:`/`web+cashu:`/`lightning:` schemes, URLs carrying the token in
 * query parameters, hash, or path segments, and embedded legacy JSON.
 */
export const extractTokenText = (text: string): TokenText | null =>
  notImplementedSync("token.extractTokenText", { text });

/** Summary metadata (amount, mint, unit, memo) without exposing proofs. */
export const parseTokenText = (raw: string): ParsedToken | null =>
  notImplementedSync("token.parseTokenText", { raw });

/** Full decode; `null` for malformed, proof-less, or multi-mint tokens. */
export const decodeTokenText = (raw: string): DecodedToken | null =>
  notImplementedSync("token.decodeTokenText", { raw });

/** Canonical v4 encoding; roundtrips with `decodeTokenText` by construction. */
export const encodeToken = (token: DecodedToken): TokenText =>
  notImplementedSync("token.encodeToken", { token });
