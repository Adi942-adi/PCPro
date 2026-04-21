const PUSH_PERMISSION_DEFAULT = "default";

const base64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};

export const isPushSupported = () => {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
};

export const getPushPermission = () => {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return PUSH_PERMISSION_DEFAULT;
  }
  return window.Notification.permission;
};

export const requestPushPermission = async () => {
  if (!isPushSupported()) {
    return "unsupported";
  }
  return window.Notification.requestPermission();
};

export const registerPushSubscription = async ({ publicKey }) => {
  if (!isPushSupported()) {
    throw new Error("Push notifications are not supported in this browser.");
  }

  if (!publicKey) {
    throw new Error("Push public key is missing.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return existing;
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64ToUint8Array(publicKey)
  });
};

const getPushRegistration = async () => {
  const byPath = await navigator.serviceWorker.getRegistration("/sw.js");
  if (byPath) {
    return byPath;
  }
  return navigator.serviceWorker.getRegistration();
};

export const unregisterPushSubscription = async () => {
  if (!isPushSupported()) {
    return false;
  }

  const registration = await getPushRegistration();
  if (!registration) {
    return false;
  }

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return false;
  }

  await subscription.unsubscribe();
  return true;
};

export const getCurrentPushSubscription = async () => {
  if (!isPushSupported()) {
    return null;
  }

  const registration = await getPushRegistration();
  if (!registration) {
    return null;
  }

  return registration.pushManager.getSubscription();
};
