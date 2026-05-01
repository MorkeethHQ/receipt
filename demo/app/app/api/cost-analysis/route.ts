import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export const runtime = 'nodejs';

const COST_PER_1K_TOKENS = 0.00015;

interface RunCost {
  runId: string;
  totalTokens: number;
  cost: number;
  quality: number;
  costPerUseful: number;
  verificationRate: number;
}

interface CostAnalysis {
  runs: number;
  totalTokens: number;
  totalCost: number;
  avgCostPerUseful: number;
  cheapestRun: { runId: string; cost: number; quality: number } | null;
  mostExpensiveRun: { runId: string; cost: number; quality: number } | null;
  avgQuality: number;
  avgVerificationRate: number;
}

function computeRunCost(chain: any): RunCost {
  const runId: string = chain.id ?? chain.sessionId ?? 'unknown';
  const receipts: any[] = Array.isArray(chain.receipts)
    ? chain.receipts
    : Array.isArray(chain) ? chain : [];

  // Sum tokensUsed from receipt metadata, or estimate from receipt count
  let totalTokens = 0;
  let verifiedCount = 0;

  for (const receipt of receipts) {
    const meta = receipt.metadata ?? receipt;
    const tokens = meta.tokensUsed ?? meta.tokens_used ?? 0;
    if (tokens > 0) {
      totalTokens += tokens;
    }
    // Count verified receipts (those with an outputHash or verification field)
    if (receipt.outputHash || receipt.verified || receipt.signature) {
      verifiedCount++;
    }
  }

  // If no token data was found, estimate: ~250 tokens per receipt
  if (totalTokens === 0 && receipts.length > 0) {
    totalTokens = receipts.length * 250;
  }

  const cost = (totalTokens * COST_PER_1K_TOKENS) / 1000;

  // Extract quality score from chain or from a usefulness_review receipt
  let quality: number = chain.quality ?? 0;
  if (!quality) {
    const reviewReceipt = receipts.find(
      (r: any) => r.action?.type === 'usefulness_review'
    );
    if (reviewReceipt) {
      try {
        const scores = JSON.parse(reviewReceipt.action?.description ?? '{}');
        quality = scores.composite ?? 0;
      } catch {}
    }
  }

  // Default quality to 50 if still missing, to avoid division by zero
  if (!quality || quality <= 0) {
    quality = 50;
  }

  const costPerUseful = cost / (quality / 100);
  const verificationRate =
    receipts.length > 0
      ? Math.round((verifiedCount / receipts.length) * 100)
      : 0;

  return { runId, totalTokens, cost, quality, costPerUseful, verificationRate };
}

function getMockData(): CostAnalysis {
  const mockRuns: RunCost[] = [
    {
      runId: 'demo-mock-1',
      totalTokens: 2100,
      cost: (2100 * COST_PER_1K_TOKENS) / 1000,
      quality: 82,
      costPerUseful: 0,
      verificationRate: 100,
    },
    {
      runId: 'demo-mock-2',
      totalTokens: 1850,
      cost: (1850 * COST_PER_1K_TOKENS) / 1000,
      quality: 71,
      costPerUseful: 0,
      verificationRate: 92,
    },
    {
      runId: 'demo-mock-3',
      totalTokens: 2285,
      cost: (2285 * COST_PER_1K_TOKENS) / 1000,
      quality: 88,
      costPerUseful: 0,
      verificationRate: 96,
    },
  ];

  for (const run of mockRuns) {
    run.costPerUseful = run.cost / (run.quality / 100);
  }

  const totalTokens = mockRuns.reduce((s, r) => s + r.totalTokens, 0);
  const totalCost = mockRuns.reduce((s, r) => s + r.cost, 0);
  const avgCostPerUseful =
    mockRuns.reduce((s, r) => s + r.costPerUseful, 0) / mockRuns.length;
  const avgQuality =
    mockRuns.reduce((s, r) => s + r.quality, 0) / mockRuns.length;
  const avgVerificationRate =
    mockRuns.reduce((s, r) => s + r.verificationRate, 0) / mockRuns.length;

  const sorted = [...mockRuns].sort((a, b) => a.cost - b.cost);

  return {
    runs: mockRuns.length,
    totalTokens,
    totalCost,
    avgCostPerUseful,
    cheapestRun: {
      runId: sorted[0].runId,
      cost: sorted[0].cost,
      quality: sorted[0].quality,
    },
    mostExpensiveRun: {
      runId: sorted[sorted.length - 1].runId,
      cost: sorted[sorted.length - 1].cost,
      quality: sorted[sorted.length - 1].quality,
    },
    avgQuality,
    avgVerificationRate,
  };
}

export async function GET() {
  const allRuns: RunCost[] = [];

  // Read chains from ~/.receipt/chains (claude-code chains)
  const chainsDir = join(homedir(), '.receipt', 'chains');
  try {
    const files = await readdir(chainsDir);
    const jsonFiles = files
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 20);
    for (const file of jsonFiles) {
      try {
        const raw = await readFile(join(chainsDir, file), 'utf-8');
        const data = JSON.parse(raw);
        const receipts = Array.isArray(data) ? data : data.receipts ?? [];
        if (receipts.length === 0) continue;
        allRuns.push(
          computeRunCost({ ...data, receipts, id: data.sessionId ?? file.replace('.json', '') })
        );
      } catch {}
    }
  } catch {}

  // Read chains from ~/.receipt/demo-chains (demo chains)
  const demoChainsDir = join(homedir(), '.receipt', 'demo-chains');
  try {
    const files = await readdir(demoChainsDir);
    const jsonFiles = files
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 10);
    for (const file of jsonFiles) {
      try {
        const raw = await readFile(join(demoChainsDir, file), 'utf-8');
        const data = JSON.parse(raw);
        allRuns.push(computeRunCost(data));
      } catch {}
    }
  } catch {}

  // If no chains exist, return mock data
  if (allRuns.length === 0) {
    return NextResponse.json(getMockData());
  }

  const totalTokens = allRuns.reduce((s, r) => s + r.totalTokens, 0);
  const totalCost = allRuns.reduce((s, r) => s + r.cost, 0);
  const avgCostPerUseful =
    allRuns.reduce((s, r) => s + r.costPerUseful, 0) / allRuns.length;
  const avgQuality =
    allRuns.reduce((s, r) => s + r.quality, 0) / allRuns.length;
  const avgVerificationRate =
    allRuns.reduce((s, r) => s + r.verificationRate, 0) / allRuns.length;

  const sorted = [...allRuns].sort((a, b) => a.cost - b.cost);

  const result: CostAnalysis = {
    runs: allRuns.length,
    totalTokens,
    totalCost,
    avgCostPerUseful,
    cheapestRun: {
      runId: sorted[0].runId,
      cost: sorted[0].cost,
      quality: sorted[0].quality,
    },
    mostExpensiveRun: {
      runId: sorted[sorted.length - 1].runId,
      cost: sorted[sorted.length - 1].cost,
      quality: sorted[sorted.length - 1].quality,
    },
    avgQuality,
    avgVerificationRate,
  };

  return NextResponse.json(result);
}
