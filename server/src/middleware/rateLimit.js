const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

export const createRateLimit = (options = {}) => {
  const windowMs = toPositiveInt(options.windowMs, 60_000);
  const max = toPositiveInt(options.max, 120);
  const message = String(options.message || "Too many requests. Please try again later.");
  const keyGenerator =
    typeof options.keyGenerator === "function" ? options.keyGenerator : (req) => req.ip || "anon";
  const skip = typeof options.skip === "function" ? options.skip : () => false;
  const statusCode = toPositiveInt(options.statusCode, 429);

  const store = new Map();
  let opCount = 0;

  const cleanupExpired = (now) => {
    for (const [key, entry] of store.entries()) {
      if (!entry || entry.resetAt <= now) {
        store.delete(key);
      }
    }
  };

  return (req, res, next) => {
    if (skip(req)) {
      return next();
    }

    const now = Date.now();
    const rawKey = keyGenerator(req);
    const key = String(rawKey || "anon");

    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = {
        count: 0,
        resetAt: now + windowMs
      };
      store.set(key, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

    res.set("X-RateLimit-Limit", String(max));
    res.set("X-RateLimit-Remaining", String(remaining));
    res.set("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    opCount += 1;
    if (opCount % 250 === 0) {
      cleanupExpired(now);
      opCount = 0;
    }

    if (entry.count > max) {
      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(statusCode).json({
        message
      });
    }

    return next();
  };
};

export const buildGeneralApiRateLimit = () =>
  createRateLimit({
    windowMs: 60_000,
    max: toPositiveInt(process.env.RATE_LIMIT_GENERAL_MAX, 240),
    message: "Too many requests to API. Please slow down."
  });

export const buildAuthApiRateLimit = () =>
  createRateLimit({
    windowMs: 60_000,
    max: toPositiveInt(process.env.RATE_LIMIT_AUTH_MAX, 30),
    message: "Too many authentication attempts. Please try again shortly."
  });

export const buildAdminApiRateLimit = () =>
  createRateLimit({
    windowMs: 60_000,
    max: toPositiveInt(process.env.RATE_LIMIT_ADMIN_MAX, 120),
    message: "Too many admin requests. Please wait before retrying."
  });
