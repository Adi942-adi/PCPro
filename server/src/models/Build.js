import mongoose from "mongoose";

const buildSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    selectedParts: {
      type: Map,
      of: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Component"
      },
      default: {}
    },
    shareId: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true
    },
    isPublic: {
      type: Boolean,
      default: true
    },
    totalPrice: {
      type: Number,
      default: 0,
      min: 0
    },
    compatibility: {
      type: mongoose.Schema.Types.Mixed,
      default: {
        isCompatible: true,
        isReady: false,
        status: "incomplete",
        score: 0,
        issues: [],
        warnings: [],
        recommendations: [],
        checks: [],
        missingRequired: [],
        totalEstimatedWattage: 0,
        recommendedPsuWattage: 0
      }
    }
  },
  { timestamps: true }
);

buildSchema.index({ userId: 1, createdAt: -1 });
buildSchema.index({ isPublic: 1, shareId: 1 });

export default mongoose.model("Build", buildSchema);
