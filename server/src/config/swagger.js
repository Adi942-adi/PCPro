import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "PCPro API Documentation",
      version: "1.0.0",
      description:
        "PCPro - Full-stack PC builder and store application API documentation",
      contact: {
        name: "PCPro",
        email: "support@pcpro.local"
      }
    },
    servers: [
      {
        url: `${process.env.SERVER_ORIGIN || "http://localhost:5000"}/api`,
        description: "Development server"
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT access token"
        },
        CookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "pcpro_access",
          description: "Session cookie with JWT token"
        }
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            email: { type: "string", format: "email" },
            role: { type: "string", enum: ["user", "admin"] },
            emailVerified: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" }
          }
        },
        Component: {
          type: "object",
          properties: {
            _id: { type: "string" },
            type: { type: "string" },
            name: { type: "string" },
            brand: { type: "string" },
            price: { type: "number" },
            specs: { type: "object" },
            createdAt: { type: "string", format: "date-time" }
          }
        },
        Build: {
          type: "object",
          properties: {
            _id: { type: "string" },
            userId: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            components: { type: "object" },
            createdAt: { type: "string", format: "date-time" }
          }
        },
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                statusCode: { type: "integer" }
              }
            }
          }
        }
      }
    },
    security: [
      {
        BearerAuth: []
      },
      {
        CookieAuth: []
      }
    ]
  },
  apis: ["./src/routes/**/*.js"]
};

export const swaggerSpec = swaggerJsdoc(options);
