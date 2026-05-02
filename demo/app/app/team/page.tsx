'use client';

import { useState, useEffect, useCallback } from 'react';

const mono = { fontFamily: "'IBM Plex Mono', 'Courier New', monospace" } as const;
const inter = { fontFamily: 'Inter, sans-serif' } as const;

const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_RECEIPT_REGISTRY_ADDRESS ?? '0x717D062E47898441a51EAdcA40873190A339B328';
const OG_RPC = 'https://evmrpc.0g.ai';
const OG_CHAIN_ID = '0x4115'; // 16661

interface OnChainEntry {
  rootHash: string;
  qualityScore: number;
  agentId: string;
  source: string;
  receiptCount: number;
  timestamp: number;
  anchorRef: string;
}

interface ChainSummary {
  id: string;
  source: 'claude-code' | 'openclaw' | 'cursor' | 'demo';
  agentId: string;
  receiptCount: number;
  rootHash: string;
  quality: number | null;
  timestamp: number;
  receipts?: any[];
  onChain?: boolean;
}

interface SourceStatus {
  available: boolean;
  count: number;
}

const SOURCE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  'claude-code': { label: 'Claude Code', color: '#c084fc', bg: 'rgba(192,132,252,0.08)' },
  'openclaw': { label: 'OpenClaw', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)' },
  'cursor': { label: 'Cursor', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  'demo': { label: 'Demo', color: 'var(--text-dim)', bg: 'var(--surface)' },
  'sdk': { label: 'SDK', color: 'var(--green)', bg: 'rgba(34,197,94,0.08)' },
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
  mcp_tool: 'MCP Tool',
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

async function switchTo0GNetwork() {
  const eth = (window as any).ethereum;
  if (!eth) return;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: OG_CHAIN_ID }] });
  } catch (err: any) {
    if (err.code === 4902) {
      try {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: OG_CHAIN_ID,
            chainName: '0G Mainnet',
            rpcUrls: [OG_RPC],
            nativeCurrency: { name: 'A0GI', symbol: 'A0GI', decimals: 18 },
            blockExplorerUrls: ['https://chainscan.0g.ai'],
          }],
        });
      } catch {}
    }
  }
}

// Read chains from contract via JSON-RPC eth_call
async function readChainsFromContract(wallet: string): Promise<OnChainEntry[]> {
  try {
    // Use ethers-style ABI encoding. We need keccak256 for function selector.
    // Since we can't use keccak256 in browser without a lib, use a minimal approach:
    // Import the function selector from the compiled ABI.
    // Actually the simplest: call via a JSON-RPC provider and manually encode.

    // getChains(address) selector: keccak256("getChains(address)") first 4 bytes
    // We'll compute this from the ABI using the contract's interface.
    // Simplest: use eth_call with raw data.

    // Function: getChains(address)
    // Signature hash: we need to compute keccak256. Let's use a known value.
    // keccak256("getChains(address)") = we can get this from solc output.

    // Alternative: use the JSON-RPC with MetaMask's provider, which handles ABI encoding.
    // But MetaMask doesn't expose an ABI encoder directly.

    // Best approach for hackathon: use a tiny ethers import or compute manually.
    // Since we already have ethers in the monorepo, let's use a different strategy:
    // make an API call to our server which uses ethers to query the contract.

    const res = await fetch(`/api/registry?wallet=${wallet}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.chains ?? [];
  } catch {
    return [];
  }
}

export default function DashboardPage() {
  const [chains, setChains] = useState<ChainSummary[]>([]);
  const [onChainEntries, setOnChainEntries] = useState<OnChainEntry[]>([]);
  const [sources, setSources] = useState<Record<string, SourceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [shareCopiedId, setShareCopiedId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [registering, setRegistering] = useState<string | null>(null);
  const [totalOnChain, setTotalOnChain] = useState<number | null>(null);

  const connectWallet = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) { setError('No wallet found. Install MetaMask or a browser wallet.'); return; }
    setWalletConnecting(true);
    try {
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      if (accounts[0]) {
        setWallet(accounts[0]);
        localStorage.setItem('receipt-wallet', accounts[0]);
        await switchTo0GNetwork();
      }
    } catch { setError('Wallet connection cancelled.'); }
    setWalletConnecting(false);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('receipt-wallet');
    if (saved) setWallet(saved);
  }, []);

  // Fetch on-chain entries when wallet changes
  useEffect(() => {
    if (!wallet) { setOnChainEntries([]); return; }
    readChainsFromContract(wallet).then(entries => {
      setOnChainEntries(entries);
    });
    // Also fetch total chains
    fetch('/api/registry?total=1').then(r => r.json()).then(d => {
      if (typeof d.total === 'number') setTotalOnChain(d.total);
    }).catch(() => {});
  }, [wallet]);

  const fetchChains = useCallback(async () => {
    try {
      const url = filter ? `/api/chains?source=${filter}` : '/api/chains';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      const apiChains: ChainSummary[] = (data.chains ?? []).map((c: ChainSummary) => {
        const isOnChain = onChainEntries.some(e => e.rootHash.toLowerCase().includes(c.rootHash?.toLowerCase().slice(0, 12)));
        return { ...c, onChain: isOnChain };
      });

      // Add on-chain entries that don't exist in API
      const onChainOnly: ChainSummary[] = onChainEntries
        .filter(e => !apiChains.some(c => c.rootHash && e.rootHash.toLowerCase().includes(c.rootHash.toLowerCase().slice(0, 12))))
        .map((e, i) => ({
          id: `onchain-${i}`,
          source: (e.source as any) || 'sdk',
          agentId: e.agentId || 'unknown',
          receiptCount: e.receiptCount,
          rootHash: e.rootHash,
          quality: e.qualityScore > 0 ? e.qualityScore : null,
          timestamp: e.timestamp * 1000,
          onChain: true,
        }));

      setChains([...apiChains, ...onChainOnly].sort((a, b) => b.timestamp - a.timestamp));
      setSources(data.sources ?? {});
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load chains');
    } finally {
      setLoading(false);
    }
  }, [filter, onChainEntries]);

  useEffect(() => {
    fetchChains();
    const interval = setInterval(fetchChains, 15000);
    return () => clearInterval(interval);
  }, [fetchChains]);

  const registerOnChain = useCallback(async (chain: ChainSummary) => {
    if (!wallet) { setError('Connect wallet first'); return; }
    const eth = (window as any).ethereum;
    if (!eth) { setError('No wallet found'); return; }

    setRegistering(chain.id);
    try {
      await switchTo0GNetwork();

      const res = await fetch('/api/registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rootHash: chain.rootHash,
          qualityScore: chain.quality ?? 0,
          agentId: chain.agentId,
          source: chain.source,
          receiptCount: chain.receiptCount,
          wallet,
        }),
      });

      if (!res.ok) throw new Error('Failed to encode transaction');
      const { txData } = await res.json();

      const toAddr = REGISTRY_ADDRESS.trim();
      const txHash = await eth.request({
        method: 'eth_sendTransaction',
        params: [{
          from: wallet,
          to: toAddr,
          data: txData,
        }],
      });

      // Wait for confirmation
      let confirmed = false;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const receipt = await eth.request({ method: 'eth_getTransactionReceipt', params: [txHash] });
        if (receipt) { confirmed = true; break; }
      }

      if (confirmed) {
        // Refresh on-chain data
        const entries = await readChainsFromContract(wallet);
        setOnChainEntries(entries);
      }
    } catch (err: any) {
      if (err.code !== 4001) {
        setError(err.message ?? 'Registration failed');
      }
    } finally {
      setRegistering(null);
    }
  }, [wallet]);

  const verifyChain = useCallback((chain: ChainSummary) => {
    if (!chain.receipts?.length) return;
    window.location.href = `/verify?id=${encodeURIComponent(chain.id)}&auto=1`;
  }, []);

  const shareChain = useCallback((chain: ChainSummary) => {
    const url = `${window.location.origin}/verify?id=${encodeURIComponent(chain.id)}&auto=1`;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopiedId(chain.id);
      setTimeout(() => setShareCopiedId(null), 2000);
    });
  }, []);

  const totalReceipts = chains.reduce((s, c) => s + c.receiptCount, 0);
  const avgQuality = chains.filter(c => c.quality !== null).reduce((s, c, _, a) => s + (c.quality ?? 0) / a.length, 0);
  const onChainCount = chains.filter(c => c.onChain).length;

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
          <a href="/team" style={{ fontSize: '0.75rem', color: 'var(--text)', textDecoration: 'none', ...inter, fontWeight: 600 }}>Dashboard</a>
          <a href="/demo" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>Demo</a>
          <a href="/verify" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>Verify</a>
          <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>GitHub</a>
        </div>
      </nav>

      {/* Header */}
      <header style={{ padding: '1.5rem 2rem 1rem', maxWidth: '860px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, ...inter, marginBottom: '0.4rem' }}>Your Agents</h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', ...inter, lineHeight: 1.6, maxWidth: '520px' }}>
              Connect your wallet. Register chains on 0G Mainnet. No database, no server state.
            </p>
          </div>
          {wallet ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.8rem', background: 'var(--surface)', border: '1px solid var(--green)', borderRadius: '8px', flexShrink: 0 }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 4px rgba(34,197,94,0.4)' }} />
              <div>
                <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-dim)' }}>0G Mainnet</div>
                <div style={{ ...mono, fontSize: '0.7rem', color: 'var(--text)', fontWeight: 600 }}>{wallet.slice(0, 6)}...{wallet.slice(-4)}</div>
              </div>
              <button onClick={() => { setWallet(null); localStorage.removeItem('receipt-wallet'); setOnChainEntries([]); }} style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem' }}>x</button>
            </div>
          ) : (
            <button
              onClick={connectWallet}
              disabled={walletConnecting}
              style={{
                ...mono, fontSize: '0.75rem', fontWeight: 600,
                padding: '0.6rem 1.2rem', borderRadius: '8px',
                border: '2px solid var(--text)', background: 'var(--text)',
                color: '#fff', cursor: walletConnecting ? 'wait' : 'pointer',
                flexShrink: 0, opacity: walletConnecting ? 0.6 : 1,
              }}
            >
              {walletConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </header>

      <div style={{ maxWidth: '860px', margin: '0 auto', width: '100%', padding: '0 2rem 3rem' }}>
        {/* Stats */}
        <div className="team-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Chains', value: chains.length, sub: wallet ? 'linked to wallet' : 'from all sources' },
            { label: 'Receipts', value: totalReceipts, sub: 'across all chains' },
            { label: 'Avg Quality', value: chains.some(c => c.quality !== null) ? Math.round(avgQuality) : '-', sub: '/100', color: chains.some(c => c.quality !== null) ? qualityColor(avgQuality) : undefined },
            { label: 'On-Chain', value: onChainCount, sub: totalOnChain !== null ? `of ${totalOnChain} total` : '0G Mainnet', color: onChainCount > 0 ? 'var(--green)' : undefined },
          ].map(s => (
            <div key={s.label} style={{ padding: '0.8rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>{s.label}</div>
              <div style={{ ...mono, fontSize: '1.4rem', fontWeight: 700, color: s.color ?? 'var(--text)' }}>{s.value}</div>
              <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)' }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Contract info bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.8rem',
          background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.15)',
          borderRadius: '6px', marginBottom: '1.5rem', flexWrap: 'wrap',
        }}>
          <span style={{ ...mono, fontSize: '0.55rem', color: 'var(--researcher)', fontWeight: 700 }}>REGISTRY</span>
          <a
            href={`https://chainscan.0g.ai/address/${REGISTRY_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-muted)', textDecoration: 'none' }}
          >
            {REGISTRY_ADDRESS.slice(0, 10)}...{REGISTRY_ADDRESS.slice(-6)}
          </a>
          <span style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)' }}>0G Mainnet (16661)</span>
          <span style={{ marginLeft: 'auto', ...mono, fontSize: '0.5rem', color: 'var(--text-dim)' }}>
            Chains are stored on-chain, not in a database
          </span>
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
            <div style={{ ...mono, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>
              {filter ? `No ${SOURCE_LABELS[filter]?.label ?? filter} chains` : 'No chains yet'}
            </div>
            <p style={{ ...inter, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '480px', margin: '0 auto 1.5rem' }}>
              {filter
                ? `No chains from ${SOURCE_LABELS[filter]?.label ?? filter} found. Try running a chain with that agent, or clear the filter to see all chains.`
                : 'Run the demo to generate your first chain, then connect your wallet to register it on 0G Mainnet.'}
            </p>
            {!filter && (
              <>
                {/* Step-by-step guide */}
                <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.6rem 1rem', background: 'var(--bg)', borderRadius: '6px',
                    border: '1px solid var(--border)',
                  }}>
                    <span style={{ ...mono, fontSize: '0.7rem', fontWeight: 700, color: 'var(--researcher)', width: '1.3rem', height: '1.3rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--researcher)' }}>1</span>
                    <a href="/demo" style={{ ...mono, fontSize: '0.72rem', color: 'var(--researcher)', textDecoration: 'none', fontWeight: 600 }}>Run the Demo</a>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.6rem 1rem', background: 'var(--bg)', borderRadius: '6px',
                    border: '1px solid var(--border)',
                  }}>
                    <span style={{ ...mono, fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', width: '1.3rem', height: '1.3rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--border)' }}>2</span>
                    <span style={{ ...mono, fontSize: '0.72rem', color: 'var(--text-muted)' }}>Chain appears here</span>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.6rem 1rem', background: 'var(--bg)', borderRadius: '6px',
                    border: '1px solid var(--border)',
                  }}>
                    <span style={{ ...mono, fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', width: '1.3rem', height: '1.3rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--border)' }}>3</span>
                    <span style={{ ...mono, fontSize: '0.72rem', color: 'var(--text-muted)' }}>Register On-Chain</span>
                  </div>
                </div>

                {/* Agent setup cards */}
                <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.8rem' }}>Or connect an agent</div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'left', padding: '0.8rem 1rem', background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)', maxWidth: '220px', width: '100%' }}>
                    <div style={{ ...mono, fontSize: '0.6rem', color: '#c084fc', fontWeight: 700, marginBottom: '0.3rem' }}>Claude Code</div>
                    <code style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1.7, display: 'block' }}>
                      npx receipt init --claude-code
                    </code>
                    <div style={{ ...inter, fontSize: '0.55rem', color: 'var(--text-dim)', marginTop: '0.3rem' }}>Chains publish to dashboard automatically</div>
                  </div>
                  <div style={{ textAlign: 'left', padding: '0.8rem 1rem', background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)', maxWidth: '220px', width: '100%' }}>
                    <div style={{ ...mono, fontSize: '0.6rem', color: '#60a5fa', fontWeight: 700, marginBottom: '0.3rem' }}>OpenClaw</div>
                    <code style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1.7, display: 'block' }}>
                      openclaw plugins install<br />
                      openclaw-plugin-receipt
                    </code>
                    <div style={{ ...inter, fontSize: '0.55rem', color: 'var(--text-dim)', marginTop: '0.3rem' }}>Every agent run publishes a chain</div>
                  </div>
                  <div style={{ textAlign: 'left', padding: '0.8rem 1rem', background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)', maxWidth: '220px', width: '100%' }}>
                    <div style={{ ...mono, fontSize: '0.6rem', color: '#f59e0b', fontWeight: 700, marginBottom: '0.3rem' }}>Cursor</div>
                    <code style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1.7, display: 'block' }}>
                      npx receipt init --cursor
                    </code>
                    <div style={{ ...inter, fontSize: '0.55rem', color: 'var(--text-dim)', marginTop: '0.3rem' }}>File watcher creates receipts</div>
                  </div>
                </div>
              </>
            )}
            {filter && (
              <button
                onClick={() => setFilter(null)}
                style={{
                  ...mono, fontSize: '0.72rem', fontWeight: 600,
                  padding: '0.5rem 1.2rem', borderRadius: '6px',
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-muted)', cursor: 'pointer',
                }}
              >
                Clear filter
              </button>
            )}
          </div>
        )}

        {/* Chain list */}
        {chains.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {chains.map(chain => {
              const src = SOURCE_LABELS[chain.source] ?? SOURCE_LABELS.demo;
              const expanded = expandedId === chain.id;
              const isRegistering = registering === chain.id;
              return (
                <div key={chain.id} style={{
                  background: 'var(--surface)',
                  border: `1px solid ${expanded ? 'var(--researcher)' : chain.onChain ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
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
                      {/* On-chain badge */}
                      {chain.onChain && (
                        <span style={{
                          ...mono, fontSize: '0.48rem', fontWeight: 700,
                          padding: '0.15rem 0.4rem', borderRadius: '4px',
                          background: 'rgba(34,197,94,0.08)', color: 'var(--green)',
                          border: '1px solid rgba(34,197,94,0.2)', flexShrink: 0,
                        }}>
                          ON-CHAIN
                        </span>
                      )}
                      {/* Agent + time */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ ...mono, fontSize: '0.72rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {chain.agentId}
                        </div>
                        <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                          <span>{timeAgo(chain.timestamp)} &middot; {chain.receiptCount} receipt{chain.receiptCount !== 1 ? 's' : ''}</span>
                          {chain.receipts && (() => {
                            const teeCount = chain.receipts.filter((r: any) => r.attestation).length;
                            return teeCount > 0 ? <span style={{ color: 'var(--green)' }}>&middot; {teeCount} TEE</span> : null;
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
                        {/* Register on-chain button */}
                        {wallet && !chain.onChain && chain.rootHash && (
                          <button
                            onClick={(e) => { e.stopPropagation(); registerOnChain(chain); }}
                            disabled={isRegistering}
                            style={{
                              ...mono, fontSize: '0.65rem', fontWeight: 600,
                              padding: '0.4rem 0.8rem', borderRadius: '4px',
                              border: 'none', background: 'var(--researcher)',
                              color: '#fff', cursor: isRegistering ? 'wait' : 'pointer',
                              opacity: isRegistering ? 0.6 : 1,
                            }}
                          >
                            {isRegistering ? 'Signing...' : 'Register On-Chain'}
                          </button>
                        )}
                        {chain.onChain && (
                          <a
                            href={`https://chainscan.0g.ai/address/${REGISTRY_ADDRESS}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              ...mono, fontSize: '0.65rem', fontWeight: 600,
                              padding: '0.4rem 0.8rem', borderRadius: '4px',
                              border: '1px solid var(--green)', background: 'rgba(34,197,94,0.06)',
                              color: 'var(--green)', cursor: 'pointer', textDecoration: 'none',
                              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                            }}
                          >
                            View on 0G Explorer
                          </a>
                        )}
                        {chain.receipts && chain.receipts.length > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); verifyChain(chain); }}
                            style={{
                              ...mono, fontSize: '0.65rem', fontWeight: 600,
                              padding: '0.4rem 0.8rem', borderRadius: '4px',
                              border: 'none', background: 'var(--green)',
                              color: '#fff', cursor: 'pointer',
                            }}
                          >
                            Verify
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); shareChain(chain); }}
                          style={{
                            ...mono, fontSize: '0.65rem', fontWeight: 600,
                            padding: '0.4rem 0.8rem', borderRadius: '4px',
                            border: `1px solid ${shareCopiedId === chain.id ? 'var(--green)' : 'var(--researcher)'}`,
                            background: shareCopiedId === chain.id ? 'rgba(22,163,74,0.06)' : 'rgba(37,99,235,0.06)',
                            color: shareCopiedId === chain.id ? 'var(--green)' : 'var(--researcher)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {shareCopiedId === chain.id ? 'Link Copied' : 'Share'}
                        </button>
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
          <a href="/team" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Dashboard</a>
          <a href="/demo" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Demo</a>
          <a href="/verify" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Verify</a>
          <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>GitHub</a>
        </div>
        <span style={{ ...mono, fontSize: '0.6rem' }}>
          ReceiptRegistry on 0G Mainnet
        </span>
      </footer>
    </div>
  );
}
