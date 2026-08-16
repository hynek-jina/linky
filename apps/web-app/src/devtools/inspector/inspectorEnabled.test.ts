import { describe, expect, it } from "vitest";

import { resolveInspectorEnabled } from "./inspectorEnabled";

describe("resolveInspectorEnabled", () => {
  it("defaults off in production and on in development", () => {
    expect(resolveInspectorEnabled(null, false)).toBe(false);
    expect(resolveInspectorEnabled(null, true)).toBe(true);
  });

  it("honors an explicit persisted preference in every build", () => {
    expect(resolveInspectorEnabled(true, false)).toBe(true);
    expect(resolveInspectorEnabled(false, true)).toBe(false);
  });
});
