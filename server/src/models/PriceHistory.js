import mongoose from "mongoose";

const priceHistorySchema = new mongoose.Schema(
  {
    componentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Component",
      required: true,
      index: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    source: {
      type: String,
      enum: ["seed", "dataset_import", "admin_create", "admin_update", "admin_import", "system"],
      default: "system"
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    note: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ""
    }
  },
  { timestamps: true }
);

priceHistorySchema.index({ componentId: 1, createdAt: -1 });

export default mongoose.model("PriceHistory", priceHistorySchema);
