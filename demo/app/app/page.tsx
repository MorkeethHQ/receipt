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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @media (max-width: 640px) {
          .hero-section { padding: 2rem 1.2rem !important; }
          .hero-title { font-size: 1.8rem !important; }
          .problems-grid { grid-template-columns: 1fr !important; }
          .steps-grid { grid-template-columns: 1fr !important; gap: 1rem !important; }
          .harness-grid { grid-template-columns: 1fr 1fr !important; }
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
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <a href="/" style={{ ...mono, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>
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
      <section className="hero-section" style={{ padding: '3rem 2rem 1.5rem', textAlign: 'center', maxWidth: '640px', margin: '0 auto' }}>
        <h1 className="hero-title" style={{
          fontSize: '2.2rem', fontWeight: 700, color: 'var(--text)',
          marginBottom: '0.8rem', fontFamily: 'Inter, sans-serif', lineHeight: 1.2,
        }}>
          Did your AI agent<br />actually do the work?
        </h1>
        <p style={{
          fontSize: '1.05rem', color: 'var(--text-muted)', lineHeight: 1.7,
          marginBottom: '1.5rem', fontFamily: 'Inter, sans-serif',
        }}>
          RECEIPT is the evaluation layer for AI agents. Cryptographic proof
          that the work happened, survived verification, and was worth paying for.
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
          <a href="/demo" className="pulse-btn" style={{
            padding: '0.7rem 1.8rem', borderRadius: '8px', background: 'var(--text)',
            color: '#fff', textDecoration: 'none', fontFamily: 'Inter, sans-serif',
            fontSize: '0.88rem', fontWeight: 600,
          }}>
            Watch the Demo
          </a>
          <a href="/verify" style={{
            padding: '0.7rem 1.8rem', borderRadius: '8px', border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', textDecoration: 'none',
            fontFamily: 'Inter, sans-serif', fontSize: '0.88rem', fontWeight: 500,
          }}>
            Verify a Chain
          </a>
        </div>
      </section>

      {/* ── THE PROBLEM ── */}
      <section style={{ padding: '1rem 1.5rem 1.5rem', maxWidth: '720px', margin: '0 auto', width: '100%' }}>
        <h2 style={{ ...mono, fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.8rem', textAlign: 'center' }}>The problem</h2>
        <div className="problems-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem' }}>
          {[
            { q: 'Did it read the file?', a: 'Agents claim they read files. No proof the content matched reality.' },
            { q: 'Did it call the API?', a: 'No cryptographic proof the request ran or the response was real.' },
            { q: 'Was the output useful?', a: 'You paid for tokens. Was the result worth it? Nobody measures.' },
          ].map(p => (
            <div key={p.q} style={{ padding: '0.8rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)' }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.3rem' }}>{p.q}</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>{p.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ padding: '0 1.5rem 1.5rem', maxWidth: '720px', margin: '0 auto', width: '100%' }}>
        <h2 style={{ ...mono, fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.8rem', textAlign: 'center' }}>Two layers of proof</h2>
        <div className="steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)' }}>
            <div style={{ ...mono, fontSize: '0.58rem', color: 'var(--green)', fontWeight: 700, marginBottom: '0.3rem', letterSpacing: '0.04em' }}>LAYER 1: PROOF OF ACTION</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Every agent action produces an Ed25519-signed receipt. Each receipt hash-links to the previous one. Change one receipt and the entire chain breaks. The Builder verifies every receipt from the Researcher before continuing.
            </div>
          </div>
          <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)' }}>
            <div style={{ ...mono, fontSize: '0.58rem', color: 'var(--green)', fontWeight: 700, marginBottom: '0.3rem', letterSpacing: '0.04em' }}>LAYER 2: PROOF OF USEFULNESS</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              A separate model inside a hardware enclave scores alignment, substance, and quality. The agent can&apos;t pick its own grader. Below 60/100? Not anchored on-chain. Bad work never becomes training data.
            </div>
          </div>
        </div>
      </section>

      {/* ── WHAT RECEIPT CAPTURES ── */}
      <section style={{ padding: '0 1.5rem 1.5rem', maxWidth: '620px', margin: '0 auto', width: '100%' }}>
        <h2 style={{ ...mono, fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.8rem', textAlign: 'center' }}>Every action, end to end</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {[
            { icon: '1', label: 'File read', detail: 'Contents hashed into signed receipt' },
            { icon: '2', label: 'API call', detail: 'Request + response locked to chain' },
            { icon: '3', label: 'LLM inference', detail: 'Model output attested by hardware enclave' },
            { icon: '4', label: 'Decision', detail: 'Reasoning recorded, hash-linked to evidence' },
            { icon: '5', label: 'Handoff', detail: 'Chain travels P2P, Builder verifies every receipt' },
            { icon: '✓', label: 'Quality score', detail: 'Independent model grades usefulness (60+ to anchor)' },
          ].map(s => (
            <div key={s.label} style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.4rem 0.7rem', borderRadius: '6px',
              border: '1px solid var(--border)', background: 'var(--surface)',
            }}>
              <div style={{ ...mono, fontSize: '0.65rem', fontWeight: 700, color: 'var(--green)', width: '1.2rem', textAlign: 'center', flexShrink: 0 }}>{s.icon}</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text)', minWidth: '80px' }}>{s.label}</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{s.detail}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── VERIFICATION STACK (0G + Gensyn) ── */}
      <section style={{ padding: '0 1.5rem 1.5rem', maxWidth: '620px', margin: '0 auto', width: '100%' }}>
        <div style={{ padding: '1rem 1.2rem', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface)' }}>
          <div style={{ ...mono, fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
            Verified by 0G + Gensyn AXL
          </div>
          <div className="og-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem', marginBottom: '0.8rem' }}>
            {[
              { label: '0G Compute', desc: 'Inference in TEE enclaves (Intel TDX). Hardware proves the model ran.', color: 'var(--green)' },
              { label: '0G Identity', desc: 'ERC-7857 agent identity token on 0G Mainnet. Ed25519 key hash on-chain.', color: 'var(--green)' },
              { label: '0G Training', desc: 'Quality-gated data pipeline. Only useful chains feed model fine-tuning.', color: 'var(--green)' },
              { label: 'Gensyn AXL', desc: 'Agent-to-agent P2P handoff via encrypted Yggdrasil mesh. No central server.', color: '#c084fc' },
            ].map(v => (
              <div key={v.label}>
                <div style={{ ...mono, fontSize: '0.65rem', fontWeight: 700, marginBottom: '0.15rem', color: v.color }}>
                  ✓ {v.label}
                </div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.62rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>{v.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {[
              { label: 'ReceiptAnchor', addr: '0x73B9A7768679B154D7E1eC5F2570a622A3b49651' },
              { label: 'AgentNFT', addr: '0xf964d45c3Ea5368918B1FDD49551E373028108c9' },
              { label: 'ValidationRegistry', addr: '0x2E32E845928A92DB193B59676C16D52923Fa01dd' },
            ].map(c => (
              <a key={c.addr} href={`https://chainscan.0g.ai/address/${c.addr}`} target="_blank" rel="noopener noreferrer"
                style={{ ...mono, fontSize: '0.48rem', color: 'var(--text-dim)', textDecoration: 'none', padding: '0.15rem 0.35rem', background: 'var(--bg)', borderRadius: '3px', border: '1px solid var(--border)' }}>
                {c.label}: {c.addr.slice(0, 10)}...
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONNECT YOUR AGENT ── */}
      <section style={{ padding: '0 1.5rem 1.5rem', maxWidth: '620px', margin: '0 auto', width: '100%' }}>
        <h2 style={{ ...mono, fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.8rem', textAlign: 'center' }}>Connect your agent</h2>
        <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '1rem 1.2rem', overflow: 'auto' }}>
          <pre style={{ ...mono, fontSize: '0.65rem', lineHeight: 1.8, color: '#e5e5e5', margin: 0 }}>
            <span style={{ color: '#c084fc' }}>import</span> {'{'} ReceiptAgent {'}'} <span style={{ color: '#c084fc' }}>from</span> <span style={{ color: '#4ade80' }}>&apos;agenticproof&apos;</span>;{'\n'}
            <span style={{ color: '#c084fc' }}>const</span> agent = ReceiptAgent.<span style={{ color: '#60a5fa' }}>create</span>(<span style={{ color: '#4ade80' }}>&apos;my-agent&apos;</span>);{'\n'}
            {'\n'}
            agent.<span style={{ color: '#60a5fa' }}>readFile</span>(path, contents);    <span style={{ color: '#888' }}>{'// receipt #1'}</span>{'\n'}
            agent.<span style={{ color: '#60a5fa' }}>callApi</span>(url, response);       <span style={{ color: '#888' }}>{'// receipt #2 → linked to #1'}</span>{'\n'}
            agent.<span style={{ color: '#60a5fa' }}>callLlm</span>(prompt, output);      <span style={{ color: '#888' }}>{'// receipt #3 → linked to #2'}</span>{'\n'}
            {'\n'}
            <span style={{ color: '#c084fc' }}>const</span> chain = agent.<span style={{ color: '#60a5fa' }}>exportChain</span>(); <span style={{ color: '#888' }}>{'// → verify at /verify'}</span>
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

      {/* ── UNDER THE HOOD ── */}
      <section style={{ padding: '0 1.5rem 1.5rem', maxWidth: '620px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', justifyContent: 'center' }}>
          {[
            'Ed25519 signatures', 'SHA-256 hash chains', 'TEE enclaves (Intel TDX)',
            '0G Mainnet (16661)', 'ERC-7857 Agentic ID', 'ERC-8004 Validation',
            'WebCrypto client-side verify', 'Gensyn AXL P2P mesh',
            'agenticproof@0.1.2 on npm', '3 smart contracts live', '47 SDK tests passing',
          ].map(tag => (
            <span key={tag} style={{ ...mono, fontSize: '0.52rem', padding: '0.2rem 0.45rem', borderRadius: '3px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
              {tag}
            </span>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        marginTop: 'auto', padding: '0.6rem 1.5rem',
        borderTop: '1px solid var(--border)', background: 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <a href="/demo" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Demo</a>
          <a href="/verify" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Verify</a>
          <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>GitHub</a>
        </div>
        <a href="https://www.npmjs.com/package/agenticproof" target="_blank" rel="noopener noreferrer" style={{ ...mono, fontSize: '0.58rem', color: 'var(--text-dim)', textDecoration: 'none' }}>
          agenticproof@0.1.2
        </a>
      </footer>
    </div>
  );
}
