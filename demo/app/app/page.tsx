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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @media (max-width: 640px) {
          .hero-section { padding: 2rem 1.2rem !important; }
          .hero-title { font-size: 1.8rem !important; }
          .hero-sub { font-size: 1rem !important; }
          .problems-grid { grid-template-columns: 1fr !important; }
          .steps-grid { grid-template-columns: 1fr !important; gap: 1rem !important; }
          .og-grid { grid-template-columns: 1fr !important; }
          .cta-row { flex-direction: column !important; align-items: stretch !important; }
          .cta-row a { text-align: center !important; }
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
          <a href="/demo" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Demo</a>
          <a href="/verify" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Verify</a>
          <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>GitHub</a>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero-section" style={{
        padding: '3rem 2rem 2rem',
        textAlign: 'center',
        maxWidth: '640px',
        margin: '0 auto',
      }}>
        <h1 className="hero-title" style={{
          fontSize: '2.2rem',
          fontWeight: 700,
          color: 'var(--text)',
          marginBottom: '0.8rem',
          fontFamily: 'Inter, sans-serif',
          lineHeight: 1.2,
        }}>
          Did your AI agent<br />actually do the work?
        </h1>
        <p className="hero-sub" style={{
          fontSize: '1.05rem',
          color: 'var(--text-muted)',
          lineHeight: 1.7,
          marginBottom: '1.5rem',
          fontFamily: 'Inter, sans-serif',
        }}>
          Agents claim 100% task completion. Independent verification confirms 73%.
          The 27% gap is fabrication. RECEIPT catches it.
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
            marginBottom: '1.5rem',
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
            Watch the Demo
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
            Verify a Chain
          </a>
        </div>
      </section>

      {/* The Problem */}
      <section style={{ padding: '1rem 1.5rem 2rem', maxWidth: '720px', margin: '0 auto', width: '100%' }}>
        <h2 style={{ fontSize: '0.65rem', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem', textAlign: 'center' }}>The problem</h2>
        <div className="problems-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {[
            { q: 'Did it read the file?', a: 'Agents say they read files. No proof the content was real or that they didn\'t hallucinate it.' },
            { q: 'Did it call the API?', a: 'Agents claim API calls succeeded. No cryptographic proof they ran the request or got that response.' },
            { q: 'Was the output useful?', a: 'You paid for tokens. Was the result worth it? Nobody measures cost per useful output.' },
          ].map(p => (
            <div key={p.q} style={{
              padding: '1rem',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: 'var(--surface)',
            }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text)' }}>{p.q}</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{p.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How RECEIPT works */}
      <section style={{ padding: '0 1.5rem 2rem', maxWidth: '720px', margin: '0 auto', width: '100%' }}>
        <h2 style={{ fontSize: '0.65rem', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem', textAlign: 'center' }}>How RECEIPT works</h2>
        <div className="steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
          {[
            { n: '1', title: 'Sign every action', desc: 'Every file read, API call, and LLM inference gets an Ed25519-signed receipt. Hash-linked into a tamper-evident chain.' },
            { n: '2', title: 'Verify at handoff', desc: 'Agent B checks every receipt from Agent A. Signature, hash chain, timestamps. One failure = chain rejected.' },
            { n: '3', title: 'Score usefulness', desc: 'A separate model in a hardware enclave scores quality. The agent can\'t pick its own grader. Below 60? Not anchored.' },
          ].map(s => (
            <div key={s.n} style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: "'IBM Plex Mono', monospace",
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'var(--text)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700, margin: '0 auto 0.5rem',
              }}>{s.n}</div>
              <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.25rem', fontFamily: 'Inter, sans-serif' }}>{s.title}</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6, fontFamily: 'Inter, sans-serif' }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Built on 0G */}
      <section style={{ padding: '0 1.5rem 2rem', maxWidth: '580px', margin: '0 auto', width: '100%' }}>
        <div style={{
          padding: '1.2rem 1.4rem',
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
            marginBottom: '0.8rem',
          }}>
            Verified by 0G
          </div>
          <div className="og-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem' }}>
            {[
              { label: 'Compute', desc: 'Inference in TEE enclaves. Hardware proves the model ran.' },
              { label: 'Identity', desc: 'ERC-7857 on-chain agent ID. Soulbound, verifiable.' },
              { label: 'Training', desc: 'Quality-gated fine-tuning. Bad work never trains models.' },
            ].map(v => (
              <div key={v.label}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.2rem', color: 'var(--green)' }}>
                  ✓ {v.label}
                </div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{v.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '0.8rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Anchor', addr: '0x73B9A7768679B154D7E1eC5F2570a622A3b49651' },
              { label: 'Identity', addr: '0xf964d45c3Ea5368918B1FDD49551E373028108c9' },
              { label: 'Validation', addr: '0x2E32E845928A92DB193B59676C16D52923Fa01dd' },
            ].map(c => (
              <a key={c.addr} href={`https://chainscan.0g.ai/address/${c.addr}`} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.52rem', color: 'var(--text-dim)', textDecoration: 'none', padding: '0.2rem 0.4rem', background: 'var(--bg)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                {c.label}: {c.addr.slice(0, 8)}...
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Get started - how to integrate */}
      <section style={{ padding: '0 1.5rem 2rem', maxWidth: '620px', margin: '0 auto', width: '100%' }}>
        <h2 style={{ fontSize: '0.65rem', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem', textAlign: 'center' }}>Add RECEIPT to your agent</h2>
        <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '1.2rem 1.4rem', overflow: 'auto' }}>
          <pre style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '0.68rem',
            lineHeight: 1.8,
            color: '#e5e5e5',
            margin: 0,
          }}>
            <span style={{ color: '#888' }}>{'// 1. Install'}</span>{'\n'}
            <span style={{ color: '#c084fc' }}>npm install</span> agenticproof{'\n'}
            {'\n'}
            <span style={{ color: '#888' }}>{'// 2. Wrap your agent'}</span>{'\n'}
            <span style={{ color: '#c084fc' }}>import</span> {'{'} ReceiptAgent {'}'} <span style={{ color: '#c084fc' }}>from</span> <span style={{ color: '#4ade80' }}>&apos;agenticproof&apos;</span>;{'\n'}
            <span style={{ color: '#c084fc' }}>const</span> agent = ReceiptAgent.<span style={{ color: '#60a5fa' }}>create</span>(<span style={{ color: '#4ade80' }}>&apos;my-agent&apos;</span>);{'\n'}
            {'\n'}
            <span style={{ color: '#888' }}>{'// 3. Every action becomes a receipt'}</span>{'\n'}
            agent.<span style={{ color: '#60a5fa' }}>readFile</span>(path, contents);    <span style={{ color: '#888' }}>{'// signed + hashed'}</span>{'\n'}
            agent.<span style={{ color: '#60a5fa' }}>callApi</span>(url, response);       <span style={{ color: '#888' }}>{'// signed + hashed'}</span>{'\n'}
            agent.<span style={{ color: '#60a5fa' }}>callLlm</span>(prompt, output);      <span style={{ color: '#888' }}>{'// signed + hashed'}</span>{'\n'}
            {'\n'}
            <span style={{ color: '#888' }}>{'// 4. Verify + export'}</span>{'\n'}
            agent.<span style={{ color: '#60a5fa' }}>verifyOwnChain</span>();             <span style={{ color: '#888' }}>{'// true'}</span>{'\n'}
            <span style={{ color: '#c084fc' }}>const</span> chain = agent.<span style={{ color: '#60a5fa' }}>exportChain</span>(); <span style={{ color: '#888' }}>{'// paste into /verify'}</span>
          </pre>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1rem' }}>
          {['Claude Code', 'Cursor', 'OpenClaw', 'Any agent'].map(name => (
            <span key={name} style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '0.62rem',
              fontWeight: 600,
              padding: '0.3rem 0.6rem',
              borderRadius: '4px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
            }}>
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        marginTop: 'auto',
        padding: '0.6rem 1.5rem',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.65rem',
        color: 'var(--text-dim)',
        fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <a href="/demo" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Demo</a>
          <a href="/verify" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Verify</a>
          <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>GitHub</a>
        </div>
        <a href="https://www.npmjs.com/package/agenticproof" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.58rem', color: 'var(--text-dim)', textDecoration: 'none' }}>
          agenticproof@0.1.2
        </a>
      </footer>
    </div>
  );
}
