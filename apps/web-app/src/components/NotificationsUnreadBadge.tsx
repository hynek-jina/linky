/**
 * The unread-notification pill for the settings entry row's `tail` slot.
 *
 * WHY A LEAF COMPONENT AND NOT A VALUE IN `AdvancedPage`:
 * `AdvancedPageProps` carries ~38 required props sourced from
 * `useSystemRouteProps`, so a count computed up there would be untestable in
 * isolation, and every count change would re-render the whole settings page —
 * twenty-odd rows for one numeral. The leaf isolates the re-render to this one
 * `<span>` and makes ROADMAP criterion 4 directly observable as *DOM-node
 * identity preserved + textContent changed*, which is an assertion that can
 * actually fail.
 *
 * WHY `useUnreadNotificationCount` AND NOT A NEW SUBSCRIPTION:
 * it memoises against the snapshot REFERENCE and returns a primitive, and
 * `notificationRecordStore.subscribe` / `get` are module-level consts whose
 * identity never changes, so React never re-subscribes and the badge does not
 * re-render per frame. Do NOT replace it with a `useState` + `useEffect` pair.
 * This is that hook's ONLY production call site — the Notifications page derives
 * its own count from the snapshot it already holds via
 * `countUnreadNotificationRecords(useNotificationRecords())`, so badge and list
 * share one source with exactly one subscription apiece.
 *
 * `t` is a PROP rather than a `useAppShellCore()` read so the component renders
 * in isolation with `t={(key) => key}` and needs no context mock.
 */
import React from "react";
import { useUnreadNotificationCount } from "../app/lib/notificationRecordStore";

interface NotificationsUnreadBadgeProps {
  t: (key: string) => string;
}

export function NotificationsUnreadBadge({
  t,
}: NotificationsUnreadBadgeProps): React.ReactElement | null {
  const unreadCount = useUnreadNotificationCount();

  // A `0` pill on the settings row is noise, not a variant.
  if (unreadCount <= 0) {
    return null;
  }

  return (
    <span
      aria-label={t("notificationsUnreadCount")}
      className="settings-inline-badge notifications-unread-badge"
      data-guide="notifications-unread-badge"
    >
      {unreadCount}
    </span>
  );
}
