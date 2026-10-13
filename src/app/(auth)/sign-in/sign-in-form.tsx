"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [error, setError] = useState(initialError ?? "");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Sign-in failed.");
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="sign-in-email" className="block text-sm font-medium">Email</label>
        <input id="sign-in-email" name="email" type="email" required autoComplete="email" placeholder="Email"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      <div className="space-y-1">
        <label htmlFor="sign-in-password" className="block text-sm font-medium">Password</label>
        <input id="sign-in-password" name="password" type="password" required autoComplete="current-password" placeholder="Password"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending}
        className="w-full rounded-md bg-[#6b2d5c] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
