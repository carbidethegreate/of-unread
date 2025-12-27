import pino from "pino";

const redactions = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.ONLYFANS_API_KEY",
  "req.body.OPENAI_API_KEY"
];

export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: redactions,
    remove: true
  }
});
