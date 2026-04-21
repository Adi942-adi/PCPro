import mongoose from "mongoose";
import crypto from "crypto";

const emailVerificationTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    tokenHash: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 } // Auto-delete expired tokens
    },
    verifiedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

// Static method to generate token
emailVerificationTokenSchema.statics.generateToken = function () {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
};

// Instance method to verify token
emailVerificationTokenSchema.methods.verifyToken = function (token) {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return this.tokenHash === tokenHash && this.expiresAt > new Date();
};

const EmailVerificationToken =
  mongoose.model("EmailVerificationToken", emailVerificationTokenSchema);

export default EmailVerificationToken;
