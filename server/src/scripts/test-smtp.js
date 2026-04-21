import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const host = String(process.env.SMTP_HOST || "").trim();
const port = Number(process.env.SMTP_PORT || 0);
const secure = String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true";
const user = String(process.env.SMTP_USER || "").trim();
const pass = String(process.env.SMTP_PASS || "").trim();
const from = String(process.env.SMTP_FROM || "").trim();
const to = String(process.env.SMTP_TEST_TO || user).trim();

if (!host || !Number.isFinite(port) || port <= 0 || !from || !to) {
  console.error("SMTP config is incomplete. Set SMTP_HOST, SMTP_PORT, SMTP_FROM, and SMTP_TEST_TO/SMTP_USER.");
  process.exit(1);
}

const transportConfig = {
  host,
  port,
  secure
};

if (user) {
  transportConfig.auth = { user, pass };
}

const transporter = nodemailer.createTransport(transportConfig);

try {
  await transporter.verify();
  const info = await transporter.sendMail({
    from,
    to,
    subject: "PCPro SMTP Test",
    text: "SMTP is configured correctly for PCPro."
  });
  console.log(`SMTP test successful. Message ID: ${info.messageId}`);
} catch (error) {
  console.error(`SMTP test failed: ${error.message || error}`);
  process.exit(1);
}
