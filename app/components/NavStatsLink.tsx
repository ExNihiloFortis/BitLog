'use client'
import Link from 'next/link'

export default function NavStatsLink() {
  return (
    <div className="flex items-center gap-3">
      <Link href="/stats" className="px-2 py-1 rounded hover:bg-zinc-800 text-sm">
        Estadísticas
      </Link>
    </div>
  )
}

