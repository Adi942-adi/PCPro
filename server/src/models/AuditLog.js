import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    actorEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    resource: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    resourceId: {
      type: String,
      default: "",
      trim: true
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "info",
      index: true
    },
    outcome: {
      type: String,
      enum: ["success", "failure"],
      default: "success"
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ipAddress: {
      type: String,
      default: ""
    },
    userAgent: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ severity: 1, createdAt: -1 });

export default mongoose.model("AuditLog", auditLogSchema);
