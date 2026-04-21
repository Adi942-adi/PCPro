import mongoose from "mongoose";

const priceAlertSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    componentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Component",
      required: true,
      index: true
    },
    targetPrice: {
      type: Number,
      required: true,
      min: 0
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastNotifiedPrice: {
      type: Number,
      default: null
    },
    lastNotifiedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

priceAlertSchema.index({ userId: 1, componentId: 1 }, { unique: true });
priceAlertSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
priceAlertSchema.index({ componentId: 1, isActive: 1, targetPrice: 1 });

export default mongoose.model("PriceAlert", priceAlertSchema);
