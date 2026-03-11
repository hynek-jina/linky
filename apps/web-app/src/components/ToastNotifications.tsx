import React from "react";
import type { DisplayAmountParts } from "../utils/displayAmounts";

type Toast = {
  id: string;
  message: string;
};

type RecentlyReceivedToken = {
  token: string;
  amount: number | null;
} | null;

type ToastNotificationsProps = {
  formatDisplayedAmountParts: (amountSat: number) => DisplayAmountParts;
  pushToast: (message: string) => void;
  recentlyReceivedToken: RecentlyReceivedToken;
  setRecentlyReceivedToken: (token: RecentlyReceivedToken) => void;
  t: (key: string) => string;
  toasts: Toast[];
};

export const ToastNotifications: React.FC<ToastNotificationsProps> = ({
  formatDisplayedAmountParts,
  pushToast,
  recentlyReceivedToken,
  setRecentlyReceivedToken,
  t,
  toasts,
}) => {
  return (
    <>
      {recentlyReceivedToken?.token ? (
        <div className="toast-container" aria-live="polite">
          <div
            className="toast"
            role="status"
            onClick={() => {
              const token = String(recentlyReceivedToken.token ?? "").trim();
              if (!token) return;
              void (async () => {
                try {
                  await navigator.clipboard?.writeText(token);
                  pushToast(t("copiedToClipboard"));
                  setRecentlyReceivedToken(null);
                } catch {
                  pushToast(t("copyFailed"));
                }
              })();
            }}
            style={{ cursor: "pointer" }}
            title={t("copyTokenTitle")}
          >
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
            <div key={toast.id} className="toast">
              {toast.message}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
};
