'use client';

import { useState, useCallback, useEffect } from 'react';

export default function LandingPage() {
  const [copied, setCopied] = useState(false);
  const [liveStats, setLiveStats] = useState<{ chains: number; receipts: number; sources: number } | null>(null);

  useEffect(() => {
    fetch('/api/chains').then(r => r.json()).then(data => {
      const chains = data.chains ?? [];
      setLiveStats({
        chains: chains.length,
        receipts: chains.reduce((s: number, c: any) => s + (c.receiptCount ?? 0), 0),
        sources: new Set(chains.map((c: any) => c.source)).size,
      });
    }).catch(() => {});
  }, []);

  const copyInstall = useCallback(() => {
    navigator.clipboard.writeText('npm install agenticproof').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @media (max-width: 640px) {
          .hero-section { padding: 2.5rem 1.2rem 2rem !important; }
          .hero-title { font-size: 1.8rem !important; }
          .hero-sub { font-size: 1rem !important; }
          .steps-grid { grid-template-columns: 1fr !important; gap: 1.2rem !important; }
          .cases-grid { grid-template-columns: 1fr !important; }
          .og-grid { grid-template-columns: 1fr 1fr !important; }
          .cta-row { flex-direction: column !important; align-items: stretch !important; }
          .cta-row a { text-align: center !important; }
          .compare-table { font-size: 0.68rem !important; }
          .compare-table th, .compare-table td { padding: 0.4rem 0.35rem !important; }
          .code-block { padding: 1rem !important; }
          .code-block pre { font-size: 0.65rem !important; }
          .nav-links { gap: 1rem !important; }
        }
      `}</style>

      {/* Nav */}
      <nav style={{
        padding: '0.6rem 1.5rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <a href="/" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>
          R.E.C.E.I.P.T.
        </a>
        <div className="nav-links" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <a href="/" style={{ fontSize: '0.75rem', color: 'var(--text)', textDecoration: 'none', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>Home</a>
          <a href="/demo" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Live</a>
          <a href="/trial" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Trial</a>
          <a href="/team" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Team</a>
          <a href="/verify" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Verify</a>
          <a href="/eval" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Eval</a>
          <a href="/reputation" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Reputation</a>
          <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>GitHub</a>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero-section" style={{
        padding: '4rem 2rem 3rem',
        textAlign: 'center',
        maxWidth: '600px',
        margin: '0 auto',
      }}>
        <p style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '0.72rem',
          color: 'var(--text-dim)',
          marginBottom: '1rem',
          letterSpacing: '0.02em',
        }}>
          Cursor built keep rates for code.<br />
          We built verification rates for everything else.
        </p>
        <h1 className="hero-title" style={{
          fontSize: '2.2rem',
          fontWeight: 700,
          color: 'var(--text)',
          marginBottom: '1rem',
          fontFamily: 'Inter, sans-serif',
          lineHeight: 1.2,
        }}>
          Proof that AI work<br />actually mattered
        </h1>
        <p className="hero-sub" style={{
          fontSize: '1.05rem',
          color: 'var(--text-muted)',
          lineHeight: 1.7,
          marginBottom: '2rem',
          fontFamily: 'Inter, sans-serif',
        }}>
          The evaluation layer every agent harness needs.
          Cryptographic proof that the work happened — and that it was worth paying for.
        </p>

        {/* npm install */}
        <div
          onClick={copyInstall}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.8rem',
            padding: '0.7rem 1.4rem',
            background: '#1a1a1a',
            borderRadius: '8px',
            cursor: 'pointer',
            marginBottom: '2rem',
          }}
        >
          <code style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.85rem', color: '#e5e5e5' }}>
            npm install agenticproof
          </code>
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '0.6rem',
            color: copied ? '#4ade80' : '#666',
            fontWeight: 600,
          }}>
            {copied ? 'Copied!' : 'Copy'}
          </span>
        </div>

        {/* CTAs */}
        <div className="cta-row" style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/demo" className="pulse-btn" style={{
            padding: '0.7rem 1.8rem',
            borderRadius: '8px',
            background: 'var(--text)',
            color: '#fff',
            textDecoration: 'none',
            fontFamily: 'Inter, sans-serif',
            fontSize: '0.88rem',
            fontWeight: 600,
          }}>
            See It Work
          </a>
          <a href="/verify" style={{
            padding: '0.7rem 1.8rem',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            textDecoration: 'none',
            fontFamily: 'Inter, sans-serif',
            fontSize: '0.88rem',
            fontWeight: 500,
          }}>
            Check Agent Work
          </a>
        </div>

        {/* Live stats */}
        {liveStats && liveStats.receipts > 0 && (
          <div style={{
            marginTop: '1.5rem',
            display: 'flex', gap: '2rem', justifyContent: 'center',
            fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.65rem', color: 'var(--text-dim)',
          }}>
            <span><strong style={{ color: 'var(--text)', fontSize: '0.85rem' }}>{liveStats.chains}</strong> chains</span>
            <span><strong style={{ color: 'var(--text)', fontSize: '0.85rem' }}>{liveStats.receipts}</strong> receipts</span>
            <span><strong style={{ color: 'var(--text)', fontSize: '0.85rem' }}>{liveStats.sources}</strong> sources</span>
          </div>
        )}
      </section>

      {/* How it works */}
      <section style={{ padding: '2rem 1.5rem 3rem', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        <h2 style={{ fontSize: '0.65rem', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1.5rem', textAlign: 'center' }}>How it works</h2>
        <div className="steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
          {[
            { n: '1', title: 'Wrap your agent', desc: 'Add one import. Every file read, API call, and LLM response gets a cryptographic receipt automatically.' },
            { n: '2', title: 'Catch lies', desc: 'Receipts hash-link together. If an agent skips a step or fabricates a result, the chain breaks and you see exactly where.' },
            { n: '3', title: 'Score the work', desc: 'A different model reviews the chain inside a hardware enclave. The agent can\'t pick its own grader. Score below 60? The chain is rejected — never touches the blockchain, never becomes training data.' },
          ].map(s => (
            <div key={s.n} style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: "'IBM Plex Mono', monospace",
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'var(--text)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', fontWeight: 700, margin: '0 auto 0.6rem',
              }}>{s.n}</div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.3rem', fontFamily: 'Inter, sans-serif' }}>{s.title}</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6, fontFamily: 'Inter, sans-serif' }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Code example */}
      <section style={{ padding: '0 1.5rem 3rem', maxWidth: '580px', margin: '0 auto', width: '100%' }}>
        <div className="code-block" style={{ background: '#1a1a1a', borderRadius: '8px', padding: '1.5rem 1.8rem', overflow: 'auto' }}>
          <pre style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '0.73rem',
            lineHeight: 1.9,
            color: '#e5e5e5',
            margin: 0,
          }}>
            <span style={{ color: '#c084fc' }}>import</span> {'{'} ReceiptAgent {'}'} <span style={{ color: '#c084fc' }}>from</span> <span style={{ color: '#4ade80' }}>&apos;agenticproof&apos;</span>;{'\n'}
            {'\n'}
            <span style={{ color: '#c084fc' }}>const</span> agent = ReceiptAgent.<span style={{ color: '#60a5fa' }}>create</span>(<span style={{ color: '#4ade80' }}>&apos;my-agent&apos;</span>);{'\n'}
            {'\n'}
            agent.<span style={{ color: '#60a5fa' }}>readFile</span>(<span style={{ color: '#4ade80' }}>&apos;config.json&apos;</span>, contents);{'\n'}
            agent.<span style={{ color: '#60a5fa' }}>callApi</span>(<span style={{ color: '#4ade80' }}>&apos;https://api.example.com&apos;</span>, response);{'\n'}
            agent.<span style={{ color: '#60a5fa' }}>callLlm</span>(<span style={{ color: '#4ade80' }}>&apos;analyze this&apos;</span>, output);{'\n'}
            {'\n'}
            <span style={{ color: '#888' }}>// proof of usefulness — independent review</span>{'\n'}
            agent.<span style={{ color: '#60a5fa' }}>reviewUsefulness</span>(summary, scores, attestation);{'\n'}
            {'\n'}
            <span style={{ color: '#c084fc' }}>const</span> valid = agent.<span style={{ color: '#60a5fa' }}>verifyOwnChain</span>(); <span style={{ color: '#888' }}>// true</span>
          </pre>
        </div>
      </section>

      {/* Powered by 0G */}
      <section style={{ padding: '0 1.5rem 2.5rem', maxWidth: '580px', margin: '0 auto', width: '100%' }}>
        <div style={{
          padding: '1.4rem 1.6rem',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          background: 'var(--surface)',
        }}>
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '0.6rem',
            color: 'var(--text-dim)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '1rem',
          }}>
            Built on
          </div>
          <div className="og-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            {[
              { label: '0G Verified Compute', desc: 'Every inference runs in a TEE enclave via 0G Compute. Hardware-attested, not just logged.' },
              { label: '0G Verified Identity', desc: 'ERC-7857 soulbound identity on 0G Mainnet. Each agent builds on-chain reputation.' },
              { label: '0G Verified Training', desc: 'Quality-gated chains feed 0G fine-tuning. Bad work never becomes training data.' },
              { label: 'Gensyn AXL Transport', desc: 'Agent-to-agent handoff over encrypted P2P mesh. No central server touches the chain.' },
            ].map(v => (
              <div key={v.label}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--text)' }}>{v.label}</div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>{v.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Anchor', addr: '0x73B9A7768679B154D7E1eC5F2570a622A3b49651' },
              { label: 'Identity', addr: '0xf964d45c3Ea5368918B1FDD49551E373028108c9' },
              { label: 'Validation', addr: '0x2E32E845928A92DB193B59676C16D52923Fa01dd' },
            ].map(c => (
              <a key={c.addr} href={`https://chainscan.0g.ai/address/${c.addr}`} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.55rem', color: 'var(--text-dim)', textDecoration: 'none', padding: '0.2rem 0.5rem', background: 'var(--bg)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                {c.label}: {c.addr.slice(0, 8)}...
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section style={{ padding: '0 1.5rem 3rem', maxWidth: '580px', margin: '0 auto', width: '100%' }}>
        <div className="cases-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          {[
            'Your coding agent says it reviewed 50 files. Prove which ones it actually opened.',
            'Agent A hands work to Agent B. Agent B verifies every receipt before continuing. No blind trust between agents — ever.',
            'Your research agent claims 12 sources. The receipt chain shows exactly what it fetched and when.',
            'An agent scores 34/100 on usefulness. The chain gets flagged — not anchored, not used for training.',
          ].map(item => (
            <div key={item} style={{
              padding: '1rem 1.2rem',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: 'var(--surface)',
              fontSize: '0.82rem',
              color: 'var(--text-muted)',
              fontFamily: 'Inter, sans-serif',
              lineHeight: 1.6,
            }}>
              {item}
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section style={{ padding: '0 1.5rem 3rem', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
        <h2 style={{ fontSize: '0.65rem', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1.2rem', textAlign: 'center' }}>How it compares</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="compare-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Inter, sans-serif', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['', 'Tamper-proof', 'Multi-agent', 'Quality score', 'On-chain', 'Training'].map(h => (
                  <th key={h} style={{ padding: '0.5rem 0.6rem', textAlign: h ? 'center' : 'left', color: 'var(--text-dim)', fontWeight: 600, fontSize: '0.7rem', fontFamily: "'IBM Plex Mono', monospace" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'LangSmith', vals: [false, 'partial', false, false, false] },
                { name: 'AgentOps', vals: [false, 'partial', false, false, false] },
                { name: 'Patronus / Galileo', vals: [false, false, 'partial', false, false] },
                { name: 'Arize Phoenix', vals: [false, false, 'partial', false, false] },
                { name: 'R.E.C.E.I.P.T.', vals: [true, true, true, true, true] },
              ].map((row, i, arr) => (
                <tr key={row.name} style={{ borderBottom: '1px solid var(--border)', background: i === arr.length - 1 ? 'var(--surface)' : 'transparent' }}>
                  <td style={{ padding: '0.55rem 0.6rem', fontWeight: i === arr.length - 1 ? 700 : 400, color: 'var(--text)', whiteSpace: 'nowrap' }}>{row.name}</td>
                  {row.vals.map((v, j) => (
                    <td key={j} style={{ padding: '0.55rem 0.6rem', textAlign: 'center', color: v === true ? '#4ade80' : v === 'partial' ? '#facc15' : '#666', fontSize: '0.82rem' }}>
                      {v === true ? '✓' : v === 'partial' ? '~' : '✗'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Stack depth */}
      <section style={{ padding: '0 1.5rem 3rem', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
        <h2 style={{ fontSize: '0.65rem', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1.2rem', textAlign: 'center' }}>Under the hood</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
          {[
            'Ed25519 signatures',
            'SHA-256 hash chains',
            'TEE enclaves (Intel TDX)',
            '0G Mainnet (16661)',
            'ERC-7857 Agentic ID',
            'ERC-8004 Validation',
            'WebCrypto client-side verify',
            'agenticproof@0.1.1 on npm',
            '3 smart contracts deployed',
            '47 SDK tests passing',
          ].map(tag => (
            <span key={tag} style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '0.6rem',
              padding: '0.3rem 0.6rem',
              borderRadius: '4px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
            }}>
              {tag}
            </span>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        marginTop: 'auto',
        padding: '0.8rem 1.5rem',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.5rem',
        fontSize: '0.68rem',
        color: 'var(--text-dim)',
        fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{ display: 'flex', gap: '1.2rem' }}>
          <a href="/demo" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Live</a>
          <a href="/team" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Team</a>
          <a href="/verify" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Verify</a>
          <a href="/eval" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Eval</a>
          <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>GitHub</a>
        </div>
        <a href="https://www.npmjs.com/package/agenticproof" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6rem', color: 'var(--text-dim)', textDecoration: 'none' }}>
          agenticproof@0.1.1
        </a>
      </footer>
    </div>
  );
}
