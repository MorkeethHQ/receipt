import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const PROVIDER_ADDRESSES = [
  '0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C',
  '0xBB3f5b0b5062CB5B3245222C5917afD1f6e13aF6',
  '0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0',
  '0x25F8f01cA76060ea40895472b1b79f76613Ca497',
];

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json({ error: 'Missing private key' }, { status: 500 });
    }

    const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');
    const { ethers } = await import('ethers');

    const network = new ethers.Network('0g-mainnet', 16661);
    const provider = new ethers.JsonRpcProvider('https://evmrpc.0g.ai', network, { staticNetwork: network });
    const wallet = new ethers.Wallet(privateKey, provider);

    const broker = await createZGComputeNetworkBroker(wallet);

    const errors: string[] = [];
    for (const addr of PROVIDER_ADDRESSES) {
      try {
        const { endpoint, model } = await broker.inference.getServiceMetadata(addr);
        const headers = await broker.inference.getRequestHeaders(addr);

        const apiRes = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!apiRes.ok) {
          const body = await apiRes.text().catch(() => '');
          errors.push(`${model}: HTTP ${apiRes.status} ${body.slice(0, 200)}`);
          continue;
        }

        const result: any = await apiRes.json();
        const response = result.choices?.[0]?.message?.content ?? '';
        if (!response) {
          errors.push(`${model}: empty response`);
          continue;
        }

        let attested = false;
        try {
          const chatID = apiRes.headers.get('ZG-Res-Key') || result.id;
          const usage = result.usage ? JSON.stringify(result.usage) : '';
          const valid = await broker.inference.processResponse(addr, chatID, usage);
          attested = !!valid;
        } catch {}

        return NextResponse.json({
          response,
          attested,
          source: '0g-compute',
          provider: model,
          teeType: 'TDX',
        });
      } catch (e: unknown) {
        errors.push(`${addr.slice(0,10)}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
    }

    return NextResponse.json({ error: 'All 0G Compute providers unavailable', providers: PROVIDER_ADDRESSES.length, details: errors }, { status: 503 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
