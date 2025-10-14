export const dynamic = 'force-dynamic' // evita prerender en build

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function POST(req: Request) {
  try {
    const sb = supabaseAdmin
    const body = await req.json() as {
      trades: any[]
      attachments: any[]
    }

    // UPSERT trades por (user_id, broker_trade_id) o por id (según lo que tengas).
    // Aquí uso el índice único (user_id, broker_trade_id) que ya creaste:
    //   trades_user_broker_uidx
    if (body.trades?.length) {
      const { error: eT } = await sb
        .from('trades')
        .upsert(body.trades, { onConflict: 'user_id,broker_trade_id' })
      if (eT) throw eT
    }

    // UPSERT attachments por (trade_id, path)
    if (body.attachments?.length) {
      const { error: eA } = await sb
        .from('attachments')
        .upsert(body.attachments, { onConflict: 'trade_id,path' })
      if (eA) throw eA
    }

    return NextResponse.json({
      ok: true,
      trades_upserted: body.trades?.length || 0,
      attachments_upserted: body.attachments?.length || 0,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 })
  }
}

// opcionalmente permite GET para ver que está viva
export async function GET() {
  return NextResponse.json({ ok: true, hint: 'Usa POST con { trades, attachments }' })
}

