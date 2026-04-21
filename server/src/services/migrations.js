import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Migration from "../models/Migration.js";
import logger from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "../migrations");

/**
 * Get all migration files
 */
async function getMigrationFiles() {
  try {
    const files = await fs.readdir(MIGRATIONS_DIR);
    return files
      .filter((f) => f.endsWith(".js"))
      .sort()
      .map((f) => f.replace(".js", ""));
  } catch (error) {
    logger.warn(`Migrations directory not found: ${MIGRATIONS_DIR}`);
    return [];
  }
}

/**
 * Get applied migrations
 */
async function getAppliedMigrations() {
  const migrations = await Migration.find({}).select("name").lean();
  return new Set(migrations.map((m) => m.name));
}

/**
 * Run pending migrations
 */
export async function runMigrations() {
  logger.info("Checking for pending migrations...");

  const migrationFiles = await getMigrationFiles();
  const appliedMigrations = await getAppliedMigrations();

  const pendingMigrations = migrationFiles.filter((name) => !appliedMigrations.has(name));

  if (pendingMigrations.length === 0) {
    logger.info("No pending migrations");
    return;
  }

  logger.info(`Found ${pendingMigrations.length} pending migration(s)`);

  for (const migrationName of pendingMigrations) {
    try {
      logger.info(`Running migration: ${migrationName}`);

      const migrationPath = path.join(MIGRATIONS_DIR, `${migrationName}.js`);
      const migrationModule = await import(`file://${migrationPath}`);
      const migration = migrationModule.default;

      if (!migration || typeof migration.up !== "function") {
        throw new Error(`Invalid migration: ${migrationName}`);
      }

      await migration.up();

      await Migration.create({
        name: migrationName,
        description: migration.description || ""
      });

      logger.info(`Migration completed: ${migrationName}`);
    } catch (error) {
      logger.error(`Migration failed: ${migrationName} - ${error.message}`);
      throw error;
    }
  }

  logger.info("All migrations completed successfully");
}

/**
 * Rollback last migration
 */
export async function rollbackMigration() {
  const lastMigration = await Migration.findOne({}).sort({ appliedAt: -1 });

  if (!lastMigration) {
    logger.info("No migrations to rollback");
    return;
  }

  try {
    logger.info(`Rolling back migration: ${lastMigration.name}`);

    const migrationPath = path.join(MIGRATIONS_DIR, `${lastMigration.name}.js`);
    const migrationModule = await import(`file://${migrationPath}`);
    const migration = migrationModule.default;

    if (!migration || typeof migration.down !== "function") {
      throw new Error(`Invalid migration: ${lastMigration.name}`);
    }

    await migration.down();
    await Migration.deleteOne({ _id: lastMigration._id });

    logger.info(`Rollback completed: ${lastMigration.name}`);
  } catch (error) {
    logger.error(`Rollback failed: ${lastMigration.name} - ${error.message}`);
    throw error;
  }
}

/**
 * Get migration status
 */
export async function getMigrationStatus() {
  const migrationFiles = await getMigrationFiles();
  const appliedMigrations = await getAppliedMigrations();

  const status = migrationFiles.map((name) => ({
    name,
    applied: appliedMigrations.has(name)
  }));

  return {
    total: migrationFiles.length,
    applied: appliedMigrations.size,
    pending: migrationFiles.length - appliedMigrations.size,
    migrations: status
  };
}
