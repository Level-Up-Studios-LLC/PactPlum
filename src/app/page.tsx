import { APP_NAME } from "@/lib/app-info";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-3xl font-semibold">{APP_NAME}</h1>
      <p>Open-source proposals, quotes, contracts and invoices.</p>
    </main>
  );
}
