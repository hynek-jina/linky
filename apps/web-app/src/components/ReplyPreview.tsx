import type { FC } from "react";

interface ReplyPreviewProps {
  body: string;
  label: string;
  onCancel: () => void;
}

export const ReplyPreview: FC<ReplyPreviewProps> = ({
  body,
  label,
  onCancel,
}) => {
  return (
    <div className="reply-preview">
      <div className="reply-preview-body">
        <strong>{label}</strong>
        <span>{body}</span>
      </div>
      <button
        type="button"
        className="reply-preview-cancel"
        onClick={onCancel}
        aria-label="Close"
      >
        ×
      </button>
    </div>
  );
};
