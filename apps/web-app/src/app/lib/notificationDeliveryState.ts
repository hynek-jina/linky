import type {
  NativeNotificationDeliveryState,
  NativeNotificationPermissionState,
} from "../../platform/nativeBridge";

export type NotificationRemediationAction = "grant" | "none" | "openSettings";

export type NotificationDeliveryStatusKey =
  | "notificationsAppBlocked"
  | "notificationsBlocked"
  | "notificationsChannelBlocked"
  | "notificationsChannelMissing"
  | "notificationsChannelSilent"
  | "notificationsDenied";

export const NOTIFICATION_DELIVERY_STATUS_KEYS: readonly NotificationDeliveryStatusKey[] =
  [
    "notificationsAppBlocked",
    "notificationsBlocked",
    "notificationsChannelBlocked",
    "notificationsChannelMissing",
    "notificationsChannelSilent",
    "notificationsDenied",
  ];

export interface NotificationDeliveryPresentation {
  action: NotificationRemediationAction;
  statusKey: NotificationDeliveryStatusKey | null;
}

export interface NotificationDeliveryPresentationInput {
  deliveryState: NativeNotificationDeliveryState | null;
  permissionState: NativeNotificationPermissionState | null;
}

const WORKING: NotificationDeliveryPresentation = {
  action: "none",
  statusKey: null,
};

export const resolveNotificationDeliveryPresentation = ({
  deliveryState,
  permissionState,
}: NotificationDeliveryPresentationInput): NotificationDeliveryPresentation => {
  // deliveryState is the source of truth for "do notifications work". permissionState only
  // decides WHICH remediation the user is offered.
  switch (deliveryState) {
    case null:
    case "granted":
      return WORKING;
    case "permission_denied":
      // A single denial still re-shows the Android dialog, so "grant" is live. Only a
      // permanent denial (blocked) makes that button dead and requires system settings.
      return permissionState === "blocked"
        ? { action: "openSettings", statusKey: "notificationsBlocked" }
        : { action: "grant", statusKey: "notificationsDenied" };
    case "app_blocked":
      return { action: "openSettings", statusKey: "notificationsAppBlocked" };
    case "channel_missing":
      return {
        action: "openSettings",
        statusKey: "notificationsChannelMissing",
      };
    case "channel_blocked":
      return {
        action: "openSettings",
        statusKey: "notificationsChannelBlocked",
      };
    case "channel_silent":
      return {
        action: "openSettings",
        statusKey: "notificationsChannelSilent",
      };
  }
};
