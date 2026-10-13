import Link from "next/link";
import { enabledSocialProviders, getEnv, type SocialProviderId } from "@/lib/env";
import { SIGN_IN_REFUSED_MESSAGE } from "@/server/auth/signup-policy";
import { SocialButtons } from "../social-buttons";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const providers = Object.keys(enabledSocialProviders(getEnv())) as SocialProviderId[];
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
      <SignInForm initialError={error ? SIGN_IN_REFUSED_MESSAGE : undefined} />
      <SocialButtons providers={providers} />
      <p className="mt-6 text-center text-sm text-neutral-600">
        <Link href="/forgot-password" className="underline">Forgot password?</Link>
        {" · "}
        <Link href="/sign-up" className="underline">Create account</Link>
      </p>
    </>
  );
}
