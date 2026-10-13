import { APP_NAME } from "@/lib/app-info";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="mb-6 text-center text-lg font-semibold text-[#6b2d5c]">{APP_NAME}</p>
        {children}
      </div>
    </main>
  );
}
