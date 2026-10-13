"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await authClient.requestPasswordReset({ email: String(form.get("email")), redirectTo: "/reset-password" });
    // Same message whether or not the account exists.
    setSent(true);
  }

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Reset your password</h1>
      {sent ? (
        <p className="text-sm">If an account exists for that email, a reset link is on its way.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <input name="email" type="email" required placeholder="Email"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <button type="submit" className="w-full rounded-md bg-[#6b2d5c] px-3 py-2 text-sm font-medium text-white">
            Send reset link
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm"><Link href="/sign-in" className="underline">Back to sign in</Link></p>
    </>
  );
}
