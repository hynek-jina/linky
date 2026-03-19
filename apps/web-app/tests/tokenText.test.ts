import { describe, expect, it } from "vitest";
import {
  clearCashuTokenUrlParams,
  extractCashuTokenFromText,
  extractCashuTokenFromUrl,
} from "../src/app/lib/tokenText";

const SAMPLE_TOKEN =
  "cashuAeyJ0b2tlbiI6W3sibWludCI6Imh0dHBzOi8vbWludC5leGFtcGxlIiwicHJvb2ZzIjpbeyJhbW91bnQiOjEsImlkIjoia2V5c2V0IiwiQyI6InNpZyIsInNlY3JldCI6InNlY3JldCJ9XX1dfQ";

describe("extractCashuTokenFromText", () => {
  it("finds a token inside cashu protocol urls", () => {
    expect(extractCashuTokenFromText(`cashu://${SAMPLE_TOKEN}`)).toBe(
      SAMPLE_TOKEN,
    );
    expect(extractCashuTokenFromText(`web+cashu://${SAMPLE_TOKEN}`)).toBe(
      SAMPLE_TOKEN,
    );
  });
});

describe("extractCashuTokenFromUrl", () => {
  it("reads protocol-handler launch params", () => {
    const url = new URL(
      `https://linky.example/?cashu=web%2Bcashu%3A%2F%2F${SAMPLE_TOKEN}`,
    );

    expect(extractCashuTokenFromUrl(url)).toBe(SAMPLE_TOKEN);
  });

  it("falls back to generic uri params", () => {
    const url = new URL(
      `https://linky.example/?uri=cashu%3A%2F%2F${SAMPLE_TOKEN}`,
    );

    expect(extractCashuTokenFromUrl(url)).toBe(SAMPLE_TOKEN);
  });
});

describe("clearCashuTokenUrlParams", () => {
  it("removes handled launch params and keeps unrelated search state", () => {
    const url = new URL(
      `https://linky.example/?cashu=web%2Bcashu%3A%2F%2F${SAMPLE_TOKEN}&foo=bar#wallet`,
    );

    expect(clearCashuTokenUrlParams(url)).toBe(true);
    expect(url.searchParams.get("cashu")).toBeNull();
    expect(url.searchParams.get("foo")).toBe("bar");
    expect(url.hash).toBe("#wallet");
  });
});
