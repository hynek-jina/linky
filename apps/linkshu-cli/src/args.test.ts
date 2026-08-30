import { describe, expect, it } from "bun:test";
import { UsageError, parseArgs } from "./args";

describe("parseArgs", () => {
  it("reports no command for an empty invocation", () => {
    expect(parseArgs([]).command).toBeUndefined();
  });

  it("splits the command from its operands", () => {
    const parsed = parseArgs(["send", "40"]);
    expect(parsed.command).toBe("send");
    expect(parsed.operands).toEqual(["40"]);
  });

  it("accepts options before and after the command", () => {
    const parsed = parseArgs(["--mint", "http://a", "receive", "cashuBaa"]);
    expect(parsed.options["mint"]).toBe("http://a");
    expect(parsed.command).toBe("receive");
    expect(parsed.operands).toEqual(["cashuBaa"]);
  });

  it("accepts --option=value", () => {
    expect(parseArgs(["--data-dir=/tmp/w"]).options["data-dir"]).toBe("/tmp/w");
  });

  it("collects flags", () => {
    const parsed = parseArgs(["--verbose", "balance"]);
    expect(parsed.flags.has("verbose")).toBe(true);
    expect(parsed.command).toBe("balance");
  });

  it("keeps a token that happens to contain = intact", () => {
    expect(parseArgs(["receive", "cashuBaa=="]).operands).toEqual([
      "cashuBaa==",
    ]);
  });

  it("rejects an unknown option rather than ignoring it", () => {
    expect(() => parseArgs(["--mnit", "http://a"])).toThrow(UsageError);
  });

  it("rejects a value option with nothing after it", () => {
    expect(() => parseArgs(["balance", "--mint"])).toThrow(UsageError);
  });
});
