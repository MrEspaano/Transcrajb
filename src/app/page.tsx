import { Dashboard } from "@/components/dashboard";

export const dynamic = "force-dynamic";

export default function HomePage(): JSX.Element {
  return (
    <main className="page-shell">
      <Dashboard />
    </main>
  );
}
