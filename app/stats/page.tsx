'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DateTime, Duration } from 'luxon'
import { MAZ_TZ } from '@/lib/time'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

type Row = {
  id: number
  dt_utc: string
  dt_close_utc: string | null
  symbol: string
  side: 'LONG' | 'SHORT'
  pnl: number | null
  session: string | null
  close_reason: string | null
  ea: string | null
}

type Filters = {
  from: string
  to: string
  session: string
  symbol: string
}

function fmtHHMMSS(totalSeconds: number) {
  const sec = Math.max(0, Math.round(totalSeconds || 0))
  const d = Duration.fromObject({ seconds: sec }).shiftTo('hours', 'minutes', 'seconds')
  const h = String(Math.floor(d.hours)).padStart(2, '0')
  const m = String(Math.floor(d.minutes) % 60).padStart(2, '0')
  const s = String(Math.floor(d.seconds) % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']

export default function StatsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)

  const initialDates = () => {
    const now = DateTime.now().setZone(MAZ_TZ)
    return { from: now.minus({ months: 1 }).toISODate()!, to: now.toISODate()! }
  }
  const [{ from: initFrom, to: initTo }] = useState(initialDates)
  const [filters, setFilters] = useState<Filters>({ from: initFrom, to: initTo, session: '', symbol: '' })

  const [allSymbols, setAllSymbols] = useState<string[]>([])
  const [allSessions, setAllSessions] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement | null>(null)

  const loadCatalogs = async (uid: string) => {
    const { data, error } = await supabase
      .from('trades')
      .select('symbol,session')
      .eq('user_id', uid)
      .limit(10000)
    if (error) return
    const syms = Array.from(new Set((data || []).map(r => r.symbol).filter(Boolean))).sort()
    const sess = Array.from(new Set((data || []).map(r => r.session || '').filter(Boolean))).sort()
    setAllSymbols(syms)
    setAllSessions(sess)
  }

  const loadFiltered = async (uid: string) => {
    setLoading(true)
    try {
      let query = supabase
        .from('trades')
        .select('id,dt_utc,dt_close_utc,symbol,side,pnl,session,close_reason,ea')
        .eq('user_id', uid)
        .order('dt_utc', { ascending: true })
        .limit(5000)

      if (filters.from) query = query.gte('dt_utc', DateTime.fromISO(filters.from).toUTC().toISO())
      if (filters.to) query = query.lte('dt_utc', DateTime.fromISO(filters.to).endOf('day').toUTC().toISO())
      if (filters.session) query = query.eq('session', filters.session)
      if (filters.symbol) query = query.eq('symbol', filters.symbol)

      const { data, error } = await query
      if (error) { alert(error.message); return }
      setRows((data || []) as Row[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      setUserId(user.id)
      await loadCatalogs(user.id)
      await loadFiltered(user.id)
    })()
  }, [])

  const applyFilters = () => { if (userId) loadFiltered(userId) }

  const resetFilters = async () => {
    const { from, to } = initialDates()
    setFilters({ from, to, session: '', symbol: '' })
    if (userId) await loadFiltered(userId)
  }

  const {
    avgDuration, totalPnL, winRate, tradesCount,
    byWeekday, byCloseReason, bySymbolTop
  } = useMemo(() => {
    if (!rows.length) {
      return {
        avgDuration: '00:00:00',
        totalPnL: 0,
        winRate: 0,
        tradesCount: 0,
        byWeekday: [],
        byCloseReason: [],
        bySymbolTop: [],
      }
    }

    let durationSum = 0, durationCount = 0, pnlSum = 0, wins = 0
    const weekdayAgg = new Map<string, { pnl: number; wins: number; count: number }>()
    const reasonAgg = new Map<string, number>()
    const symbolAgg = new Map<string, number>()

    for (const r of rows) {
      if (r.dt_close_utc) {
        const a = DateTime.fromISO(r.dt_utc)
        const b = DateTime.fromISO(r.dt_close_utc)
        const sec = Math.max(0, b.diff(a, 'seconds').seconds || 0)
        durationSum += sec
        durationCount += 1
      }
      const pnl = r.pnl ?? 0
      pnlSum += pnl
      if (pnl > 0) wins += 1

      const wdIdx = DateTime.fromISO(r.dt_utc).setZone(MAZ_TZ).weekday % 7
      const wdName = WEEKDAYS[(wdIdx + 6) % 7]
      const cur = weekdayAgg.get(wdName) || { pnl: 0, wins: 0, count: 0 }
      cur.pnl += pnl; cur.count += 1
      if (pnl > 0) cur.wins += 1
      weekdayAgg.set(wdName, cur)

      const reason = (r.close_reason || 'N/A').toUpperCase()
      reasonAgg.set(reason, (reasonAgg.get(reason) || 0) + 1)
      symbolAgg.set(r.symbol, (symbolAgg.get(r.symbol) || 0) + pnl)
    }

    const avgDur = durationCount > 0 ? fmtHHMMSS(durationSum / durationCount) : '00:00:00'
    const wr = rows.length > 0 ? Math.round((wins / rows.length) * 100) : 0

    const weekdayData = WEEKDAYS.map(name => {
      const it = weekdayAgg.get(name) || { pnl: 0, wins: 0, count: 0 }
      return { name, pnl: Number(it.pnl.toFixed(2)), wins: it.wins, count: it.count }
    })
    const reasonData = Array.from(reasonAgg.entries()).map(([name, value]) => ({ name, value }))
    const symbolData = Array.from(symbolAgg.entries())
      .map(([name, pnl]) => ({ name, pnl: Number(pnl.toFixed(2)) }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 12)

    return {
      avgDuration: avgDur,
      totalPnL: Number(pnlSum.toFixed(2)),
      winRate: wr,
      tradesCount: rows.length,
      byWeekday: weekdayData,
      byCloseReason: reasonData,
      bySymbolTop: symbolData,
    }
  }, [rows])

  const exportPDF = async () => {
    const node = containerRef.current
    if (!node) return
    await new Promise(r => setTimeout(r, 100))
    const canvas = await html2canvas(node, {
      scale: Math.min(2, (window.devicePixelRatio || 1)),
      useCORS: true,
      backgroundColor: '#111827'
    })
    const pdf = new jsPDF('p', 'pt', 'a4')
    const imgData = canvas.toDataURL('image/png')
    const w = pdf.internal.pageSize.getWidth()
    const h = (canvas.height * w) / canvas.width
    pdf.addImage(imgData, 'PNG', 0, 0, w, h)
    pdf.save(`bitlog_stats_${DateTime.now().toFormat('yyyy-LL-dd_HH-mm')}.pdf`)
  }

  return (
    <div className="space-y-4" ref={containerRef}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Estadísticas</h1>
        <div className="flex items-center gap-2">
          <button onClick={exportPDF} className="px-3 py-2 bg-emerald-600 rounded text-sm">Exportar PDF</button>
          <button onClick={applyFilters} className="px-3 py-2 bg-zinc-800 rounded text-sm">
            {loading ? 'Cargando…' : 'Aplicar filtros'}
          </button>
          <button onClick={resetFilters} className="px-3 py-2 bg-zinc-700 rounded text-sm">
            Reset filtros
          </button>
        </div>
      </div>

      {/* FILTROS */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 bg-zinc-900 border border-zinc-800 p-3 rounded">
        {/* Desde */}
        <div>
          <div className="text-xs text-zinc-400 mb-1">Desde</div>
          <input
            type="date"
            value={filters.from}
            onChange={(e)=>setFilters(f=>({...f, from:e.target.value}))}
            className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-sm"
          />
        </div>

        {/* Hasta */}
        <div>
          <div className="text-xs text-zinc-400 mb-1">Hasta</div>
          <input
            type="date"
            value={filters.to}
            onChange={(e)=>setFilters(f=>({...f, to:e.target.value}))}
            className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-sm"
          />
        </div>

        {/* Sesión */}
        <div>
          <div className="text-xs text-zinc-400 mb-1">Sesión</div>
          <select
            value={filters.session}
            onChange={(e)=>setFilters(f=>({...f, session:e.target.value}))}
            className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-sm"
          >
            <option value="">Todas</option>
            {allSessions.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Símbolo */}
        <div className="md:col-span-3">
          <div className="text-xs text-zinc-400 mb-1">Símbolo</div>
          <select
            value={filters.symbol}
            onChange={(e)=>setFilters(f=>({...f, symbol:e.target.value}))}
            className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-sm"
          >
            <option value="">Todos</option>
            {allSymbols.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3"><div className="text-xs text-zinc-400">Trades</div><div className="text-2xl font-semibold">{tradesCount}</div></div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3"><div className="text-xs text-zinc-400">Win Rate</div><div className="text-2xl font-semibold">{winRate}%</div></div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3"><div className="text-xs text-zinc-400">P&L total</div><div className={`text-2xl font-semibold ${totalPnL>=0?'text-emerald-400':'text-rose-400'}`}>{totalPnL}</div></div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3"><div className="text-xs text-zinc-400">Duración promedio</div><div className="text-2xl font-semibold">{avgDuration}</div></div>
      </div>

      {/* P&L por día de la semana */}
      <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
        <div className="text-sm font-medium mb-2">P&L por día de la semana</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byWeekday}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name"/>
              <YAxis />
              <Tooltip />
              <Bar dataKey="pnl">
                {byWeekday.map((it, i)=>
                  <Cell key={i} fill={(it.pnl??0)>=0?'#10b981':'#ef4444'} />
                )}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Distribución de cierre */}
      <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
        <div className="text-sm font-medium mb-2">Distribución de cierre (close_reason)</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie dataKey="value" data={byCloseReason} outerRadius={100} label>
                {byCloseReason.map((_, i)=>
                  <Cell key={i} fill={['#10b981','#f59e0b','#ef4444','#3b82f6','#a855f7'][i%5]} />
                )}
              </Pie>
              <Legend /><Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* P&L por símbolo */}
      <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
        <div className="text-sm font-medium mb-2">P&L por símbolo (Top 12)</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bySymbolTop}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name"/>
              <YAxis />
              <Tooltip />
              <Bar dataKey="pnl">
                {bySymbolTop.map((it, i)=>
                  <Cell key={i} fill={(it.pnl??0)>=0?'#10b981':'#ef4444'} />
                )}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

