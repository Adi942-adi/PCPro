import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { notificationPreferencesSchema } from "../utils/notificationPrefs.js";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    },
    notificationPrefs: {
      type: notificationPreferencesSchema,
      default: () => ({})
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    emailVerifiedAt: {
      type: Date,
      default: null
    },
    oauth: {
      google: {
        id: String,
        displayName: String
      },
      github: {
        id: String,
        displayName: String
      }
    }
  },
  { timestamps: true }
);

userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ email: 1, emailVerified: 1 });
userSchema.index({ "oauth.google.id": 1 });
userSchema.index({ "oauth.github.id": 1 });

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

export default mongoose.model("User", userSchema);
