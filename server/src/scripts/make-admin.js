import dotenv from "dotenv";
import { connectDb } from "../config/db.js";
import User from "../models/User.js";

dotenv.config();

const email = String(process.argv[2] || "").trim().toLowerCase();

const run = async () => {
  if (!email) {
    console.error("Usage: npm run make-admin -- user@example.com");
    process.exit(1);
  }

  await connectDb();
  const user = await User.findOne({ email });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  user.role = "admin";
  await user.save();
  console.log(`User promoted to admin: ${email}`);
  process.exit(0);
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
