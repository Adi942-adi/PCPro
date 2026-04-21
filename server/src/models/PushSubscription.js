import mongoose from "mongoose";

const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    endpoint: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      maxlength: 2048
    },
    expirationTime: {
      type: Date,
      default: null
    },
    keys: {
      p256dh: {
        type: String,
        required: true,
        trim: true,
        maxlength: 512
      },
      auth: {
        type: String,
        required: true,
        trim: true,
        maxlength: 512
      }
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 512,
      default: ""
    }
  },
  { timestamps: true }
);

pushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });
pushSubscriptionSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("PushSubscription", pushSubscriptionSchema);
