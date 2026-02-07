const NOTIFICATION_SERVER_URL = import.meta.env.VITE_NOTIFICATION_SERVER_URL || 'https://linky-notifications.onrender.com';
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BAtEOB4vWdrCLIJndc-VjK9bxRNAyZcH2XmVfpnRuCJE70mNnIlVpfoGuvwJmYNGUmnXYhIoUOMDSkthf6_IyTo';

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
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!("serviceWorker" in navigator)) {
      const msg = "Service Worker není podporován";
      console.log(msg);
      return { success: false, error: msg };
    }

    if (!VAPID_PUBLIC_KEY) {
      const msg = "VAPID public key není nakonfigurován";
      console.log(msg);
      return { success: false, error: msg };
    }

    console.log("Získávám Service Worker registration...");
    const registration = await navigator.serviceWorker.ready;
    console.log("Service Worker ready");
    
    let subscription = await registration.pushManager.getSubscription();
    console.log("Existing subscription:", subscription ? "ano" : "ne");

    if (!subscription) {
      console.log("Vytvářím nový subscription...");
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });
        console.log("Subscription vytvořen");
      } catch (subError) {
        const msg = `Chyba při vytváření subscription: ${subError}`;
        console.error(msg);
        return { success: false, error: msg };
      }
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

    console.log("Odesílám na server:", NOTIFICATION_SERVER_URL);
    console.log("Data:", { npub, relays: relays.slice(0, 3) });
    
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

    console.log("Odpověď serveru:", response.status);
    
    if (!response.ok) {
      const text = await response.text();
      const msg = `Server vrátil chybu ${response.status}: ${text}`;
      console.error(msg);
      return { success: false, error: msg };
    }

    localStorage.setItem("linky.push.npub", npub);
    return { success: true };
  } catch (error) {
    const msg = `Chyba: ${error}`;
    console.error("Error registering push notifications:", error);
    return { success: false, error: msg };
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

    if (!("serviceWorker" in navigator)) {
      return false;
    }

    // Get existing subscription from browser
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      console.log("No subscription found, cannot update relays");
      return false;
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

    return response.ok;
  } catch (error) {
    console.error("Error updating push relays:", error);
    return false;
  }
}
