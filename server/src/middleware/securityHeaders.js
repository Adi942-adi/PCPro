export const securityHeaders = (req, res, next) => {
  const isProduction = process.env.NODE_ENV === "production";
  const connectSources = ["'self'", "https://api.stripe.com"];
  if (!isProduction) {
    connectSources.push("http://localhost:5173", "ws://localhost:5173");
  }

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com"
  ].join("; ");

  res.set("Content-Security-Policy", csp);
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "no-referrer");
  res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.set("Cross-Origin-Resource-Policy", "same-origin");
  res.set("Cross-Origin-Opener-Policy", "same-origin");
  res.set("Cross-Origin-Embedder-Policy", "require-corp");
  res.set("Cache-Control", "no-store");
  if (isProduction) {
    res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  res.set("Vary", "Origin");
  next();
};
