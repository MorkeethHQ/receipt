import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { agentId, publicKeyHex, score } = await request.json();

    const pk = process.env.PRIVATE_KEY;
    if (!pk) return NextResponse.json({ error: 'No private key' }, { status: 500 });

    const { writeReputation } = await import('@receipt/sdk/integrations/0g-kv');

    const scores = [score];
    const entry = {
      agentId,
      publicKeyHex,
      scores,
      avgScore: score,
      chainCount: 1,
      lastActive: Date.now(),
    };

    const result = await writeReputation({
      rpc: 'https://evmrpc.0g.ai',
      kvRpc: 'https://kv-rpc.0g.ai',
      privateKey: pk,
      streamId: '0x' + '0'.repeat(63) + '1',
    }, entry);

    return NextResponse.json({
      success: true,
      entry,
      kvResult: result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, attempted: true }, { status: 500 });
  }
}
