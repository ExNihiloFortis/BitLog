'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DateTime } from 'luxon'
import { sessionFromMazatlanHour } from '@/lib/time'

type CsvRow = Record<string, string>

const norm = (s:string) => s?.toLowerCase().trim().replace(/\s+/g,' ') || ''
const toks = (s:string) => norm(s).split(/[^a-z0-9]+/).filter(Boolean)
const pick = (row:CsvRow, keys:(string|null|undefined)[]) => {
  for (const k of keys) { if (!k) continue; const v = row[k]; if (v != null && v !== '') return v }
  return ''
}
const toNum = (s:string) => {
  if (s == null || s === '') return null
  const t = String(s).replace(/\s+/g,'').replace(/,/g,'.')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function parseDate(cell:string, zone:string) {
  if (!cell) return null
  const trials = [
    (c:string)=>DateTime.fromISO(c, { zone }),
    (c:string)=>DateTime.fromSQL(c, { zone }),
    (c:string)=>DateTime.fromFormat(c, "yyyy-LL-dd HH:mm:ss", { zone }),
    (c:string)=>DateTime.fromFormat(c, "dd/LL/yyyy HH:mm", { zone }),
    (c:string)=>DateTime.fromFormat(c, "LL/dd/yyyy HH:mm", { zone }),
  ]
  for (const t of trials) { const dt = t(cell); if (dt.isValid) return dt }
  return null
}

function parseCSV(text:string) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1) // BOM
  const linesAll = text.split(/\r?\n/)
  const firstNonEmpty = linesAll.find(l=>l.trim()!=='') || ''
  const delim = (firstNonEmpty.match(/;/g)?.length || 0) > (firstNonEmpty.match(/,/g)?.length || 0) ? ';' : ','
  const lines = linesAll.filter(l=>l.trim()!=='')
  if (lines.length === 0) return { headers:[], rows:[] as CsvRow[], delim }
  const split = (line:string) => {
    const out:string[] = []; let cur=''; let inQ=false
    for (let i=0;i<line.length;i++){
      const ch=line[i]
      if (ch === '"'){ if (inQ && line[i+1] === '"'){cur+='"'; i++} else inQ=!inQ }
      else if (ch === delim && !inQ){ out.push(cur); cur='' }
      else cur += ch
    }
    out.push(cur); return out
  }
  const rawHeaders = split(lines[0]).map(h=>h.trim())
  const headers = rawHeaders.map(h=>norm(h))
  const rows: CsvRow[] = []
  for (let li=1; li<lines.length; li++){
    const cols = split(lines[li]); const row: CsvRow = {}
    for (let i=0; i<headers.length; i++){ row[headers[i]] = (cols[i] ?? '').trim() }
    rows.push(row)
  }
  return { headers, rows, delim }
}

/** Busca columnas con prioridad:
 *  1) igualdad exacta al candidato
 *  2) coincidencia por tokens completos (no subcadenas sueltas)
 *  allowAvoid evita falsos positivos como take_profit para profit.
 */
function findKey(headers:string[], cand:string[], avoid:RegExp[] = []) {
  const H = headers.map(h=>norm(h))
  const pass = (h:string) => !avoid.some(rx => rx.test(h))

  for (const want of cand.map(norm)) {
    const i = H.findIndex(h => h === want)
    if (i >= 0 && pass(H[i])) return H[i]
  }
  for (const want of cand.map(w=>toks(w).join(' '))) {
    for (const h of H) {
      if (!pass(h)) continue
      const ht = new Set(toks(h))
      const wt = toks(want)
      if (wt.every(t => ht.has(t))) return h
    }
  }
  return null
}

const H = {
  ticket: ['ticket','order id','trade id','deal id','position id','id'],
  openTime: ['open time utc','opening time utc','open time','time open','open time gmt'],
  closeTime: ['close time utc','closing time utc','close time','time close','close time gmt'],
  type: ['type','side'],
  volume: ['size','volume','lot','lots','qty','quantity','original position size'],
  symbol: ['symbol','symbol name','instrument'],
  openPrice: ['open price','opening price','price open'],
  sl: ['s/l','sl','stop loss','s l'],
  tp: ['t/p','tp','take profit','t p'],
  commission: ['commission usd','commission usc','commission','commissions'],
  swap: ['swap usd','swap usc','swap','storage'],
  profit: ['profit','pnl','p&l','net profit','profit usd','profit usc'],
  closeReason: ['close reason','closing reason','close_reason'],
}

export default function ImportPage() {
  const router = useRouter()
  const [uid, setUid] = useState<string|null>(null)

  const [broker, setBroker] = useState('Exness')
  const [platform, setPlatform] = useState('MT5')
  const [csvTz, setCsvTz] = useState('UTC')
  const [text, setText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<string>('')
  const [errors, setErrors] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string,string|null>>({})

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUid(user.id)
    })()
  }, [router])

  const handleFile = async (f: File|null) => {
    if (!f) return
    const t = await f.text()
    setText(t)
  }

  const doImport = async () => {
    if (!uid) return
    if (!text.trim()) { alert('Carga un CSV primero'); return }
    setParsing(true); setResult(''); setErrors([])

    try {
      const parsed = parseCSV(text)
      if (parsed.rows.length === 0) { setResult('CSV vacío o no legible'); setParsing(false); return }
      const rows = parsed.rows
      const headers = Object.keys(rows[0] || {})

      const avoidProfit = [/^take[\s_\-]*profit$/, /^stop[\s_\-]*profit$/]

      const keyTicket = findKey(headers, H.ticket)
      const keyOpen   = findKey(headers, H.openTime)
      const keyClose  = findKey(headers, H.closeTime)
      const keyType   = findKey(headers, H.type)
      const keyVol    = findKey(headers, H.volume)
      const keySym    = findKey(headers, H.symbol)
      const keyPrice  = findKey(headers, H.openPrice)
      const keySL     = findKey(headers, H.sl)
      const keyTP     = findKey(headers, H.tp)
      const keyComm   = findKey(headers, H.commission)
      const keySwap   = findKey(headers, H.swap)
      const keyPnl    = findKey(headers, H.profit, avoidProfit)
      const keyCloseR = findKey(headers, H.closeReason)

      setMapping({
        ticket: keyTicket, open_time: keyOpen, close_time: keyClose, type: keyType, volume: keyVol,
        symbol: keySym, open_price: keyPrice, sl: keySL, tp: keyTP, commission: keyComm,
        swap: keySwap, profit: keyPnl, close_reason: keyCloseR
      })

      if (!keyTicket || !keyOpen || !keyType || !keySym || !keyPrice) {
        setResult('CSV no reconocido. Requiere columnas: Ticket, Open Time, Type, Symbol, Open Price.')
        setParsing(false); return
      }

      const mapped:any[] = []
      for (const r of rows) {
        const ticket = pick(r, [keyTicket])
        const openStr = pick(r, [keyOpen])
        const openDt = parseDate(openStr, csvTz)
        if (!openDt) continue
        const dt_utc = openDt.toUTC().toISO()

        const closeStr = pick(r, [keyClose])
        const closeDt = keyClose ? parseDate(closeStr, csvTz) : null
        const dt_close_utc = closeDt ? closeDt.toUTC().toISO() : null

        const sideRaw = pick(r, [keyType]).toLowerCase()
        const side = /buy|long/.test(sideRaw) ? 'LONG' : /sell|short/.test(sideRaw) ? 'SHORT' : 'LONG'

        const obj:any = {
          user_id: uid,
          dt_utc,
          dt_close_utc,
          symbol: pick(r, [keySym]).toUpperCase(),
          side,
          entry: toNum(pick(r, [keyPrice])),
          sl: toNum(pick(r, [keySL])),
          tp: toNum(pick(r, [keyTP])),
          size: toNum(pick(r, [keyVol])),
          commission: toNum(pick(r, [keyComm])),
          swap: toNum(pick(r, [keySwap])),
          pnl: toNum(pick(r, [keyPnl])),
          close_reason: keyCloseR ? pick(r, [keyCloseR]) : null,
          session: sessionFromMazatlanHour(dt_utc),
          broker,
          broker_trade_id: String(ticket || ''),
          platform,
          ea: 'N/A',
          is_manual: false,
          import_source: `CSV_${platform}`,
          imported_at: new Date().toISOString(),
        }
        Object.keys(obj).forEach(k => obj[k] === undefined && delete obj[k])
        mapped.push(obj)
      }

      if (mapped.length === 0) { setResult('No se pudieron mapear filas válidas'); setParsing(false); return }

      let ok = 0, fail = 0
      for (let i=0; i<mapped.length; i+=200) {
        const chunk = mapped.slice(i, i+200)
        const { error } = await supabase
          .from('trades')
          .upsert(chunk, { onConflict: 'user_id,broker,broker_trade_id' })
        if (error) {
          fail += chunk.length
          const msg = error.message || JSON.stringify(error)
          setErrors(prev=>[...prev, `Lote ${i+1}-${i+chunk.length}: ${msg}`])
          console.warn('upsert warning', msg)
        } else {
          ok += chunk.length
        }
      }
      setResult(`Procesadas: ${ok}. Con error: ${fail}.`)
    } catch (e:any) {
      const msg = e?.message || 'Error en importación'
      setErrors(prev=>[...prev, msg])
      console.warn('doImport warning', msg)
    } finally {
      setParsing(false)
    }
  }

  if (!uid) return <p>Cargando…</p>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Importar CSV</h1>

      <div className="grid grid-cols-1 md-grid-cols-4 md:grid-cols-4 gap-3">
        <div>
          <label className="text-sm">Broker</label>
          <input className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
                 value={broker} onChange={e=>setBroker(e.target.value)} />
        </div>
        <div>
          <label className="text-sm">Plataforma</label>
          <select className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
                  value={platform} onChange={e=>setPlatform(e.target.value)}>
            <option>MT5</option><option>MT4</option><option>Otro</option>
          </select>
        </div>
        <div>
          <label className="text-sm">Zona horaria del CSV</label>
          <select className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
                  value={csvTz} onChange={e=>setCsvTz(e.target.value)}>
            <option value="UTC">UTC</option>
            <option value="America/Mazatlan">America/Mazatlan</option>
            <option value="America/Mexico_City">America/Mexico_City</option>
            <option value="Europe/London">Europe/London</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="px-3 py-2 bg-zinc-800 rounded text-sm cursor-pointer">
            Cargar CSV
            <input type="file" accept=".csv" className="hidden" onChange={(e)=>handleFile(e.target.files?.[0]||null)}/>
          </label>
        </div>
      </div>

      <textarea
        className="w-full min-h-40 bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
        placeholder="O pega aquí el contenido del CSV…"
        value={text}
        onChange={e=>setText(e.target.value)}
      />

      <div className="flex gap-3 items-center">
        <button onClick={doImport} disabled={parsing}
                className="px-4 py-2 bg-emerald-600 rounded">{parsing?'Importando…':'Importar'}</button>
        {result && <div className="text-sm text-zinc-300">{result}</div>}
      </div>

      {Object.keys(mapping).length>0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3 text-xs text-zinc-300">
          <div className="font-medium mb-1">Mapeo detectado</div>
          <pre className="whitespace-pre-wrap">{JSON.stringify(mapping, null, 2)}</pre>
        </div>
      )}

      {errors.length>0 && (
        <div className="bg-zinc-900 border border-rose-700/60 rounded p-3 text-sm">
          <div className="font-medium text-rose-400 mb-1">Errores</div>
          <ul className="list-disc ml-5 space-y-1">
            {errors.map((e,i)=><li key={i} className="break-all">{e}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

