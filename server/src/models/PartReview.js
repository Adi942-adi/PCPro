import mongoose from "mongoose";

const MAX_LIST_ITEMS = 8;

const reviewSchema = new mongoose.Schema(
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
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    pros: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: 180
        }
      ],
      default: [],
      validate: {
        validator: (items) => Array.isArray(items) && items.length <= MAX_LIST_ITEMS,
        message: "Too many pros items."
      }
    },
    cons: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: 180
        }
      ],
      default: [],
      validate: {
        validator: (items) => Array.isArray(items) && items.length <= MAX_LIST_ITEMS,
        message: "Too many cons items."
      }
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true
    },
    moderationNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    moderatedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

reviewSchema.index({ userId: 1, componentId: 1 }, { unique: true });
reviewSchema.index({ componentId: 1, status: 1, createdAt: -1 });

export default mongoose.model("PartReview", reviewSchema);
