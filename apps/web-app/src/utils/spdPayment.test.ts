import { describe, expect, it } from "vitest";
import { CurrencyCode, encode, PaymentOptions } from "bysquare/pay";
import {
  getBankPaymentOfferCurrency,
  isBankPaymentPayload,
  parseBankPayment,
  parseSpdPayment,
  tryParseBankPayment,
  tryParseSpdPayment,
} from "./spdPayment";

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
    expect(isBankPaymentPayload("SPD*1.0*AM:480.50*CC:CZK")).toBe(true);
  });

  it("decodes Slovak PAY by square euro payments", () => {
    const payload = encode({
      invoiceId: "20260042",
      payments: [
        {
          amount: 123.45,
          bankAccounts: [{ bic: "TATRSKBX", iban: "SK9611000000002918599669" }],
          beneficiary: { name: "Dodávateľ s.r.o." },
          currencyCode: CurrencyCode.EUR,
          paymentDueDate: "20260815",
          paymentNote: "Faktúra 42",
          type: PaymentOptions.PaymentOrder,
          variableSymbol: "20260042",
        },
      ],
    });

    const payment = parseBankPayment(payload);

    expect(payment.format).toBe("bysquare");
    expect(payment.payload).toBe(payload);
    expect(payment.fields["ACC"]).toBe("SK9611000000002918599669");
    expect(payment.fields["AM"]).toBe("123.45");
    expect(payment.fields["CC"]).toBe("EUR");
    expect(payment.fields["RN"]).toBe("Dodavatel s.r.o.");
    expect(payment.fields["X-VS"]).toBe("20260042");
    expect(getBankPaymentOfferCurrency(payload)).toBe("EUR");
  });

  it("parses European Payments Council SEPA QR payments", () => {
    const payload = [
      "BCD",
      "002",
      "1",
      "SCT",
      "GIBAATWWXXX",
      "European Merchant",
      "AT611904300234573201",
      "EUR89.90",
      "GDDS",
      "RF18539007547034",
      "",
      "Invoice 42",
    ].join("\n");

    const payment = parseBankPayment(payload);

    expect(payment.format).toBe("epc");
    expect(payment.fields["ACC"]).toBe("AT611904300234573201");
    expect(payment.fields["AM"]).toBe("89.90");
    expect(payment.fields["BIC"]).toBe("GIBAATWWXXX");
    expect(payment.fields["CC"]).toBe("EUR");
    expect(payment.fields["RF"]).toBe("RF18539007547034");
    expect(getBankPaymentOfferCurrency(payload)).toBe("EUR");
  });

  it("does not classify unrelated uppercase text as a bank payment", () => {
    expect(tryParseBankPayment("THISISNOTABANKPAYMENT")).toBeNull();
    expect(
      getBankPaymentOfferCurrency("SPD*1.0*ACC:US123*AM:10*CC:USD"),
    ).toBeNull();
  });
});
