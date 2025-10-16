export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge'; // opcional, responde rapidísimo en Vercel Edge

export async function GET() {
  return new Response('ok', {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

