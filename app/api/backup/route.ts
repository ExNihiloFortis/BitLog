// app/api/backup/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function stampUTC() {
  const d = new Date()
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth()+1).padStart(2,'0')
  const dd = String(d.getUTCDate()).padStart(2,'0')
  const hh = String(d.getUTCHours()).padStart(2,'0')
  const mi = String(d.getUTCMinutes()).padStart(2,'0')
  const ss = String(d.getUTCSeconds()).padStart(2,'0')
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}Z`
}

function csvEscape(v: any) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s
}
function toCSV(rows: any[], header?: string[]) {
  if (!rows || rows.length === 0) return ''
  const cols = header ?? Object.keys(rows[0])
  const head = cols.join(',')
  const lines = rows.map(r => cols.map(c => csvEscape((r as any)[c])).join(','))
  // BOM para Excel
  return '\ufeff' + head + '\n' + lines.join('\n')
}

export async function POST() {
  try {
    // 1) Lee datos
    const { data: trades, error: e1 } = await supabaseAdmin.from('trades').select('*')
    if (e1) throw e1
    const { data: attachments, error: e2 } = await supabaseAdmin.from('attachments').select('*')
    if (e2) throw e2

    const ts = stampUTC()
    const prefix = `snapshots/${ts}/`

    // 2) Genera CSV + JSON
    const tradesCsv = toCSV(trades || [])
    const attsCsv = toCSV(attachments || [])
    const tradesJson = JSON.stringify(trades || [], null, 2)
    const attsJson = JSON.stringify(attachments || [], null, 2)

    // 3) Sube a Storage/backups
    const up = supabaseAdmin.storage.from('backups')
    const uploads = [
      up.upload(`${prefix}trades.csv`, new Blob([tradesCsv], {type:'text/csv;charset=utf-8'}), { upsert: true }),
      up.upload(`${prefix}attachments.csv`, new Blob([attsCsv], {type:'text/csv;charset=utf-8'}), { upsert: true }),
      up.upload(`${prefix}trades.json`, new Blob([tradesJson], {type:'application/json'}), { upsert: true }),
      up.upload(`${prefix}attachments.json`, new Blob([attsJson], {type:'application/json'}), { upsert: true }),
      up.upload(`${prefix}manifest.json`, new Blob([JSON.stringify({
        created_at: new Date().toISOString(),
        snapshot: prefix,
        counts: { trades: trades?.length ?? 0, attachments: attachments?.length ?? 0 },
        attachment_paths: (attachments||[]).map(a => (a as any).path).filter(Boolean),
      }, null, 2)], {type:'application/json'}), { upsert: true }),
      // puntero rápido "latest.json"
      up.upload(`latest.json`, new Blob([JSON.stringify({ snapshot: prefix, created_at: new Date().toISOString() }, null, 2)], {type:'application/json'}), { upsert: true }),
    ]
    const results = await Promise.all(uploads)
    const err = results.find(r => (r as any).error)
    if (err && (err as any).error) throw (err as any).error

    // 4) URLs firmadas para descargar por 1h
    const sign = async (p: string) => (await up.createSignedUrl(p, 3600)).data?.signedUrl
    const signed = {
      trades_csv: await sign(`${prefix}trades.csv`),
      attachments_csv: await sign(`${prefix}attachments.csv`),
      manifest_json: await sign(`${prefix}manifest.json`),
    }

    return NextResponse.json({ ok: true, snapshot: prefix, signed })
  } catch (e:any) {
    console.error('backup error', e)
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status: 500 })
  }
}

export async function GET() {
  // alias para probar en el navegador
  return POST()
}

