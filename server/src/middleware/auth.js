import User from "../models/User.js";
import { verifyUserToken } from "../utils/jwt.js";
import { ACCESS_COOKIE_NAME, parseCookieHeader } from "../utils/cookies.js";

const getBearerToken = (headerValue = "") => {
  if (!headerValue.startsWith("Bearer ")) {
    return "";
  }
  return headerValue.slice("Bearer ".length).trim();
};

const getTokenFromRequest = (req) => {
  const bearerToken = getBearerToken(req.headers.authorization || "");
  if (bearerToken) {
    return bearerToken;
  }
  const cookies = parseCookieHeader(req.headers.cookie || "");
  return String(cookies[ACCESS_COOKIE_NAME] || "").trim();
};

export const requireAuth = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const payload = verifyUserToken(token);
    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(401).json({ message: "Invalid authentication token." });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired authentication token." });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return next();
    }

    const payload = verifyUserToken(token);
    const user = await User.findById(payload.sub);
    if (user) {
      req.user = user;
    }
    return next();
  } catch (error) {
    return next();
  }
};
