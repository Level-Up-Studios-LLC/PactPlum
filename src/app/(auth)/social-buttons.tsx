"use client";

import { authClient } from "@/lib/auth-client";
import type { SocialProviderId } from "@/lib/env";

const LABELS: Record<SocialProviderId, string> = {
  google: "Google",
  microsoft: "Microsoft",
  linkedin: "LinkedIn",
  slack: "Slack",
};

export function SocialButtons({ providers }: { providers: SocialProviderId[] }) {
  if (providers.length === 0) return null;
  return (
    <div className="mt-4 space-y-2">
      <p className="text-center text-xs text-neutral-500">or continue with</p>
      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
          onClick={() =>
            authClient.signIn.social({ provider, callbackURL: "/app", errorCallbackURL: "/sign-in?error=refused" })
          }
        >
          {LABELS[provider]}
        </button>
      ))}
    </div>
  );
}
