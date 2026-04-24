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

interface TamperDetail {
  index: number;
  field: string;
  detail: string;
}

type Phase = 'idle' | 'agentA' | 'handoff' | 'verifying' | 'agentB' | 'done';
type ViewMode = 'demo' | 'explorer';

const ACTION_LABELS: Record<string, string> = {
  file_read: 'Read file',
  api_call: 'Called API',
  llm_call: 'Ran inference',
  decision: 'Made decision',
  output: 'Produced output',
};

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>('demo');
  const [phase, setPhase] = useState<Phase>('idle');
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptMeta, setReceiptMeta] = useState<Record<string, ReceiptMeta>>({});
  const [verifications, setVerifications] = useState<VerificationResult[]>([]);
  const [agentACount, setAgentACount] = useState(0);
  const [fabricationDetected, setFabricationDetected] = useState(false);
  const [tamperedIds, setTamperedIds] = useState<Set<string>>(new Set());
  const [tamperDetails, setTamperDetails] = useState<Record<string, TamperDetail>>({});
  const [chainRootHash, setChainRootHash] = useState<string | null>(null);
  const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ txHash: string; chain: string } | null>(null);
  const [anchor0g, setAnchor0g] = useState<{ txHash: string; chain: string } | null>(null);
  const [storage, setStorage] = useState<{ rootHash: string; uploaded: boolean } | null>(null);
  const [adversarial, setAdversarial] = useState(false);
  const [anchoring, setAnchoring] = useState(false);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [trustScore, setTrustScore] = useState<number | null>(null);
  const [trainingData, setTrainingData] = useState<{ jsonl: string; stats: any } | null>(null);
  const [showTraining, setShowTraining] = useState(false);
  const [agenticId, setAgenticId] = useState<{ metadataHash: string; status: string; tokenId?: string; txHash?: string } | null>(null);
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
    setTamperDetails({});
    setChainRootHash(null);
    setExpandedReceipt(null);
    setAnchor(null);
    setAnchor0g(null);
    setStorage(null);
    setStatusLog([]);
    setTrustScore(null);
    setTrainingData(null);
    setShowTraining(false);
    setAgenticId(null);

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
        if (line.startsWith('event: ')) event = line.slice(7);
        else if (line.startsWith('data: ') && event) {
          handleEvent(event, JSON.parse(line.slice(6)));
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
          [data.receipt.id]: { llmSource: data.llmSource, teeAttested: data.teeAttested, agent: data.agent, rawInput: data.rawInput, rawOutput: data.rawOutput },
        }));
        if (data.agent === 'B' && !data.isFirst) setPhase('agentB');
        break;
      case 'tampered':
        setTamperedIds((prev) => {
          const next = new Set(prev);
          setReceipts((receipts) => {
            if (receipts[data.index]) {
              const rid = receipts[data.index].id;
              next.add(rid);
              setTamperDetails((prev) => ({ ...prev, [rid]: { index: data.index, field: data.field, detail: data.detail } }));
            }
            return receipts;
          });
          return next;
        });
        break;
      case 'verified':
        setPhase('verifying');
        setVerifications((prev) => [...prev, data.result]);
        if (!data.result.valid) {
          setTamperedIds((prev) => { const next = new Set(prev); next.add(data.result.receiptId); return next; });
        }
        break;
      case 'verification_complete':
        if (data.valid) setPhase('agentB');
        break;
      case 'fabrication_detected':
        setFabricationDetected(true);
        if (shakeRef.current) {
          shakeRef.current.classList.add('screen-shake');
          setTimeout(() => shakeRef.current?.classList.remove('screen-shake'), 800);
        }
        break;
      case 'status':
        if (data.message?.includes('Verifying')) setPhase('handoff');
        if (data.message) setStatusLog((prev) => [...prev.slice(-8), data.message]);
        break;
      case 'done':
        setAgentACount(data.agentACount);
        if (data.rootHash) setChainRootHash(data.rootHash);
        if (data.fabricated) setFabricationDetected(true);
        break;
      case 'trust_score':
        setTrustScore(data.score);
        break;
      case 'agentic_id':
        setAgenticId(data);
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
        fetch('/api/anchor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rootHash: chainRootHash, storageRef }) }).then(r => r.json()),
        fetch('/api/anchor-0g', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rootHash: chainRootHash, storageRef }) }).then(r => r.json()),
      ]);
      if (baseRes.status === 'fulfilled' && baseRes.value.txHash) setAnchor(baseRes.value);
      if (ogRes.status === 'fulfilled' && ogRes.value.txHash) setAnchor0g(ogRes.value);
    } catch {}
    setAnchoring(false);
  }, [chainRootHash, receipts]);

  const mono = { fontFamily: "'IBM Plex Mono', 'Courier New', monospace" };

  const renderReceiptCard = (receipt: Receipt, index: number) => {
    const meta = receiptMeta[receipt.id];
    const verification = verifications.find(v => v.receiptId === receipt.id);
    const isTampered = tamperedIds.has(receipt.id);
    const expanded = expandedReceipt === receipt.id;
    const time = new Date(receipt.timestamp);

    return (
      <div
        key={receipt.id}
        className={`receipt-card slide-up ${isTampered ? 'tampered' : ''}`}
        onClick={() => setExpandedReceipt(expanded ? null : receipt.id)}
        style={{ cursor: 'pointer', maxWidth: '340px', width: '100%', fontSize: '0.72rem' }}
      >
        {/* Receipt header */}
        <div style={{ padding: '0.5rem 0.7rem 0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ ...mono, fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.04em', color: 'var(--text)' }}>
            R.E.C.E.I.P.T.
          </span>
          <span style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-dim)' }}>#{index}</span>
        </div>
        <div className="dashed" />

        {/* Receipt body */}
        <div style={{ padding: '0.4rem 0.7rem', ...mono, fontSize: '0.65rem', lineHeight: 1.8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>ACTION</span>
            <span style={{ fontWeight: 600 }}>{receipt.action.type}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>TIME</span>
            <span>{time.toLocaleTimeString()}</span>
          </div>
          {receipt.action.type === 'llm_call' && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>SOURCE</span>
              <span style={{
                fontWeight: 600,
                color: meta?.teeAttested ? 'var(--green)' : meta?.llmSource === '0g-compute' ? 'var(--amber)' : 'var(--text-muted)',
              }}>
                {meta?.teeAttested ? 'TEE (TDX)' : meta?.llmSource === '0g-compute' ? '0G Compute' : 'Simulated'}
              </span>
            </div>
          )}
        </div>
        <div className="dashed" />

        {/* Hashes */}
        <div style={{ padding: '0.35rem 0.7rem', ...mono, fontSize: '0.58rem', lineHeight: 1.7, color: 'var(--text-muted)' }}>
          <div>IN  {receipt.inputHash.slice(0, 20)}...</div>
          <div style={{ color: isTampered ? 'var(--red)' : undefined, textDecoration: isTampered ? 'line-through' : undefined }}>
            OUT {receipt.outputHash.slice(0, 20)}...
          </div>
        </div>
        <div className="dashed" />

        {/* Signature + verification */}
        <div style={{ padding: '0.35rem 0.7rem', ...mono, fontSize: '0.58rem', color: 'var(--text-dim)' }}>
          <div>SIG {receipt.signature.slice(0, 20)}...</div>
          {receipt.prevId && <div>PREV {receipt.prevId.slice(0, 12)}...</div>}
        </div>
        <div className="dashed" />

        {/* Status */}
        <div style={{ padding: '0.4rem 0.7rem', textAlign: 'center', ...mono, fontSize: '0.65rem', fontWeight: 700 }}>
          {isTampered ? (
            <span className="stamp" style={{ color: 'var(--red)', letterSpacing: '0.1em' }}>TAMPERED</span>
          ) : verification ? (
            <span className="stamp" style={{ color: verification.valid ? 'var(--green)' : 'var(--red)', letterSpacing: '0.1em' }}>
              {verification.valid ? 'VERIFIED' : 'FAILED'}
            </span>
          ) : (
            <span style={{ color: 'var(--text-dim)', letterSpacing: '0.05em' }}>SIGNED</span>
          )}
        </div>

        {/* Expanded details */}
        {expanded && (
          <>
            <div className="dashed" />
            <div style={{ padding: '0.5rem 0.7rem', ...mono, fontSize: '0.55rem', lineHeight: 1.6, color: 'var(--text-muted)', background: '#faf8f2' }}>
              <div><span style={{ color: 'var(--text-dim)' }}>id       </span>{receipt.id}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>agent    </span>{receipt.agentId}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>prevId   </span>{receipt.prevId ?? '(genesis)'}</div>
              {meta?.rawInput && (
                <>
                  <div style={{ marginTop: '0.3rem', color: 'var(--text-dim)', fontWeight: 600 }}>INPUT</div>
                  <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{meta.rawInput.slice(0, 200)}</div>
                </>
              )}
              {meta?.rawOutput && (
                <>
                  <div style={{ marginTop: '0.3rem', color: 'var(--text-dim)', fontWeight: 600 }}>OUTPUT</div>
                  <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{meta.rawOutput.slice(0, 300)}</div>
                </>
              )}
              {verification && (
                <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.5rem' }}>
                  {[
                    { label: 'sig', ok: verification.checks.signatureValid },
                    { label: 'chain', ok: verification.checks.chainLinkValid },
                    { label: 'time', ok: verification.checks.timestampValid },
                  ].map(c => (
                    <span key={c.label} style={{ color: c.ok ? 'var(--green)' : 'var(--red)' }}>
                      {c.label}:{c.ok ? 'ok' : 'FAIL'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderChatMessage = (receipt: Receipt, index: number, side: 'left' | 'right') => {
    const meta = receiptMeta[receipt.id];
    const isTampered = tamperedIds.has(receipt.id);

    return (
      <div key={receipt.id} className="slide-up" style={{
        display: 'flex', flexDirection: 'column',
        alignItems: side === 'left' ? 'flex-start' : 'flex-end',
        gap: '0.3rem',
      }}>
        {/* Chat bubble with action description */}
        <div className={`chat-bubble ${side}`}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text)', fontWeight: 500 }}>
            {ACTION_LABELS[receipt.action.type] ?? receipt.action.type}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
            {receipt.action.description}
          </div>
          {isTampered && (
            <div style={{
              marginTop: '0.3rem', padding: '0.2rem 0.5rem', borderRadius: '4px',
              background: '#fef2f2', border: '1px solid #fecaca',
              fontSize: '0.68rem', color: 'var(--red)', fontWeight: 600,
            }}>
              Data was fabricated in this step
            </div>
          )}
        </div>

        {/* Receipt card attached below */}
        {renderReceiptCard(receipt, index)}
      </div>
    );
  };

  const renderExplorerView = () => {
    if (receipts.length === 0) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 140px - 30px)', color: 'var(--text-dim)' }}>
          Run agents to explore the receipt chain
        </div>
      );
    }
    const agents = [...new Set(receipts.map(r => r.agentId))];

    return (
      <div style={{ height: 'calc(100vh - 140px - 30px)', overflowY: 'auto', padding: '1.5rem 2rem 4rem', maxWidth: '900px', margin: '0 auto' }}>
        {/* Overview stats */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {[
            { label: 'Receipts', value: String(receipts.length) },
            { label: 'Agents', value: String(agents.length) },
            { label: 'Verified', value: `${verifications.filter(v => v.valid).length}/${verifications.length}`, color: verifications.every(v => v.valid) ? 'var(--green)' : 'var(--red)' },
            { label: 'Trust', value: trustScore !== null ? `${trustScore}/100` : '--', color: trustScore && trustScore >= 80 ? 'var(--green)' : trustScore && trustScore >= 50 ? 'var(--amber)' : undefined },
            { label: 'Crypto', value: 'ed25519 + SHA-256' },
          ].map(s => (
            <div key={s.label} style={{ padding: '0.6rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: s.color ?? 'var(--text)', marginTop: '0.1rem', ...mono }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Root hash */}
        {chainRootHash && (
          <div style={{ marginBottom: '1rem', padding: '0.5rem 0.8rem', background: 'var(--paper)', border: '1px dashed var(--border-dashed)', borderRadius: '2px', ...mono, fontSize: '0.65rem' }}>
            <span style={{ color: 'var(--text-dim)' }}>chain root </span>
            <span style={{ color: 'var(--green)', wordBreak: 'break-all' }}>{chainRootHash}</span>
          </div>
        )}

        {/* Fabrication banner */}
        {fabricationDetected && (
          <div style={{
            marginBottom: '1rem', padding: '0.8rem 1rem',
            background: '#fef2f2', border: '2px solid var(--red)', borderRadius: '6px',
          }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--red)', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
              FABRICATION DETECTED
            </div>
            <div style={{ fontSize: '0.8rem', color: '#991b1b', lineHeight: 1.5 }}>
              Agent A modified data after signing. The output hash no longer matches the ed25519 signature — chain integrity is broken.
            </div>
            {Object.values(tamperDetails).map(td => (
              <div key={td.index} style={{ marginTop: '0.3rem', ...mono, fontSize: '0.68rem', color: '#b91c1c' }}>
                Receipt #{td.index}: {td.detail}
              </div>
            ))}
          </div>
        )}

        {/* Receipt chain */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {receipts.map((receipt, i) => {
            const meta = receiptMeta[receipt.id];
            const isHandoff = agentACount > 0 && i === agentACount;
            const agentLabel = meta?.agent === 'A' ? 'Agent A' : 'Agent B';
            const agentColor = meta?.agent === 'A' ? 'var(--agent-a)' : 'var(--agent-b)';

            return (
              <div key={receipt.id}>
                {isHandoff && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '1rem 0', margin: '0.5rem 0',
                  }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                    <span style={{
                      fontSize: '0.7rem', color: 'var(--agent-b)', fontWeight: 600,
                      padding: '0.25rem 0.8rem', borderRadius: '20px',
                      border: '1px solid var(--border)', background: 'var(--surface)',
                    }}>
                      Handoff verified — Agent B continues
                    </span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  {/* Spine */}
                  <div style={{ width: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    {i > 0 && !isHandoff && <div style={{ width: '1px', height: '8px', background: 'var(--border)' }} />}
                    <div style={{
                      width: '10px', height: '10px', borderRadius: '50%',
                      background: tamperedIds.has(receipt.id) ? 'var(--red)' : agentColor,
                      flexShrink: 0,
                    }} />
                    {i < receipts.length - 1 && <div style={{ width: '1px', flex: 1, minHeight: '8px', background: 'var(--border)' }} />}
                  </div>

                  {/* Receipt */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.65rem', color: agentColor, fontWeight: 600, marginBottom: '0.2rem' }}>
                      {agentLabel} · {receipt.action.type}
                    </div>
                    {renderReceiptCard(receipt, i)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        {phase === 'done' && (
          <div style={{
            marginTop: '1.5rem', padding: '0.8rem 1rem', background: 'var(--surface)',
            borderRadius: '6px', border: '1px solid var(--border)',
            display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center',
          }}>
            {!fabricationDetected && chainRootHash && (
              <button onClick={storeAndAnchor} disabled={anchoring} style={{
                padding: '0.4rem 0.8rem', borderRadius: '6px',
                border: '1px solid var(--border)',
                background: anchoring ? 'var(--bg)' : 'var(--surface)',
                color: anchoring ? 'var(--text-dim)' : 'var(--text)',
                fontSize: '0.75rem', cursor: anchoring ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', fontWeight: 500,
              }}>
                {anchoring ? 'Anchoring...' : 'Store & Anchor on-chain'}
              </button>
            )}
            {(anchor || anchor0g || storage) && (
              <span style={{ fontSize: '0.7rem', color: 'var(--green)', ...mono }}>
                {anchor0g && `0G: ${anchor0g.txHash.slice(0, 10)}...`}
                {anchor && ` Base: ${anchor.txHash.slice(0, 10)}...`}
              </span>
            )}
            <button onClick={() => {
              const blob = new Blob([JSON.stringify(receipts, null, 2)], { type: 'application/json' });
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'receipt-chain.json'; a.click();
            }} style={{
              padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)', fontSize: '0.75rem',
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
            }}>
              Download JSON
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={shakeRef} style={{ minHeight: '100vh' }}>
      {/* Fabrication overlay */}
      {fabricationDetected && (
        <div className="flash-overlay" style={{
          position: 'fixed', inset: 0, background: 'rgba(220, 38, 38, 0.25)',
          zIndex: 50, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            fontSize: '2.5rem', fontWeight: 800, color: 'var(--red)',
            letterSpacing: '0.08em', textAlign: 'center',
            textShadow: '0 2px 20px rgba(220,38,38,0.5)',
          }}>
            FABRICATION DETECTED
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{
        padding: '1rem 2rem', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '0.8rem',
      }}>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>
            R.E.C.E.I.P.T.
          </h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
            Proof that your agent did what it said it did
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* View tabs */}
          <div style={{ display: 'flex', borderRadius: '6px', border: '1px solid var(--border)', overflow: 'hidden', marginRight: '0.3rem' }}>
            {(['demo', 'explorer'] as ViewMode[]).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                padding: '0.3rem 0.7rem', border: 'none',
                background: viewMode === mode ? 'var(--bg)' : 'var(--surface)',
                color: viewMode === mode ? 'var(--text)' : 'var(--text-dim)',
                fontSize: '0.72rem', cursor: 'pointer', fontWeight: viewMode === mode ? 600 : 400,
                fontFamily: 'inherit', textTransform: 'capitalize',
              }}>
                {mode}
              </button>
            ))}
          </div>

          <a href="/verify" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textDecoration: 'none', borderBottom: '1px dashed var(--border-dashed)' }}>
            Verify
          </a>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: '0.78rem' }}>
            <input type="checkbox" checked={adversarial} onChange={e => setAdversarial(e.target.checked)}
              style={{ accentColor: 'var(--red)' }} />
            <span style={{ color: adversarial ? 'var(--red)' : 'var(--text-muted)', fontWeight: adversarial ? 600 : 400 }}>
              {adversarial ? 'Liar mode' : 'Honest'}
            </span>
          </label>

          <button onClick={run} disabled={phase !== 'idle' && phase !== 'done'} style={{
            padding: '0.45rem 1rem', borderRadius: '6px', border: 'none',
            background: (phase !== 'idle' && phase !== 'done') ? 'var(--border)' : adversarial ? 'var(--red)' : 'var(--text)',
            color: '#fff', cursor: (phase !== 'idle' && phase !== 'done') ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600,
          }}>
            {(phase !== 'idle' && phase !== 'done') ? 'Running...' : adversarial ? 'Run (fabricate)' : 'Run Agents'}
          </button>
        </div>
      </header>

      {/* Explorer view */}
      {viewMode === 'explorer' && renderExplorerView()}

      {/* Demo view — two chat panels */}
      {viewMode === 'demo' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          height: 'calc(100vh - 64px - 30px)',
          overflow: 'hidden',
        }}>
          {/* Agent A Chat */}
          <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
            <div style={{
              padding: '0.7rem 1rem', borderBottom: '1px solid var(--border)',
              background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '0.6rem',
            }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'var(--agent-a)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: '0.75rem',
              }}>A</div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>Agent A</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                  {phase === 'agentA' ? (
                    <span className="typing-indicator" style={{ color: 'var(--agent-a)' }}>researching</span>
                  ) : receipts.length > 0 ? 'finished' : 'idle'}
                </div>
              </div>
            </div>

            <div ref={agentARef} style={{
              flex: 1, overflowY: 'auto', padding: '1rem',
              display: 'flex', flexDirection: 'column', gap: '0.8rem',
              background: 'var(--bg)',
            }}>
              {phase === 'idle' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                  Waiting to start...
                </div>
              )}
              {agentAReceipts.map((r, i) => renderChatMessage(r, i, 'left'))}
            </div>
          </div>

          {/* Center — Handoff / Status */}
          <div style={{
            width: '200px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'var(--surface)', borderRight: '1px solid var(--border)',
            padding: '1rem 0.6rem', gap: '0.6rem',
          }}>
            {phase === 'idle' && (
              <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textAlign: 'center' }}>
                Press Run to start
              </div>
            )}

            {/* Live status feed */}
            {statusLog.length > 0 && phase !== 'idle' && phase !== 'done' && !fabricationDetected && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                  Live
                </div>
                {statusLog.slice(-4).map((msg, i) => (
                  <div key={i} className="slide-up" style={{
                    fontSize: '0.6rem', color: i === statusLog.slice(-4).length - 1 ? 'var(--text-muted)' : 'var(--text-dim)',
                    textAlign: 'center', lineHeight: 1.4,
                  }}>
                    {msg.replace(/^Agent [AB]: /, '')}
                  </div>
                ))}
              </div>
            )}

            {/* Handoff verification */}
            {(phase === 'handoff' || phase === 'verifying') && (
              <div style={{ width: '100%' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--agent-b)', textAlign: 'center', fontWeight: 600, marginBottom: '0.4rem' }}>
                  VERIFYING HANDOFF
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  {verifications.map((v, i) => (
                    <div key={i} className="slide-up" style={{
                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.2rem 0.4rem', borderRadius: '4px',
                      background: v.valid ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${v.valid ? '#bbf7d0' : '#fecaca'}`,
                      fontSize: '0.65rem',
                    }}>
                      <span style={{ fontWeight: 700, color: v.valid ? 'var(--green)' : 'var(--red)' }}>
                        {v.valid ? '✓' : '✗'}
                      </span>
                      <span style={{ color: 'var(--text-muted)', ...mono }}>#{i}</span>
                      <span style={{ color: v.valid ? 'var(--green)' : 'var(--red)', fontSize: '0.6rem' }}>
                        {v.valid ? 'verified' : 'FAILED'}
                      </span>
                    </div>
                  ))}
                </div>
                {fabricationDetected && (
                  <div style={{
                    marginTop: '0.5rem', padding: '0.4rem', borderRadius: '6px',
                    background: '#fef2f2', border: '1px solid var(--red)',
                    fontSize: '0.72rem', color: 'var(--red)', textAlign: 'center', fontWeight: 700,
                  }}>
                    REJECTED
                  </div>
                )}
              </div>
            )}

            {/* Verified state */}
            {(phase === 'agentB' || phase === 'done') && !fabricationDetected && (
              <>
                <div style={{ fontSize: '0.72rem', color: 'var(--green)', fontWeight: 700 }}>
                  ✓ CHAIN VERIFIED
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textAlign: 'center' }}>
                  {verifications.filter(v => v.valid).length}/{verifications.length} receipts valid
                </div>
                {chainRootHash && (
                  <div style={{
                    padding: '0.3rem 0.5rem', borderRadius: '4px',
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    ...mono, fontSize: '0.58rem', color: 'var(--text-muted)', textAlign: 'center', wordBreak: 'break-all',
                  }}>
                    root: {chainRootHash.slice(0, 16)}...
                  </div>
                )}
              </>
            )}

            {/* Trust Score */}
            {trustScore !== null && (
              <div className="slide-up" style={{
                padding: '0.5rem', borderRadius: '6px', width: '100%',
                background: 'var(--bg)', border: '1px solid var(--border)', textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Trust Score</div>
                <div style={{
                  fontSize: '1.5rem', fontWeight: 700, ...mono,
                  color: trustScore >= 80 ? 'var(--green)' : trustScore >= 50 ? 'var(--amber)' : 'var(--red)',
                }}>
                  {trustScore}
                </div>
              </div>
            )}

            {/* Anchor button */}
            {phase === 'done' && !fabricationDetected && chainRootHash && (
              <button onClick={storeAndAnchor} disabled={anchoring} style={{
                padding: '0.35rem 0.7rem', borderRadius: '6px', width: '100%',
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: anchoring ? 'var(--text-dim)' : 'var(--text)',
                fontSize: '0.68rem', cursor: anchoring ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 500,
              }}>
                {anchoring ? 'Anchoring...' : 'Store & Anchor'}
              </button>
            )}

            {(anchor || anchor0g) && (
              <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--green)', textAlign: 'center' }}>
                {anchor0g && <div>0G: {anchor0g.txHash.slice(0, 10)}...</div>}
                {anchor && <div>Base: {anchor.txHash.slice(0, 10)}...</div>}
              </div>
            )}

            {/* Agentic ID */}
            {agenticId && (
              <div className="slide-up" style={{
                padding: '0.4rem', borderRadius: '6px', width: '100%',
                background: 'var(--bg)', border: '1px solid var(--border)', textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', letterSpacing: '0.04em' }}>ERC-7857 AGENTIC ID</div>
                <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  {agenticId.metadataHash.slice(0, 16)}...
                </div>
                <div style={{ fontSize: '0.55rem', color: agenticId.status === 'minted' ? 'var(--green)' : 'var(--amber)', marginTop: '0.1rem' }}>
                  {agenticId.status === 'minted' ? `Minted #${agenticId.tokenId}` : 'Computed'}
                </div>
              </div>
            )}
          </div>

          {/* Agent B Chat */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{
              padding: '0.7rem 1rem', borderBottom: '1px solid var(--border)',
              background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '0.6rem',
            }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'var(--agent-b)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: '0.75rem',
              }}>B</div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>Agent B</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                  {phase === 'agentB' ? (
                    <span className="typing-indicator" style={{ color: 'var(--agent-b)' }}>building</span>
                  ) : agentBReceipts.length > 0 ? 'finished' : phase === 'verifying' || phase === 'handoff' ? 'verifying...' : 'idle'}
                </div>
              </div>
            </div>

            <div ref={agentBRef} style={{
              flex: 1, overflowY: 'auto', padding: '1rem',
              display: 'flex', flexDirection: 'column', gap: '0.8rem',
              background: 'var(--bg)',
            }}>
              {phase === 'idle' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                  Waiting for handoff...
                </div>
              )}

              {phase === 'agentA' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                  Agent A is working...
                </div>
              )}

              {(phase === 'handoff' || phase === 'verifying') && !fabricationDetected && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--agent-b)', fontSize: '0.82rem' }}>
                  Verifying {verifications.length}/{agentAReceipts.length} receipts...
                </div>
              )}

              {fabricationDetected && (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', height: '100%', gap: '0.8rem', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '2rem', color: 'var(--red)', fontWeight: 800 }}>✗</div>
                  <div style={{ color: 'var(--red)', fontSize: '1rem', fontWeight: 700 }}>Handoff Rejected</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', maxWidth: '260px', lineHeight: 1.5 }}>
                    Agent A's chain contains fabricated data. Signature verification failed.
                  </div>
                  <div className="receipt-card" style={{
                    padding: '0.5rem 0.8rem', maxWidth: '240px',
                    textAlign: 'center', fontSize: '0.78rem', color: 'var(--red)',
                    fontWeight: 600, ...mono,
                  }}>
                    "Did you actually do it?"
                    <br />
                    <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>Prove it. Oh wait — you can't.</span>
                  </div>
                </div>
              )}

              {agentBReceipts.map((r, i) => renderChatMessage(r, agentACount + i, 'right'))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '0.35rem 1.5rem', borderTop: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-dim)',
      }}>
        <div style={{ display: 'flex', gap: '0.8rem' }}>
          {['0G Compute', '0G Storage', '0G Chain', '0G Fine-Tuning', 'ERC-7857', 'Gensyn AXL', 'KeeperHub'].map(tag => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', ...mono }}>
          {receipts.length > 0 && <span>{receipts.length} receipts</span>}
          {chainRootHash && <span>root:{chainRootHash.slice(0, 12)}...</span>}
        </div>
      </div>
    </div>
  );
}
