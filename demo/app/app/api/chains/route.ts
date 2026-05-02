import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import seedChainsData from './seed-chains.json';

interface ChainSummary {
  id: string;
  source: 'claude-code' | 'openclaw' | 'cursor' | 'demo';
  agentId: string;
  receiptCount: number;
  rootHash: string;
  quality: number | null;
  timestamp: number;
  receipts?: any[];
}

const VPS_HOST = process.env.OPENCLAW_HOST ?? 'http://204.168.133.192:18789';
const VPS_TOKEN = process.env.OPENCLAW_TOKEN ?? '';

const MAX_CHAINS = 100;
const chainStore = new Map<string, ChainSummary>();

// Seed chains are embedded at build time - always available regardless of cold starts
const seedChains: ChainSummary[] = (seedChainsData as any[]).map(c => ({
  ...c,
  source: c.source as ChainSummary['source'],
}));
for (const sc of seedChains) {
  chainStore.set(sc.id, sc);
}

function pruneStore() {
  if (chainStore.size <= MAX_CHAINS) return;
  const excess = chainStore.size - MAX_CHAINS;
  const keys = chainStore.keys();
  for (let i = 0; i < excess; i++) {
    const next = keys.next();
    if (!next.done && !next.value.startsWith('seed-')) chainStore.delete(next.value);
  }
}

function getBaseUrl(req: Request): string {
  // Use x-forwarded-host/proto for Vercel, fall back to request URL
  const forwarded = req.headers.get('x-forwarded-host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  if (forwarded) return `${proto}://${forwarded}`;
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

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

function countSource(merged: ChainSummary[], src: ChainSummary['source']): SourceCount {
  const n = merged.filter((c) => c.source === src).length;
  return { available: n > 0, count: n };
}

type SourceCount = { available: boolean; count: number };

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const source = searchParams.get('source');
  const id = searchParams.get('id');

  // Single-chain lookup by ID
  if (id) {
    const chain = chainStore.get(id);
    if (chain) {
      return NextResponse.json({ chain });
    }
    return NextResponse.json({ error: 'Chain not found' }, { status: 404 });
  }

  const inMemoryChains = Array.from(chainStore.values());
  const [openclaw, claudeFilesystem] = await Promise.all([
    fetchOpenClawChains(),
    fetchClaudeCodeChains(),
  ]);

  const merged = [...openclaw, ...claudeFilesystem, ...inMemoryChains].sort(
    (a, b) => b.timestamp - a.timestamp,
  );

  let chainsOut = merged;
  if (source) {
    chainsOut = merged.filter((c) => c.source === source);
  }

  const sourcesPayload: Record<string, SourceCount> = {
    openclaw: countSource(merged, 'openclaw'),
    claudeCode: countSource(merged, 'claude-code'),
    demo: countSource(merged, 'demo'),
    cursor: countSource(merged, 'cursor'),
  };

  return NextResponse.json({
    chains: chainsOut,
    sources: sourcesPayload,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const receipts = Array.isArray(body.receipts) ? body.receipts : [];
    if (receipts.length === 0) {
      return NextResponse.json({ error: 'No receipts provided' }, { status: 400 });
    }

    const validSources = ['demo', 'claude-code', 'openclaw', 'cursor'] as const;
    const rawSource = body.source ?? 'demo';
    const resolvedSource = validSources.includes(rawSource) ? rawSource : 'demo';
    const chainId = `${resolvedSource}-${Date.now()}`;
    const last = receipts[receipts.length - 1];
    const reviewReceipt = receipts.find((r: any) => r.action?.type === 'usefulness_review');
    let quality: number | null = body.quality ?? null;
    if (!quality && reviewReceipt) {
      try {
        const scores = JSON.parse(reviewReceipt.action?.description ?? '{}');
        quality = scores.composite ?? null;
      } catch {}
    }

    const chain: ChainSummary = {
      id: chainId,
      source: resolvedSource as ChainSummary['source'],
      agentId: body.agentId ?? receipts[0]?.agentId ?? 'demo-agent',
      receiptCount: receipts.length,
      rootHash: body.rootHash ?? last?.outputHash ?? '',
      quality,
      timestamp: Date.now(),
      receipts,
    };

    chainStore.set(chainId, chain);
    pruneStore();

    const baseUrl = getBaseUrl(req);
    const verifyUrl = `${baseUrl}/verify?id=${chainId}&auto=1`;

    return NextResponse.json({ id: chainId, verifyUrl, saved: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
