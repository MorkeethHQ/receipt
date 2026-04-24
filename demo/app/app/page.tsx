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
}

interface VerificationResult {
  valid: boolean;
  receiptId: string;
  checks: { signatureValid: boolean; chainLinkValid: boolean; timestampValid: boolean };
  error?: string;
}

type Phase = 'idle' | 'agentA' | 'handoff' | 'verifying' | 'agentB' | 'done';

const ACTION_LABELS: Record<string, string> = {
  file_read: 'Reading file',
  api_call: 'Calling API',
  llm_call: 'Running inference',
  decision: 'Making decision',
  output: 'Producing output',
};

const ACTION_ICONS: Record<string, string> = {
  file_read: '[ ]',
  api_call: '<->',
  llm_call: '{AI}',
  decision: ' ? ',
  output: ' > ',
};

export default function Home() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptMeta, setReceiptMeta] = useState<Record<string, ReceiptMeta>>({});
  const [verifications, setVerifications] = useState<VerificationResult[]>([]);
  const [agentACount, setAgentACount] = useState(0);
  const [fabricationDetected, setFabricationDetected] = useState(false);
  const [tamperedIds, setTamperedIds] = useState<Set<string>>(new Set());
  const [chainRootHash, setChainRootHash] = useState<string | null>(null);
  const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ txHash: string; chain: string } | null>(null);
  const [anchor0g, setAnchor0g] = useState<{ txHash: string; chain: string } | null>(null);
  const [storage, setStorage] = useState<{ rootHash: string; uploaded: boolean } | null>(null);
  const [adversarial, setAdversarial] = useState(false);
  const [anchoring, setAnchoring] = useState(false);
  const shakeRef = useRef<HTMLDivElement>(null);
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

  const run = useCallback(async () => {
    setPhase('agentA');
    setReceipts([]);
    setReceiptMeta({});
    setVerifications([]);
    setAgentACount(0);
    setFabricationDetected(false);
    setTamperedIds(new Set());
    setChainRootHash(null);
    setExpandedReceipt(null);
    setAnchor(null);
    setAnchor0g(null);
    setStorage(null);

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

      let event = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          event = line.slice(7);
        } else if (line.startsWith('data: ') && event) {
          const data = JSON.parse(line.slice(6));
          handleEvent(event, data);
          event = '';
        }
      }
    }

    setPhase('done');
  }, [adversarial]);

  const handleEvent = useCallback((event: string, data: any) => {
    switch (event) {
      case 'receipt':
        setReceipts((prev) => [...prev, data.receipt]);
        setReceiptMeta((prev) => ({
          ...prev,
          [data.receipt.id]: { llmSource: data.llmSource, teeAttested: data.teeAttested, agent: data.agent },
        }));
        if (data.agent === 'B' && !data.isFirst) setPhase('agentB');
        break;
      case 'tampered':
        setTamperedIds((prev) => {
          const next = new Set(prev);
          setReceipts((receipts) => {
            if (receipts[data.index]) next.add(receipts[data.index].id);
            return receipts;
          });
          return next;
        });
        break;
      case 'verified':
        setPhase('verifying');
        setVerifications((prev) => [...prev, data.result]);
        if (!data.result.valid) {
          setTamperedIds((prev) => {
            const next = new Set(prev);
            next.add(data.result.receiptId);
            return next;
          });
        }
        break;
      case 'verification_complete':
        if (data.valid) setPhase('agentB');
        break;
      case 'fabrication_detected':
        setFabricationDetected(true);
        if (shakeRef.current) {
          shakeRef.current.classList.add('screen-shake');
          setTimeout(() => shakeRef.current?.classList.remove('screen-shake'), 2500);
        }
        break;
      case 'status':
        if (data.message?.includes('Verifying')) setPhase('handoff');
        break;
      case 'done':
        setAgentACount(data.agentACount);
        if (data.rootHash) setChainRootHash(data.rootHash);
        if (data.fabricated) setFabricationDetected(true);
        break;
    }
  }, []);

  const storeAndAnchor = useCallback(async () => {
    if (!chainRootHash) return;
    setAnchoring(true);

    try {
      const storeRes = await fetch('/api/store-0g', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chainData: JSON.stringify(receipts) }),
      });
      const storeData = await storeRes.json();
      if (storeData.rootHash) setStorage(storeData);
      const storageRef = storeData.rootHash || null;

      const [baseRes, ogRes] = await Promise.allSettled([
        fetch('/api/anchor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rootHash: chainRootHash, storageRef }),
        }).then((r) => r.json()),
        fetch('/api/anchor-0g', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rootHash: chainRootHash, storageRef }),
        }).then((r) => r.json()),
      ]);

      if (baseRes.status === 'fulfilled' && baseRes.value.txHash) setAnchor(baseRes.value);
      if (ogRes.status === 'fulfilled' && ogRes.value.txHash) setAnchor0g(ogRes.value);
    } catch {}
    setAnchoring(false);
  }, [chainRootHash, receipts]);

  const renderBubble = (receipt: Receipt, i: number, side: 'left' | 'right') => {
    const meta = receiptMeta[receipt.id];
    const verification = verifications.find((v) => v.receiptId === receipt.id);
    const isTampered = tamperedIds.has(receipt.id);
    const expanded = expandedReceipt === receipt.id;
    const isLlm = receipt.action.type === 'llm_call';

    return (
      <div
        key={receipt.id}
        className="pulse-in"
        onClick={() => setExpandedReceipt(expanded ? null : receipt.id)}
        style={{
          maxWidth: '95%',
          alignSelf: side === 'left' ? 'flex-start' : 'flex-end',
          cursor: 'pointer',
        }}
      >
        <div
          className={verification ? (verification.valid ? 'flash-green' : 'flash-red') : ''}
          style={{
            background: isTampered ? '#1a0808' : '#141418',
            border: isTampered
              ? '2px solid #ef4444'
              : `1px solid ${verification ? (verification.valid ? '#22c55e33' : '#ef444466') : '#1e1e2a'}`,
            borderRadius: '12px',
            padding: '0.7rem 0.9rem',
            animation: isTampered ? 'tamper-pulse 2s ease-in-out infinite' : 'none',
            boxShadow: isTampered ? '0 0 15px rgba(239,68,68,0.3)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
            <span style={{
              fontFamily: 'monospace', fontSize: '0.7rem', color: '#555',
              background: '#0a0a12', padding: '0.1rem 0.3rem', borderRadius: '3px',
            }}>
              {ACTION_ICONS[receipt.action.type] ?? '...'}
            </span>
            <span style={{ fontSize: '0.8rem', color: '#ccc', fontWeight: 500 }}>
              {ACTION_LABELS[receipt.action.type] ?? receipt.action.type}
            </span>
            {isLlm && (
              <span style={{
                fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '3px',
                background: meta?.teeAttested ? '#0a2a1a' : '#2a1a0a',
                border: `1px solid ${meta?.teeAttested ? '#22c55e' : '#f59e0b'}`,
                color: meta?.teeAttested ? '#22c55e' : '#f59e0b',
                fontWeight: 600,
              }}>
                {meta?.teeAttested ? 'TEE' : (meta?.llmSource === '0g-compute' ? '0G' : 'SIM')}
              </span>
            )}
            {isTampered && (
              <span style={{
                fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '3px',
                background: '#3a0a0a', border: '1px solid #ef4444', color: '#ef4444',
                fontWeight: 700,
              }}>
                FABRICATED
              </span>
            )}
          </div>

          <div style={{ fontSize: '0.75rem', color: '#888', lineHeight: 1.4 }}>
            {receipt.action.description}
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: '0.4rem', fontSize: '0.6rem', color: '#444',
          }}>
            <span style={{ fontFamily: 'monospace' }}>
              {receipt.id.slice(0, 8)}...
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              {verification ? (
                <span style={{ color: verification.valid ? '#22c55e' : '#ef4444', fontSize: '0.75rem' }}>
                  {verification.valid ? '~' : 'x'}
                </span>
              ) : (
                <span style={{ color: '#333' }}>~</span>
              )}
              <span style={{ color: '#333' }}>signed</span>
            </div>
          </div>

          {expanded && (
            <div style={{
              marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #1a1a2a',
              fontSize: '0.65rem', color: '#555', fontFamily: 'monospace',
            }}>
              <div>id: {receipt.id}</div>
              <div>prev: {receipt.prevId ?? 'null'}</div>
              <div>in: {receipt.inputHash.slice(0, 24)}...</div>
              <div>out: {receipt.outputHash.slice(0, 24)}...</div>
              <div>sig: {receipt.signature.slice(0, 24)}...</div>
              {meta?.llmSource && (
                <div style={{ color: meta.teeAttested ? '#22c55e' : '#f59e0b' }}>
                  inference: {meta.llmSource} {meta.teeAttested ? '(TEE Intel TDX)' : ''}
                </div>
              )}
              {verification && (
                <div style={{ color: verification.valid ? '#22c55e' : '#ef4444', marginTop: '0.2rem' }}>
                  sig:{verification.checks.signatureValid ? 'ok' : 'FAIL'} chain:{verification.checks.chainLinkValid ? 'ok' : 'FAIL'} time:{verification.checks.timestampValid ? 'ok' : 'FAIL'}
                  {verification.error && ` -- ${verification.error}`}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div ref={shakeRef} style={{ minHeight: '100vh', fontFamily: "'SF Mono', 'Fira Code', monospace" }}>
      {fabricationDetected && (
        <div className="fabrication-flash-long" style={{
          position: 'fixed', inset: 0, background: 'rgba(239, 68, 68, 0.3)',
          zIndex: 50, pointerEvents: 'none',
        }}>
          <div className="scan-line" />
          <div className="glitch-text" style={{
            position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%, -50%)',
            fontSize: '2.5rem', fontWeight: 'bold', color: '#ef4444',
            textShadow: '3px 3px #000, -2px -2px #ff0000, 2px -2px #ff6666',
            letterSpacing: '0.1em', textAlign: 'center',
          }}>
            FABRICATION DETECTED
          </div>
          <div style={{
            position: 'absolute', top: '55%', left: '50%', transform: 'translateX(-50%)',
            fontSize: '0.9rem', color: '#ff8888', textAlign: 'center', opacity: 0.9,
            maxWidth: '500px', lineHeight: 1.5,
          }}>
            "Source? I made it up" doesn't work here.<br/>
            Signature mismatch — Agent B refuses the handoff.
          </div>
        </div>
      )}

      <header style={{ padding: '1.5rem 2rem 1rem', borderBottom: '1px solid #1a1a1a' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', letterSpacing: '-0.02em', marginBottom: '0.2rem' }}>
              <span style={{ color: '#3b82f6' }}>R</span>.<span style={{ color: '#22c55e' }}>E</span>.<span style={{ color: '#f97316' }}>C</span>.<span style={{ color: '#a855f7' }}>E</span>.<span style={{ color: '#3b82f6' }}>I</span>.<span style={{ color: '#22c55e' }}>P</span>.<span style={{ color: '#f97316' }}>T</span>.
            </h1>
            <p style={{ color: '#ededed', fontSize: '0.9rem', fontWeight: 500 }}>
              Did your agent actually do it? Now you can prove it.
            </p>
            <p style={{ color: '#555', fontSize: '0.7rem', marginTop: '0.2rem' }}>
              Record of Every Computational Event with Immutable Proof and Trust
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#888', fontSize: '0.8rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={adversarial}
                onChange={(e) => setAdversarial(e.target.checked)}
                style={{ accentColor: '#ef4444' }}
              />
              <span style={{ color: adversarial ? '#ef4444' : '#666' }}>
                {adversarial ? 'Liar mode' : 'Honest mode'}
              </span>
            </label>
            <button
              onClick={run}
              disabled={phase !== 'idle' && phase !== 'done'}
              style={{
                padding: '0.5rem 1.2rem', borderRadius: '6px', border: 'none',
                background: (phase !== 'idle' && phase !== 'done') ? '#222' : (adversarial ? '#ef4444' : '#3b82f6'),
                color: '#fff', cursor: (phase !== 'idle' && phase !== 'done') ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600,
              }}
            >
              {(phase !== 'idle' && phase !== 'done') ? 'Running...' : (adversarial ? 'Run (with fabrication)' : 'Run Agents')}
            </button>
          </div>
        </div>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        gap: 0,
        height: 'calc(100vh - 160px)',
        overflow: 'hidden',
      }}>
        {/* Agent A Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid #1a1a1a' }}>
          <div style={{
            padding: '0.8rem 1rem',
            borderBottom: '1px solid #1a1a1a',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%',
              background: (phase === 'agentA' || receipts.length > 0) ? '#3b82f6' : '#222',
              boxShadow: phase === 'agentA' ? '0 0 8px #3b82f6' : 'none',
              transition: 'all 0.3s',
            }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#3b82f6' }}>Agent A</span>
            <span style={{ fontSize: '0.7rem', color: '#444' }}>Researcher</span>
            {phase === 'agentA' && (
              <span className="typing-dots" style={{ fontSize: '0.7rem', color: '#3b82f6', marginLeft: 'auto' }}>
                working...
              </span>
            )}
          </div>

          <div ref={agentARef} style={{
            flex: 1, overflowY: 'auto', padding: '1rem',
            display: 'flex', flexDirection: 'column', gap: '0.5rem',
          }}>
            {phase === 'idle' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#333', fontSize: '0.8rem' }}>
                Waiting to start...
              </div>
            )}
            {agentAReceipts.map((r, i) => renderBubble(r, i, 'left'))}
          </div>
        </div>

        {/* Center: Handoff / Verification */}
        <div style={{
          width: '180px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#080810', borderLeft: '1px solid #1a1a1a', borderRight: '1px solid #1a1a1a',
          padding: '1rem 0.5rem', gap: '0.5rem',
        }}>
          {phase === 'idle' && (
            <div style={{ color: '#333', fontSize: '0.7rem', textAlign: 'center' }}>
              Press Run to start
            </div>
          )}

          {(phase === 'handoff' || phase === 'verifying') && (
            <>
              <div style={{
                fontSize: '0.7rem', color: '#a855f7', textAlign: 'center',
                fontWeight: 600, marginBottom: '0.5rem',
              }}>
                HANDOFF
              </div>
              <div style={{
                display: 'flex', flexDirection: 'column', gap: '0.3rem',
                width: '100%', padding: '0 0.3rem',
              }}>
                {verifications.map((v, i) => (
                  <div key={i} className="pulse-in" style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    padding: '0.25rem 0.4rem', borderRadius: '4px',
                    background: v.valid ? '#0a1a0a' : '#1a0808',
                    border: `1px solid ${v.valid ? '#22c55e33' : '#ef444466'}`,
                    fontSize: '0.6rem',
                  }}>
                    <span style={{ color: v.valid ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                      {v.valid ? '~' : 'x'}
                    </span>
                    <span style={{ color: '#555', fontFamily: 'monospace' }}>
                      #{i + 1}
                    </span>
                    <span style={{ color: v.valid ? '#22c55e' : '#ef4444', fontSize: '0.55rem' }}>
                      {v.valid ? 'verified' : 'FAILED'}
                    </span>
                  </div>
                ))}
              </div>
              {fabricationDetected && (
                <div style={{
                  marginTop: '0.5rem', padding: '0.4rem', borderRadius: '6px',
                  background: '#1a0808', border: '1px solid #ef4444',
                  fontSize: '0.65rem', color: '#ef4444', textAlign: 'center',
                  fontWeight: 700,
                }}>
                  REJECTED
                </div>
              )}
            </>
          )}

          {(phase === 'agentB' || phase === 'done') && !fabricationDetected && (
            <>
              <div style={{
                fontSize: '0.65rem', color: '#22c55e', textAlign: 'center',
                fontWeight: 600,
              }}>
                VERIFIED
              </div>
              <div style={{ fontSize: '0.55rem', color: '#444', textAlign: 'center' }}>
                {verifications.filter(v => v.valid).length}/{verifications.length} receipts
              </div>
              {chainRootHash && (
                <div style={{
                  marginTop: '0.5rem', padding: '0.3rem', borderRadius: '4px',
                  background: '#0a0a14', border: '1px solid #1a1a3a',
                  fontSize: '0.55rem', color: '#666', textAlign: 'center',
                  wordBreak: 'break-all', fontFamily: 'monospace',
                }}>
                  root: {chainRootHash.slice(0, 12)}...
                </div>
              )}
            </>
          )}

          {phase === 'done' && !fabricationDetected && chainRootHash && (
            <button
              onClick={storeAndAnchor}
              disabled={anchoring}
              style={{
                marginTop: '0.5rem', padding: '0.3rem 0.6rem', borderRadius: '4px',
                border: '1px solid #22c55e44', background: 'transparent',
                color: anchoring ? '#444' : '#22c55e', fontSize: '0.6rem',
                cursor: anchoring ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}
            >
              {anchoring ? 'Anchoring...' : 'Anchor on-chain'}
            </button>
          )}

          {(anchor || anchor0g || storage) && (
            <div style={{ fontSize: '0.55rem', color: '#555', textAlign: 'center', marginTop: '0.3rem' }}>
              {storage && <div>0G Storage: {storage.uploaded ? 'uploaded' : 'hashed'}</div>}
              {anchor0g && <div>0G Chain: tx {anchor0g.txHash.slice(0, 8)}...</div>}
              {anchor && <div>Base: tx {anchor.txHash.slice(0, 8)}...</div>}
            </div>
          )}
        </div>

        {/* Agent B Panel */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{
            padding: '0.8rem 1rem',
            borderBottom: '1px solid #1a1a1a',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%',
              background: agentBReceipts.length > 0 ? '#a855f7' : '#222',
              boxShadow: phase === 'agentB' ? '0 0 8px #a855f7' : 'none',
              transition: 'all 0.3s',
            }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#a855f7' }}>Agent B</span>
            <span style={{ fontSize: '0.7rem', color: '#444' }}>Builder</span>
            {phase === 'agentB' && (
              <span className="typing-dots" style={{ fontSize: '0.7rem', color: '#a855f7', marginLeft: 'auto' }}>
                building...
              </span>
            )}
          </div>

          <div ref={agentBRef} style={{
            flex: 1, overflowY: 'auto', padding: '1rem',
            display: 'flex', flexDirection: 'column', gap: '0.5rem',
          }}>
            {phase === 'idle' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#333', fontSize: '0.8rem' }}>
                Waiting for handoff...
              </div>
            )}

            {phase === 'agentA' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#333', fontSize: '0.8rem' }}>
                Agent A is working...
              </div>
            )}

            {(phase === 'handoff' || phase === 'verifying') && !fabricationDetected && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#a855f7', fontSize: '0.8rem' }}>
                Verifying {verifications.length} / {agentAReceipts.length} receipts...
              </div>
            )}

            {fabricationDetected && (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', gap: '1rem',
              }}>
                <div style={{
                  fontSize: '2rem', color: '#ef4444',
                  animation: 'tamper-pulse 1.5s ease-in-out infinite',
                }}>
                  x
                </div>
                <div style={{ color: '#ef4444', fontSize: '0.9rem', fontWeight: 600, textAlign: 'center' }}>
                  Handoff rejected
                </div>
                <div style={{ color: '#888', fontSize: '0.75rem', textAlign: 'center', maxWidth: '250px', lineHeight: 1.5 }}>
                  Agent A's receipt chain contains fabricated data.
                  Signature verification failed on receipt #{Array.from(tamperedIds).length > 0 ? verifications.findIndex(v => !v.valid) + 1 : '?'}.
                </div>
                <div style={{
                  padding: '0.5rem 0.8rem', borderRadius: '6px',
                  background: '#1a0808', border: '1px solid #ef4444',
                  fontSize: '0.7rem', color: '#ef4444', fontFamily: 'monospace',
                }}>
                  "Did you actually do it?" — No.
                </div>
              </div>
            )}

            {agentBReceipts.map((r, i) => renderBubble(r, i, 'right'))}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '0.4rem 1.5rem', borderTop: '1px solid #1a1a1a',
        background: '#0a0a0a', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', fontSize: '0.65rem', color: '#444',
      }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {['0G Compute', '0G Storage', '0G Chain', '0G Fine-Tuning', 'Gensyn AXL', 'KeeperHub'].map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div>
          {receipts.length > 0 && `${receipts.length} receipts`}
          {chainRootHash && ` | root: ${chainRootHash.slice(0, 12)}...`}
        </div>
      </div>
    </div>
  );
}
