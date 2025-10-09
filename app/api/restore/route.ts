// app/api/restore/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Mode = 'merge' | 'replace'

async function downloadJSON(path: string) {
  const { data, error } = await supabaseAdmin.storage.from('backups').download(path)
  if (error || !data) throw error || new Error('download failed')
  const text = await (data as Blob).text()
  return JSON.parse(text)
}

export async function POST(req: Request) {
  try {
    const { prefix, mode }: { prefix: string; mode?: Mode } = await req.json()
    if (!prefix || !prefix.endsWith('/')) {
      return NextResponse.json({ ok:false, error:'prefix inválido. Ej: snapshots/20251008_103000Z/' }, { status: 400 })
    }
    const m = await downloadJSON(`${prefix}manifest.json`)
    const trades = await downloadJSON(`${prefix}trades.json`)
    const atts = await downloadJSON(`${prefix}attachments.json`)

    if ((mode ?? 'merge') === 'replace') {
      // borra todo antes
      const d1 = await supabaseAdmin.from('attachments').delete().neq('trade_id', -1)
      if (d1.error) throw d1.error
      const d2 = await supabaseAdmin.from('trades').delete().neq('id', -1)
      if (d2.error) throw d2.error
    }

    // upsert por id para mantener claves
    if (Array.isArray(trades) && trades.length) {
      const { error } = await supabaseAdmin.from('trades').upsert(trades, { onConflict: 'id' })
      if (error) throw error
    }
    if (Array.isArray(atts) && atts.length) {
      const { error } = await supabaseAdmin.from('attachments').upsert(atts, { onConflict: 'trade_id,path' })
      if (error) throw error
    }

    return NextResponse.json({ ok:true, restored: { trades: trades.length, attachments: atts.length }, manifest: m })
  } catch (e:any) {
    console.error('restore error', e)
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status: 500 })
  }
}

