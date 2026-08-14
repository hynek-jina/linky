import { Chat } from "@linky/linkstr";
import type {
  EditMessageDraft,
  ImageMessageDraft,
  TextMessageDraft,
  TokenMessageDraft,
} from "@linky/linkstr";
import { Effect } from "effect";
import { linkstrRuntimeAtom } from "./runtime";

export const sendChatTextAtom = linkstrRuntimeAtom.fn<TextMessageDraft>()(
  (draft) => Effect.flatMap(Chat, (chat) => chat.sendText(draft)),
);

export const sendChatImageAtom = linkstrRuntimeAtom.fn<ImageMessageDraft>()(
  (draft) => Effect.flatMap(Chat, (chat) => chat.sendImage(draft)),
);

export const sendChatTokenAtom = linkstrRuntimeAtom.fn<TokenMessageDraft>()(
  (draft) => Effect.flatMap(Chat, (chat) => chat.sendToken(draft)),
);

export const editChatMessageAtom = linkstrRuntimeAtom.fn<EditMessageDraft>()(
  (draft) => Effect.flatMap(Chat, (chat) => chat.edit(draft)),
);
