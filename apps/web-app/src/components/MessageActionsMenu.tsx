import type { FC } from "react";
import { EmojiPicker } from "./EmojiPicker";

const IconReply: FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="9 17 4 12 9 7" />
    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
  </svg>
);

const IconEdit: FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

const IconCopy: FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

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
            <span className="message-actions-icon">
              <IconReply />
            </span>
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
            <span className="message-actions-icon">
              <IconEdit />
            </span>
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
          <span className="message-actions-icon">
            <IconCopy />
          </span>
          {labels.copy}
        </button>
      </div>
    </>
  );
};
