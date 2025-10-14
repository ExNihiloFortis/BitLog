export const dynamic = 'force-dynamic' // evita prerender en build

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET() {
  try {
    const sb = supabaseAdmin

    // trades
    const { data: trades, error: e1 } = await sb.from('trades').select('*').order('id')
    if (e1) throw e1

    // attachments (solo metadatos; el binario ya está en Storage)
    const { data: atts, error: e2 } = await sb.from('attachments').select('*').order('trade_id')
    if (e2) throw e2

    const payload = {
      createdAt: new Date().toISOString(),
      trades,
      attachments: atts,
    }

    const filename = `backup_${new Date().toISOString().replace(/[:.]/g,'-')}.json`
    return new NextResponse(JSON.stringify({ ok: true, file: filename, trades: trades?.length||0, attachments: atts?.length||0, payload }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 })
  }
}

