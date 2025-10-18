'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function NewSignal() {
  const [userId, setUserId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    ea: '',
    symbol: '',
    timeframe: 'M5',
    side: 'BUY', // BUY | SELL
    quality_score: '',
    sl_suggested: '',
    tp_suggested: '',
    note: '',
  })

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      setUserId(user.id)

      // Si llegamos desde "/trades/new?ea=...&symbol=...&side=..."
      const p = new URLSearchParams(window.location.search)
      setForm(prev => ({
        ...prev,
        ea: p.get('ea') || prev.ea,
        symbol: p.get('symbol') || prev.symbol,
        side: p.get('side') === 'SHORT' ? 'SELL' : (p.get('side') ? 'BUY' : prev.side),
        note: p.get('notes') || prev.note
      }))
    })()
  }, [])

  const update = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }))

  const save = async () => {
    if (!userId) return
    if (!form.ea || !form.symbol || !form.timeframe) {
      alert('EA, Símbolo y Timeframe son obligatorios')
      return
    }
    const score = form.quality_score ? Number(form.quality_score) : null
    if (score != null && (score < 0 || score > 100)) {
      alert('Calificación debe ser 0–100')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('signals').insert([{
        user_id: userId,
        ea: form.ea,
        symbol: form.symbol.toUpperCase(),
        timeframe: form.timeframe.toUpperCase(),
        side: form.side as 'BUY'|'SELL',
        quality_score: score,
        sl_suggested: form.sl_suggested ? Number(form.sl_suggested) : null,
        tp_suggested: form.tp_suggested ? Number(form.tp_suggested) : null,
        note: form.note || null,
        status: 'OPEN'
      }])
      if (error) { alert(error.message); return }
      window.location.href = '/signals'
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Nueva señal</h1>
        <Link href="/signals" className="px-3 py-2 bg-zinc-800 rounded text-sm">Volver</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-sm">EA</label>
          <input className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
            value={form.ea} onChange={update('ea')} placeholder="Semaforo / EMAs / Fibonacci" />
        </div>
        <div>
          <label className="text-sm">Símbolo</label>
          <input className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
            value={form.symbol} onChange={update('symbol')} placeholder="BTCUSDc / XAUUSD / EURUSD" />
        </div>
        <div>
          <label className="text-sm">Timeframe</label>
          <select className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
            value={form.timeframe} onChange={update('timeframe')}>
            {['M1','M5','M15','M30','H1','H4','D1','W1'].map(tf => <option key={tf}>{tf}</option>)}
          </select>
        </div>

        <div>
          <label className="text-sm">Lado</label>
          <select className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
            value={form.side} onChange={update('side')}>
            <option value="BUY">BUY (Compra)</option>
            <option value="SELL">SELL (Venta)</option>
          </select>
        </div>

        <div>
          <label className="text-sm">Calificación (0–100)</label>
          <input type="number" min={0} max={100}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
            value={form.quality_score} onChange={update('quality_score')} placeholder="60" />
        </div>

        <div>
          <label className="text-sm">SL sugerido</label>
          <input
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
            value={form.sl_suggested} onChange={update('sl_suggested')} placeholder="Ej. 26500.5" />
        </div>

        <div>
          <label className="text-sm">TP sugerido</label>
          <input
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
            value={form.tp_suggested} onChange={update('tp_suggested')} placeholder="Ej. 26800" />
        </div>

        <div className="md:col-span-3">
          <label className="text-sm">Nota</label>
          <textarea
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm min-h-[90px]"
            value={form.note} onChange={update('note')}
            placeholder="Motivo, confluencias, etc." />
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="px-4 py-2 bg-emerald-600 rounded disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <Link href="/signals" className="px-3 py-2 bg-zinc-800 rounded text-sm">Cancelar</Link>
      </div>
    </div>
  )
}

