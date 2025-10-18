'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DateTime } from 'luxon'
import { supabase } from '@/lib/supabase'
import { MAZ_TZ } from '@/lib/time'

type Signal = {
  id: number
  user_id: string
  created_at: string
  ea: string
  symbol: string
  timeframe: string
  side: 'BUY' | 'SELL'
  quality_score: number | null
  sl_suggested: number | null
  tp_suggested: number | null
  note: string | null
  status: 'OPEN' | 'CLOSED' | 'IGNORED'
  trade_id: number | null
}

const PAGE_SIZE = 50

export default function SignalsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [rows, setRows] = useState<Signal[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [cursor, setCursor] = useState<{ created_at: string; id: number } | null>(null)

  // Filtros
  const [q, setQ] = useState({
    ea: '',
    symbol: '',
    timeframe: '',
    status: '',
    from: '',
    to: '',
    side: '',
  })

  // Valores únicos (a partir de lo cargado)
  const eas = useMemo(() => Array.from(new Set(rows.map(r => r.ea))).filter(Boolean).sort(), [rows])
  const symbols = useMemo(() => Array.from(new Set(rows.map(r => r.symbol))).filter(Boolean).sort(), [rows])
  const timeframes = useMemo(() => Array.from(new Set(rows.map(r => r.timeframe))).filter(Boolean).sort(), [rows])

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      setUserId(user.id)
    })()
  }, [])

  const localFmt = (iso: string) =>
    DateTime.fromISO(iso).setZone(MAZ_TZ).toFormat('dd/LL/yy, hh:mm a').toUpperCase()

  const loadPage = async (reset = false) => {
    if (!userId || loading) return
    setLoading(true)
    try {
      let query = supabase
        .from('signals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE)

      if (q.ea) query = query.ilike('ea', `%${q.ea}%`)
      if (q.symbol) query = query.ilike('symbol', `%${q.symbol}%`)
      if (q.timeframe) query = query.ilike('timeframe', `%${q.timeframe}%`)
      if (q.status) query = query.eq('status', q.status)
      if (q.side) query = query.eq('side', q.side)

      if (q.from) query = query.gte('created_at', new Date(q.from).toISOString())
      if (q.to) {
        // incluir el final del día "to"
        const toEnd = DateTime.fromISO(q.to).endOf('day').toISO()
        if (toEnd) query = query.lte('created_at', toEnd)
      }

      if (!reset && cursor) {
        // keyset pagination: (created_at < cursor.created_at) OR (created_at = cursor.created_at AND id < cursor.id)
        const orExpr = `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
        query = query.or(orExpr)
      }

      const { data, error } = await query
      if (error) { alert(error.message); return }
      const batch = (data || []) as Signal[]
      if (reset) setRows(batch)
      else setRows(prev => [...prev, ...batch])

      if (batch.length < PAGE_SIZE) {
        setHasMore(false)
      } else {
        const last = batch[batch.length - 1]
        setCursor({ created_at: last.created_at, id: last.id })
        setHasMore(true)
      }
    } finally {
      setLoading(false)
    }
  }

  // primera carga y cada vez que cambian los filtros
  useEffect(() => {
    if (!userId) return
    setCursor(null)
    setHasMore(true)
    loadPage(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, q.ea, q.symbol, q.timeframe, q.status, q.from, q.to, q.side])

  const resetFiltros = () => {
    setQ({ ea: '', symbol: '', timeframe: '', status: '', from: '', to: '', side: '' })
  }

  const badge = (s: Signal) => {
    const base = 'px-2 py-0.5 text-xs rounded border'
    if (s.status === 'OPEN') return `${base} border-amber-500 text-amber-400`
    if (s.status === 'CLOSED') return `${base} border-emerald-500 text-emerald-400`
    return `${base} border-zinc-500 text-zinc-300`
  }

  const sideColor = (s: Signal) =>
    s.side === 'BUY' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'

  const markStatus = async (row: Signal, status: 'CLOSED' | 'IGNORED') => {
    const { error } = await supabase.from('signals').update({ status }).eq('id', row.id)
    if (error) { alert(error.message); return }
    setRows(prev => prev.map(x => x.id === row.id ? { ...x, status } : x))
  }

  const removeRow = async (row: Signal) => {
    if (!confirm(`Eliminar señal #${row.id}?`)) return
    const { error } = await supabase.from('signals').delete().eq('id', row.id)
    if (error) { alert(error.message); return }
    setRows(prev => prev.filter(x => x.id !== row.id))
  }

  const goNewTrade = (row: Signal) => {
    const params = new URLSearchParams({
      symbol: row.symbol,
      side: row.side === 'BUY' ? 'LONG' : 'SHORT',
      ea: row.ea,
      notes: row.note || ''
    }).toString()
    window.location.href = `/trades/new?${params}`
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Señales</h1>
        <Link href="/signals/new" className="px-3 py-2 bg-emerald-600 rounded text-sm">Nueva señal</Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-8 gap-2">
        <input className="bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" placeholder="EA"
          value={q.ea} onChange={(e) => setQ({ ...q, ea: e.target.value })} />
        <input className="bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" placeholder="Símbolo"
          value={q.symbol} onChange={(e) => setQ({ ...q, symbol: e.target.value })} />
        <input className="bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" placeholder="Timeframe (ej. M5)"
          value={q.timeframe} onChange={(e) => setQ({ ...q, timeframe: e.target.value })} />
        <select className="bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
          value={q.side} onChange={(e) => setQ({ ...q, side: e.target.value })}>
          <option value="">Lado</option>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
        <select className="bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
          value={q.status} onChange={(e) => setQ({ ...q, status: e.target.value })}>
          <option value="">Estado</option>
          <option value="OPEN">OPEN</option>
          <option value="CLOSED">CLOSED</option>
          <option value="IGNORED">IGNORED</option>
        </select>
        <div className="relative">
          <input type="date" className="bg-zinc-900 border border-zinc-800 p-2 rounded text-sm w-full"
            value={q.from} onChange={(e) => setQ({ ...q, from: e.target.value })} />
          <span className="absolute right-2 top-2 text-zinc-500 text-xs">Desde</span>
        </div>
        <div className="relative">
          <input type="date" className="bg-zinc-900 border border-zinc-800 p-2 rounded text-sm w-full"
            value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} />
          <span className="absolute right-2 top-2 text-zinc-500 text-xs">Hasta</span>
        </div>
        <div className="flex gap-2">
          <button onClick={resetFiltros} className="px-3 py-2 bg-zinc-800 rounded text-sm">Reset</button>
          <button onClick={() => loadPage(true)} className="px-3 py-2 bg-zinc-800 rounded text-sm">Aplicar</button>
        </div>
      </div>

      {/* Sugerencias rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        {eas.length > 0 && (
          <div>
            <div className="text-zinc-500 mb-1">EAs vistos</div>
            <div className="flex flex-wrap gap-2">
              {eas.slice(0, 12).map(s => (
                <button key={s} onClick={() => setQ(q => ({ ...q, ea: s }))}
                  className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded hover:border-zinc-600">{s}</button>
              ))}
            </div>
          </div>
        )}
        {symbols.length > 0 && (
          <div>
            <div className="text-zinc-500 mb-1">Símbolos vistos</div>
            <div className="flex flex-wrap gap-2">
              {symbols.slice(0, 12).map(s => (
                <button key={s} onClick={() => setQ(q => ({ ...q, symbol: s }))}
                  className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded hover:border-zinc-600">{s}</button>
              ))}
            </div>
          </div>
        )}
        {timeframes.length > 0 && (
          <div>
            <div className="text-zinc-500 mb-1">Timeframes vistos</div>
            <div className="flex flex-wrap gap-2">
              {timeframes.slice(0, 12).map(s => (
                <button key={s} onClick={() => setQ(q => ({ ...q, timeframe: s }))}
                  className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded hover:border-zinc-600">{s}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-zinc-900">
              {['ID', 'Fecha', 'EA', 'Símbolo', 'TF', 'Lado', 'Score', 'SL', 'TP', 'Estado', 'Nota', ''].map(h =>
                <th key={h} className="text-left p-2 border-b border-zinc-800">{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-zinc-900">
                <td className="p-2 border-b border-zinc-800">#{r.id}</td>
                <td className="p-2 border-b border-zinc-800">{localFmt(r.created_at)}</td>
                <td className="p-2 border-b border-zinc-800">{r.ea}</td>
                <td className="p-2 border-b border-zinc-800">{r.symbol}</td>
                <td className="p-2 border-b border-zinc-800">{r.timeframe}</td>
                <td className={`p-2 border-b border-zinc-800 ${sideColor(r)}`}>{r.side}</td>
                <td className="p-2 border-b border-zinc-800">{r.quality_score ?? '-'}</td>
                <td className="p-2 border-b border-zinc-800">{r.sl_suggested ?? '-'}</td>
                <td className="p-2 border-b border-zinc-800">{r.tp_suggested ?? '-'}</td>
                <td className="p-2 border-b border-zinc-800"><span className={badge(r)}>{r.status}</span></td>
                <td className="p-2 border-b border-zinc-800 max-w-[260px] truncate" title={r.note ?? ''}>{r.note ?? ''}</td>
                <td className="p-2 border-b border-zinc-800 text-right">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => goNewTrade(r)}
                      className="px-2 py-1 text-xs bg-zinc-900 border border-zinc-800 rounded hover:border-zinc-600">
                      Crear trade
                    </button>
                    {r.status !== 'CLOSED' && (
                      <button onClick={() => markStatus(r, 'CLOSED')}
                        className="px-2 py-1 text-xs bg-zinc-900 border border-zinc-800 rounded hover:border-emerald-600">
                        Cerrar
                      </button>
                    )}
                    {r.status !== 'IGNORED' && (
                      <button onClick={() => markStatus(r, 'IGNORED')}
                        className="px-2 py-1 text-xs bg-zinc-900 border border-zinc-800 rounded hover:border-zinc-600">
                        Ignorar
                      </button>
                    )}
                    <button onClick={() => removeRow(r)}
                      className="px-2 py-1 text-xs bg-zinc-900 border border-zinc-800 rounded hover:bg-rose-700 hover:text-white">
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => loadPage(false)}
          disabled={!hasMore || loading}
          className="px-4 py-2 bg-zinc-800 rounded disabled:opacity-50">
          {loading ? 'Cargando…' : hasMore ? 'Cargar más' : 'No hay más'}
        </button>
        <div className="text-xs text-zinc-500">Mostrando {rows.length} señales</div>
      </div>
    </div>
  )
}

