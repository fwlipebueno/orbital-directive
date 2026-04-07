import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

const PASSWORD_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32
};

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, PASSWORD_OPTIONS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  return argonVerify(hashed, plain);
}
