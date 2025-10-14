export default function Home() {
  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">BitLog</h1>
      <ul className="mt-3 space-y-2">
        <li><a className="underline" href="/trades">Trades</a></li>
        <li><a className="underline" href="/trades/new">Nuevo</a></li>
        <li><a className="underline" href="/import">Importar CSV</a></li>
        <li><a className="underline" href="/backup">Backups</a></li>
        <li><a className="underline" href="/login">Login</a></li>
      </ul>
    </main>
  )
}

