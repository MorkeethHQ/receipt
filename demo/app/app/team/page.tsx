'use client';

import { useState, useEffect, useCallback } from 'react';

const mono = { fontFamily: "'IBM Plex Mono', 'Courier New', monospace" } as const;
const inter = { fontFamily: 'Inter, sans-serif' } as const;

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

interface SourceStatus {
  available: boolean;
  count: number;
}

const SOURCE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  'claude-code': { label: 'Claude Code', color: '#c084fc', bg: 'rgba(192,132,252,0.08)' },
  'openclaw': { label: 'OpenClaw', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)' },
  'demo': { label: 'Demo', color: 'var(--text-dim)', bg: 'var(--surface)' },
};

const ACTION_LABELS: Record<string, string> = {
  file_read: 'File Read',
  api_call: 'API Call',
  llm_call: 'LLM Inference',
  decision: 'Decision',
  output: 'Output',
  usefulness_review: 'Review',
  context_read: 'Context',
  message_send: 'Message',
  tool_call: 'Tool Call',
};

function qualityColor(q: number): string {
  if (q >= 70) return 'var(--green)';
  if (q >= 40) return 'var(--amber)';
  return 'var(--red)';
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function TeamPage() {
  const [chains, setChains] = useState<ChainSummary[]>([]);
  const [sources, setSources] = useState<Record<string, SourceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const fetchChains = useCallback(async () => {
    try {
      const url = filter ? `/api/chains?source=${filter}` : '/api/chains';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      setChains(data.chains ?? []);
      setSources(data.sources ?? {});
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load chains');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchChains();
    const interval = setInterval(fetchChains, 15000);
    return () => clearInterval(interval);
  }, [fetchChains]);

  const verifyChain = useCallback((chain: ChainSummary) => {
    if (!chain.receipts?.length) return;
    sessionStorage.setItem('receipt-verify-chain', JSON.stringify(chain.receipts));
    window.location.href = '/verify?from=session&auto=1';
  }, []);

  const totalReceipts = chains.reduce((s, c) => s + c.receiptCount, 0);
  const avgQuality = chains.filter(c => c.quality !== null).reduce((s, c, _, a) => s + (c.quality ?? 0) / a.length, 0);
  const sourceCount = new Set(chains.map(c => c.source)).size;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @media (max-width: 640px) {
          .team-stats { grid-template-columns: 1fr 1fr !important; }
          .team-filters { flex-direction: column !important; }
          .team-chain-header { flex-direction: column !important; align-items: flex-start !important; }
        }
      `}</style>

      {/* Nav */}
      <nav style={{ padding: '0.6rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <a href="/" style={{ ...mono, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>R.E.C.E.I.P.T.</a>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <a href="/" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>Home</a>
          <a href="/demo" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>Live</a>
          <a href="/team" style={{ fontSize: '0.75rem', color: 'var(--text)', textDecoration: 'none', ...inter, fontWeight: 600 }}>Team</a>
          <a href="/verify" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>Verify</a>
          <a href="/eval" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>Eval</a>
          <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>GitHub</a>
        </div>
      </nav>

      {/* Header */}
      <header style={{ padding: '1.5rem 2rem 1rem', maxWidth: '860px', margin: '0 auto', width: '100%' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, ...inter, marginBottom: '0.4rem' }}>Team Chains</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', ...inter, lineHeight: 1.6 }}>
          Every agent on your team — Claude Code, OpenClaw, or any RECEIPT-enabled tool — generates
          cryptographic receipt chains. This is the feed. Every action verified, every output scored.
        </p>
      </header>

      <div style={{ maxWidth: '860px', margin: '0 auto', width: '100%', padding: '0 2rem 3rem' }}>
        {/* Stats */}
        <div className="team-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Chains', value: chains.length, sub: 'total' },
            { label: 'Receipts', value: totalReceipts, sub: 'across all chains' },
            { label: 'Avg Quality', value: chains.some(c => c.quality !== null) ? Math.round(avgQuality) : '—', sub: '/100', color: chains.some(c => c.quality !== null) ? qualityColor(avgQuality) : undefined },
            { label: 'Sources', value: sourceCount, sub: `agent tool${sourceCount !== 1 ? 's' : ''}` },
          ].map(s => (
            <div key={s.label} style={{ padding: '0.8rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>{s.label}</div>
              <div style={{ ...mono, fontSize: '1.4rem', fontWeight: 700, color: s.color ?? 'var(--text)' }}>{s.value}</div>
              <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)' }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Source filters */}
        <div className="team-filters" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-dim)', marginRight: '0.3rem' }}>Filter:</span>
          <button
            onClick={() => setFilter(null)}
            style={{
              ...mono, fontSize: '0.65rem', padding: '0.3rem 0.7rem', borderRadius: '4px', cursor: 'pointer',
              border: `1px solid ${filter === null ? 'var(--text)' : 'var(--border)'}`,
              background: filter === null ? 'var(--text)' : 'transparent',
              color: filter === null ? '#fff' : 'var(--text-muted)',
              fontWeight: filter === null ? 700 : 500,
            }}
          >
            All
          </button>
          {Object.entries(SOURCE_LABELS).map(([key, info]) => (
            <button
              key={key}
              onClick={() => setFilter(filter === key ? null : key)}
              style={{
                ...mono, fontSize: '0.65rem', padding: '0.3rem 0.7rem', borderRadius: '4px', cursor: 'pointer',
                border: `1px solid ${filter === key ? info.color : 'var(--border)'}`,
                background: filter === key ? info.bg : 'transparent',
                color: filter === key ? info.color : 'var(--text-muted)',
                fontWeight: filter === key ? 700 : 500,
              }}
            >
              {info.label}
              {sources[key === 'claude-code' ? 'claudeCode' : key] && (sources[key === 'claude-code' ? 'claudeCode' : key] as SourceStatus)?.count > 0 && (
                <span style={{ marginLeft: '0.3rem', opacity: 0.6 }}>
                  ({(sources[key === 'claude-code' ? 'claudeCode' : key] as SourceStatus)?.count ?? 0})
                </span>
              )}
            </button>
          ))}
          <button
            onClick={fetchChains}
            style={{ ...mono, fontSize: '0.6rem', padding: '0.3rem 0.6rem', borderRadius: '4px', cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', marginLeft: 'auto' }}
          >
            Refresh
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)', ...mono, fontSize: '0.8rem' }}>
            Loading chains...
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: '0.8rem 1rem', background: 'rgba(220,38,38,0.05)', border: '1px solid var(--red)', borderRadius: '6px', marginBottom: '1rem', ...mono, fontSize: '0.72rem', color: 'var(--red)' }}>
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && chains.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
            <div style={{ ...mono, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>No chains yet</div>
            <p style={{ ...inter, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '440px', margin: '0 auto 1.5rem' }}>
              Set up RECEIPT on your agents and chains will appear here automatically.
            </p>
            <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'left', padding: '1rem 1.2rem', background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)', maxWidth: '260px' }}>
                <div style={{ ...mono, fontSize: '0.6rem', color: '#c084fc', fontWeight: 700, marginBottom: '0.4rem' }}>Claude Code</div>
                <code style={{ ...mono, fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1.8, display: 'block' }}>
                  npm i -g agenticproof<br />
                  receipt init --claude-code
                </code>
                <div style={{ ...inter, fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>Every tool call gets a receipt</div>
              </div>
              <div style={{ textAlign: 'left', padding: '1rem 1.2rem', background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)', maxWidth: '260px' }}>
                <div style={{ ...mono, fontSize: '0.6rem', color: '#60a5fa', fontWeight: 700, marginBottom: '0.4rem' }}>OpenClaw</div>
                <code style={{ ...mono, fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1.8, display: 'block' }}>
                  npm i agenticproof<br />
                  # add plugin to openclaw.json
                </code>
                <div style={{ ...inter, fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>Every agent run gets a chain</div>
              </div>
            </div>
            <div style={{ marginTop: '1.5rem' }}>
              <a href="/demo" style={{ ...mono, fontSize: '0.72rem', color: 'var(--researcher)', textDecoration: 'none', fontWeight: 600 }}>
                Or run the Live demo to generate a chain now &rarr;
              </a>
            </div>
          </div>
        )}

        {/* Chain list */}
        {chains.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {chains.map(chain => {
              const src = SOURCE_LABELS[chain.source] ?? SOURCE_LABELS.demo;
              const expanded = expandedId === chain.id;
              return (
                <div key={chain.id} style={{
                  background: 'var(--surface)',
                  border: `1px solid ${expanded ? 'var(--researcher)' : 'var(--border)'}`,
                  borderRadius: '8px',
                  transition: 'border-color 0.2s',
                  overflow: 'hidden',
                }}>
                  {/* Chain header */}
                  <div
                    className="team-chain-header"
                    onClick={() => setExpandedId(expanded ? null : chain.id)}
                    style={{
                      padding: '0.8rem 1rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.8rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                      {/* Source badge */}
                      <span style={{
                        ...mono, fontSize: '0.55rem', fontWeight: 700,
                        padding: '0.2rem 0.5rem', borderRadius: '4px',
                        background: src.bg, color: src.color, flexShrink: 0,
                        border: `1px solid ${src.color}20`,
                      }}>
                        {src.label}
                      </span>
                      {/* Agent + time */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ ...mono, fontSize: '0.72rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {chain.agentId}
                        </div>
                        <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                          <span>{timeAgo(chain.timestamp)} &middot; {chain.receiptCount} receipt{chain.receiptCount !== 1 ? 's' : ''}</span>
                          {chain.receipts && (() => {
                            const types: Record<string, number> = {};
                            chain.receipts.forEach((r: any) => { types[r.action?.type] = (types[r.action?.type] ?? 0) + 1; });
                            const teeCount = chain.receipts.filter((r: any) => r.attestation).length;
                            return (
                              <>
                                {teeCount > 0 && <span style={{ color: 'var(--green)' }}>&middot; {teeCount} TEE</span>}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                      {/* Quality score */}
                      {chain.quality !== null && (
                        <div style={{
                          ...mono, fontSize: '0.85rem', fontWeight: 700,
                          color: qualityColor(chain.quality),
                        }}>
                          {chain.quality}<span style={{ fontSize: '0.55rem', fontWeight: 500, color: 'var(--text-dim)' }}>/100</span>
                        </div>
                      )}
                      {/* Expand arrow */}
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#9654;</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expanded && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '0.8rem 1rem' }}>
                      {/* Root hash */}
                      <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)', marginBottom: '0.6rem', wordBreak: 'break-all' }}>
                        Root: {chain.rootHash || 'pending'}
                      </div>

                      {/* Receipt timeline */}
                      {chain.receipts && chain.receipts.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.8rem' }}>
                          {chain.receipts.slice(0, 15).map((r: any, i: number) => (
                            <div key={r.id ?? i} style={{
                              display: 'flex', alignItems: 'center', gap: '0.5rem',
                              padding: '0.3rem 0.5rem', background: 'var(--bg)', borderRadius: '4px',
                            }}>
                              <span style={{
                                ...mono, fontSize: '0.5rem', fontWeight: 700,
                                width: '1.2rem', height: '1.2rem', borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'var(--surface)', border: '1px solid var(--border)',
                                color: 'var(--text-dim)', flexShrink: 0,
                              }}>
                                {i + 1}
                              </span>
                              <span style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, width: '5rem', flexShrink: 0 }}>
                                {ACTION_LABELS[r.action?.type] ?? r.action?.type ?? '?'}
                              </span>
                              <span style={{ ...inter, fontSize: '0.58rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {r.action?.description ?? ''}
                              </span>
                              {r.attestation && (
                                <span style={{ ...mono, fontSize: '0.48rem', padding: '0.1rem 0.3rem', background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: '2px', color: 'var(--researcher)', flexShrink: 0 }}>
                                  TEE
                                </span>
                              )}
                            </div>
                          ))}
                          {chain.receipts.length > 15 && (
                            <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)', paddingLeft: '1.7rem' }}>
                              +{chain.receipts.length - 15} more receipts
                            </div>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {chain.receipts && chain.receipts.length > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); verifyChain(chain); }}
                            style={{
                              ...mono, fontSize: '0.65rem', fontWeight: 600,
                              padding: '0.4rem 0.8rem', borderRadius: '4px',
                              border: '1px solid var(--green)', background: 'rgba(22,163,74,0.06)',
                              color: 'var(--green)', cursor: 'pointer',
                            }}
                          >
                            Verify this chain
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const data = chain.receipts ?? chain;
                            navigator.clipboard.writeText(JSON.stringify(data, null, 2));
                          }}
                          style={{
                            ...mono, fontSize: '0.65rem', fontWeight: 500,
                            padding: '0.4rem 0.8rem', borderRadius: '4px',
                            border: '1px solid var(--border)', background: 'transparent',
                            color: 'var(--text-dim)', cursor: 'pointer',
                          }}
                        >
                          Copy JSON
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{
        marginTop: 'auto', padding: '0.8rem 1.5rem', borderTop: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.68rem', color: 'var(--text-dim)', ...inter,
      }}>
        <div style={{ display: 'flex', gap: '1.2rem' }}>
          <a href="/demo" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Live</a>
          <a href="/verify" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Verify</a>
          <a href="/eval" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Eval</a>
          <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>GitHub</a>
        </div>
        <span style={{ ...mono, fontSize: '0.6rem' }}>Auto-refreshes every 15s</span>
      </footer>
    </div>
  );
}
