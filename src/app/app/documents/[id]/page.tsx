import Link from "next/link";
import { db } from "@/db/client";
import { DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from "@/lib/documents";
import { formatMoney } from "@/lib/money";
import { requireMember } from "@/server/auth/session";
import { listProducts } from "@/server/catalog/products";
import { listContacts } from "@/server/contacts/contacts";
import { documentVariableValues, getDocument } from "@/server/documents/documents";
import { documentReadiness } from "@/server/documents/readiness";
import { ConfirmButton } from "../../confirm-button";
import { loadOrNotFound } from "../../load";
import { dangerButtonClass } from "../../ui";
import { deleteDocumentAction } from "../actions";
import { DocumentWorkspace } from "./document-workspace";
import { RecipientsPanel } from "./recipients-panel";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireMember();
  const { id } = await params;
  const document = await loadOrNotFound(getDocument(db, ctx, id));
  const [contacts, products, knownValues, problems] = await Promise.all([
    listContacts(db, ctx),
    listProducts(db, ctx),
    documentVariableValues(db, ctx, document),
    documentReadiness(db, ctx, document),
  ]);
  const editable = document.status === "draft";
  const contactOptions = contacts.map(({ id: contactId, name, email }) => ({ id: contactId, name, email }));

  return (
    <div className="space-y-6">
      <Link href="/app/documents" className="text-sm text-neutral-600 hover:underline">
        ← Documents
      </Link>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">{document.name}</h1>
        <p className="text-sm text-neutral-600">
          {DOCUMENT_TYPE_LABELS[document.type]} {document.number} · {DOCUMENT_STATUS_LABELS[document.status]} ·{" "}
          {formatMoney(document.total, document.currency)}
        </p>
      </header>

      {!editable && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          This document is {DOCUMENT_STATUS_LABELS[document.status].toLowerCase()}. Only drafts can be edited.
        </p>
      )}

      <section aria-labelledby="readiness-heading" className="rounded-md border border-neutral-200 bg-white p-4">
        <h2 id="readiness-heading" className="mb-2 text-sm font-semibold">
          Ready to send?
        </h2>
        {problems.length === 0 ? (
          <p className="text-sm text-green-700">Everything needed to send is in place.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
      </section>

      <RecipientsPanel
        documentId={document.id}
        recipients={document.recipients.map(({ id: recipientId, name, email, role, kind }) => ({ id: recipientId, name, email, role, kind }))}
        roles={document.roles}
        contacts={contactOptions}
        editable={editable}
      />

      <DocumentWorkspace
        document={{
          id: document.id,
          name: document.name,
          contactId: document.contactId,
          roles: document.roles,
          content: document.content,
          quote: document.quote,
          variables: document.variables,
          currency: document.currency,
          paymentMode: document.paymentMode,
          paymentPercent: document.paymentPercent,
        }}
        contacts={contactOptions}
        products={products.map(({ id: productId, title, description, unitPrice, currency, sku }) => ({
          id: productId,
          title,
          description,
          unitPrice,
          currency,
          sku,
        }))}
        currencies={Intl.supportedValuesOf("currency")}
        knownValues={knownValues}
        editable={editable}
      />

      {editable && (
        <form action={deleteDocumentAction.bind(null, document.id)} className="border-t border-neutral-200 pt-6">
          <ConfirmButton message="Delete this draft and its recipients?" label="Delete draft" className={dangerButtonClass} />
        </form>
      )}
    </div>
  );
}
