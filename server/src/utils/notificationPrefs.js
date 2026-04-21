import mongoose from "mongoose";

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  emailPriceDrops: true,
  emailReviewModeration: true,
  pushPriceDrops: false,
  pushReviewModeration: false
});

const toBooleanOrUndefined = (value) => {
  if (typeof value === "boolean") {
    return value;
  }
  return undefined;
};

export const normalizeNotificationPreferences = (value = {}) => {
  const source = value && typeof value === "object" ? value : {};

  return {
    emailPriceDrops:
      toBooleanOrUndefined(source.emailPriceDrops) ?? DEFAULT_NOTIFICATION_PREFERENCES.emailPriceDrops,
    emailReviewModeration:
      toBooleanOrUndefined(source.emailReviewModeration) ??
      DEFAULT_NOTIFICATION_PREFERENCES.emailReviewModeration,
    pushPriceDrops:
      toBooleanOrUndefined(source.pushPriceDrops) ?? DEFAULT_NOTIFICATION_PREFERENCES.pushPriceDrops,
    pushReviewModeration:
      toBooleanOrUndefined(source.pushReviewModeration) ??
      DEFAULT_NOTIFICATION_PREFERENCES.pushReviewModeration
  };
};

const PREFERENCE_FIELDS = new Set(Object.keys(DEFAULT_NOTIFICATION_PREFERENCES));

export const extractNotificationPreferenceUpdates = (value = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      message: "notification preferences payload must be an object.",
      value: null
    };
  }

  const updates = {};
  for (const key of Object.keys(value)) {
    if (!PREFERENCE_FIELDS.has(key)) {
      continue;
    }
    if (typeof value[key] !== "boolean") {
      return {
        ok: false,
        message: `${key} must be boolean.`,
        value: null
      };
    }
    updates[key] = value[key];
  }

  return {
    ok: true,
    value: updates
  };
};

export const notificationPreferencesSchema = new mongoose.Schema(
  {
    emailPriceDrops: {
      type: Boolean,
      default: DEFAULT_NOTIFICATION_PREFERENCES.emailPriceDrops
    },
    emailReviewModeration: {
      type: Boolean,
      default: DEFAULT_NOTIFICATION_PREFERENCES.emailReviewModeration
    },
    pushPriceDrops: {
      type: Boolean,
      default: DEFAULT_NOTIFICATION_PREFERENCES.pushPriceDrops
    },
    pushReviewModeration: {
      type: Boolean,
      default: DEFAULT_NOTIFICATION_PREFERENCES.pushReviewModeration
    }
  },
  {
    _id: false
  }
);
