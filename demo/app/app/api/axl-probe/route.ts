export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const node = searchParams.get('node');

  const baseUrl = process.env.AXL_BASE_URL || '';
  const urls: Record<string, string> = {
    researcher: process.env.AXL_RESEARCHER_URL || baseUrl || 'http://204.168.133.192:9080/researcher',
    builder: process.env.AXL_BUILDER_URL || baseUrl.replace('/researcher', '/builder') || 'http://204.168.133.192:9080/builder',
  };

  const url = urls[node || ''];
  if (!url) {
    return Response.json({ connected: false, error: 'unknown node' });
  }

  const axlAuthToken = process.env.AXL_AUTH_TOKEN || '';
  const headers: Record<string, string> = axlAuthToken ? { Authorization: `Bearer ${axlAuthToken}` } : {};

  try {
    const r = await fetch(`${url}/topology`, { headers, signal: AbortSignal.timeout(5000) });
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
