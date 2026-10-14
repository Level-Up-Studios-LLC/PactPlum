import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * `values` carries the submitted strings back after an error, because React resets uncontrolled form fields after an action.
 * `version` carries the saved version back after a save, so the editor can send it with the next one.
 */
export type ActionState = { ok: boolean; message: string; values?: Record<string, string>; version?: number } | null;

/** Maps expected errors to their message; logs anything else and returns a generic message. */
export function actionError(scope: string, error: unknown, values?: Record<string, string>): NonNullable<ActionState> {
  if (
    error instanceof ValidationError ||
    error instanceof ForbiddenError ||
    error instanceof NotFoundError ||
    error instanceof ConflictError
  ) {
    return { ok: false, message: error.message, values };
  }
  console.error(`[${scope}]`, error);
  return { ok: false, message: "Something went wrong. Check the server logs.", values };
}

/** The named form fields as strings. */
export function formValues(formData: FormData, names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, String(formData.get(name) ?? "")]));
}

/** Changes when a failed submission comes back with different values, so the form re-applies its defaults. */
export function formKey(state: ActionState): string {
  return state?.values ? JSON.stringify(state.values) : "form";
}
