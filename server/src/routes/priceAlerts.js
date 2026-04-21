import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import Component from "../models/Component.js";
import PriceAlert from "../models/PriceAlert.js";
import { createPaginationMeta, parsePagination } from "../services/pagination.js";
import {
  buildQueryCacheKey,
  clearQueryCacheByPrefix,
  getOrSetQueryCache
} from "../services/queryCache.js";

const router = express.Router();
const PRICE_ALERTS_LIST_CACHE_PREFIX = "price-alerts:list:";

const serializeAlert = (alertDoc) => {
  const alert =
    typeof alertDoc?.toJSON === "function" ? alertDoc.toJSON({ flattenMaps: true }) : alertDoc;
  const component = alert?.componentId && typeof alert.componentId === "object" ? alert.componentId : null;
  const currentPrice = Number(component?.price || 0);
  const targetPrice = Number(alert?.targetPrice || 0);

  return {
    id: alert?._id,
    componentId: component?._id || alert?.componentId || null,
    component,
    targetPrice,
    isActive: Boolean(alert?.isActive),
    isTriggered: Boolean(component && currentPrice <= targetPrice),
    lastNotifiedPrice: alert?.lastNotifiedPrice ?? null,
    lastNotifiedAt: alert?.lastNotifiedAt ?? null,
    createdAt: alert?.createdAt,
    updatedAt: alert?.updatedAt
  };
};

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
    const userScope = String(req.user?._id || "anon");
    const cacheKey = buildQueryCacheKey(`${PRICE_ALERTS_LIST_CACHE_PREFIX}${userScope}`, {
      page,
      limit
    });
    const cached = await getOrSetQueryCache({
      key: cacheKey,
      ttlMs: 12000,
      resolver: async () => {
        const query = { userId: req.user._id };
        const [alerts, total] = await Promise.all([
          PriceAlert.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("componentId", "name brand type price imageUrl")
            .lean(),
          PriceAlert.countDocuments(query)
        ]);

        return {
          items: alerts.map((item) => serializeAlert(item)),
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

router.post("/", async (req, res, next) => {
  try {
    const { componentId, targetPrice } = req.body;
    if (!mongoose.Types.ObjectId.isValid(componentId)) {
      return res.status(400).json({ message: "Invalid component id." });
    }

    const numericTarget = Number(targetPrice);
    if (!Number.isFinite(numericTarget) || numericTarget < 0 || numericTarget > 1000000) {
      return res.status(400).json({ message: "targetPrice must be between 0 and 1,000,000." });
    }

    const component = await Component.findById(componentId).select("_id");
    if (!component) {
      return res.status(404).json({ message: "Component not found." });
    }

    let alert = await PriceAlert.findOne({ userId: req.user._id, componentId });
    const isNew = !alert;

    if (alert) {
      alert.targetPrice = numericTarget;
      alert.isActive = true;
      await alert.save();
    } else {
      alert = await PriceAlert.create({
        userId: req.user._id,
        componentId,
        targetPrice: numericTarget
      });
    }

    const hydrated = await PriceAlert.findById(alert._id)
      .populate("componentId", "name brand type price imageUrl")
      .lean();
    clearQueryCacheByPrefix(`${PRICE_ALERTS_LIST_CACHE_PREFIX}${String(req.user?._id || "anon")}`);

    return res.status(isNew ? 201 : 200).json(serializeAlert(hydrated));
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid alert id." });
    }

    const alert = await PriceAlert.findOne({ _id: req.params.id, userId: req.user._id });
    if (!alert) {
      return res.status(404).json({ message: "Alert not found." });
    }

    if (req.body.targetPrice !== undefined) {
      const numericTarget = Number(req.body.targetPrice);
      if (!Number.isFinite(numericTarget) || numericTarget < 0 || numericTarget > 1000000) {
        return res.status(400).json({ message: "targetPrice must be between 0 and 1,000,000." });
      }
      alert.targetPrice = numericTarget;
    }

    if (req.body.isActive !== undefined) {
      alert.isActive = Boolean(req.body.isActive);
    }

    await alert.save();
    const hydrated = await PriceAlert.findById(alert._id)
      .populate("componentId", "name brand type price imageUrl")
      .lean();
    clearQueryCacheByPrefix(`${PRICE_ALERTS_LIST_CACHE_PREFIX}${String(req.user?._id || "anon")}`);

    return res.json(serializeAlert(hydrated));
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid alert id." });
    }

    const deleted = await PriceAlert.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!deleted) {
      return res.status(404).json({ message: "Alert not found." });
    }
    clearQueryCacheByPrefix(`${PRICE_ALERTS_LIST_CACHE_PREFIX}${String(req.user?._id || "anon")}`);

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
