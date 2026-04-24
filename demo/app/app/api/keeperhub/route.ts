import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    console.log('KeeperHub webhook received:', JSON.stringify(payload).slice(0, 200));

    return NextResponse.json({
      status: 'received',
      timestamp: Date.now(),
      message: 'Webhook processed — anchoring pipeline triggered',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
