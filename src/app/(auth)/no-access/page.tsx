import { SIGN_UP_MESSAGES } from "@/server/auth/signup-policy";
import { SignOutButton } from "../../sign-out-button";

export default function NoAccessPage() {
  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">No access yet</h1>
      <p className="mb-2 text-sm text-neutral-700">{SIGN_UP_MESSAGES.not_invited}</p>
      <p className="mb-4 text-sm text-neutral-700">
        If you were invited, verify your email address first, then sign in again.
      </p>
      <SignOutButton />
    </>
  );
}
