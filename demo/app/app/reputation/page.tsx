'use client';

import { useState, useEffect } from 'react';

const mono = { fontFamily: "'IBM Plex Mono', 'Courier New', monospace" } as const;
const inter = { fontFamily: 'Inter, sans-serif' } as const;

interface ChainSummary {
  id: string;
  source: string;
  agentId: string;
  receiptCount: number;
  rootHash: string;
  quality: number | null;
  timestamp: number;
}

interface AgentStats {
  agentId: string;
  runs: number;
  avgVerification: number;
  avgQuality: number;
  totalReceipts: number;
  lastSeen: number;
}

function scoreColor(value: number): string {
  return value >= 70 ? 'var(--green)' : value >= 40 ? 'var(--amber)' : 'var(--red)';
}

function Nav() {
  return (
    <nav style={{ padding: '0.6rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <a href="/" style={{ ...mono, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>R.E.C.E.I.P.T.</a>
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
        <a href="/" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>Home</a>
        <a href="/demo" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>Demo</a>
        <a href="/verify" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>Verify</a>
        <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>GitHub</a>
      </div>
    </nav>
  );
}

function SummaryCard({ value, label, sub, color }: { value: string; label: string; sub?: string; color?: string }) {
  return (
    <div style={{ padding: '1.2rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', textAlign: 'center' }}>
      <div style={{ ...mono, fontSize: '2rem', fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
      <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.3rem' }}>{label}</div>
      {sub && <div style={{ ...inter, fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>{sub}</div>}
    </div>
  );
}

function computeStats(chains: ChainSummary[]): { agents: AgentStats[]; totalRuns: number; avgVerification: number; avgQuality: number; totalReceipts: number } {
  const byAgent = new Map<string, ChainSummary[]>();
  for (const c of chains) {
    const list = byAgent.get(c.agentId) ?? [];
    list.push(c);
    byAgent.set(c.agentId, list);
  }

  const agents: AgentStats[] = [];
  for (const [agentId, agentChains] of byAgent) {
    const qualityChains = agentChains.filter(c => c.quality !== null);
    const verifiedChains = agentChains.filter(c => c.rootHash && c.rootHash.length > 0);
    agents.push({
      agentId,
      runs: agentChains.length,
      avgVerification: agentChains.length > 0 ? Math.round((verifiedChains.length / agentChains.length) * 100) : 0,
      avgQuality: qualityChains.length > 0 ? Math.round(qualityChains.reduce((s, c) => s + (c.quality ?? 0), 0) / qualityChains.length) : 0,
      totalReceipts: agentChains.reduce((s, c) => s + c.receiptCount, 0),
      lastSeen: Math.max(...agentChains.map(c => c.timestamp)),
    });
  }

  agents.sort((a, b) => b.avgVerification - a.avgVerification || b.avgQuality - a.avgQuality);

  const totalRuns = chains.length;
  const allVerified = chains.filter(c => c.rootHash && c.rootHash.length > 0);
  const avgVerification = totalRuns > 0 ? Math.round((allVerified.length / totalRuns) * 100) : 0;
  const qualityChains = chains.filter(c => c.quality !== null);
  const avgQuality = qualityChains.length > 0 ? Math.round(qualityChains.reduce((s, c) => s + (c.quality ?? 0), 0) / qualityChains.length) : 0;
  const totalReceipts = chains.reduce((s, c) => s + c.receiptCount, 0);

  return { agents, totalRuns, avgVerification, avgQuality, totalReceipts };
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface RunPoint { index: number; verRate: number; quality: number; }

function computeRunPoints(chains: ChainSummary[]): RunPoint[] {
  const sorted = [...chains].sort((a, b) => a.timestamp - b.timestamp);
  return sorted.map((c, i) => ({
    index: i + 1,
    verRate: c.rootHash && c.rootHash.length > 0 ? 100 : 0,
    quality: c.quality ?? 0,
  }));
}

function barColor(rate: number): string {
  return rate >= 80 ? 'var(--green)' : rate >= 60 ? 'var(--amber)' : 'var(--red)';
}

function trendColor(runs: RunPoint[]): string {
  if (runs.length < 2) return 'var(--green)';
  const half = Math.floor(runs.length / 2);
  const recent = runs.slice(half);
  const earlier = runs.slice(0, half);
  const avgRecent = recent.reduce((s, r) => s + r.verRate, 0) / recent.length;
  const avgEarlier = earlier.reduce((s, r) => s + r.verRate, 0) / earlier.length;
  const drop = avgEarlier - avgRecent;
  if (drop > 15) return 'var(--red)';
  if (drop > 5) return 'var(--amber)';
  return 'var(--green)';
}

function DegradationTracker({ chains }: { chains: ChainSummary[] }) {
  const last10 = [...chains].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
  const runs = computeRunPoints(last10);
  if (runs.length === 0) return null;

  const avgVer = Math.round(runs.reduce((s, r) => s + r.verRate, 0) / runs.length);
  const avgQual = Math.round(runs.reduce((s, r) => s + r.quality, 0) / runs.length);
  const color = trendColor(runs);

  // Find first notable drop
  let dropNote = '';
  for (let i = 1; i < runs.length; i++) {
    if (runs[i - 1].verRate >= 80 && runs[i].verRate < 80) {
      dropNote = `Verification rate dropped from ${runs[i - 1].verRate}% to ${runs[i].verRate}% on run #${runs[i].index} — fabrication detected`;
      break;
    }
  }

  return (
    <div style={{ marginTop: '2rem' }}>
      <h2 style={{ ...inter, fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.8rem', color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>
        Degradation Tracking
      </h2>
      <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '60px', marginBottom: '0.6rem' }}>
          {runs.map((r) => (
            <div key={r.index} title={`Run #${r.index}: ${r.verRate}%`} style={{
              flex: 1, maxWidth: '24px', height: `${Math.max(r.verRate, 4)}%`,
              background: barColor(r.verRate), borderRadius: '2px 2px 0 0', minHeight: '2px',
              transition: 'height 0.2s',
            }} />
          ))}
        </div>
        <div style={{ ...mono, fontSize: '0.68rem', color, fontWeight: 600, marginBottom: '0.25rem' }}>
          Last {runs.length} runs: avg verification rate {avgVer}%, avg quality {avgQual}/100
        </div>
        {dropNote && (
          <div style={{ ...mono, fontSize: '0.62rem', color: 'var(--red)', marginTop: '0.2rem' }}>{dropNote}</div>
        )}
      </div>
    </div>
  );
}

interface CostData {
  runs: number;
  totalTokens: number;
  totalCost: number;
  avgCostPerUseful: number;
  avgQuality: number;
  avgVerificationRate: number;
  cheapestRun: { runId: string; cost: number; quality: number } | null;
  mostExpensiveRun: { runId: string; cost: number; quality: number } | null;
}

function CostAnalysis({ data }: { data: CostData }) {
  return (
    <div style={{ marginTop: '2rem' }}>
      <h2 style={{ ...inter, fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.8rem', color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>
        Cost Analysis
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem', marginBottom: '0.8rem' }}>
        <div style={{ padding: '0.8rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ ...mono, fontSize: '1.3rem', fontWeight: 700, color: data.avgCostPerUseful < 0.002 ? 'var(--green)' : data.avgCostPerUseful < 0.01 ? 'var(--amber)' : 'var(--red)' }}>
            ${data.avgCostPerUseful.toFixed(4)}
          </div>
          <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: '0.2rem' }}>Avg $/Useful Output</div>
        </div>
        <div style={{ padding: '0.8rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ ...mono, fontSize: '1.3rem', fontWeight: 700, color: 'var(--text)' }}>
            {data.totalTokens.toLocaleString()}
          </div>
          <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: '0.2rem' }}>Total Tokens</div>
        </div>
        <div style={{ padding: '0.8rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ ...mono, fontSize: '1.3rem', fontWeight: 700, color: 'var(--text)' }}>
            ${data.totalCost.toFixed(4)}
          </div>
          <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: '0.2rem' }}>Total Cost</div>
        </div>
      </div>
      {data.cheapestRun && data.mostExpensiveRun && (
        <div style={{ ...mono, fontSize: '0.62rem', color: 'var(--text-muted)', lineHeight: 1.8, padding: '0.5rem', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)' }}>
          Best ROI: ${data.cheapestRun.cost.toFixed(4)} at quality {data.cheapestRun.quality}/100
          <br />
          Worst ROI: ${data.mostExpensiveRun.cost.toFixed(4)} at quality {data.mostExpensiveRun.quality}/100
        </div>
      )}
    </div>
  );
}

export default function ReputationPage() {
  const [chains, setChains] = useState<ChainSummary[]>([]);
  const [costData, setCostData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/chains').then(r => r.json()),
      fetch('/api/cost-analysis').then(r => r.json()).catch(() => null),
    ]).then(([chainsData, costs]) => {
      setChains(chainsData.chains ?? []);
      if (costs) setCostData(costs);
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const { agents, totalRuns, avgVerification, avgQuality, totalReceipts } = computeStats(chains);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @media (max-width: 640px) {
          .rep-content { padding: 1.5rem 1rem !important; }
          .rep-table { font-size: 0.65rem !important; }
          .rep-table th, .rep-table td { padding: 0.3rem 0.4rem !important; }
        }
      `}</style>
      <Nav />

      <div className="rep-content" style={{ maxWidth: '780px', margin: '0 auto', width: '100%', padding: '2rem 2rem 3rem' }}>
        <h1 style={{ ...inter, fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Agent Reputation</h1>
        <p style={{ ...inter, fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          Verification rates and quality scores across all runs
        </p>

        {loading && (
          <div style={{ textAlign: 'center', padding: '3rem', ...mono, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Loading chains...</div>
        )}

        {error && (
          <div style={{ padding: '0.8rem', background: 'rgba(220,38,38,0.06)', border: '1px solid var(--red)', borderRadius: '8px', ...mono, fontSize: '0.72rem', color: 'var(--red)', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {!loading && !error && chains.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-dim)' }}>
            <div style={{ ...mono, fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text)' }}>No Data Yet</div>
            <p style={{ ...inter, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.75 }}>
              No chains recorded yet. Run the demo to generate your first chain.
            </p>
          </div>
        )}

        {!loading && chains.length > 0 && (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.8rem', marginBottom: '2rem' }}>
              <SummaryCard value={String(totalRuns)} label="Total Runs" sub={`${agents.length} unique agent${agents.length !== 1 ? 's' : ''}`} />
              <SummaryCard value={`${avgVerification}%`} label="Avg Verification Rate" color={scoreColor(avgVerification)} sub="Chains with valid root hash" />
              <SummaryCard value={`${avgQuality}`} label="Avg Quality Score" color={scoreColor(avgQuality)} sub="Composite usefulness score" />
              <SummaryCard value={String(totalReceipts)} label="Total Receipts" sub="Across all chains" />
            </div>

            {/* Agent leaderboard */}
            <h2 style={{ ...inter, fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.8rem', color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>
              Agent Leaderboard
            </h2>
            <table className="rep-table" style={{ width: '100%', borderCollapse: 'collapse', ...mono, fontSize: '0.72rem', marginBottom: '1rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {['Agent ID', 'Runs', 'Avg Verification', 'Avg Quality', 'Total Receipts', 'Last Seen'].map(col => (
                    <th key={col} style={{ textAlign: col === 'Agent ID' ? 'left' : 'center', padding: '0.4rem 0.6rem', color: 'var(--text-dim)' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agents.map(a => (
                  <tr key={a.agentId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem 0.6rem', fontWeight: 600, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.agentId}>{a.agentId}</td>
                    <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem' }}>{a.runs}</td>
                    <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem' }}>
                      <span style={{ ...mono, fontWeight: 700, color: scoreColor(a.avgVerification) }}>{a.avgVerification}%</span>
                    </td>
                    <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem' }}>
                      <span style={{ ...mono, fontWeight: 700, color: scoreColor(a.avgQuality) }}>{a.avgQuality}</span>
                    </td>
                    <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem' }}>{a.totalReceipts}</td>
                    <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem', color: 'var(--text-muted)' }}>{formatDate(a.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <DegradationTracker chains={chains} />
            {costData && <CostAnalysis data={costData} />}
          </>
        )}
      </div>

      <footer style={{ marginTop: 'auto', padding: '0.8rem 1.5rem', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.68rem', color: 'var(--text-dim)', ...inter }}>
        <div style={{ display: 'flex', gap: '1.2rem' }}>
          {[['Live', '/demo'], ['Team', '/team'], ['Verify', '/verify'], ['Eval', '/eval']].map(([label, href]) =>
            <a key={href} href={href} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{label}</a>
          )}
          <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>GitHub</a>
        </div>
        <span style={{ ...mono, fontSize: '0.6rem' }}>Built for multi-agent systems.</span>
      </footer>
    </div>
  );
}
