import React from "react";

interface BootCommitSignalProps {
  onCommit: () => void;
}

export const BootCommitSignal = ({ onCommit }: BootCommitSignalProps) => {
  React.useEffect(() => {
    onCommit();
  }, [onCommit]);

  return null;
};
