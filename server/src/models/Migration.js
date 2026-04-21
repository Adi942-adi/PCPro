import mongoose from "mongoose";

const migrationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true
    },
    appliedAt: {
      type: Date,
      default: Date.now
    },
    description: String
  },
  { timestamps: true }
);

const Migration = mongoose.model("Migration", migrationSchema);

export default Migration;
