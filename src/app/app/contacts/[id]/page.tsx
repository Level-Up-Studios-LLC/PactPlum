import Link from "next/link";
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { getContact } from "@/server/contacts/contacts";
import { ConfirmButton } from "../../confirm-button";
import { loadOrNotFound } from "../../load";
import { dangerButtonClass } from "../../ui";
import { deleteContactAction, updateContactAction } from "../actions";
import { ContactForm } from "../contact-form";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireMember();
  const { id } = await params;
  const contact = await loadOrNotFound(getContact(db, ctx, id));

  return (
    <div className="space-y-8">
      <Link href="/app/contacts" className="text-sm text-neutral-600 hover:underline">
        ← Contacts
      </Link>
      <section>
        <h1 className="mb-4 text-2xl font-semibold">{contact.name}</h1>
        <ContactForm action={updateContactAction.bind(null, contact.id)} contact={contact} submitLabel="Save contact" />
      </section>
      <form action={deleteContactAction.bind(null, contact.id)}>
        <ConfirmButton
          message="Delete this contact? Documents keep the recipient's name and email."
          label="Delete contact"
          className={dangerButtonClass}
        />
      </form>
    </div>
  );
}
