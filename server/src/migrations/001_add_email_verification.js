/**
 * Migration: Add email verification fields to users
 * This migration adds emailVerified and emailVerifiedAt fields to existing users
 */

import User from "../models/User.js";
import logger from "../utils/logger.js";

export default {
  description: "Add email verification fields to users",

  async up() {
    logger.info("Migration: Adding email verification fields...");

    // Add emailVerified and emailVerifiedAt fields to all existing users
    // Set emailVerified to true for existing users (they're considered verified)
    const result = await User.updateMany(
      {
        emailVerified: { $exists: false }
      },
      {
        $set: {
          emailVerified: true,
          emailVerifiedAt: new Date()
        }
      }
    );

    logger.info(`Updated ${result.modifiedCount} users with email verification fields`);
  },

  async down() {
    logger.info("Migration: Reverting email verification fields...");

    // Remove emailVerified and emailVerifiedAt fields
    const result = await User.updateMany(
      {
        emailVerified: { $exists: true }
      },
      {
        $unset: {
          emailVerified: "",
          emailVerifiedAt: ""
        }
      }
    );

    logger.info(`Reverted ${result.modifiedCount} users`);
  }
};
