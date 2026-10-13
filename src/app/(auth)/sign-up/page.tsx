import Link from "next/link";
import { db } from "@/db/client";
import { enabledSocialProviders, getEnv, requiresEmailVerification, type SocialProviderId } from "@/lib/env";
import { findInvitationByToken } from "@/server/org/invitations";
import { SocialButtons } from "../social-buttons";
import { SignUpForm } from "./sign-up-form";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const invitation = invite ? await findInvitationByToken(db, invite) : null;
  const env = getEnv();
  const providers = Object.keys(enabledSocialProviders(env)) as SocialProviderId[];
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Create your account</h1>
      {invite && !invitation && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          This invitation link is invalid or has expired. Ask the owner for a new one.
        </p>
      )}
      <SignUpForm invitedEmail={invitation?.email} verificationRequired={requiresEmailVerification(env)} />
      <SocialButtons providers={providers} />
      <p className="mt-6 text-center text-sm text-neutral-600">
        Already have an account? <Link href="/sign-in" className="underline">Sign in</Link>
      </p>
    </>
  );
}
