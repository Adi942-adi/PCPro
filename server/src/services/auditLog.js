import AuditLog from "../models/AuditLog.js";

const REDACTED_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "refreshtoken",
  "authorization",
  "cookie"
]);

const toSafeString = (value, maxLength = 300) => {
  const normalized = String(value || "").replace(/[\u0000-\u001F\u007F]/g, "");
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
};

const toSafeDetails = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const walk = (value, depth = 0) => {
    if (depth > 5) {
      return "[truncated]";
    }

    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === "string") {
      return toSafeString(value, 500);
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.slice(0, 40).map((item) => walk(item, depth + 1));
    }
    if (typeof value === "object") {
      const out = {};
      for (const [rawKey, nested] of Object.entries(value).slice(0, 60)) {
        const key = toSafeString(rawKey, 80);
        if (!key) {
          continue;
        }
        if (REDACTED_KEYS.has(key.toLowerCase())) {
          out[key] = "[redacted]";
          continue;
        }
        out[key] = walk(nested, depth + 1);
      }
      return out;
    }

    return toSafeString(value, 120);
  };

  return walk(input);
};

export const writeAuditLog = async ({
  req,
  actor,
  action,
  resource,
  resourceId = "",
  details = {},
  severity = "info",
  outcome = "success"
}) => {
  if (!actor?._id || !action || !resource) {
    return;
  }

  const normalizedSeverity =
    severity === "critical" || severity === "warning" ? severity : "info";
  const normalizedOutcome = outcome === "failure" ? "failure" : "success";

  await AuditLog.create({
    actorId: actor._id,
    actorEmail: toSafeString(actor.email || "", 160).toLowerCase(),
    action: toSafeString(action, 120),
    resource: toSafeString(resource, 80),
    resourceId: toSafeString(resourceId || "", 120),
    severity: normalizedSeverity,
    outcome: normalizedOutcome,
    details: toSafeDetails(details),
    ipAddress: toSafeString(req?.ip || "", 120),
    userAgent: toSafeString(req?.headers?.["user-agent"] || "", 512)
  });
};
