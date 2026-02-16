import type { FC } from "react";

interface EditIndicatorProps {
  label: string;
  originalContent: string | null;
}

export const EditIndicator: FC<EditIndicatorProps> = ({
  label,
  originalContent,
}) => {
  return (
    <span
      className="edited-indicator"
      title={originalContent ? originalContent : undefined}
    >
      {label}
    </span>
  );
};
