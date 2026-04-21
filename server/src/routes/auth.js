import express from "express";
import User from "../models/User.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { writeAuditLog } from "../services/auditLog.js";
import { validate } from "../middleware/validateRequest.js";
import {
  issueRefreshToken,
  revokeRefreshToken,
  revokeUserRefreshTokens,
  rotateRefreshToken
} from "../services/refreshTokens.js";
import { consumePasswordResetToken, issuePasswordReset } from "../services/passwordReset.js";
import {
  issueVerificationToken,
  verifyEmailToken,
  resendVerificationEmail
} from "../services/emailVerification.js";
import {
  REFRESH_COOKIE_NAME,
  clearAuthCookies,
  parseCookieHeader,
  setAuthCookies
} from "../utils/cookies.js";
import { signUserToken } from "../utils/jwt.js";
import { normalizeNotificationPreferences } from "../utils/notificationPrefs.js";
import {
  signupSchema,
  loginSchema,
  passwordResetSchema,
  passwordResetRequestSchema
} from "../utils/validationSchemas.js";
import logger from "../utils/logger.js";
import {
  AuthenticationError,
  BadRequestError,
  ConflictError,
  NotFoundError
} from "../utils/errors.js";

const router = express.Router();
const GENERIC_FORGOT_PASSWORD_MESSAGE =
  "If an account exists for that email, a password reset link has been sent.";

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  emailVerified: user.emailVerified,
  notificationPrefs: normalizeNotificationPreferences(user.notificationPrefs || {}),
  createdAt: user.createdAt
});

const issueAuthTokens = async (user, req) => {
  const token = signUserToken(user);
  const refresh = await issueRefreshToken({ userId: user._id, req });
  return {
    token,
    refreshToken: refresh.refreshToken
  };
};

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Create a new user account
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       201:
 *         description: User created successfully
 *       422:
 *         description: Validation error
 *       409:
 *         description: Email already in use
 */
router.post("/signup", validate(signupSchema), async (req, res, next) => {
  try {
    const { name, email, password } = req.validatedData;

    const existing = await User.findOne({ email });
    if (existing) {
      return next(new ConflictError("Email is already in use"));
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      name,
      email,
      passwordHash
    });

    logger.info(`User created: ${email}`);

    // Issue verification token
    await issueVerificationToken(user._id, email);

    // Issue auth tokens
    const tokens = await issueAuthTokens(user, req);
    setAuthCookies(res, {
      accessToken: tokens.token,
      refreshToken: tokens.refreshToken
    });

    await writeAuditLog({
      req,
      actor: user,
      action: "auth.signup",
      resource: "user",
      resourceId: user._id,
      severity: "info"
    });

    return res.status(201).json({
      ...tokens,
      user: publicUser(user),
      message: "Signup successful. A verification email has been sent."
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     summary: Verify user email address
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid token
 */
// Email verification endpoint
router.post("/verify-email", async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return next(new BadRequestError("Verification token is required"));
    }

    const verificationRecord = await verifyEmailToken(token);
    const user = await User.findById(verificationRecord.userId);

    if (!user) {
      return next(new NotFoundError("User"));
    }

    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    await user.save();

    logger.info(`Email verified: ${user.email}`);

    await writeAuditLog({
      req,
      actor: user,
      action: "auth.email-verified",
      resource: "user",
      resourceId: user._id,
      severity: "info"
    });

    return res.json({
      message: "Email verified successfully",
      user: publicUser(user)
    });
  } catch (error) {
    return next(error);
  }
});

// Resend verification email
router.post("/resend-verification", async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return next(new BadRequestError("Email is required"));
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({
        message: "If an account exists with that email, a verification email has been sent."
      });
    }

    if (user.emailVerified) {
      return res.json({
        message: "This email is already verified"
      });
    }

    await resendVerificationEmail(user._id, user.email);
    logger.info(`Resent verification email: ${user.email}`);

    return res.json({
      message: "A verification email has been sent"
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validatedData;

    const user = await User.findOne({ email });
    if (!user) {
      logger.warn(`Login attempt with non-existent email: ${email}`);
      return next(new AuthenticationError("Invalid email or password"));
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      logger.warn(`Login attempt with wrong password: ${email}`);
      return next(new AuthenticationError("Invalid email or password"));
    }

    const tokens = await issueAuthTokens(user, req);
    setAuthCookies(res, {
      accessToken: tokens.token,
      refreshToken: tokens.refreshToken
    });

    logger.info(`User logged in: ${email}`);

    if (user.role === "admin") {
      await writeAuditLog({
        req,
        actor: user,
        action: "auth.admin-login",
        resource: "auth",
        resourceId: user._id,
        details: {
          method: "password"
        },
        severity: "critical"
      });
    }

    return res.json({ ...tokens, user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post("/forgot-password", validate(passwordResetRequestSchema), async (req, res, next) => {
  try {
    const { email } = req.validatedData;

    const user = await User.findOne({ email });
    if (!user) {
      logger.info(`Password reset requested for non-existent email: ${email}`);
      return res.json({ message: GENERIC_FORGOT_PASSWORD_MESSAGE });
    }

    await issuePasswordReset({ user, req });
    logger.info(`Password reset email sent: ${email}`);

    if (user.role === "admin") {
      await writeAuditLog({
        req,
        actor: user,
        action: "auth.admin-forgot-password",
        resource: "auth",
        resourceId: user._id,
        severity: "warning",
        details: {
          method: "email_reset_link"
        }
      });
    }

    return res.json({ message: GENERIC_FORGOT_PASSWORD_MESSAGE });
  } catch (error) {
    return next(error);
  }
});

router.post("/reset-password", validate(passwordResetSchema), async (req, res, next) => {
  try {
    const { token, newPassword } = req.validatedData;
    logger.info(`Attempting password reset with token: ${token?.slice(0, 10)}...`);

    const consumed = await consumePasswordResetToken({ token });
    if (!consumed.ok || !consumed.userId) {
      logger.warn(`Password reset failed: ${consumed.reason}`);
      return next(new BadRequestError(`Invalid or expired password reset token: ${consumed.reason}`));
    }

    const user = await User.findById(consumed.userId);
    if (!user) {
      return next(new NotFoundError("User"));
    }

    user.passwordHash = await User.hashPassword(newPassword);
    await user.save();
    await revokeUserRefreshTokens({
      userId: user._id,
      reason: "password_reset"
    });
    clearAuthCookies(res);

    logger.info(`Password reset completed: ${user.email}`);

    if (user.role === "admin") {
      await writeAuditLog({
        req,
        actor: user,
        action: "auth.admin-password-reset",
        resource: "auth",
        resourceId: user._id,
        severity: "critical",
        details: {
          method: "reset_token"
        }
      });
    }

    return res.json({
      message: "Password has been reset. Please login with your new password."
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const cookies = parseCookieHeader(req.headers.cookie || "");
    const refreshToken = String(req.body?.refreshToken || cookies[REFRESH_COOKIE_NAME] || "").trim();
    if (!refreshToken) {
      return res.status(400).json({ message: "refreshToken is required." });
    }

    const rotation = await rotateRefreshToken({ refreshToken, req });
    if (!rotation.ok || !rotation.user) {
      return res.status(401).json({ message: "Invalid or expired refresh token." });
    }

    const token = signUserToken(rotation.user);
    if (rotation.user.role === "admin") {
      await writeAuditLog({
        req,
        actor: rotation.user,
        action: "auth.admin-refresh",
        resource: "auth",
        details: {
          method: "refresh_token_rotation"
        },
        severity: "warning"
      });
    }

    setAuthCookies(res, {
      accessToken: token,
      refreshToken: rotation.refreshToken
    });
    return res.json({
      token,
      refreshToken: rotation.refreshToken,
      user: publicUser(rotation.user)
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", optionalAuth, async (req, res, next) => {
  try {
    const cookies = parseCookieHeader(req.headers.cookie || "");
    const refreshToken = String(req.body?.refreshToken || cookies[REFRESH_COOKIE_NAME] || "").trim();
    const allDevices = Boolean(req.body?.allDevices);

    if (allDevices && !req.user) {
      return res.status(401).json({ message: "Authentication required for all-devices logout." });
    }

    let revoked = 0;
    if (refreshToken) {
      revoked += await revokeRefreshToken({ refreshToken, reason: "logout" });
    }
    if (allDevices && req.user?._id) {
      revoked += await revokeUserRefreshTokens({
        userId: req.user._id,
        reason: "logout_all_devices"
      });
    }

    if (req.user?.role === "admin") {
      await writeAuditLog({
        req,
        actor: req.user,
        action: "auth.admin-logout",
        resource: "auth",
        details: {
          allDevices,
          revokedSessions: revoked
        },
        severity: "warning"
      });
    }

    clearAuthCookies(res);
    return res.json({ success: true, revoked });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, async (req, res) => {
  return res.json({ user: publicUser(req.user) });
});

export default router;
