import { ValidationError } from "../utils/errors.js";
import logger from "../utils/logger.js";

/**
 * Validation middleware factory
 * Usage: router.post('/endpoint', validate(schema), handler)
 */
export const validate = (schema) => {
  return async (req, res, next) => {
    try {
      const { body, params, query } = req;
      const dataToValidate = { body, params, query };

      // Validate only the body by default, but allow validating all
      const result = await schema.parseAsync(body);
      req.validatedData = result;
      next();
    } catch (error) {
      logger.warn(`Validation error: ${error.message}`, {
        path: req.path,
        method: req.method
      });

      if (error.errors && Array.isArray(error.errors)) {
        const messages = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`);
        return next(new ValidationError(messages.join(", ")));
      }

      next(new ValidationError(error.message));
    }
  };
};

/**
 * Global error handling middleware
 * Must be registered last in the Express app
 */
export const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error(`Error: ${err.message}`, {
    code: err.code,
    statusCode: err.statusCode,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  // Default error response
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";
  let code = err.code || "INTERNAL_ERROR";

  // Don't leak stack traces in production
  if (process.env.NODE_ENV === "production" && statusCode === 500) {
    message = "Internal server error";
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      statusCode,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack })
    }
  });
};

/**
 * 404 handler
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Endpoint not found",
      statusCode: 404
    }
  });
};
