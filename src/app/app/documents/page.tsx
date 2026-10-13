import Link from "next/link";
import { db } from "@/db/client";
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  type DocumentStatus,
  type DocumentType,
} from "@/lib/documents";
import { formatMoney } from "@/lib/money";
import { requireMember } from "@/server/auth/session";
import { listDocuments } from "@/server/documents/documents";
import { buttonClass, inputClass, secondaryButtonClass } from "../ui";

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ status?: string | string[]; type?: string | string[] }> }) {
  const { ctx } = await requireMember();
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "";
  const type = typeof params.type === "string" ? params.type : "";
  const filters = {
    status: (DOCUMENT_STATUSES as readonly string[]).includes(status) ? (status as DocumentStatus) : undefined,
    type: (DOCUMENT_TYPES as readonly string[]).includes(type) ? (type as DocumentType) : undefined,
  };
  const documents = await listDocuments(db, ctx, filters);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <Link href="/app/documents/new" className={buttonClass}>
          New document
        </Link>
      </div>
      <form className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Status
          <select name="status" defaultValue={filters.status ?? ""} className={inputClass}>
            <option value="">All</option>
            {DOCUMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {DOCUMENT_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Type
          <select name="type" defaultValue={filters.type ?? ""} className={inputClass}>
            <option value="">All</option>
            {DOCUMENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {DOCUMENT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={secondaryButtonClass}>
          Filter
        </button>
      </form>
      {documents.length === 0 ? (
        <p className="text-sm text-neutral-600">No documents match. Create one from a template.</p>
      ) : (
        <table className="w-full rounded-md border border-neutral-200 bg-white text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Number</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {documents.map((document) => (
              <tr key={document.id}>
                <td className="px-3 py-2 text-neutral-600">{document.number}</td>
                <td className="px-3 py-2">
                  <Link href={`/app/documents/${document.id}`} className="font-medium text-[#6b2d5c] hover:underline">
                    {document.name}
                  </Link>
                  <span className="ml-2 text-neutral-500">{DOCUMENT_TYPE_LABELS[document.type]}</span>
                </td>
                <td className="px-3 py-2">{document.contactName ?? "—"}</td>
                <td className="px-3 py-2">{DOCUMENT_STATUS_LABELS[document.status]}</td>
                <td className="px-3 py-2 text-right">{formatMoney(document.total, document.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
