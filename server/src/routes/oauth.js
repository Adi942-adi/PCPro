import express from "express";
import passport from "passport";
import GoogleStrategy from "passport-google-oauth20";
import GitHubStrategy from "passport-github2";
import { findOrCreateOAuthUser, issueOAuthTokens } from "../services/oauth.js";
import { setAuthCookies } from "../utils/cookies.js";
import { writeAuditLog } from "../services/auditLog.js";
import logger from "../utils/logger.js";

const router = express.Router();

/**
 * Configure Passport strategies
 */
export const configurePassport = () => {
  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy.Strategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${process.env.SERVER_ORIGIN || "http://localhost:5000"}/api/oauth/google/callback`
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const user = await findOrCreateOAuthUser("google", profile);
            done(null, user);
          } catch (error) {
            done(error);
          }
        }
      )
    );
  }

  // GitHub OAuth Strategy
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(
      new GitHubStrategy.Strategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          callbackURL: `${process.env.SERVER_ORIGIN || "http://localhost:5000"}/api/oauth/github/callback`,
          userProfileURL: "https://api.github.com/user"
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const user = await findOrCreateOAuthUser("github", profile);
            done(null, user);
          } catch (error) {
            done(error);
          }
        }
      )
    );
  }

  // Serialize user
  passport.serializeUser((user, done) => {
    done(null, user._id);
  });

  // Deserialize user
  passport.deserializeUser(async (id, done) => {
    try {
      const User = (await import("../models/User.js")).default;
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });
};

/**
 * @swagger
 * /oauth/google:
 *   get:
 *     summary: Initiate Google OAuth login
 *     tags: [OAuth]
 *     responses:
 *       302:
 *         description: Redirects to Google login
 */
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

/**
 * @swagger
 * /oauth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     tags: [OAuth]
 *     responses:
 *       302:
 *         description: Redirects to client with auth tokens
 */
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  async (req, res) => {
    try {
      const tokens = await issueOAuthTokens(req.user, req);
      setAuthCookies(res, {
        accessToken: tokens.token,
        refreshToken: tokens.refreshToken
      });

      logger.info(`User logged in via Google: ${req.user.email}`);

      await writeAuditLog({
        req,
        actor: req.user,
        action: "auth.oauth-login",
        resource: "auth",
        resourceId: req.user._id,
        details: { provider: "google" },
        severity: "info"
      });

      // Redirect to client with tokens in query string or cookies
      const clientUrl = process.env.CLIENT_ORIGIN || "http://localhost:5173";
      res.redirect(`${clientUrl}/oauth-success?token=${tokens.token}&refresh=${tokens.refreshToken}`);
    } catch (error) {
      logger.error(`Google OAuth callback failed: ${error.message}`);
      const clientUrl = process.env.CLIENT_ORIGIN || "http://localhost:5173";
      res.redirect(`${clientUrl}/login?error=oauth_failed`);
    }
  }
);

/**
 * @swagger
 * /oauth/github:
 *   get:
 *     summary: Initiate GitHub OAuth login
 *     tags: [OAuth]
 *     responses:
 *       302:
 *         description: Redirects to GitHub login
 */
router.get("/github", passport.authenticate("github", { scope: ["user:email"] }));

/**
 * @swagger
 * /oauth/github/callback:
 *   get:
 *     summary: GitHub OAuth callback
 *     tags: [OAuth]
 *     responses:
 *       302:
 *         description: Redirects to client with auth tokens
 */
router.get(
  "/github/callback",
  passport.authenticate("github", { session: false }),
  async (req, res) => {
    try {
      const tokens = await issueOAuthTokens(req.user, req);
      setAuthCookies(res, {
        accessToken: tokens.token,
        refreshToken: tokens.refreshToken
      });

      logger.info(`User logged in via GitHub: ${req.user.email}`);

      await writeAuditLog({
        req,
        actor: req.user,
        action: "auth.oauth-login",
        resource: "auth",
        resourceId: req.user._id,
        details: { provider: "github" },
        severity: "info"
      });

      const clientUrl = process.env.CLIENT_ORIGIN || "http://localhost:5173";
      res.redirect(`${clientUrl}/oauth-success?token=${tokens.token}&refresh=${tokens.refreshToken}`);
    } catch (error) {
      logger.error(`GitHub OAuth callback failed: ${error.message}`);
      const clientUrl = process.env.CLIENT_ORIGIN || "http://localhost:5173";
      res.redirect(`${clientUrl}/login?error=oauth_failed`);
    }
  }
);

export default router;
