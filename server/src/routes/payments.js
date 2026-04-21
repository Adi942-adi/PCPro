import express from "express";
import Stripe from "stripe";
import Cart from "../models/Cart.js";
import { requireAuth } from "../middleware/auth.js";
import { calculateCartTotals } from "../services/cartTotals.js";

const router = express.Router();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const currency = process.env.CURRENCY || "usd";
const isProduction = process.env.NODE_ENV === "production";
const allowMockPayments =
  String(process.env.ALLOW_MOCK_PAYMENTS || (isProduction ? "false" : "true")).toLowerCase() === "true";

router.use(requireAuth);

router.post("/create-intent", async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ userId: req.user._id }).populate("items.component");
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty." });
    }

    const totals = calculateCartTotals(cart.items);
    const amount = Math.round(totals.total * 100);

    if (!stripe && !allowMockPayments) {
      return res.status(503).json({
        message: "Payments are unavailable. Stripe is not configured and mock payments are disabled."
      });
    }

    if (!stripe) {
      return res.json({
        mode: "mock",
        amount,
        currency,
        clientSecret: "mock_client_secret",
        message: "Stripe key not configured. Running in mock payment mode."
      });
    }

    const intent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId: req.user._id.toString()
      }
    });

    return res.json({
      mode: "stripe",
      amount,
      currency,
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
