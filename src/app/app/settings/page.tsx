import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { listMembers } from "@/server/org/members";
import { getOrganizationSettings } from "@/server/org/settings";
import { InviteForm, SettingsForm, TestEmailForm } from "./settings-forms";

export default async function SettingsPage() {
  const { ctx } = await requireMember();
  const [settings, members] = await Promise.all([getOrganizationSettings(db, ctx), listMembers(db, ctx)]);
  const isOwner = ctx.role === "owner";

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-4 text-2xl font-semibold">Settings</h1>
        {isOwner ? (
          <SettingsForm settings={settings} />
        ) : (
          <>
            <dl className="mb-3 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-neutral-500">Organization name</dt>
              <dd>{settings.name}</dd>
              <dt className="text-neutral-500">Email sender name</dt>
              <dd>{settings.senderName ?? settings.name}</dd>
              <dt className="text-neutral-500">Reply-to email</dt>
              <dd>{settings.replyToEmail ?? "Not set"}</dd>
              <dt className="text-neutral-500">Allowed sign-up domains</dt>
              <dd>{settings.allowedSignupDomains.length > 0 ? settings.allowedSignupDomains.join(", ") : "None"}</dd>
            </dl>
            <p className="text-sm text-neutral-600">Only the owner can change organization settings.</p>
          </>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Members</h2>
        <ul className="mb-4 divide-y rounded-md border border-neutral-200 bg-white">
          {members.map((member) => (
            <li key={member.userId} className="flex justify-between px-4 py-2 text-sm">
              <span>{member.name} · {member.email}</span>
              <span className="text-neutral-500">{member.role === "owner" ? "Owner" : "Member"}</span>
            </li>
          ))}
        </ul>
        {isOwner && <InviteForm />}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Email</h2>
        <p className="mb-3 text-sm text-neutral-600">
          Sends a test message to your own address using the SMTP settings from the environment.
        </p>
        <TestEmailForm />
      </section>
    </div>
  );
}
