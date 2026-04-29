import type { Proof, ProofState } from "@cashu/cashu-ts";
import { describe, expect, it } from "vitest";
import {
  filterUnspentCashuProofs,
  partitionCashuProofGroupsByState,
} from "./cashuProofs";

const mkProof = (n: number): Proof => ({
  id: `ks${n}`,
  amount: n,
  secret: `sec${n}`,
  C: `c${n}`,
});

const mkState = (state: "UNSPENT" | "SPENT" | "PENDING"): ProofState => ({
  Y: "",
  state: state as ProofState["state"],
  witness: null,
});

describe("filterUnspentCashuProofs", () => {
  it("preserves alignment with input order", () => {
    const proofs = [mkProof(1), mkProof(2), mkProof(3)];
    const states: ProofState[] = [
      mkState("UNSPENT"),
      mkState("SPENT"),
      mkState("UNSPENT"),
    ];
    expect(filterUnspentCashuProofs(proofs, states)).toEqual([
      proofs[0],
      proofs[2],
    ]);
  });

  it("returns all proofs when state array length mismatches", () => {
    const proofs = [mkProof(1), mkProof(2)];
    const states: ProofState[] = [mkState("SPENT")];
    expect(filterUnspentCashuProofs(proofs, states)).toEqual(proofs);
  });
});

describe("partitionCashuProofGroupsByState", () => {
  it("does not poison unrelated rows when one row is fully spent", () => {
    // This is the user-reported scenario: tokens A and B are unspent, C is
    // spent. Previously the merged swap returned 'Token already spent' and
    // the catch handler marked the *primary* row as invalid. With the
    // partition, only C is marked spent.
    const groups = [
      { id: "A", proofs: [mkProof(1), mkProof(2)] },
      { id: "B", proofs: [mkProof(3)] },
      { id: "C", proofs: [mkProof(4)] },
    ];
    const states: ProofState[] = [
      mkState("UNSPENT"), // A.0
      mkState("UNSPENT"), // A.1
      mkState("UNSPENT"), // B.0
      mkState("SPENT"), // C.0
    ];
    const partition = partitionCashuProofGroupsByState(groups, states);

    expect(partition.fullySpentIds).toEqual(["C"]);
    expect(partition.unknownStateIds).toEqual([]);
    expect(partition.liveGroups.map((g) => g.id)).toEqual(["A", "B"]);
    expect(partition.liveGroups[0].proofs).toHaveLength(2);
    expect(partition.liveGroups[1].proofs).toHaveLength(1);
  });

  it("keeps a partially-spent row alive with only the unspent proofs", () => {
    const groups = [{ id: "A", proofs: [mkProof(1), mkProof(2), mkProof(3)] }];
    const states: ProofState[] = [
      mkState("SPENT"),
      mkState("UNSPENT"),
      mkState("SPENT"),
    ];
    const partition = partitionCashuProofGroupsByState(groups, states);

    expect(partition.fullySpentIds).toEqual([]);
    expect(partition.unknownStateIds).toEqual([]);
    expect(partition.liveGroups).toHaveLength(1);
    expect(partition.liveGroups[0].proofs).toEqual([groups[0].proofs[1]]);
  });

  it("treats PENDING as unknown — not spent — so the row is not nuked", () => {
    // Only PENDING and SPENT in the same group: we don't know, so don't
    // claim certainty.
    const groups = [{ id: "A", proofs: [mkProof(1), mkProof(2)] }];
    const states: ProofState[] = [mkState("PENDING"), mkState("SPENT")];
    const partition = partitionCashuProofGroupsByState(groups, states);

    expect(partition.fullySpentIds).toEqual([]);
    expect(partition.unknownStateIds).toEqual(["A"]);
    expect(partition.liveGroups).toEqual([]);
  });

  it("flags rows with truncated mint response as unknown", () => {
    const groups = [
      { id: "A", proofs: [mkProof(1), mkProof(2)] },
      { id: "B", proofs: [mkProof(3)] },
    ];
    // Mint only returned 2 states for 3 proofs — we get one full group plus
    // a truncated B. The cashu-ts client wouldn't normally do this but we
    // defensively partition without throwing.
    const states: ProofState[] = [mkState("UNSPENT"), mkState("UNSPENT")];
    const partition = partitionCashuProofGroupsByState(groups, states);

    expect(partition.liveGroups.map((g) => g.id)).toEqual(["A"]);
    expect(partition.unknownStateIds).toEqual(["B"]);
    expect(partition.fullySpentIds).toEqual([]);
  });

  it("marks a row spent only when ALL its proofs are SPENT", () => {
    const groups = [{ id: "A", proofs: [mkProof(1), mkProof(2)] }];
    const states: ProofState[] = [mkState("SPENT"), mkState("SPENT")];
    const partition = partitionCashuProofGroupsByState(groups, states);

    expect(partition.fullySpentIds).toEqual(["A"]);
    expect(partition.liveGroups).toEqual([]);
    expect(partition.unknownStateIds).toEqual([]);
  });
});
