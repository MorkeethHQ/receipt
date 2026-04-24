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

type Phase = 'idle' | 'agentA' | 'handoff' | 'verifying' | 'agentB' | 'done';
type ViewMode = 'demo' | 'explorer';

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
  const [viewMode, setViewMode] = useState<ViewMode>('demo');
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
          [data.receipt.id]: { llmSource: data.llmSource, teeAttested: data.teeAttested, agent: data.agent, rawInput: data.rawInput, rawOutput: data.rawOutput },
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

  const formatData = (raw: string) => {
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
  };

  const renderExplorerView = () => {
    if (receipts.length === 0) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 160px)', color: '#333', fontSize: '0.85rem' }}>
          Run agents to see the receipt chain explorer
        </div>
      );
    }

    const agents = [...new Set(receipts.map(r => r.agentId))];

    return (
      <div style={{ height: 'calc(100vh - 160px)', overflowY: 'auto', padding: '1.5rem 2rem 4rem' }}>
        {/* Chain overview */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.5rem', marginBottom: '1.2rem',
        }}>
          {[
            { label: 'Receipts', value: String(receipts.length), color: '#ededed' },
            { label: 'Agents', value: String(agents.length), color: '#ededed' },
            { label: 'Verified', value: `${verifications.filter(v => v.valid).length}/${verifications.length}`, color: verifications.length > 0 ? (verifications.every(v => v.valid) ? '#22c55e' : '#ef4444') : '#555' },
            { label: 'Trust Score', value: trustScore !== null ? String(trustScore) : '--', color: trustScore !== null ? (trustScore >= 80 ? '#22c55e' : trustScore >= 50 ? '#f59e0b' : '#ef4444') : '#555' },
            { label: 'Crypto', value: 'ed25519 + SHA-256', color: '#888' },
          ].map((stat) => (
            <div key={stat.label} style={{
              padding: '0.6rem 0.7rem', background: '#0c0c14', borderRadius: '6px',
              border: '1px solid #1a1a2a',
            }}>
              <div style={{ fontSize: '0.55rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: stat.color, marginTop: '0.15rem' }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Root hash */}
        {chainRootHash && (
          <div style={{
            marginBottom: '1.2rem', padding: '0.5rem 0.7rem', background: '#0c0c14',
            borderRadius: '6px', border: '1px solid #1a1a2a', fontFamily: 'monospace', fontSize: '0.65rem',
          }}>
            <span style={{ color: '#555' }}>chain root </span>
            <span style={{ color: '#22c55e', wordBreak: 'break-all' }}>{chainRootHash}</span>
          </div>
        )}

        {/* Receipt chain */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {receipts.map((receipt, i) => {
            const meta = receiptMeta[receipt.id];
            const verification = verifications.find(v => v.receiptId === receipt.id);
            const isTampered = tamperedIds.has(receipt.id);
            const isHandoff = agentACount > 0 && i === agentACount;
            const agentColor = meta?.agent === 'A' ? '#3b82f6' : '#a855f7';
            const agentLabel = meta?.agent === 'A' ? 'Agent A · Researcher' : 'Agent B · Builder';

            return (
              <div key={receipt.id}>
                {isHandoff && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.8rem 0', margin: '0.2rem 0',
                  }}>
                    <div style={{ flex: 1, height: '1px', background: `${agentColor}44` }} />
                    <span style={{
                      fontSize: '0.65rem', color: '#a855f7', fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      padding: '0.2rem 0.6rem', borderRadius: '4px',
                      border: '1px solid #a855f733', background: '#0c0c14',
                    }}>
                      Handoff verified — Agent B continues
                    </span>
                    <div style={{ flex: 1, height: '1px', background: `${agentColor}44` }} />
                  </div>
                )}

                <div style={{ display: 'flex', gap: 0 }}>
                  {/* Chain spine */}
                  <div style={{ width: '36px', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    {i > 0 && !isHandoff && <div style={{ width: '2px', height: '6px', background: isTampered ? '#ef444466' : `${agentColor}33` }} />}
                    {isHandoff && i > 0 && <div style={{ width: '2px', height: '6px', background: '#a855f733' }} />}
                    <div style={{
                      width: '14px', height: '14px', borderRadius: '50%',
                      background: isTampered ? '#ef4444' : agentColor,
                      border: `2px solid ${isTampered ? '#ef4444' : agentColor}`,
                      boxShadow: isTampered ? '0 0 8px rgba(239,68,68,0.5)' : `0 0 4px ${agentColor}44`,
                      flexShrink: 0,
                    }} />
                    {i < receipts.length - 1 && <div style={{ width: '2px', flex: 1, minHeight: '6px', background: `${agentColor}33` }} />}
                  </div>

                  {/* Receipt block */}
                  <div style={{
                    flex: 1, marginBottom: '0.4rem',
                    background: isTampered ? '#1a0808' : '#0c0c14',
                    border: `1px solid ${isTampered ? '#ef4444' : '#1a1a2a'}`,
                    borderRadius: '6px',
                    animation: isTampered ? 'tamper-pulse 2s ease-in-out infinite' : 'none',
                  }}>
                    {/* Block header */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
                      padding: '0.5rem 0.7rem',
                      borderBottom: '1px solid #1a1a2a',
                    }}>
                      <span style={{ fontSize: '0.7rem', color: '#555', fontFamily: 'monospace', fontWeight: 700 }}>#{i}</span>
                      <span style={{
                        fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '3px',
                        background: `${agentColor}12`, border: `1px solid ${agentColor}33`,
                        color: agentColor, fontWeight: 600,
                      }}>
                        {agentLabel}
                      </span>
                      <span style={{
                        fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '3px',
                        background: '#0a0a12', border: '1px solid #222', color: '#999', fontWeight: 500,
                      }}>
                        {receipt.action.type}
                      </span>
                      {receipt.action.type === 'llm_call' && (
                        <span style={{
                          fontSize: '0.55rem', padding: '0.1rem 0.4rem', borderRadius: '3px',
                          background: meta?.teeAttested ? '#0a2a1a' : '#2a1a0a',
                          border: `1px solid ${meta?.teeAttested ? '#22c55e' : '#f59e0b'}`,
                          color: meta?.teeAttested ? '#22c55e' : '#f59e0b', fontWeight: 600,
                        }}>
                          {meta?.teeAttested ? 'TEE Intel TDX' : meta?.llmSource === '0g-compute' ? '0G Compute' : 'Simulated'}
                        </span>
                      )}
                      {isTampered && (
                        <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '3px', background: '#3a0a0a', border: '1px solid #ef4444', color: '#ef4444', fontWeight: 700 }}>
                          FABRICATED
                        </span>
                      )}
                      {verification && (
                        <span style={{
                          marginLeft: 'auto', fontSize: '0.6rem', padding: '0.15rem 0.5rem', borderRadius: '3px',
                          background: verification.valid ? '#0a1a0a' : '#1a0808',
                          border: `1px solid ${verification.valid ? '#22c55e33' : '#ef444444'}`,
                          color: verification.valid ? '#22c55e' : '#ef4444', fontWeight: 600,
                        }}>
                          {verification.valid ? 'VERIFIED' : 'FAILED'}
                          {verification.valid ? '' : ` — ${verification.error}`}
                        </span>
                      )}
                    </div>

                    {/* Block body — two columns */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                      {/* Left: cryptographic fields */}
                      <div style={{
                        padding: '0.5rem 0.7rem', borderRight: '1px solid #1a1a2a',
                        fontFamily: 'monospace', fontSize: '0.6rem', lineHeight: 1.7,
                      }}>
                        <div><span style={{ color: '#555' }}>id        </span><span style={{ color: '#888' }}>{receipt.id}</span></div>
                        <div><span style={{ color: '#555' }}>prevId    </span><span style={{ color: receipt.prevId ? '#666' : '#333' }}>{receipt.prevId ?? 'null'}</span></div>
                        <div><span style={{ color: '#555' }}>agentId   </span><span style={{ color: '#666' }}>{receipt.agentId}</span></div>
                        <div><span style={{ color: '#555' }}>time      </span><span style={{ color: '#666' }}>{new Date(receipt.timestamp).toISOString()}</span></div>
                        <div style={{ marginTop: '0.3rem', paddingTop: '0.3rem', borderTop: '1px solid #1a1a2a' }}>
                          <div><span style={{ color: '#555' }}>inputHash </span><span style={{ color: '#888', wordBreak: 'break-all' }}>{receipt.inputHash}</span></div>
                          <div><span style={{ color: '#555' }}>outputHash</span> <span style={{ color: isTampered ? '#ef4444' : '#888', wordBreak: 'break-all' }}>{receipt.outputHash}</span></div>
                        </div>
                        <div style={{ marginTop: '0.3rem', paddingTop: '0.3rem', borderTop: '1px solid #1a1a2a' }}>
                          <div><span style={{ color: '#555' }}>signature </span><span style={{ color: '#555', wordBreak: 'break-all' }}>{receipt.signature}</span></div>
                        </div>
                        {/* Verification checks */}
                        {verification && (
                          <div style={{ marginTop: '0.3rem', paddingTop: '0.3rem', borderTop: '1px solid #1a1a2a', display: 'flex', gap: '0.8rem' }}>
                            <span>sig: <span style={{ color: verification.checks.signatureValid ? '#22c55e' : '#ef4444' }}>{verification.checks.signatureValid ? 'ok' : 'FAIL'}</span></span>
                            <span>chain: <span style={{ color: verification.checks.chainLinkValid ? '#22c55e' : '#ef4444' }}>{verification.checks.chainLinkValid ? 'ok' : 'BROKEN'}</span></span>
                            <span>time: <span style={{ color: verification.checks.timestampValid ? '#22c55e' : '#ef4444' }}>{verification.checks.timestampValid ? 'ok' : 'FAIL'}</span></span>
                          </div>
                        )}
                        {/* Chain link */}
                        {receipt.prevId && (
                          <div style={{ marginTop: '0.3rem', paddingTop: '0.3rem', borderTop: '1px solid #1a1a2a', color: '#444' }}>
                            {receipt.prevId.slice(0, 8)}...
                            <span style={{ color: agentColor }}> → </span>
                            {receipt.id.slice(0, 8)}...
                          </div>
                        )}
                      </div>

                      {/* Right: raw data */}
                      <div style={{ padding: '0.5rem 0.7rem', fontSize: '0.6rem' }}>
                        <div style={{ color: '#555', marginBottom: '0.3rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.55rem' }}>
                          {receipt.action.description}
                        </div>
                        {meta?.rawInput && (
                          <>
                            <div style={{ color: '#444', fontSize: '0.55rem', marginBottom: '0.15rem' }}>INPUT</div>
                            <div style={{
                              padding: '0.3rem 0.4rem', borderRadius: '4px', background: '#080810',
                              border: '1px solid #1a1a2a', fontFamily: 'monospace',
                              color: '#777', maxHeight: '80px', overflowY: 'auto',
                              whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.4, fontSize: '0.58rem',
                            }}>
                              {meta.rawInput}
                            </div>
                          </>
                        )}
                        {meta?.rawOutput && (
                          <>
                            <div style={{ color: '#444', fontSize: '0.55rem', marginTop: '0.3rem', marginBottom: '0.15rem' }}>
                              OUTPUT <span style={{ fontWeight: 400, color: '#333' }}>→ SHA-256 → {receipt.outputHash.slice(0, 12)}...</span>
                            </div>
                            <div style={{
                              padding: '0.3rem 0.4rem', borderRadius: '4px',
                              background: isTampered ? '#1a0808' : '#080810',
                              border: `1px solid ${isTampered ? '#ef444433' : '#1a1a2a'}`,
                              fontFamily: 'monospace',
                              color: isTampered ? '#ef8888' : '#777',
                              maxHeight: '100px', overflowY: 'auto',
                              whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.4, fontSize: '0.58rem',
                            }}>
                              {formatData(meta.rawOutput)}
                            </div>
                          </>
                        )}
                        {!meta?.rawInput && !meta?.rawOutput && (
                          <div style={{ color: '#333', fontStyle: 'italic', fontSize: '0.6rem' }}>No raw data captured</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions bar */}
        {phase === 'done' && (
          <div style={{
            marginTop: '1rem', padding: '0.7rem 0.8rem', background: '#0c0c14',
            borderRadius: '6px', border: '1px solid #1a1a2a',
            display: 'flex', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'center',
          }}>
            {agenticId && (
              <div style={{ padding: '0.3rem 0.6rem', background: '#080810', borderRadius: '4px', border: '1px solid #3b82f622' }}>
                <span style={{ fontSize: '0.6rem', color: '#3b82f6', fontWeight: 600 }}>ERC-7857 </span>
                <span style={{ fontSize: '0.55rem', color: '#555', fontFamily: 'monospace' }}>{agenticId.metadataHash.slice(0, 16)}...</span>
              </div>
            )}
            {!fabricationDetected && chainRootHash && (
              <button onClick={storeAndAnchor} disabled={anchoring} style={{
                padding: '0.35rem 0.7rem', borderRadius: '4px', border: '1px solid #22c55e33',
                background: 'transparent', color: anchoring ? '#444' : '#22c55e',
                fontSize: '0.65rem', cursor: anchoring ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}>
                {anchoring ? 'Anchoring...' : 'Anchor on-chain'}
              </button>
            )}
            {(anchor || anchor0g || storage) && (
              <div style={{ fontSize: '0.6rem', color: '#555' }}>
                {storage && <span>Storage: ok | </span>}
                {anchor0g && <span>0G: {anchor0g.txHash.slice(0, 10)}... | </span>}
                {anchor && <span>Base: {anchor.txHash.slice(0, 10)}...</span>}
              </div>
            )}
            <button
              onClick={async () => {
                if (trainingData) { setShowTraining(!showTraining); return; }
                const res = await fetch('/api/training-data', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ receipts }),
                });
                const d = await res.json();
                setTrainingData(d);
                setShowTraining(true);
              }}
              style={{
                padding: '0.35rem 0.7rem', borderRadius: '4px', border: '1px solid #a855f733',
                background: 'transparent', color: '#a855f7', fontSize: '0.65rem',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {showTraining ? 'Hide' : 'Export'} Training JSONL
            </button>
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(receipts, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'receipt-chain.json'; a.click();
                URL.revokeObjectURL(url);
              }}
              style={{
                padding: '0.35rem 0.7rem', borderRadius: '4px', border: '1px solid #333',
                background: 'transparent', color: '#555', fontSize: '0.65rem',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Download JSON
            </button>
          </div>
        )}

        {/* Training data preview */}
        {showTraining && trainingData && (
          <div style={{
            marginTop: '0.5rem', padding: '0.7rem 0.8rem', background: '#0c0c14',
            borderRadius: '6px', border: '1px solid #a855f722',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.65rem', color: '#a855f7', fontWeight: 600 }}>0G Fine-Tuning Dataset</span>
              <span style={{ fontSize: '0.55rem', color: '#555' }}>{trainingData.stats.total} examples · Qwen2.5 / Qwen3</span>
            </div>
            <div style={{
              padding: '0.4rem', borderRadius: '4px', background: '#080810',
              border: '1px solid #1a1a2a', fontFamily: 'monospace', fontSize: '0.55rem',
              color: '#888', maxHeight: '160px', overflowY: 'auto', whiteSpace: 'pre-wrap',
              wordBreak: 'break-all', lineHeight: 1.5,
            }}>
              {trainingData.jsonl.split('\n').slice(0, 3).join('\n')}
              {trainingData.stats.total > 3 && `\n... (${trainingData.stats.total - 3} more)`}
            </div>
          </div>
        )}
      </div>
    );
  };

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
            {/* View tabs */}
            <div style={{
              display: 'flex', borderRadius: '6px', overflow: 'hidden',
              border: '1px solid #2a2a2a', marginRight: '0.5rem',
            }}>
              {(['demo', 'explorer'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    padding: '0.3rem 0.7rem', border: 'none',
                    background: viewMode === mode ? '#222' : 'transparent',
                    color: viewMode === mode ? '#ededed' : '#555',
                    fontSize: '0.7rem', fontFamily: 'inherit',
                    cursor: 'pointer', fontWeight: viewMode === mode ? 600 : 400,
                    textTransform: 'capitalize',
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
            <a href="/verify" style={{ fontSize: '0.7rem', color: '#555', textDecoration: 'none', borderBottom: '1px dashed #333', marginRight: '0.5rem' }}>
              Verify
            </a>
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

      {viewMode === 'explorer' && renderExplorerView()}

      {viewMode === 'demo' && <div style={{
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

          {/* Chain linkage visualization during agent A */}
          {phase === 'agentA' && receipts.length > 0 && (
            <div style={{
              width: '100%', padding: '0 0.3rem',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem',
            }}>
              <div style={{ fontSize: '0.55rem', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>
                Chain
              </div>
              {receipts.map((r, i) => (
                <div key={r.id} className="pulse-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: '#3b82f6', boxShadow: i === receipts.length - 1 ? '0 0 6px #3b82f6' : 'none',
                  }} />
                  {i < receipts.length - 1 && (
                    <div style={{ width: '1px', height: '8px', background: '#3b82f633' }} />
                  )}
                </div>
              ))}
            </div>
          )}

          {statusLog.length > 0 && phase !== 'idle' && !fabricationDetected && phase !== 'verifying' && phase !== 'handoff' && !(phase === 'agentB' || phase === 'done') && (
            <div style={{
              width: '100%', padding: '0 0.3rem',
              display: 'flex', flexDirection: 'column', gap: '0.2rem',
            }}>
              <div style={{ fontSize: '0.6rem', color: '#555', textAlign: 'center', marginBottom: '0.3rem' }}>
                LIVE
              </div>
              {statusLog.slice(-5).map((msg, i) => (
                <div key={i} className="pulse-in" style={{
                  fontSize: '0.55rem', color: i === statusLog.slice(-5).length - 1 ? '#888' : '#444',
                  textAlign: 'center', lineHeight: 1.4,
                  transition: 'color 0.3s',
                }}>
                  {msg.replace(/^Agent [AB]: /, '')}
                </div>
              ))}
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

          {/* Trust Score */}
          {trustScore !== null && (
            <div className="pulse-in" style={{
              marginTop: '0.5rem', padding: '0.5rem', borderRadius: '6px',
              background: '#0a0a14', border: `1px solid ${trustScore >= 80 ? '#22c55e33' : trustScore >= 50 ? '#f59e0b33' : '#ef444433'}`,
              textAlign: 'center', width: '100%',
            }}>
              <div style={{ fontSize: '0.55rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>
                Trust Score
              </div>
              <div style={{
                fontSize: '1.4rem', fontWeight: 700,
                color: trustScore >= 80 ? '#22c55e' : trustScore >= 50 ? '#f59e0b' : '#ef4444',
              }}>
                {trustScore}
              </div>
              <div style={{ fontSize: '0.5rem', color: '#444', marginTop: '0.2rem' }}>
                chain + provenance + TEE
              </div>
            </div>
          )}

          {/* Agentic ID (ERC-7857) */}
          {agenticId && (
            <div className="pulse-in" style={{
              marginTop: '0.3rem', padding: '0.4rem', borderRadius: '6px',
              background: '#0a0a14', border: '1px solid #3b82f633',
              textAlign: 'center', width: '100%',
            }}>
              <div style={{ fontSize: '0.55rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>
                Agentic ID
              </div>
              <div style={{ fontSize: '0.65rem', color: '#3b82f6', fontWeight: 600 }}>
                ERC-7857
              </div>
              <div style={{ fontSize: '0.5rem', color: '#555', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                {agenticId.metadataHash.slice(0, 14)}...
              </div>
              <div style={{
                fontSize: '0.5rem', marginTop: '0.15rem',
                color: agenticId.status === 'minted' ? '#22c55e' : '#f59e0b',
              }}>
                {agenticId.status === 'minted' ? `Minted #${agenticId.tokenId}` : 'Identity computed'}
              </div>
            </div>
          )}

          {/* Training Data Export */}
          {phase === 'done' && !fabricationDetected && receipts.length > 0 && (
            <button
              onClick={async () => {
                if (trainingData) { setShowTraining(!showTraining); return; }
                const res = await fetch('/api/training-data', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ receipts }),
                });
                const data = await res.json();
                setTrainingData(data);
                setShowTraining(true);
              }}
              style={{
                marginTop: '0.3rem', padding: '0.25rem 0.5rem', borderRadius: '4px',
                border: '1px solid #a855f733', background: 'transparent',
                color: '#a855f7', fontSize: '0.55rem',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {showTraining ? 'Hide' : 'Export'} Training Data
            </button>
          )}

          {showTraining && trainingData && (
            <div className="pulse-in" style={{
              marginTop: '0.3rem', padding: '0.3rem', borderRadius: '4px',
              background: '#0a0a14', border: '1px solid #a855f733',
              fontSize: '0.5rem', color: '#666', textAlign: 'center',
              width: '100%',
            }}>
              <div>{trainingData.stats.total} examples</div>
              <div>JSONL for 0G Fine-Tuning</div>
              <div style={{ color: '#a855f7' }}>Qwen2.5 / Qwen3 compatible</div>
            </div>
          )}

          {/* Verify link */}
          {phase === 'done' && !fabricationDetected && (
            <a
              href="/verify"
              style={{
                marginTop: '0.3rem', fontSize: '0.55rem', color: '#555',
                textDecoration: 'none', borderBottom: '1px dashed #333',
              }}
            >
              Open public verifier
            </a>
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
      </div>}

      {/* Bottom bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '0.4rem 1.5rem', borderTop: '1px solid #1a1a1a',
        background: '#0a0a0a', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', fontSize: '0.65rem', color: '#444',
      }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {['0G Compute', '0G Storage', '0G Chain', '0G Fine-Tuning', '0G Agentic ID', 'Gensyn AXL', 'KeeperHub'].map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {statusLog.length > 0 && phase !== 'idle' && phase !== 'done' && (
            <span className="typing-dots" style={{ color: '#666', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {statusLog[statusLog.length - 1]}
            </span>
          )}
          {receipts.length > 0 && <span>{receipts.length} receipts</span>}
          {chainRootHash && <span>root: {chainRootHash.slice(0, 12)}...</span>}
        </div>
      </div>
    </div>
  );
}
