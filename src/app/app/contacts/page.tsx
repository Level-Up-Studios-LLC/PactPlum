import Link from "next/link";
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { listContacts } from "@/server/contacts/contacts";
import { inputClass, secondaryButtonClass } from "../ui";
import { createContactAction } from "./actions";
import { ContactForm } from "./contact-form";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { ctx } = await requireMember();
  const { q = "" } = await searchParams;
  const contacts = await listContacts(db, ctx, { search: q });

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-4 text-2xl font-semibold">Contacts</h1>
        <form role="search" className="mb-4 flex gap-2">
          <label htmlFor="contact-search" className="sr-only">
            Search contacts
          </label>
          <input id="contact-search" name="q" defaultValue={q} placeholder="Search by name, email or company" className={inputClass} />
          <button type="submit" className={secondaryButtonClass}>
            Search
          </button>
        </form>
        {contacts.length === 0 ? (
          <p className="text-sm text-neutral-600">{q ? "No contacts match your search." : "No contacts yet."}</p>
        ) : (
          <ul className="divide-y rounded-md border border-neutral-200 bg-white">
            {contacts.map((contact) => (
              <li key={contact.id} className="flex justify-between gap-4 px-4 py-2 text-sm">
                <Link href={`/app/contacts/${contact.id}`} className="font-medium text-[#6b2d5c] hover:underline">
                  {contact.name}
                </Link>
                <span className="text-neutral-500">{[contact.company, contact.email].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Add a contact</h2>
        <ContactForm action={createContactAction} submitLabel="Add contact" />
      </section>
    </div>
  );
}
