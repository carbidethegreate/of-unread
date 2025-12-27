import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import pinoHttp from "pino-http";
import { loadEnv } from "./env.js";
import { logger } from "./logger.js";
import { OnlyFansClient } from "./onlyfans.js";
import { buildRoutes } from "./routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = loadEnv(process.env);

const app = express();
app.disable("x-powered-by");

app.use(pinoHttp({ logger }));

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors({ origin: false }));
app.use(express.json({ limit: "256kb" }));

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api", apiLimiter);

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

const of = new OnlyFansClient(env);
app.use("/api", buildRoutes(of, env));

// Serve built client (Vite output)
const clientDist = path.resolve(__dirname, "../client");
app.use(express.static(clientDist, { maxAge: "1h", index: false }));

app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

// Central error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  const status = typeof err?.status === "number" ? err.status : 500;
  const msg = typeof err?.message === "string" ? err.message : "Unexpected error";
  logger.error({ err }, "Request failed");
  res.status(status).json({ error: msg });
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Server listening");
});
