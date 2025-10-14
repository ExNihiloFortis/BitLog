import { createClient } from '@supabase/supabase-js'

const url =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  throw new Error('Faltan SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y/o SUPABASE_SERVICE_ROLE_KEY')
}

// Instancia única para uso en server (sin sesión persistente)
export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
})

