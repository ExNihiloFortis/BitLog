'use client';
export const dynamic = 'force-dynamic';


import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';

export default function AuthCallback() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    (async () => {
      await supabase.auth.getSession();
      const err = params.get('error_description') || params.get('error');
      if (err) alert('Error de autenticación: ' + err);
      router.replace('/trades');
    })();
  }, [params, router]);

  return <p className="p-4 text-sm">Procesando inicio de sesión…</p>;
}

