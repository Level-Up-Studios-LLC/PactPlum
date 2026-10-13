import Link from "next/link";
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { listContacts } from "@/server/contacts/contacts";
import { listTemplates } from "@/server/templates/templates";
import { NewDocumentForm } from "./new-document-form";

export default async function NewDocumentPage() {
  const { ctx } = await requireMember();
  const [templates, contacts] = await Promise.all([listTemplates(db, ctx), listContacts(db, ctx)]);
  return (
    <div className="space-y-6">
      <Link href="/app/documents" className="text-sm text-neutral-600 hover:underline">
        ← Documents
      </Link>
      <h1 className="text-2xl font-semibold">New document</h1>
      <NewDocumentForm
        templates={templates.map(({ id, name }) => ({ id, name }))}
        contacts={contacts.map(({ id, name, email }) => ({ id, name, email }))}
      />
    </div>
  );
}
