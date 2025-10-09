'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DateTime } from 'luxon'
import { MAZ_TZ } from '@/lib/time'

type Row = {
  id:number; dt_utc:string; symbol:string; side:string;
  pnl:number|null; ea:string|null; session:string|null; notes:string|null
}

type SortKey = 'id'|'dt_utc'|'symbol'|'side'|'pnl'|'ea'|'session'
type SortDir = 'asc'|'desc'

const PAGE_SIZE = 50

export default function Trades() {
  const [userId, setUserId] = useState<string|null>(null)

  // datos de tabla
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [cursor, setCursor] = useState<{dt:string,id:number}|null>(null)

  // filtros
  const [q, setQ] = useState({ symbol:'', ea:'', session:'' })

  // listas globales (de toda la BD, no solo de la página cargada)
  const [allSymbols, setAllSymbols] = useState<string[]>([])
  const [allEas, setAllEas] = useState<string[]>([])

  // orden
  const [sortBy, setSortBy] = useState<SortKey>('dt_utc')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href='/login'; return }
      setUserId(user.id)
      // carga listas globales de símbolos y EAs
      await loadDistincts(user.id)
    })()
  }, [])

  const loadDistincts = async (uid: string) => {
    // Símbolos
    const { data: sym } = await supabase
      .from('trades')
      .select('symbol')
      .eq('user_id', uid)
      .not('symbol', 'is', null)
      .order('symbol', { ascending: true })
      .range(0, 4999) // defensivo
    const symbols = Array.from(new Set((sym||[]).map(r => r.symbol as string))).filter(Boolean)

    // EAs
    const { data: easData } = await supabase
      .from('trades')
      .select('ea')
      .eq('user_id', uid)
      .not('ea', 'is', null)
      .order('ea', { ascending: true })
      .range(0, 4999)
    const eas = Array.from(new Set((easData||[]).map(r => (r as any).ea as string))).filter(Boolean)

    setAllSymbols(symbols)
    setAllEas(eas)
  }

  // carga página con keyset pagination: (dt_utc,id) descendente
  const loadPage = async (reset=false) => {
    if (!userId || loading) return
    setLoading(true)
    try {
      let query = supabase.from('trades')
        .select('id,dt_utc,symbol,side,pnl,ea,session,notes')
        .eq('user_id', userId)
        .order('dt_utc', { ascending:false })
        .order('id', { ascending:false })
        .limit(PAGE_SIZE)

      if (q.symbol)  query = query.eq('symbol', q.symbol)
      if (q.ea)      query = query.eq('ea', q.ea)
      if (q.session) query = query.eq('session', q.session)

      if (!reset && cursor) {
        // keyset: (dt_utc < cursor.dt) OR (dt_utc = cursor.dt AND id < cursor.id)
        const orExpr =
          `dt_utc.lt.${cursor.dt},and(dt_utc.eq.${cursor.dt},id.lt.${cursor.id})`
        query = query.or(orExpr)
      }

      const { data, error } = await query
      if (error) { alert(error.message); return }
      const batch = (data||[]) as Row[]
      if (reset) {
        setRows(batch)
      } else {
        setRows(prev => [...prev, ...batch])
      }
      if (batch.length < PAGE_SIZE) {
        setHasMore(false)
      } else {
        const last = batch[batch.length - 1]
        setCursor({ dt: last.dt_utc, id: last.id })
        setHasMore(true)
      }
    } finally {
      setLoading(false)
    }
  }

  // primera carga y cuando cambian filtros
  useEffect(() => {
    if (!userId) return
    setCursor(null)
    setHasMore(true)
    loadPage(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, q.symbol, q.ea, q.session])

  // formato fecha
  const localFmt = (iso:string) =>
    DateTime.fromISO(iso).setZone(MAZ_TZ).toFormat('dd/LL/yy, hh:mm a').toUpperCase()

  // ordenar en cliente sobre lo cargado
  const displayRows = useMemo(() => {
    const arr = [...rows]
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a,b) => {
      let va:any = a[sortBy as keyof Row]
      let vb:any = b[sortBy as keyof Row]
      if (sortBy === 'pnl') {
        va = (va ?? 0); vb = (vb ?? 0)
        return (va - vb) * dir
      }
      if (sortBy === 'id') {
        return ((a.id) - (b.id)) * dir
      }
      if (sortBy === 'dt_utc') {
        // ISO ordena lexicográficamente correcto
        return (va < vb ? -1 : va > vb ? 1 : 0) * dir
      }
      // strings
      va = (va ?? '').toString().toUpperCase()
      vb = (vb ?? '').toString().toUpperCase()
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir
    })
    return arr
  }, [rows, sortBy, sortDir])

  // export
  const exportCSV = () => {
    const header = ['ID','Fecha (Mazatlán)','Símbolo','Lado','$ P&L','EA','Sesión','Notas']
    const lines = displayRows.map(r=>{
      const local = localFmt(r.dt_utc)
      const notes = (r.notes ?? '').replace(/"/g,'""')
      return [r.id, local, r.symbol, r.side, r.pnl??0, r.ea??'', r.session??'', `"${notes}"`].join(',')
    })
    const blob = new Blob([header.join(',')+'\n'+lines.join('\n')], {type:'text/csv'})
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'trades.csv'; a.click()
  }

  // eliminar
  const removeRow = async (r: Row) => {
    if (!confirm(`Eliminar trade #${r.id}?`)) return
    const { error } = await supabase.from('trades').delete().eq('id', r.id)
    if (error) { alert(error.message); return }
    setRows(prev => prev.filter(x => x.id !== r.id))
  }

  // UI helpers
  const thSort = (key: SortKey, label: string) => {
    const active = sortBy === key
    const arrow = !active ? '' : (sortDir === 'asc' ? '▲' : '▼')
    return (
      <th
        onClick={()=>{
          if (active) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
          else { setSortBy(key); setSortDir('asc') }
        }}
        className="text-left p-2 border-b border-zinc-800 cursor-pointer select-none"
      >
        {label} {arrow}
      </th>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Trades</h1>

      {/* barra de acciones */}
      <div className="flex flex-wrap gap-2">
        <Link href="/trades/new" className="px-3 py-2 bg-emerald-600 rounded text-sm">Nuevo</Link>
        <Link href="/import" className="px-3 py-2 bg-zinc-800 rounded text-sm border border-zinc-700">Importar CSV</Link>
        <button onClick={exportCSV} className="px-3 py-2 bg-zinc-800 rounded text-sm">Exportar CSV</button>
      </div>

      {/* filtros */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {/* Símbolo: lista de toda la BD */}
        <select
          className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
          value={q.symbol}
          onChange={(e)=>setQ({...q, symbol:e.target.value})}
        >
          <option value="">Símbolo: Todos</option>
          {allSymbols.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* EA: lista de toda la BD */}
        <select
          className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
          value={q.ea}
          onChange={(e)=>setQ({...q, ea:e.target.value})}
        >
          <option value="">EA: Todos</option>
          {allEas.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Sesión */}
        <select className="bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
                value={q.session} onChange={(e)=>setQ({...q, session:e.target.value})}>
          <option value="">Sesión: Todas</option>
          <option>Asia</option><option>London</option><option>NewYork</option>
        </select>

        {/* Limpiar filtros */}
        <button
          onClick={()=>setQ({symbol:'', ea:'', session:''})}
          className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm"
        >
          Limpiar filtros
        </button>
      </div>

      {/* tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-zinc-900">
              {thSort('id','ID')}
              {thSort('dt_utc','Fecha (Mazatlán)')}
              {thSort('symbol','Símbolo')}
              {thSort('side','Lado')}
              {thSort('pnl','$ P&L')}
              {thSort('ea','EA')}
              {thSort('session','Sesión')}
              <th className="text-left p-2 border-b border-zinc-800">Notas</th>
              <th className="text-left p-2 border-b border-zinc-800"></th>
            </tr>
          </thead>

          <tbody>
            {displayRows.map(r=>{
              const local = localFmt(r.dt_utc)
              const isWin = (r.pnl ?? 0) >= 0
              return (
                <tr key={r.id} className="hover:bg-zinc-900">
                  <td className="p-2 border-b border-zinc-800">
                    <Link href={`/trades/${r.id}`} className="underline">#{r.id}</Link>
                  </td>
                  <td className="p-2 border-b border-zinc-800">{local}</td>
                  <td className="p-2 border-b border-zinc-800">{r.symbol}</td>
                  <td className="p-2 border-b border-zinc-800">{r.side}</td>
                  <td className={`p-2 border-b border-zinc-800 ${isWin?'text-emerald-400 font-semibold':'text-rose-400 font-semibold'}`}>
                    {r.pnl ?? 0}
                  </td>
                  <td className="p-2 border-b border-zinc-800">{r.ea}</td>
                  <td className="p-2 border-b border-zinc-800">{r.session}</td>
                  <td className="p-2 border-b border-zinc-800 max-w-[280px] truncate" title={r.notes ?? ''}>
                    {r.notes ?? ''}
                  </td>
                  <td className="p-2 border-b border-zinc-800 text-right">
                    <button onClick={()=>removeRow(r)}
                            className="px-2 py-1 text-xs bg-zinc-900 border border-zinc-800 rounded hover:bg-rose-700 hover:text-white">
                      Eliminar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* paginación */}
      <div className="flex items-center gap-3">
        <button
          onClick={()=>loadPage(false)}
          disabled={!hasMore || loading}
          className="px-4 py-2 bg-zinc-800 rounded disabled:opacity-50">
          {loading ? 'Cargando…' : hasMore ? 'Cargar más' : 'No hay más'}
        </button>
        <div className="text-xs text-zinc-500">Mostrando {displayRows.length} registros</div>
      </div>
    </div>
  )
}

