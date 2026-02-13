const NOTIFICATION_SERVER_URL =
  import.meta.env.VITE_NOTIFICATION_SERVER_URL ||
  "https://linky-notifications.onrender.com";
const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  "BNQ07tP7hxCzKMTPjoKu-uMBvzkpz7t6fwJp03K_A7teSk-UsTdl1_V8M5dmhcP0cLwaWWMZw_67rIST0HzzWss";

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
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

export async function registerPushNotifications(
  npub: string,
  relays: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!("serviceWorker" in navigator)) {
      return { success: false, error: "Service Worker není podporován" };
    }

    if (!VAPID_PUBLIC_KEY) {
      return { success: false, error: "VAPID public key není nakonfigurován" };
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      try {
        const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey.buffer.slice(
            appServerKey.byteOffset,
            appServerKey.byteOffset + appServerKey.byteLength,
          ) as ArrayBuffer,
        });
      } catch (subError) {
        return {
          success: false,
          error: `Chyba při vytváření subscription: ${subError}`,
        };
      }
    }

    const subscriptionData: PushSubscriptionData = {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime,
      keys: {
        p256dh: btoa(
          String.fromCharCode(
            ...new Uint8Array(
              subscription.getKey("p256dh") || new ArrayBuffer(0),
            ),
          ),
        ),
        auth: btoa(
          String.fromCharCode(
            ...new Uint8Array(
              subscription.getKey("auth") || new ArrayBuffer(0),
            ),
          ),
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
      const text = await response.text();
      return {
        success: false,
        error: `Server vrátil chybu ${response.status}: ${text}`,
      };
    }

    localStorage.setItem("linky.push.npub", npub);
    return { success: true };
  } catch (error) {
    return { success: false, error: `Chyba: ${error}` };
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
  } catch {
    return false;
  }
}

export function isPushRegistered(): boolean {
  return localStorage.getItem("linky.push.npub") !== null;
}

export async function updatePushSubscriptionRelays(
  relays: string[],
): Promise<boolean> {
  try {
    const npub = localStorage.getItem("linky.push.npub");
    if (!npub) return false;

    if (!("serviceWorker" in navigator)) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      return false;
    }

    const subscriptionData: PushSubscriptionData = {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime,
      keys: {
        p256dh: btoa(
          String.fromCharCode(
            ...new Uint8Array(
              subscription.getKey("p256dh") || new ArrayBuffer(0),
            ),
          ),
        ),
        auth: btoa(
          String.fromCharCode(
            ...new Uint8Array(
              subscription.getKey("auth") || new ArrayBuffer(0),
            ),
          ),
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

    return response.ok;
  } catch {
    return false;
  }
}
