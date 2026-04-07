import type { SessionUser } from "../security/session";

declare global {
  namespace Express {
    interface Request {
      authUser?: SessionUser;
      sessionId?: string;
      requestId?: string;
    }
  }
}

export {};
