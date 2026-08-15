import { SeenReceipts } from "@linky/linkstr";
import type { SeenReceiptDraft } from "@linky/linkstr";
import { Effect } from "effect";
import { linkstrRuntimeAtom } from "./runtime";

export const sendSeenReceiptAtom = linkstrRuntimeAtom.fn<SeenReceiptDraft>()(
  (draft) => Effect.flatMap(SeenReceipts, (receipts) => receipts.send(draft)),
);
