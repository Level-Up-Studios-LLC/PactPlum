import type { ActionState } from "./action-state";

export const inputClass = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
export const buttonClass = "rounded-md bg-[#6b2d5c] px-3 py-2 text-sm font-medium text-white disabled:opacity-60";
export const secondaryButtonClass =
  "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 disabled:opacity-60";
export const dangerButtonClass =
  "rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-60";

export function FormStatus({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"} break-all`}>
      {state.message}
    </p>
  );
}
