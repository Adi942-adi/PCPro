import jwt from "jsonwebtoken";

const INSECURE_JWT_SECRETS = new Set([
  "change-me-to-a-long-random-secret",
  "changeme",
  "secret",
  "jwt-secret",
  "default"
]);
let weakSecretWarningShown = false;

const getJwtSecret = () => {
  const rawSecret = String(process.env.JWT_SECRET || "").trim();
  if (!rawSecret) {
    throw new Error("JWT_SECRET is not configured.");
  }

  const looksWeak = rawSecret.length < 32 || INSECURE_JWT_SECRETS.has(rawSecret.toLowerCase());
  if (looksWeak) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET is too weak for production. Use at least 32 random characters.");
    }
    if (!weakSecretWarningShown) {
      weakSecretWarningShown = true;
      console.warn(
        "[security] JWT_SECRET is weak. Set a strong random value (32+ chars) before production deployment."
      );
    }
  }

  return rawSecret;
};

const getAccessExpiry = () => {
  return process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_EXPIRES_IN || "15m";
};

export const signUserToken = (user) => {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email, role: user.role, tokenType: "access" },
    getJwtSecret(),
    { expiresIn: getAccessExpiry() }
  );
};

export const verifyUserToken = (token) => {
  const payload = jwt.verify(token, getJwtSecret());
  if (payload?.tokenType && payload.tokenType !== "access") {
    throw new Error("Invalid token type.");
  }
  return payload;
};
