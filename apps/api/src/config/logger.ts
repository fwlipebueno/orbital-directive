import pino from "pino";
import { env } from "./env";

const baseOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: ["req.headers.cookie", "req.headers.authorization", "password", "passwordHash", "*.password"],
    remove: true
  }
};

export const logger =
  env.NODE_ENV === "development"
    ? pino({
        ...baseOptions,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            singleLine: true
          }
        }
      })
    : pino(baseOptions);
