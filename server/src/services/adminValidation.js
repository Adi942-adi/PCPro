import mongoose from "mongoose";
import { parsePagination as parsePaginationBase } from "./pagination.js";

const ALLOWED_COMPONENT_TYPES = new Set([
  "cpu",
  "motherboard",
  "ram",
  "gpu",
  "storage",
  "psu",
  "case"
]);

const ALLOWED_ORDER_STATUS = new Set(["pending", "paid", "shipped", "delivered", "cancelled"]);
const ALLOWED_USER_ROLES = new Set(["user", "admin"]);
const ALLOWED_REVIEW_STATUS = new Set(["pending", "approved", "rejected"]);

const isPlainObject = (value) => {
  return value && typeof value === "object" && !Array.isArray(value);
};

const isSafeNestedKey = (key) => {
  const normalized = trimString(key, 64);
  if (!normalized) {
    return false;
  }
  if (normalized === "__proto__" || normalized === "constructor" || normalized === "prototype") {
    return false;
  }
  if (normalized.startsWith("$") || normalized.includes(".")) {
    return false;
  }
  return true;
};

const trimString = (value, maxLength) => {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (maxLength && trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
};

const isSafeRelativeImagePath = (value) => {
  const normalized = trimString(value, 500);
  if (!normalized || !normalized.startsWith("/")) {
    return false;
  }
  if (normalized.includes("..") || normalized.includes("\\") || normalized.includes("%00")) {
    return false;
  }
  return /^\/[a-zA-Z0-9/_\-.]+$/.test(normalized);
};

const validateDeepValue = (value, depth = 0) => {
  if (depth > 4) {
    return false;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    if (value.length > 200) {
      return false;
    }
    return value.every((item) => validateDeepValue(item, depth + 1));
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length > 100) {
      return false;
    }
    return entries.every(([key, nested]) => {
      if (!isSafeNestedKey(key)) {
        return false;
      }
      return validateDeepValue(nested, depth + 1);
    });
  }

  return false;
};

export const parsePagination = (query = {}) => {
  return parsePaginationBase(query, { defaultLimit: 20, maxLimit: 100 });
};

export const validateOrderStatus = (status) => {
  const normalized = trimString(status, 32).toLowerCase();
  if (!ALLOWED_ORDER_STATUS.has(normalized)) {
    return { ok: false, message: "Invalid order status." };
  }
  return { ok: true, value: normalized };
};

export const validateUserRole = (role) => {
  const normalized = trimString(role, 16).toLowerCase();
  if (!ALLOWED_USER_ROLES.has(normalized)) {
    return { ok: false, message: "Invalid user role." };
  }
  return { ok: true, value: normalized };
};

export const validateReviewStatus = (status) => {
  const normalized = trimString(status, 24).toLowerCase();
  if (!ALLOWED_REVIEW_STATUS.has(normalized)) {
    return { ok: false, message: "Invalid review status." };
  }
  return { ok: true, value: normalized };
};

export const validateObjectId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, message: "Invalid id." };
  }
  return { ok: true };
};

export const validateComponentPayload = (payload, options = {}) => {
  const { partial = false } = options;
  const result = {};

  if (!partial || payload.type !== undefined) {
    const type = trimString(payload.type, 24).toLowerCase();
    if (!ALLOWED_COMPONENT_TYPES.has(type)) {
      return { ok: false, message: "Invalid component type." };
    }
    result.type = type;
  }

  if (!partial || payload.name !== undefined) {
    const name = trimString(payload.name, 160);
    if (!name || name.length < 2) {
      return { ok: false, message: "Component name is required and must be at least 2 characters." };
    }
    result.name = name;
  }

  if (!partial || payload.brand !== undefined) {
    const brand = trimString(payload.brand, 100);
    if (!brand || brand.length < 2) {
      return { ok: false, message: "Component brand is required and must be at least 2 characters." };
    }
    result.brand = brand;
  }

  if (!partial || payload.price !== undefined) {
    const price = Number(payload.price);
    if (!Number.isFinite(price) || price < 0 || price > 1000000) {
      return { ok: false, message: "Component price must be a valid number between 0 and 1,000,000." };
    }
    result.price = price;
  }

  if (!partial || payload.imageUrl !== undefined) {
    const imageUrl = trimString(payload.imageUrl || "", 500);
    if (imageUrl) {
      if (!isSafeRelativeImagePath(imageUrl)) {
        try {
          const parsed = new URL(imageUrl);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return {
              ok: false,
              message: "Component imageUrl must be http/https URL or root-relative path."
            };
          }
        } catch (error) {
          return {
            ok: false,
            message: "Component imageUrl must be a valid URL or root-relative path."
          };
        }
      }
    }
    result.imageUrl = imageUrl;
  }

  if (!partial || payload.specs !== undefined) {
    const specs = payload.specs ?? {};
    if (!isPlainObject(specs)) {
      return { ok: false, message: "Component specs must be a JSON object." };
    }
    if (!validateDeepValue(specs)) {
      return { ok: false, message: "Component specs contain unsupported values or nesting." };
    }
    result.specs = specs;
  }

  return { ok: true, value: result };
};
