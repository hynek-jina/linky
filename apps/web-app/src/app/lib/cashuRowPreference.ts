import { isCashuTokenErrorState } from "./cashuTokenState";

interface CashuRowPreferenceInput {
  activeOwnerId: string;
  candidate: {
    isDeleted?: unknown;
    ownerId?: unknown;
    state?: unknown;
  };
  existing: {
    isDeleted?: unknown;
    ownerId?: unknown;
    state?: unknown;
  };
  ownerRank: ReadonlyMap<string, number>;
}

const readOwnerId = (row: { ownerId?: unknown }): string =>
  typeof row.ownerId === "string" ? row.ownerId.trim() : "";

export const isCashuRowCandidateBetter = ({
  activeOwnerId,
  candidate,
  existing,
  ownerRank,
}: CashuRowPreferenceInput): boolean => {
  const candidateOwnerId = readOwnerId(candidate);
  const existingOwnerId = readOwnerId(existing);
  const candidateRank = ownerRank.get(candidateOwnerId) ?? -1;
  const existingRank = ownerRank.get(existingOwnerId) ?? -1;
  const candidateIsDeleted = Boolean(candidate.isDeleted);
  const existingIsDeleted = Boolean(existing.isDeleted);

  // A tombstone in a newer owner lane must hide an older live duplicate.
  // Within one lane, however, a later valid re-import should beat an old
  // deleted alias rather than remaining invisible forever.
  if (candidateIsDeleted !== existingIsDeleted) {
    if (candidateRank !== existingRank) {
      return candidateRank > existingRank;
    }
    return !candidateIsDeleted;
  }

  const candidateIsError = isCashuTokenErrorState(candidate.state);
  const existingIsError = isCashuTokenErrorState(existing.state);
  if (candidateIsError !== existingIsError) {
    return !candidateIsError;
  }

  if (candidateOwnerId === activeOwnerId && existingOwnerId !== activeOwnerId) {
    return true;
  }

  if (existingOwnerId === activeOwnerId && candidateOwnerId !== activeOwnerId) {
    return false;
  }

  return candidateRank > existingRank;
};
