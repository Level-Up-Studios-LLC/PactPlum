"use client";

import { PAYMENT_MODE_LABELS, PAYMENT_MODES, type PaymentMode } from "@/lib/documents";
import { inputClass } from "./ui";

export function PaymentFields({
  mode,
  percent,
  onModeChange,
  onPercentChange,
  disabled,
}: {
  mode: PaymentMode;
  percent: string;
  onModeChange: (mode: PaymentMode) => void;
  onPercentChange: (percent: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="grid gap-3 rounded-md border border-neutral-200 bg-white p-4 sm:grid-cols-2">
      <legend className="px-1 text-sm font-semibold">Payment</legend>
      <label className="block text-sm">
        Collect payment
        <select value={mode} onChange={(event) => onModeChange(event.target.value as PaymentMode)} className={inputClass}>
          {PAYMENT_MODES.map((option) => (
            <option key={option} value={option}>
              {PAYMENT_MODE_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      {mode === "deposit_percent" && (
        <label className="block text-sm">
          Deposit percent
          <input
            type="number"
            min={1}
            max={100}
            value={percent}
            onChange={(event) => onPercentChange(event.target.value)}
            className={inputClass}
          />
        </label>
      )}
    </fieldset>
  );
}
