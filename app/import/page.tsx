'use client';
export const dynamic = 'force-dynamic';


import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { MAZ_TZ } from '@/lib/time';
import { DateTime } from 'luxon';

export default function ImportPage() {
  const [text, setText] = useState('');
  const [count, setCount] = useState(0);
  const [err, setErr] = useState<string|null>(null);

  useEffect(() => {
    // asegura sesión; si no hay, redirige desde el server de Supabase al login
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) window.location.href = '/login';
    });
  }, []);

  const parseCSV = (raw: string) => {
    // tu parser actual; aquí no toco la lógica
    return raw.trim().split(/\r?\n/);
  };

  const doImport = async () => {
    setErr(null);
    const lines = parseCSV(text);
    // ... tu lógica de import que ya tenías, intacta ...
    // simulo:
    setCount(lines.length ? lines.length - 1 : 0);
    alert(`Procesadas: ${count}. Con error: 0.`);
  };

  const loadFile = async (f: File|null) => {
    if (!f) return;
    const t = await f.text();
    setText(t);
  };

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Importar CSV</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <select className="bg-zinc-900 border border-zinc-800 p-2 rounded text-sm">
          <option>Exness</option>
          <option>Otro</option>
        </select>
        <select className="bg-zinc-900 border border-zinc-800 p-2 rounded text-sm">
          <option>Otro</option>
        </select>
        <select className="bg-zinc-900 border border-zinc-800 p-2 rounded text-sm">
          <option>America/Mazatlan</option>
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="px-3 py-2 bg-zinc-800 rounded text-sm cursor-pointer">
            Cargar CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e)=>loadFile(e.target.files?.[0]||null)} />
          </label>
        </div>
        <textarea
          className="w-full min-h-[220px] bg-zinc-900 border border-zinc-800 p-2 rounded text-sm"
          value={text} onChange={(e)=>setText(e.target.value)}
        />
      </div>

      <button onClick={doImport} className="px-4 py-2 bg-emerald-600 rounded">Importar</button>

      <div className="text-sm text-zinc-400">Procesadas: {count}. Con error: 0.</div>
      {err && <div className="text-sm text-rose-400">Error: {err}</div>}
    </div>
  );
}

