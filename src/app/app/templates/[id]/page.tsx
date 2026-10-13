import Link from "next/link";
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { getTemplate } from "@/server/templates/templates";
import { ConfirmButton } from "../../confirm-button";
import { loadOrNotFound } from "../../load";
import { dangerButtonClass, secondaryButtonClass } from "../../ui";
import { deleteTemplateAction, duplicateTemplateAction } from "../actions";
import { TemplateWorkspace } from "./template-workspace";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireMember();
  const { id } = await params;
  const template = await loadOrNotFound(getTemplate(db, ctx, id));

  return (
    <div className="space-y-6">
      <Link href="/app/templates" className="text-sm text-neutral-600 hover:underline">
        ← Templates
      </Link>
      <h1 className="text-2xl font-semibold">{template.name}</h1>
      <TemplateWorkspace
        template={{
          id: template.id,
          name: template.name,
          documentType: template.documentType,
          roles: template.roles,
          content: template.content,
          quote: template.quote,
          paymentMode: template.paymentMode,
          paymentPercent: template.paymentPercent,
        }}
      />
      <div className="flex gap-3 border-t border-neutral-200 pt-6">
        <form action={duplicateTemplateAction.bind(null, template.id)}>
          <button type="submit" className={secondaryButtonClass}>
            Duplicate template
          </button>
        </form>
        <form action={deleteTemplateAction.bind(null, template.id)}>
          <ConfirmButton
            message="Delete this template? Documents already created from it are not affected."
            label="Delete template"
            className={dangerButtonClass}
          />
        </form>
      </div>
    </div>
  );
}
