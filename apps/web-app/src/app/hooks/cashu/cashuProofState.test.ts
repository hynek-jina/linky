import {
  Amount,
  CheckStateEnum,
  type Proof,
  type ProofState,
} from "@cashu/cashu-ts";
import { describe, expect, it } from "vitest";
import { checkCashuProofGroupsByState } from "./cashuProofState";

const makeProof = (secret: string): Proof => ({
  amount: Amount.from(1),
  C: `C-${secret}`,
  id: "keyset",
  secret,
});

const makeState = (state: ProofState["state"]): ProofState => ({
  Y: "Y",
  state,
  witness: null,
});

describe("checkCashuProofGroupsByState", () => {
  it("checks all proofs once and partitions results by source group", async () => {
    const first = makeProof("first");
    const second = makeProof("second");
    const checked: Proof[][] = [];

    const result = await checkCashuProofGroupsByState(
      [
        { id: "first-row", proofs: [first] },
        { id: "second-row", proofs: [second] },
      ],
      async (proofs) => {
        checked.push(proofs);
        return [
          makeState(CheckStateEnum.UNSPENT),
          makeState(CheckStateEnum.SPENT),
        ];
      },
    );

    expect(checked).toEqual([[first, second]]);
    expect(result).toEqual({
      status: "ok",
      partition: {
        liveGroups: [{ id: "first-row", proofs: [first] }],
        fullySpentIds: ["second-row"],
        unknownStateIds: [],
      },
    });
  });

  it("reports an unavailable check without guessing proof state", async () => {
    const result = await checkCashuProofGroupsByState(
      [{ id: "row", proofs: [makeProof("proof")] }],
      async () => {
        throw new Error("offline");
      },
    );

    expect(result).toEqual({ status: "unavailable" });
  });
});
