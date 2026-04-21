const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 2500;
const MAX_STRING_LENGTH = 4000;
const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const isPlainObject = (value) => {
  return value && typeof value === "object" && !Array.isArray(value);
};

const sanitizeString = (value) => {
  const normalized = String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  if (normalized.length > MAX_STRING_LENGTH) {
    return normalized.slice(0, MAX_STRING_LENGTH);
  }
  return normalized;
};

const assertSafeKey = (key) => {
  const normalized = String(key || "");
  if (!normalized) {
    return false;
  }
  if (BLOCKED_KEYS.has(normalized)) {
    return false;
  }
  if (normalized.startsWith("$") || normalized.includes(".")) {
    return false;
  }
  return true;
};

const sanitizeValue = (value, depth = 0) => {
  if (depth > MAX_DEPTH) {
    throw new Error("Payload nesting is too deep.");
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      throw new Error("Array payload is too large.");
    }
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (isPlainObject(value)) {
    const output = {};
    for (const [rawKey, rawValue] of Object.entries(value)) {
      const key = sanitizeString(rawKey).trim();
      if (!assertSafeKey(key)) {
        throw new Error(`Unsupported key in payload: "${rawKey}".`);
      }
      output[key] = sanitizeValue(rawValue, depth + 1);
    }
    return output;
  }

  throw new Error("Unsupported payload type.");
};

export const sanitizeRequestInput = (req, res, next) => {
  try {
    if (req.body && typeof req.body === "object") {
      req.body = sanitizeValue(req.body);
    }
    if (req.query && typeof req.query === "object") {
      req.query = sanitizeValue(req.query);
    }
    if (req.params && typeof req.params === "object") {
      req.params = sanitizeValue(req.params);
    }
    return next();
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Invalid request payload."
    });
  }
};
