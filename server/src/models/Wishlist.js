import mongoose from "mongoose";

const wishlistItemSchema = new mongoose.Schema(
  {
    componentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Component",
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const wishlistSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    items: [wishlistItemSchema],
    isPublic: {
      type: Boolean,
      default: false
    },
    shareId: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    }
  },
  { timestamps: true }
);

// Index for querying items by userId and componentId
wishlistSchema.index({ userId: 1, "items.componentId": 1 });

wishlistSchema.methods.addItem = function (componentId) {
  const exists = this.items.some((item) => item.componentId.equals(componentId));
  if (!exists) {
    this.items.push({ componentId, addedAt: new Date() });
  }
  return this;
};

wishlistSchema.methods.removeItem = function (componentId) {
  this.items = this.items.filter((item) => !item.componentId.equals(componentId));
  return this;
};

wishlistSchema.methods.hasItem = function (componentId) {
  return this.items.some((item) => item.componentId.equals(componentId));
};

const Wishlist = mongoose.model("Wishlist", wishlistSchema);

export default Wishlist;
