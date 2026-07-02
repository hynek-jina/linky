import { describe, expect, it } from "vitest";
import { parseSpdPayment, tryParseSpdPayment } from "./spdPayment";

describe("spdPayment", () => {
  it("parses Czech SPD payment fields", () => {
    const payment = parseSpdPayment(
      "SPD*1.0*ACC:CZ5855000000001265098001*AM:480.50*CC:CZK*X-VS:1234567890*MSG:Faktura",
    );

    expect(payment.payload).toBe(
      "SPD*1.0*ACC:CZ5855000000001265098001*AM:480.50*CC:CZK*X-VS:1234567890*MSG:Faktura",
    );
    expect(payment.fields["ACC"]).toBe("CZ5855000000001265098001");
    expect(payment.fields["AM"]).toBe("480.50");
    expect(payment.fields["CC"]).toBe("CZK");
    expect(payment.fields["X-VS"]).toBe("1234567890");
    expect(payment.fields["MSG"]).toBe("Faktura");
  });

  it("decodes percent-encoded values", () => {
    const payment = parseSpdPayment(
      "SPD*1.0*ACC:CZ5855000000001265098001*MSG:Faktura%202026",
    );

    expect(payment.fields["MSG"]).toBe("Faktura 2026");
  });

  it("rejects SPD payments without a recipient account", () => {
    expect(() => parseSpdPayment("SPD*1.0*AM:480.50*CC:CZK")).toThrow(
      "spd-missing-account",
    );
    expect(tryParseSpdPayment("SPD*1.0*AM:480.50*CC:CZK")).toBeNull();
  });
});
