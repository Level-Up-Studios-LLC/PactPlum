import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

export type ActionState = { ok: boolean; message: string } | null;

/** Maps expected errors to their message; logs anything else and returns a generic message. */
export function actionError(scope: string, error: unknown): ActionState {
  if (error instanceof ValidationError || error instanceof ForbiddenError || error instanceof NotFoundError) {
    return { ok: false, message: error.message };
  }
  console.error(`[${scope}]`, error);
  return { ok: false, message: "Something went wrong. Check the server logs." };
}
