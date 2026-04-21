import express from "express";
import Stripe from "stripe";
import Cart from "../models/Cart.js";
import Order from "../models/Order.js";
import { requireAuth } from "../middleware/auth.js";
import { calculateCartTotals } from "../services/cartTotals.js";
import { createPaginationMeta, parsePagination } from "../services/pagination.js";
import {
  buildQueryCacheKey,
  clearQueryCacheByPrefix,
  getOrSetQueryCache
} from "../services/queryCache.js";

const router = express.Router();
const ORDERS_LIST_CACHE_PREFIX = "orders:list:";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const isProduction = process.env.NODE_ENV === "production";
const allowMockPayments =
  String(process.env.ALLOW_MOCK_PAYMENTS || (isProduction ? "false" : "true")).toLowerCase() === "true";

const mapShippingAddress = (input = {}) => ({
  fullName: String(input.fullName || "").trim(),
  email: String(input.email || "").trim(),
  phone: String(input.phone || "").trim(),
  line1: String(input.line1 || "").trim(),
  line2: String(input.line2 || "").trim(),
  city: String(input.city || "").trim(),
  state: String(input.state || "").trim(),
  postalCode: String(input.postalCode || "").trim(),
  country: String(input.country || "").trim()
});

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
    const userScope = String(req.user?._id || "anon");
    const cacheKey = buildQueryCacheKey(`${ORDERS_LIST_CACHE_PREFIX}${userScope}`, {
      page,
      limit
    });
    const cached = await getOrSetQueryCache({
      key: cacheKey,
      ttlMs: 15000,
      resolver: async () => {
        const query = { userId: req.user._id };
        const [items, total] = await Promise.all([
          Order.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("items.component")
            .lean(),
          Order.countDocuments(query)
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

router.post("/from-cart", async (req, res, next) => {
  try {
    const { paymentIntentId = "", paymentMode = "mock", shippingAddress = {} } = req.body;
    const cart = await Cart.findOne({ userId: req.user._id }).populate("items.component");

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty." });
    }

    const totals = calculateCartTotals(cart.items);
    const validItems = totals.items.filter((item) => Boolean(item.component));
    if (!validItems.length) {
      return res.status(400).json({ message: "Cart items are invalid." });
    }

    let paymentStatus = "succeeded";
    let provider = paymentMode === "stripe" ? "stripe" : "mock";

    if (provider === "mock" && !allowMockPayments) {
      return res.status(400).json({ message: "Mock payments are disabled. Use Stripe payment mode." });
    }

    if (provider === "stripe") {
      if (!stripe) {
        return res.status(400).json({ message: "Stripe is not configured on server." });
      }
      if (!paymentIntentId) {
        return res.status(400).json({ message: "paymentIntentId is required for stripe mode." });
      }

      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (intent.status !== "succeeded") {
        return res.status(400).json({
          message: `Payment is not completed. Current status: ${intent.status}.`
        });
      }
      paymentStatus = "succeeded";
    }

    const orderItems = validItems.map((item) => ({
      component: item.component._id,
      name: item.component.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal
    }));

    const order = await Order.create({
      userId: req.user._id,
      items: orderItems,
      subtotal: totals.subtotal,
      shippingFee: totals.shippingFee,
      total: totals.total,
      status: paymentStatus === "succeeded" ? "paid" : "pending",
      payment: {
        provider,
        paymentIntentId,
        paymentStatus
      },
      shippingAddress: mapShippingAddress(shippingAddress)
    });

    cart.items = [];
    await cart.save();

    clearQueryCacheByPrefix(`${ORDERS_LIST_CACHE_PREFIX}${String(req.user?._id || "anon")}`);

    const hydrated = await Order.findById(order._id).populate("items.component");
    return res.status(201).json(hydrated);
  } catch (error) {
    return next(error);
  }
});

export default router;
