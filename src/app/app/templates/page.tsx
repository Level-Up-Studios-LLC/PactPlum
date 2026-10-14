import Link from "next/link";
import { db } from "@/db/client";
import { DOCUMENT_TYPE_LABELS } from "@/lib/documents";
import { requireMember } from "@/server/auth/session";
import { listTemplates } from "@/server/templates/templates";
import { NewTemplateForm } from "./new-template-form";

export default async function TemplatesPage() {
  const { ctx } = await requireMember();
  const templates = await listTemplates(db, ctx);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-4 text-2xl font-semibold">Templates</h1>
        {templates.length === 0 ? (
          <p className="text-sm text-neutral-600">No templates yet. Create one below.</p>
        ) : (
          <ul className="divide-y rounded-md border border-neutral-200 bg-white">
            {templates.map((template) => (
              <li key={template.id} className="flex justify-between gap-4 px-4 py-2 text-sm">
                <Link href={`/app/templates/${template.id}`} className="font-medium text-[#6b2d5c] hover:underline">
                  {template.name}
                </Link>
                <span className="text-neutral-500">
                  {DOCUMENT_TYPE_LABELS[template.documentType]} · updated {template.updatedAt.toLocaleDateString("en-US")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">New template</h2>
        <NewTemplateForm />
      </section>
    </div>
  );
}
