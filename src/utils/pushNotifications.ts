const NOTIFICATION_SERVER_URL = import.meta.env.VITE_NOTIFICATION_SERVER_URL || 'https://linky-notifications.onrender.com';
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'OAdsz3JAFv_K_27q8AcGoZDtuE8oNmH_gKYpGnEZeTU';

type PushSubscriptionData = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    console.log("This browser does not support notifications");
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

export async function registerPushNotifications(
  npub: string,
  relays: string[]
): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator)) {
      console.log("Service workers are not supported");
      return false;
    }

    if (!VAPID_PUBLIC_KEY) {
      console.log("VAPID public key is not configured");
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const subscriptionData: PushSubscriptionData = {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime,
      keys: {
        p256dh: btoa(
          String.fromCharCode(
            ...new Uint8Array(
              subscription.getKey("p256dh") || new ArrayBuffer(0)
            )
          )
        ),
        auth: btoa(
          String.fromCharCode(
            ...new Uint8Array(
              subscription.getKey("auth") || new ArrayBuffer(0)
            )
          )
        ),
      },
    };

    const response = await fetch(`${NOTIFICATION_SERVER_URL}/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        npub,
        subscription: subscriptionData,
        relays,
      }),
    });

    if (!response.ok) {
      console.error("Failed to register push notifications:", response.status);
      return false;
    }

    localStorage.setItem("linky.push.npub", npub);
    return true;
  } catch (error) {
    console.error("Error registering push notifications:", error);
    return false;
  }
}

export async function unregisterPushNotifications(): Promise<boolean> {
  try {
    const npub = localStorage.getItem("linky.push.npub");
    if (!npub) return false;

    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }
    }

    const response = await fetch(`${NOTIFICATION_SERVER_URL}/unsubscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ npub }),
    });

    localStorage.removeItem("linky.push.npub");
    return response.ok;
  } catch (error) {
    console.error("Error unregistering push notifications:", error);
    return false;
  }
}

export function isPushRegistered(): boolean {
  return localStorage.getItem("linky.push.npub") !== null;
}

export async function updatePushSubscriptionRelays(relays: string[]): Promise<boolean> {
  try {
    const npub = localStorage.getItem("linky.push.npub");
    if (!npub) return false;

    const response = await fetch(`${NOTIFICATION_SERVER_URL}/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        npub,
        relays,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error("Error updating push relays:", error);
    return false;
  }
}
