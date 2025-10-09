'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DateTime } from 'luxon'
import { MAZ_TZ } from '@/lib/time'

type Trade = {
  id:number; user_id:string; dt_utc:string; dt_close_utc:string|null;
  symbol:string; side:string; entry:number;
  sl:number|null; tp:number|null; size:number|null; commission:number|null; swap:number|null;
  pips:number|null; pnl:number|null; r_target:number|null; trend:string|null; pattern:string|null;
  session:string|null; emotion:string|null; duration_min:number|null; ea:string|null; tag:string|null; notes:string|null;
  broker:string|null; broker_trade_id:string|null; platform:string|null; close_reason:string|null;
}
type Pic = { path:string; url:string; created_at?:string; title?:string|null; sort_index?:number|null }

// compresión JPG máx 1600px
async function compressImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const c = document.createElement('canvas')
  const max = 1600
  let { width, height } = bmp
  if (width > height && width > max) { height = Math.round(height * max / width); width = max }
  else if (height > max) { width = Math.round(width * max / height); height = max }
  c.width = width; c.height = height
  c.getContext('2d')!.drawImage(bmp, 0, 0, width, height)
  return await new Promise(res => c.toBlob(b => res(b!), 'image/jpeg', 0.9))
}

// 00:00:00 entre dos ISO
function pad(n:number){ return String(n).padStart(2,'0') }
function hhmmss(fromISO:string, toISO:string|null) {
  if (!toISO) return null
  const a = DateTime.fromISO(fromISO)
  const b = DateTime.fromISO(toISO)
  if (!a.isValid || !b.isValid) return null
  const diff = b.diff(a, ['hours','minutes','seconds']).toObject()
  const h = Math.max(0, Math.floor(diff.hours ?? 0))
  const m = Math.max(0, Math.floor(diff.minutes ?? 0))
  const s = Math.max(0, Math.floor(diff.seconds ?? 0))
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

// Formato: Lu dd/mes/yy, hh:mm AM/PM
function fmtMazEs(iso:string|null) {
  if (!iso) return null
  const dt = DateTime.fromISO(iso).setZone(MAZ_TZ)
  if (!dt.isValid) return null
  const dias = ['Lu','Ma','Mi','Ju','Vi','Sa','Do']
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  const dia = dias[dt.weekday - 1]
  const dd = dt.toFormat('dd')
  const mes = meses[dt.month - 1]
  const yy = dt.toFormat('yy')
  const time = dt.toFormat('hh:mm a').toUpperCase()
  return `${dia} ${dd}/${mes}/${yy}, ${time}`
}

export default function TradeDetail() {
  const { id } = useParams<{id:string}>()
  const router = useRouter()
  const [trade, setTrade] = useState<Trade|null>(null)
  const [pics, setPics] = useState<Pic[]>([])
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [dragFrom, setDragFrom] = useState<number|null>(null)

  const sign = useCallback(async (path:string) => {
    const r = await supabase.storage.from('journal').createSignedUrl(path, 600)
    return r.data?.signedUrl || ''
  }, [])

  const loadAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    const { data: t, error } = await supabase
      .from('trades').select('*').eq('id', Number(id)).single()
    if (error || !t) { alert('Trade no encontrado'); router.replace('/trades'); return }
    setTrade(t as Trade)

    const { data: a } = await supabase
      .from('attachments').select('path, created_at, title, sort_index')
      .eq('trade_id', Number(id))
      .order('sort_index', { ascending: true })
      .order('created_at', { ascending: true })

    const list: Pic[] = []
    for (const it of (a||[])) {
      const url = await sign(it.path)
      if (url) list.push({ path: it.path, url, created_at: it.created_at, title: it.title, sort_index: it.sort_index })
    }
    setPics(list)
    setIdx(0)
    setLoading(false)
  }, [id, router, sign])

  useEffect(() => { loadAll() }, [loadAll])

  const persistOrder = async (arr: Pic[]) => {
    if (!trade) return
    setBusy(true)
    try {
      for (let i=0;i<arr.length;i++){
        const p = arr[i]
        await supabase.from('attachments')
          .update({ sort_index: i })
          .eq('trade_id', trade.id)
          .eq('path', p.path)
      }
    } finally { setBusy(false) }
  }

  const uploadMore = async (fs: FileList | File[] | null) => {
    if (!fs || !trade) return
    setBusy(true)
    try {
      const arr = Array.isArray(fs) ? fs : Array.from(fs)
      for (const f of arr) {
        if (!f.type || !f.type.startsWith('image/')) continue
        const blob = await compressImage(f)
        const safe = (f.name || `paste_${Date.now()}.jpg`).replace(/\s+/g,'_').replace(/[^\w.\-]/g,'')
        const path = `u_${trade.user_id}/t_${trade.id}/${Date.now()}_${safe.replace(/\.(png|webp)$/i,'.jpg')}`
        const up = await supabase.storage.from('journal').upload(path, blob, {
          contentType: 'image/jpeg', upsert: false,
        })
        if (up.error) { alert('Upload: ' + up.error.message); continue }
        const { error } = await supabase.from('attachments').insert([{ trade_id: trade.id, path, sort_index: pics.length }])
        if (error) { alert('Attachments: ' + error.message) }
      }
      await loadAll()
    } catch (e:any) {
      alert(e?.message || 'Error al subir')
    } finally {
      setBusy(false)
    }
  }

  const onPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(e.clipboardData?.files || []).filter(f => f.type && f.type.startsWith('image/'))
    if (files.length) await uploadMore(files)
  }

  const removePic = async (p: Pic) => {
    if (!trade) return
    setBusy(true)
    try {
      await supabase.storage.from('journal').remove([p.path])
      await supabase.from('attachments').delete().eq('trade_id', trade.id).eq('path', p.path)
      await loadAll()
    } catch (e:any) {
      alert(e?.message || 'Error al eliminar')
    } finally {
      setBusy(false)
    }
  }

  const saveTitle = async (p: Pic, title: string) => {
    if (!trade) return
    const { error } = await supabase.from('attachments')
      .update({ title: title || null })
      .eq('trade_id', trade.id).eq('path', p.path)
    if (error) { alert(error.message); return }
    setPics(prev => prev.map(x => x.path === p.path ? { ...x, title } : x))
  }

  // DnD
  const onDragStartThumb = (i:number) => setDragFrom(i)
  const onDragOverThumb = (e:React.DragEvent<HTMLDivElement>) => e.preventDefault()
  const onDropThumb = async (to:number) => {
    if (dragFrom === null || dragFrom === to) { setDragFrom(null); return }
    const arr = [...pics]
    const [moved] = arr.splice(dragFrom, 1)
    arr.splice(to, 0, moved)
    setDragFrom(null)
    setPics(arr)
    await persistOrder(arr)
  }

  // navegación modal con teclado
  useEffect(() => {
    if (!showModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModal(false)
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIdx(i => Math.min(pics.length - 1, i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showModal, pics.length])

  if (loading) return <p>Cargando…</p>
  if (!trade) return null

  const openedLocal = fmtMazEs(trade.dt_utc)
  const closedLocal = fmtMazEs(trade.dt_close_utc)
  const dur = hhmmss(trade.dt_utc, trade.dt_close_utc)
  const pnl = trade.pnl ?? 0
  const isWin = pnl >= 0
  const badge = isWin ? 'WINNER' : 'LOSER'
  const badgeClass = isWin ? 'bg-emerald-700 text-white' : 'bg-rose-700 text-white'
  const pnlClass = isWin ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'

  const Item = ({label, value, valueClass=''}:{label:string; value:any; valueClass?:string}) => (
    <div>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className={`font-medium ${valueClass}`}>{value ?? '-'}</div>
    </div>
  )

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Trade #{trade.id}</h1>

      <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3 bg-zinc-900 border border-zinc-800 rounded p-3">
        <div className={`absolute right-2 top-2 px-3 py-1 rounded text-xs ${badgeClass}`}>{badge}</div>

        <Item label="Apertura (Mazatlán)" value={openedLocal} />
        <Item label="Cierre (Mazatlán)" value={closedLocal} />
        <Item label="Duración (HH:MM:SS)" value={dur ?? '-'} />

        <Item label="Símbolo" value={trade.symbol} />
        <Item label="Lado" value={trade.side} />
        <Item label="EA" value={trade.ea} />
        <Item label="Entrada" value={trade.entry} />
        <Item label="SL" value={trade.sl} />
        <Item label="TP" value={trade.tp} />
        <Item label="Lote" value={trade.size} />
        <Item label="Comisión" value={trade.commission} />
        <Item label="Swap" value={trade.swap} />
        <Item label="P&L $" value={pnl} valueClass={pnlClass} />
        <Item label="Pips" value={trade.pips} />
        <Item label="R objetivo" value={trade.r_target} />
        <Item label="Tendencia" value={trade.trend} />
        <Item label="Patrón" value={trade.pattern} />
        <Item label="Sesión" value={trade.session} />
        <Item label="Emoción" value={trade.emotion} />
        <Item label="Duración (min, manual)" value={trade.duration_min} />
        <Item label="Tag" value={trade.tag} />
        <Item label="Cierre" value={trade.close_reason} />
        <Item label="Broker" value={trade.broker} />
        <Item label="Broker Trade ID" value={trade.broker_trade_id} />
        <Item label="Plataforma" value={trade.platform} />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
        <div className="text-xs text-zinc-400 mb-1">Notas</div>
        <div className="whitespace-pre-wrap">{trade.notes ?? ''}</div>
      </div>

      <div className="flex items-center gap-3">
        <Link href={`/trades/${trade.id}/edit`} className="px-3 py-2 bg-zinc-800 rounded text-sm border border-zinc-700">Editar</Link>
        <label className={`px-3 py-2 bg-emerald-600 rounded text-sm cursor-pointer ${busy?'opacity-60':''}`}>
          {busy ? 'Subiendo…' : 'Adjuntar imágenes'}
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e)=>uploadMore(e.target.files)} />
        </label>
      </div>

      <div
        onPaste={onPaste}
        className="p-3 border border-dashed border-zinc-700 rounded text-sm bg-zinc-900"
        title="Ctrl+V para pegar imágenes copiadas"
      >
        Pega aquí capturas con <b>Ctrl+V</b>.
      </div>

      <div>
        <div className="text-sm font-medium mb-2">Capturas</div>
        {pics.length === 0 ? (
          <p className="text-zinc-400 text-sm">Sin imágenes.</p>
        ) : (
          <div className="space-y-2">
            {/* visor principal */}
            <div className="relative">
              <img
                src={pics[idx].url}
                className="w-full rounded border border-zinc-800 cursor-zoom-in"
                onClick={() => setShowModal(true)}
              />
              <div className="absolute inset-y-0 left-0 flex items-center">
                <button onClick={()=>setIdx(i=>Math.max(0,i-1))} disabled={idx===0}
                  className="m-2 px-3 py-2 bg-zinc-900/70 border border-zinc-700 rounded disabled:opacity-40">{'‹'}</button>
              </div>
              <div className="absolute inset-y-0 right-0 flex items-center">
                <button onClick={()=>setIdx(i=>Math.min(pics.length-1,i+1))} disabled={idx===pics.length-1}
                  className="m-2 px-3 py-2 bg-zinc-900/70 border border-zinc-700 rounded disabled:opacity-40">{'›'}</button>
              </div>
            </div>

            {/* thumbnails con DnD + título */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {pics.map((p,i)=>(
                <div key={p.path}
                     className={`border ${i===idx?'border-emerald-500':'border-zinc-800'} rounded overflow-hidden bg-zinc-950`}
                     draggable
                     onDragStart={()=>onDragStartThumb(i)}
                     onDragOver={onDragOverThumb}
                     onDrop={()=>onDropThumb(i)}
                >
                  <img src={p.url} className="w-full cursor-pointer"
                       onClick={()=>{ setIdx(i); setShowModal(true) }} />
                  <div className="p-2 border-t border-zinc-800">
                    <input
                      defaultValue={p.title || ''}
                      placeholder="título..."
                      className="w-full bg-zinc-900 border border-zinc-800 p-1 rounded text-xs"
                      onBlur={(e)=>saveTitle(p, e.target.value)}
                      onKeyDown={(e)=>{ if (e.key==='Enter') (e.target as HTMLInputElement).blur() }}
                    />
                    <div className="mt-2 flex gap-2">
                      <button onClick={async()=>removePic(p)}
                        className="flex-1 text-xs py-1 bg-zinc-900 border border-zinc-800 rounded hover:bg-rose-700 hover:text-white">
                        Eliminar
                      </button>
                      <span className="text-[10px] text-zinc-500 self-center">#{(p.sort_index ?? i)+1}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {dragFrom !== null && (
              <div className="text-xs text-zinc-400">Soltando en nueva posición…</div>
            )}
          </div>
        )}
      </div>

      {showModal && pics.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div className="relative max-w-6xl w-full" onClick={(e)=>e.stopPropagation()}>
            <img src={pics[idx].url} className="max-h-[85vh] w-auto mx-auto rounded border border-zinc-700" />
            <button
              onClick={()=>setIdx(i=>Math.max(0,i-1))}
              disabled={idx===0}
              className="absolute left-2 top-1/2 -translate-y-1/2 px-4 py-3 bg-zinc-900/80 border border-zinc-700 rounded text-2xl disabled:opacity-40"
              aria-label="Anterior"
            >‹</button>
            <button
              onClick={()=>setIdx(i=>Math.min(pics.length-1,i+1))}
              disabled={idx===pics.length-1}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-3 bg-zinc-900/80 border border-zinc-700 rounded text-2xl disabled:opacity-40"
              aria-label="Siguiente"
            >›</button>
            <button
              onClick={()=>setShowModal(false)}
              className="absolute right-2 top-2 px-3 py-1 bg-zinc-900/80 border border-zinc-700 rounded"
              aria-label="Cerrar"
            >Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}

