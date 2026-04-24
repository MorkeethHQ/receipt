'use client';

import { useState, useCallback, useRef } from 'react';

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

interface VerificationResult {
  valid: boolean;
  receiptId: string;
  checks: { signatureValid: boolean; chainLinkValid: boolean; timestampValid: boolean };
  error?: string;
}

type Phase = 'idle' | 'running' | 'done';

export default function Home() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [verifications, setVerifications] = useState<VerificationResult[]>([]);
  const [agentACount, setAgentACount] = useState(0);
  const [agentBReceipts, setAgentBReceipts] = useState<Receipt[]>([]);
  const [fabricationDetected, setFabricationDetected] = useState(false);
  const [chainRootHash, setChainRootHash] = useState<string | null>(null);
  const [showExplorer, setShowExplorer] = useState(false);
  const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null);
  const [statusMessages, setStatusMessages] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<{ txHash: string; chain: string } | null>(null);
  const [anchor0g, setAnchor0g] = useState<{ txHash: string; chain: string } | null>(null);
  const [storage, setStorage] = useState<{ rootHash: string; uploaded: boolean } | null>(null);
  const [adversarial, setAdversarial] = useState(false);
  const shakeRef = useRef<HTMLDivElement>(null);

  const addStatus = useCallback((msg: string) => {
    setStatusMessages((prev) => [...prev, msg]);
  }, []);

  const run = useCallback(async () => {
    setPhase('running');
    setReceipts([]);
    setVerifications([]);
    setAgentACount(0);
    setAgentBReceipts([]);
    setFabricationDetected(false);
    setChainRootHash(null);
    setShowExplorer(false);
    setExpandedReceipt(null);
    setStatusMessages([]);
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
      case 'status':
        addStatus(data.message);
        break;
      case 'receipt':
        setReceipts((prev) => [...prev, data.receipt]);
        if (data.agent === 'B') {
          setAgentBReceipts((prev) => [...prev, data.receipt]);
        }
        break;
      case 'tampered':
        addStatus(`Receipt #${data.index + 1} tampered: ${data.field}`);
        break;
      case 'verified':
        setVerifications((prev) => [...prev, data.result]);
        break;
      case 'verification_complete':
        if (!data.valid) {
          addStatus('VERIFICATION FAILED');
        } else {
          addStatus('All receipts verified');
        }
        break;
      case 'fabrication_detected':
        setFabricationDetected(true);
        if (shakeRef.current) {
          shakeRef.current.classList.add('screen-shake');
          setTimeout(() => shakeRef.current?.classList.remove('screen-shake'), 500);
        }
        break;
      case 'done':
        setAgentACount(data.agentACount);
        if (data.rootHash) setChainRootHash(data.rootHash);
        if (data.fabricated) setFabricationDetected(true);
        break;
    }
  }, [addStatus]);

  const storeAndAnchor = useCallback(async () => {
    if (!chainRootHash) return;

    addStatus('Storing chain on 0G...');
    try {
      const storeRes = await fetch('/api/store-0g', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chainData: JSON.stringify(receipts) }),
      });
      const storeData = await storeRes.json();
      if (storeData.rootHash) {
        setStorage(storeData);
        addStatus(`0G Storage: ${storeData.uploaded ? 'uploaded' : 'root computed'} — ${storeData.rootHash.slice(0, 16)}...`);
      }

      const storageRef = storeData.rootHash || null;

      addStatus('Anchoring on-chain...');
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

      if (baseRes.status === 'fulfilled' && baseRes.value.txHash) {
        setAnchor(baseRes.value);
        addStatus(`Base Sepolia: tx ${baseRes.value.txHash.slice(0, 16)}...`);
      } else {
        addStatus('Base Sepolia: anchor failed');
      }

      if (ogRes.status === 'fulfilled' && ogRes.value.txHash) {
        setAnchor0g(ogRes.value);
        addStatus(`0G Mainnet: tx ${ogRes.value.txHash.slice(0, 16)}...`);
      } else {
        addStatus('0G Mainnet: anchor failed');
      }
    } catch (err: any) {
      addStatus(`Error: ${err.message}`);
    }
  }, [chainRootHash, receipts, addStatus]);

  return (
    <div ref={shakeRef} className="min-h-screen p-6 max-w-5xl mx-auto" style={{ fontFamily: "'SF Mono', 'Fira Code', monospace" }}>
      {fabricationDetected && (
        <div className="fabrication-flash" style={{
          position: 'fixed', inset: 0, background: 'rgba(239, 68, 68, 0.25)',
          zIndex: 50, pointerEvents: 'none',
        }}>
          <div className="scan-line" />
          <div className="glitch-text" style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            fontSize: '3rem', fontWeight: 'bold', color: '#ef4444',
            textShadow: '2px 2px #000, -2px -2px #fff',
          }}>
            FABRICATION DETECTED
          </div>
        </div>
      )}

      <header style={{ borderBottom: '1px solid #2a2a2a', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', letterSpacing: '-0.02em' }}>
          RECEIPT
        </h1>
        <p style={{ color: '#888', marginTop: '0.25rem' }}>
          Proof layer for agent work — signed, hash-linked receipts for verifiable handoffs
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          {['0G Storage', '0G Compute (TEE)', '0G Chain', 'Base Sepolia', 'Gensyn AXL', 'KeeperHub'].map((tag) => (
            <span key={tag} style={{
              padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem',
              background: '#1a1a2e', border: '1px solid #2a2a4a', color: '#888',
            }}>{tag}</span>
          ))}
        </div>
      </header>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', alignItems: 'center' }}>
        <button
          onClick={run}
          disabled={phase === 'running'}
          style={{
            padding: '0.6rem 1.5rem', borderRadius: '6px', border: 'none',
            background: phase === 'running' ? '#333' : '#3b82f6',
            color: '#fff', cursor: phase === 'running' ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600,
          }}
        >
          {phase === 'running' ? 'Running...' : 'Run Agent Pipeline'}
        </button>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#888', fontSize: '0.85rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={adversarial}
            onChange={(e) => setAdversarial(e.target.checked)}
            style={{ accentColor: '#ef4444' }}
          />
          Adversarial Mode
        </label>

        {phase === 'done' && chainRootHash && !fabricationDetected && (
          <>
            <button
              onClick={storeAndAnchor}
              style={{
                padding: '0.6rem 1.5rem', borderRadius: '6px', border: '1px solid #22c55e',
                background: 'transparent', color: '#22c55e', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '0.9rem',
              }}
            >
              Store & Anchor On-Chain
            </button>
            <button
              onClick={() => setShowExplorer(!showExplorer)}
              style={{
                padding: '0.6rem 1.5rem', borderRadius: '6px', border: '1px solid #a855f7',
                background: 'transparent', color: '#a855f7', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '0.9rem',
              }}
            >
              {showExplorer ? 'Hide' : 'Show'} Chain Explorer
            </button>
          </>
        )}
      </div>

      {statusMessages.length > 0 && (
        <div style={{
          background: '#111', border: '1px solid #2a2a2a', borderRadius: '8px',
          padding: '1rem', marginBottom: '1.5rem', maxHeight: '200px', overflowY: 'auto',
        }}>
          {statusMessages.map((msg, i) => (
            <div key={i} style={{ fontSize: '0.8rem', color: '#888', padding: '0.15rem 0' }}>
              <span style={{ color: '#555' }}>[{String(i + 1).padStart(2, '0')}]</span> {msg}
            </div>
          ))}
        </div>
      )}

      {receipts.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: '#ededed' }}>
            Receipt Chain ({receipts.length} receipts)
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {receipts.map((receipt, i) => {
              const isAgentB = i >= agentACount && agentACount > 0;
              const verification = verifications.find((v) => v.receiptId === receipt.id);
              const expanded = expandedReceipt === receipt.id;

              return (
                <div
                  key={receipt.id}
                  className={`pulse-in ${verification ? (verification.valid ? 'flash-green' : 'flash-red') : ''}`}
                  onClick={() => setExpandedReceipt(expanded ? null : receipt.id)}
                  style={{
                    background: '#141414',
                    border: `1px solid ${verification ? (verification.valid ? '#22c55e' : '#ef4444') : (isAgentB ? '#a855f7' : '#2a2a2a')}`,
                    borderRadius: '6px', padding: '0.75rem', cursor: 'pointer',
                    transition: 'border-color 0.3s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '3px',
                        background: isAgentB ? '#2d1b4e' : '#1a2332',
                        color: isAgentB ? '#a855f7' : '#3b82f6',
                      }}>
                        {isAgentB ? 'Agent B' : 'Agent A'}
                      </span>
                      <span style={{ fontSize: '0.85rem' }}>{receipt.action.description}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: '#555' }}>
                        {receipt.action.type}
                      </span>
                      {verification && (
                        <span style={{ color: verification.valid ? '#22c55e' : '#ef4444', fontSize: '0.8rem' }}>
                          {verification.valid ? '✓' : '✗'}
                        </span>
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#888' }}>
                      <div><strong>ID:</strong> {receipt.id}</div>
                      <div><strong>Prev:</strong> {receipt.prevId ?? 'null (chain start)'}</div>
                      <div><strong>Agent:</strong> {receipt.agentId}</div>
                      <div><strong>Input Hash:</strong> {receipt.inputHash.slice(0, 32)}...</div>
                      <div><strong>Output Hash:</strong> {receipt.outputHash.slice(0, 32)}...</div>
                      <div><strong>Signature:</strong> {receipt.signature.slice(0, 32)}...</div>
                      <div><strong>Time:</strong> {new Date(receipt.timestamp).toISOString()}</div>
                      {verification && (
                        <div style={{ marginTop: '0.5rem', color: verification.valid ? '#22c55e' : '#ef4444' }}>
                          Sig: {verification.checks.signatureValid ? '✓' : '✗'} |
                          Chain: {verification.checks.chainLinkValid ? '✓' : '✗'} |
                          Time: {verification.checks.timestampValid ? '✓' : '✗'}
                          {verification.error && <span> — {verification.error}</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showExplorer && receipts.length > 0 && (
        <div style={{
          background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: '8px',
          padding: '1.5rem', marginBottom: '1.5rem',
        }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Chain Explorer</h2>
          <div style={{ position: 'relative', paddingLeft: '2rem' }}>
            {receipts.map((receipt, i) => {
              const isAgentB = i >= agentACount && agentACount > 0;
              const isBoundary = i === agentACount && agentACount > 0;

              return (
                <div key={receipt.id}>
                  {isBoundary && (
                    <div style={{
                      margin: '0.5rem 0', padding: '0.3rem 0.8rem',
                      background: '#1a1a2e', border: '1px dashed #a855f7',
                      borderRadius: '4px', fontSize: '0.75rem', color: '#a855f7',
                      textAlign: 'center',
                    }}>
                      Agent Handoff Boundary
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <div style={{
                      width: '12px', height: '12px', borderRadius: '50%', marginTop: '4px',
                      background: isAgentB ? '#a855f7' : '#3b82f6', flexShrink: 0,
                      boxShadow: `0 0 6px ${isAgentB ? '#a855f7' : '#3b82f6'}44`,
                    }} />
                    {i < receipts.length - 1 && (
                      <div style={{
                        position: 'absolute', left: 'calc(2rem + 5px)', top: `${(isBoundary ? 0 : 0)}px`,
                        width: '2px', height: '100%', background: '#2a2a2a',
                      }} />
                    )}
                    <div style={{ fontSize: '0.8rem' }}>
                      <div style={{ color: '#ededed' }}>{receipt.action.description}</div>
                      <div style={{ color: '#555', fontSize: '0.7rem' }}>
                        {receipt.id.slice(0, 8)} → {receipt.prevId?.slice(0, 8) ?? 'null'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(chainRootHash || anchor || anchor0g || storage) && (
        <div style={{
          background: '#0d1a0d', border: '1px solid #1a3a1a', borderRadius: '8px',
          padding: '1rem', marginBottom: '1.5rem',
        }}>
          <h3 style={{ fontSize: '0.9rem', color: '#22c55e', marginBottom: '0.5rem' }}>On-Chain Anchoring</h3>
          {chainRootHash && (
            <div style={{ fontSize: '0.8rem', color: '#888' }}>
              <strong>Root Hash:</strong> {chainRootHash.slice(0, 32)}...
            </div>
          )}
          {storage && (
            <div style={{ fontSize: '0.8rem', color: '#888' }}>
              <strong>0G Storage:</strong> {storage.rootHash?.slice(0, 32)}... ({storage.uploaded ? 'uploaded' : 'root computed'})
            </div>
          )}
          {anchor && (
            <div style={{ fontSize: '0.8rem', color: '#888' }}>
              <strong>Base Sepolia:</strong> {anchor.txHash}
            </div>
          )}
          {anchor0g && (
            <div style={{ fontSize: '0.8rem', color: '#888' }}>
              <strong>0G Mainnet:</strong> {anchor0g.txHash}
            </div>
          )}
        </div>
      )}

      {phase === 'done' && (
        <div style={{
          background: '#141414', border: '1px solid #2a2a2a', borderRadius: '8px',
          padding: '1rem', fontSize: '0.85rem',
        }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Summary</h3>
          <div style={{ color: '#888' }}>
            {fabricationDetected ? (
              <span style={{ color: '#ef4444' }}>
                Fabrication detected — Agent B refused the handoff. The tampered receipt broke signature verification.
              </span>
            ) : (
              <>
                Agent A: {agentACount} receipts | Agent B: {agentBReceipts.length} receipts |
                Total chain: {receipts.length} | Root: {chainRootHash?.slice(0, 16)}...
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
