import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { connectDb } from "../config/db.js";
import Component from "../models/Component.js";
import {
  recordInitialComponentPrice,
  trackComponentPriceChange
} from "../services/priceTracking.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultFile = path.resolve(__dirname, "../../data/datasets/components.dataset.json");
const filePath = path.resolve(process.cwd(), process.argv[2] || defaultFile);

const parseInput = async (targetFile) => {
  const raw = await fs.readFile(targetFile, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Dataset must be a JSON array.");
  }
  return parsed;
};

const normalizeComponent = (entry) => {
  return {
    type: String(entry.type || "").trim().toLowerCase(),
    name: String(entry.name || "").trim(),
    brand: String(entry.brand || "").trim(),
    price: Number(entry.price || 0),
    imageUrl: String(entry.imageUrl || "").trim(),
    specs: entry.specs && typeof entry.specs === "object" ? entry.specs : {}
  };
};

const validateComponent = (component) => {
  if (!component.type || !component.name || !component.brand) {
    return false;
  }
  if (!Number.isFinite(component.price) || component.price < 0) {
    return false;
  }
  return true;
};

const run = async () => {
  await connectDb();
  const entries = await parseInput(filePath);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const rawEntry of entries) {
    const component = normalizeComponent(rawEntry);
    if (!validateComponent(component)) {
      skipped += 1;
      continue;
    }

    const existing = await Component.findOne({
      type: component.type,
      name: component.name
    });

    if (existing) {
      const previousPrice = Number(existing.price);
      existing.brand = component.brand;
      existing.price = component.price;
      existing.imageUrl = component.imageUrl;
      existing.specs = component.specs;
      await existing.save();
      await trackComponentPriceChange({
        component: existing,
        previousPrice,
        source: "dataset_import",
        note: "Updated via dataset importer"
      });
      updated += 1;
    } else {
      const created = await Component.create(component);
      await recordInitialComponentPrice({
        component: created,
        source: "dataset_import",
        note: "Inserted via dataset importer"
      });
      inserted += 1;
    }
  }

  console.log(
    `Dataset import complete from ${filePath}. Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}.`
  );
  process.exit(0);
};

run().catch((error) => {
  console.error(`Dataset import failed: ${error.message}`);
  process.exit(1);
});
