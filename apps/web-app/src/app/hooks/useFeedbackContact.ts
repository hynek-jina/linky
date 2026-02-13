import * as Evolu from "@evolu/common";
import React from "react";
import type { OwnerId } from "@evolu/common";
import type { ContactId } from "../../evolu";
import { navigateTo } from "../../hooks/useRouting";
import { FEEDBACK_CONTACT_NPUB } from "../../utils/constants";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

interface UseFeedbackContactParams<
  TContact extends { id?: unknown; name?: unknown; npub?: unknown },
> {
  appOwnerId: OwnerId | null;
  contacts: readonly TContact[];
  insert: EvoluMutations["insert"];
  pushToast: (message: string) => void;
  t: (key: string) => string;
  update: EvoluMutations["update"];
}

export const useFeedbackContact = <
  TContact extends { id?: unknown; name?: unknown; npub?: unknown },
>({
  appOwnerId,
  contacts,
  insert,
  pushToast,
  t,
  update,
}: UseFeedbackContactParams<TContact>) => {
  const openFeedbackContactPendingRef = React.useRef(false);

  const openFeedbackContact = React.useCallback(() => {
    const targetNpub = FEEDBACK_CONTACT_NPUB;
    const existing = contacts.find(
      (contact) => String(contact.npub ?? "").trim() === targetNpub,
    );

    if (existing?.id) {
      if (String(existing.name ?? "") === "Feedback") {
        update("contact", { id: existing.id as ContactId, name: null });
      }
      openFeedbackContactPendingRef.current = false;
      navigateTo({ route: "contact", id: existing.id as ContactId });
      return;
    }

    openFeedbackContactPendingRef.current = true;

    const payload = {
      name: null,
      npub: targetNpub as typeof Evolu.NonEmptyString1000.Type,
      lnAddress: null,
      groupName: null,
    };

    const result = appOwnerId
      ? insert("contact", payload, { ownerId: appOwnerId })
      : insert("contact", payload);

    if (result.ok) return;

    openFeedbackContactPendingRef.current = false;
    pushToast(`${t("errorPrefix")}: ${String(result.error)}`);
  }, [appOwnerId, contacts, insert, pushToast, t, update]);

  React.useEffect(() => {
    if (!openFeedbackContactPendingRef.current) return;

    const targetNpub = FEEDBACK_CONTACT_NPUB;
    const existing = contacts.find(
      (contact) => String(contact.npub ?? "").trim() === targetNpub,
    );
    if (!existing?.id) return;

    openFeedbackContactPendingRef.current = false;
    navigateTo({ route: "contact", id: existing.id as ContactId });
  }, [contacts]);

  return {
    openFeedbackContact,
  };
};
