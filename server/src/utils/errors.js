/**
 * Custom error classes for consistent error handling
 */

export class AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, code = "VALIDATION_ERROR") {
    super(message, 422, code);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication failed", code = "AUTH_FAILED") {
    super(message, 401, code);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Insufficient permissions", code = "FORBIDDEN") {
    super(message, 403, code);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource", code = "NOT_FOUND") {
    super(`${resource} not found`, 404, code);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists", code = "CONFLICT") {
    super(message, 409, code);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", code = "BAD_REQUEST") {
    super(message, 400, code);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests", code = "RATE_LIMITED") {
    super(message, 429, code);
  }
}
