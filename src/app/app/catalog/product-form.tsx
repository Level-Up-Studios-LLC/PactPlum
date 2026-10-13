"use client";

import { useActionState } from "react";
import type { ActionState } from "../action-state";
import { buttonClass, FormStatus, inputClass } from "../ui";

export type ProductFields = {
  title: string;
  sku: string | null;
  description: string;
  currency: string;
  price: string;
  billingType: "one_time" | "monthly" | "yearly";
};

export function ProductForm({
  action,
  product,
  currencies,
  defaultCurrency,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  product?: ProductFields;
  currencies: string[];
  defaultCurrency: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-sm">
        Title
        <input name="title" required defaultValue={product?.title} className={inputClass} />
      </label>
      <label className="block text-sm">
        SKU (optional)
        <input name="sku" defaultValue={product?.sku ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        Description
        <textarea name="description" rows={3} defaultValue={product?.description ?? ""} className={inputClass} />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block text-sm">
          Price
          <input name="price" inputMode="decimal" required defaultValue={product?.price ?? ""} placeholder="1250.00" className={inputClass} />
        </label>
        <label className="block text-sm">
          Currency
          <select name="currency" defaultValue={product?.currency ?? defaultCurrency} className={inputClass}>
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Billing
          <select name="billingType" defaultValue={product?.billingType ?? "one_time"} className={inputClass}>
            <option value="one_time">One-time</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : submitLabel}
      </button>
      <FormStatus state={state} />
    </form>
  );
}
