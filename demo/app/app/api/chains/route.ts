import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

interface ChainSummary {
  id: string;
  source: 'claude-code' | 'openclaw' | 'demo';
  agentId: string;
  receiptCount: number;
  rootHash: string;
  quality: number | null;
  timestamp: number;
  receipts?: any[];
}

const VPS_HOST = process.env.OPENCLAW_HOST ?? 'http://204.168.133.192:18789';
const VPS_TOKEN = process.env.OPENCLAW_TOKEN ?? '';

async function fetchOpenClawChains(): Promise<ChainSummary[]> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (VPS_TOKEN) headers['Authorization'] = `Bearer ${VPS_TOKEN}`;
    const res = await fetch(`${VPS_HOST}/plugins/receipt/chains`, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    const chains: any[] = Array.isArray(data) ? data : data.chains ?? [];
    return chains.map((c: any) => ({
      id: c.id ?? c.chainId ?? `oc-${c.timestamp ?? Date.now()}`,
      source: 'openclaw' as const,
      agentId: c.agentId ?? 'openclaw-agent',
      receiptCount: c.receiptCount ?? c.receipts?.length ?? 0,
      rootHash: c.rootHash ?? '',
      quality: c.quality ?? c.usefulnessScore ?? null,
      timestamp: c.timestamp ?? c.completedAt ?? Date.now(),
      receipts: c.receipts,
    }));
  } catch {
    return [];
  }
}

async function fetchClaudeCodeChains(): Promise<ChainSummary[]> {
  const chains: ChainSummary[] = [];
  const chainsDir = join(homedir(), '.receipt', 'chains');
  try {
    const files = await readdir(chainsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse().slice(0, 20);
    for (const file of jsonFiles) {
      try {
        const raw = await readFile(join(chainsDir, file), 'utf-8');
        const data = JSON.parse(raw);
        const receipts = Array.isArray(data) ? data : data.receipts ?? [];
        if (receipts.length === 0) continue;
        const last = receipts[receipts.length - 1];
        const reviewReceipt = receipts.find((r: any) => r.action?.type === 'usefulness_review');
        let quality: number | null = null;
        if (reviewReceipt) {
          try {
            const scores = JSON.parse(reviewReceipt.action?.description ?? '{}');
            quality = scores.composite ?? null;
          } catch {}
        }
        chains.push({
          id: data.sessionId ?? file.replace('.json', ''),
          source: 'claude-code',
          agentId: receipts[0]?.agentId ?? 'claude-code',
          receiptCount: receipts.length,
          rootHash: data.rootHash ?? last?.outputHash ?? '',
          quality,
          timestamp: receipts[0]?.timestamp ?? Date.now(),
          receipts,
        });
      } catch {}
    }
  } catch {}
  return chains;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const source = searchParams.get('source');

  const [openclaw, claudeCode] = await Promise.all([
    source === 'claude-code' ? Promise.resolve([]) : fetchOpenClawChains(),
    source === 'openclaw' ? Promise.resolve([]) : fetchClaudeCodeChains(),
  ]);

  const all: ChainSummary[] = [...openclaw, ...claudeCode]
    .sort((a, b) => b.timestamp - a.timestamp);

  return NextResponse.json({
    chains: all,
    sources: {
      openclaw: { available: openclaw.length > 0, count: openclaw.length },
      claudeCode: { available: claudeCode.length > 0, count: claudeCode.length },
    },
  });
}
