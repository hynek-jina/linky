export interface ChatViewportAnchor {
  visibleBottom: number;
}

export const captureChatViewportAnchor = (
  messages: HTMLElement | null,
): ChatViewportAnchor | null => {
  if (!messages || messages.clientHeight <= 0) return null;

  return {
    visibleBottom: messages.scrollTop + messages.clientHeight,
  };
};

export const restoreChatViewportAnchor = (
  messages: HTMLElement | null,
  anchor: ChatViewportAnchor | null,
): void => {
  if (!messages || !anchor) return;

  messages.scrollTop = Math.max(
    0,
    anchor.visibleBottom - messages.clientHeight,
  );
};
