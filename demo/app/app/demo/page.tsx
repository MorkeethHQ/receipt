'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface Receipt {
  id: string;
  prevId: string | null;
  agentId: string;
  timestamp: number;
  action: { type: string; description: string };
  inputHash: string;
  outputHash: string;
  signature: string;
  attestation: { provider: string; type: string } | null;
}

interface ReceiptMeta {
  llmSource?: string;
  teeAttested?: boolean;
  agent?: string;
  rawInput?: string;
  rawOutput?: string;
}

interface VerificationResult {
  valid: boolean;
  receiptId: string;
  checks: { signatureValid: boolean; chainLinkValid: boolean; timestampValid: boolean };
  error?: string;
}

const mono = { fontFamily: "'IBM Plex Mono', 'Courier New', monospace" } as const;

function getNarrative(event: string, data: any): string {
  if (event === 'receipt') {
    const type = data.receipt.action.type;
    const agent = data.agent;
    switch (type) {
      case 'file_read':
        return `Agent ${agent} read a file. The filename and contents are SHA-256 hashed into the receipt, then signed with ed25519. If the file contents change later, the hash won't match.`;
      case 'api_call':
        return `Agent ${agent} called an external API. Both the request and response are hashed — the receipt proves exactly what data was returned, even if the API changes later.`;
      case 'llm_call':
        return data.teeAttested
          ? `Agent ${agent} ran LLM inference via 0G Compute. The response came from a TEE-attested environment (Intel TDX) — the model itself is verified.`
          : `Agent ${agent} ran LLM inference. The prompt and response are hashed into the receipt. With TEE attestation, even the model execution is verified.`;
      case 'decision':
        return `Agent ${agent} made a decision based on the data it gathered. The reasoning is captured in the receipt — you can audit exactly why this path was chosen.`;
      case 'output':
        return `Agent ${agent} produced its final output. Every single step that led here is cryptographically linked in the chain. Nothing was skipped.`;
      default:
        return `Agent ${agent}: ${data.receipt.action.description}`;
    }
  }
  if (event === 'status') {
    if (data.message?.includes('Verifying'))
      return 'Agent B received Agent A\'s full receipt chain. Before doing any work, it independently verifies every single receipt — checking signatures, hash links, and timestamps.';
    if (data.message?.includes('Fabricating'))
      return 'Agent A is about to lie. It will modify the API response data after signing the receipt. The ed25519 signature was computed on the original data — the modified hash won\'t match.';
    return '';
  }
  if (event === 'verified') {
    return data.result.valid
      ? `Receipt verified: ed25519 signature matches the data, hash links to the previous receipt, timestamp is valid. This action is authentic.`
      : `VERIFICATION FAILED. The ed25519 signature does not match the receipt data. Someone modified this receipt after it was signed.`;
  }
  if (event === 'fabrication_detected') {
    return 'CAUGHT. The output hash doesn\'t match the ed25519 signature. Agent A modified the API response after signing the original receipt. The hash chain is broken — Agent B rejects the entire handoff. This is exactly what R.E.C.E.I.P.T. prevents.';
  }
  if (event === 'done') {
    return data.fabricated
      ? 'Pipeline complete. The fabrication was caught and the handoff was rejected. No tampered data reaches the next agent.'
      : 'Pipeline complete. All receipts verified. The entire chain is cryptographically sound — every action is proven.';
  }
  if (event === 'trust_score') {
    return `Trust score computed: chain integrity (70%), data provenance (15%), TEE attestation (15%).`;
  }
  return '';
}

function getDelay(event: string): number {
  switch (event) {
    case 'receipt': return 1800;
    case 'verified': return 1000;
    case 'fabrication_detected': return 2500;
    case 'verification_complete': return 1200;
    case 'tampered': return 1500;
    case 'status': return 800;
    case 'done': return 600;
    case 'trust_score': return 1000;
    case 'agentic_id': return 800;
    default: return 500;
  }
}

export default function Demo() {
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [adversarial, setAdversarial] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptMeta, setReceiptMeta] = useState<Record<string, ReceiptMeta>>({});
  const [verifications, setVerifications] = useState<VerificationResult[]>([]);
  const [agentACount, setAgentACount] = useState(0);
  const [fabricationDetected, setFabricationDetected] = useState(false);
  const [tamperedIds, setTamperedIds] = useState<Set<string>>(new Set());
  const [chainRootHash, setChainRootHash] = useState<string | null>(null);
  const [trustScore, setTrustScore] = useState<number | null>(null);
  const [narrative, setNarrative] = useState('');
  const [narrativeHighlight, setNarrativeHighlight] = useState(false);

  const agentARef = useRef<HTMLDivElement>(null);
  const agentBRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    agentARef.current?.scrollTo({ top: agentARef.current.scrollHeight, behavior: 'smooth' });
  }, [receipts, agentACount]);

  useEffect(() => {
    agentBRef.current?.scrollTo({ top: agentBRef.current.scrollHeight, behavior: 'smooth' });
  }, [receipts, verifications]);

  const agentAReceipts = receipts.slice(0, agentACount || receipts.length);
  const agentBReceipts = agentACount > 0 ? receipts.slice(agentACount) : [];

  const handleEvent = useCallback((event: string, data: any) => {
    switch (event) {
      case 'receipt':
        setReceipts(prev => [...prev, data.receipt]);
        setReceiptMeta(prev => ({
          ...prev,
          [data.receipt.id]: {
            llmSource: data.llmSource, teeAttested: data.teeAttested,
            agent: data.agent, rawInput: data.rawInput, rawOutput: data.rawOutput,
          },
        }));
        break;
      case 'tampered':
        setTamperedIds(prev => {
          const next = new Set(prev);
          setReceipts(receipts => {
            if (receipts[data.index]) next.add(receipts[data.index].id);
            return receipts;
          });
          return next;
        });
        break;
      case 'verified':
        setVerifications(prev => [...prev, data.result]);
        if (!data.result.valid) {
          setTamperedIds(prev => { const next = new Set(prev); next.add(data.result.receiptId); return next; });
        }
        break;
      case 'fabrication_detected':
        setFabricationDetected(true);
        break;
      case 'done':
        setAgentACount(data.agentACount);
        if (data.rootHash) setChainRootHash(data.rootHash);
        if (data.fabricated) setFabricationDetected(true);
        break;
      case 'trust_score':
        setTrustScore(data.score);
        break;
    }
  }, []);

  const run = useCallback(async () => {
    setPhase('running');
    setReceipts([]);
    setReceiptMeta({});
    setVerifications([]);
    setAgentACount(0);
    setFabricationDetected(false);
    setTamperedIds(new Set());
    setChainRootHash(null);
    setTrustScore(null);
    setNarrative('Starting agent pipeline. Each action will produce a cryptographically signed receipt.');
    setNarrativeHighlight(true);
    setTimeout(() => setNarrativeHighlight(false), 600);

    const events: Array<{ event: string; data: any }> = [];

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adversarial }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        let ev = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) ev = line.slice(7);
          else if (line.startsWith('data: ') && ev) {
            events.push({ event: ev, data: JSON.parse(line.slice(6)) });
            ev = '';
          }
        }
      }
    } catch {}

    for (const { event, data } of events) {
      handleEvent(event, data);
      const msg = getNarrative(event, data);
      if (msg) {
        setNarrative(msg);
        setNarrativeHighlight(true);
        setTimeout(() => setNarrativeHighlight(false), 400);
      }
      await new Promise(r => setTimeout(r, getDelay(event)));
    }

    setPhase('done');
  }, [adversarial, handleEvent]);

  const renderReceipt = (receipt: Receipt, index: number) => {
    const meta = receiptMeta[receipt.id];
    const isTampered = tamperedIds.has(receipt.id);

    return (
      <div key={receipt.id} className="slide-up" style={{ maxWidth: '320px', width: '100%' }}>
        <div className={`receipt-card ${isTampered ? 'tampered' : ''}`} style={{ fontSize: '0.68rem' }}>
          <div style={{ padding: '0.4rem 0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ ...mono, fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.04em' }}>R.E.C.E.I.P.T.</span>
            <span style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)' }}>#{index}</span>
          </div>
          <div className="dashed" />
          <div style={{ padding: '0.35rem 0.6rem', ...mono, fontSize: '0.6rem', lineHeight: 1.8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>ACTION</span>
              <span style={{ fontWeight: 600 }}>{receipt.action.type}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>TIME</span>
              <span>{new Date(receipt.timestamp).toLocaleTimeString()}</span>
            </div>
            {receipt.action.type === 'llm_call' && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>SOURCE</span>
                <span style={{ fontWeight: 600, color: meta?.teeAttested ? 'var(--green)' : meta?.llmSource === '0g-compute' ? 'var(--amber)' : 'var(--text-muted)' }}>
                  {meta?.teeAttested ? 'TEE (TDX)' : meta?.llmSource === '0g-compute' ? '0G Compute' : 'Simulated'}
                </span>
              </div>
            )}
          </div>
          <div className="dashed" />
          <div style={{ padding: '0.3rem 0.6rem', ...mono, fontSize: '0.52rem', lineHeight: 1.7, color: 'var(--text-muted)' }}>
            <div>IN  {receipt.inputHash.slice(0, 20)}...</div>
            <div style={{ color: isTampered ? 'var(--red)' : undefined, textDecoration: isTampered ? 'line-through' : undefined }}>
              OUT {receipt.outputHash.slice(0, 20)}...
            </div>
          </div>
          <div className="dashed" />
          <div style={{ padding: '0.3rem 0.6rem', ...mono, fontSize: '0.52rem', color: 'var(--text-dim)' }}>
            SIG {receipt.signature.slice(0, 20)}...
          </div>
          <div className="dashed" />
          <div style={{ padding: '0.35rem 0.6rem', textAlign: 'center', ...mono, fontSize: '0.6rem', fontWeight: 700 }}>
            {isTampered ? (
              <span className="stamp" style={{ color: 'var(--red)', letterSpacing: '0.1em' }}>TAMPERED</span>
            ) : (
              <span style={{ color: 'var(--text-dim)', letterSpacing: '0.05em' }}>SIGNED</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        padding: '0.7rem 1.5rem', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <a href="/" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textDecoration: 'none' }}>
            Dashboard
          </a>
          <div>
            <h1 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>Live Demo</h1>
            <p style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>Watch agents generate cryptographic receipts in real-time</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={adversarial} onChange={e => setAdversarial(e.target.checked)}
              disabled={phase === 'running'} style={{ accentColor: 'var(--red)' }} />
            <span style={{ color: adversarial ? 'var(--red)' : 'var(--text-muted)', fontWeight: adversarial ? 600 : 400 }}>
              {adversarial ? 'Adversarial Mode' : 'Honest Mode'}
            </span>
          </label>
          <button onClick={run} disabled={phase === 'running'} style={{
            padding: '0.4rem 0.9rem', borderRadius: '6px', border: 'none',
            background: phase === 'running' ? 'var(--border)' : adversarial ? 'var(--red)' : 'var(--text)',
            color: '#fff', cursor: phase === 'running' ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600,
          }}>
            {phase === 'running' ? 'Running...' : phase === 'done' ? 'Run Again' : 'Start Demo'}
          </button>
        </div>
      </header>

      {/* Narrator Bar */}
      {narrative && (
        <div style={{
          padding: '0.7rem 1.5rem', borderBottom: '1px solid var(--border)',
          background: fabricationDetected ? '#fef2f2' : 'var(--surface)',
          transition: 'background 0.3s',
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: '0.78rem', lineHeight: 1.5,
            color: fabricationDetected ? 'var(--red)' : 'var(--text)',
            fontWeight: narrativeHighlight ? 500 : 400,
            transition: 'font-weight 0.3s',
            maxWidth: '800px',
          }}>
            {narrative}
          </div>
        </div>
      )}

      {/* Idle State */}
      {phase === 'idle' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ textAlign: 'center', maxWidth: '500px' }}>
            <div style={{ ...mono, fontSize: '1.8rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.8rem' }}>
              R.E.C.E.I.P.T.
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '1rem' }}>
              Watch two AI agents work together with cryptographic proof. Every action produces a signed receipt.
              Agent B independently verifies Agent A's chain before accepting the handoff.
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Toggle <strong style={{ color: 'var(--red)' }}>Adversarial Mode</strong> to see what happens when Agent A lies.
            </p>
          </div>
        </div>
      )}

      {/* Running / Done — Dual Chat Panels */}
      {phase !== 'idle' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', flex: 1, overflow: 'hidden' }}>
          {/* Agent A */}
          <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
            <div style={{
              padding: '0.6rem 1rem', borderBottom: '1px solid var(--border)',
              background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0,
            }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', background: 'var(--agent-a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: '0.65rem',
              }}>A</div>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Agent A</div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>
                  {agentAReceipts.length > 0 && agentACount > 0 ? 'finished' :
                    agentAReceipts.length > 0 ? <span className="typing-indicator" style={{ color: 'var(--agent-a)' }}>working</span> : 'waiting'}
                </div>
              </div>
            </div>
            <div ref={agentARef} style={{
              flex: 1, overflowY: 'auto', padding: '0.8rem',
              display: 'flex', flexDirection: 'column', gap: '0.6rem',
              alignItems: 'flex-start', background: 'var(--bg)',
            }}>
              {agentAReceipts.map((r, i) => (
                <div key={r.id} className="slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                  <div className="chat-bubble left" style={{ fontSize: '0.72rem' }}>
                    <span style={{ fontWeight: 500 }}>{r.action.description}</span>
                  </div>
                  {renderReceipt(r, i)}
                </div>
              ))}
            </div>
          </div>

          {/* Center Status */}
          <div style={{
            width: '180px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'var(--surface)', borderRight: '1px solid var(--border)',
            padding: '1rem 0.5rem', gap: '0.5rem', flexShrink: 0,
          }}>
            {/* Verification Progress */}
            {verifications.length > 0 && (
              <>
                <div style={{ fontSize: '0.65rem', color: 'var(--agent-b)', fontWeight: 600, textAlign: 'center' }}>
                  VERIFYING
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', width: '100%' }}>
                  {verifications.map((v, i) => (
                    <div key={i} className="slide-up" style={{
                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.15rem 0.35rem', borderRadius: '4px',
                      background: v.valid ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${v.valid ? '#bbf7d0' : '#fecaca'}`,
                      fontSize: '0.6rem',
                    }}>
                      <span style={{ fontWeight: 700, color: v.valid ? 'var(--green)' : 'var(--red)' }}>
                        {v.valid ? 'PASS' : 'FAIL'}
                      </span>
                      <span style={{ color: 'var(--text-muted)', ...mono }}>#{i}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {fabricationDetected && (
              <div style={{
                padding: '0.4rem', borderRadius: '6px', width: '100%',
                background: '#fef2f2', border: '1px solid var(--red)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--red)', fontWeight: 700 }}>REJECTED</div>
                <div style={{ fontSize: '0.58rem', color: '#991b1b', marginTop: '0.15rem' }}>Chain tampered</div>
              </div>
            )}

            {phase === 'done' && !fabricationDetected && (
              <>
                <div style={{ fontSize: '0.72rem', color: 'var(--green)', fontWeight: 700 }}>CHAIN VERIFIED</div>
                {chainRootHash && (
                  <div style={{ ...mono, fontSize: '0.52rem', color: 'var(--text-dim)', textAlign: 'center', wordBreak: 'break-all' }}>
                    root: {chainRootHash.slice(0, 20)}...
                  </div>
                )}
              </>
            )}

            {trustScore !== null && (
              <div style={{
                padding: '0.4rem', borderRadius: '6px', width: '100%',
                background: 'var(--bg)', border: '1px solid var(--border)', textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Trust</div>
                <div style={{
                  ...mono, fontSize: '1.3rem', fontWeight: 700,
                  color: trustScore >= 80 ? 'var(--green)' : trustScore >= 50 ? 'var(--amber)' : 'var(--red)',
                }}>
                  {trustScore}
                </div>
              </div>
            )}
          </div>

          {/* Agent B */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{
              padding: '0.6rem 1rem', borderBottom: '1px solid var(--border)',
              background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0,
            }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', background: 'var(--agent-b)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: '0.65rem',
              }}>B</div>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Agent B</div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>
                  {agentBReceipts.length > 0 ? (phase === 'done' ? 'finished' : <span className="typing-indicator" style={{ color: 'var(--agent-b)' }}>working</span>) :
                    verifications.length > 0 ? 'verifying...' : 'waiting for handoff'}
                </div>
              </div>
            </div>
            <div ref={agentBRef} style={{
              flex: 1, overflowY: 'auto', padding: '0.8rem',
              display: 'flex', flexDirection: 'column', gap: '0.6rem',
              alignItems: 'flex-end', background: 'var(--bg)',
            }}>
              {fabricationDetected && agentBReceipts.length === 0 && (
                <div className="slide-up" style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', height: '100%', gap: '0.6rem', textAlign: 'center',
                  width: '100%',
                }}>
                  <div style={{ fontSize: '1.8rem', color: 'var(--red)', fontWeight: 800 }}>X</div>
                  <div style={{ color: 'var(--red)', fontSize: '0.9rem', fontWeight: 700 }}>Handoff Rejected</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', maxWidth: '240px', lineHeight: 1.5 }}>
                    Agent A's chain contains fabricated data. Agent B refuses to continue.
                  </div>
                </div>
              )}
              {agentBReceipts.map((r, i) => (
                <div key={r.id} className="slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
                  <div className="chat-bubble right" style={{ fontSize: '0.72rem' }}>
                    <span style={{ fontWeight: 500 }}>{r.action.description}</span>
                  </div>
                  {renderReceipt(r, agentACount + i)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div style={{
        padding: '0.3rem 1.5rem', borderTop: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-dim)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: '0.8rem' }}>
          {['ed25519 signatures', 'SHA-256 hash chains', 'TEE attestation', '0G 5-pillar integration'].map(tag => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <a href="/" style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textDecoration: 'none', borderBottom: '1px dashed var(--border-dashed)' }}>
          Back to Dashboard
        </a>
      </div>
    </div>
  );
}
