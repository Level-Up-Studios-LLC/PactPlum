"use client";

import type { JSONContent } from "@tiptap/react";
import { useState, useTransition } from "react";
import { type CatalogOption, QuoteEditor } from "@/components/editor/quote-editor";
import { RichEditor } from "@/components/editor/rich-editor";
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  type DocumentType,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  type PaymentMode,
} from "@/lib/documents";
import { countQuoteBlocks } from "@/lib/editor/content";
import { emptyQuote, type Quote } from "@/lib/quote/schema";
import { parseRoleList } from "@/lib/roles";
import type { ActionState } from "../../action-state";
import { buttonClass, FormStatus, inputClass, secondaryButtonClass } from "../../ui";
import { saveTemplateAction } from "../actions";

export type TemplateData = {
  id: string;
  name: string;
  documentType: DocumentType;
  roles: string[];
  content: JSONContent;
  quote: Quote | null;
  paymentMode: PaymentMode;
  paymentPercent: number | null;
};

export function TemplateWorkspace({
  template,
  products,
  currencies,
  defaultCurrency,
}: {
  template: TemplateData;
  products: CatalogOption[];
  currencies: string[];
  defaultCurrency: string;
}) {
  const [name, setName] = useState(template.name);
  const [documentType, setDocumentType] = useState<DocumentType>(template.documentType);
  const [rolesText, setRolesText] = useState(template.roles.join(", "));
  const [content, setContent] = useState<JSONContent>(template.content);
  const [quote, setQuote] = useState<Quote | null>(template.quote);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(template.paymentMode);
  const [paymentPercent, setPaymentPercent] = useState(template.paymentPercent?.toString() ?? "");
  const [status, setStatus] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const roles = parseRoleList(rolesText);

  function save() {
    startTransition(async () => {
      setStatus(
        await saveTemplateAction(template.id, {
          name,
          documentType,
          roles,
          content,
          quote,
          paymentMode,
          paymentPercent: paymentPercent === "" ? null : Number(paymentPercent),
        }),
      );
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="block text-sm">
          Template name
          <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          Document type
          <select value={documentType} onChange={(event) => setDocumentType(event.target.value as DocumentType)} className={inputClass}>
            {DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {DOCUMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        Roles (comma separated; every field belongs to a role)
        <input value={rolesText} onChange={(event) => setRolesText(event.target.value)} className={inputClass} />
      </label>

      <RichEditor initialContent={template.content} roles={roles} onChange={setContent} />

      {quote ? (
        <div className="space-y-2">
          {countQuoteBlocks(content) === 0 && (
            <p className="text-sm text-amber-700">Insert the “Pricing table” block in the content where the table should appear.</p>
          )}
          <QuoteEditor quote={quote} onChange={setQuote} products={products} currencies={currencies} />
          <button type="button" className={secondaryButtonClass} onClick={() => setQuote(null)}>
            Remove pricing table
          </button>
        </div>
      ) : (
        <button type="button" className={secondaryButtonClass} onClick={() => setQuote(emptyQuote(defaultCurrency))}>
          Add pricing table
        </button>
      )}

      <fieldset className="grid gap-3 rounded-md border border-neutral-200 bg-white p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Payment</legend>
        <label className="block text-sm">
          Collect payment
          <select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as PaymentMode)} className={inputClass}>
            {PAYMENT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {PAYMENT_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        {paymentMode === "deposit_percent" && (
          <label className="block text-sm">
            Deposit percent
            <input
              type="number"
              min={1}
              max={100}
              value={paymentPercent}
              onChange={(event) => setPaymentPercent(event.target.value)}
              className={inputClass}
            />
          </label>
        )}
      </fieldset>

      <div className="flex items-center gap-4">
        <button type="button" onClick={save} disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Save template"}
        </button>
        <FormStatus state={status} />
      </div>
    </div>
  );
}
