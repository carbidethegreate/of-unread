import compression from "compression";
import express from "express";
import helmet from "helmet";
import pino from "pino";
import pinoHttp from "pino-http";

import { apiRouter } from "./routes/api";
import { isHttpError } from "./utils/http";

export function createApp() {
  const logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['x-api-key']",
        "res.headers['set-cookie']",
      ],
      remove: true,
    },
  });

  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            method: req.method,
            url: req.url,
            remoteAddress: req.remoteAddress,
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    })
  );

  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: "256kb" }));

  app.get("/healthz", (req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use(express.static("public"));

  app.use("/api", apiRouter());

  // Fallback for SPA routes.
  app.get("*", (req, res) => {
    res.sendFile("/public/index.html", { root: process.cwd() });
  });

  // Central error handler.
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const status = isHttpError(err) ? err.statusCode : 500;
    const expose = isHttpError(err) ? err.expose : false;

    const message = expose ? String(err?.message ?? "Request failed") : status >= 500 ? "Server error" : "Request failed";

    // Log a minimal error without leaking secrets.
    req.log?.error({ status, err: { name: err?.name, message: err?.message } }, "Request failed");

    res.status(status).json({ error: message });
  });

  return { app, logger };
}
