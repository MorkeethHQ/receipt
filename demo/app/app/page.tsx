'use client';

import { useState, useCallback } from 'react';

export default function LandingPage() {
  const [copied, setCopied] = useState(false);

  const copyInstall = useCallback(() => {
    navigator.clipboard.writeText('npm install @receipt/sdk').then(() => {
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
          .cards-grid { grid-template-columns: 1fr !important; }
          .cta-row { flex-direction: column !important; align-items: stretch !important; }
          .cta-row a { text-align: center !important; }
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
          <a href="/demo" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Demo</a>
          <a href="/verify" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Verify</a>
          <a href="/dashboard" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Dashboard</a>
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
        <h1 className="hero-title" style={{
          fontSize: '2.2rem',
          fontWeight: 700,
          color: 'var(--text)',
          marginBottom: '1rem',
          fontFamily: 'Inter, sans-serif',
          lineHeight: 1.2,
        }}>
          Proof your agents<br />actually did the work
        </h1>
        <p className="hero-sub" style={{
          fontSize: '1.05rem',
          color: 'var(--text-muted)',
          lineHeight: 1.7,
          marginBottom: '2rem',
          fontFamily: 'Inter, sans-serif',
        }}>
          Add a few lines to your AI agent. Get a tamper-proof log of every action it takes.
          When agents hand off work, the next agent verifies the chain before continuing.
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
            npm install @receipt/sdk
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
          <a href="/demo" style={{
            padding: '0.7rem 1.8rem',
            borderRadius: '8px',
            background: 'var(--text)',
            color: '#fff',
            textDecoration: 'none',
            fontFamily: 'Inter, sans-serif',
            fontSize: '0.88rem',
            fontWeight: 600,
          }}>
            Watch Demo
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

      {/* How it works */}
      <section style={{ padding: '2rem 1.5rem 3rem', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        <div className="steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
          {[
            { n: '1', title: 'Instrument', desc: 'Wrap your agent\'s actions. Each one produces a signed receipt automatically.' },
            { n: '2', title: 'Chain', desc: 'Receipts link together cryptographically. Change one and the whole chain breaks.' },
            { n: '3', title: 'Review', desc: 'A TEE-attested review scores the chain\'s usefulness. Not just proof of action — proof of value.' },
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
            <span style={{ color: '#c084fc' }}>import</span> {'{'} ReceiptAgent {'}'} <span style={{ color: '#c084fc' }}>from</span> <span style={{ color: '#4ade80' }}>&apos;@receipt/sdk&apos;</span>;{'\n'}
            {'\n'}
            <span style={{ color: '#c084fc' }}>const</span> agent = ReceiptAgent.<span style={{ color: '#60a5fa' }}>create</span>(<span style={{ color: '#4ade80' }}>&apos;my-agent&apos;</span>);{'\n'}
            {'\n'}
            agent.<span style={{ color: '#60a5fa' }}>readFile</span>(<span style={{ color: '#4ade80' }}>&apos;config.json&apos;</span>, contents);{'\n'}
            agent.<span style={{ color: '#60a5fa' }}>callApi</span>(<span style={{ color: '#4ade80' }}>&apos;https://api.example.com&apos;</span>, response);{'\n'}
            agent.<span style={{ color: '#60a5fa' }}>callLlm</span>(<span style={{ color: '#4ade80' }}>&apos;analyze this&apos;</span>, output);{'\n'}
            {'\n'}
            <span style={{ color: '#888' }}>// proof of usefulness — TEE-attested review</span>{'\n'}
            agent.<span style={{ color: '#60a5fa' }}>reviewUsefulness</span>(summary, scores, attestation);{'\n'}
            {'\n'}
            <span style={{ color: '#c084fc' }}>const</span> valid = agent.<span style={{ color: '#60a5fa' }}>verifyOwnChain</span>(); <span style={{ color: '#888' }}>// true</span>
          </pre>
        </div>
      </section>

      {/* What you get — simple list, not cards */}
      <section style={{ padding: '0 1.5rem 3rem', maxWidth: '580px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {[
            'Layer 1: Proof of action — tamper-proof audit trail for every agent step',
            'Layer 2: Proof of usefulness — TEE-attested quality scoring of chain outputs',
            'Multi-agent handoffs with cryptographic verification',
            'On-chain anchoring on 0G Mainnet',
            'TEE-attested inference and review via 0G Compute',
            'Works with any agent framework — just wrap your calls',
          ].map(item => (
            <div key={item} style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
              fontSize: '0.85rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', lineHeight: 1.5,
            }}>
              <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: '0.9rem', flexShrink: 0 }}>+</span>
              {item}
            </div>
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
          <a href="/demo" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Demo</a>
          <a href="/verify" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Verify</a>
          <a href="/dashboard" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Dashboard</a>
          <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>GitHub</a>
        </div>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6rem' }}>
          0G + Gensyn AXL
        </span>
      </footer>
    </div>
  );
}
