const ACCESS_COOKIE_NAME = "pcpro_access";
const REFRESH_COOKIE_NAME = "pcpro_refresh";

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
};

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const getCookieSameSite = () => {
  const normalized = String(process.env.AUTH_COOKIE_SAMESITE || "lax")
    .trim()
    .toLowerCase();
  if (normalized === "strict" || normalized === "none" || normalized === "lax") {
    return normalized;
  }
  return "lax";
};

const buildCookieBaseOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: toBoolean(process.env.AUTH_COOKIE_SECURE, isProduction),
    sameSite: getCookieSameSite()
  };
};

const getAccessCookieMaxAgeMs = () => {
  return toPositiveInt(process.env.AUTH_ACCESS_COOKIE_MAX_AGE_MS, 15 * 60 * 1000);
};

const getRefreshCookieMaxAgeMs = () => {
  const refreshDays = toPositiveInt(process.env.REFRESH_TOKEN_DAYS, 21);
  return refreshDays * 24 * 60 * 60 * 1000;
};

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
};

export const parseCookieHeader = (headerValue = "") => {
  const raw = String(headerValue || "");
  if (!raw) {
    return {};
  }

  const parsed = {};
  for (const chunk of raw.split(";")) {
    const pair = String(chunk || "").trim();
    if (!pair) {
      continue;
    }
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = pair.slice(0, separatorIndex).trim();
    if (!key) {
      continue;
    }
    const value = pair.slice(separatorIndex + 1).trim();
    parsed[key] = safeDecode(value);
  }

  return parsed;
};

export const setAuthCookies = (res, { accessToken = "", refreshToken = "" } = {}) => {
  const base = buildCookieBaseOptions();
  if (accessToken) {
    res.cookie(ACCESS_COOKIE_NAME, accessToken, {
      ...base,
      path: "/api",
      maxAge: getAccessCookieMaxAgeMs()
    });
  }

  if (refreshToken) {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...base,
      path: "/api/auth",
      maxAge: getRefreshCookieMaxAgeMs()
    });
  }
};

export const clearAuthCookies = (res) => {
  const base = buildCookieBaseOptions();
  res.clearCookie(ACCESS_COOKIE_NAME, {
    ...base,
    path: "/api"
  });
  res.clearCookie(REFRESH_COOKIE_NAME, {
    ...base,
    path: "/api/auth"
  });
};

export { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME };
