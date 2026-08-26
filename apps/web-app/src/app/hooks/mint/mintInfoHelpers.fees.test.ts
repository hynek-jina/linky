import { describe, expect, it } from "vitest";
import {
  extractActiveKeysetPpk,
  getMintFeePpk,
  parseMintInfoPayload,
} from "./mintInfoHelpers";

const keysets = {
  keysets: [
    { id: "a", unit: "sat", active: false, input_fee_ppk: 100 },
    { id: "b", unit: "sat", active: true, input_fee_ppk: 0 },
    { id: "c", unit: "usd", active: true, input_fee_ppk: 500 },
  ],
};

describe("mint fee parsing", () => {
  it("prefers the active sat keyset fee over inactive ones", () => {
    expect(extractActiveKeysetPpk(keysets)).toBe(0);
    expect(extractActiveKeysetPpk({ keysets: [] })).toBeNull();
    expect(extractActiveKeysetPpk(null)).toBeNull();
  });

  it("stores the keyset ppk in feesJson and reads it back", () => {
    const parsed = parseMintInfoPayload({ name: "mint" }, keysets);
    expect(getMintFeePpk(parsed.feesJson)).toBe(0);
    expect(getMintFeePpk(null)).toBeNull();
    expect(getMintFeePpk("not json")).toBeNull();
  });
});
