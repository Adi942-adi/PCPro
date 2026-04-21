import mongoose from "mongoose";

const twoFactorAuthSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    secret: {
      type: String,
      required: true,
      select: false // Don't include in default queries
    },
    backupCodes: [
      {
        code: {
          type: String,
          required: true
        },
        used: {
          type: Boolean,
          default: false
        },
        usedAt: Date
      }
    ],
    enabled: {
      type: Boolean,
      default: false
    },
    enabledAt: Date,
    lastUsed: Date
  },
  { timestamps: true }
);

const TwoFactorAuth = mongoose.model("TwoFactorAuth", twoFactorAuthSchema);

export default TwoFactorAuth;
