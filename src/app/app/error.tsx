"use client";

import Link from "next/link";
import { buttonClass, secondaryButtonClass } from "./ui";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="space-y-4">
      <h1 className="text-2xl font-semibold">Something went wrong.</h1>
      <p className="text-sm text-neutral-600">The page could not be shown. Try again, or go back to the dashboard.</p>
      <div className="flex gap-2">
        <button type="button" onClick={reset} className={buttonClass}>
          Try again
        </button>
        <Link href="/app" className={`${secondaryButtonClass} inline-block`}>
          Back to the dashboard
        </Link>
      </div>
    </div>
  );
}
