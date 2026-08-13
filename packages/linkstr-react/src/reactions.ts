import { Reactions } from "@linky/linkstr";
import type { ReactionDraft, RetractionDraft } from "@linky/linkstr";
import { Effect } from "effect";
import { linkstrRuntimeAtom } from "./runtime";

export const sendReactionAtom = linkstrRuntimeAtom.fn<ReactionDraft>()(
  (draft) => Effect.flatMap(Reactions, (reactions) => reactions.react(draft)),
);

export const retractReactionAtom = linkstrRuntimeAtom.fn<RetractionDraft>()(
  (draft) => Effect.flatMap(Reactions, (reactions) => reactions.retract(draft)),
);
