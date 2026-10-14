import Link from "next/link";
import { APP_NAME } from "@/lib/app-info";
import { requireMember } from "@/server/auth/session";
import { SignOutButton } from "../sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireMember();
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6">
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:gap-x-6">
          <span className="font-semibold text-[#6b2d5c]">{APP_NAME}</span>
          <Link href="/app">Dashboard</Link>
          <Link href="/app/documents">Documents</Link>
          <Link href="/app/templates">Templates</Link>
          <Link href="/app/contacts">Contacts</Link>
          <Link href="/app/catalog">Catalog</Link>
          <Link href="/app/settings">Settings</Link>
        </nav>
        <div className="flex min-w-0 items-center gap-4 text-sm text-neutral-600">
          <span className="hidden max-w-48 truncate sm:inline">{user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
