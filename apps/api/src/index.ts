import { createServer } from "node:http";
import { createApp } from "./bootstrap/app";
import { env } from "./config/env";
import { logger } from "./config/logger";

const app = createApp();
const server = createServer(app);

server.listen(env.API_PORT, () => {
  logger.info({ port: env.API_PORT }, "Orbital Directive API started");
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down API");
  server.close();
});
