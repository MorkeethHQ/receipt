import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const PROVIDER_ADDRESSES = [
  '0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C',
  '0xBB3f5b0b5062CB5B3245222C5917afD1f6e13aF6',
  '0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0',
  '0x25F8f01cA76060ea40895472b1b79f76613Ca497',
];

interface ProviderHealth {
  address: string;
  model: string;
  endpoint: string;
  status: 'ok' | 'error';
  latencyMs: number;
  error?: string;
}

export async function GET() {
  try {
    const { createZGComputeNetworkReadOnlyBroker } = await import('@0glabs/0g-serving-broker');

    const broker = await createZGComputeNetworkReadOnlyBroker('https://evmrpc.0g.ai');

    const [inferenceServices, fineTuningServices] = await Promise.allSettled([
      broker.inference.listService(),
      broker.fineTuning.listService(),
    ]);

    const [ftModels] = await Promise.allSettled([
      broker.fineTuning.listModel(),
    ]);

    const inference = inferenceServices.status === 'fulfilled'
      ? (inferenceServices.value as any[]).map((s: any) => ({
          provider: s.provider ?? s[0] ?? '',
          url: s.url ?? s[1] ?? '',
          model: s.model ?? s[2] ?? '',
          type: 'inference',
        }))
      : [];

    const fineTuning = fineTuningServices.status === 'fulfilled'
      ? (fineTuningServices.value as any[]).map((s: any) => ({
          provider: s.provider ?? s[0] ?? '',
          url: s.url ?? s[1] ?? '',
          model: s.model ?? s[2] ?? '',
          type: 'fine-tuning',
        }))
      : [];

    let models: { standard: any[]; custom: any[] } = { standard: [], custom: [] };
    if (ftModels.status === 'fulfilled') {
      const [std, cust] = ftModels.value as any;
      models = {
        standard: (std ?? []).map(([name, config]: [string, any]) => ({ name, config })),
        custom: (cust ?? []).map(([name, config]: [string, any]) => ({ name, config })),
      };
    }

    // Build a lookup from the full service list for our specific provider addresses
    const serviceLookup = new Map<string, { url: string; model: string }>();
    for (const svc of inference) {
      const addr = (svc.provider as string).toLowerCase();
      serviceLookup.set(addr, { url: svc.url, model: svc.model });
    }

    // Health check each provider address
    const health: ProviderHealth[] = await Promise.all(
      PROVIDER_ADDRESSES.map(async (addr): Promise<ProviderHealth> => {
        const start = Date.now();
        const entry = serviceLookup.get(addr.toLowerCase());
        if (!entry || !entry.url) {
          return { address: addr, model: entry?.model ?? '', endpoint: entry?.url ?? '', status: 'error', latencyMs: Date.now() - start, error: 'Provider not found in service list' };
        }
        const { url: endpoint, model } = entry;
        try {
          // Lightweight ping — small completion request with minimal tokens
          const pingRes = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: 'ping' }],
              max_tokens: 1,
            }),
            signal: AbortSignal.timeout(10000),
          });

          const latencyMs = Date.now() - start;

          if (!pingRes.ok) {
            return { address: addr, model, endpoint, status: 'error', latencyMs, error: `HTTP ${pingRes.status}` };
          }

          return { address: addr, model, endpoint, status: 'ok', latencyMs };
        } catch (err: unknown) {
          const latencyMs = Date.now() - start;
          const msg = err instanceof Error ? err.message : String(err);
          return { address: addr, model, endpoint, status: 'error', latencyMs, error: msg };
        }
      }),
    );

    const data = {
      inference: { count: inference.length, services: inference },
      fineTuning: { count: fineTuning.length, services: fineTuning },
      models,
      health,
    };
    return new Response(
      JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
