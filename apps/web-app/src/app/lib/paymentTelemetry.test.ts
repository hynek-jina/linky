import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  classifyPaymentErrorCode,
  createLocalPaymentTelemetryEvent,
  normalizePaymentTelemetryErrorDetail,
} from "./paymentTelemetry";

beforeAll(() => {
  vi.stubGlobal("__APP_VERSION__", "test");
});

describe("classifyPaymentErrorCode", () => {
  it("classifies short keyset mapping failures explicitly", () => {
    expect(
      classifyPaymentErrorCode(
        "A short keyset ID v2 was encountered, but got no keysets to map it to.",
      ),
    ).toBe("short_keyset_id_unmapped");
  });
});

describe("normalizePaymentTelemetryErrorDetail", () => {
  it("preserves the exact error wording when present", () => {
    expect(
      normalizePaymentTelemetryErrorDetail(
        "Error: A short keyset ID v2 was encountered, but got no keysets to map it to.",
      ),
    ).toBe(
      "Error: A short keyset ID v2 was encountered, but got no keysets to map it to.",
    );
  });
});

describe("createLocalPaymentTelemetryEvent", () => {
  it("stores both a stable error code and the original detail", () => {
    const error =
      "Error: A short keyset ID v2 was encountered, but got no keysets to map it to.";

    expect(
      createLocalPaymentTelemetryEvent(
        {
          direction: "out",
          status: "error",
          method: "lightning_address",
          phase: "melt",
          amount: 123,
          fee: null,
          error,
        },
        1_700_000_000,
      ),
    ).toMatchObject({
      errorCode: "short_keyset_id_unmapped",
      errorDetail: error,
    });
  });
});
