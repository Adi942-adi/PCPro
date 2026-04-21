import express from "express";
import mongoose from "mongoose";
import { requireAdmin } from "../middleware/admin.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import Component from "../models/Component.js";
import PartReview from "../models/PartReview.js";
import PriceHistory from "../models/PriceHistory.js";
import { validateComponentPayload } from "../services/adminValidation.js";
import { createPaginationMeta, paginateArray, parsePagination } from "../services/pagination.js";
import { recordInitialComponentPrice } from "../services/priceTracking.js";
import {
  buildQueryCacheKey,
  clearQueryCacheByPrefix,
  getOrSetQueryCache
} from "../services/queryCache.js";

const router = express.Router();
const MAX_REVIEW_ITEMS = 8;
const COMPONENT_LIST_CACHE_PREFIX = "components:list";
const COMPONENT_DETAIL_CACHE_PREFIX = "components:detail:";
const COMPONENT_REVIEWS_CACHE_PREFIX = "components:reviews:";
const COMPONENT_PRICE_HISTORY_CACHE_PREFIX = "components:price-history:";

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toLower = (value) => String(value || "").trim().toLowerCase();

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const resolveLengthForComponent = (component) => {
  const specs = component?.specs || {};
  const candidates = [specs.lengthMm, specs.gpuMaxLengthMm, specs.depthMm];
  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
};

const matchesFormFactor = (component, expectedFormFactor) => {
  const normalizedExpected = toLower(expectedFormFactor);
  if (!normalizedExpected) {
    return true;
  }

  const direct = toLower(component?.specs?.formFactor);
  if (direct && direct === normalizedExpected) {
    return true;
  }

  const supported = Array.isArray(component?.specs?.supportedFormFactors)
    ? component.specs.supportedFormFactors
    : [];
  return supported.some((item) => toLower(item) === normalizedExpected);
};

const matchesRadiatorSupport = (component, requiredMm) => {
  if (!Number.isFinite(requiredMm) || requiredMm <= 0) {
    return true;
  }

  const specs = component?.specs || {};
  const directMax = Number(specs.radiatorSupportMm);
  if (Number.isFinite(directMax)) {
    return directMax >= requiredMm;
  }

  const sourceLists = [
    specs.radiatorSupport,
    specs.radiatorSupportSizes,
    specs.supportedRadiators,
    specs.radiatorSizes
  ];

  const values = [];
  for (const list of sourceLists) {
    if (Array.isArray(list)) {
      for (const raw of list) {
        const fromNumber = Number(raw);
        if (Number.isFinite(fromNumber)) {
          values.push(fromNumber);
          continue;
        }
        const text = String(raw || "");
        const matches = text.match(/\d+/g) || [];
        for (const token of matches) {
          const parsed = Number(token);
          if (Number.isFinite(parsed)) {
            values.push(parsed);
          }
        }
      }
    } else if (typeof list === "string") {
      const matches = list.match(/\d+/g) || [];
      for (const token of matches) {
        const parsed = Number(token);
        if (Number.isFinite(parsed)) {
          values.push(parsed);
        }
      }
    }
  }

  if (values.length === 0) {
    return false;
  }

  return Math.max(...values) >= requiredMm;
};

const toSafeText = (value, maxLength) => {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return maxLength && trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
};

const parseReviewList = (input) => {
  const source = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/\r?\n|,/)
      : [];

  const unique = [];
  const seen = new Set();
  for (const raw of source) {
    const normalized = toSafeText(String(raw || ""), 180);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    unique.push(normalized);
    seen.add(key);
    if (unique.length >= MAX_REVIEW_ITEMS) {
      break;
    }
  }
  return unique;
};

const serializeReview = (reviewDoc) => {
  const review =
    typeof reviewDoc?.toJSON === "function"
      ? reviewDoc.toJSON({ flattenMaps: true })
      : reviewDoc;
  const user = review?.userId && typeof review.userId === "object" ? review.userId : null;

  return {
    id: review?._id,
    rating: Number(review?.rating || 0),
    pros: Array.isArray(review?.pros) ? review.pros : [],
    cons: Array.isArray(review?.cons) ? review.cons : [],
    comment: String(review?.comment || ""),
    status: review?.status || "pending",
    moderationNote: String(review?.moderationNote || ""),
    moderatedAt: review?.moderatedAt || null,
    createdAt: review?.createdAt || null,
    updatedAt: review?.updatedAt || null,
    user: user
      ? {
          id: user._id,
          name: user.name || "User"
        }
      : null
  };
};

router.get("/", async (req, res, next) => {
  try {
    const {
      type,
      brand,
      search,
      socket,
      ramType,
      formFactor,
      efficiency,
      vramMin,
      vramMax,
      lengthMin,
      lengthMax,
      radiatorMin,
      radiatorSupport,
      minPrice,
      maxPrice,
      sortBy = "name",
      sortDir = "asc"
    } = req.query;
    const { page, limit } = parsePagination(req.query, { defaultLimit: 24, maxLimit: 100 });

    const query = {};
    const normalizedType = toLower(type);
    const normalizedBrand = toLower(brand);
    const normalizedSocket = toLower(socket);
    const normalizedRamType = toLower(ramType);
    const normalizedEfficiency = toLower(efficiency);
    const normalizedFormFactor = toLower(formFactor);
    const normalizedSearch = String(search || "").trim();

    const minPriceNumber = toNumberOrNull(minPrice);
    const maxPriceNumber = toNumberOrNull(maxPrice);
    const minVramNumber = toNumberOrNull(vramMin);
    const maxVramNumber = toNumberOrNull(vramMax);
    const minLengthNumber = toNumberOrNull(lengthMin);
    const maxLengthNumber = toNumberOrNull(lengthMax);
    const minRadiatorNumber = toNumberOrNull(radiatorMin ?? radiatorSupport);

    if (normalizedType) {
      query.type = normalizedType;
    }
    if (normalizedBrand) {
      query.brand = { $regex: `^${escapeRegex(brand)}$`, $options: "i" };
    }
    if (normalizedSocket) {
      query["specs.socket"] = { $regex: `^${escapeRegex(socket)}$`, $options: "i" };
    }
    if (normalizedRamType) {
      query["specs.ramType"] = { $regex: `^${escapeRegex(ramType)}$`, $options: "i" };
    }
    if (minPriceNumber !== null || maxPriceNumber !== null) {
      query.price = {};
      if (minPriceNumber !== null) {
        query.price.$gte = minPriceNumber;
      }
      if (maxPriceNumber !== null) {
        query.price.$lte = maxPriceNumber;
      }
    }
    if (normalizedSearch) {
      query.$or = [
        { name: { $regex: escapeRegex(normalizedSearch), $options: "i" } },
        { brand: { $regex: escapeRegex(normalizedSearch), $options: "i" } }
      ];
    }

    const safeSortFields = new Set(["name", "price", "createdAt"]);
    const sortField = safeSortFields.has(sortBy) ? sortBy : "name";
    const sort = { [sortField]: sortDir === "desc" ? -1 : 1 };

    const cacheKey = buildQueryCacheKey(COMPONENT_LIST_CACHE_PREFIX, {
      ...req.query,
      page,
      limit
    });
    const cached = await getOrSetQueryCache({
      key: cacheKey,
      ttlMs: 20000,
      resolver: async () => {
        const components = await Component.find(query).sort(sort).limit(2500).lean();

        const filtered = components.filter((component) => {
          if (normalizedFormFactor && !matchesFormFactor(component, normalizedFormFactor)) {
            return false;
          }

          if (normalizedEfficiency) {
            const componentEfficiency = toLower(component?.specs?.efficiency);
            if (componentEfficiency !== normalizedEfficiency) {
              return false;
            }
          }

          if (minVramNumber !== null || maxVramNumber !== null) {
            const vram = Number(component?.specs?.vramGb);
            if (!Number.isFinite(vram)) {
              return false;
            }
            if (minVramNumber !== null && vram < minVramNumber) {
              return false;
            }
            if (maxVramNumber !== null && vram > maxVramNumber) {
              return false;
            }
          }

          if (minLengthNumber !== null || maxLengthNumber !== null) {
            const length = resolveLengthForComponent(component);
            if (!Number.isFinite(length)) {
              return false;
            }
            if (minLengthNumber !== null && length < minLengthNumber) {
              return false;
            }
            if (maxLengthNumber !== null && length > maxLengthNumber) {
              return false;
            }
          }

          if (minRadiatorNumber !== null && !matchesRadiatorSupport(component, minRadiatorNumber)) {
            return false;
          }

          return true;
        });

        const total = filtered.length;
        return {
          items: paginateArray(filtered, { page, limit }),
          pagination: createPaginationMeta({ page, limit, total })
        };
      }
    });

    res.set("X-Cache", cached.hit ? "HIT" : "MISS");
    res.json(cached.value);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const cacheKey = buildQueryCacheKey(`${COMPONENT_DETAIL_CACHE_PREFIX}${req.params.id}`, {});
    const cached = await getOrSetQueryCache({
      key: cacheKey,
      ttlMs: 30000,
      resolver: async () => Component.findById(req.params.id).lean()
    });
    const component = cached.value;
    if (!component) {
      return res.status(404).json({ message: "Component not found" });
    }
    res.set("X-Cache", cached.hit ? "HIT" : "MISS");
    return res.json(component);
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/reviews", optionalAuth, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid component id." });
    }

    const componentId = req.params.id;
    const component = await Component.findById(componentId).select("_id").lean();
    if (!component) {
      return res.status(404).json({ message: "Component not found." });
    }

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 12, maxLimit: 30 });
    const cacheKey = buildQueryCacheKey(`${COMPONENT_REVIEWS_CACHE_PREFIX}${componentId}`, {
      page,
      limit,
      userId: req.user?._id?.toString?.() || "anon"
    });
    const cached = await getOrSetQueryCache({
      key: cacheKey,
      ttlMs: 12000,
      resolver: async () => {
        const [items, total, summaryRaw, myReview] = await Promise.all([
          PartReview.find({ componentId, status: "approved" })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("userId", "name")
            .lean(),
          PartReview.countDocuments({ componentId, status: "approved" }),
          PartReview.aggregate([
            {
              $match: {
                componentId: new mongoose.Types.ObjectId(componentId),
                status: "approved"
              }
            },
            {
              $group: {
                _id: null,
                averageRating: { $avg: "$rating" },
                total: { $sum: 1 },
                rating1: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
                rating2: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
                rating3: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
                rating4: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
                rating5: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } }
              }
            }
          ]),
          req.user
            ? PartReview.findOne({ componentId, userId: req.user._id }).populate("userId", "name").lean()
            : null
        ]);

        const summary = summaryRaw?.[0] || {};
        return {
          summary: {
            averageRating:
              Number.isFinite(Number(summary.averageRating))
                ? Math.round(Number(summary.averageRating) * 10) / 10
                : 0,
            totalReviews: Number(summary.total || 0),
            distribution: {
              1: Number(summary.rating1 || 0),
              2: Number(summary.rating2 || 0),
              3: Number(summary.rating3 || 0),
              4: Number(summary.rating4 || 0),
              5: Number(summary.rating5 || 0)
            }
          },
          items: items.map((item) => serializeReview(item)),
          myReview: myReview ? serializeReview(myReview) : null,
          pagination: createPaginationMeta({ page, limit, total })
        };
      }
    });
    res.set("X-Cache", cached.hit ? "HIT" : "MISS");
    return res.json(cached.value);
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/reviews", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid component id." });
    }

    const componentId = req.params.id;
    const component = await Component.findById(componentId).select("_id name").lean();
    if (!component) {
      return res.status(404).json({ message: "Component not found." });
    }

    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "rating must be an integer between 1 and 5." });
    }

    const pros = parseReviewList(req.body.pros);
    const cons = parseReviewList(req.body.cons);
    const comment = toSafeText(req.body.comment || "", 1000);

    if (pros.length === 0 && cons.length === 0 && !comment) {
      return res.status(400).json({ message: "Add at least a comment, pro, or con." });
    }

    let review = await PartReview.findOne({ userId: req.user._id, componentId });
    const isNew = !review;

    if (!review) {
      review = await PartReview.create({
        userId: req.user._id,
        componentId,
        rating,
        pros,
        cons,
        comment,
        status: "pending"
      });
    } else {
      review.rating = rating;
      review.pros = pros;
      review.cons = cons;
      review.comment = comment;
      review.status = "pending";
      review.moderationNote = "";
      review.moderatedBy = null;
      review.moderatedAt = null;
      await review.save();
    }

    const hydrated = await PartReview.findById(review._id).populate("userId", "name").lean();
    clearQueryCacheByPrefix(`${COMPONENT_REVIEWS_CACHE_PREFIX}${componentId}`);
    return res.status(isNew ? 201 : 200).json({
      message: "Review submitted and sent for moderation.",
      review: serializeReview(hydrated)
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "You have already reviewed this component." });
    }
    return next(error);
  }
});

router.get("/:id/price-history", async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid component id." });
    }

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 120 });
    const componentId = req.params.id;
    const cacheKey = buildQueryCacheKey(`${COMPONENT_PRICE_HISTORY_CACHE_PREFIX}${componentId}`, {
      page,
      limit
    });
    const cached = await getOrSetQueryCache({
      key: cacheKey,
      ttlMs: 15000,
      resolver: async () => {
        const component = await Component.findById(componentId)
          .select("name brand type price imageUrl")
          .lean();
        if (!component) {
          return null;
        }

        let total = await PriceHistory.countDocuments({ componentId });
        if (total === 0) {
          await PriceHistory.create({
            componentId,
            price: Number(component.price || 0),
            source: "system",
            note: "Initial snapshot"
          });
          total = 1;
        }

        const history = await PriceHistory.find({ componentId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean();

        return {
          component,
          history,
          pagination: createPaginationMeta({ page, limit, total })
        };
      }
    });

    if (!cached.value) {
      return res.status(404).json({ message: "Component not found." });
    }
    res.set("X-Cache", cached.hit ? "HIT" : "MISS");
    return res.json(cached.value);
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const validation = validateComponentPayload(req.body, { partial: false });
    if (!validation.ok) {
      return res.status(400).json({ message: validation.message });
    }
    const component = await Component.create(validation.value);
    await recordInitialComponentPrice({
      component,
      source: "admin_create",
      actorId: req.user?._id || null,
      note: "Created via components route"
    });
    clearQueryCacheByPrefix(COMPONENT_LIST_CACHE_PREFIX);
    clearQueryCacheByPrefix(COMPONENT_DETAIL_CACHE_PREFIX);
    clearQueryCacheByPrefix(COMPONENT_PRICE_HISTORY_CACHE_PREFIX);
    res.status(201).json(component);
  } catch (error) {
    next(error);
  }
});

export default router;
