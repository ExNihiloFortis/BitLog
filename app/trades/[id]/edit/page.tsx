'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DateTime } from 'luxon'
import { MAZ_TZ } from '@/lib/time'
import { sessionFromMazatlanHour } from '@/lib/time'

type Trade = {
  id:number; user_id:string; dt_utc:string; dt_close_utc:string|null;
  symbol:string; side:string; entry:number;
  sl:number|null; tp:number|null; size:number|null; commission:number|null; swap:number|null;
  pips:number|null; pnl:number|null; r_target:number|null; trend:string|null; pattern:string|null;
  session:string|null; emotion:string|null; duration_min:number|null; ea:string|null; tag:string|null; notes:string|null;
  broker:string|null; broker_trade_id:string|null; platform:string|null; close_reason:string|null;
}

const toInputLocal = (isoUTC:string|null) => {
  if (!isoUTC) return ''
  const dt = DateTime.fromISO(isoUTC).setZone(MAZ_TZ)
  return dt.isValid ? dt.toFormat("yyyy-LL-dd'T'HH:mm") : ''
}
const inputToUTC = (val:string) => {
  if (!val) return null
  const dt = DateTime.fromFormat(val, "yyyy-LL-dd'T'HH:mm", { zone: MAZ_TZ })
  return dt.isValid ? dt.toUTC().toISO() : null
}
const num = (s:string) => {
  if (s === '' || s == null) return null
  const v = Number(String(s).replace(/,/g,'.'))
  return Number.isFinite(v) ? v : null
}

export default function EditTrade() {
  const { id } = useParams<{id:string}>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [t, setT] = useState<Trade|null>(null)

  const [f, setF] = useState({
    dt_local: '',
    dt_close_local: '',
    symbol: '',
    side: 'LONG',
    entry: '',
    sl: '',
    tp: '',
    size: '',
    commission: '',
    swap: '',
    pnl: '',
    pips: '',
    r_target: '',
    trend: '',
    pattern: '',
    emotion: '',
    duration_min: '',
    ea: '',
    tag: '',
    notes: '',
    close_reason: '',
  })

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data, error } = await supabase.from('trades').select('*').eq('id', Number(id)).single()
      if (error || !data) { alert('Trade no encontrado'); router.replace('/trades'); return }

      const tr = data as Trade
      setT(tr)
      setF({
        dt_local: toInputLocal(tr.dt_utc),
        dt_close_local: toInputLocal(tr.dt_close_utc),
        symbol: tr.symbol || '',
        side: tr.side || 'LONG',
        entry: tr.entry?.toString() ?? '',
        sl: tr.sl?.toString() ?? '',
        tp: tr.tp?.toString() ?? '',
        size: tr.size?.toString() ?? '',
        commission: tr.commission?.toString() ?? '',
        swap: tr.swap?.toString() ?? '',
        pnl: tr.pnl?.toString() ?? '',
        pips: tr.pips?.toString() ?? '',
        r_target: tr.r_target?.toString() ?? '',
        trend: tr.trend ?? '',
        pattern: tr.pattern ?? '',
        emotion: tr.emotion ?? '',
        duration_min: tr.duration_min?.toString() ?? '',
        ea: tr.ea ?? '',
        tag: tr.tag ?? '',
        notes: tr.notes ?? '',
        close_reason: tr.close_reason ?? '',
      })
      setLoading(false)
    })()
  }, [id, router])

  const upd = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }))

  const save = async () => {
    if (!t) return
    setSaving(true)
    try {
      const dt_utc = inputToUTC(f.dt_local) || t.dt_utc
      const dt_close_utc = inputToUTC(f.dt_close_local)

      const patch: Partial<Trade> = {
        dt_utc,
        dt_close_utc,
        symbol: f.symbol.toUpperCase(),
        side: f.side,
        entry: Number(f.entry),
        sl: num(f.sl),
        tp: num(f.tp),
        size: num(f.size),
        commission: num(f.commission),
        swap: num(f.swap),
        pnl: num(f.pnl),
        pips: num(f.pips),
        r_target: num(f.r_target),
        trend: f.trend || null,
        pattern: f.pattern || null,
        emotion: f.emotion || null,
        duration_min: num(f.duration_min),
        ea: f.ea || 'N/A',
        tag: f.tag || null,
        notes: f.notes || null,
        close_reason: f.close_reason || null,
        session: sessionFromMazatlanHour(dt_utc!), // recalcula sesión por si cambió fecha/hora
      }

      const { error } = await supabase.from('trades').update(patch).eq('id', t.id)
      if (error) { alert(error.message); return }
      router.replace(`/trades/${t.id}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p>Cargando…</p>
  if (!t) return null

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Editar trade #{t.id}</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><label className="text-sm">Apertura (Mazatlán)</label>
          <input type="datetime-local" value={f.dt_local} onChange={upd('dt_local')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">Cierre (Mazatlán)</label>
          <input type="datetime-local" value={f.dt_close_local} onChange={upd('dt_close_local')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">Cierre (motivo)</label>
          <input value={f.close_reason} onChange={upd('close_reason')}
                 placeholder="TP / SL / Manual"
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>

        <div><label className="text-sm">Símbolo</label>
          <input value={f.symbol} onChange={upd('symbol')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">Lado</label>
          <select value={f.side} onChange={upd('side')}
                  className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm">
            <option>LONG</option><option>SHORT</option>
          </select></div>
        <div><label className="text-sm">Entrada</label>
          <input value={f.entry} onChange={upd('entry')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>

        <div><label className="text-sm">SL</label>
          <input value={f.sl} onChange={upd('sl')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">TP</label>
          <input value={f.tp} onChange={upd('tp')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">Lote</label>
          <input value={f.size} onChange={upd('size')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>

        <div><label className="text-sm">Comisión</label>
          <input value={f.commission} onChange={upd('commission')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">Swap</label>
          <input value={f.swap} onChange={upd('swap')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">P&L $</label>
          <input value={f.pnl} onChange={upd('pnl')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>

        <div><label className="text-sm">Pips</label>
          <input value={f.pips} onChange={upd('pips')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">R objetivo</label>
          <input value={f.r_target} onChange={upd('r_target')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">Duración (min, manual)</label>
          <input value={f.duration_min} onChange={upd('duration_min')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>

        <div><label className="text-sm">Tendencia</label>
          <input value={f.trend} onChange={upd('trend')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">Patrón</label>
          <input value={f.pattern} onChange={upd('pattern')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">Emoción</label>
          <input value={f.emotion} onChange={upd('emotion')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>

        <div><label className="text-sm">EA</label>
          <input value={f.ea} onChange={upd('ea')} placeholder="Semaforo ATR / EMA Cross / GoldenZone"
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">Tag</label>
          <input value={f.tag} onChange={upd('tag')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>

        <div className="md:col-span-3"><label className="text-sm">Notas</label>
          <textarea value={f.notes} onChange={upd('notes')}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm min-h-[100px]" /></div>
      </div>

      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
                className="px-4 py-2 bg-emerald-600 rounded">{saving?'Guardando…':'Guardar'}</button>
        <Link href={`/trades/${id}`} className="px-4 py-2 bg-zinc-800 rounded border border-zinc-700">Cancelar</Link>
      </div>
    </div>
  )
}

