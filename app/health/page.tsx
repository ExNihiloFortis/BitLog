export const dynamic = 'force-dynamic'; // evita que lo congelen como 404
export const revalidate = 0;

export default function HealthPage() {
  return (
    <main className="p-6">
      <h1 className="text-lg font-semibold">OK</h1>
      <p className="text-sm text-zinc-400">Health check page</p>
    </main>
  );
}

