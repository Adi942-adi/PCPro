import { writeAuditLog } from "../services/auditLog.js";

export const requireAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required." });
  }

  if (req.user.role !== "admin") {
    await writeAuditLog({
      req,
      actor: req.user,
      action: "admin.access-denied",
      resource: "admin",
      severity: "warning",
      outcome: "failure",
      details: {
        path: req.originalUrl || req.url || "",
        method: req.method || ""
      }
    });
    return res.status(403).json({ message: "Admin access required." });
  }

  return next();
};
