import express from "express";
import Cart from "../models/Cart.js";
import Component from "../models/Component.js";
import { requireAuth } from "../middleware/auth.js";
import { calculateCartTotals } from "../services/cartTotals.js";

const router = express.Router();

const hydrateCart = async (userId) => {
  const cart = await Cart.findOne({ userId }).populate("items.component");
  if (!cart) {
    return Cart.create({ userId, items: [] }).then((created) => created.populate("items.component"));
  }
  return cart;
};

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const cart = await hydrateCart(req.user._id);
    const totals = calculateCartTotals(cart.items);
    return res.json({ cart, totals });
  } catch (error) {
    return next(error);
  }
});

router.post("/items", async (req, res, next) => {
  try {
    const { componentId, quantity = 1 } = req.body;
    if (!componentId) {
      return res.status(400).json({ message: "componentId is required." });
    }

    const component = await Component.findById(componentId);
    if (!component) {
      return res.status(404).json({ message: "Component not found." });
    }

    const safeQuantity = Math.min(10, Math.max(1, Number(quantity) || 1));
    const cart = await Cart.findOneAndUpdate(
      { userId: req.user._id },
      { $setOnInsert: { items: [] } },
      { upsert: true, new: true }
    );

    const existing = cart.items.find((item) => item.component.toString() === componentId);
    if (existing) {
      existing.quantity = Math.min(10, existing.quantity + safeQuantity);
    } else {
      cart.items.push({ component: componentId, quantity: safeQuantity });
    }

    await cart.save();
    await cart.populate("items.component");

    const totals = calculateCartTotals(cart.items);
    return res.status(201).json({ cart, totals });
  } catch (error) {
    return next(error);
  }
});

router.patch("/items/:itemId", async (req, res, next) => {
  try {
    const { quantity } = req.body;
    const safeQuantity = Math.min(10, Math.max(1, Number(quantity) || 1));

    const cart = await hydrateCart(req.user._id);
    const item = cart.items.id(req.params.itemId);
    if (!item) {
      return res.status(404).json({ message: "Cart item not found." });
    }

    item.quantity = safeQuantity;
    await cart.save();
    await cart.populate("items.component");

    const totals = calculateCartTotals(cart.items);
    return res.json({ cart, totals });
  } catch (error) {
    return next(error);
  }
});

router.delete("/items/:itemId", async (req, res, next) => {
  try {
    const cart = await hydrateCart(req.user._id);
    const item = cart.items.id(req.params.itemId);
    if (!item) {
      return res.status(404).json({ message: "Cart item not found." });
    }

    item.deleteOne();
    await cart.save();
    await cart.populate("items.component");

    const totals = calculateCartTotals(cart.items);
    return res.json({ cart, totals });
  } catch (error) {
    return next(error);
  }
});

router.delete("/", async (req, res, next) => {
  try {
    const cart = await hydrateCart(req.user._id);
    cart.items = [];
    await cart.save();
    const totals = calculateCartTotals(cart.items);
    return res.json({ cart, totals });
  } catch (error) {
    return next(error);
  }
});

export default router;
