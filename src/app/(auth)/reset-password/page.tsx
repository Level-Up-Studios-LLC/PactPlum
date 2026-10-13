"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { authClient } from "@/lib/auth-client";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState(params.get("error") ? "This reset link is invalid or has expired." : "");
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const result = await authClient.resetPassword({ newPassword: String(form.get("password")), token });
    if (result.error) setError(result.error.message ?? "Could not reset the password.");
    else setDone(true);
  }

  if (done) return <p className="text-sm">Password updated. <Link href="/sign-in" className="underline">Sign in</Link></p>;
  if (!token || error) return <p role="alert" className="text-sm text-red-600">{error || "This reset link is invalid."}</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input name="password" type="password" required minLength={8} placeholder="New password (8+ characters)"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      <button type="submit" className="w-full rounded-md bg-[#6b2d5c] px-3 py-2 text-sm font-medium text-white">
        Save new password
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Choose a new password</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </>
  );
}
