import speakeasy from "speakeasy";
import QRCode from "qrcode";
import TwoFactorAuth from "../models/TwoFactorAuth.js";
import logger from "../utils/logger.js";

/**
 * Generate 2FA secret and QR code
 */
export const generateTwoFactorSecret = async (user) => {
  const secret = speakeasy.generateSecret({
    name: `PCPro (${user.email})`,
    issuer: "PCPro",
    length: 32
  });

  const qrCode = await QRCode.toDataURL(secret.otpauth_url);

  // Generate backup codes
  const backupCodes = [];
  for (let i = 0; i < 10; i++) {
    backupCodes.push({
      code: generateBackupCode(),
      used: false
    });
  }

  return {
    secret: secret.base32,
    qrCode,
    backupCodes: backupCodes.map((bc) => bc.code)
  };
};

/**
 * Verify TOTP code
 */
export const verifyTotpCode = (secret, token) => {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: 2 // Allow 2 time steps (30 seconds each way)
  });
};

/**
 * Enable 2FA for user
 */
export const enableTwoFactor = async (userId, secret, backupCodes) => {
  let twoFactor = await TwoFactorAuth.findOne({ userId });

  if (!twoFactor) {
    twoFactor = new TwoFactorAuth({ userId });
  }

  twoFactor.secret = secret;
  twoFactor.backupCodes = backupCodes.map((code) => ({
    code,
    used: false
  }));
  twoFactor.enabled = true;
  twoFactor.enabledAt = new Date();

  await twoFactor.save();
  logger.info(`2FA enabled for user: ${userId}`);

  return twoFactor;
};

/**
 * Disable 2FA for user
 */
export const disableTwoFactor = async (userId) => {
  const twoFactor = await TwoFactorAuth.findOne({ userId });

  if (!twoFactor) {
    throw new Error("2FA not found for user");
  }

  twoFactor.enabled = false;
  twoFactor.backupCodes = [];
  await twoFactor.save();

  logger.info(`2FA disabled for user: ${userId}`);

  return twoFactor;
};

/**
 * Verify and use backup code
 */
export const verifyBackupCode = async (userId, backupCode) => {
  const twoFactor = await TwoFactorAuth.findOne({ userId });

  if (!twoFactor || !twoFactor.enabled) {
    throw new Error("2FA not enabled for user");
  }

  const codeEntry = twoFactor.backupCodes.find((bc) => bc.code === backupCode);

  if (!codeEntry) {
    throw new Error("Invalid backup code");
  }

  if (codeEntry.used) {
    throw new Error("Backup code already used");
  }

  codeEntry.used = true;
  codeEntry.usedAt = new Date();
  await twoFactor.save();

  logger.info(`Backup code used for user: ${userId}`);

  return true;
};

/**
 * Create session with 2FA verified
 */
export const createTwoFactorSession = async (userId) => {
  const twoFactor = await TwoFactorAuth.findOne({ userId });

  if (twoFactor) {
    twoFactor.lastUsed = new Date();
    await twoFactor.save();
  }

  return true;
};

/**
 * Generate a backup code
 */
function generateBackupCode() {
  return Math.random()
    .toString(36)
    .substring(2, 10)
    .toUpperCase();
}
