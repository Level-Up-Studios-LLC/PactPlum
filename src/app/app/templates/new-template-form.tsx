"use client";

import { useActionState } from "react";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES } from "@/lib/documents";
import { buttonClass, FormStatus, inputClass } from "../ui";
import { createTemplateAction } from "./actions";

export function NewTemplateForm() {
  const [state, formAction, pending] = useActionState(createTemplateAction, null);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="block min-w-64 flex-1 text-sm">
        Template name
        <input name="name" required className={inputClass} />
      </label>
      <label className="block text-sm">
        Type
        <select name="documentType" defaultValue="proposal" className={inputClass}>
          {DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {DOCUMENT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Creating…" : "Create template"}
      </button>
      <div className="w-full">
        <FormStatus state={state} />
      </div>
    </form>
  );
}
