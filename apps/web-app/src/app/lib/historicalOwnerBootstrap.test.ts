import { describe, expect, it } from "vitest";
import {
  advanceHistoricalOwnerBootstrapState,
  getPendingHistoricalOwnerIds,
  type HistoricalOwnerBootstrapState,
} from "./historicalOwnerBootstrap";

const EMPTY_STATE: HistoricalOwnerBootstrapState = {
  loginKey: "",
  ownerIds: [],
};

describe("historical owner bootstrap", () => {
  it("loads lanes discovered after the initial active owner", () => {
    const afterInitialOwner = advanceHistoricalOwnerBootstrapState(
      EMPTY_STATE,
      "seed-owner",
      ["messages-0"],
    );
    const afterPointerSync = advanceHistoricalOwnerBootstrapState(
      afterInitialOwner,
      "seed-owner",
      ["messages-5"],
    );

    expect(
      getPendingHistoricalOwnerIds(
        ["messages-0", "messages-1", "messages-2", "messages-3", "messages-4"],
        afterPointerSync,
        "seed-owner",
      ),
    ).toEqual(["messages-1", "messages-2", "messages-3", "messages-4"]);
  });

  it("does not reopen old lanes after a normal rotation", () => {
    const afterBootstrap = advanceHistoricalOwnerBootstrapState(
      EMPTY_STATE,
      "seed-owner",
      [
        "messages-0",
        "messages-1",
        "messages-2",
        "messages-3",
        "messages-4",
        "messages-5",
      ],
    );
    const afterRotation = advanceHistoricalOwnerBootstrapState(
      afterBootstrap,
      "seed-owner",
      ["messages-6"],
    );

    expect(
      getPendingHistoricalOwnerIds(
        [
          "messages-0",
          "messages-1",
          "messages-2",
          "messages-3",
          "messages-4",
          "messages-5",
        ],
        afterRotation,
        "seed-owner",
      ),
    ).toEqual([]);
  });

  it("starts fresh for a different seed login", () => {
    const previousLogin = advanceHistoricalOwnerBootstrapState(
      EMPTY_STATE,
      "first-seed",
      ["messages-0", "messages-1"],
    );
    const nextLogin = advanceHistoricalOwnerBootstrapState(
      previousLogin,
      "second-seed",
      ["next-messages-2"],
    );

    expect(nextLogin).toEqual({
      loginKey: "second-seed",
      ownerIds: ["next-messages-2"],
    });
  });
});
