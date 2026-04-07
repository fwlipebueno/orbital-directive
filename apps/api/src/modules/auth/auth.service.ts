import type { LoginInput, RegisterInput } from "@orbital/shared";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env";
import { userRepository } from "../../db/repositories/user-repository";
import { stationService } from "../stations/station.service";
import { hashPassword, verifyPassword } from "../../security/password";
import { sessionService, type SessionUser } from "../../security/session";
import { AppError } from "../../utils/errors";

interface AuthClientMeta {
  ipAddress?: string;
  userAgent?: string;
}

function toSessionUser(user: {
  id: string;
  email: string;
  name: string;
  isDemo: boolean;
}): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isDemo: user.isDemo
  };
}

export const authService = {
  async register(input: RegisterInput, meta?: AuthClientMeta) {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      throw new AppError("E-mail already registered.", "EMAIL_ALREADY_REGISTERED", 409);
    }

    const hashedPassword = await hashPassword(input.password);
    const user = await userRepository.create({
      id: randomUUID(),
      email: input.email,
      name: input.name,
      passwordHash: hashedPassword,
      isDemo: false
    });

    if (!user) {
      throw new AppError("Unable to create account.", "USER_CREATE_FAILED", 500);
    }

    await stationService.ensureUserStation(user.id, `${input.name} Orbital Station`);

    const session = await sessionService.createSession(toSessionUser(user), meta);
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt.toISOString()
      },
      session
    };
  },

  async login(input: LoginInput, meta?: AuthClientMeta) {
    const user = await userRepository.findByEmail(input.email);
    if (!user) {
      throw new AppError("Invalid credentials.", "INVALID_CREDENTIALS", 401);
    }

    const isValid = await verifyPassword(user.passwordHash, input.password);
    if (!isValid) {
      throw new AppError("Invalid credentials.", "INVALID_CREDENTIALS", 401);
    }

    await stationService.ensureUserStation(user.id, `${user.name} Orbital Station`);

    const session = await sessionService.createSession(toSessionUser(user), meta);
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt.toISOString()
      },
      session
    };
  },

  async demoLogin(meta?: AuthClientMeta) {
    const passwordHash = await hashPassword(env.DEMO_PASSWORD);
    const demoUser = await userRepository.ensureDemoUser(env.DEMO_EMAIL, env.DEMO_USER_NAME, passwordHash, randomUUID());

    if (!demoUser) {
      throw new AppError("Unable to initialize demo user.", "DEMO_USER_ERROR", 500);
    }

    await stationService.ensureUserStation(demoUser.id, "Demo Orbital Station");

    const session = await sessionService.createSession(toSessionUser(demoUser), meta);
    return {
      user: {
        id: demoUser.id,
        name: demoUser.name,
        email: demoUser.email,
        createdAt: demoUser.createdAt.toISOString()
      },
      session
    };
  },

  async me(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError("User not found.", "USER_NOT_FOUND", 404);
    }

    const preferences = await userRepository.getPreferences(user.id);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
        isDemo: user.isDemo
      },
      preferences: {
        reducedSensoryMode: preferences?.reducedSensoryMode ?? false,
        compactDensity: preferences?.compactDensity ?? false
      }
    };
  },

  async logout(sessionId: string) {
    await sessionService.revokeSession(sessionId);
    return { ok: true };
  }
};
