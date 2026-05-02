'use client';

import { useState, useCallback } from 'react';

export default function LandingPage() {
  const [copied, setCopied] = useState(false);

  const copyInstall = useCallback(() => {
    navigator.clipboard.writeText('npm install agenticproof').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const mono = { fontFamily: "'IBM Plex Mono', 'Courier New', monospace" } as const;
  const inter = { fontFamily: 'Inter, sans-serif' } as const;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @media (max-width: 640px) {
          .hero-section { padding: 2.5rem 1.2rem 1.5rem !important; }
          .hero-title { font-size: 2rem !important; }
          .stats-row { flex-direction: column !important; }
          .cta-row { flex-direction: column !important; align-items: stretch !important; }
          .cta-row a, .cta-row div { text-align: center !important; }
          .layers-row { flex-direction: column !important; }
          .nav-links { gap: 1rem !important; }
        }
      `}</style>

      {/* Nav */}
      <nav style={{
        padding: '0.6rem 1.5rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <a href="/" style={{ ...mono, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>
          R.E.C.E.I.P.T.
        </a>
        <div className="nav-links" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <a href="/team" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>Dashboard</a>
          <a href="/demo" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>Demo</a>
          <a href="/verify" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>Verify</a>
          <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>GitHub</a>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero-section" style={{ padding: '4rem 2rem 2rem', textAlign: 'center', maxWidth: '680px', margin: '0 auto' }}>
        <h1 className="hero-title" style={{
          fontSize: '2.6rem', fontWeight: 700, color: 'var(--text)',
          marginBottom: '1rem', ...inter, lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}>
          AI agents are making decisions worth millions.<br />
          <span style={{ color: 'var(--text-muted)' }}>None of it is provable.</span>
        </h1>
        <p style={{
          fontSize: '1.05rem', color: 'var(--text-muted)', lineHeight: 1.7,
          marginBottom: '2rem', ...inter, maxWidth: '520px', margin: '0 auto 2rem',
        }}>
          RECEIPT is the cryptographic proof layer for AI agents. Every action signed, every output verified, every chain anchored on-chain.
        </p>

        <div onClick={copyInstall} style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.8rem',
          padding: '0.7rem 1.4rem', background: '#1a1a1a', borderRadius: '8px', cursor: 'pointer',
          marginBottom: '1.5rem',
        }}>
          <code style={{ ...mono, fontSize: '0.85rem', color: '#e5e5e5' }}>npm install agenticproof</code>
          <span style={{ ...mono, fontSize: '0.6rem', color: copied ? '#4ade80' : '#666', fontWeight: 600 }}>
            {copied ? 'Copied!' : 'Copy'}
          </span>
        </div>

        <div className="cta-row" style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/demo" style={{
            padding: '0.7rem 1.8rem', borderRadius: '8px', background: 'var(--text)',
            color: '#fff', textDecoration: 'none', ...inter,
            fontSize: '0.88rem', fontWeight: 600,
          }}>
            Watch the Demo
          </a>
          <a href="/team" style={{
            padding: '0.7rem 1.8rem', borderRadius: '8px', border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', textDecoration: 'none',
            ...inter, fontSize: '0.88rem', fontWeight: 500,
          }}>
            Open Dashboard
          </a>
        </div>
      </section>

      {/* The Stakes */}
      <section className="stats-row" style={{
        display: 'flex', gap: '0', maxWidth: '680px', margin: '0 auto 2rem',
        width: '100%', padding: '0 1.5rem',
      }}>
        {[
          { number: '$0', label: 'verified', sub: 'of agent spending today has cryptographic proof' },
          { number: '0%', label: 'accountable', sub: 'of multi-agent handoffs are independently verified' },
          { number: '0', label: 'standards', sub: 'for measuring whether agent output was worth the cost' },
        ].map((s, i) => (
          <div key={s.label} style={{
            flex: 1, padding: '1.2rem 1rem', textAlign: 'center',
            borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
            borderLeft: i === 0 ? '1px solid var(--border)' : 'none',
            borderRight: '1px solid var(--border)',
            borderRadius: i === 0 ? '8px 0 0 8px' : i === 2 ? '0 8px 8px 0' : '0',
            background: 'var(--surface)',
          }}>
            <div style={{ ...mono, fontSize: '1.8rem', fontWeight: 700, color: 'var(--red)', marginBottom: '0.2rem' }}>{s.number}</div>
            <div style={{ ...mono, fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>{s.label}</div>
            <div style={{ ...inter, fontSize: '0.62rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{s.sub}</div>
          </div>
        ))}
      </section>

      {/* Two Layers */}
      <section style={{ padding: '0 1.5rem 2rem', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
        <div className="layers-row" style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1, padding: '1.2rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)' }}>
            <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--green)', fontWeight: 700, letterSpacing: '0.04em', marginBottom: '0.5rem' }}>PROOF OF ACTION</div>
            <div style={{ ...inter, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.4rem' }}>Every action is signed.</div>
            <div style={{ ...inter, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Ed25519 signature + SHA-256 hash chain. Each receipt links to the last. Tamper with one and the entire chain breaks. A second agent verifies every receipt before continuing.
            </div>
          </div>
          <div style={{ flex: 1, padding: '1.2rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)' }}>
            <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--green)', fontWeight: 700, letterSpacing: '0.04em', marginBottom: '0.5rem' }}>PROOF OF USEFULNESS</div>
            <div style={{ ...inter, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.4rem' }}>The agent can&apos;t grade itself.</div>
            <div style={{ ...inter, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              A separate model inside a hardware enclave scores how useful the work was. Below 60/100? Not anchored. Bad work never reaches the chain and never becomes training data.
            </div>
          </div>
        </div>
      </section>

      {/* Verification Stack - minimal */}
      <section style={{ padding: '0 1.5rem 2rem', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {[
            { check: true, label: 'Verified Compute', desc: 'LLM inference inside TEE enclaves (Intel TDX) on 0G', color: 'var(--green)' },
            { check: true, label: 'Verified Identity', desc: 'ERC-7857 agent identity tokens on 0G Mainnet', color: 'var(--green)' },
            { check: true, label: 'Verified Training', desc: 'Quality-gated pipeline: only useful output trains models', color: 'var(--green)' },
            { check: true, label: 'P2P Transport', desc: 'Agent-to-agent handoff via Gensyn AXL mesh', color: '#c084fc' },
          ].map(v => (
            <div key={v.label} style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.5rem 0.8rem', borderRadius: '6px',
              border: '1px solid var(--border)', background: 'var(--surface)',
            }}>
              <span style={{ ...mono, fontSize: '0.7rem', color: v.color, fontWeight: 700, flexShrink: 0 }}>&#10003;</span>
              <span style={{ ...mono, fontSize: '0.7rem', fontWeight: 600, color: 'var(--text)', minWidth: '120px' }}>{v.label}</span>
              <span style={{ ...inter, fontSize: '0.65rem', color: 'var(--text-muted)' }}>{v.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Code */}
      <section style={{ padding: '0 1.5rem 2rem', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
        <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '1rem 1.2rem', overflow: 'auto' }}>
          <pre style={{ ...mono, fontSize: '0.65rem', lineHeight: 1.8, color: '#e5e5e5', margin: 0 }}>
            <span style={{ color: '#c084fc' }}>import</span> {'{'} ReceiptAgent {'}'} <span style={{ color: '#c084fc' }}>from</span> <span style={{ color: '#4ade80' }}>&apos;agenticproof&apos;</span>;{'\n'}
            <span style={{ color: '#c084fc' }}>const</span> agent = ReceiptAgent.<span style={{ color: '#60a5fa' }}>create</span>(<span style={{ color: '#4ade80' }}>&apos;my-agent&apos;</span>);{'\n'}
            {'\n'}
            agent.<span style={{ color: '#60a5fa' }}>readFile</span>(path, contents);    <span style={{ color: '#888' }}>{'// receipt #1'}</span>{'\n'}
            agent.<span style={{ color: '#60a5fa' }}>callApi</span>(url, response);       <span style={{ color: '#888' }}>{'// receipt #2 -> linked to #1'}</span>{'\n'}
            agent.<span style={{ color: '#60a5fa' }}>callLlm</span>(prompt, output);      <span style={{ color: '#888' }}>{'// receipt #3 -> linked to #2'}</span>{'\n'}
            {'\n'}
            <span style={{ color: '#c084fc' }}>const</span> chain = agent.<span style={{ color: '#60a5fa' }}>exportChain</span>(); <span style={{ color: '#888' }}>{'// -> verify, score, anchor'}</span>
          </pre>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '0.8rem' }}>
          {['Claude Code', 'Cursor', 'OpenClaw', 'Any agent'].map(name => (
            <span key={name} style={{ ...mono, fontSize: '0.58rem', fontWeight: 600, padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* Contracts */}
      <section style={{ padding: '0 1.5rem 2rem', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { label: 'ReceiptAnchor', addr: '0x73B9A7768679B154D7E1eC5F2570a622A3b49651' },
            { label: 'AgentNFT', addr: '0xf964d45c3Ea5368918B1FDD49551E373028108c9' },
            { label: 'ValidationRegistry', addr: '0x2E32E845928A92DB193B59676C16D52923Fa01dd' },
            { label: 'ReceiptRegistry', addr: '0x717D062E47898441a51EAdcA40873190A339B328' },
          ].map(c => (
            <a key={c.addr} href={`https://chainscan.0g.ai/address/${c.addr}`} target="_blank" rel="noopener noreferrer"
              style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textDecoration: 'none', padding: '0.2rem 0.4rem', background: 'var(--surface)', borderRadius: '4px', border: '1px solid var(--border)' }}>
              {c.label}: {c.addr.slice(0, 10)}...
            </a>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
          <span style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)' }}>4 contracts live on 0G Mainnet (chain 16661)</span>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        marginTop: 'auto', padding: '0.6rem 1.5rem',
        borderTop: '1px solid var(--border)', background: 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: '0.65rem', color: 'var(--text-dim)', ...inter,
      }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <a href="/team" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Dashboard</a>
          <a href="/demo" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Demo</a>
          <a href="/verify" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Verify</a>
          <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>GitHub</a>
        </div>
        <a href="https://www.npmjs.com/package/agenticproof" target="_blank" rel="noopener noreferrer" style={{ ...mono, fontSize: '0.58rem', color: 'var(--text-dim)', textDecoration: 'none' }}>
          agenticproof@0.1.3
        </a>
      </footer>
    </div>
  );
}
