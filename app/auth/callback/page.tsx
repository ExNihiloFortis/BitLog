'use client'
import { supabase } from '@/lib/supabase'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Callback() {
  const router = useRouter()
  useEffect(() => {
    (async () => {
      // Si ya hay sesión, redirige
      const s = await supabase.auth.getSession()
      if (s.data.session) { router.replace('/'); return }
      // Intercambia el código del magic link por sesión
      const { error } = await supabase.auth.exchangeCodeForSession(window.location.href)
      if (error) alert(error.message)
      router.replace('/')
    })()
  }, [router])
  return <p>Autenticando…</p>
}

