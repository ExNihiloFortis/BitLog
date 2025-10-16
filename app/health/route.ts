// app/health/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge'; // opcional, va rápido en Vercel Edge

export async function GET(req: Request) {
  const accept = req.headers.get('accept') || '';

  // Si lo abres en navegador, respondemos HTML pequeño
  if (accept.includes('text/html')) {
    const html = `<!doctype html>
<html lang="es"><meta charset="utf-8">
<title>Health</title>
<body style="font-family:system-ui;padding:24px;background:#0a0a0a;color:#e5e5e5">
  <h1 style="margin:0 0 8px">OK</h1>
  <p style="margin:0;color:#9ca3af">Health check page</p>
</body></html>`;
    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  // Para curl/monitoreo, texto plano
  return new Response('ok', {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

