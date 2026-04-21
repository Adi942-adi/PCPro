import { describe, it, expect } from "vitest";
import { signupSchema, loginSchema, createComponentSchema } from "../utils/validationSchemas.js";
import { ValidationError } from "../utils/errors.js";

describe("Validation Schemas", () => {
  describe("signupSchema", () => {
    it("should validate correct signup data", async () => {
      const data = {
        name: "John Doe",
        email: "john@example.com",
        password: "SecurePass123"
      };

      const result = await signupSchema.parseAsync(data);
      expect(result.email).toBe("john@example.com");
      expect(result.name).toBe("John Doe");
    });

    it("should reject invalid email", async () => {
      const data = {
        name: "John Doe",
        email: "invalid-email",
        password: "SecurePass123"
      };

      try {
        await signupSchema.parseAsync(data);
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("should reject weak password", async () => {
      const data = {
        name: "John Doe",
        email: "john@example.com",
        password: "weak"
      };

      try {
        await signupSchema.parseAsync(data);
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("should reject missing name", async () => {
      const data = {
        email: "john@example.com",
        password: "SecurePass123"
      };

      try {
        await signupSchema.parseAsync(data);
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("loginSchema", () => {
    it("should validate correct login data", async () => {
      const data = {
        email: "john@example.com",
        password: "SecurePass123"
      };

      const result = await loginSchema.parseAsync(data);
      expect(result.email).toBe("john@example.com");
    });

    it("should normalize email to lowercase", async () => {
      const data = {
        email: "JOHN@EXAMPLE.COM",
        password: "SecurePass123"
      };

      const result = await loginSchema.parseAsync(data);
      expect(result.email).toBe("john@example.com");
    });
  });

  describe("createComponentSchema", () => {
    it("should validate correct component data", async () => {
      const data = {
        type: "cpu",
        name: "Intel Core i5",
        brand: "Intel",
        price: 299.99,
        specs: {
          cores: 6,
          threads: 12
        }
      };

      const result = await createComponentSchema.parseAsync(data);
      expect(result.type).toBe("cpu");
      expect(result.price).toBe(299.99);
    });

    it("should reject invalid component type", async () => {
      const data = {
        type: "invalid-type",
        name: "Intel Core i5",
        brand: "Intel",
        price: 299.99
      };

      try {
        await createComponentSchema.parseAsync(data);
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("should reject negative price", async () => {
      const data = {
        type: "cpu",
        name: "Intel Core i5",
        brand: "Intel",
        price: -100
      };

      try {
        await createComponentSchema.parseAsync(data);
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
