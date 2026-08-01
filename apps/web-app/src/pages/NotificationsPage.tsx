/**
 * The Notifications page: everything that arrived, newest first, with a per-item
 * read toggle and a "mark all read" action on top — WhatsApp style.
 *
 * The page adds NO semantics of its own. It is a presentational surface over
 * `notificationRecordStore`: the list ORDER comes from the store, every read
 * mutation goes through a Phase 4/6 writer, tap-to-route goes through the shared
 * `openNotificationRecord` helper, and the shade cancel is the store's job. The
 * one thing it genuinely owns is the `notificationsPage` surface registration,
 * which is what makes alert-decision row 6 (`notifications-page-open`)
 * reachable at all.
 *
 * Prop-free on purpose (precedent: `SettingsPage.tsx`): it reads `lang` / `t`
 * from `useAppShellCore()` and everything else from module-level singletons, so
 * `AppRouteContent` renders a bare `<NotificationsPage />` with no prop bundle
 * to thread through `useSystemRouteProps`.
 */
import { Check, Coins, Landmark, Undo2, Zap } from "lucide-react";
import React from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import {
  countUnreadNotificationRecords,
  type NotificationRecord,
  type NotificationRecordKind,
} from "../app/lib/notificationRecord";
import {
  notificationRecordStore,
  useNotificationRecords,
} from "../app/lib/notificationRecordStore";
import {
  clearVisibleSurface,
  registerVisibleSurface,
  type NotificationSurface,
} from "../app/lib/notificationSurface";
import { openNotificationRecord } from "../app/lib/notificationTapRoute";
import { MessagesIcon } from "../components/icons";
import { navigateTo } from "../hooks/useRouting";
import { formatContactMessageTimestamp } from "../utils/formatting";

/**
 * EXHAUSTIVE over `NotificationRecordKind`, with NO `default` clause on purpose:
 * adding a fifth kind must be a compile error here, never a silently missing
 * icon. This is the same discipline `resolveNotificationNavigation` and
 * `resolveBackAction` use.
 *
 * Size 18 matches every settings-row icon in the app.
 */
const renderKindIcon = (kind: NotificationRecordKind): React.ReactElement => {
  switch (kind) {
    case "bankPaymentOffer":
      return <Landmark size={18} />;
    case "chatMessage":
      return <MessagesIcon size={18} />;
    case "npubCashClaim":
      return <Zap size={18} />;
    case "paymentReceived":
      return <Coins size={18} />;
  }
};

export function NotificationsPage(): React.ReactElement {
  const { lang, t } = useAppShellCore();

  /**
   * ALREADY newest-first. `sortNotificationRecords` runs inside both
   * `mergeNotificationRecordsById` and `applyNotificationRetention`, so the
   * snapshot arrives sorted with a documented id tiebreak. The page must NOT
   * re-sort: a second comparator is a second tie-break rule, and the two would
   * drift. Assert the order in the spec instead of imposing it here.
   */
  const records = useNotificationRecords();

  /**
   * Derived from the SAME snapshot the list renders, via
   * `countUnreadNotificationRecords`, so the page holds exactly one
   * subscription. `useUnreadNotificationCount` is deliberately NOT used here —
   * it would be a second subscription to the same store, and
   * `components/NotificationsUnreadBadge.tsx` is that hook's single call site.
   */
  const unreadCount = countUnreadNotificationRecords(records);

  /**
   * ALERT-01's second half, and the whole of it: one unconditional registration
   * on mount, one matching clear on unmount, `[]` deps, nothing else.
   *
   * NO `visibilitychange` handling. `resolveCurrentVisibleSurface` gates on
   * `readDocumentVisible()` BEFORE it consults this override, so a hidden
   * document already yields `null` and the record correctly falls through to
   * decision row 7 (`elsewhere` -> `post-and-alert`). A clear/re-register pair
   * would add a race with no behavioural gain. React StrictMode's DEV
   * double-invoke is safe: `clearVisibleSurface` matches by VALUE via
   * `isSameSurface`, so effect -> cleanup -> effect nets out registered.
   *
   * A LEAKED registration has TWO consequences, not one, and the second is the
   * expensive one:
   *   1. Decision row 6 matches EVERY record, so every alert app-wide is
   *      suppressed indefinitely — no shade entry, no banner, silently.
   *   2. Decision row 5 (`record-surface-open`) becomes UNREACHABLE, because
   *      `surfaceOwnsRecord` returns false for a `notificationsPage` surface.
   *      Messages arriving in an OPEN CHAT would therefore stop being marked
   *      read. The unmount test in this page's spec is that regression guard.
   */
  React.useEffect(() => {
    const surface: NotificationSurface = { kind: "notificationsPage" };
    registerVisibleSurface(surface);
    return () => clearVisibleSurface(surface);
  }, []);

  /**
   * `markAllRead` ALREADY cancels Linky's shade group unconditionally (shipped
   * in plan 04-03, scoped to Linky's own notification group). The page imports
   * no cancel wrapper at all; a second caller would break the T-04-12 audit.
   * The cancel being unconditional is deliberate: `LinkyLocalNotifications`'
   * per-conversation cache is lost on process death, so the shade can still
   * hold entries the store already considers read.
   *
   * No confirmation dialog: marking read is non-destructive, and `markUnread`
   * now exists to undo it per item. Signal and WhatsApp both fire immediately.
   *
   * Wrapped in `useCallback` for the same reason `NotificationBanner.tsx` wraps
   * its handlers: `react-hooks/purity` treats a bare clock read in the component
   * body as a render-time impurity, and the callback body is the event boundary
   * where reading the clock is correct.
   */
  const handleMarkAllRead = React.useCallback((): void => {
    notificationRecordStore.markAllRead(Date.now());
  }, []);

  /**
   * `scrollToMessage` is omitted on purpose: it is optional, and
   * `triggerChatScrollToBottom` is hook state rather than a module export.
   * Opening the chat already scrolls to the newest message. This matches the
   * resolution Phase 5 reached for the banner, so the two surfaces stay
   * identical.
   */
  const handleOpen = React.useCallback((record: NotificationRecord): void => {
    openNotificationRecord(record, { navigate: navigateTo, nowMs: Date.now() });
  }, []);

  const handleRowKeyDown =
    (record: NotificationRecord) =>
    (event: React.KeyboardEvent<HTMLElement>): void => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      handleOpen(record);
    };

  /**
   * `stopPropagation` is LOAD-BEARING: the toggle is nested inside a
   * `role="button"` row, so without it the row's own tap fires too and
   * `openNotificationRecord` immediately re-reads the record the user just
   * un-read.
   *
   * Marking unread never re-posts a shade entry — a cancelled notification
   * cannot be un-cancelled — and `markUnread` takes no timestamp because it
   * REMOVES one rather than writing one.
   */
  const handleToggleRead = React.useCallback(
    (
      event: React.MouseEvent<HTMLButtonElement>,
      record: NotificationRecord,
    ): void => {
      event.stopPropagation();
      if (record.readAt === null) {
        notificationRecordStore.markRead(record.id, Date.now());
        return;
      }
      notificationRecordStore.markUnread(record.id);
    },
    [],
  );

  return (
    <section className="panel">
      <div className="notifications-header">
        <button
          type="button"
          className="notifications-mark-all"
          data-guide="notifications-mark-all-read"
          disabled={unreadCount === 0}
          onClick={handleMarkAllRead}
        >
          {t("notificationsMarkAllRead")}
        </button>
      </div>

      {records.length === 0 ? (
        <p className="muted">{t("notificationsEmpty")}</p>
      ) : (
        <div className="notifications-list">
          {records.map((record) => (
            /*
             * A `role="button"` <article> rather than a <button>: that is what
             * lets the toggle <button> nest legally, since a nested <button> is
             * invalid HTML.
             */
            <article
              key={record.id}
              className={`notification-row${record.readAt === null ? " is-unread" : ""}`}
              data-guide="notification-row"
              data-guide-record-id={record.id}
              role="button"
              tabIndex={0}
              onClick={() => handleOpen(record)}
              onKeyDown={handleRowKeyDown(record)}
            >
              <span className="notification-row-icon" aria-hidden="true">
                {renderKindIcon(record.kind)}
              </span>
              {/*
               * `senderLabel` and `preview` are both attacker-controlled — any
               * Nostr sender picks them. React's default text escaping is the
               * control, so they are rendered as plain children and nothing
               * else. The preview is ALREADY clamped to 80 chars at build time
               * by `truncateNotificationPreview`; re-truncating here would nest
               * an ellipsis inside an ellipsis.
               */}
              <span className="notification-row-body">
                <span className="notification-row-sender">
                  {record.senderLabel}
                </span>
                <span className="notification-row-preview">
                  {record.preview}
                </span>
              </span>
              <span className="notification-row-right">
                {/*
                 * `formatContactMessageTimestamp` takes SECONDS while
                 * `createdAtMs` is milliseconds. Both are `number`, so this
                 * conversion is the only thing standing between correct output
                 * and a silently wrong `DD.MM` roughly 53 000 years out.
                 */}
                <span className="notification-row-time">
                  {formatContactMessageTimestamp(
                    Math.floor(record.createdAtMs / 1000),
                    lang,
                  )}
                </span>
                {record.readAt === null ? (
                  <span
                    className="notification-row-unread-dot"
                    aria-hidden="true"
                  />
                ) : null}
                <button
                  type="button"
                  className="notification-row-toggle"
                  data-guide="notification-row-toggle"
                  aria-label={
                    record.readAt === null
                      ? t("notificationsMarkRead")
                      : t("notificationsMarkUnread")
                  }
                  onClick={(event) => handleToggleRead(event, record)}
                >
                  {record.readAt === null ? (
                    <Check size={16} />
                  ) : (
                    <Undo2 size={16} />
                  )}
                </button>
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
