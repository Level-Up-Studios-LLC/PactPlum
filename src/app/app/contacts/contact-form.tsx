"use client";

import { useActionState } from "react";
import { type ActionState, formKey } from "../action-state";
import { buttonClass, FormStatus, inputClass } from "../ui";

export type ContactFields = {
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  address: string | null;
};

export function ContactForm({
  action,
  contact,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  contact?: ContactFields;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form key={formKey(state)} action={formAction} className="space-y-3">
      <label className="block text-sm">
        Name
        <input name="name" required defaultValue={state?.values?.name ?? contact?.name} className={inputClass} />
      </label>
      <label className="block text-sm">
        Email
        <input name="email" type="email" required defaultValue={state?.values?.email ?? contact?.email} className={inputClass} />
      </label>
      <label className="block text-sm">
        Company
        <input name="company" defaultValue={state?.values?.company ?? contact?.company ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        Phone
        <input name="phone" type="tel" defaultValue={state?.values?.phone ?? contact?.phone ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        Address
        <textarea name="address" rows={3} defaultValue={state?.values?.address ?? contact?.address ?? ""} className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : submitLabel}
      </button>
      <FormStatus state={state} />
    </form>
  );
}
