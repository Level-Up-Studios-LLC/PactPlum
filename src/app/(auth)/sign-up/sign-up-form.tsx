"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignUpForm({ invitedEmail, verificationRequired }: { invitedEmail?: string; verificationRequired: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const result = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
      callbackURL: "/app",
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Sign-up failed.");
      return;
    }
    if (verificationRequired) {
      setCheckEmail(true);
      return;
    }
    router.push("/app");
    router.refresh();
  }

  if (checkEmail) {
    return <p className="text-sm">Check your inbox for a verification link to finish signing up.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input name="name" required autoComplete="name" placeholder="Full name"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      <input name="email" type="email" required autoComplete="email" placeholder="Email"
        defaultValue={invitedEmail} readOnly={Boolean(invitedEmail)}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm read-only:bg-neutral-100" />
      <input name="password" type="password" required minLength={8} autoComplete="new-password"
        placeholder="Password (8+ characters)"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending}
        className="w-full rounded-md bg-[#6b2d5c] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
