"use client";

import type { JSONContent } from "@tiptap/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PricingTableSection } from "@/components/editor/pricing-table-section";
import type { CatalogOption } from "@/components/editor/quote-editor";
import { RichEditor } from "@/components/editor/rich-editor";
import type { PaymentMode } from "@/lib/documents";
import { extractVariables } from "@/lib/editor/content";
import type { Quote } from "@/lib/quote/schema";
import { parseRoleList } from "@/lib/roles";
import type { ActionState } from "../../action-state";
import { PaymentFields } from "../../payment-fields";
import { buttonClass, FormStatus, inputClass } from "../../ui";
import { saveDocumentAction } from "../actions";

export type DocumentData = {
  id: string;
  name: string;
  contactId: string | null;
  roles: string[];
  content: JSONContent;
  quote: Quote | null;
  variables: Record<string, string>;
  currency: string;
  paymentMode: PaymentMode;
  paymentPercent: number | null;
};

export function DocumentWorkspace({
  document,
  contacts,
  products,
  currencies,
  knownValues,
  editable,
}: {
  document: DocumentData;
  contacts: { id: string; name: string; email: string }[];
  products: CatalogOption[];
  currencies: string[];
  knownValues: Record<string, string>;
  editable: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(document.name);
  const [contactId, setContactId] = useState(document.contactId ?? "");
  const [rolesText, setRolesText] = useState(document.roles.join(", "));
  const [content, setContent] = useState<JSONContent>(document.content);
  const [quote, setQuote] = useState<Quote | null>(document.quote);
  const [variables, setVariables] = useState<Record<string, string>>(document.variables);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(document.paymentMode);
  const [paymentPercent, setPaymentPercent] = useState(document.paymentPercent?.toString() ?? "");
  const [status, setStatus] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const roles = parseRoleList(rolesText);
  const variableNames = extractVariables(content);

  function save() {
    startTransition(async () => {
      const result = await saveDocumentAction(document.id, {
        name,
        contactId: contactId === "" ? null : contactId,
        roles,
        content,
        quote,
        variables,
        paymentMode,
        paymentPercent: paymentPercent === "" ? null : Number(paymentPercent),
      });
      setStatus(result);
      if (result?.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Document name
          <input value={name} disabled={!editable} onChange={(event) => setName(event.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          Client (fills the [Client.*] variables)
          <select value={contactId} disabled={!editable} onChange={(event) => setContactId(event.target.value)} className={inputClass}>
            <option value="">No client</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name} ({contact.email})
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        Roles (comma separated; every field and signer belongs to a role)
        <input value={rolesText} disabled={!editable} onChange={(event) => setRolesText(event.target.value)} className={inputClass} />
      </label>

      <RichEditor initialContent={document.content} roles={roles} editable={editable} onChange={setContent} />

      <PricingTableSection
        quote={quote}
        content={content}
        onChange={setQuote}
        products={products}
        currencies={currencies}
        defaultCurrency={document.currency}
        editable={editable}
      />

      {variableNames.length > 0 && (
        <fieldset disabled={!editable} className="space-y-2 rounded-md border border-neutral-200 bg-white p-4">
          <legend className="px-1 text-sm font-semibold">Variables</legend>
          <p className="text-sm text-neutral-600">Leave a value empty to use the automatic one shown in grey.</p>
          {variableNames.map((variable) => (
            <label key={variable} className="grid grid-cols-[12rem_1fr] items-center gap-3 text-sm">
              <code>[{variable}]</code>
              <input
                value={variables[variable] ?? ""}
                placeholder={knownValues[variable] ?? "No value yet"}
                onChange={(event) => setVariables({ ...variables, [variable]: event.target.value })}
                className={inputClass}
              />
            </label>
          ))}
        </fieldset>
      )}

      <PaymentFields
        mode={paymentMode}
        percent={paymentPercent}
        onModeChange={setPaymentMode}
        onPercentChange={setPaymentPercent}
        disabled={!editable}
      />

      {editable && (
        <div className="flex items-center gap-4">
          <button type="button" onClick={save} disabled={pending} className={buttonClass}>
            {pending ? "Saving…" : "Save document"}
          </button>
          <FormStatus state={status} />
        </div>
      )}
    </div>
  );
}
