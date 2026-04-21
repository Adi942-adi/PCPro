import express from "express";
import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";
import Build from "../models/Build.js";
import Component from "../models/Component.js";
import Order from "../models/Order.js";
import PartReview from "../models/PartReview.js";
import User from "../models/User.js";
import { requireAdmin } from "../middleware/admin.js";
import { requireAuth } from "../middleware/auth.js";
import {
  parsePagination,
  validateComponentPayload,
  validateObjectId,
  validateOrderStatus,
  validateReviewStatus,
  validateUserRole
} from "../services/adminValidation.js";
import { writeAuditLog } from "../services/auditLog.js";
import {
  recordInitialComponentPrice,
  trackComponentPriceChange
} from "../services/priceTracking.js";
import { clearQueryCacheByPrefix } from "../services/queryCache.js";
import { dispatchUserNotification } from "../services/notificationDelivery.js";

const router = express.Router();

router.use(requireAuth);
router.use(requireAdmin);

const COMPONENT_LIST_CACHE_PREFIX = "components:list";
const COMPONENT_DETAIL_CACHE_PREFIX = "components:detail:";
const COMPONENT_REVIEWS_CACHE_PREFIX = "components:reviews:";
const COMPONENT_PRICE_HISTORY_CACHE_PREFIX = "components:price-history:";
const PRICE_ALERTS_LIST_CACHE_PREFIX = "price-alerts:list:";
const ORDERS_LIST_CACHE_PREFIX = "orders:list:";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toSortDirection = (value) => (String(value).toLowerCase() === "asc" ? 1 : -1);
const toSafeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeName = (value) => {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
};
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const validatePassword = (value) => {
  const password = String(value || "");
  if (password.length < 8 || password.length > 128) {
    return {
      ok: false,
      message: "Password must be between 8 and 128 characters."
    };
  }

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  if (!hasUpper || !hasLower || !hasDigit) {
    return {
      ok: false,
      message: "Password must include uppercase, lowercase, and numeric characters."
    };
  }

  return { ok: true };
};
const getSuperAdminEmails = () => {
  return new Set(
    String(process.env.SUPER_ADMIN_EMAILS || "")
      .split(",")
      .map((email) => normalizeEmail(email))
      .filter(Boolean)
  );
};
const isSuperAdminActor = (actor) => {
  const actorEmail = normalizeEmail(actor?.email || "");
  if (!actorEmail) {
    return false;
  }
  return getSuperAdminEmails().has(actorEmail);
};

const invalidateComponentCaches = (componentId = "") => {
  clearQueryCacheByPrefix(COMPONENT_LIST_CACHE_PREFIX);
  clearQueryCacheByPrefix(PRICE_ALERTS_LIST_CACHE_PREFIX);

  const normalizedId = String(componentId || "").trim();
  if (!normalizedId) {
    clearQueryCacheByPrefix(COMPONENT_DETAIL_CACHE_PREFIX);
    clearQueryCacheByPrefix(COMPONENT_REVIEWS_CACHE_PREFIX);
    clearQueryCacheByPrefix(COMPONENT_PRICE_HISTORY_CACHE_PREFIX);
    return;
  }

  clearQueryCacheByPrefix(`${COMPONENT_DETAIL_CACHE_PREFIX}${normalizedId}`);
  clearQueryCacheByPrefix(`${COMPONENT_REVIEWS_CACHE_PREFIX}${normalizedId}`);
  clearQueryCacheByPrefix(`${COMPONENT_PRICE_HISTORY_CACHE_PREFIX}${normalizedId}`);
};

const toReviewPayload = (review) => {
  return {
    id: review._id,
    rating: review.rating,
    pros: review.pros || [],
    cons: review.cons || [],
    comment: review.comment || "",
    status: review.status,
    moderationNote: review.moderationNote || "",
    moderatedAt: review.moderatedAt || null,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    user: review.userId
      ? {
          id: review.userId._id,
          name: review.userId.name,
          email: review.userId.email
        }
      : null,
    component: review.componentId
      ? {
          id: review.componentId._id,
          name: review.componentId.name,
          type: review.componentId.type,
          brand: review.componentId.brand
        }
      : null,
    moderatedBy: review.moderatedBy
      ? {
          id: review.moderatedBy._id,
          name: review.moderatedBy.name,
          email: review.moderatedBy.email
        }
      : null
  };
};

router.get("/overview", async (req, res, next) => {
  try {
    const [
      components,
      users,
      orders,
      builds,
      reviews,
      pendingReviews,
      paidRevenue,
      paidOrders,
      recentOrders,
      recentAuditLogs
    ] =
      await Promise.all([
        Component.countDocuments(),
        User.countDocuments(),
        Order.countDocuments(),
        Build.countDocuments(),
        PartReview.countDocuments(),
        PartReview.countDocuments({ status: "pending" }),
        Order.aggregate([
          { $match: { status: { $in: ["paid", "shipped", "delivered"] } } },
          { $group: { _id: null, totalRevenue: { $sum: "$total" } } }
        ]),
        Order.countDocuments({ status: { $in: ["paid", "shipped", "delivered"] } }),
        Order.find()
          .sort({ createdAt: -1 })
          .limit(8)
          .populate("userId", "name email")
          .lean(),
        AuditLog.find()
          .sort({ createdAt: -1 })
          .limit(12)
          .populate("actorId", "name email role")
          .lean()
      ]);

    const revenue = paidRevenue?.[0]?.totalRevenue || 0;
    return res.json({
      metrics: {
        components,
        users,
        orders,
        builds,
        reviews,
        pendingReviews,
        paidOrders,
        revenue
      },
      recentOrders,
      recentAuditLogs
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/components", async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { type, search, sortBy = "createdAt", sortDir = "desc" } = req.query;

    const query = {};
    if (type) {
      query.type = String(type).trim().toLowerCase();
    }
    if (search) {
      const safe = toSafeRegex(search);
      query.$or = [
        { name: { $regex: safe, $options: "i" } },
        { brand: { $regex: safe, $options: "i" } }
      ];
    }

    const allowedSortBy = new Set(["createdAt", "name", "price", "brand", "type"]);
    const sortField = allowedSortBy.has(sortBy) ? sortBy : "createdAt";
    const sort = { [sortField]: toSortDirection(sortDir) };

    const [items, total] = await Promise.all([
      Component.find(query).sort(sort).skip(skip).limit(limit).lean(),
      Component.countDocuments(query)
    ]);

    return res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/components", async (req, res, next) => {
  try {
    const validation = validateComponentPayload(req.body, { partial: false });
    if (!validation.ok) {
      return res.status(400).json({ message: validation.message });
    }

    const created = await Component.create(validation.value);
    await recordInitialComponentPrice({
      component: created,
      source: "admin_create",
      actorId: req.user?._id || null,
      note: "Created in admin panel"
    });
    await writeAuditLog({
      req,
      actor: req.user,
      action: "component.create",
      resource: "component",
      resourceId: created._id.toString(),
      severity: "critical",
      details: {
        type: created.type,
        name: created.name,
        price: created.price
      }
    });
    invalidateComponentCaches(created._id);

    return res.status(201).json(created);
  } catch (error) {
    return next(error);
  }
});

router.patch("/components/:id", async (req, res, next) => {
  try {
    const idValidation = validateObjectId(req.params.id);
    if (!idValidation.ok) {
      return res.status(400).json({ message: idValidation.message });
    }

    const validation = validateComponentPayload(req.body, { partial: true });
    if (!validation.ok) {
      return res.status(400).json({ message: validation.message });
    }

    const existing = await Component.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Component not found." });
    }

    const previousPrice = Number(existing.price);
    const changedKeys = Object.keys(validation.value);
    for (const [key, value] of Object.entries(validation.value)) {
      existing[key] = value;
    }
    await existing.save();

    const tracking = await trackComponentPriceChange({
      component: existing,
      previousPrice,
      source: "admin_update",
      actorId: req.user?._id || null,
      note: "Updated in admin panel"
    });

    await writeAuditLog({
      req,
      actor: req.user,
      action: "component.update",
      resource: "component",
      resourceId: existing._id.toString(),
      severity: "critical",
      details: {
        changedKeys,
        priceChanged: tracking.changed,
        notificationsSent: tracking.notificationsSent
      }
    });
    invalidateComponentCaches(existing._id);

    return res.json(existing);
  } catch (error) {
    return next(error);
  }
});

router.delete("/components/:id", async (req, res, next) => {
  try {
    const idValidation = validateObjectId(req.params.id);
    if (!idValidation.ok) {
      return res.status(400).json({ message: idValidation.message });
    }

    const deleted = await Component.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Component not found." });
    }

    await writeAuditLog({
      req,
      actor: req.user,
      action: "component.delete",
      resource: "component",
      resourceId: deleted._id.toString(),
      severity: "critical",
      details: { type: deleted.type, name: deleted.name }
    });
    invalidateComponentCaches(deleted._id);

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.post("/components/import-json", async (req, res, next) => {
  try {
    const { items = [], mode = "upsert" } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items must be a non-empty array." });
    }
    if (items.length > 2000) {
      return res.status(400).json({ message: "Maximum 2000 items per import." });
    }

    const importMode = String(mode).toLowerCase() === "insert" ? "insert" : "upsert";
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let notificationsSent = 0;
    const errors = [];

    for (let index = 0; index < items.length; index += 1) {
      const raw = items[index];
      const validation = validateComponentPayload(raw, { partial: false });
      if (!validation.ok) {
        skipped += 1;
        errors.push({ index, message: validation.message });
        continue;
      }

      const payload = validation.value;
      const matchQuery = { type: payload.type, name: payload.name };
      const existing = await Component.findOne(matchQuery);

      if (existing) {
        if (importMode === "insert") {
          skipped += 1;
          continue;
        }
        const previousPrice = Number(existing.price);
        existing.brand = payload.brand;
        existing.price = payload.price;
        existing.imageUrl = payload.imageUrl;
        existing.specs = payload.specs;
        await existing.save();
        const tracking = await trackComponentPriceChange({
          component: existing,
          previousPrice,
          source: "admin_import",
          actorId: req.user?._id || null,
          note: "Updated via admin import"
        });
        notificationsSent += tracking.notificationsSent;
        updated += 1;
      } else {
        const created = await Component.create(payload);
        await recordInitialComponentPrice({
          component: created,
          source: "admin_import",
          actorId: req.user?._id || null,
          note: "Inserted via admin import"
        });
        inserted += 1;
      }
    }

    await writeAuditLog({
      req,
      actor: req.user,
      action: "component.import",
      resource: "component",
      severity: "critical",
      details: {
        mode: importMode,
        totalRequested: items.length,
        inserted,
        updated,
        skipped,
        notificationsSent
      }
    });
    if (inserted > 0 || updated > 0) {
      invalidateComponentCaches();
    }

    return res.json({
      mode: importMode,
      totalRequested: items.length,
      inserted,
      updated,
      skipped,
      notificationsSent,
      errors: errors.slice(0, 100)
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/components/import-validate", async (req, res, next) => {
  try {
    const { items = [], mode = "upsert" } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items must be a non-empty array." });
    }
    if (items.length > 2000) {
      return res.status(400).json({ message: "Maximum 2000 items per import." });
    }

    const importMode = String(mode).toLowerCase() === "insert" ? "insert" : "upsert";
    const validationErrors = [];
    const duplicateErrors = [];
    const candidates = [];
    const seenKeys = new Map();

    for (let index = 0; index < items.length; index += 1) {
      const raw = items[index];
      const validation = validateComponentPayload(raw, { partial: false });
      if (!validation.ok) {
        validationErrors.push({ index, message: validation.message });
        continue;
      }

      const payload = validation.value;
      const key = `${payload.type}::${payload.name.toLowerCase()}`;
      if (seenKeys.has(key)) {
        duplicateErrors.push({
          index,
          message: `Duplicate row in file for ${payload.type} / ${payload.name}.`
        });
        continue;
      }

      seenKeys.set(key, index);
      candidates.push({ index, payload, key });
    }

    const uniqueQueries = [];
    for (const candidate of candidates) {
      uniqueQueries.push({ type: candidate.payload.type, name: candidate.payload.name });
    }

    const existing = uniqueQueries.length
      ? await Component.find({ $or: uniqueQueries }).select("type name").lean()
      : [];
    const existingMap = new Map(
      existing.map((entry) => [`${entry.type}::${String(entry.name).toLowerCase()}`, true])
    );

    const readyIndexes = [];
    let insertCount = 0;
    let updateCount = 0;
    const skips = [];

    for (const candidate of candidates) {
      const exists = existingMap.has(candidate.key);
      if (exists && importMode === "insert") {
        skips.push({
          index: candidate.index,
          message: "Already exists and will be skipped in insert mode."
        });
        continue;
      }

      if (exists) {
        updateCount += 1;
      } else {
        insertCount += 1;
      }
      readyIndexes.push(candidate.index);
    }

    const errors = [...validationErrors, ...duplicateErrors].sort((a, b) => a.index - b.index);
    const sortedSkips = [...skips].sort((a, b) => a.index - b.index);

    return res.json({
      mode: importMode,
      totalRequested: items.length,
      readyCount: readyIndexes.length,
      errorCount: errors.length,
      skipCount: sortedSkips.length,
      insertCount,
      updateCount,
      readyIndexes,
      errors: errors.slice(0, 200),
      skips: sortedSkips.slice(0, 200)
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/orders", async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status, search } = req.query;

    const query = {};
    if (status && status !== "all") {
      query.status = String(status).toLowerCase();
    }

    if (search) {
      const safe = toSafeRegex(search);
      const maybeId = mongoose.Types.ObjectId.isValid(search) ? new mongoose.Types.ObjectId(search) : null;
      query.$or = [
        { "shippingAddress.email": { $regex: safe, $options: "i" } },
        { "shippingAddress.fullName": { $regex: safe, $options: "i" } },
        ...(maybeId ? [{ _id: maybeId }] : [])
      ];
    }

    const [items, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name email role")
        .lean(),
      Order.countDocuments(query)
    ]);

    return res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/orders/:id/status", async (req, res, next) => {
  try {
    const idValidation = validateObjectId(req.params.id);
    if (!idValidation.ok) {
      return res.status(400).json({ message: idValidation.message });
    }

    const statusValidation = validateOrderStatus(req.body.status);
    if (!statusValidation.ok) {
      return res.status(400).json({ message: statusValidation.message });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const previousStatus = order.status;
    order.status = statusValidation.value;
    await order.save();

    await writeAuditLog({
      req,
      actor: req.user,
      action: "order.update-status",
      resource: "order",
      resourceId: order._id.toString(),
      severity: "critical",
      details: {
        previousStatus,
        nextStatus: order.status
      }
    });
    clearQueryCacheByPrefix(ORDERS_LIST_CACHE_PREFIX);

    return res.json(order);
  } catch (error) {
    return next(error);
  }
});

router.get("/users", async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search, role } = req.query;

    const query = {};
    if (role && role !== "all") {
      query.role = String(role).toLowerCase();
    }
    if (search) {
      const safe = toSafeRegex(search);
      query.$or = [
        { name: { $regex: safe, $options: "i" } },
        { email: { $regex: safe, $options: "i" } }
      ];
    }

    const [items, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).select("-passwordHash").lean(),
      User.countDocuments(query)
    ]);

    return res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/users", async (req, res, next) => {
  try {
    const { name, email, password, role = "user" } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required." });
    }

    const normalizedName = normalizeName(name);
    if (normalizedName.length < 2) {
      return res.status(400).json({ message: "Name must be at least 2 characters." });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!EMAIL_REGEX.test(normalizedEmail) || normalizedEmail.length > 160) {
      return res.status(400).json({ message: "A valid email is required." });
    }

    const roleValidation = validateUserRole(role);
    if (!roleValidation.ok) {
      return res.status(400).json({ message: roleValidation.message });
    }
    if (roleValidation.value === "admin" && !isSuperAdminActor(req.user)) {
      await writeAuditLog({
        req,
        actor: req.user,
        action: "user.create",
        resource: "user",
        severity: "critical",
        outcome: "failure",
        details: {
          reason: "super_admin_required",
          attemptedRole: "admin",
          targetEmail: normalizedEmail
        }
      });
      return res.status(403).json({
        message: "Only super admins can create admin accounts. Configure SUPER_ADMIN_EMAILS."
      });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.ok) {
      return res.status(400).json({ message: passwordValidation.message });
    }

    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      return res.status(409).json({ message: "Email is already in use." });
    }

    const passwordHash = await User.hashPassword(password);
    const created = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      passwordHash,
      role: roleValidation.value
    });

    await writeAuditLog({
      req,
      actor: req.user,
      action: "user.create",
      resource: "user",
      resourceId: created._id.toString(),
      severity: "critical",
      details: {
        targetEmail: created.email,
        targetRole: created.role
      }
    });

    return res.status(201).json({
      id: created._id,
      name: created.name,
      email: created.email,
      role: created.role,
      createdAt: created.createdAt
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/users/:id/role", async (req, res, next) => {
  try {
    const idValidation = validateObjectId(req.params.id);
    if (!idValidation.ok) {
      return res.status(400).json({ message: idValidation.message });
    }

    const roleValidation = validateUserRole(req.body.role);
    if (!roleValidation.ok) {
      return res.status(400).json({ message: roleValidation.message });
    }

    if (req.user._id.toString() === req.params.id && roleValidation.value !== "admin") {
      await writeAuditLog({
        req,
        actor: req.user,
        action: "user.update-role",
        resource: "user",
        resourceId: req.params.id,
        severity: "critical",
        outcome: "failure",
        details: {
          reason: "self_demote_blocked",
          attemptedRole: roleValidation.value
        }
      });
      return res.status(400).json({ message: "You cannot remove your own admin access." });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (roleValidation.value === "admin" && user.role !== "admin" && !isSuperAdminActor(req.user)) {
      await writeAuditLog({
        req,
        actor: req.user,
        action: "user.update-role",
        resource: "user",
        resourceId: req.params.id,
        severity: "critical",
        outcome: "failure",
        details: {
          reason: "super_admin_required",
          attemptedRole: "admin",
          targetEmail: user.email
        }
      });
      return res.status(403).json({
        message: "Only super admins can grant admin role. Configure SUPER_ADMIN_EMAILS."
      });
    }

    const previousRole = user.role;
    user.role = roleValidation.value;
    await user.save();

    await writeAuditLog({
      req,
      actor: req.user,
      action: "user.update-role",
      resource: "user",
      resourceId: user._id.toString(),
      severity: "critical",
      details: {
        previousRole,
        nextRole: user.role,
        targetEmail: user.email
      }
    });

    return res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/reviews", async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status = "pending", rating, search } = req.query;

    const query = {};
    if (status && status !== "all") {
      const statusValidation = validateReviewStatus(status);
      if (!statusValidation.ok) {
        return res.status(400).json({ message: statusValidation.message });
      }
      query.status = statusValidation.value;
    }

    if (rating !== undefined && rating !== "") {
      const numericRating = Number(rating);
      if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
        return res.status(400).json({ message: "rating must be an integer between 1 and 5." });
      }
      query.rating = numericRating;
    }

    if (search) {
      query.comment = { $regex: toSafeRegex(search), $options: "i" };
    }

    const [items, total] = await Promise.all([
      PartReview.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name email")
        .populate("componentId", "name brand type")
        .populate("moderatedBy", "name email")
        .lean(),
      PartReview.countDocuments(query)
    ]);

    return res.json({
      items: items.map((item) => toReviewPayload(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/reviews/:id/moderate", async (req, res, next) => {
  try {
    const idValidation = validateObjectId(req.params.id);
    if (!idValidation.ok) {
      return res.status(400).json({ message: idValidation.message });
    }

    const statusValidation = validateReviewStatus(req.body.status);
    if (!statusValidation.ok) {
      return res.status(400).json({ message: statusValidation.message });
    }

    const moderationNote = String(req.body.moderationNote || "").trim().slice(0, 500);
    const review = await PartReview.findById(req.params.id)
      .populate("userId", "name email")
      .populate("componentId", "name brand type");
    if (!review) {
      return res.status(404).json({ message: "Review not found." });
    }

    const previousStatus = review.status;
    review.status = statusValidation.value;
    review.moderationNote = moderationNote;
    review.moderatedBy = req.user._id;
    review.moderatedAt = new Date();
    await review.save();

    await writeAuditLog({
      req,
      actor: req.user,
      action: "review.moderate",
      resource: "review",
      resourceId: review._id.toString(),
      severity: "critical",
      details: {
        previousStatus,
        nextStatus: review.status,
        componentId: review.componentId?._id?.toString?.() || "",
        componentName: review.componentId?.name || "",
        targetUserId: review.userId?._id?.toString?.() || "",
        targetUserEmail: review.userId?.email || ""
      }
    });

    if (review.userId?._id) {
      const title = `Your review was ${review.status}`;
      const message = `Your review for "${review.componentId?.name || "component"}" is now ${
        review.status
      }.`;
      await dispatchUserNotification({
        userId: review.userId._id,
        user: review.userId,
        type: "review_moderation",
        title,
        message,
        data: {
          reviewId: review._id,
          componentId: review.componentId?._id || null,
          status: review.status,
          moderationNote,
          url: review.componentId?._id ? `/products/${review.componentId._id}` : "/alerts"
        },
        channels: {
          inApp: true,
          email: true,
          push: true
        }
      });
    }

    if (review.componentId?._id) {
      clearQueryCacheByPrefix(`${COMPONENT_REVIEWS_CACHE_PREFIX}${String(review.componentId._id)}`);
    }

    const hydrated = await PartReview.findById(review._id)
      .populate("userId", "name email")
      .populate("componentId", "name brand type")
      .populate("moderatedBy", "name email")
      .lean();

    return res.json(toReviewPayload(hydrated));
  } catch (error) {
    return next(error);
  }
});

router.get("/audit-logs", async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { action, resource, actorId } = req.query;

    const query = {};
    if (action) {
      query.action = String(action).trim();
    }
    if (resource) {
      query.resource = String(resource).trim();
    }
    if (actorId && mongoose.Types.ObjectId.isValid(actorId)) {
      query.actorId = actorId;
    }

    const [items, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("actorId", "name email role")
        .lean(),
      AuditLog.countDocuments(query)
    ]);

    return res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
