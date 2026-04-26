export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const node = searchParams.get('node');

  const urls: Record<string, string> = {
    researcher: process.env.AXL_RESEARCHER_URL || 'http://127.0.0.1:9002',
    builder: process.env.AXL_BUILDER_URL || 'http://127.0.0.1:9012',
  };

  const url = urls[node || ''];
  if (!url) {
    return Response.json({ connected: false, error: 'unknown node' });
  }

  try {
    const r = await fetch(`${url}/topology`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      const info = await r.json();
      return Response.json({
        connected: true,
        key: info.our_public_key || '',
        peers: (info.peers || []).length,
      });
    }
    return Response.json({ connected: false });
  } catch {
    return Response.json({ connected: false });
  }
}
