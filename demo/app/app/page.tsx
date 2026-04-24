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

const ACTION_LABELS: Record<string, string> = {
  file_read: 'File Read',
  api_call: 'API Call',
  llm_call: 'LLM Inference',
  decision: 'Decision',
  output: 'Output',
};

export default function Dashboard() {
  const [running, setRunning] = useState(false);
  const [adversarial, setAdversarial] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptMeta, setReceiptMeta] = useState<Record<string, ReceiptMeta>>({});
  const [verifications, setVerifications] = useState<VerificationResult[]>([]);
  const [agentACount, setAgentACount] = useState(0);
  const [chainRootHash, setChainRootHash] = useState<string | null>(null);
  const [fabricationDetected, setFabricationDetected] = useState(false);
  const [tamperedIds, setTamperedIds] = useState<Set<string>>(new Set());
  const [tamperDetails, setTamperDetails] = useState<Record<string, { index: number; field: string; detail: string }>>({});
  const [trustScore, setTrustScore] = useState<number | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);

  const [selectedAgent, setSelectedAgent] = useState<'A' | 'B'>('A');
  const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null);

  const [anchor, setAnchor] = useState<{ txHash: string; chain: string } | null>(null);
  const [anchor0g, setAnchor0g] = useState<{ txHash: string; chain: string } | null>(null);
  const [storage, setStorage] = useState<{ rootHash?: string; uploaded?: boolean } | null>(null);
  const [anchoring, setAnchoring] = useState(false);
  const [trainingData, setTrainingData] = useState<{ jsonl: string; stats: any } | null>(null);
  const [loadingTraining, setLoadingTraining] = useState(false);
  const [agenticId, setAgenticId] = useState<{ metadataHash: string; status: string; tokenId?: string; txHash?: string } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');

  const timelineRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: 'smooth' });
  }, [receipts]);

  const agentAReceipts = receipts.slice(0, agentACount || receipts.length);
  const agentBReceipts = agentACount > 0 ? receipts.slice(agentACount) : [];
  const selectedReceipts = selectedAgent === 'A' ? agentAReceipts : agentBReceipts;
  const hasData = receipts.length > 0;

  const getAgentStats = (agentReceipts: Receipt[], agent: 'A' | 'B') => {
    const teeCount = agentReceipts.filter(r => receiptMeta[r.id]?.teeAttested).length;
    const llmCount = agentReceipts.filter(r => r.action.type === 'llm_call').length;
    const lastReceipt = agentReceipts[agentReceipts.length - 1];
    const agentVerifications = agent === 'A' ? verifications : [];
    const verified = agentVerifications.length > 0 ? agentVerifications.every(v => v.valid) : null;
    return {
      count: agentReceipts.length,
      teeRate: llmCount > 0 ? Math.round((teeCount / llmCount) * 100) : null,
      lastActive: lastReceipt ? new Date(lastReceipt.timestamp) : null,
      verified,
    };
  };

  const run = useCallback(async () => {
    setRunning(true);
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
    setAgenticId(null);
    setSelectedAgent('A');

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
        let event = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) event = line.slice(7);
          else if (line.startsWith('data: ') && event) {
            handleEvent(event, JSON.parse(line.slice(6)));
            event = '';
          }
        }
      }
    } catch {}
    setRunning(false);
  }, [adversarial]);

  const handleEvent = useCallback((event: string, data: any) => {
    switch (event) {
      case 'receipt':
        setReceipts(prev => [...prev, data.receipt]);
        setReceiptMeta(prev => ({
          ...prev,
          [data.receipt.id]: {
            llmSource: data.llmSource,
            teeAttested: data.teeAttested,
            agent: data.agent,
            rawInput: data.rawInput,
            rawOutput: data.rawOutput,
          },
        }));
        break;
      case 'tampered':
        setTamperedIds(prev => {
          const next = new Set(prev);
          setReceipts(receipts => {
            if (receipts[data.index]) {
              const rid = receipts[data.index].id;
              next.add(rid);
              setTamperDetails(prev => ({ ...prev, [rid]: { index: data.index, field: data.field, detail: data.detail } }));
            }
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
      case 'status':
        if (data.message) setStatusLog(prev => [...prev.slice(-12), data.message]);
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
      case 'storage':
        if (data.rootHash) setStorage({ rootHash: data.rootHash, uploaded: data.uploaded });
        if (data.anchor?.txHash) setAnchor0g(data.anchor);
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

  const exportTraining = useCallback(async () => {
    if (receipts.length === 0) return;
    setLoadingTraining(true);
    try {
      const res = await fetch('/api/training-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipts }),
      });
      const data = await res.json();
      setTrainingData(data);
    } catch {}
    setLoadingTraining(false);
  }, [receipts]);

  const downloadJsonl = useCallback(() => {
    if (!trainingData) return;
    const blob = new Blob([trainingData.jsonl], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'receipt-training-data.jsonl';
    a.click();
  }, [trainingData]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('receipt-chain');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.receipts?.length > 0) {
          setReceipts(parsed.receipts);
          if (parsed.agentACount) setAgentACount(parsed.agentACount);
          if (parsed.rootHash) setChainRootHash(parsed.rootHash);
          if (parsed.meta) setReceiptMeta(parsed.meta);
        }
      }
    } catch {}
  }, []);

  // Save to localStorage when receipts change
  useEffect(() => {
    if (receipts.length > 0) {
      try {
        localStorage.setItem('receipt-chain', JSON.stringify({
          receipts, agentACount, rootHash: chainRootHash, meta: receiptMeta,
        }));
      } catch {}
    }
  }, [receipts, agentACount, chainRootHash, receiptMeta]);

  const importChain = useCallback((jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr);
      const chain: Receipt[] = Array.isArray(parsed) ? parsed : parsed.receipts;
      if (!chain || chain.length === 0) {
        setImportError('No receipts found in JSON');
        return;
      }
      for (const r of chain) {
        if (!r.id || !r.signature || !r.inputHash || !r.outputHash) {
          setImportError('Invalid receipt format — missing required fields');
          return;
        }
      }
      const agents = [...new Set(chain.map(r => r.agentId))];
      const firstAgentId = chain[0].agentId;
      const firstAgentCount = chain.filter(r => r.agentId === firstAgentId).length;

      setReceipts(chain);
      setReceiptMeta({});
      setVerifications([]);
      setAgentACount(agents.length > 1 ? firstAgentCount : chain.length);
      setFabricationDetected(false);
      setTamperedIds(new Set());
      setTamperDetails({});
      setChainRootHash(null);
      setAnchor(null);
      setAnchor0g(null);
      setStorage(null);
      setTrustScore(null);
      setTrainingData(null);
      setAgenticId(null);
      setSelectedAgent('A');
      setShowImport(false);
      setImportText('');
      setImportError('');
    } catch {
      setImportError('Invalid JSON');
    }
  }, []);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importChain(reader.result as string);
    reader.readAsText(file);
  }, [importChain]);

  const statsA = getAgentStats(agentAReceipts, 'A');
  const statsB = getAgentStats(agentBReceipts, 'B');

  // --- EMPTY STATE ---
  if (!hasData && !running) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <header style={{
          padding: '1rem 2rem', borderBottom: '1px solid var(--border)',
          background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)' }}>R.E.C.E.I.P.T.</h1>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Operator Dashboard</p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <a href="/demo" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textDecoration: 'none', borderBottom: '1px dashed var(--border-dashed)' }}>
              Live Demo
            </a>
            <a href="/verify" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textDecoration: 'none', borderBottom: '1px dashed var(--border-dashed)' }}>
              Verify
            </a>
          </div>
        </header>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 120px)', gap: '1.5rem', padding: '2rem' }}>
          <div style={{ textAlign: 'center', maxWidth: '480px' }}>
            <div style={{ ...mono, fontSize: '2.5rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: '0.8rem' }}>
              No agent activity yet
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              Run an agent pipeline to generate cryptographically signed receipts. Every action your agents take will be recorded, hash-linked, and independently verifiable.
            </p>
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={adversarial} onChange={e => setAdversarial(e.target.checked)} style={{ accentColor: 'var(--red)' }} />
                <span style={{ color: adversarial ? 'var(--red)' : 'var(--text-muted)', fontWeight: adversarial ? 600 : 400 }}>
                  Adversarial
                </span>
              </label>
              <button onClick={run} style={{
                padding: '0.6rem 1.5rem', borderRadius: '6px', border: 'none',
                background: adversarial ? 'var(--red)' : 'var(--text)',
                color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600,
              }}>
                Run Agent Pipeline
              </button>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>or</span>
              <button onClick={() => setShowImport(true)} style={{
                padding: '0.6rem 1.5rem', borderRadius: '6px',
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 500,
              }}>
                Import Chain
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '2rem', marginTop: '2rem', ...mono, fontSize: '0.65rem', color: 'var(--text-dim)' }}>
            <span>ed25519 signatures</span>
            <span>SHA-256 hash chains</span>
            <span>TEE attestation</span>
            <span>on-chain anchoring</span>
          </div>
        </div>

        {/* Import Modal */}
        {showImport && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} onClick={() => setShowImport(false)}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'var(--surface)', borderRadius: '8px', padding: '1.5rem',
              width: '90%', maxWidth: '560px', border: '1px solid var(--border)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.3rem' }}>Import Receipt Chain</h3>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Paste a receipt chain JSON or upload a file. The dashboard will render and verify the chain.
              </p>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileImport}
                style={{ display: 'none' }} />
              <button onClick={() => fileInputRef.current?.click()} style={{
                padding: '0.4rem 0.8rem', borderRadius: '5px', border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--text)', fontSize: '0.72rem',
                cursor: 'pointer', fontFamily: 'inherit', marginBottom: '0.6rem',
              }}>
                Upload JSON file
              </button>
              <textarea
                value={importText}
                onChange={e => { setImportText(e.target.value); setImportError(''); }}
                placeholder='[{"id":"...","agentId":"...","action":{"type":"file_read","description":"..."},...}]'
                style={{
                  width: '100%', height: '160px', padding: '0.6rem', borderRadius: '4px',
                  border: '1px solid var(--border)', ...mono, fontSize: '0.65rem',
                  resize: 'vertical', background: 'var(--bg)', color: 'var(--text)',
                  fontFamily: mono.fontFamily,
                }}
              />
              {importError && (
                <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: '0.3rem' }}>{importError}</div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowImport(false)} style={{
                  padding: '0.4rem 0.8rem', borderRadius: '5px', border: '1px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--text-muted)', fontSize: '0.72rem',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Cancel</button>
                <button onClick={() => importChain(importText)} disabled={!importText.trim()} style={{
                  padding: '0.4rem 0.8rem', borderRadius: '5px', border: 'none',
                  background: importText.trim() ? 'var(--text)' : 'var(--border)',
                  color: '#fff', fontSize: '0.72rem',
                  cursor: importText.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 600,
                }}>Import</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- DASHBOARD ---
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        padding: '0.7rem 1.5rem', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>R.E.C.E.I.P.T.</h1>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Operator Dashboard</p>
          </div>
          {running && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', animation: 'pulse-dot 1s ease-in-out infinite' }} />
              <span style={{ fontSize: '0.7rem', color: 'var(--green)', fontWeight: 500 }}>Pipeline running</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <a href="/demo" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textDecoration: 'none', borderBottom: '1px dashed var(--border-dashed)' }}>
            Live Demo
          </a>
          <a href="/verify" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textDecoration: 'none', borderBottom: '1px dashed var(--border-dashed)' }}>
            Verify
          </a>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={adversarial} onChange={e => setAdversarial(e.target.checked)} style={{ accentColor: 'var(--red)' }} />
            <span style={{ color: adversarial ? 'var(--red)' : 'var(--text-muted)' }}>Adversarial</span>
          </label>
          <button onClick={() => setShowImport(true)} style={{
            padding: '0.35rem 0.8rem', borderRadius: '6px',
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 500,
          }}>
            Import
          </button>
          <button onClick={run} disabled={running} style={{
            padding: '0.35rem 0.8rem', borderRadius: '6px', border: 'none',
            background: running ? 'var(--border)' : adversarial ? 'var(--red)' : 'var(--text)',
            color: '#fff', cursor: running ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600,
          }}>
            {running ? 'Running...' : 'Run Pipeline'}
          </button>
        </div>
      </header>

      {/* Import Modal (also available in dashboard state) */}
      {showImport && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowImport(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--surface)', borderRadius: '8px', padding: '1.5rem',
            width: '90%', maxWidth: '560px', border: '1px solid var(--border)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.3rem' }}>Import Receipt Chain</h3>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Paste a receipt chain JSON or upload a file.
            </p>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileImport} style={{ display: 'none' }} />
            <button onClick={() => fileInputRef.current?.click()} style={{
              padding: '0.4rem 0.8rem', borderRadius: '5px', border: '1px solid var(--border)',
              background: 'var(--bg)', color: 'var(--text)', fontSize: '0.72rem',
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: '0.6rem',
            }}>Upload JSON file</button>
            <textarea value={importText} onChange={e => { setImportText(e.target.value); setImportError(''); }}
              placeholder='[{"id":"...","agentId":"...","action":{"type":"file_read","description":"..."},...}]'
              style={{
                width: '100%', height: '160px', padding: '0.6rem', borderRadius: '4px',
                border: '1px solid var(--border)', ...mono, fontSize: '0.65rem',
                resize: 'vertical', background: 'var(--bg)', color: 'var(--text)',
                fontFamily: mono.fontFamily,
              }} />
            {importError && <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: '0.3rem' }}>{importError}</div>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowImport(false)} style={{
                padding: '0.4rem 0.8rem', borderRadius: '5px', border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text-muted)', fontSize: '0.72rem',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancel</button>
              <button onClick={() => importChain(importText)} disabled={!importText.trim()} style={{
                padding: '0.4rem 0.8rem', borderRadius: '5px', border: 'none',
                background: importText.trim() ? 'var(--text)' : 'var(--border)',
                color: '#fff', fontSize: '0.72rem',
                cursor: importText.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 600,
              }}>Import</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{
          borderRight: '1px solid var(--border)', background: 'var(--surface)',
          display: 'flex', flexDirection: 'column', overflowY: 'auto',
        }}>
          {/* Pipeline Summary */}
          <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.6rem' }}>
              Pipeline
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div style={{ padding: '0.4rem 0.6rem', background: 'var(--bg)', borderRadius: '4px' }}>
                <div style={{ ...mono, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>{receipts.length}</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>Receipts</div>
              </div>
              <div style={{ padding: '0.4rem 0.6rem', background: 'var(--bg)', borderRadius: '4px' }}>
                <div style={{
                  ...mono, fontSize: '1.1rem', fontWeight: 700,
                  color: trustScore === null ? 'var(--text-dim)' : trustScore >= 80 ? 'var(--green)' : trustScore >= 50 ? 'var(--amber)' : 'var(--red)',
                }}>
                  {trustScore ?? '--'}
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>Trust Score</div>
              </div>
            </div>
            {chainRootHash && (
              <div style={{ marginTop: '0.5rem', ...mono, fontSize: '0.58rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                root: {chainRootHash}
              </div>
            )}
            {fabricationDetected && (
              <div style={{
                marginTop: '0.5rem', padding: '0.3rem 0.5rem', borderRadius: '4px',
                background: '#fef2f2', border: '1px solid #fecaca',
                fontSize: '0.7rem', color: 'var(--red)', fontWeight: 600,
              }}>
                Fabrication detected
              </div>
            )}
          </div>

          {/* Agent Cards */}
          <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.6rem' }}>
              Agents
            </div>
            {[
              { key: 'A' as const, label: 'Agent A', color: 'var(--agent-a)', stats: statsA, receipts: agentAReceipts },
              { key: 'B' as const, label: 'Agent B', color: 'var(--agent-b)', stats: statsB, receipts: agentBReceipts },
            ].filter(a => a.stats.count > 0).map(agent => (
              <div
                key={agent.key}
                onClick={() => setSelectedAgent(agent.key)}
                style={{
                  padding: '0.7rem 0.8rem', borderRadius: '6px', marginBottom: '0.4rem',
                  background: selectedAgent === agent.key ? 'var(--bg)' : 'transparent',
                  border: selectedAgent === agent.key ? '1px solid var(--border)' : '1px solid transparent',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '50%', background: agent.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0,
                  }}>{agent.key}</div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>{agent.label}</span>
                  {agent.stats.verified !== null && (
                    <span style={{
                      marginLeft: 'auto', fontSize: '0.6rem', fontWeight: 600, ...mono,
                      color: agent.stats.verified ? 'var(--green)' : 'var(--red)',
                    }}>
                      {agent.stats.verified ? 'VERIFIED' : 'FAILED'}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.8rem', paddingLeft: '2rem', ...mono, fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                  <span>{agent.stats.count} receipts</span>
                  {agent.stats.teeRate !== null && <span>TEE: {agent.stats.teeRate}%</span>}
                  {agent.stats.lastActive && <span>{agent.stats.lastActive.toLocaleTimeString()}</span>}
                </div>
              </div>
            ))}
            {receipts.length === 0 && running && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                Waiting for agents...
              </div>
            )}
          </div>

          {/* Actions */}
          {hasData && !running && (
            <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.6rem' }}>
                Actions
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {!fabricationDetected && chainRootHash && (
                  <button onClick={storeAndAnchor} disabled={anchoring} style={{
                    padding: '0.45rem 0.7rem', borderRadius: '5px', border: '1px solid var(--border)',
                    background: 'var(--surface)', color: anchoring ? 'var(--text-dim)' : 'var(--text)',
                    fontSize: '0.72rem', cursor: anchoring ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', fontWeight: 500, textAlign: 'left', width: '100%',
                  }}>
                    {anchoring ? 'Anchoring...' : 'Anchor On-Chain'}
                  </button>
                )}
                <button onClick={exportTraining} disabled={loadingTraining} style={{
                  padding: '0.45rem 0.7rem', borderRadius: '5px', border: '1px solid var(--border)',
                  background: 'var(--surface)', color: loadingTraining ? 'var(--text-dim)' : 'var(--text)',
                  fontSize: '0.72rem', cursor: loadingTraining ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', fontWeight: 500, textAlign: 'left', width: '100%',
                }}>
                  {loadingTraining ? 'Generating...' : 'Export Training Data'}
                </button>
                <button onClick={() => {
                  const blob = new Blob([JSON.stringify(receipts, null, 2)], { type: 'application/json' });
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'receipt-chain.json'; a.click();
                }} style={{
                  padding: '0.45rem 0.7rem', borderRadius: '5px', border: '1px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--text)',
                  fontSize: '0.72rem', cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 500, textAlign: 'left', width: '100%',
                }}>
                  Download Chain JSON
                </button>
              </div>
            </div>
          )}

          {/* Anchoring Results */}
          {(anchor || anchor0g || storage) && (
            <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.6rem' }}>
                On-Chain Anchors
              </div>
              {storage?.rootHash && (
                <div style={{ marginBottom: '0.4rem' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>0G Storage</div>
                  <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--green)', wordBreak: 'break-all' }}>{storage.rootHash}</div>
                </div>
              )}
              {anchor0g?.txHash && (
                <div style={{ marginBottom: '0.4rem' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>0G Mainnet</div>
                  <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--green)', wordBreak: 'break-all' }}>{anchor0g.txHash}</div>
                </div>
              )}
              {anchor?.txHash && (
                <div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>Base Sepolia</div>
                  <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--green)', wordBreak: 'break-all' }}>{anchor.txHash}</div>
                </div>
              )}
            </div>
          )}

          {/* Agentic ID */}
          {agenticId && (
            <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.6rem' }}>
                ERC-7857 Agent Identity
              </div>
              <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-muted)', wordBreak: 'break-all', marginBottom: '0.3rem' }}>
                {agenticId.metadataHash}
              </div>
              <div style={{
                fontSize: '0.65rem', fontWeight: 600,
                color: agenticId.status === 'minted' ? 'var(--green)' : 'var(--amber)',
              }}>
                {agenticId.status === 'minted' ? `Minted Token #${agenticId.tokenId}` : 'Identity Computed'}
              </div>
              {agenticId.txHash && (
                <div style={{ ...mono, fontSize: '0.58rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
                  tx: {agenticId.txHash}
                </div>
              )}
            </div>
          )}

          {/* Status Log */}
          {statusLog.length > 0 && (
            <div style={{ padding: '1rem 1.2rem', flex: 1 }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.6rem' }}>
                Activity Log
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                {statusLog.slice(-8).map((msg, i) => (
                  <div key={i} style={{ fontSize: '0.6rem', color: i === statusLog.length - 1 ? 'var(--text-muted)' : 'var(--text-dim)', ...mono }}>
                    {msg}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div ref={timelineRef} style={{ overflowY: 'auto', padding: '1.5rem 2rem 4rem' }}>
          {/* Agent header */}
          {selectedReceipts.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: selectedAgent === 'A' ? 'var(--agent-a)' : 'var(--agent-b)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: '0.7rem', fontWeight: 700,
                }}>{selectedAgent}</div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
                  Agent {selectedAgent}
                </h2>
                <span style={{ ...mono, fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                  {selectedReceipts.length} receipts
                </span>
                {selectedAgent === 'A' && verifications.length > 0 && (
                  <span style={{
                    ...mono, fontSize: '0.68rem', fontWeight: 600, marginLeft: 'auto',
                    padding: '0.2rem 0.5rem', borderRadius: '4px',
                    background: verifications.every(v => v.valid) ? '#f0fdf4' : '#fef2f2',
                    color: verifications.every(v => v.valid) ? 'var(--green)' : 'var(--red)',
                    border: `1px solid ${verifications.every(v => v.valid) ? '#bbf7d0' : '#fecaca'}`,
                  }}>
                    {verifications.every(v => v.valid) ? `${verifications.length}/${verifications.length} VERIFIED` : 'CHAIN BROKEN'}
                  </span>
                )}
              </div>
              {selectedReceipts.length > 0 && (
                <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-dim)', paddingLeft: '2.4rem' }}>
                  {selectedReceipts[0].agentId}
                </div>
              )}
            </div>
          )}

          {/* Fabrication Alert */}
          {fabricationDetected && selectedAgent === 'A' && (
            <div style={{
              marginBottom: '1.5rem', padding: '1rem 1.2rem',
              background: '#fef2f2', border: '2px solid var(--red)', borderRadius: '8px',
            }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--red)', marginBottom: '0.3rem' }}>
                FABRICATION DETECTED
              </div>
              <div style={{ fontSize: '0.78rem', color: '#991b1b', lineHeight: 1.5 }}>
                Agent A modified data after signing. The output hash no longer matches the ed25519 signature. Chain integrity is broken.
              </div>
              {Object.values(tamperDetails).map(td => (
                <div key={td.index} style={{ marginTop: '0.4rem', ...mono, fontSize: '0.68rem', color: '#b91c1c' }}>
                  Receipt #{td.index}: {td.detail}
                </div>
              ))}
            </div>
          )}

          {/* Receipt Timeline */}
          {selectedReceipts.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {selectedReceipts.map((receipt, i) => {
                const meta = receiptMeta[receipt.id];
                const isTampered = tamperedIds.has(receipt.id);
                const verification = verifications.find(v => v.receiptId === receipt.id);
                const expanded = expandedReceipt === receipt.id;
                const globalIndex = selectedAgent === 'A' ? i : agentACount + i;
                const time = new Date(receipt.timestamp);

                return (
                  <div key={receipt.id} style={{ display: 'flex', gap: '0' }}>
                    {/* Timeline spine */}
                    <div style={{ width: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      {i > 0 && <div style={{ width: '1px', height: '12px', background: isTampered ? 'var(--red)' : 'var(--border)' }} />}
                      <div style={{
                        width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                        background: isTampered ? 'var(--red)' : verification?.valid ? 'var(--green)' : selectedAgent === 'A' ? 'var(--agent-a)' : 'var(--agent-b)',
                      }} />
                      {i < selectedReceipts.length - 1 && <div style={{ width: '1px', flex: 1, minHeight: '12px', background: 'var(--border)' }} />}
                    </div>

                    {/* Receipt content */}
                    <div
                      onClick={() => setExpandedReceipt(expanded ? null : receipt.id)}
                      style={{
                        flex: 1, marginBottom: '0.3rem', padding: '0.6rem 0.8rem',
                        background: 'var(--surface)', border: `1px solid ${isTampered ? 'var(--red)' : 'var(--border)'}`,
                        borderRadius: '6px', cursor: 'pointer',
                        boxShadow: isTampered ? '0 0 0 1px var(--red)' : undefined,
                      }}
                    >
                      {/* Header row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)' }}>
                          {ACTION_LABELS[receipt.action.type] ?? receipt.action.type}
                        </span>
                        {receipt.action.type === 'llm_call' && meta?.teeAttested && (
                          <span style={{
                            ...mono, fontSize: '0.55rem', fontWeight: 600, padding: '0.1rem 0.35rem',
                            borderRadius: '3px', background: '#f0fdf4', color: 'var(--green)',
                            border: '1px solid #bbf7d0',
                          }}>TEE TDX</span>
                        )}
                        {receipt.action.type === 'llm_call' && meta?.llmSource === '0g-compute' && !meta?.teeAttested && (
                          <span style={{
                            ...mono, fontSize: '0.55rem', fontWeight: 600, padding: '0.1rem 0.35rem',
                            borderRadius: '3px', background: '#fffbeb', color: 'var(--amber)',
                            border: '1px solid #fde68a',
                          }}>0G COMPUTE</span>
                        )}
                        {receipt.action.type === 'llm_call' && meta?.llmSource === 'simulated' && (
                          <span style={{
                            ...mono, fontSize: '0.55rem', fontWeight: 600, padding: '0.1rem 0.35rem',
                            borderRadius: '3px', background: 'var(--bg)', color: 'var(--text-dim)',
                            border: '1px solid var(--border)',
                          }}>SIMULATED</span>
                        )}
                        {isTampered && (
                          <span style={{
                            ...mono, fontSize: '0.55rem', fontWeight: 700, padding: '0.1rem 0.35rem',
                            borderRadius: '3px', background: '#fef2f2', color: 'var(--red)',
                            border: '1px solid #fecaca',
                          }}>TAMPERED</span>
                        )}
                        {verification && !isTampered && (
                          <span style={{
                            ...mono, fontSize: '0.55rem', fontWeight: 600, padding: '0.1rem 0.35rem',
                            borderRadius: '3px',
                            background: verification.valid ? '#f0fdf4' : '#fef2f2',
                            color: verification.valid ? 'var(--green)' : 'var(--red)',
                            border: `1px solid ${verification.valid ? '#bbf7d0' : '#fecaca'}`,
                          }}>{verification.valid ? 'PASS' : 'FAIL'}</span>
                        )}
                        <span style={{ marginLeft: 'auto', ...mono, fontSize: '0.6rem', color: 'var(--text-dim)' }}>
                          #{globalIndex} {time.toLocaleTimeString()}
                        </span>
                      </div>

                      {/* Description */}
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                        {receipt.action.description}
                      </div>

                      {/* Hash row */}
                      <div style={{ display: 'flex', gap: '1rem', ...mono, fontSize: '0.58rem', color: 'var(--text-dim)' }}>
                        <span>IN {receipt.inputHash.slice(0, 16)}...</span>
                        <span style={{ color: isTampered ? 'var(--red)' : undefined, textDecoration: isTampered ? 'line-through' : undefined }}>
                          OUT {receipt.outputHash.slice(0, 16)}...
                        </span>
                        <span>SIG {receipt.signature.slice(0, 12)}...</span>
                      </div>

                      {/* Expanded details */}
                      {expanded && (
                        <div style={{
                          marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px dashed var(--border-dashed)',
                          ...mono, fontSize: '0.58rem', lineHeight: 1.7, color: 'var(--text-muted)',
                        }}>
                          <div><span style={{ color: 'var(--text-dim)', display: 'inline-block', width: '70px' }}>id</span>{receipt.id}</div>
                          <div><span style={{ color: 'var(--text-dim)', display: 'inline-block', width: '70px' }}>agent</span>{receipt.agentId}</div>
                          <div><span style={{ color: 'var(--text-dim)', display: 'inline-block', width: '70px' }}>prevId</span>{receipt.prevId ?? '(genesis)'}</div>
                          <div><span style={{ color: 'var(--text-dim)', display: 'inline-block', width: '70px' }}>inputHash</span>{receipt.inputHash}</div>
                          <div style={{ color: isTampered ? 'var(--red)' : undefined }}>
                            <span style={{ color: 'var(--text-dim)', display: 'inline-block', width: '70px' }}>outputHash</span>{receipt.outputHash}
                          </div>
                          <div><span style={{ color: 'var(--text-dim)', display: 'inline-block', width: '70px' }}>signature</span>{receipt.signature}</div>
                          {meta?.rawInput && (
                            <div style={{ marginTop: '0.4rem' }}>
                              <div style={{ color: 'var(--text-dim)', fontWeight: 600, marginBottom: '0.15rem' }}>INPUT</div>
                              <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--bg)', padding: '0.4rem', borderRadius: '3px' }}>
                                {meta.rawInput.slice(0, 300)}
                              </div>
                            </div>
                          )}
                          {meta?.rawOutput && (
                            <div style={{ marginTop: '0.4rem' }}>
                              <div style={{ color: 'var(--text-dim)', fontWeight: 600, marginBottom: '0.15rem' }}>OUTPUT</div>
                              <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--bg)', padding: '0.4rem', borderRadius: '3px' }}>
                                {meta.rawOutput.slice(0, 400)}
                              </div>
                            </div>
                          )}
                          {verification && (
                            <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.8rem' }}>
                              {[
                                { label: 'signature', ok: verification.checks.signatureValid },
                                { label: 'chain link', ok: verification.checks.chainLinkValid },
                                { label: 'timestamp', ok: verification.checks.timestampValid },
                              ].map(c => (
                                <span key={c.label} style={{ color: c.ok ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                                  {c.label}: {c.ok ? 'PASS' : 'FAIL'}
                                </span>
                              ))}
                            </div>
                          )}
                          {isTampered && tamperDetails[receipt.id] && (
                            <div style={{ marginTop: '0.4rem', padding: '0.3rem 0.5rem', background: '#fef2f2', borderRadius: '4px', color: 'var(--red)' }}>
                              {tamperDetails[receipt.id].detail}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : running ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: '0.5rem' }}>Agents are working...</div>
                <div style={{ ...mono, fontSize: '0.65rem' }}>
                  {statusLog[statusLog.length - 1] || 'Initializing pipeline'}
                </div>
              </div>
            </div>
          ) : null}

          {/* Training Data Panel */}
          {trainingData && (
            <div style={{
              marginTop: '1.5rem', padding: '1rem 1.2rem',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>Training Data Export</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                    {trainingData.stats.total} examples in chat-messages format
                  </div>
                </div>
                <button onClick={downloadJsonl} style={{
                  padding: '0.35rem 0.7rem', borderRadius: '5px', border: '1px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--text)', fontSize: '0.72rem',
                  cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                }}>
                  Download JSONL
                </button>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.8rem', ...mono, fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                {Object.entries(trainingData.stats.byType).map(([type, count]) => (
                  <span key={type}>{type}: {count as number}</span>
                ))}
              </div>
              <div style={{ ...mono, fontSize: '0.58rem', color: 'var(--text-dim)' }}>
                Compatible: {trainingData.stats.compatibleWith?.join(', ')}
              </div>
              <div style={{
                marginTop: '0.6rem', padding: '0.6rem', background: 'var(--bg)', borderRadius: '4px',
                ...mono, fontSize: '0.55rem', color: 'var(--text-muted)',
                maxHeight: '120px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {trainingData.jsonl.split('\n').slice(0, 3).join('\n')}
                {trainingData.jsonl.split('\n').length > 3 && '\n...'}
              </div>
            </div>
          )}

          {/* Verification Summary */}
          {verifications.length > 0 && selectedAgent === 'A' && (
            <div style={{
              marginTop: '1.5rem', padding: '1rem 1.2rem',
              background: verifications.every(v => v.valid) ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${verifications.every(v => v.valid) ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: '8px',
            }}>
              <div style={{
                fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.4rem',
                color: verifications.every(v => v.valid) ? 'var(--green)' : 'var(--red)',
              }}>
                Chain Verification: {verifications.every(v => v.valid) ? `${verifications.length}/${verifications.length} PASSED` : 'FAILED'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {verifications.every(v => v.valid)
                  ? 'Every receipt in Agent A\'s chain has been independently verified. Signatures match, hash links are intact, timestamps are monotonic.'
                  : 'One or more receipts failed verification. The chain has been tampered with.'}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                {verifications.map((v, i) => (
                  <span key={i} style={{
                    ...mono, fontSize: '0.58rem', padding: '0.15rem 0.35rem', borderRadius: '3px',
                    background: v.valid ? '#dcfce7' : '#fee2e2',
                    color: v.valid ? 'var(--green)' : 'var(--red)',
                  }}>
                    #{i} {v.valid ? 'PASS' : 'FAIL'}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{
        padding: '0.3rem 1.5rem', borderTop: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-dim)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: '0.8rem' }}>
          {['0G Compute', '0G Storage', '0G Chain', '0G Fine-Tuning', 'ERC-7857', 'Gensyn AXL', 'KeeperHub'].map(tag => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <span style={mono}>ed25519 + SHA-256</span>
      </div>
    </div>
  );
}
