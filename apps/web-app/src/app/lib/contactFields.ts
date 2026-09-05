import * as Evolu from "@evolu/common";
import type { OptionalText } from "../types/appTypes";

export const toEvoluText = (
  value: OptionalText,
): Evolu.NonEmptyString1000 | null => {
  const parsed = Evolu.NonEmptyString1000.fromUnknown(
    String(value ?? "").trim(),
  );
  return parsed.ok ? parsed.value : null;
};

interface ContactTextFields {
  name?: OptionalText;
  npub?: OptionalText;
  lnAddress?: OptionalText;
  groupName?: OptionalText;
  groupNamesJson?: OptionalText;
}

export const toContactTextFields = (contact: ContactTextFields) => ({
  name: toEvoluText(contact.name),
  npub: toEvoluText(contact.npub),
  lnAddress: toEvoluText(contact.lnAddress),
  groupName: toEvoluText(contact.groupName),
  groupNamesJson: toEvoluText(contact.groupNamesJson),
});
