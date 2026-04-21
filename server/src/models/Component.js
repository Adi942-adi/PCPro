import mongoose from "mongoose";

const componentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["cpu", "motherboard", "ram", "gpu", "storage", "psu", "case"],
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    brand: {
      type: String,
      required: true,
      trim: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    imageUrl: {
      type: String,
      default: ""
    },
    specs: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

componentSchema.index({ type: 1, name: 1 });
componentSchema.index({ type: 1, price: 1 });
componentSchema.index({ type: 1, brand: 1, price: 1 });
componentSchema.index({ type: 1, createdAt: -1 });
componentSchema.index({ "specs.socket": 1, type: 1 });
componentSchema.index({ "specs.ramType": 1, type: 1 });
componentSchema.index({ "specs.formFactor": 1, type: 1 });
componentSchema.index({ "specs.vramGb": 1, type: 1 });
componentSchema.index({ "specs.efficiency": 1, type: 1 });
componentSchema.index({ "specs.lengthMm": 1, type: 1 });
componentSchema.index({ "specs.gpuMaxLengthMm": 1, type: 1 });

export default mongoose.model("Component", componentSchema);
