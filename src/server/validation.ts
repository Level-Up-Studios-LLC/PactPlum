import type { z } from "zod";
import { ValidationError } from "./errors";

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Invalid input.");
  return result.data;
}
