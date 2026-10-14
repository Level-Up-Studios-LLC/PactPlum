"use client";

import { useActionState } from "react";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES } from "@/lib/documents";
import { formKey } from "../../action-state";
import { buttonClass, FormStatus, inputClass } from "../../ui";
import { createDocumentAction } from "../actions";

export function NewDocumentForm({
  templates,
  contacts,
}: {
  templates: { id: string; name: string }[];
  contacts: { id: string; name: string; email: string }[];
}) {
  const [state, formAction, pending] = useActionState(createDocumentAction, null);
  return (
    <form key={formKey(state)} action={formAction} className="space-y-4">
      <label className="block text-sm">
        Template
        <select name="templateId" defaultValue={state?.values?.templateId ?? ""} className={inputClass}>
          <option value="">Blank document</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Client
        <select name="contactId" defaultValue={state?.values?.contactId ?? ""} className={inputClass}>
          <option value="">Choose later</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.name} ({contact.email})
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Type
        <select name="type" defaultValue={state?.values?.type ?? ""} className={inputClass}>
          <option value="">Same as the template (proposal for a blank document)</option>
          {DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {DOCUMENT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Name (optional)
        <input name="name" defaultValue={state?.values?.name} placeholder="Defaults to the template name" className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Creating…" : "Create document"}
      </button>
      <FormStatus state={state} />
    </form>
  );
}
