import React from "react";

interface UseStatusToastsParams {
  pushToast: (message: string) => void;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  status: string | null;
}

export const useStatusToasts = ({
  pushToast,
  setStatus,
  status,
}: UseStatusToastsParams): void => {
  React.useEffect(() => {
    if (!status) return;
    pushToast(status);
    setStatus(null);
  }, [pushToast, setStatus, status]);
};
