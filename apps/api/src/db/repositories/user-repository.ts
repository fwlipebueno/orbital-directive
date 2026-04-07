import { eq } from "drizzle-orm";
import { db } from "../client";
import { userPreferences, users } from "../schema";

export interface CreateUserInput {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  isDemo?: boolean;
}

export const userRepository = {
  async findByEmail(email: string) {
    return db.query.users.findFirst({
      where: eq(users.email, email)
    });
  },

  async findById(userId: string) {
    return db.query.users.findFirst({
      where: eq(users.id, userId)
    });
  },

  async create(input: CreateUserInput) {
    await db.insert(users).values({
      id: input.id,
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      isDemo: input.isDemo ?? false
    });
    await db.insert(userPreferences).values({
      userId: input.id
    });
    return this.findById(input.id);
  },

  async getPreferences(userId: string) {
    return db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, userId)
    });
  },

  async updatePreferences(userId: string, reducedSensoryMode: boolean, compactDensity: boolean) {
    await db
      .update(userPreferences)
      .set({
        reducedSensoryMode,
        compactDensity
      })
      .where(eq(userPreferences.userId, userId));

    return db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, userId)
    });
  },

  async ensureDemoUser(email: string, name: string, passwordHash: string, id: string) {
    const existing = await this.findByEmail(email);
    if (existing) {
      return existing;
    }
    await this.create({ id, email, name, passwordHash, isDemo: true });
    return this.findByEmail(email);
  },

  async emailExists(email: string, ignoreUserId?: string) {
    const existing = await this.findByEmail(email);
    if (!existing) {
      return false;
    }
    if (!ignoreUserId) {
      return true;
    }
    return existing.id !== ignoreUserId;
  },
};
