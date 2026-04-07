import { randomInt } from "node:crypto";

export function secureRandom(): number {
  const max = 1_000_000;
  return randomInt(0, max) / max;
}
