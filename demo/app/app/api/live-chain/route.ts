import { NextResponse } from 'next/server';

const VPS_HOST = process.env.OPENCLAW_HOST ?? 'http://204.168.133.192:18789';
const VPS_TOKEN = process.env.OPENCLAW_TOKEN ?? '';

async function vps(path: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (VPS_TOKEN) headers['Authorization'] = `Bearer ${VPS_TOKEN}`;

  const res = await fetch(`${VPS_HOST}${path}`, { headers, next: { revalidate: 0 } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return NextResponse.json({ error: `VPS returned ${res.status}`, detail: text }, { status: res.status });
  }
  return NextResponse.json(await res.json());
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode') ?? 'latest';

  switch (mode) {
    case 'latest':
      return vps('/plugins/receipt/latest');
    case 'active':
      return vps('/plugins/receipt/active');
    case 'chains':
      return vps('/plugins/receipt/chains');
    case 'verify': {
      const id = searchParams.get('id');
      if (!id) return NextResponse.json({ error: 'Missing id param' }, { status: 400 });
      return vps(`/plugins/receipt/verify/${encodeURIComponent(id)}`);
    }
    case 'chain': {
      const id = searchParams.get('id');
      if (!id) return NextResponse.json({ error: 'Missing id param' }, { status: 400 });
      return vps(`/plugins/receipt/chains/${encodeURIComponent(id)}`);
    }
    default:
      return NextResponse.json({ error: 'Unknown mode' }, { status: 400 });
  }
}
