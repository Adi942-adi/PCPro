import crypto from "crypto";
import PasswordResetToken from "../models/PasswordResetToken.js";

const RESET_TOKEN_MINUTES_DEFAULT = 30;

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const getResetTokenMinutes = () => {
  return toPositiveInt(process.env.PASSWORD_RESET_TOKEN_MINUTES, RESET_TOKEN_MINUTES_DEFAULT);
};

const toTokenHash = (rawToken = "") => {
  return crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");
};

const createRawToken = () => crypto.randomBytes(48).toString("base64url");

const getResetBaseUrl = () => {
  const origin = String(process.env.CLIENT_ORIGIN || "http://localhost:5173").replace(/\/$/, "");
  return `${origin}/reset-password`;
};

const createExpiryDate = () => {
  return new Date(Date.now() + getResetTokenMinutes() * 60 * 1000);
};

let emailTransporterPromise = null;

const getEmailTransporter = async () => {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const from = String(process.env.SMTP_FROM || "").trim();

  if (!host || !Number.isFinite(port) || port <= 0 || !from) {
    return null;
  }

  if (!emailTransporterPromise) {
    emailTransporterPromise = (async () => {
      try {
        const module = await import("nodemailer");
        const nodemailer = module.default || module;
        if (!nodemailer?.createTransport) {
          return null;
        }

        const secure = String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true" || port === 465;
        const user = String(process.env.SMTP_USER || "").trim();
        const pass = String(process.env.SMTP_PASS || "");

        const transportConfig = {
          host,
          port,
          secure
        };

        if (user) {
          transportConfig.auth = { user, pass };
        }

        return nodemailer.createTransport(transportConfig);
      } catch (error) {
        console.warn("Password reset email disabled: nodemailer load failed.");
        return null;
      }
    })();
  }

  return emailTransporterPromise;
};

const sendResetEmail = async ({ email, name, resetUrl }) => {
  const transporter = await getEmailTransporter();
  if (!transporter) {
    console.info(`[password-reset] Email transporter not configured. Reset URL for ${email}: ${resetUrl}`);
    return { sent: false, reason: "email_not_configured" };
  }

  const from = String(process.env.SMTP_FROM || "").trim();
  const subject = "PCPro password reset";
  const greeting = name ? `Hello ${name},` : "Hello,";
  const text = [
    greeting,
    "",
    "We received a request to reset your PCPro password.",
    "Use the link below to set a new password:",
    resetUrl,
    "",
    `This link expires in ${getResetTokenMinutes()} minutes.`,
    "If you did not request this, you can safely ignore this email."
  ].join("\n");

  await transporter.sendMail({
    from,
    to: email,
    subject,
    text
  });
  return { sent: true };
};

export const issuePasswordReset = async ({ user, req }) => {
  if (!user?._id || !user?.email) {
    return { ok: false, reason: "invalid_user" };
  }

  const rawToken = createRawToken();
  const tokenHash = toTokenHash(rawToken);
  await PasswordResetToken.updateMany(
    {
      userId: user._id,
      consumedAt: null,
      expiresAt: { $gt: new Date() }
    },
    {
      $set: { consumedAt: new Date() }
    }
  );

  await PasswordResetToken.create({
    userId: user._id,
    tokenHash,
    expiresAt: createExpiryDate(),
    requestedByIp: String(req?.ip || ""),
    userAgent: String(req?.headers?.["user-agent"] || "").slice(0, 512)
  });

  const resetUrl = `${getResetBaseUrl()}?token=${encodeURIComponent(rawToken)}`;
  try {
    await sendResetEmail({
      email: user.email,
      name: user.name,
      resetUrl
    });
  } catch (error) {
    console.warn("Failed to send password reset email:", error.message || error);
  }

  return { ok: true };
};

export const consumePasswordResetToken = async ({ token }) => {
  const rawToken = String(token || "").trim();
  if (!rawToken) {
    return { ok: false, reason: "missing_token" };
  }

  const now = new Date();
  const tokenHash = toTokenHash(rawToken);
  const resetToken = await PasswordResetToken.findOne({ tokenHash });
  if (!resetToken) {
    return { ok: false, reason: "invalid_token" };
  }
  if (resetToken.consumedAt) {
    return { ok: false, reason: "token_used" };
  }
  if (resetToken.expiresAt <= now) {
    resetToken.consumedAt = now;
    await resetToken.save();
    return { ok: false, reason: "token_expired" };
  }

  resetToken.consumedAt = now;
  await resetToken.save();
  return {
    ok: true,
    userId: resetToken.userId
  };
};
