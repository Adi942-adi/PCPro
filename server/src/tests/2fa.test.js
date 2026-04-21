import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { connectDb } from "../config/db.js";
import User from "../models/User.js";
import { verifyTotpCode } from "../services/twoFactorAuth.js";
import speakeasy from "speakeasy";

describe("2FA Service", () => {
  beforeAll(async () => {
    // Connect to test database
    await connectDb();
  });

  afterAll(async () => {
    // Cleanup
    await User.deleteMany({});
  });

  it("should generate valid TOTP secret", () => {
    const secret = speakeasy.generateSecret({
      name: "Test User",
      issuer: "PCPro",
      length: 32
    });

    expect(secret.base32).toBeDefined();
    expect(secret.base32.length).toBeGreaterThan(0);
  });

  it("should verify valid TOTP code", () => {
    const secret = speakeasy.generateSecret({
      name: "Test User",
      issuer: "PCPro",
      length: 32
    });

    const token = speakeasy.totp({
      secret: secret.base32,
      encoding: "base32"
    });

    const verified = verifyTotpCode(secret.base32, token);
    expect(verified).toBe(true);
  });

  it("should reject invalid TOTP code", () => {
    const secret = speakeasy.generateSecret({
      name: "Test User",
      issuer: "PCPro",
      length: 32
    });

    const verified = verifyTotpCode(secret.base32, "000000");
    expect(verified).toBe(false);
  });
});
