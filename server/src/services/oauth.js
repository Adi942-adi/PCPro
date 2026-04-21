import User from "../models/User.js";
import { issueRefreshToken } from "./refreshTokens.js";
import { signUserToken } from "../utils/jwt.js";
import logger from "../utils/logger.js";

/**
 * Find or create user from OAuth profile
 */
export const findOrCreateOAuthUser = async (provider, profile) => {
  try {
    // Look for existing OAuth user by provider ID first
    let user = await User.findOne({
      [`oauth.${provider}.id`]: profile.id
    });

    // If not found, try by email
    if (!user && profile.emails && profile.emails.length > 0) {
      const email = profile.emails[0].value?.toLowerCase();
      user = await User.findOne({ email });

      // If found by email, link OAuth
      if (user) {
        if (!user.oauth) {
          user.oauth = {};
        }
        user.oauth[provider] = {
          id: profile.id,
          displayName: profile.displayName
        };
        await user.save();
        logger.info(`OAuth ${provider} linked to existing user: ${email}`);
        return user;
      }
    }

    // Create new user if not found
    if (!user && profile.emails && profile.emails.length > 0) {
      const email = profile.emails[0].value?.toLowerCase();
      const name = profile.displayName || email.split("@")[0];

      const newUser = await User.create({
        name,
        email,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        passwordHash: "", // OAuth users don't have password
        oauth: {
          [provider]: {
            id: profile.id,
            displayName: profile.displayName
          }
        }
      });

      logger.info(`New user created via OAuth ${provider}: ${email}`);
      return newUser;
    }

    if (!user) {
      throw new Error(`Could not create/find user for OAuth ${provider}`);
    }

    return user;
  } catch (error) {
    logger.error(`OAuth user lookup failed: ${error.message}`);
    throw error;
  }
};

/**
 * Issue tokens for OAuth user
 */
export const issueOAuthTokens = async (user, req) => {
  const token = signUserToken(user);
  const refresh = await issueRefreshToken({ userId: user._id, req });

  return {
    token,
    refreshToken: refresh.refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified
    }
  };
};
