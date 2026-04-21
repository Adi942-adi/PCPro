import nodemailer from "nodemailer";
import crypto from "crypto";
import EmailVerificationToken from "../models/EmailVerificationToken.js";
import logger from "../utils/logger.js";

// Initialize nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * Send verification email
 */
export const sendVerificationEmail = async (userId, email, verificationToken) => {
  const verificationUrl = `${process.env.CLIENT_ORIGIN}/verify-email?token=${verificationToken}`;

  const mailOptions = {
    from: process.env.SMTP_FROM || "PCPro <noreply@pcpro.local>",
    to: email,
    subject: "Verify Your PCPro Account",
    html: `
      <h2>Welcome to PCPro!</h2>
      <p>Please verify your email address to activate your account.</p>
      <p><a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a></p>
      <p>Or copy this link: <a href="${verificationUrl}">${verificationUrl}</a></p>
      <p>This link expires in 24 hours.</p>
      <p>If you didn't create this account, you can ignore this email.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`Verification email sent to ${email}`);
  } catch (error) {
    logger.error(`Failed to send verification email: ${error.message}`);
    throw error;
  }
};

/**
 * Create and send verification token
 */
export const issueVerificationToken = async (userId, email) => {
  // Delete any existing tokens for this user/email
  await EmailVerificationToken.deleteMany({ userId, email });

  // Generate new token
  const { token, tokenHash } = EmailVerificationToken.generateToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Save token to database
  const verificationToken = new EmailVerificationToken({
    userId,
    email,
    token,
    tokenHash,
    expiresAt
  });

  await verificationToken.save();

  // Send email
  await sendVerificationEmail(userId, email, token);

  return { token, expiresAt };
};

/**
 * Verify email token and mark user as verified
 */
export const verifyEmailToken = async (token) => {
  const verificationRecord = await EmailVerificationToken.findOne({
    token: { $exists: true }
  });

  if (!verificationRecord) {
    throw new Error("Verification token not found");
  }

  // Check if token is valid and not expired
  if (!verificationRecord.verifyToken(token)) {
    throw new Error("Invalid or expired verification token");
  }

  // Mark as verified
  verificationRecord.verifiedAt = new Date();
  await verificationRecord.save();

  return verificationRecord;
};

/**
 * Resend verification email
 */
export const resendVerificationEmail = async (userId, email) => {
  // Delete existing tokens
  await EmailVerificationToken.deleteMany({ userId, email });

  // Issue new token
  return issueVerificationToken(userId, email);
};
