import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import morgan from "morgan";
import compression from "compression";
import swaggerUi from "swagger-ui-express";
import passport from "passport";
import { connectDb } from "./config/db.js";
import { swaggerSpec } from "./config/swagger.js";
import {
  buildAdminApiRateLimit,
  buildAuthApiRateLimit,
  buildGeneralApiRateLimit
} from "./middleware/rateLimit.js";
import { sanitizeRequestInput } from "./middleware/sanitizeInput.js";
import { securityHeaders } from "./middleware/securityHeaders.js";
import { errorHandler, notFoundHandler } from "./middleware/validateRequest.js";
import logger from "./utils/logger.js";
import { runMigrations } from "./services/migrations.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import buildRoutes from "./routes/builds.js";
import cartRoutes from "./routes/cart.js";
import compatibilityRoutes from "./routes/compatibility.js";
import componentRoutes from "./routes/components.js";
import notificationsRoutes from "./routes/notifications.js";
import orderRoutes from "./routes/orders.js";
import paymentRoutes from "./routes/payments.js";
import priceAlertRoutes from "./routes/priceAlerts.js";
import wishlistRoutes from "./routes/wishlist.js";
import oauthRoutes, { configurePassport } from "./routes/oauth.js";

dotenv.config();

// Configure Passport OAuth
configurePassport();

const app = express();
const port = Number(process.env.PORT) || 5000;
const generalApiRateLimit = buildGeneralApiRateLimit();
const authApiRateLimit = buildAuthApiRateLimit();
const adminApiRateLimit = buildAdminApiRateLimit();

app.disable("x-powered-by");
app.use(compression());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true
  })
);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "250kb" }));
app.use(securityHeaders);
app.use(morgan("dev"));
app.use(passport.initialize());
app.use("/api", generalApiRateLimit);
app.use(sanitizeRequestInput);
app.use("/api/auth", authApiRateLimit);
app.use("/api/admin", adminApiRateLimit);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "PCPro API is running" });
});

// Swagger API documentation
app.use("/api/docs", swaggerUi.serve);
app.get("/api/docs", swaggerUi.setup(swaggerSpec, { swaggerOptions: { tryItOutEnabled: true } }));
app.get("/api/docs.json", (req, res) => {
  res.json(swaggerSpec);
});

app.use("/api/components", componentRoutes);
app.use("/api/compatibility", compatibilityRoutes);
app.use("/api/builds", buildRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/price-alerts", priceAlertRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/oauth", oauthRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

connectDb()
  .then(async () => {
    // Run migrations
    try {
      await runMigrations();
    } catch (migrationError) {
      logger.error(`Migration failed: ${migrationError.message}`);
      process.exit(1);
    }

    // Start listening
    app.listen(port, () => {
      logger.info(`Server listening on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    logger.error(`Failed to connect to database: ${error.message}`);
    process.exit(1);
  });
