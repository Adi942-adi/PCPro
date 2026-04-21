import express from "express";
import { requireAuth } from "../middleware/auth.js";
import Wishlist from "../models/Wishlist.js";
import Component from "../models/Component.js";
import { validate } from "../middleware/validateRequest.js";
import { NotFoundError, BadRequestError, ConflictError } from "../utils/errors.js";
import { z } from "zod";
import crypto from "crypto";

const router = express.Router();

/**
 * @swagger
 * /wishlist:
 *   get:
 *     summary: Get user's wishlist
 *     tags: [Wishlist]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Wishlist retrieved
 *       401:
 *         description: Unauthorized
 */

const addItemSchema = z.object({
  componentId: z.string().min(1, "Component ID is required")
});

/**
 * Get user's wishlist
 */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    let wishlist = await Wishlist.findOne({ userId: req.user._id }).populate("items.componentId");

    if (!wishlist) {
      wishlist = new Wishlist({ userId: req.user._id });
      await wishlist.save();
    }

    res.json({
      wishlist: {
        id: wishlist._id,
        items: wishlist.items || [],
        itemCount: wishlist.items.length,
        isPublic: wishlist.isPublic,
        shareId: wishlist.shareId,
        createdAt: wishlist.createdAt,
        updatedAt: wishlist.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Add item to wishlist
 */
router.post("/items", requireAuth, validate(addItemSchema), async (req, res, next) => {
  try {
    const { componentId } = req.validatedData;

    // Verify component exists
    const component = await Component.findById(componentId);
    if (!component) {
      return next(new NotFoundError("Component"));
    }

    let wishlist = await Wishlist.findOne({ userId: req.user._id });

    if (!wishlist) {
      wishlist = new Wishlist({ userId: req.user._id });
    }

    if (wishlist.hasItem(componentId)) {
      return next(new ConflictError("Item already in wishlist"));
    }

    wishlist.addItem(componentId);
    await wishlist.save();
    await wishlist.populate("items.componentId");

    res.status(201).json({
      message: "Item added to wishlist",
      item: { componentId, addedAt: new Date() }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Remove item from wishlist
 */
router.delete("/items/:componentId", requireAuth, async (req, res, next) => {
  try {
    const { componentId } = req.params;

    const wishlist = await Wishlist.findOne({ userId: req.user._id });

    if (!wishlist) {
      return next(new NotFoundError("Wishlist"));
    }

    if (!wishlist.hasItem(componentId)) {
      return next(new NotFoundError("Item not found in wishlist"));
    }

    wishlist.removeItem(componentId);
    await wishlist.save();

    res.json({ message: "Item removed from wishlist" });
  } catch (error) {
    next(error);
  }
});

/**
 * Clear entire wishlist
 */
router.delete("/", requireAuth, async (req, res, next) => {
  try {
    const wishlist = await Wishlist.findOne({ userId: req.user._id });

    if (!wishlist) {
      return next(new NotFoundError("Wishlist"));
    }

    wishlist.items = [];
    await wishlist.save();

    res.json({ message: "Wishlist cleared" });
  } catch (error) {
    next(error);
  }
});

/**
 * Make wishlist public and get share ID
 */
router.post("/public", requireAuth, async (req, res, next) => {
  try {
    let wishlist = await Wishlist.findOne({ userId: req.user._id });

    if (!wishlist) {
      wishlist = new Wishlist({ userId: req.user._id });
    }

    if (!wishlist.isPublic) {
      wishlist.isPublic = true;
      wishlist.shareId = crypto.randomBytes(12).toString("hex");
    }

    await wishlist.save();

    res.json({
      message: "Wishlist made public",
      shareId: wishlist.shareId,
      shareUrl: `${process.env.CLIENT_ORIGIN}/wishlist/${wishlist.shareId}`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Make wishlist private
 */
router.delete("/public", requireAuth, async (req, res, next) => {
  try {
    const wishlist = await Wishlist.findOne({ userId: req.user._id });

    if (!wishlist) {
      return next(new NotFoundError("Wishlist"));
    }

    wishlist.isPublic = false;
    wishlist.shareId = null;
    await wishlist.save();

    res.json({ message: "Wishlist made private" });
  } catch (error) {
    next(error);
  }
});

/**
 * Get public wishlist by share ID
 */
router.get("/public/:shareId", async (req, res, next) => {
  try {
    const { shareId } = req.params;

    const wishlist = await Wishlist.findOne({ shareId, isPublic: true }).populate(
      "items.componentId"
    );

    if (!wishlist) {
      return next(new NotFoundError("Public wishlist"));
    }

    res.json({
      wishlist: {
        id: wishlist._id,
        items: wishlist.items || [],
        itemCount: wishlist.items.length,
        createdAt: wishlist.createdAt,
        updatedAt: wishlist.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Compare two wishlists
 */
router.get("/compare/:shareId1/:shareId2", async (req, res, next) => {
  try {
    const { shareId1, shareId2 } = req.params;

    const [wishlist1, wishlist2] = await Promise.all([
      Wishlist.findOne({ shareId: shareId1, isPublic: true }).populate("items.componentId"),
      Wishlist.findOne({ shareId: shareId2, isPublic: true }).populate("items.componentId")
    ]);

    if (!wishlist1 || !wishlist2) {
      return next(new NotFoundError("One or both wishlists"));
    }

    const items1 = new Set(wishlist1.items.map((i) => i.componentId._id.toString()));
    const items2 = new Set(wishlist2.items.map((i) => i.componentId._id.toString()));

    const inBoth = [...items1].filter((id) => items2.has(id));
    const onlyIn1 = [...items1].filter((id) => !items2.has(id));
    const onlyIn2 = [...items2].filter((id) => !items1.has(id));

    res.json({
      comparison: {
        inBoth,
        onlyIn1,
        onlyIn2,
        totalInWishlist1: items1.size,
        totalInWishlist2: items2.size
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
