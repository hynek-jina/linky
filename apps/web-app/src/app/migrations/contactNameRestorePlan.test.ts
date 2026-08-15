// ONE-TIME MIGRATION — DELETE ME EVENTUALLY (with the rest of this folder).

import { describe, expect, it } from "vitest";
import type { ContactNameHistoryEntry } from "./contactNameRestorePlan";
import {
  planContactNameRestores,
  PROFILE_FOLLOW_DEPLOYED_AT_MS,
} from "./contactNameRestorePlan";

const DEPLOY = PROFILE_FOLLOW_DEPLOYED_AT_MS;

const timestampKey = (ms: number, counter = 0): string =>
  ms.toString(16).padStart(12, "0") +
  counter.toString(16).padStart(4, "0") +
  "00".repeat(8);

const write = (
  contactId: string,
  column: "name" | "nameSetByUser",
  ms: number,
  value: string | null,
  counter = 0,
): ContactNameHistoryEntry => ({
  column,
  contactId,
  timestampKey: timestampKey(ms, counter),
  timestampMs: ms,
  value,
});

const contact = (
  id: string,
  name: string,
  nameSetByUser: number | null = null,
) => ({ id, name, nameSetByUser });

describe("planContactNameRestores", () => {
  it("restores a custom name overwritten by the profile sync", () => {
    const restores = planContactNameRestores(
      [contact("c1", "Profile Name")],
      [
        write("c1", "name", DEPLOY - 1000, "My Custom Name"),
        write("c1", "name", DEPLOY + 1000, "Profile Name"),
      ],
    );
    expect(restores).toEqual([{ id: "c1", name: "My Custom Name" }]);
  });

  it("restores the newest pre-deploy value across multiple writes", () => {
    const restores = planContactNameRestores(
      [contact("c1", "Profile Name")],
      [
        write("c1", "name", DEPLOY - 5000, "First Name"),
        write("c1", "name", DEPLOY - 1000, "Renamed Later"),
        write("c1", "name", DEPLOY + 1000, "Profile Name"),
        write("c1", "name", DEPLOY + 2000, "Profile Name 2"),
      ],
    );
    expect(restores).toEqual([{ id: "c1", name: "Renamed Later" }]);
  });

  it("orders same-millisecond writes by the HLC counter", () => {
    const restores = planContactNameRestores(
      [contact("c1", "Profile Name")],
      [
        write("c1", "name", DEPLOY - 1000, "Second", 2),
        write("c1", "name", DEPLOY - 1000, "First", 1),
        write("c1", "name", DEPLOY + 1000, "Profile Name"),
      ],
    );
    expect(restores).toEqual([{ id: "c1", name: "Second" }]);
  });

  it("skips contacts already marked nameSetByUser", () => {
    const restores = planContactNameRestores(
      [contact("c1", "Fixed By User", 1)],
      [
        write("c1", "name", DEPLOY - 1000, "My Custom Name"),
        write("c1", "name", DEPLOY + 1000, "Profile Name"),
      ],
    );
    expect(restores).toEqual([]);
  });

  it("skips contacts whose name was only filled in from an empty state", () => {
    const restores = planContactNameRestores(
      [contact("c1", "Profile Name")],
      [write("c1", "name", DEPLOY + 1000, "Profile Name")],
    );
    expect(restores).toEqual([]);
  });

  it("skips contacts with no post-deploy name writes", () => {
    const restores = planContactNameRestores(
      [contact("c1", "My Custom Name")],
      [write("c1", "name", DEPLOY - 1000, "My Custom Name")],
    );
    expect(restores).toEqual([]);
  });

  it("skips contacts the user renamed post-deploy in the editor", () => {
    const restores = planContactNameRestores(
      [contact("c1", "Fixed Again")],
      [
        write("c1", "name", DEPLOY - 1000, "My Custom Name"),
        write("c1", "name", DEPLOY + 1000, "Profile Name"),
        write("c1", "name", DEPLOY + 2000, "Fixed Again", 1),
        write("c1", "nameSetByUser", DEPLOY + 2000, "1", 1),
      ],
    );
    expect(restores).toEqual([]);
  });

  it("skips contacts the user reset to the profile name post-deploy", () => {
    const restores = planContactNameRestores(
      [contact("c1", "Profile Name")],
      [
        write("c1", "name", DEPLOY - 1000, "My Custom Name"),
        write("c1", "name", DEPLOY + 1000, "Profile Name", 1),
        write("c1", "nameSetByUser", DEPLOY + 1000, null, 1),
      ],
    );
    expect(restores).toEqual([]);
  });

  it("skips when the pre-deploy value equals the current name", () => {
    const restores = planContactNameRestores(
      [contact("c1", "Same Name")],
      [
        write("c1", "name", DEPLOY - 1000, "Same Name"),
        write("c1", "name", DEPLOY + 1000, "Same Name"),
      ],
    );
    expect(restores).toEqual([]);
  });

  it("handles several contacts independently", () => {
    const restores = planContactNameRestores(
      [contact("clobbered", "Profile Name"), contact("untouched", "Kept Name")],
      [
        write("clobbered", "name", DEPLOY - 1000, "My Custom Name"),
        write("clobbered", "name", DEPLOY + 1000, "Profile Name"),
        write("untouched", "name", DEPLOY - 1000, "Kept Name"),
      ],
    );
    expect(restores).toEqual([{ id: "clobbered", name: "My Custom Name" }]);
  });
});
