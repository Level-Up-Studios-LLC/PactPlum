"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { buttonClass, FormStatus, inputClass } from "../../ui";
import { addRecipientAction, moveRecipientAction, removeRecipientAction } from "../actions";

export type RecipientView = { id: string; name: string; email: string; role: string | null; kind: "signer" | "cc" };

const small = "rounded border border-neutral-300 bg-white px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-40";

export function RecipientsPanel({
  documentId,
  recipients,
  roles,
  contacts,
  editable,
}: {
  documentId: string;
  recipients: RecipientView[];
  roles: string[];
  contacts: { id: string; name: string; email: string }[];
  editable: boolean;
}) {
  const [state, formAction, pending] = useActionState(addRecipientAction.bind(null, documentId), null);
  const [kind, setKind] = useState<"signer" | "cc">("signer");

  return (
    <section aria-labelledby="recipients-heading" className="rounded-md border border-neutral-200 bg-white p-4">
      <h2 id="recipients-heading" className="mb-3 text-sm font-semibold">
        Recipients (in signing order)
      </h2>
      {recipients.length === 0 ? (
        <p className="mb-3 text-sm text-neutral-600">No recipients yet.</p>
      ) : (
        <ol className="mb-4 divide-y divide-neutral-200">
          {recipients.map((recipient, index) => (
            <li key={recipient.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                {index + 1}. {recipient.name} · {recipient.email}
              </span>
              <span className="text-neutral-500">{recipient.kind === "signer" ? `Signer · ${recipient.role}` : "Copy"}</span>
              {editable && (
                <span className="flex gap-1">
                  <form action={moveRecipientAction.bind(null, documentId, recipient.id, "up")}>
                    <button type="submit" className={small} disabled={index === 0} aria-label={`Move ${recipient.name} up`}>
                      ↑
                    </button>
                  </form>
                  <form action={moveRecipientAction.bind(null, documentId, recipient.id, "down")}>
                    <button
                      type="submit"
                      className={small}
                      disabled={index === recipients.length - 1}
                      aria-label={`Move ${recipient.name} down`}
                    >
                      ↓
                    </button>
                  </form>
                  <form action={removeRecipientAction.bind(null, documentId, recipient.id)}>
                    <button type="submit" className={small} aria-label={`Remove ${recipient.name}`}>
                      Remove
                    </button>
                  </form>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {editable &&
        (contacts.length === 0 ? (
          <p className="text-sm text-neutral-600">
            <Link href="/app/contacts" className="text-[#6b2d5c] underline">
              Add a contact
            </Link>{" "}
            to choose recipients.
          </p>
        ) : (
          <form action={formAction} className="flex flex-wrap items-end gap-2">
            <label className="block text-sm">
              Contact
              <select name="contactId" required className={inputClass}>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name} ({contact.email})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              As
              <select name="kind" value={kind} onChange={(event) => setKind(event.target.value as "signer" | "cc")} className={inputClass}>
                <option value="signer">Signer</option>
                <option value="cc">Copy</option>
              </select>
            </label>
            {kind === "signer" && (
              <label className="block text-sm">
                Role
                <select name="role" className={inputClass}>
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="submit" disabled={pending} className={buttonClass}>
              {pending ? "Adding…" : "Add recipient"}
            </button>
            <div className="w-full">
              <FormStatus state={state} />
            </div>
          </form>
        ))}
    </section>
  );
}
