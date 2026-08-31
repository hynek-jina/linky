import type * as Evolu from "@evolu/common";
import { acceptCashuToken } from "../../../cashuAccept";
import { LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY } from "../../../utils/constants";
import { safeLocalStorageSet } from "../../../utils/storage";
import { getUnknownErrorMessage } from "../../../utils/unknown";
import {
  buildSparseCashuTokenPayload,
  createCashuTokenId,
} from "../../lib/cashuTokenIdentity";

type AcceptedCashuToken = Awaited<ReturnType<typeof acceptCashuToken>>;
type EvoluMutations = ReturnType<typeof import("../../../evolu").useEvolu>;

interface PersistenceResult {
  ok: boolean;
  error?: unknown;
}

interface AcceptAndPersistCashuTokenParams {
  acceptToken?: (token: string) => Promise<AcceptedCashuToken>;
  afterPersist: (rawToken: string, acceptedToken: string) => void;
  beforePersist: (acceptedToken: string) => void;
  isAlreadyStored: (token: string) => boolean;
  persistAccepted: (
    rawToken: string,
    acceptedToken: string,
    ownerId: Evolu.OwnerId,
  ) => PersistenceResult;
  persistFailure: (
    rawToken: string,
    message: string,
    ownerId: Evolu.OwnerId,
  ) => PersistenceResult;
  resolveOwnerId: () => Promise<Evolu.OwnerId | null>;
  tokenText: string;
}

interface DefaultCashuTokenPersistence {
  ensureCashuTokenPersisted: (token: string) => void;
  rememberCashuTokenKnown: (...tokens: readonly string[]) => void;
  upsert: EvoluMutations["upsert"];
}

interface DefaultAcceptAndPersistCashuTokenParams {
  acceptToken?: (token: string) => Promise<AcceptedCashuToken>;
  isAlreadyStored: (token: string) => boolean;
  resolveOwnerId: () => Promise<Evolu.OwnerId | null>;
  tokenText: string;
}

export type AcceptAndPersistCashuTokenResult =
  | { status: "empty" }
  | { status: "duplicate-before-accept" }
  | { status: "storage-unavailable" }
  | {
      status: "accepted";
      accepted: AcceptedCashuToken;
      rawToken: string;
    }
  | {
      status: "persist-failed";
      error: string;
    }
  | {
      status: "accept-failed";
      error: string;
      persistenceError: string | null;
    };

export const acceptAndPersistCashuToken = async ({
  acceptToken = acceptCashuToken,
  afterPersist,
  beforePersist,
  isAlreadyStored,
  persistAccepted,
  persistFailure,
  resolveOwnerId,
  tokenText,
}: AcceptAndPersistCashuTokenParams): Promise<AcceptAndPersistCashuTokenResult> => {
  const rawToken = tokenText.trim();
  if (!rawToken) return { status: "empty" };
  if (isAlreadyStored(rawToken)) return { status: "duplicate-before-accept" };

  const ownerId = await resolveOwnerId();
  if (!ownerId) return { status: "storage-unavailable" };

  try {
    const accepted = await acceptToken(rawToken);
    const acceptedToken = String(accepted.token ?? "").trim();
    beforePersist(acceptedToken);

    const persisted = persistAccepted(rawToken, acceptedToken, ownerId);
    if (!persisted.ok) {
      return {
        status: "persist-failed",
        error: getUnknownErrorMessage(persisted.error, "unknown"),
      };
    }

    afterPersist(rawToken, acceptedToken);
    return { status: "accepted", accepted, rawToken };
  } catch (error) {
    const message = getUnknownErrorMessage(error, "Accept failed");
    const failureOwnerId = await resolveOwnerId();
    let persistenceError: string | null = null;
    if (failureOwnerId) {
      const persisted = persistFailure(rawToken, message, failureOwnerId);
      if (!persisted.ok) {
        persistenceError = getUnknownErrorMessage(persisted.error, "unknown");
      }
    }
    return { status: "accept-failed", error: message, persistenceError };
  }
};

export const createDefaultCashuTokenAcceptor = ({
  ensureCashuTokenPersisted,
  rememberCashuTokenKnown,
  upsert,
}: DefaultCashuTokenPersistence) => {
  return async ({
    acceptToken,
    isAlreadyStored,
    resolveOwnerId,
    tokenText,
  }: DefaultAcceptAndPersistCashuTokenParams) =>
    await acceptAndPersistCashuToken({
      tokenText,
      isAlreadyStored,
      resolveOwnerId,
      ...(acceptToken ? { acceptToken } : {}),
      beforePersist: (acceptedToken) => {
        if (acceptedToken) {
          safeLocalStorageSet(
            LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY,
            acceptedToken,
          );
        }
      },
      persistAccepted: (rawToken, acceptedToken, ownerId) =>
        upsert(
          "cashuToken",
          buildSparseCashuTokenPayload({
            id: createCashuTokenId(rawToken),
            token: acceptedToken,
            state: "accepted",
            error: null,
          }),
          { ownerId },
        ),
      afterPersist: (rawToken, acceptedToken) => {
        rememberCashuTokenKnown(rawToken, acceptedToken);
        safeLocalStorageSet(
          LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY,
          acceptedToken,
        );
        ensureCashuTokenPersisted(acceptedToken);
      },
      persistFailure: (rawToken, message, ownerId) =>
        upsert(
          "cashuToken",
          buildSparseCashuTokenPayload({
            id: createCashuTokenId(rawToken),
            token: rawToken,
            state: "error",
            error: message,
          }),
          { ownerId },
        ),
    });
};
