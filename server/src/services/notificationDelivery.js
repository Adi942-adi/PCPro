import Notification from "../models/Notification.js";
import PushSubscription from "../models/PushSubscription.js";
import User from "../models/User.js";
import { clearQueryCacheByPrefix } from "./queryCache.js";
import { normalizeNotificationPreferences } from "../utils/notificationPrefs.js";

const DELIVERY_PREF_MAP = {
  price_drop: {
    email: "emailPriceDrops",
    push: "pushPriceDrops"
  },
  review_moderation: {
    email: "emailReviewModeration",
    push: "pushReviewModeration"
  }
};
const NOTIFICATIONS_LIST_CACHE_PREFIX = "notifications:list:";

const toBooleanEnv = (value, fallback = false) => {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const getClientOrigin = () => {
  return String(process.env.CLIENT_ORIGIN || "http://localhost:5173").trim();
};

const toAbsoluteUrl = (value = "/alerts") => {
  const raw = String(value || "").trim();
  if (!raw) {
    return `${getClientOrigin()}/alerts`;
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  const origin = getClientOrigin().replace(/\/$/, "");
  return raw.startsWith("/") ? `${origin}${raw}` : `${origin}/${raw}`;
};

let emailTransporterPromise = null;

const loadEmailTransporter = async () => {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const from = String(process.env.SMTP_FROM || "").trim();

  if (!host || !Number.isFinite(port) || port <= 0 || !from) {
    return null;
  }

  if (!emailTransporterPromise) {
    emailTransporterPromise = (async () => {
      try {
        const module = await import("nodemailer");
        const nodemailer = module.default || module;
        if (!nodemailer?.createTransport) {
          return null;
        }

        const secure = toBooleanEnv(process.env.SMTP_SECURE, port === 465);
        const user = String(process.env.SMTP_USER || "").trim();
        const pass = String(process.env.SMTP_PASS || "");

        const transportConfig = {
          host,
          port,
          secure
        };

        if (user) {
          transportConfig.auth = { user, pass };
        }

        return nodemailer.createTransport(transportConfig);
      } catch (error) {
        console.warn("Email delivery disabled: nodemailer not installed or failed to load.");
        return null;
      }
    })();
  }

  return emailTransporterPromise;
};

let webPushPromise = null;

const loadWebPush = async () => {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.VAPID_SUBJECT || "").trim();

  if (!publicKey || !privateKey || !subject) {
    return null;
  }

  if (!webPushPromise) {
    webPushPromise = (async () => {
      try {
        const module = await import("web-push");
        const webPush = module.default || module;
        if (!webPush?.setVapidDetails) {
          return null;
        }
        webPush.setVapidDetails(subject, publicKey, privateKey);
        return webPush;
      } catch (error) {
        console.warn("Push delivery disabled: web-push not installed or failed to load.");
        return null;
      }
    })();
  }

  return webPushPromise;
};

const sendEmailNotification = async ({ to, subject, message, url }) => {
  if (!to) {
    return { sent: false, reason: "missing_recipient" };
  }

  const transporter = await loadEmailTransporter();
  if (!transporter) {
    return { sent: false, reason: "email_not_configured" };
  }

  const from = String(process.env.SMTP_FROM || "").trim();
  const text = `${message}\n\nOpen: ${toAbsoluteUrl(url)}`;

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      text
    });
    return { sent: true };
  } catch (error) {
    console.warn("Email delivery failed:", error.message || error);
    return { sent: false, reason: "send_failed" };
  }
};

const serializePushSubscription = (subscription) => {
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime).getTime() : null,
    keys: {
      p256dh: subscription.keys?.p256dh,
      auth: subscription.keys?.auth
    }
  };
};

const sendPushNotification = async ({ userId, title, message, data = {} }) => {
  const webPush = await loadWebPush();
  if (!webPush) {
    return { sent: 0, total: 0, reason: "push_not_configured" };
  }

  const subscriptions = await PushSubscription.find({ userId }).lean();
  if (!subscriptions.length) {
    return { sent: 0, total: 0, reason: "no_subscriptions" };
  }

  const payload = JSON.stringify({
    title,
    body: message,
    data: {
      ...data,
      url: toAbsoluteUrl(data.url || "/alerts")
    }
  });

  const staleIds = [];
  let sent = 0;

  for (const subscription of subscriptions) {
    try {
      await webPush.sendNotification(serializePushSubscription(subscription), payload);
      sent += 1;
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        staleIds.push(subscription._id);
      } else {
        console.warn("Push delivery failed:", error.message || error);
      }
    }
  }

  if (staleIds.length > 0) {
    await PushSubscription.deleteMany({ _id: { $in: staleIds } });
  }

  return {
    sent,
    total: subscriptions.length
  };
};

const resolveUser = async (userId, user) => {
  if (
    user &&
    typeof user === "object" &&
    ("email" in user || "name" in user || "notificationPrefs" in user)
  ) {
    return {
      _id: user._id || userId,
      email: user.email || "",
      name: user.name || "",
      notificationPrefs: user.notificationPrefs || {}
    };
  }

  return User.findById(userId).select("name email notificationPrefs").lean();
};

const isChannelEnabled = (prefs, type, channel) => {
  const map = DELIVERY_PREF_MAP[type];
  if (!map || !map[channel]) {
    return true;
  }

  const key = map[channel];
  return prefs[key] !== false;
};

export const getPushConfiguration = () => {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.VAPID_SUBJECT || "").trim();

  return {
    configured: Boolean(publicKey && privateKey && subject),
    publicKey
  };
};

export const dispatchUserNotification = async ({
  userId,
  user = null,
  type = "system",
  title,
  message,
  data = {},
  channels = {}
}) => {
  const targetUserId = userId || user?._id;
  if (!targetUserId || !title || !message) {
    return {
      inApp: false,
      email: false,
      pushSent: 0,
      pushTotal: 0
    };
  }

  const requestedChannels = {
    inApp: channels.inApp !== false,
    email: channels.email !== false,
    push: channels.push !== false
  };

  let inApp = false;
  if (requestedChannels.inApp) {
    await Notification.create({
      userId: targetUserId,
      type,
      title,
      message,
      data
    });
    clearQueryCacheByPrefix(`${NOTIFICATIONS_LIST_CACHE_PREFIX}${String(targetUserId)}`);
    inApp = true;
  }

  const shouldResolveUser = requestedChannels.email || requestedChannels.push;
  const targetUser = shouldResolveUser ? await resolveUser(targetUserId, user) : null;
  const prefs = normalizeNotificationPreferences(targetUser?.notificationPrefs || {});

  let email = false;
  if (requestedChannels.email && targetUser?.email && isChannelEnabled(prefs, type, "email")) {
    const emailResult = await sendEmailNotification({
      to: targetUser.email,
      subject: title,
      message,
      url: data.url || "/alerts"
    });
    email = emailResult.sent;
  }

  let pushSent = 0;
  let pushTotal = 0;
  if (requestedChannels.push && isChannelEnabled(prefs, type, "push")) {
    const pushResult = await sendPushNotification({
      userId: targetUserId,
      title,
      message,
      data
    });
    pushSent = pushResult.sent;
    pushTotal = pushResult.total;
  }

  return {
    inApp,
    email,
    pushSent,
    pushTotal
  };
};
