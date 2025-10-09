'use client'
import { supabase } from '@/lib/supabase'
import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const send = async () => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== 'undefined'
            ? window.location.origin + '/auth/callback'
            : undefined,
      },
    })
    if (error) return alert(error.message)
    setSent(true)
  }

  return (
    <div className="max-w-md">
      <h1 className="text-xl font-semibold mb-3">Acceso por correo</h1>
      <input
        className="w-full bg-zinc-900 border border-zinc-700 p-2 rounded mb-3"
        placeholder="tucorreo@dominio.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button onClick={send} className="px-3 py-2 bg-emerald-600 rounded">
        Enviar enlace
      </button>
      {sent && <p className="mt-3 text-sm text-emerald-400">Revisa tu correo.</p>}
    </div>
  )
}

