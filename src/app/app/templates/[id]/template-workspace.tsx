"use client";

import type { JSONContent } from "@tiptap/react";
import { useState, useTransition } from "react";
import { PricingTableSection } from "@/components/editor/pricing-table-section";
import type { CatalogOption } from "@/components/editor/quote-editor";
import { RichEditor } from "@/components/editor/rich-editor";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES, type DocumentType, type PaymentMode } from "@/lib/documents";
import type { Quote } from "@/lib/quote/schema";
import { parseRoleList } from "@/lib/roles";
import type { ActionState } from "../../action-state";
import { PaymentFields } from "../../payment-fields";
import { buttonClass, FormStatus, inputClass } from "../../ui";
import { saveTemplateAction } from "../actions";

export type TemplateData = {
  id: string;
  version: number;
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
  // The saved version this page is based on; sent with each save and replaced by the one the save returns.
  const [version, setVersion] = useState(template.version);
  const [status, setStatus] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const roles = parseRoleList(rolesText);

  function save() {
    startTransition(async () => {
      const result = await saveTemplateAction(template.id, {
        version,
        name,
        documentType,
        roles,
        content,
        quote,
        paymentMode,
        paymentPercent: paymentPercent === "" ? null : Number(paymentPercent),
      });
      setStatus(result);
      if (result?.ok && result.version !== undefined) setVersion(result.version);
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

      <PricingTableSection
        quote={quote}
        content={content}
        onChange={setQuote}
        products={products}
        currencies={currencies}
        defaultCurrency={defaultCurrency}
      />

      <PaymentFields
        mode={paymentMode}
        percent={paymentPercent}
        onModeChange={setPaymentMode}
        onPercentChange={setPaymentPercent}
      />

      <div className="flex items-center gap-4">
        <button type="button" onClick={save} disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Save template"}
        </button>
        <FormStatus state={status} />
      </div>
    </div>
  );
}
