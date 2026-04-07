import { z } from "zod";

const passwordRule = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/;

export const registerInputSchema = z.object({
  name: z.string().trim().min(3).max(60),
  email: z.string().trim().toLowerCase().email().max(180),
  password: z.string().regex(passwordRule, "Password must include letters, numbers and symbols, minimum 12 chars")
});

export const loginInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200)
});

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string()
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
