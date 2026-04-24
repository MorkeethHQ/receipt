import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();

    const privateKey = process.env.PRIVATE_KEY;
    const providerAddress = process.env.OG_COMPUTE_PROVIDER;

    if (!privateKey || !providerAddress) {
      return NextResponse.json({ error: 'Missing 0G Compute config' }, { status: 500 });
    }

    const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');
    const { ethers } = await import('ethers');

    const provider = new ethers.JsonRpcProvider('https://evmrpc.0g.ai', undefined, { staticNetwork: true });
    const wallet = new ethers.Wallet(privateKey, provider);

    const broker = await createZGComputeNetworkBroker(wallet);
    const reqProcessor = (broker as any).inference.requestProcessor;
    const resProcessor = (broker as any).inference.responseProcessor;

    const services = await reqProcessor.getServiceMetadata();

    if (!services.length) {
      return NextResponse.json({ error: 'No 0G Compute services available' }, { status: 503 });
    }

    const service = services[0];
    const headers = await reqProcessor.getRequestHeaders(providerAddress, service.name, prompt);

    const apiRes = await fetch(`${service.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        model: service.model,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!apiRes.ok) throw new Error(`0G Compute: ${apiRes.status}`);

    const result: any = await apiRes.json();
    const response = result.choices?.[0]?.message?.content ?? '';

    let attested = false;
    try {
      attested = await resProcessor.processResponse(providerAddress, service.name, response, result.attestation);
    } catch {}

    return NextResponse.json({ response, attested, source: '0g-compute' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
