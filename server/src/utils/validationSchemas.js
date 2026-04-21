import { z } from "zod";

// Password validation schema
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must not exceed 128 characters")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/\d/, "Password must contain a numeric character");

// Email validation schema
const emailSchema = z.string().email("Invalid email format").toLowerCase();

// Auth schemas
export const signupSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must not exceed 80 characters")
    .transform((val) => val.trim().replace(/\s+/g, " ")),
  email: emailSchema,
  password: passwordSchema
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required")
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required")
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema
});

export const passwordResetSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: passwordSchema
});

// Component schemas
export const createComponentSchema = z.object({
  type: z.enum([
    "cpu",
    "motherboard",
    "ram",
    "gpu",
    "storage",
    "psu",
    "cooler",
    "case",
    "monitor"
  ]),
  name: z.string().min(2).max(200),
  brand: z.string().min(1).max(100),
  price: z.number().positive("Price must be positive"),
  specs: z.record(z.any()).optional(),
  imageUrl: z.string().url().optional(),
  description: z.string().max(1000).optional()
});

export const updateComponentSchema = createComponentSchema.partial();

// Cart schemas
export const addToCartSchema = z.object({
  componentId: z.string().min(1, "Component ID is required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1")
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0, "Quantity must be non-negative")
});

// Order schemas
export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        componentId: z.string(),
        quantity: z.number().int().positive()
      })
    )
    .min(1, "Order must have at least one item"),
  shippingAddress: z.object({
    street: z.string().min(5),
    city: z.string().min(2),
    state: z.string().min(2),
    zipCode: z.string().min(5),
    country: z.string().min(2)
  }),
  paymentMethodId: z.string().optional()
});

// Build schemas
export const createBuildSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  components: z.record(z.string()).optional()
});

export const updateBuildSchema = createBuildSchema.partial();

// Price alert schemas
export const createPriceAlertSchema = z.object({
  componentId: z.string().min(1, "Component ID is required"),
  targetPrice: z.number().positive("Target price must be positive")
});

// Notification preferences schemas
export const updateNotificationPrefsSchema = z.object({
  emailPriceAlert: z.boolean().optional(),
  emailNewsletter: z.boolean().optional(),
  webPushPriceAlert: z.boolean().optional(),
  webPushNewsletter: z.boolean().optional()
});

// Admin schemas
export const promoteUserSchema = z.object({
  email: emailSchema,
  role: z.enum(["user", "admin"])
});

export const createAuditLogSchema = z.object({
  userId: z.string(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().optional(),
  changes: z.record(z.any()).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional()
});
