import type { FC } from "react";
import type { ChatReactionChip } from "../app/types/appTypes";

interface MessageReactionsProps {
  onReact: (emoji: string) => void;
  reactions: readonly ChatReactionChip[];
  showAddButton: boolean;
}

export const MessageReactions: FC<MessageReactionsProps> = ({
  onReact,
  reactions,
  showAddButton,
}) => {
  if (reactions.length === 0 && !showAddButton) return null;

  return (
    <div
      className="message-reactions"
      role="list"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          className={
            reaction.reactedByMe
              ? "reaction-chip reaction-chip-own"
              : "reaction-chip"
          }
          onClick={() => onReact(reaction.emoji)}
        >
          <span>{reaction.emoji}</span>
          {reaction.count > 1 && (
            <span className="reaction-chip-count">{reaction.count}</span>
          )}
        </button>
      ))}
      {showAddButton && (
        <button
          type="button"
          className="reaction-chip reaction-chip-add"
          onClick={() => onReact("👍")}
          aria-label="Add reaction"
        >
          +
        </button>
      )}
    </div>
  );
};
