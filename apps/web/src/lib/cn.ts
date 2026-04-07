import clsx from "clsx";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return clsx(parts);
}
