import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const PROVIDERS = [
  { addr: '0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0', url: 'https://compute-network-4.integratenetwork.work', model: 'deepseek/deepseek-chat-v3-0324', name: 'DeepSeek-V3.2' },
  { addr: '0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C', url: 'https://compute-network-1.integratenetwork.work', model: 'zai-org/GLM-5-FP8', name: 'GLM-5' },
  { addr: '0xBB3f5b0b5062CB5B3245222C5917afD1f6e13aF6', url: 'https://compute-network-2.integratenetwork.work', model: 'openai/gpt-oss-120b', name: 'GPT-oss-120B' },
  { addr: '0x25F8f01cA76060ea40895472b1b79f76613Ca497', url: 'https://5259ae0f38365b27c0bab6301b73691206e32dce-80.dstack-pha-prod5.phala.network', model: 'openai/gpt-5.4-mini', name: 'GPT-5.4-mini' },
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
    const reqProcessor = (broker as any).inference.requestProcessor;
    const resProcessor = (broker as any).inference.responseProcessor;

    const errors: string[] = [];
    for (const p of PROVIDERS) {
      try {
        const headers = await reqProcessor.getRequestHeaders(p.addr, 'chatbot', prompt);

        const apiRes = await fetch(`${p.url}/v1/chat/completions`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: p.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!apiRes.ok) {
          const body = await apiRes.text().catch(() => '');
          errors.push(`${p.name}: HTTP ${apiRes.status} ${body.slice(0, 200)}`);
          continue;
        }

        const result: any = await apiRes.json();
        const response = result.choices?.[0]?.message?.content ?? '';
        if (!response) {
          errors.push(`${p.name}: empty response`);
          continue;
        }

        let attested = false;
        try {
          attested = await resProcessor.processResponse(p.addr, 'chatbot', response, result.attestation);
        } catch {}

        return NextResponse.json({
          response,
          attested,
          source: '0g-compute',
          provider: p.name,
          teeType: 'TDX',
        });
      } catch (e: unknown) {
        errors.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
    }

    return NextResponse.json({ error: 'All 0G Compute providers unavailable', providers: PROVIDERS.length, details: errors }, { status: 503 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
