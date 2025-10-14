'use client'
export const dynamic = 'force-dynamic';

import { supabase } from '@/lib/supabase-browser';
import { useState } from 'react'

type Res = { ok:boolean; snapshot?:string; signed?:any; error?:string }

export default function BackupPage() {
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string>('Listo.')
  const [prefix, setPrefix] = useState('') // p.ej: snapshots/20251008_103000Z/
  const [links, setLinks] = useState<{trades_csv?:string; attachments_csv?:string; manifest_json?:string}>({})

  const call = async (url:string, body?:any) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: body ? JSON.stringify(body) : undefined
    })
    return res.json()
  }

  const doBackup = async () => {
    setBusy(true); setLog('Creando backup…'); setLinks({})
    try {
      const r:Res = await call('/api/backup')
      if (!r.ok) throw new Error(r.error || 'error')
      setLog(`Backup ok: ${r.snapshot}`)
      setLinks(r.signed || {})
      setPrefix(r.snapshot || '')
    } catch(e:any) {
      setLog('Error: ' + (e?.message||e))
    } finally {
      setBusy(false)
    }
  }

  const doRestore = async (mode:'merge'|'replace') => {
    if (!prefix) { setLog('Indica prefix'); return }
    if (mode==='replace' && !confirm('REPLACE borra tablas antes de restaurar. ¿Continuar?')) return
    setBusy(true); setLog(`Restaurando (${mode})…`)
    try {
      const r = await call('/api/restore', { prefix, mode })
      if (!r.ok) throw new Error(r.error || 'error')
      setLog(`Restore ok. trades=${r.restored?.trades} attachments=${r.restored?.attachments}`)
    } catch(e:any) {
      setLog('Error: ' + (e?.message||e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Backups</h1>

      <div className="flex gap-2 flex-wrap">
        <button onClick={doBackup} disabled={busy} className="px-4 py-2 bg-emerald-600 rounded">
          {busy ? 'Trabajando…' : 'Crear backup ahora'}
        </button>
      </div>

      <div className="space-y-2">
        <div className="text-sm">Resultado: {log}</div>
        <div className="text-sm">
          {links.trades_csv && (<a className="underline mr-3" href={links.trades_csv} target="_blank">Descargar trades.csv</a>)}
          {links.attachments_csv && (<a className="underline mr-3" href={links.attachments_csv} target="_blank">Descargar attachments.csv</a>)}
          {links.manifest_json && (<a className="underline" href={links.manifest_json} target="_blank">Ver manifest.json</a>)}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm">Snapshot prefix</label>
        <input className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
               placeholder="snapshots/20251008_103000Z/"
               value={prefix} onChange={(e)=>setPrefix(e.target.value)} />
        <div className="flex gap-2">
          <button onClick={()=>doRestore('merge')} disabled={busy}
                  className="px-3 py-2 bg-zinc-800 rounded border border-zinc-700">Restaurar (merge)</button>
          <button onClick={()=>doRestore('replace')} disabled={busy}
                  className="px-3 py-2 bg-rose-700 rounded">Restaurar (REPLACE)</button>
        </div>
        <p className="text-xs text-zinc-500">
          Tip: el último snapshot está en <code>backups/latest.json</code> dentro de Supabase Storage.
        </p>
      </div>
    </div>
  )
}

