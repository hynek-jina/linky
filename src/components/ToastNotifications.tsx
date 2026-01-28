import * as React from "react";

type Toast = {
  id: string;
  message: string;
};

type RecentlyReceivedToken = {
  token: string;
  amount: number | null;
} | null;

type ToastNotificationsProps = {
  recentlyReceivedToken: RecentlyReceivedToken;
  toasts: Toast[];
  lang: string;
  displayUnit: string;
  formatInteger: (value: number) => string;
  pushToast: (message: string) => void;
  setRecentlyReceivedToken: (token: RecentlyReceivedToken) => void;
  t: (key: string) => string;
};

export const ToastNotifications: React.FC<ToastNotificationsProps> = ({
  recentlyReceivedToken,
  toasts,
  lang,
  displayUnit,
  formatInteger,
  pushToast,
  setRecentlyReceivedToken,
  t,
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
            title={
              lang === "cs"
                ? "Klikni pro zkopírování tokenu"
                : "Click to copy token"
            }
          >
            {(() => {
              const amount =
                typeof recentlyReceivedToken.amount === "number"
                  ? recentlyReceivedToken.amount
                  : null;
              if (lang === "cs") {
                return amount
                  ? `Přijato ${formatInteger(
                      amount,
                    )} ${displayUnit}. Klikni pro zkopírování tokenu.`
                  : "Token přijat. Klikni pro zkopírování tokenu.";
              }
              return amount
                ? `Received ${formatInteger(
                    amount,
                  )} ${displayUnit}. Click to copy token.`
                : "Token accepted. Click to copy token.";
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
