export const dynamic = 'force-dynamic'
export const revalidate = 0

import './globals.css';
import Link from 'next/link';
import NavStatsLink from '@/app/components/NavStatsLink'


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-black text-zinc-200">
        <nav className="px-4 py-3 border-b border-zinc-800 flex gap-4">
          <Link href="/">Dashboard</Link>
          <Link href="/trades">Trades</Link>
          <NavStatsLink />
          <Link href="/trades/new">Nuevo</Link>
          <div className="ml-auto">
            <Link href="/login">Login</Link>
          </div>
        </nav>
        <main className="p-4 max-w-6xl mx-auto">{children}</main>
      </body>
    </html>
  );
}

