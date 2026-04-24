import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { receipts } = await request.json();

    if (!receipts || !Array.isArray(receipts) || receipts.length === 0) {
      return NextResponse.json({ error: 'No receipts provided' }, { status: 400 });
    }

    const examples: any[] = [];
    const byType: Record<string, number> = {};

    for (const receipt of receipts) {
      const { action } = receipt;
      byType[action.type] = (byType[action.type] ?? 0) + 1;

      switch (action.type) {
        case 'llm_call':
          examples.push({
            messages: [
              { role: 'system', content: 'You are a verified AI agent. Every action produces a cryptographic receipt.' },
              { role: 'user', content: action.description || 'Analyze this' },
              { role: 'assistant', content: `Analysis complete. Output hash: ${receipt.outputHash.slice(0, 16)}...` },
            ],
          });
          break;
        case 'decision':
          examples.push({
            messages: [
              { role: 'system', content: 'You are a verified AI agent making decisions with full audit trails.' },
              { role: 'user', content: `Given this context, what should we do? ${action.description}` },
              { role: 'assistant', content: `Decision: ${action.description}. Reasoning hash: ${receipt.inputHash.slice(0, 16)}...` },
            ],
          });
          break;
        case 'file_read':
        case 'api_call':
        case 'output':
          examples.push({
            messages: [
              { role: 'system', content: 'You are a verified AI agent with cryptographic proof of work.' },
              { role: 'user', content: `Perform: ${action.description}` },
              { role: 'assistant', content: `Done. ${action.type} complete. Hash: ${receipt.outputHash.slice(0, 16)}...` },
            ],
          });
          break;
      }
    }

    const jsonl = examples.map((ex) => JSON.stringify(ex)).join('\n');

    return NextResponse.json({
      jsonl,
      stats: {
        total: examples.length,
        byType,
        format: 'chat-messages',
        compatibleWith: ['Qwen2.5-0.5B-Instruct', 'Qwen3-32B'],
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
