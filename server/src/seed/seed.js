import dotenv from "dotenv";
import { connectDb } from "../config/db.js";
import Component from "../models/Component.js";
import Notification from "../models/Notification.js";
import PartReview from "../models/PartReview.js";
import PriceAlert from "../models/PriceAlert.js";
import PriceHistory from "../models/PriceHistory.js";
import PushSubscription from "../models/PushSubscription.js";
import { seedComponents } from "./data.js";

dotenv.config();

const run = async () => {
  await connectDb();

  await Component.deleteMany({});
  await PriceHistory.deleteMany({});
  await PriceAlert.deleteMany({});
  await Notification.deleteMany({});
  await PartReview.deleteMany({});
  await PushSubscription.deleteMany({});
  const inserted = await Component.insertMany(seedComponents);
  await PriceHistory.insertMany(
    inserted.map((component) => ({
      componentId: component._id,
      price: Number(component.price || 0),
      source: "seed",
      note: "Seeded price snapshot"
    }))
  );
  console.log(`Seed complete: ${inserted.length} components inserted.`);

  process.exit(0);
};

run().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exit(1);
});
