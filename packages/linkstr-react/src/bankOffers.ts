import { BankOffers } from "@linky/linkstr";
import type { BankOfferDraft } from "@linky/linkstr";
import { Effect } from "effect";
import { linkstrRuntimeAtom } from "./runtime";

export const sendBankOfferAtom = linkstrRuntimeAtom.fn<BankOfferDraft>()(
  (draft) => Effect.flatMap(BankOffers, (bankOffers) => bankOffers.send(draft)),
);
