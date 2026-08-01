import { describe, expect, it } from "vitest";
import { cs } from "../../i18n/cs";
import { en } from "../../i18n/en";
import type {
  NativeNotificationDeliveryState,
  NativeNotificationPermissionState,
} from "../../platform/nativeBridge";
import {
  NOTIFICATION_DELIVERY_STATUS_KEYS,
  resolveNotificationDeliveryPresentation,
} from "./notificationDeliveryState";

// Every permission state the bridge can report, plus the "no native bridge" null.
const ALL_PERMISSION_STATES: readonly (NativeNotificationPermissionState | null)[] =
  ["blocked", "denied", "granted", "prompt", "unsupported", null];

// Everything except "blocked": a retry genuinely re-shows the Android dialog.
const NON_BLOCKED_PERMISSION_STATES: readonly (NativeNotificationPermissionState | null)[] =
  ["denied", "granted", "prompt", "unsupported", null];

// Combinations that should not occur: the delivery layer says notifications are off
// while the permission layer claims otherwise. D-P2-12 sends these to the cheap retry.
const CONTRADICTORY_PERMISSION_STATES: readonly (NativeNotificationPermissionState | null)[] =
  ["granted", "unsupported", null];

const WORKING = { action: "none", statusKey: null };

describe("resolveNotificationDeliveryPresentation", () => {
  it("renders nothing when delivery is working", () => {
    for (const permissionState of ALL_PERMISSION_STATES) {
      expect(
        resolveNotificationDeliveryPresentation({
          deliveryState: "granted",
          permissionState,
        }),
      ).toEqual(WORKING);
    }
  });

  it("renders nothing when there is no native bridge", () => {
    for (const permissionState of ALL_PERMISSION_STATES) {
      expect(
        resolveNotificationDeliveryPresentation({
          deliveryState: null,
          permissionState,
        }),
      ).toEqual(WORKING);
    }
  });

  it("sends a permanently blocked permission to system settings instead of a dead grant button", () => {
    expect(
      resolveNotificationDeliveryPresentation({
        deliveryState: "permission_denied",
        permissionState: "blocked",
      }),
    ).toEqual({ action: "openSettings", statusKey: "notificationsBlocked" });
  });

  it("keeps offering grant after a single denial, because the dialog still appears", () => {
    expect(
      resolveNotificationDeliveryPresentation({
        deliveryState: "permission_denied",
        permissionState: "denied",
      }),
    ).toEqual({ action: "grant", statusKey: "notificationsDenied" });
  });

  it("keeps offering grant when the dialog has never been shown", () => {
    expect(
      resolveNotificationDeliveryPresentation({
        deliveryState: "permission_denied",
        permissionState: "prompt",
      }),
    ).toEqual({ action: "grant", statusKey: "notificationsDenied" });
  });

  it("keeps offering grant for permission states that contradict the delivery state", () => {
    for (const permissionState of CONTRADICTORY_PERMISSION_STATES) {
      expect(
        resolveNotificationDeliveryPresentation({
          deliveryState: "permission_denied",
          permissionState,
        }),
      ).toEqual({ action: "grant", statusKey: "notificationsDenied" });
    }
  });

  it("offers grant for every permission state except a permanent block", () => {
    for (const permissionState of NON_BLOCKED_PERMISSION_STATES) {
      expect(
        resolveNotificationDeliveryPresentation({
          deliveryState: "permission_denied",
          permissionState,
        }),
      ).toEqual({ action: "grant", statusKey: "notificationsDenied" });
    }
  });

  it("routes a device-level app block into system settings for every permission state", () => {
    for (const permissionState of ALL_PERMISSION_STATES) {
      expect(
        resolveNotificationDeliveryPresentation({
          deliveryState: "app_blocked",
          permissionState,
        }),
      ).toEqual({
        action: "openSettings",
        statusKey: "notificationsAppBlocked",
      });
    }
  });

  it("routes a missing channel into system settings for every permission state", () => {
    for (const permissionState of ALL_PERMISSION_STATES) {
      expect(
        resolveNotificationDeliveryPresentation({
          deliveryState: "channel_missing",
          permissionState,
        }),
      ).toEqual({
        action: "openSettings",
        statusKey: "notificationsChannelMissing",
      });
    }
  });

  it("routes a muted channel into system settings even when the app permission is granted", () => {
    for (const permissionState of ALL_PERMISSION_STATES) {
      expect(
        resolveNotificationDeliveryPresentation({
          deliveryState: "channel_blocked",
          permissionState,
        }),
      ).toEqual({
        action: "openSettings",
        statusKey: "notificationsChannelBlocked",
      });
    }
  });

  it("routes a silenced channel into system settings even when the app permission is granted", () => {
    for (const permissionState of ALL_PERMISSION_STATES) {
      expect(
        resolveNotificationDeliveryPresentation({
          deliveryState: "channel_silent",
          permissionState,
        }),
      ).toEqual({
        action: "openSettings",
        statusKey: "notificationsChannelSilent",
      });
    }
  });

  it("maps every delivery state the bridge can report", () => {
    // A Record over the union: a seventh delivery state fails to compile here.
    const EXPECTED_BY_DELIVERY_STATE: Record<
      NativeNotificationDeliveryState,
      { action: string; statusKey: string | null }
    > = {
      app_blocked: {
        action: "openSettings",
        statusKey: "notificationsAppBlocked",
      },
      channel_blocked: {
        action: "openSettings",
        statusKey: "notificationsChannelBlocked",
      },
      channel_missing: {
        action: "openSettings",
        statusKey: "notificationsChannelMissing",
      },
      channel_silent: {
        action: "openSettings",
        statusKey: "notificationsChannelSilent",
      },
      granted: { action: "none", statusKey: null },
      permission_denied: { action: "grant", statusKey: "notificationsDenied" },
    };
    const ALL_DELIVERY_STATES: readonly NativeNotificationDeliveryState[] = [
      "app_blocked",
      "channel_blocked",
      "channel_missing",
      "channel_silent",
      "granted",
      "permission_denied",
    ];

    expect(ALL_DELIVERY_STATES.length).toBe(
      Object.keys(EXPECTED_BY_DELIVERY_STATE).length,
    );
    for (const deliveryState of ALL_DELIVERY_STATES) {
      expect(
        resolveNotificationDeliveryPresentation({
          deliveryState,
          permissionState: "denied",
        }),
      ).toEqual(EXPECTED_BY_DELIVERY_STATE[deliveryState]);
    }
  });
});

const REQUIRED_I18N_KEYS: readonly string[] = [
  ...NOTIFICATION_DELIVERY_STATUS_KEYS,
  "notificationsOpenSettings",
  "enable",
];

const DICTIONARIES: readonly {
  entries: Record<string, string>;
  name: string;
}[] = [
  { entries: en, name: "en" },
  { entries: cs, name: "cs" },
];

describe("notification delivery i18n coverage", () => {
  it("lists exactly the six status keys, with no duplicates", () => {
    expect([...NOTIFICATION_DELIVERY_STATUS_KEYS].sort()).toEqual([
      "notificationsAppBlocked",
      "notificationsBlocked",
      "notificationsChannelBlocked",
      "notificationsChannelMissing",
      "notificationsChannelSilent",
      "notificationsDenied",
    ]);
    expect(new Set(NOTIFICATION_DELIVERY_STATUS_KEYS).size).toBe(
      NOTIFICATION_DELIVERY_STATUS_KEYS.length,
    );
  });

  for (const { entries, name } of DICTIONARIES) {
    for (const key of REQUIRED_I18N_KEYS) {
      it(`has a non-empty ${name} translation for ${key}`, () => {
        expect(Object.prototype.hasOwnProperty.call(entries, key)).toBe(true);
        const value = entries[key];
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      });
    }
  }
});
