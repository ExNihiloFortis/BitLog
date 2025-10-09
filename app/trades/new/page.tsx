'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toUTC, sessionFromMazatlanHour } from '@/lib/time'

type FileItem = File & { preview?: string }

// --- compresión a JPG máx 1600px ---
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const c = document.createElement('canvas')
  const max = 1600
  let { width, height } = bitmap
  if (width > height && width > max) { height = Math.round(height * max / width); width = max }
  else if (height > max) { width = Math.round(width * max / height); height = max }
  c.width = width; c.height = height
  c.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  return await new Promise(res => c.toBlob(b => res(b!), 'image/jpeg', 0.9))
}

export default function NewTrade() {
  const [userId, setUserId] = useState<string|null>(null)
  const [files, setFiles] = useState<FileItem[]>([])
  const [form, setForm] = useState({
    dt_local: new Date().toISOString().slice(0,16),
    symbol: '', side: 'LONG',
    entry: '', sl: '', tp: '',
    size: '', commission: '', swap: '',
    pnl: '', pips: '', r_target: '',
    trend: '', pattern: '', emotion: '',
    duration_min: '', ea: '', tag: '', notes: '',
    broker: '', broker_trade_id: '', platform: 'MT5',   // ← NUEVOS
  })

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href='/login'; return }
      setUserId(user.id)
    })()
  }, [])

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const list = Array.from(e.dataTransfer.files||[])
      .filter(f=>f.type.startsWith('image/')) as FileItem[]
    list.forEach(f => (f.preview = URL.createObjectURL(f)))
    setFiles(prev=>[...prev, ...list])
  }
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const list = Array.from(e.clipboardData?.files||[])
      .filter(f=>f.type.startsWith('image/')) as FileItem[]
    list.forEach(f => (f.preview = URL.createObjectURL(f)))
    if (list.length) setFiles(prev=>[...prev, ...list])
  }
  const update = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }))

  const save = async () => {
    if (!userId) return
    if (!form.symbol || !form.entry) { alert('Símbolo y entrada son obligatorios'); return }

    const dt_utc = toUTC(form.dt_local)
    const session = sessionFromMazatlanHour(dt_utc)

    // 1) Inserta trade
    const { data: inserted, error } = await supabase
      .from('trades')
      .insert([{
        user_id: userId,
        dt_utc,
        symbol: form.symbol.toUpperCase(),
        side: form.side,
        entry: Number(form.entry),
        sl: form.sl ? Number(form.sl) : null,
        tp: form.tp ? Number(form.tp) : null,
        size: form.size ? Number(form.size) : null,
        commission: form.commission ? Number(form.commission) : null,
        swap: form.swap ? Number(form.swap) : null,
        pips: form.pips ? Number(form.pips) : null,
        pnl: form.pnl ? Number(form.pnl) : null,
        r_target: form.r_target ? Number(form.r_target) : null,
        trend: form.trend || null,
        pattern: form.pattern || null,
        session,
        emotion: form.emotion || null,
        duration_min: form.duration_min ? Number(form.duration_min) : null,
        ea: form.ea || 'N/A',
        tag: form.tag || null,
        notes: form.notes || null,
        // nuevos para anti-duplicados y trazabilidad
        broker: form.broker || null,
        broker_trade_id: form.broker_trade_id || null,
        platform: form.platform || null,
        is_manual: true,
        manual_edited_at: new Date().toISOString(),
      }])
      .select('id')
      .single()

    if (error || !inserted) { alert(error?.message || 'Error al guardar'); return }

    // 2) Sube imágenes al bucket privado `journal`
    for (const f of files) {
      try {
        const blob = await compressImage(f)
        const safeName = f.name.replace(/\s+/g,'_').replace(/[^\w.\-]/g,'')
        const path = `u_${userId}/t_${inserted.id}/${Date.now()}_${safeName.replace(/\.(png|webp)$/i,'.jpg')}`
        const up = await supabase.storage.from('journal').upload(path, blob, {
          contentType: 'image/jpeg',
          upsert: false,
        })
        if (up.error) { console.error('upload error', up.error); alert('Upload: '+up.error.message); continue }
        const ins = await supabase.from('attachments').insert([{ trade_id: inserted.id, path }])
        if (ins.error) { console.error('attach error', ins.error); alert('Attachments: '+ins.error.message) }
      } catch(e:any) {
        console.error('compress/upload exception', e); alert('Excepción: '+(e?.message||e))
      }
    }

    window.location.href = '/trades'
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nuevo trade</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><label className="text-sm">Fecha/Hora (Mazatlán)</label>
          <input type="datetime-local" className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
                 value={form.dt_local} onChange={update('dt_local')}/></div>
        <div><label className="text-sm">Símbolo</label>
          <input className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
                 value={form.symbol} onChange={update('symbol')}/></div>
        <div><label className="text-sm">Lado</label>
          <select className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
                  value={form.side} onChange={update('side')}>
            <option>LONG</option><option>SHORT</option>
          </select></div>

        <div><label className="text-sm">Entrada</label>
          <input value={form.entry} onChange={update('entry')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">SL</label>
          <input value={form.sl} onChange={update('sl')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">TP</label>
          <input value={form.tp} onChange={update('tp')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>

        <div><label className="text-sm">Lote</label>
          <input value={form.size} onChange={update('size')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">Comisión</label>
          <input value={form.commission} onChange={update('commission')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">Swap</label>
          <input value={form.swap} onChange={update('swap')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>

        <div><label className="text-sm">P&L $</label>
          <input value={form.pnl} onChange={update('pnl')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">Pips</label>
          <input value={form.pips} onChange={update('pips')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">R objetivo</label>
          <input value={form.r_target} onChange={update('r_target')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>

        <div><label className="text-sm">Tendencia</label>
          <input value={form.trend} onChange={update('trend')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">Patrón</label>
          <input value={form.pattern} onChange={update('pattern')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">Emoción</label>
          <input value={form.emotion} onChange={update('emotion')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>

        <div><label className="text-sm">Duración (min)</label>
          <input value={form.duration_min} onChange={update('duration_min')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">EA</label>
          <input value={form.ea} onChange={update('ea')} placeholder="Semaforo ATR / EMA Cross / GoldenZone"
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">Tag</label>
          <input value={form.tag} onChange={update('tag')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>

        {/* NUEVOS CAMPOS */}
        <div><label className="text-sm">Broker</label>
          <input value={form.broker} onChange={update('broker')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">Broker Trade ID</label>
          <input value={form.broker_trade_id} onChange={update('broker_trade_id')}
                 className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"/></div>
        <div><label className="text-sm">Plataforma</label>
          <select value={form.platform} onChange={update('platform')}
                  className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm">
            <option>MT5</option><option>MT4</option><option>Otro</option>
          </select></div>

        <div className="md:col-span-3"><label className="text-sm">Notas</label>
          <textarea value={form.notes} onChange={update('notes')}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm min-h-[90px]" /></div>
      </div>

      <div onDragOver={(e)=>e.preventDefault()} onDrop={onDrop} onPaste={onPaste}
           className="border border-dashed border-zinc-700 rounded p-4 text-sm bg-zinc-900">
        Arrastra o pega imágenes aquí, o elige archivos.
        <input type="file" accept="image/*" multiple className="block mt-2"
          onChange={(e)=>{
            const list = Array.from(e.target.files||[])
              .filter(f=>f.type.startsWith('image/')) as FileItem[]
            list.forEach(f => (f.preview = URL.createObjectURL(f)))
            setFiles(prev=>[...prev, ...list])
          }}/>
        {files.length>0 &&
          <div className="grid grid-cols-3 gap-2 mt-3">
            {files.map((f,i)=><img key={i} src={f.preview} className="w-full h-24 object-cover rounded border border-zinc-800" />)}
          </div>}
      </div>

      <button onClick={save} className="px-4 py-2 bg-emerald-600 rounded">Guardar</button>
    </div>
  )
}

