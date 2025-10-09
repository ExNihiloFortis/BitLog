import './globals.css'
import Link from 'next/link'

export const metadata = {
  title: 'BitLog',
  description: 'Journal de trading',
  manifest: '/manifest.webmanifest',
}

export const viewport = {
  themeColor: '#0b0f19',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-zinc-950 text-zinc-100">
        <header className="border-b border-zinc-800">
          <nav className="max-w-5xl mx-auto flex items-center gap-4 p-3 text-sm">
            <Link href="/">Dashboard</Link>
            <Link href="/trades">Trades</Link>
            <Link href="/trades/new">Nuevo</Link>
            <Link href="/login" className="ml-auto">Login</Link>
          </nav>
        </header>
        <main className="max-w-5xl mx-auto p-4">{children}</main>
      </body>
    </html>
  )
}

