import type { Proof, ProofState } from "@cashu/cashu-ts";
import {
  partitionCashuProofGroupsByState,
  type CashuProofGroup,
  type CashuProofGroupPartition,
} from "../../../utils/cashuProofs";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isCashuProof = (value: unknown): value is Proof => {
  if (!isRecord(value)) return false;
  return (
    "amount" in value &&
    typeof value.secret === "string" &&
    typeof value.C === "string" &&
    typeof value.id === "string"
  );
};

export type CashuProofStateCheck<TId> =
  | {
      status: "ok";
      partition: CashuProofGroupPartition<TId>;
    }
  | { status: "unavailable" };

export const checkCashuProofGroupsByState = async <TId>(
  groups: ReadonlyArray<CashuProofGroup<TId>>,
  checkProofsStates: (proofs: Proof[]) => Promise<ProofState[]>,
): Promise<CashuProofStateCheck<TId>> => {
  try {
    const proofs = groups.flatMap((group) => group.proofs);
    const response = await checkProofsStates(proofs);
    const states = Array.isArray(response) ? response : [];
    return {
      status: "ok",
      partition: partitionCashuProofGroupsByState(groups, states),
    };
  } catch {
    return { status: "unavailable" };
  }
};
