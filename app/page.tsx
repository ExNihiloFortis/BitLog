// app/page.tsx
export const dynamic = 'force-dynamic'
export default function Home() {
  return (
    <main style={{ padding: 20 }}>
      <h1>BitLog</h1>
      <p>Deployment OK ✅</p>
      <ul>
        <li><a href="/trades">Trades</a></li>
        <li><a href="/trades/new">Nuevo Trade</a></li>
        <li><a href="/import">Importar CSV</a></li>
        <li><a href="/backup">Backup API</a></li>
        <li><a href="/health">Health</a></li>
      </ul>
    </main>
  )
}
