import crypto from "crypto";
import RefreshToken from "../models/RefreshToken.js";

const REFRESH_TOKEN_DAYS_DEFAULT = 21;

const getRefreshTokenDays = () => {
  const parsed = Number(process.env.REFRESH_TOKEN_DAYS);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 90) {
    return REFRESH_TOKEN_DAYS_DEFAULT;
  }
  return Math.floor(parsed);
};

const toTokenHash = (rawToken) => {
  return crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");
};

const createRawToken = () => {
  return crypto.randomBytes(48).toString("base64url");
};

const createExpiryDate = () => {
  const days = getRefreshTokenDays();
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

const createTokenDocPayload = ({ userId, tokenHash, req }) => {
  return {
    userId,
    tokenHash,
    expiresAt: createExpiryDate(),
    createdByIp: String(req?.ip || ""),
    userAgent: String(req?.headers?.["user-agent"] || "").slice(0, 512)
  };
};

export const issueRefreshToken = async ({ userId, req }) => {
  const refreshToken = createRawToken();
  const tokenHash = toTokenHash(refreshToken);
  const tokenDoc = await RefreshToken.create(createTokenDocPayload({ userId, tokenHash, req }));
  return {
    refreshToken,
    refreshTokenId: tokenDoc._id
  };
};

export const rotateRefreshToken = async ({ refreshToken, req }) => {
  const tokenHash = toTokenHash(refreshToken);
  const existing = await RefreshToken.findOne({ tokenHash }).populate("userId");
  if (!existing) {
    return { ok: false, reason: "invalid_token" };
  }

  if (!existing.userId) {
    return { ok: false, reason: "invalid_user" };
  }

  const now = new Date();
  if (existing.revokedAt) {
    return { ok: false, reason: "token_revoked" };
  }
  if (existing.expiresAt <= now) {
    existing.revokedAt = now;
    existing.revokedReason = "expired";
    await existing.save();
    return { ok: false, reason: "token_expired" };
  }

  const nextRawToken = createRawToken();
  const nextTokenHash = toTokenHash(nextRawToken);
  const nextToken = await RefreshToken.create(
    createTokenDocPayload({
      userId: existing.userId._id,
      tokenHash: nextTokenHash,
      req
    })
  );

  existing.revokedAt = now;
  existing.revokedReason = "rotated";
  existing.replacedByTokenHash = nextTokenHash;
  await existing.save();

  return {
    ok: true,
    user: existing.userId,
    refreshToken: nextRawToken,
    refreshTokenId: nextToken._id
  };
};

export const revokeRefreshToken = async ({ refreshToken, reason = "manual_logout" }) => {
  const tokenHash = toTokenHash(refreshToken);
  const token = await RefreshToken.findOne({ tokenHash });
  if (!token || token.revokedAt) {
    return 0;
  }
  token.revokedAt = new Date();
  token.revokedReason = String(reason || "manual_logout").slice(0, 120);
  await token.save();
  return 1;
};

export const revokeUserRefreshTokens = async ({ userId, reason = "manual_logout_all" }) => {
  if (!userId) {
    return 0;
  }
  const now = new Date();
  const result = await RefreshToken.updateMany(
    {
      userId,
      revokedAt: null,
      expiresAt: { $gt: now }
    },
    {
      $set: {
        revokedAt: now,
        revokedReason: String(reason || "manual_logout_all").slice(0, 120)
      }
    }
  );
  return Number(result.modifiedCount || 0);
};
