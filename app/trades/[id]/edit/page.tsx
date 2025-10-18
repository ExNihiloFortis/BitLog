'use client'
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { DateTime } from 'luxon'
import { MAZ_TZ } from '@/lib/time'
import { supabase } from '@/lib/supabase-browser'

type Side = 'BUY'|'SELL'|''

/** ===== Util: comprimir imagen a JPG max 1600px ===== */
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

/** ===== UI helpers ===== */
function Field({ label, children }: {label:string; children:React.ReactNode}) {
  return (
    <div>
      <div className="text-xs text-zinc-400 mb-1">{label}</div>
      {children}
    </div>
  )
}

type Suggest = { id?:number; name:string; source:'preset'|'seen' }

/** === Combo simple (input + flecha + dropdown) === */
function Combo({
  value, setValue,
  options, placeholder,
  isOpen, setIsOpen,
  onSelect,
}: {
  value: string
  setValue: (s:string)=>void
  options: string[]
  placeholder?: string
  isOpen: boolean
  setIsOpen: (b:boolean)=>void
  onSelect?: (name:string)=>void
}) {
  const boxRef = useRef<HTMLDivElement|null>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!boxRef.current) return
      if (!boxRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [setIsOpen])

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.toLowerCase().includes(q))
  }, [options, value])

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex">
        <input
          value={value}
          onChange={(e)=>setValue(e.target.value)}
          onFocus={()=>setIsOpen(true)}
          className="flex-1 bg-zinc-900 border border-zinc-800 p-2 rounded-l text-sm"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={()=>setIsOpen(!isOpen)}
          className="px-3 bg-zinc-900 border border-l-0 border-zinc-800 rounded-r text-sm"
          aria-label="Mostrar opciones"
          title="Mostrar opciones"
        >▾</button>
      </div>

      {isOpen && (
        <div className="absolute z-20 mt-1 max-h-56 overflow-auto bg-zinc-950 border border-zinc-800 rounded text-sm w-full shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-2 py-2 text-zinc-500 text-[12px]">Sin opciones</div>
          ) : filtered.map((name) => (
            <button
              key={name}
              className="w-full text-left px-2 py-1 hover:bg-zinc-800"
              onMouseDown={()=>{
                setValue(name)
                setIsOpen(false)
                onSelect?.(name)
              }}
            >{name}</button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function EditTradePage() {
  const router = useRouter()
  const params = useParams() as { id: string }
  const tradeId = Number(params?.id)
  const [userId, setUserId] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)

  // ====== Campos base ======
  const [dtOpen, setDtOpen] = useState<string>('')     // se rellenan al cargar
  const [dtClose, setDtClose] = useState<string>('')

  const [symbol, setSymbol] = useState('')
  const [side, setSide] = useState<Side>('')           // UI BUY/SELL
  const [entry, setEntry] = useState<number|''>('')
  const [sl, setSl] = useState<number|''>('')
  const [tp, setTp] = useState<number|''>('')
  const [size, setSize] = useState<number|''>('')
  const [commission, setCommission] = useState<number|''>('')
  const [swap, setSwap] = useState<number|''>('')
  const [pips, setPips] = useState<number|''>('')
  const [pnl, setPnl] = useState<number|''>('')
  const [rTarget, setRTarget] = useState<number|''>('')

  const [trend, setTrend] = useState('')
  const [pattern, setPattern] = useState('')
  const [session, setSession] = useState('')
  const [emotion, setEmotion] = useState('')
  const [durationMin, setDurationMin] = useState<number|''>('')
  const [tag, setTag] = useState('')
  const [closeReason, setCloseReason] = useState('')

  const [broker, setBroker] = useState('')
  const [brokerTradeId, setBrokerTradeId] = useState('')
  const [platform, setPlatform] = useState('')
  const [notes, setNotes] = useState('')

  // ====== EA ======
  const [ea, setEa] = useState('')
  const [eaTimeframe, setEaTimeframe] = useState('')
  const [eaSide, setEaSide] = useState<'BUY'|'SELL'|''>('')
  const [eaQuality, setEaQuality] = useState<number|''>('')
  const [eaSL, setEaSL] = useState<number|''>('')
  const [eaTP, setEaTP] = useState<number|''>('')
  const [eaNote, setEaNote] = useState('')

  const [eaPresets, setEaPresets] = useState<Suggest[]>([])
  const [seenEAs, setSeenEAs] = useState<Suggest[]>([])
  const [showEaList, setShowEaList] = useState(false)

  // Símbolos sugeridos
  const [symbols, setSymbols] = useState<string[]>([])
  const [showSymbolList, setShowSymbolList] = useState(false)

  // Patrones (solo presets del usuario)
  const [patternPresets, setPatternPresets] = useState<string[]>([])
  const [openPatternDrop, setOpenPatternDrop] = useState(false)

  // Timeframes
  const TF_DEFAULTS = ['M1','M5','M10','M15','M30','H1','H4','D1','W1'] as const
  const [tfOptions, setTfOptions] = useState<string[]>([...TF_DEFAULTS])
  const [tfNew, setTfNew] = useState('')

  // Adjuntos (mantenemos igual la UI, no re-subimos si no cambias)
  const [busyUpload, setBusyUpload] = useState(false)
  const [stagedPics, setStagedPics] = useState<File[]>([])

  // Emojis emoción
  const EMOJIS = [
    '😄','🤣','😍','🤩','🤪','☹️','🤬','🤡','🥱','😫','🥳','🤯','😵‍💫','😵','🥴',
    '😭','😱','😖','😰','😳','😯','😴','🤑','🔥','💪','🚀'
  ]
  const [showEmoji, setShowEmoji] = useState(false)

  // ====== Cargar usuario + presets + TRADE ======
  useEffect(() => {
    (async ()=>{
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href='/login'; return }
      setUserId(user.id)

      // presets EA
      const { data: p } = await supabase.from('ea_presets').select('id,name').order('name', { ascending:true })
      setEaPresets((p||[]).map((x:any)=>({ id:x.id, name:x.name, source:'preset' })) as Suggest[])

      // distinct EAs vistos
      const { data: d1 } = await supabase
        .from('trades')
        .select('ea')
        .not('ea', 'is', null)
        .order('ea', { ascending:true })
        .limit(1000)
      const seenEA = Array.from(new Set((d1||[]).map((r:any)=>r.ea as string).filter(Boolean)))
      setSeenEAs(seenEA.map(n=>({ name:n, source:'seen' })))

      // distinct symbols
      const { data: d2 } = await supabase
        .from('trades')
        .select('symbol')
        .order('symbol', { ascending:true })
        .limit(1000)
      const syms = Array.from(new Set((d2||[]).map((r:any)=>r.symbol as string).filter(Boolean)))
      setSymbols(syms)

      // patrones del usuario
      const { data: pp } = await supabase
        .from('pattern_presets')
        .select('name')
        .eq('user_id', user.id)
        .order('name', { ascending: true })
      setPatternPresets((pp || []).map((x:any)=>x.name))

      // timeframes del usuario + defaults
      try {
        const { data: tfs, error: tfErr } = await supabase
          .from('timeframe_presets')
          .select('name')
          .eq('user_id', user.id)
          .order('name', { ascending: true })
        if (!tfErr) {
          const userList = (tfs || []).map(r => (r.name || '').trim()).filter(Boolean)
          const uniq = Array.from(
            new Map([...TF_DEFAULTS, ...userList].map(n => [n.toLowerCase(), n])).values()
          )
          setTfOptions(uniq)
        } else {
          setTfOptions([...TF_DEFAULTS])
        }
      } catch {
        setTfOptions([...TF_DEFAULTS])
      }

      // === CARGAR TRADE POR ID ===
      const { data: t, error } = await supabase
        .from('trades')
        .select('*')
        .eq('id', tradeId)
        .single()
      if (error || !t) { alert('No se pudo cargar el trade'); router.replace('/trades'); return }

      // Mapear fechas UTC -> Mazatlán (inputs datetime-local)
      const dtLocal = (isoUtc:string|null) =>
        isoUtc ? DateTime.fromISO(isoUtc).setZone(MAZ_TZ).toISO({ suppressMilliseconds:true }) : ''

      setDtOpen(dtLocal(t.dt_utc) || '')
      setDtClose(dtLocal(t.dt_close_utc) || '')

      // Mapear side LONG/SHORT -> BUY/SELL (UI)
      const uiSide: Side = t.side === 'LONG' ? 'BUY' : (t.side === 'SHORT' ? 'SELL' : '')
      setSide(uiSide)

      // Rellenar demás campos
      setSymbol(t.symbol ?? '')
      setEntry(t.entry ?? '')
      setSl(t.sl ?? '')
      setTp(t.tp ?? '')
      setSize(t.size ?? '')
      setCommission(t.commission ?? '')
      setSwap(t.swap ?? '')
      setPips(t.pips ?? '')
      setPnl(t.pnl ?? '')
      setRTarget(t.r_target ?? '')

      setTrend(t.trend ?? '')
      setPattern(t.pattern ?? '')
      setSession(t.session ?? '')
      setEmotion(t.emotion ?? '')
      setDurationMin(t.duration_min ?? '')
      setTag(t.tag ?? '')
      setCloseReason(t.close_reason ?? '')

      setBroker(t.broker ?? '')
      setBrokerTradeId(t.broker_trade_id ?? '')
      setPlatform(t.platform ?? '')
      setNotes(t.notes ?? '')

      // EA
      setEa(t.ea ?? '')
      setEaTimeframe(t.ea_timeframe ?? '')
      setEaSide((t.ea_side as 'BUY'|'SELL'|null) ?? '')
      setEaQuality(t.ea_quality ?? '')
      setEaSL(t.ea_sl_suggested ?? '')
      setEaTP(t.ea_tp_suggested ?? '')
      setEaNote(t.ea_note ?? '')

      setLoading(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId])

  const eaOptions = useMemo(() => {
    const all = [...eaPresets, ...seenEAs]
    const map = new Map<string, Suggest>()
    for (const o of all) if (!map.has(o.name.toLowerCase())) map.set(o.name.toLowerCase(), o)
    return Array.from(map.values()).sort((a,b)=>a.name.localeCompare(b.name))
  }, [eaPresets, seenEAs])

  const patternOptions = useMemo(() => {
    return [...new Set(patternPresets)].sort((a,b)=>a.localeCompare(b))
  }, [patternPresets])

  const onPickSymbol = (name:string) => { setSymbol(name); setShowSymbolList(false) }

  // --- EA presets (idéntico a new) ---
  const savePresetEA = async () => {
    const name = ea.trim()
    if (!name) return
    if (eaPresets.some(p=>p.name.toLowerCase()===name.toLowerCase())) return
    const { error, data } = await supabase
      .from('ea_presets')
      .insert([{ name, user_id: userId }])
      .select('id,name')
      .single()
    if (error) { alert(error.message); return }
    setEaPresets(prev => [...prev, { id:data!.id, name:data!.name, source:'preset' }])
  }
  const removePresetEA = async () => {
    const name = ea.trim()
    if (!name) return
    const p = eaPresets.find(x=>x.name.toLowerCase()===name.toLowerCase())
    if (!p?.id) { alert('Ese EA no es preset o no tiene id. Puedes borrar desde /ea/presets'); return }
    if (!confirm(`Eliminar preset "${p.name}"?`)) return
    const { error } = await supabase.from('ea_presets').delete().eq('id', p.id)
    if (error) { alert(error.message); return }
    setEaPresets(prev => prev.filter(x=>x.id!==p.id))
  }

  // --- Patrones (igual que new) ---
  const savePresetPattern = async () => {
    const name = (pattern || '').trim()
    if (!name || !userId) return
    if (patternOptions.some(p=>p.toLowerCase()===name.toLowerCase())) {
      alert('Ya existe en tus presets'); return
    }
    const { error, data } = await supabase
      .from('pattern_presets')
      .insert([{ name, user_id: userId }])
      .select('name')
      .single()
    if (error) { alert(error.message); return }
    setPatternPresets(prev => [...prev, data!.name])
  }
  const removePresetPattern = async () => {
    const name = pattern.trim()
    if (!name || !userId) return
    if (!confirm(`Eliminar preset de patrón "${name}"?`)) return
    const { error } = await supabase
      .from('pattern_presets')
      .delete()
      .eq('user_id', userId)
      .ilike('name', name)
    if (error) { alert(error.message); return }
    setPatternPresets(prev => prev.filter(x => x.toLowerCase() !== name.toLowerCase()))
  }

  // --- Timeframe (igual que new) ---
  const savePresetTF = async () => {
    if (!userId) return
    const name = tfNew.trim()
    if (!name) return
    if (tfOptions.some(x => x.toLowerCase() === name.toLowerCase())) {
      alert('Ese timeframe ya existe'); return
    }
    const { error } = await supabase
      .from('timeframe_presets')
      .insert([{ user_id: userId, name }])
    if (error) { alert(error.message); return }
    setTfOptions(prev => {
      const map = new Map(prev.map(n => [n.toLowerCase(), n]))
      map.set(name.toLowerCase(), name)
      return Array.from(map.values()).sort((a,b)=>a.localeCompare(b))
    })
    setTfNew('')
  }
  const removePresetTF = async (targetName?: string) => {
    if (!userId) return
    const target = (targetName ?? eaTimeframe).trim()
    if (!target) return
    if (!confirm(`Eliminar timeframe "${target}"?`)) return
    const isDefault = (TF_DEFAULTS as readonly string[]).some(d => d.toLowerCase() === target.toLowerCase())
    if (!isDefault) {
      const { error } = await supabase
        .from('timeframe_presets')
        .delete()
        .eq('user_id', userId)
        .ilike('name', target)
      if (error) { alert(error.message); return }
    }
    setTfOptions(prev => {
      const next = prev.filter(n => n.toLowerCase() !== target.toLowerCase())
      const ensureDefaults = Array.from(
        new Map([...next, ...TF_DEFAULTS].map(n => [n.toLowerCase(), n])).values()
      )
      return ensureDefaults.sort((a,b)=>a.localeCompare(b))
    })
    if (eaTimeframe.toLowerCase() === target.toLowerCase()) setEaTimeframe('')
  }

  // ====== Staging de imágenes (igual) ======
  const addFiles = async (fs: FileList | File[] | null) => {
    if (!fs) return
    const arr = Array.isArray(fs) ? fs : Array.from(fs)
    const imgs = arr.filter(f => f.type?.startsWith('image/'))
    if (!imgs.length) return
    setStagedPics(prev => [...prev, ...imgs])
  }
  const onPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(e.clipboardData?.files || []).filter(f => f.type && f.type.startsWith('image/'))
    if (files.length) await addFiles(files)
  }
  const removeStaged = (i:number) => {
    setStagedPics(prev => prev.filter((_,idx)=>idx!==i))
  }

  // ====== Guardar (UPDATE) ======
  const submit = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const toNumOrNull = (v:any) => (v==='' || v===null ? null : Number(v))
      const toISOorNullUTC = (isoLocal:string) => isoLocal ? DateTime.fromISO(isoLocal).toUTC().toISO() : null

      // --- Normalizaciones / validaciones (idéntico a new) ---
      const SIDE_ALLOWED = ['BUY','SELL'] as const

      const symbolNorm = (symbol || '').trim().toUpperCase()
      if (!symbolNorm) { alert('Falta el símbolo (obligatorio).'); return }

      const sideNormRaw = (side || '').trim().toUpperCase()
      if (!SIDE_ALLOWED.includes(sideNormRaw as any)) {
        alert('Selecciona LADO: BUY o SELL (obligatorio).'); return
      }
      // La BD espera LONG/SHORT por el CHECK actual
      const sideDb = sideNormRaw === 'BUY' ? 'LONG' : 'SHORT';

      const entryNum = Number(entry)
      if (!Number.isFinite(entryNum)) { alert('Falta el precio de ENTRADA (obligatorio).'); return }

      // EA
      const hasEA = !!(ea || '').trim()
      const EA_SIDE_ALLOWED = ['BUY','SELL'] as const
      let eaSideDb: 'BUY'|'SELL'|null = null
      if (hasEA) {
        const raw = (eaSide || '').trim().toUpperCase()
        if (!EA_SIDE_ALLOWED.includes(raw as any)) {
          alert('Si capturas un EA, debes elegir Lado (EA): BUY o SELL.'); return
        }
        eaSideDb = raw as 'BUY'|'SELL'
      }
      const eaTimeframeDb = hasEA ? (eaTimeframe || null) : null

      const updatePayload:any = {
        dt_utc: toISOorNullUTC(dtOpen),
        dt_close_utc: toISOorNullUTC(dtClose),

        side: sideDb,
        symbol: symbolNorm,
        entry: entryNum,
        sl: toNumOrNull(sl),
        tp: toNumOrNull(tp),
        size: toNumOrNull(size),
        commission: toNumOrNull(commission),
        swap: toNumOrNull(swap),
        pips: toNumOrNull(pips),
        pnl: toNumOrNull(pnl),
        r_target: toNumOrNull(rTarget),

        trend: trend || null,
        pattern: pattern || null,
        session: session || null,
        emotion: emotion || null,
        duration_min: toNumOrNull(durationMin),
        tag: tag || null,
        close_reason: closeReason || null,

        broker: broker || null,
        broker_trade_id: brokerTradeId || null,
        platform: platform || null,

        // EA
        ea: hasEA ? ea : null,
        ea_timeframe: eaTimeframeDb,
        ea_side: eaSideDb,
        ea_quality: eaQuality==='' ? null : Number(eaQuality),
        ea_sl_suggested: toNumOrNull(eaSL),
        ea_tp_suggested: toNumOrNull(eaTP),
        ea_note: eaNote || null,

        // Notas del trade
        notes: notes || null,
      }

      const upd = await supabase.from('trades')
        .update(updatePayload)
        .eq('id', tradeId)
        .select('id')
        .single()

      if (upd.error) { alert(upd.error.message || 'No se pudo guardar'); return }

      // (Opcional) subir nuevas imágenes si agregaste en edición
      if (stagedPics.length) {
        setBusyUpload(true)
        let order = 0
        // Necesitamos el user_id del trade (consulta rápida)
        const { data: t } = await supabase.from('trades').select('user_id').eq('id', tradeId).single()
        const uid = t?.user_id as string
        for (const f of stagedPics) {
          try {
            const blob = await compressImage(f)
            const safe = (f.name || `new_${Date.now()}.jpg`).replace(/\s+/g,'_').replace(/[^\w.\-]/g,'')
            const path = `u_${uid}/t_${tradeId}/${Date.now()}_${safe.replace(/\.(png|webp)$/i,'.jpg')}`
            const up = await supabase.storage.from('journal').upload(path, blob, {
              contentType: 'image/jpeg', upsert: false,
            })
            if (up.error) { console.warn('Upload error', up.error.message); continue }
            await supabase.from('attachments').insert([{ trade_id: tradeId, path, sort_index: order++ }])
          } catch (e:any) {
            console.warn('Adjunto error', e?.message)
          }
        }
        setBusyUpload(false)
      }

      router.replace(`/trades/${tradeId}`)
    } finally {
      setLoading(false)
    }
  }, [
    userId, tradeId, dtOpen, dtClose, symbol, side, entry, sl, tp, size, commission, swap, pips, pnl, rTarget,
    trend, pattern, session, emotion, durationMin, tag, closeReason, broker, brokerTradeId, platform,
    ea, eaTimeframe, eaSide, eaQuality, eaSL, eaTP, eaNote, notes, stagedPics, router
  ])

  if (loading) return <p>Cargando…</p>

  // === A PARTIR DE AQUÍ, LA MISMA UI DE "NEW" (sin cambios de estructura) ===
  return (
    <div className="space-y-4" onPaste={onPaste}>
      <h1 className="text-xl font-semibold">Editar Trade #{tradeId}</h1>

      {/* ====== Bloque 1: Tiempos y básicos ====== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-zinc-900 border border-zinc-800 rounded p-3">
        <Field label="Apertura (Mazatlán)">
          <input type="datetime-local" value={dtOpen} onChange={(e)=>setDtOpen(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
        </Field>
        <Field label="Cierre (Mazatlán)">
          <input type="datetime-local" value={dtClose} onChange={(e)=>setDtClose(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
        </Field>

        {/* Símbolo */}
        <div className="relative">
          <div className="text-xs text-zinc-400 mb-1">Símbolo</div>
          <input
            value={symbol}
            onChange={(e)=>setSymbol(e.target.value)}
            onFocus={()=>setShowSymbolList(true)}
            onBlur={()=>setTimeout(()=>setShowSymbolList(false),100)}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
            placeholder="BTCUSD / EURUSD…"
            required
          />
          {showSymbolList && symbols.length>0 && (
            <div className="absolute z-10 mt-1 max-h-56 overflow-auto bg-zinc-950 border border-zinc-800 rounded text-sm w-full">
              {symbols.map(s=>(
                <button key={s} className="w-full text-left px-2 py-1 hover:bg-zinc-800"
                  onMouseDown={()=>onPickSymbol(s)}>{s}</button>
              ))}
              <div className="px-2 py-1 text-[11px] text-zinc-500 border-t border-zinc-800">Escribe para nuevo símbolo…</div>
            </div>
          )}
        </div>

        {/* Lado */}
        <Field label="Lado">
          <select
            value={side}
            onChange={(e)=>setSide(e.target.value as Side)}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
            required
          >
            <option value="">—</option>
            <option>BUY</option>
            <option>SELL</option>
          </select>
        </Field>

        <Field label="Entrada">
          <input
            type="number"
            value={entry as any}
            onChange={(e)=>setEntry(e.target.value===''? '' : Number(e.target.value))}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
            required step="any" placeholder="Precio de entrada"
          />
        </Field>

        <Field label="SL">
          <input type="number" value={sl as any} onChange={(e)=>setSl(e.target.value===''? '' : Number(e.target.value))}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
        </Field>
        <Field label="TP">
          <input type="number" value={tp as any} onChange={(e)=>setTp(e.target.value===''? '' : Number(e.target.value))}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
        </Field>
        <Field label="Lote">
          <input type="number" value={size as any} onChange={(e)=>setSize(e.target.value===''? '' : Number(e.target.value))}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
        </Field>

        <Field label="Comisión">
          <input type="number" value={commission as any} onChange={(e)=>setCommission(e.target.value===''? '' : Number(e.target.value))}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
        </Field>
        <Field label="Swap">
          <input type="number" value={swap as any} onChange={(e)=>setSwap(e.target.value===''? '' : Number(e.target.value))}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
        </Field>
        <Field label="Pips">
          <input type="number" value={pips as any} onChange={(e)=>setPips(e.target.value===''? '' : Number(e.target.value))}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
        </Field>
        <Field label="$ P&L">
          <input type="number" value={pnl as any} onChange={(e)=>setPnl(e.target.value===''? '' : Number(e.target.value))}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
        </Field>

        <Field label="R objetivo">
          <input type="number" value={rTarget as any} onChange={(e)=>setRTarget(e.target.value===''? '' : Number(e.target.value))}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
        </Field>

        {/* Tendencia */}
        <Field label="Tendencia">
          <select
            value={trend}
            onChange={(e)=>setTrend(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
          >
            <option value="">—</option>
            <option value="alcista">Alcista</option>
            <option value="bajista">Bajista</option>
            <option value="lateral">Lateral</option>
          </select>
        </Field>

        {/* Patrón */}
        <Field label="Patrón">
          <>
            <Combo
              value={pattern}
              setValue={setPattern}
              options={patternOptions}
              placeholder="triángulo, bandera, canal…"
              isOpen={openPatternDrop}
              setIsOpen={setOpenPatternDrop}
            />
            <div className="mt-2 flex items-center gap-2">
              <button onClick={savePresetPattern} className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded">
                Guardar patrón
              </button>
              <button onClick={removePresetPattern} className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded">
                Eliminar patrón
              </button>
            </div>
          </>
        </Field>

        <Field label="Sesión">
          <select value={session} onChange={(e)=>setSession(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm">
            <option value="">—</option>
            <option>Asia</option>
            <option>London</option>
            <option>NewYork</option>
          </select>
        </Field>

        <div className="relative">
          <div className="text-xs text-zinc-400 mb-1">Emoción</div>
          <div className="flex gap-2">
            <input value={emotion} onChange={(e)=>setEmotion(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" placeholder="😄 / texto…" />
            <button type="button"
              onClick={()=>setShowEmoji(v=>!v)}
              className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm">😊</button>
          </div>
          {showEmoji && (
            <div className="absolute z-10 mt-1 bg-zinc-950 border border-zinc-800 rounded p-2 max-w-[260px]">
              <div className="grid grid-cols-8 gap-1">
                {EMOJIS.map((e, i)=>(
                  <button
                    key={`emoji-${i}`}
                    className="px-1 py-1 hover:bg-zinc-800 rounded"
                    onMouseDown={() => { setEmotion(e); setShowEmoji(false) }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <Field label="Duración (min, manual)">
          <input type="number" value={durationMin as any}
            onChange={(e)=>setDurationMin(e.target.value===''? '' : Number(e.target.value))}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
        </Field>
        <Field label="Tag">
          <input value={tag} onChange={(e)=>setTag(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
        </Field>
        <Field label="Cierre">
          <input value={closeReason} onChange={(e)=>setCloseReason(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
        </Field>

        <Field label="Broker">
          <input value={broker} onChange={(e)=>setBroker(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
        </Field>
        <Field label="Broker Trade ID">
          <input value={brokerTradeId} onChange={(e)=>setBrokerTradeId(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
        </Field>
        <Field label="Plataforma">
          <input value={platform} onChange={(e)=>setPlatform(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
        </Field>
      </div>

      {/* ====== EA ====== */}
      <div className="bg-zinc-900 border border-zinc-800 rounded p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Datos del EA (opcional)</div>
          <Link href="/ea/presets" className="text-xs underline">Gestionar EAs</Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Nombre del EA */}
          <div className="relative">
            <div className="text-xs text-zinc-400 mb-1">EA</div>
            <input
              value={ea}
              onChange={(e)=>setEa(e.target.value)}
              onFocus={()=>setShowEaList(true)}
              onBlur={()=>setTimeout(()=>setShowEaList(false),100)}
              className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
              placeholder="p.ej. GoldenZone"
            />
            {showEaList && eaOptions.length>0 && (
              <div className="absolute z-10 mt-1 max-h-56 overflow-auto bg-zinc-950 border border-zinc-800 rounded text-sm w-full">
                {eaOptions.map(opt=>(
                  <button key={`${opt.source}:${opt.id ?? opt.name}`}
                          className="w-full text-left px-2 py-1 hover:bg-zinc-800 flex justify-between"
                          onMouseDown={()=>{ setEa(opt.name); setShowEaList(false) }}>
                    <span>{opt.name}</span>
                    <span className="text-[10px] text-zinc-500">{opt.source==='preset'?'preset':'visto'}</span>
                  </button>
                ))}
                <div className="px-2 py-1 text-[11px] text-zinc-500 border-t border-zinc-800">Escribe para nuevo EA…</div>
              </div>
            )}
          </div>

          {/* Timeframe (EA): select + añadir/quitar */}
          <div className="md:col-span-2">
            <Field label="Timeframe (EA)">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={eaTimeframe}
                  onChange={(e)=>setEaTimeframe(e.target.value)}
                  className="min-w-[120px] flex-1 bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
                >
                  <option value="">—</option>
                  {tfOptions.map(tf => (
                    <option key={tf} value={tf}>{tf}</option>
                  ))}
                </select>

                <input
                  value={tfNew}
                  onChange={(e)=>setTfNew(e.target.value)}
                  placeholder="Agregar (p.ej. H2)"
                  className="w-28 sm:w-36 bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
                />

                <button
                  type="button"
                  onClick={savePresetTF}
                  className="shrink-0 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs"
                  title="Añadir timeframe"
                >
                  Añadir
                </button>

                <button
                  type="button"
                  onClick={()=>removePresetTF()}
                  className="shrink-0 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs disabled:opacity-50"
                  disabled={!eaTimeframe}
                  title="Eliminar este timeframe de mis presets"
                >
                  Quitar
                </button>
              </div>
            </Field>
          </div>

          {/* Lado (EA) */}
          <Field label="Lado (EA)">
            <select value={eaSide} onChange={(e)=>setEaSide(e.target.value as any)}
              className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm">
              <option value="">—</option>
              <option>BUY</option>
              <option>SELL</option>
            </select>
          </Field>

          {/* Calificación */}
          <Field label="Calificación (0–100)">
            <input type="number" min={0} max={100} value={eaQuality as any}
              onChange={(e)=>setEaQuality(e.target.value===''? '' : Math.max(0, Math.min(100, Number(e.target.value))))}
              className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
          </Field>

          {/* SL sugerido */}
          <Field label="SL sugerido">
            <input type="number" value={eaSL as any}
              onChange={(e)=>setEaSL(e.target.value===''? '' : Number(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
          </Field>

          {/* TP sugerido */}
          <Field label="TP sugerido">
            <input type="number" value={eaTP as any}
              onChange={(e)=>setEaTP(e.target.value===''? '' : Number(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
          </Field>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={savePresetEA} className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded">
            Guardar como preset
          </button>
          <button onClick={removePresetEA} className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded">
            Eliminar preset actual
          </button>
        </div>

        <Field label="Nota del EA">
          <textarea value={eaNote} onChange={(e)=>setEaNote(e.target.value)}
            className="w-full min-h-[70px] bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
        </Field>
      </div>

      {/* ====== Notas ====== */}
      <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
        <div className="text-xs text-zinc-400 mb-1">Notas</div>
        <textarea value={notes} onChange={(e)=>setNotes(e.target.value)}
          className="w-full min-h-[90px] bg-zinc-900 border border-zinc-800 p-2 rounded text-sm" />
      </div>

      {/* ====== Adjuntar imágenes (opcional en edición) ====== */}
      <div className="bg-zinc-900 border border-zinc-800 rounded p-3 space-y-2">
        <div className="text-sm font-medium">Imágenes</div>
        <div className="flex items-center gap-3">
          <label className={`px-3 py-2 bg-emerald-600 rounded text-sm cursor-pointer ${busyUpload?'opacity-60':''}`}>
            Seleccionar archivos…
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e)=>addFiles(e.target.files)} />
          </label>
          <div className="text-xs text-zinc-400">Tip: también puedes pegar screenshots aquí con <b>Ctrl+V</b>.</div>
        </div>

        <div className="p-3 border border-dashed border-zinc-700 rounded text-sm bg-zinc-950">
          {stagedPics.length===0 ? (
            <div className="text-zinc-400">Sin imágenes seleccionadas.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {stagedPics.map((f,i)=>(
                <div key={i} className="border border-zinc-800 rounded p-2 bg-zinc-950">
                  <div className="text-[11px] truncate mb-2">{f.name || 'captura'}</div>
                  <div className="flex justify-between">
                    <span className="text-[10px] text-zinc-500">{Math.round(f.size/1024)} KB</span>
                    <button className="text-[11px] px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded"
                      onClick={()=>removeStaged(i)}>Quitar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ====== Acciones ====== */}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busyUpload}
          className="px-4 py-2 bg-emerald-600 rounded text-sm disabled:opacity-50"
        >
          Guardar cambios
        </button>
        <Link href={`/trades/${tradeId}`} className="px-4 py-2 bg-zinc-800 rounded text-sm border border-zinc-700">Cancelar</Link>
      </div>
    </div>
  )
}

