import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { receipts, rawData } = await request.json();

    if (!receipts || !Array.isArray(receipts) || receipts.length === 0) {
      return NextResponse.json({ error: 'No receipts provided' }, { status: 400 });
    }

    const raw: Record<string, { input?: string; output?: string }> = rawData ?? {};
    const examples: any[] = [];
    const byType: Record<string, number> = {};

    for (const receipt of receipts) {
      const { action } = receipt;
      byType[action.type] = (byType[action.type] ?? 0) + 1;
      const rd = raw[receipt.id] ?? {};

      switch (action.type) {
        case 'llm_call': {
          const prompt = rd.input ?? action.description ?? 'Analyze this';
          const response = rd.output;
          if (response) {
            examples.push({
              messages: [
                { role: 'system', content: 'You are a verified AI agent. Every action produces a cryptographic receipt. Respond with accurate, structured analysis.' },
                { role: 'user', content: prompt },
                { role: 'assistant', content: response },
              ],
            });
          }
          break;
        }
        case 'decision': {
          const reasoning = rd.input ?? action.description;
          const decision = rd.output ?? 'Proceed';
          examples.push({
            messages: [
              { role: 'system', content: 'You are a verified AI agent making decisions. Explain reasoning clearly, then state your decision.' },
              { role: 'user', content: `Given this context, what should we do?\n\n${reasoning}` },
              { role: 'assistant', content: decision },
            ],
          });
          break;
        }
        case 'file_read': {
          const fileDesc = rd.input ?? action.description;
          const fileContent = rd.output;
          if (fileContent) {
            examples.push({
              messages: [
                { role: 'system', content: 'You are a verified AI agent. Read files and extract the relevant information.' },
                { role: 'user', content: `Read and summarize: ${fileDesc}` },
                { role: 'assistant', content: fileContent },
              ],
            });
          }
          break;
        }
        case 'api_call': {
          const apiDesc = rd.input ?? action.description;
          const apiResponse = rd.output;
          if (apiResponse) {
            examples.push({
              messages: [
                { role: 'system', content: 'You are a verified AI agent. Query APIs and interpret responses accurately.' },
                { role: 'user', content: `Query this endpoint: ${apiDesc}` },
                { role: 'assistant', content: apiResponse },
              ],
            });
          }
          break;
        }
        case 'output': {
          const outputDesc = rd.input ?? action.description;
          const outputContent = rd.output;
          if (outputContent) {
            examples.push({
              messages: [
                { role: 'system', content: 'You are a verified AI agent producing final outputs. Provide clear, actionable results.' },
                { role: 'user', content: outputDesc },
                { role: 'assistant', content: outputContent },
              ],
            });
          }
          break;
        }
        case 'usefulness_review': {
          const chainSummary = rd.input ?? 'Agent work chain';
          const scores = rd.output;
          if (scores) {
            examples.push({
              messages: [
                { role: 'system', content: 'You are an independent reviewer scoring AI agent work on alignment, substance, and quality. Be rigorous.' },
                { role: 'user', content: `Review this agent work chain for usefulness:\n\n${chainSummary}` },
                { role: 'assistant', content: scores },
              ],
            });
          }
          break;
        }
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
