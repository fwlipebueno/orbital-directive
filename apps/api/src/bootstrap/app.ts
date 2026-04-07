import { createExpressMiddleware } from "@trpc/server/adapters/express";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { authSessionMiddleware } from "../middleware/auth-session";
import { errorMiddleware } from "../middleware/error";
import { requestIdMiddleware } from "../middleware/request-id";
import { ensureCsrfToken, validateCsrf } from "../security/csrf";
import { createContext } from "../trpc/context";
import { appRouter } from "../trpc/router";
import { AppError } from "../utils/errors";

const cspKeywordSources = new Set([
  "self",
  "none",
  "unsafe-inline",
  "unsafe-eval",
  "strict-dynamic",
  "unsafe-hashes",
  "report-sample"
]);

function normalizeCspSourceToken(value: string): string {
  const token = value.trim();
  if (token.length === 0) {
    return token;
  }

  if (token.startsWith("'") && token.endsWith("'")) {
    return token;
  }

  if (cspKeywordSources.has(token)) {
    return `'${token}'`;
  }

  return token;
}

function splitCspSource(value: string): string[] {
  return value
    .split(" ")
    .map((item) => normalizeCspSourceToken(item))
    .filter((item) => item.length > 0);
}

const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests"
    }
  }
});

const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many authentication attempts"
    }
  }
});

function csrfGuard(request: express.Request, _response: express.Response, next: express.NextFunction) {
  if (request.path.includes("/auth.login") || request.path.includes("/auth.register") || request.path.includes("/auth.demoLogin")) {
    return next();
  }

  if (!validateCsrf(request)) {
    return next(new AppError("Invalid CSRF token.", "INVALID_CSRF_TOKEN", 403));
  }

  return next();
}

export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  app.use(requestIdMiddleware);
  app.use((request, response, next) => {
    const startedAt = Date.now();
    response.on("finish", () => {
      logger.info(
        {
          requestId: request.requestId,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt
        },
        "HTTP request completed"
      );
    });
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Keep a strict baseline and open only what the current UI/runtime needs.
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: splitCspSource(env.CSP_IMG_SRC),
          connectSrc: splitCspSource(env.CSP_CONNECT_SRC),
          mediaSrc: splitCspSource(env.CSP_MEDIA_SRC),
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"]
        }
      },
      crossOriginResourcePolicy: {
        policy: "same-site"
      }
    })
  );

  app.use(
    cors({
      origin: env.APP_ORIGIN,
      credentials: true,
      methods: ["GET", "POST"],
      allowedHeaders: ["content-type", "x-csrf-token", "x-requested-with"]
    })
  );

  app.use(globalLimiter);
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(authSessionMiddleware);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  app.get("/api/csrf", (req, res) => {
    const token = ensureCsrfToken(req, res);
    res.json({ csrfToken: token });
  });

  app.use("/trpc/auth.login", authLimiter);
  app.use("/trpc/auth.register", authLimiter);
  app.use("/trpc/auth.demoLogin", authLimiter);

  app.use("/trpc", csrfGuard);
  app.use(
    "/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ path, error, req }) {
        logger.error(
          {
            path,
            error,
            requestId: req.requestId
          },
          "tRPC error"
        );
      }
    })
  );

  app.use(errorMiddleware);

  return app;
}
