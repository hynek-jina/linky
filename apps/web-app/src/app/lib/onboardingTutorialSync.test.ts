import * as Evolu from "@evolu/common";
import { describe, expect, it } from "vitest";
import {
  buildDismissedOnboardingTutorialOwnerMetaPayload,
  hasDismissedOnboardingTutorialOwnerMetaRow,
  ONBOARDING_TUTORIAL_OWNER_META_SCOPE,
} from "./onboardingTutorialSync";

const ownerId = Evolu.OwnerId.orThrow("AAAAAAAAAAAAAAAAAAAAAA");

describe("onboardingTutorialSync", () => {
  it("builds the stable dismissed metadata row", () => {
    expect(buildDismissedOnboardingTutorialOwnerMetaPayload()).toEqual({
      id: Evolu.createIdFromString<"OwnerMeta">("onboarding-tutorial-status"),
      scope: ONBOARDING_TUTORIAL_OWNER_META_SCOPE,
      value: "dismissed",
    });
  });

  it("only accepts a dismissed row from the active metadata owner", () => {
    expect(
      hasDismissedOnboardingTutorialOwnerMetaRow(
        [{ ownerId, value: "dismissed" }],
        ownerId,
      ),
    ).toBe(true);
    expect(
      hasDismissedOnboardingTutorialOwnerMetaRow(
        [
          {
            ownerId: Evolu.OwnerId.orThrow("AQEBAQEBAQEBAQEBAQEBAQ"),
            value: "dismissed",
          },
        ],
        ownerId,
      ),
    ).toBe(false);
    expect(
      hasDismissedOnboardingTutorialOwnerMetaRow(
        [{ ownerId, value: "active" }],
        ownerId,
      ),
    ).toBe(false);
  });
});
