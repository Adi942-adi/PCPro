import express from "express";
import { randomBytes } from "crypto";
import Build from "../models/Build.js";
import Component from "../models/Component.js";
import { requireAuth } from "../middleware/auth.js";
import { evaluateBuildCompatibility } from "../services/compatibility.js";
import { createPaginationMeta, parsePagination } from "../services/pagination.js";
import {
  buildQueryCacheKey,
  clearQueryCacheByPrefix,
  getOrSetQueryCache
} from "../services/queryCache.js";

const router = express.Router();
const BUILD_SHARE_CACHE_PREFIX = "builds:share:";
const BUILD_LIST_CACHE_PREFIX = "builds:list:";
const BUILD_DETAIL_CACHE_PREFIX = "builds:detail:";

const createShareId = () => randomBytes(6).toString("hex");
const toUserScope = (userId) => String(userId || "anon");

const isDuplicateShareIdError = (error) => {
  return Boolean(error?.code === 11000 && error?.keyPattern?.shareId);
};

const isValidShareId = (value) => {
  return /^[a-z0-9-]{6,64}$/.test(String(value || "").trim().toLowerCase());
};

const toPublicBuildPayload = (buildDoc) => {
  const build =
    typeof buildDoc.toJSON === "function"
      ? buildDoc.toJSON({ flattenMaps: true })
      : buildDoc;
  return {
    id: build._id,
    shareId: build.shareId,
    name: build.name,
    totalPrice: build.totalPrice,
    compatibility: build.compatibility,
    selectedParts: build.selectedParts,
    createdAt: build.createdAt,
    updatedAt: build.updatedAt
  };
};

const ensureShareId = async (build) => {
  if (build.shareId) {
    return build.shareId;
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    build.shareId = createShareId();
    try {
      await build.save();
      return build.shareId;
    } catch (error) {
      if (isDuplicateShareIdError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to allocate unique share ID.");
};

router.get("/share/:shareId", async (req, res, next) => {
  try {
    const shareId = String(req.params.shareId || "").trim().toLowerCase();
    if (!isValidShareId(shareId)) {
      return res.status(400).json({ message: "Invalid share id." });
    }

    const cacheKey = buildQueryCacheKey(`${BUILD_SHARE_CACHE_PREFIX}${shareId}`, {});
    const cached = await getOrSetQueryCache({
      key: cacheKey,
      ttlMs: 30000,
      resolver: async () =>
        Build.findOne({ shareId, isPublic: true }).populate("selectedParts.$*").lean()
    });

    const build = cached.value;
    if (!build) {
      return res.status(404).json({ message: "Shared build not found." });
    }

    res.set("X-Cache", cached.hit ? "HIT" : "MISS");
    return res.json({ build: toPublicBuildPayload(build) });
  } catch (error) {
    return next(error);
  }
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
    const userScope = toUserScope(req.user?._id);
    const cacheKey = buildQueryCacheKey(`${BUILD_LIST_CACHE_PREFIX}${userScope}`, { page, limit });
    const cached = await getOrSetQueryCache({
      key: cacheKey,
      ttlMs: 15000,
      resolver: async () => {
        const query = { userId: req.user._id };
        const [items, total] = await Promise.all([
          Build.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("selectedParts.$*")
            .lean(),
          Build.countDocuments(query)
        ]);

        return {
          items,
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

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const userScope = toUserScope(req.user?._id);
    const cacheKey = buildQueryCacheKey(`${BUILD_DETAIL_CACHE_PREFIX}${userScope}:${req.params.id}`, {});
    const cached = await getOrSetQueryCache({
      key: cacheKey,
      ttlMs: 20000,
      resolver: async () =>
        Build.findOne({ _id: req.params.id, userId: req.user._id })
          .populate("selectedParts.$*")
          .lean()
    });
    const build = cached.value;
    if (!build) {
      return res.status(404).json({ message: "Build not found" });
    }
    res.set("X-Cache", cached.hit ? "HIT" : "MISS");
    return res.json(build);
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { name, selectedPartIds = {} } = req.body;
    const ids = Object.values(selectedPartIds).filter(Boolean);

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Build name is required." });
    }
    if (!ids.length) {
      return res.status(400).json({ message: "Select at least one component." });
    }

    const parts = await Component.find({ _id: { $in: ids } }).lean();
    const partsByType = {};
    for (const part of parts) {
      partsByType[part.type] = part;
    }

    const compatibility = evaluateBuildCompatibility(partsByType);
    const mappedParts = {};
    for (const [type, part] of Object.entries(partsByType)) {
      mappedParts[type] = part._id;
    }

    let created = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        created = await Build.create({
          name: name.trim(),
          userId: req.user._id,
          shareId: createShareId(),
          isPublic: true,
          selectedParts: mappedParts,
          totalPrice: compatibility.totalPrice,
          compatibility
        });
        break;
      } catch (error) {
        if (isDuplicateShareIdError(error)) {
          continue;
        }
        throw error;
      }
    }

    if (!created) {
      throw new Error("Failed to generate share id for build.");
    }

    const hydrated = await Build.findById(created._id).populate("selectedParts.$*");
    const userScope = toUserScope(req.user?._id);
    clearQueryCacheByPrefix(`${BUILD_LIST_CACHE_PREFIX}${userScope}`);
    clearQueryCacheByPrefix(`${BUILD_DETAIL_CACHE_PREFIX}${userScope}:${created._id}`);
    clearQueryCacheByPrefix(`${BUILD_SHARE_CACHE_PREFIX}${created.shareId}`);
    return res.status(201).json(hydrated);
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/share", requireAuth, async (req, res, next) => {
  try {
    const build = await Build.findOne({ _id: req.params.id, userId: req.user._id });
    if (!build) {
      return res.status(404).json({ message: "Build not found." });
    }
    const previousShareId = build.shareId;

    if (req.body?.isPublic !== undefined) {
      build.isPublic = Boolean(req.body.isPublic);
    }

    if (!build.shareId) {
      await ensureShareId(build);
    } else if (build.isModified()) {
      await build.save();
    }

    const userScope = toUserScope(req.user?._id);
    clearQueryCacheByPrefix(`${BUILD_LIST_CACHE_PREFIX}${userScope}`);
    clearQueryCacheByPrefix(`${BUILD_DETAIL_CACHE_PREFIX}${userScope}:${build._id}`);
    if (previousShareId) {
      clearQueryCacheByPrefix(`${BUILD_SHARE_CACHE_PREFIX}${previousShareId}`);
    }
    if (build.shareId) {
      clearQueryCacheByPrefix(`${BUILD_SHARE_CACHE_PREFIX}${build.shareId}`);
    }

    const baseOrigin = String(process.env.CLIENT_ORIGIN || req.headers.origin || "").replace(/\/+$/, "");
    const sharePath = `/build-share/${build.shareId}`;

    return res.json({
      buildId: build._id,
      shareId: build.shareId,
      isPublic: build.isPublic,
      sharePath,
      shareUrl: baseOrigin ? `${baseOrigin}${sharePath}` : sharePath
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
