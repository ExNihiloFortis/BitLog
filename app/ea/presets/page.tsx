'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'

type Preset = { id:number; name:string }

export default function EAPresetsPage() {
  const [userId, setUserId] = useState<string|null>(null)
  const [presets, setPresets] = useState<Preset[]>([])
  const [value, setValue] = useState('')

  useEffect(() => {
    (async ()=> {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href='/login'; return }
      setUserId(user.id)
      await load()
    })()
  }, [])

  const load = async () => {
    const { data, error } = await supabase
      .from('ea_presets')
      .select('id,name')
      .order('name', { ascending: true })
    if (!error) setPresets((data||[]) as Preset[])
  }

  const addPreset = async () => {
    const name = value.trim()
    if (!name) return
    const { error } = await supabase.from('ea_presets').insert([{ name }])
    if (error) { alert(error.message); return }
    setValue('')
    await load()
  }

  const removePreset = async (p:Preset) => {
    if (!confirm(`Eliminar preset "${p.name}"?`)) return
    const { error } = await supabase.from('ea_presets').delete().eq('id', p.id)
    if (error) { alert(error.message); return }
    await load()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">EAs (presets)</h1>

      <div className="flex gap-2">
        <input
          className="flex-1 bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
          placeholder="Nombre de EA (ej. GoldenZone)"
          value={value}
          onChange={(e)=>setValue(e.target.value)}
        />
        <button onClick={addPreset} className="px-3 py-2 bg-emerald-600 rounded text-sm">Añadir</button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded">
        {presets.length === 0 ? (
          <div className="p-3 text-sm text-zinc-400">Sin presets. Añade uno arriba.</div>
        ) : (
          <ul>
            {presets.map(p=>(
              <li key={p.id} className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
                <span>{p.name}</span>
                <button onClick={()=>removePreset(p)}
                        className="px-2 py-1 text-xs bg-zinc-900 border border-zinc-800 rounded hover:bg-rose-700 hover:text-white">
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-xs text-zinc-400">
        Tip: esta lista aparece como sugerencias en “Nuevo Trade → Datos del EA”.
      </div>
    </div>
  )
}

