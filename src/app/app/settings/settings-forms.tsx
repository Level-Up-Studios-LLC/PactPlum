"use client";

import { useActionState } from "react";
import type { OrganizationSettings } from "@/server/org/settings";
import { inviteMemberAction, sendTestEmailAction, updateSettingsAction, type ActionState } from "./actions";

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const button = "rounded-md bg-[#6b2d5c] px-3 py-2 text-sm font-medium text-white disabled:opacity-60";

function Status({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"} break-all`}>
      {state.message}
    </p>
  );
}

export function SettingsForm({ settings }: { settings: OrganizationSettings }) {
  const [state, action, pending] = useActionState(updateSettingsAction, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">Organization name
        <input name="name" defaultValue={settings.name} required className={input} />
      </label>
      <label className="block text-sm">Email sender name
        <input name="senderName" defaultValue={settings.senderName ?? ""} placeholder={settings.name} className={input} />
      </label>
      <label className="block text-sm">Reply-to email
        <input name="replyToEmail" type="email" defaultValue={settings.replyToEmail ?? ""} className={input} />
      </label>
      <label className="block text-sm">Allowed sign-up domains (comma separated)
        <input name="allowedSignupDomains" defaultValue={settings.allowedSignupDomains.join(", ")}
          placeholder="example.com" className={input} />
      </label>
      <button type="submit" disabled={pending} className={button}>{pending ? "Saving…" : "Save settings"}</button>
      <Status state={state} />
    </form>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMemberAction, null);
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <label htmlFor="invite-email" className="sr-only">Teammate email</label>
      <input id="invite-email" name="email" type="email" required placeholder="teammate@example.com" className={`${input} max-w-xs`} />
      <button type="submit" disabled={pending} className={button}>{pending ? "Sending…" : "Send invitation"}</button>
      <div className="w-full"><Status state={state} /></div>
    </form>
  );
}

export function TestEmailForm() {
  const [state, action, pending] = useActionState(sendTestEmailAction, null);
  return (
    <form action={action} className="space-y-2">
      <button type="submit" disabled={pending} className={button}>{pending ? "Sending…" : "Send test email"}</button>
      <Status state={state} />
    </form>
  );
}
