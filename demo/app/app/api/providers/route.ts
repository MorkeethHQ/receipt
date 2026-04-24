import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

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

    return NextResponse.json({
      inference: { count: inference.length, services: inference },
      fineTuning: { count: fineTuning.length, services: fineTuning },
      models,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
