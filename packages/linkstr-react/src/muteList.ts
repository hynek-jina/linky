import { MuteList } from "@linky/linkstr";
import type { Pubkey } from "@linky/linkstr";
import { Effect } from "effect";
import { linkstrRuntimeAtom } from "./runtime";

export const publishMuteListAtom = linkstrRuntimeAtom.fn<
  ReadonlyArray<Pubkey>
>()((pubkeys) =>
  Effect.flatMap(MuteList, (muteList) => muteList.publishMuteList(pubkeys)),
);
