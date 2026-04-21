import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import Notification from "../models/Notification.js";
import PushSubscription from "../models/PushSubscription.js";
import { getPushConfiguration } from "../services/notificationDelivery.js";
import { createPaginationMeta, parsePagination } from "../services/pagination.js";
import {
  buildQueryCacheKey,
  clearQueryCacheByPrefix,
  getOrSetQueryCache
} from "../services/queryCache.js";
import {
  extractNotificationPreferenceUpdates,
  normalizeNotificationPreferences
} from "../utils/notificationPrefs.js";

const router = express.Router();
const NOTIFICATIONS_LIST_CACHE_PREFIX = "notifications:list:";

router.use(requireAuth);

const parsePushSubscriptionPayload = (value = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "subscription payload must be an object." };
  }

  const endpoint = String(value.endpoint || "").trim();
  const p256dh = String(value.keys?.p256dh || "").trim();
  const auth = String(value.keys?.auth || "").trim();

  if (!endpoint) {
    return { ok: false, message: "subscription endpoint is required." };
  }
  if (!p256dh || !auth) {
    return { ok: false, message: "subscription keys are required." };
  }

  let expirationTime = null;
  if (value.expirationTime !== undefined && value.expirationTime !== null && value.expirationTime !== "") {
    const date = new Date(value.expirationTime);
    if (Number.isNaN(date.getTime())) {
      return { ok: false, message: "Invalid subscription expirationTime." };
    }
    expirationTime = date;
  }

  return {
    ok: true,
    value: {
      endpoint,
      expirationTime,
      keys: { p256dh, auth }
    }
  };
};

router.get("/", async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 30, maxLimit: 100 });
    const unreadOnly = String(req.query.unreadOnly || "").toLowerCase() === "true";
    const userScope = String(req.user?._id || "anon");

    const query = { userId: req.user._id };
    if (unreadOnly) {
      query.isRead = false;
    }

    const cacheKey = buildQueryCacheKey(`${NOTIFICATIONS_LIST_CACHE_PREFIX}${userScope}`, {
      page,
      limit,
      unreadOnly
    });
    const cached = await getOrSetQueryCache({
      key: cacheKey,
      ttlMs: 8000,
      resolver: async () => {
        const [items, total, unreadCount] = await Promise.all([
          Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
          Notification.countDocuments(query),
          Notification.countDocuments({ userId: req.user._id, isRead: false })
        ]);

        return {
          items,
          unreadCount,
          pagination: createPaginationMeta({ page, limit, total })
        };
      }
    });

    res.set("X-Cache", cached.hit ? "HIT" : "MISS");
    return res.json({
      ...cached.value
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/preferences", async (req, res) => {
  return res.json({
    notificationPrefs: normalizeNotificationPreferences(req.user.notificationPrefs || {})
  });
});

router.patch("/preferences", async (req, res, next) => {
  try {
    const payload =
      req.body?.notificationPrefs && typeof req.body.notificationPrefs === "object"
        ? req.body.notificationPrefs
        : req.body;
    const validation = extractNotificationPreferenceUpdates(payload);
    if (!validation.ok) {
      return res.status(400).json({ message: validation.message });
    }

    const merged = normalizeNotificationPreferences({
      ...(req.user.notificationPrefs || {}),
      ...(validation.value || {})
    });
    req.user.notificationPrefs = merged;
    await req.user.save();

    return res.json({
      notificationPrefs: normalizeNotificationPreferences(req.user.notificationPrefs || {})
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/push/public-key", async (req, res) => {
  const config = getPushConfiguration();
  return res.json(config);
});

router.get("/push/subscriptions", async (req, res, next) => {
  try {
    const count = await PushSubscription.countDocuments({ userId: req.user._id });
    return res.json({ count, enabled: count > 0 });
  } catch (error) {
    return next(error);
  }
});

router.post("/push/subscriptions", async (req, res, next) => {
  try {
    const pushConfig = getPushConfiguration();
    if (!pushConfig.configured) {
      return res.status(400).json({ message: "Push is not configured on server." });
    }

    const validation = parsePushSubscriptionPayload(req.body?.subscription || req.body);
    if (!validation.ok) {
      return res.status(400).json({ message: validation.message });
    }

    const subscription = await PushSubscription.findOneAndUpdate(
      { endpoint: validation.value.endpoint },
      {
        $set: {
          userId: req.user._id,
          endpoint: validation.value.endpoint,
          expirationTime: validation.value.expirationTime,
          keys: validation.value.keys,
          userAgent: String(req.headers["user-agent"] || "").slice(0, 512)
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    ).lean();

    return res.status(201).json({
      subscription,
      notificationPrefs: normalizeNotificationPreferences(req.user.notificationPrefs || {})
    });
  } catch (error) {
    return next(error);
  }
});

router.delete("/push/subscriptions", async (req, res, next) => {
  try {
    const endpoint = String(req.body?.endpoint || "").trim();
    if (endpoint) {
      const deleted = await PushSubscription.findOneAndDelete({ userId: req.user._id, endpoint });
      return res.json({ success: true, deleted: deleted ? 1 : 0 });
    }

    const result = await PushSubscription.deleteMany({ userId: req.user._id });
    return res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id/read", async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid notification id." });
    }

    const notification = await Notification.findOne({ _id: req.params.id, userId: req.user._id });
    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
    clearQueryCacheByPrefix(`${NOTIFICATIONS_LIST_CACHE_PREFIX}${String(req.user?._id || "anon")}`);

    return res.json(notification);
  } catch (error) {
    return next(error);
  }
});

router.post("/read-all", async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    clearQueryCacheByPrefix(`${NOTIFICATIONS_LIST_CACHE_PREFIX}${String(req.user?._id || "anon")}`);

    return res.json({
      success: true,
      updated: result.modifiedCount || 0
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
