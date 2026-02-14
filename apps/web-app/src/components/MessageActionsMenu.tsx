import type { FC } from "react";
import { EmojiPicker } from "./EmojiPicker";

interface MessageActionsMenuProps {
  canEdit: boolean;
  canReplyOrReact: boolean;
  isOpen: boolean;
  labels: {
    copy: string;
    edit: string;
    react: string;
    reply: string;
  };
  onClose: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
}

export const MessageActionsMenu: FC<MessageActionsMenuProps> = ({
  canEdit,
  canReplyOrReact,
  isOpen,
  labels,
  onClose,
  onCopy,
  onEdit,
  onReact,
  onReply,
}) => {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="message-actions-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="message-actions-sheet" role="menu">
        <div className="message-actions-handle" aria-hidden="true" />
        {canReplyOrReact && (
          <EmojiPicker
            onSelect={(emoji) => {
              onReact(emoji);
              onClose();
            }}
          />
        )}
        <div className="message-actions-separator" />
        {canReplyOrReact && (
          <button
            type="button"
            className="message-actions-item"
            onClick={() => {
              onReply();
              onClose();
            }}
          >
            {labels.reply}
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            className="message-actions-item"
            onClick={() => {
              onEdit();
              onClose();
            }}
          >
            {labels.edit}
          </button>
        )}
        <button
          type="button"
          className="message-actions-item"
          onClick={() => {
            onCopy();
            onClose();
          }}
        >
          {labels.copy}
        </button>
      </div>
    </>
  );
};
