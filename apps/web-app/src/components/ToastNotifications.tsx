import React from "react";
import type { Toast } from "../hooks/useToasts";
import type { DisplayAmountParts } from "../utils/displayAmounts";

type RecentlyReceivedToken = {
  token: string;
  amount: number | null;
} | null;

interface ToastNotificationsProps {
  dismissToast: (id: string) => void;
  formatDisplayedAmountParts: (amountSat: number) => DisplayAmountParts;
  recentlyReceivedToken: RecentlyReceivedToken;
  t: (key: string) => string;
  toasts: Toast[];
}

export const ToastNotifications: React.FC<ToastNotificationsProps> = ({
  dismissToast,
  formatDisplayedAmountParts,
  recentlyReceivedToken,
  t,
  toasts,
}) => {
  return (
    <>
      {recentlyReceivedToken?.token ? (
        <div className="toast-container" aria-live="polite">
          <div className="toast" role="status">
            {(() => {
              const amount =
                typeof recentlyReceivedToken.amount === "number"
                  ? recentlyReceivedToken.amount
                  : null;
              if (amount) {
                const displayAmount = formatDisplayedAmountParts(amount);
                return t("tokenReceivedClickToCopy")
                  .replace(
                    "{amount}",
                    `${displayAmount.approxPrefix}${displayAmount.amountText}`,
                  )
                  .replace("{unit}", displayAmount.unitLabel);
              }
              return t("tokenReceived");
            })()}
          </div>
        </div>
      ) : null}

      {toasts.length ? (
        <div className="toast-container" aria-live="polite">
          {toasts.map((toast) => (
            <React.Fragment key={toast.id}>
              {toast.onClick ? (
                <button
                  className="toast toast-button"
                  type="button"
                  onClick={() => {
                    dismissToast(toast.id);
                    toast.onClick?.();
                  }}
                >
                  {toast.message}
                </button>
              ) : (
                <div className="toast">{toast.message}</div>
              )}
            </React.Fragment>
          ))}
        </div>
      ) : null}
    </>
  );
};
