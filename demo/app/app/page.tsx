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
  teeMetadata?: { provider?: string; providerAddress?: string; teeType?: string; chatId?: string; teeSigEndpoint?: string };
  teeError?: string;
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

interface ProviderHealth {
  address: string;
  model: string;
  endpoint: string;
  status: 'ok' | 'error' | 'checking';
  latencyMs: number;
  error?: string;
}

interface McpToolCall {
  caller: string;
  target: string;
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  transport: string;
  protocol: string;
}

interface PeerInfo {
  name: string;
  pubkey: string;
  role: string;
  status: string;
}

const mono = { fontFamily: "'IBM Plex Mono', 'Courier New', monospace" } as const;

const ACTION_LABELS: Record<string, string> = {
  file_read: 'File Read',
  api_call: 'API Call',
  llm_call: 'LLM Inference',
  decision: 'Decision',
  output: 'Output',
};

const STORAGE_KEY = 'receipt-dashboard-state';

interface PersistedState {
  receipts: Receipt[];
  receiptMeta: Record<string, ReceiptMeta>;
  verifications: VerificationResult[];
  agentACount: number;
  chainRootHash: string | null;
  trustScore: number | null;
  anchor0g: { txHash: string; chain: string } | null;
  storage: { rootHash?: string; uploaded?: boolean } | null;
  agenticId: any;
  axlHandoff: any;
  axlReceived: any;
  mcpToolCalls: McpToolCall[];
  peers: PeerInfo[];
  teeVerified: any;
  agentCard: any;
  axlRebroadcast: any;
  axlAdopt: any;
  fineTuning: any;
  trainingData: any;
  fabricationDetected: boolean;
  tamperedIds: string[];
  tamperDetails: Record<string, { index: number; field: string; detail: string }>;
  timestamp: number;
}

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
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const [selectedAgent, setSelectedAgent] = useState<'A' | 'B'>('A');
  const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null);

  const [anchor0g, setAnchor0g] = useState<{ txHash: string; chain: string; contractAddress?: string; chainRootHash?: string; storageRef?: string; explorerUrl?: string } | null>(null);
  const [storage, setStorage] = useState<{ rootHash?: string; uploaded?: boolean; dataSize?: number; indexerUrl?: string; uploadTxHash?: string } | null>(null);
  const [anchoring, setAnchoring] = useState(false);
  const [trainingData, setTrainingData] = useState<{ jsonl: string; stats: any } | null>(null);
  const [loadingTraining, setLoadingTraining] = useState(false);
  const [agenticId, setAgenticId] = useState<any>(null);
  const [axlHandoff, setAxlHandoff] = useState<any>(null);
  const [axlReceived, setAxlReceived] = useState<any>(null);
  const [mcpToolCalls, setMcpToolCalls] = useState<McpToolCall[]>([]);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [teeVerified, setTeeVerified] = useState<any>(null);
  const [agentCard, setAgentCard] = useState<any>(null);
  const [axlRebroadcast, setAxlRebroadcast] = useState<any>(null);
  const [axlAdopt, setAxlAdopt] = useState<any>(null);
  const [fineTuning, setFineTuning] = useState<any>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [buttonDots, setButtonDots] = useState('');
  const [mountedReceiptIds, setMountedReceiptIds] = useState<Set<string>>(new Set());
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [isCachedData, setIsCachedData] = useState(false);

  const timelineRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Animated dots for running button
  useEffect(() => {
    if (!running) { setButtonDots(''); return; }
    const interval = setInterval(() => {
      setButtonDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);
    return () => clearInterval(interval);
  }, [running]);

  // Track mounted receipt IDs for fade-in animation
  useEffect(() => {
    if (receipts.length === 0) { setMountedReceiptIds(new Set()); return; }
    const lastReceipt = receipts[receipts.length - 1];
    if (!mountedReceiptIds.has(lastReceipt.id)) {
      const timer = setTimeout(() => {
        setMountedReceiptIds(prev => {
          const next = new Set(prev);
          receipts.forEach(r => next.add(r.id));
          return next;
        });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [receipts]);

  useEffect(() => {
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: 'smooth' });
  }, [receipts]);

  // Load full persisted state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const s: PersistedState = JSON.parse(saved);
        if (s.receipts?.length > 0) {
          setReceipts(s.receipts);
          setReceiptMeta(s.receiptMeta || {});
          setVerifications(s.verifications || []);
          setAgentACount(s.agentACount || 0);
          setChainRootHash(s.chainRootHash || null);
          setTrustScore(s.trustScore ?? null);
          setAnchor0g(s.anchor0g || null);
          setStorage(s.storage || null);
          setAgenticId(s.agenticId || null);
          setAxlHandoff(s.axlHandoff || null);
          setAxlReceived(s.axlReceived || null);
          setMcpToolCalls(s.mcpToolCalls || []);
          setPeers(s.peers || []);
          setTeeVerified(s.teeVerified || null);
          setAgentCard(s.agentCard || null);
          setAxlRebroadcast(s.axlRebroadcast || null);
          setAxlAdopt(s.axlAdopt || null);
          setFineTuning(s.fineTuning || null);
          setTrainingData(s.trainingData || null);
          setFabricationDetected(s.fabricationDetected || false);
          if (s.tamperedIds?.length) setTamperedIds(new Set(s.tamperedIds));
          if (s.tamperDetails) setTamperDetails(s.tamperDetails);
          setIsCachedData(true);
          setMountedReceiptIds(new Set(s.receipts.map(r => r.id)));
        }
      }
    } catch {}
  }, []);

  // Persist full state to localStorage
  useEffect(() => {
    if (receipts.length > 0 && !running) {
      try {
        const state: PersistedState = {
          receipts, receiptMeta, verifications, agentACount, chainRootHash,
          trustScore, anchor0g, storage, agenticId, axlHandoff,
          axlReceived, mcpToolCalls, peers, teeVerified, agentCard,
          axlRebroadcast, axlAdopt, fineTuning, trainingData, fabricationDetected,
          tamperedIds: [...tamperedIds], tamperDetails, timestamp: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {}
    }
  }, [receipts, receiptMeta, verifications, agentACount, chainRootHash,
    trustScore, anchor0g, storage, agenticId, axlHandoff,
    axlReceived, mcpToolCalls, peers, teeVerified, agentCard,
    axlRebroadcast, axlAdopt, fineTuning, trainingData, fabricationDetected,
    tamperedIds, tamperDetails, running]);

  // Fetch provider health on mount
  useEffect(() => {
    setProvidersLoading(true);
    fetch('/api/providers')
      .then(r => r.json())
      .then(data => {
        if (data.health) setProviders(data.health);
        else if (data.inference?.services) {
          setProviders(data.inference.services.map((s: any) => ({
            address: s.provider, model: s.model, endpoint: s.url,
            status: 'ok' as const, latencyMs: 0,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setProvidersLoading(false));
  }, []);

  const agentAReceipts = receipts.slice(0, agentACount || receipts.length);
  const agentBReceipts = agentACount > 0 ? receipts.slice(agentACount) : [];
  const selectedReceipts = selectedAgent === 'A' ? agentAReceipts : agentBReceipts;
  const hasData = receipts.length > 0;

  const PIPELINE_STEPS = [
    { label: 'Agent A: Generating Receipts', key: 'agent_a' },
    { label: 'AXL P2P Handoff', key: 'axl_handoff' },
    { label: 'Chain Verification', key: 'verification' },
    { label: 'Agent B: Processing', key: 'agent_b' },
    { label: 'ERC-7857 Identity Mint', key: 'agentic_id' },
    { label: '0G Storage + Anchor', key: 'storage' },
  ];

  const getCurrentPipelineStep = (): number => {
    if (storage || anchor0g) return 6;
    if (agenticId) return 5;
    if (agentBReceipts.length > 0) return 4;
    if (verifications.length > 0) return 3;
    if (axlHandoff) return 2;
    if (receipts.length > 0) return 1;
    return 0;
  };

  const pipelineStep = running ? getCurrentPipelineStep() : 0;

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

  // Find the LLM receipt to get TEE info for prominent display
  const llmReceipt = receipts.find(r => r.action.type === 'llm_call');
  const llmMeta = llmReceipt ? receiptMeta[llmReceipt.id] : null;

  const run = useCallback(async () => {
    setRunning(true);
    setIsCachedData(false);
    setReceipts([]);
    setReceiptMeta({});
    setVerifications([]);
    setAgentACount(0);
    setFabricationDetected(false);
    setTamperedIds(new Set());
    setTamperDetails({});
    setChainRootHash(null);
    setExpandedReceipt(null);
    setAnchor0g(null);
    setStorage(null);
    setStatusLog([]);
    setTrustScore(null);
    setTrainingData(null);
    setAgenticId(null);
    setAxlHandoff(null);
    setAxlReceived(null);
    setMcpToolCalls([]);
    setPeers([]);
    setTeeVerified(null);
    setAgentCard(null);
    setAxlRebroadcast(null);
    setAxlAdopt(null);
    setFineTuning(null);
    setPipelineError(null);
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
            teeMetadata: data.teeMetadata,
            teeError: data.teeError,
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
case 'axl_handoff':
        setAxlHandoff(data);
        break;
      case 'axl_received':
        setAxlReceived(data);
        break;
      case 'mcp_tool_call':
        setMcpToolCalls(prev => [...prev, data]);
        break;
      case 'peer_discovery':
        setPeers(data.peers || []);
        break;
      case 'tee_verified':
        setTeeVerified(data);
        break;
      case 'agent_card':
        setAgentCard(data);
        break;
      case 'axl_rebroadcast':
        setAxlRebroadcast(data);
        break;
      case 'axl_adopt':
        setAxlAdopt(data);
        break;
      case 'fine_tuning':
        setFineTuning(data);
        break;
      case 'error':
        setPipelineError(data.message);
        break;
      case 'storage':
        if (data.rootHash) setStorage({ rootHash: data.rootHash, uploaded: data.uploaded, dataSize: data.dataSize, indexerUrl: data.indexerUrl, uploadTxHash: data.uploadTxHash });
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
      try {
        const ogRes = await fetch('/api/anchor-0g', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rootHash: chainRootHash, storageRef }) }).then(r => r.json());
        if (ogRes.txHash) setAnchor0g(ogRes);
      } catch {}
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
      setAnchor0g(null);
      setStorage(null);
      setTrustScore(null);
      setTrainingData(null);
      setAgenticId(null);
      setSelectedAgent('A');
      setShowImport(false);
      setImportText('');
      setImportError('');
      setIsCachedData(false);
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

  // Cached state timestamp
  const cachedTimestamp = isCachedData ? (() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return s.timestamp ? new Date(s.timestamp) : null;
    } catch { return null; }
  })() : null;

  // --- EMPTY STATE (no cached data) ---
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
          <div style={{ textAlign: 'center', maxWidth: '520px' }}>
            <div style={{ ...mono, fontSize: '2.5rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: '0.8rem' }}>
              R.E.C.E.I.P.T.
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              Cryptographic proof layer for AI agent work. Every action produces a signed, hash-linked receipt. Tamper-proof handoffs between agents.
            </p>

            {/* 0G Pillar Status — visible even without running */}
            <div style={{
              display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap',
              marginBottom: '1.5rem',
            }}>
              {['Compute', 'Storage', 'Chain', 'Fine-Tune', 'ERC-7857'].map(p => (
                <div key={p} style={{
                  ...mono, fontSize: '0.6rem', padding: '0.25rem 0.5rem', borderRadius: '4px',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--text-dim)',
                }}>
                  0G {p}
                </div>
              ))}
            </div>

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

          {/* Provider Health */}
          {providers.length > 0 && (
            <div style={{
              marginTop: '1rem', padding: '0.8rem 1rem', borderRadius: '8px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              maxWidth: '520px', width: '100%',
            }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.5rem' }}>
                0G Compute Providers
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {providers.slice(0, 4).map(p => (
                  <div key={p.address} style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.25rem 0.4rem', borderRadius: '4px', background: 'var(--bg)',
                    ...mono, fontSize: '0.55rem',
                  }}>
                    <div style={{
                      width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                      background: p.status === 'ok' ? 'var(--green)' : p.status === 'checking' ? 'var(--amber)' : 'var(--red)',
                    }} />
                    <span style={{ color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.model || p.address.slice(0, 10) + '...'}
                    </span>
                    {p.latencyMs > 0 && (
                      <span style={{ color: 'var(--text-dim)' }}>{p.latencyMs}ms</span>
                    )}
                    <span style={{
                      fontSize: '0.5rem', fontWeight: 600,
                      color: p.status === 'ok' ? 'var(--green)' : 'var(--red)',
                    }}>
                      {p.status === 'ok' ? 'LIVE' : p.status === 'checking' ? '...' : 'DOWN'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AXL Topology Preview */}
          <div style={{
            marginTop: '1rem', padding: '0.8rem 1.2rem', borderRadius: '8px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            maxWidth: '520px', width: '100%',
          }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.5rem' }}>
              Agent Network Topology
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', padding: '0.5rem 0' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: 'var(--agent-a)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: '0.6rem', fontWeight: 700, margin: '0 auto 0.2rem',
                }}>A</div>
                <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)' }}>researcher</div>
              </div>
              <div style={{ flex: 1, maxWidth: '120px', position: 'relative', height: '2px' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'var(--border)', borderRadius: '1px' }} />
                <div style={{
                  position: 'absolute', top: '6px', left: '50%', transform: 'translateX(-50%)',
                  ...mono, fontSize: '0.42rem', color: 'var(--text-dim)', whiteSpace: 'nowrap',
                }}>
                  AXL A2A Protocol
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-dim)', fontSize: '0.6rem', fontWeight: 700, margin: '0 auto 0.2rem',
                }}>B</div>
                <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)' }}>builder</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', ...mono, fontSize: '0.65rem', color: 'var(--text-dim)' }}>
            <span>ed25519 signatures</span>
            <span>SHA-256 hash chains</span>
            <span>TEE attestation</span>
            <span>on-chain anchoring</span>
          </div>
        </div>

        {showImport && renderImportModal()}
      </div>
    );
  }

  function renderImportModal() {
    return (
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
    );
  }

  // --- DASHBOARD ---
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .dashboard-grid { grid-template-columns: 1fr !important; }
          .sidebar { border-right: none !important; border-bottom: 1px solid var(--border); max-height: 40vh; }
          .header-controls { flex-wrap: wrap; gap: 0.3rem !important; }
          .bottom-tags { flex-wrap: wrap; gap: 0.4rem !important; }
        }
      `}</style>

      {/* Header */}
      <header style={{
        padding: '0.7rem 1.5rem', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, flexWrap: 'wrap', gap: '0.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>R.E.C.E.I.P.T.</h1>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Operator Dashboard</p>
          </div>
          {running && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', animation: 'pulse 1.2s ease-in-out infinite' }} />
              <span style={{ fontSize: '0.7rem', color: 'var(--green)', fontWeight: 500 }}>Pipeline running</span>
            </div>
          )}
          {isCachedData && !running && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', ...mono, fontSize: '0.58rem', color: 'var(--text-dim)' }}>
              Last run{cachedTimestamp ? `: ${cachedTimestamp.toLocaleString()}` : ''}
            </div>
          )}
        </div>

        {/* Prominent TEE attestation banner */}
        {(teeVerified || llmMeta) && !running && (
          <div style={{
            padding: '0.4rem 0.9rem', borderRadius: '8px',
            background: (teeVerified || llmMeta?.teeAttested) ? 'rgba(22, 163, 74, 0.1)' : 'rgba(217, 119, 6, 0.08)',
            border: `2px solid ${(teeVerified || llmMeta?.teeAttested) ? 'rgba(22, 163, 74, 0.4)' : 'rgba(217, 119, 6, 0.25)'}`,
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <div style={{
              width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
              background: (teeVerified || llmMeta?.teeAttested) ? 'var(--green)' : 'var(--amber)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '0.6rem', fontWeight: 700,
            }}>
              {(teeVerified || llmMeta?.teeAttested) ? '✓' : '!'}
            </div>
            <div>
              <div style={{ ...mono, fontSize: '0.65rem', fontWeight: 700, color: (teeVerified || llmMeta?.teeAttested) ? 'var(--green)' : 'var(--amber)' }}>
                TEE {(teeVerified || llmMeta?.teeAttested) ? 'VERIFIED' : 'UNVERIFIED'}
                {teeVerified?.teeType && <span style={{ fontWeight: 400, marginLeft: '0.3rem' }}>({teeVerified.teeType})</span>}
              </div>
              {teeVerified?.signatureEndpoint && (
                <a href={teeVerified.signatureEndpoint} target="_blank" rel="noopener noreferrer"
                  style={{ ...mono, fontSize: '0.48rem', color: (teeVerified ? 'var(--green)' : 'var(--amber)'), textDecoration: 'none', opacity: 0.8 }}
                  onClick={e => e.stopPropagation()}
                  onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                >{teeVerified.signatureEndpoint}</a>
              )}
            </div>
          </div>
        )}

        <div className="header-controls" style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
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
            minWidth: '100px',
          }}>
            {running ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
                <span style={{
                  display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                  border: '1.5px solid transparent', borderTop: '1.5px solid #fff',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <span style={{ minWidth: '65px', textAlign: 'left' }}>Running{buttonDots}</span>
              </span>
            ) : 'Run Pipeline'}
          </button>
        </div>
      </header>

      {showImport && renderImportModal()}

      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div className="sidebar" style={{
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
            {pipelineError && (
              <div style={{
                marginTop: '0.5rem', padding: '0.4rem 0.5rem', borderRadius: '4px',
                background: '#fef2f2', border: '1px solid #fecaca',
                fontSize: '0.65rem', color: 'var(--red)',
              }}>
                <div style={{ fontWeight: 600, marginBottom: '0.15rem' }}>Pipeline Error</div>
                <div style={{ ...mono, fontSize: '0.58rem', wordBreak: 'break-all' }}>{pipelineError}</div>
              </div>
            )}
          </div>

          {/* 0G Integration Pillars — always visible */}
          <div style={{ padding: '0.8rem 1.2rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.5rem' }}>
              0G Integration
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
              {[
                { label: 'Compute', active: receipts.some(r => receiptMeta[r.id]?.llmSource === '0g-compute') },
                { label: 'Storage', active: !!storage?.rootHash },
                { label: 'Chain', active: !!anchor0g?.txHash },
                { label: 'Fine-Tune', active: !!fineTuning?.task?.taskId || !!fineTuning?.dataset || !!trainingData },
                { label: 'ERC-7857', active: agenticId?.status === 'minted' },
              ].map(p => (
                <div key={p.label} style={{
                  ...mono, fontSize: '0.55rem', padding: '0.2rem 0.4rem', borderRadius: '3px',
                  background: p.active ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg)',
                  color: p.active ? 'var(--green)' : 'var(--text-dim)',
                  border: `1px solid ${p.active ? 'rgba(34, 197, 94, 0.3)' : 'var(--border)'}`,
                  fontWeight: p.active ? 600 : 400,
                }}>
                  {p.active ? '✓ ' : ''}{p.label}
                </div>
              ))}
            </div>
          </div>

          {/* 0G Compute Providers */}
          {providers.length > 0 && (
            <div style={{ padding: '0.8rem 1.2rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.5rem' }}>
                0G Compute Providers
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                {providers.slice(0, 4).map((p, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    ...mono, fontSize: '0.52rem', color: 'var(--text-muted)',
                  }}>
                    <div style={{
                      width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0,
                      background: p.status === 'ok' ? 'var(--green)' : p.status === 'checking' ? 'var(--amber)' : 'var(--red)',
                    }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.model || p.address.slice(0, 12) + '...'}
                    </span>
                    {p.latencyMs > 0 && <span style={{ color: 'var(--text-dim)' }}>{p.latencyMs}ms</span>}
                  </div>
                ))}
              </div>
              {providersLoading && <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>Checking...</div>}
            </div>
          )}

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

          {/* Training Data Card — prominent */}
          {hasData && !running && (
            <div style={{ padding: '0.8rem 1.2rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.5rem' }}>
                Fine-Tuning Data
              </div>
              {trainingData ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                    <span style={{ ...mono, fontSize: '0.6rem', color: 'var(--green)', fontWeight: 600 }}>
                      {trainingData.stats.total} examples ready
                    </span>
                    <button onClick={downloadJsonl} style={{
                      padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border)',
                      background: 'var(--bg)', color: 'var(--text)', fontSize: '0.55rem',
                      cursor: 'pointer', ...mono,
                    }}>
                      Download JSONL
                    </button>
                  </div>
                  <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)' }}>
                    {trainingData.stats.compatibleWith?.join(', ')}
                  </div>
                </div>
              ) : (
                <button onClick={exportTraining} disabled={loadingTraining} style={{
                  padding: '0.35rem 0.6rem', borderRadius: '5px', border: '1px solid var(--border)',
                  background: 'var(--surface)', color: loadingTraining ? 'var(--text-dim)' : 'var(--text)',
                  fontSize: '0.65rem', cursor: loadingTraining ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', fontWeight: 500, width: '100%',
                }}>
                  {loadingTraining ? 'Generating...' : 'Export Training Data'}
                </button>
              )}
            </div>
          )}

          {/* Fine-Tuning Status */}
          {fineTuning && fineTuning.status !== 'skipped' && (
            <div style={{ padding: '0.8rem 1.2rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.5rem' }}>
                0G Fine-Tuning
              </div>
              {fineTuning.provider && (
                <div style={{
                  padding: '0.25rem 0.4rem', borderRadius: '3px', marginBottom: '0.3rem',
                  background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.15)',
                }}>
                  <div style={{ ...mono, fontSize: '0.42rem', color: 'var(--green)', fontWeight: 600 }}>Provider Found</div>
                  <div style={{ ...mono, fontSize: '0.4rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                    {fineTuning.provider.model || fineTuning.provider.address}
                  </div>
                </div>
              )}
              {fineTuning.dataset && (
                <div style={{
                  padding: '0.25rem 0.4rem', borderRadius: '3px', marginBottom: '0.3rem',
                  background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.15)',
                }}>
                  <div style={{ ...mono, fontSize: '0.42rem', color: 'var(--green)', fontWeight: 600 }}>Dataset Generated</div>
                  <div style={{ ...mono, fontSize: '0.4rem', color: 'var(--text-muted)' }}>
                    {fineTuning.dataset.examples} examples, {((fineTuning.dataset.sizeBytes || 0) / 1024).toFixed(1)} KB
                  </div>
                </div>
              )}
              {fineTuning.upload && (
                <div style={{
                  padding: '0.25rem 0.4rem', borderRadius: '3px', marginBottom: '0.3rem',
                  background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.15)',
                }}>
                  <div style={{ ...mono, fontSize: '0.42rem', color: 'var(--green)', fontWeight: 600 }}>Uploaded to TEE</div>
                  <div style={{ ...mono, fontSize: '0.4rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                    hash: {fineTuning.upload.datasetHash}
                  </div>
                </div>
              )}
              {fineTuning.task && (
                <div style={{
                  padding: '0.25rem 0.4rem', borderRadius: '3px', marginBottom: '0.3rem',
                  background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.15)',
                }}>
                  <div style={{ ...mono, fontSize: '0.42rem', color: 'var(--green)', fontWeight: 600 }}>
                    Task: {fineTuning.task.status}
                  </div>
                  <div style={{ ...mono, fontSize: '0.4rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                    ID: {fineTuning.task.taskId}
                  </div>
                  <div style={{ ...mono, fontSize: '0.4rem', color: 'var(--text-dim)' }}>
                    Model: {fineTuning.task.model}
                  </div>
                </div>
              )}
              {fineTuning.status === 'no-providers' && (
                <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--amber)' }}>
                  No fine-tuning providers available on network
                </div>
              )}
              {(fineTuning.uploadError || fineTuning.taskError) && (
                <div style={{ ...mono, fontSize: '0.42rem', color: 'var(--amber)', wordBreak: 'break-all' }}>
                  {fineTuning.uploadError || fineTuning.taskError}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {hasData && !running && (
            <div style={{ padding: '0.8rem 1.2rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.5rem' }}>
                Actions
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {!fabricationDetected && chainRootHash && (
                  <button onClick={storeAndAnchor} disabled={anchoring} style={{
                    padding: '0.35rem 0.6rem', borderRadius: '5px', border: '1px solid var(--border)',
                    background: 'var(--surface)', color: anchoring ? 'var(--text-dim)' : 'var(--text)',
                    fontSize: '0.65rem', cursor: anchoring ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', fontWeight: 500, textAlign: 'left', width: '100%',
                  }}>
                    {anchoring ? 'Anchoring...' : 'Anchor On-Chain'}
                  </button>
                )}
                <button onClick={() => {
                  const blob = new Blob([JSON.stringify(receipts, null, 2)], { type: 'application/json' });
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'receipt-chain.json'; a.click();
                }} style={{
                  padding: '0.35rem 0.6rem', borderRadius: '5px', border: '1px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--text)',
                  fontSize: '0.65rem', cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 500, textAlign: 'left', width: '100%',
                }}>
                  Download Chain JSON
                </button>
              </div>
            </div>
          )}

          {/* On-Chain Anchors */}
          {(anchor0g || storage) && (
            <div style={{ padding: '0.8rem 1.2rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.5rem' }}>
                On-Chain Anchors
              </div>
              {storage?.rootHash && (
                <div style={{
                  marginBottom: '0.4rem', padding: '0.3rem 0.4rem', borderRadius: '4px',
                  background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.15)',
                }}>
                  <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.15rem' }}>0G Storage</div>
                  <div style={{ ...mono, fontSize: '0.48rem', color: 'var(--green)', wordBreak: 'break-all' }}>
                    root: {storage.rootHash}
                  </div>
                  {storage.dataSize && (
                    <div style={{ ...mono, fontSize: '0.42rem', color: 'var(--text-dim)', marginTop: '0.1rem' }}>
                      {(storage.dataSize / 1024).toFixed(1)} KB uploaded
                    </div>
                  )}
                  {storage.uploadTxHash && (
                    <div style={{ ...mono, fontSize: '0.42rem', color: 'var(--text-dim)', marginTop: '0.05rem', wordBreak: 'break-all' }}>
                      tx: {storage.uploadTxHash}
                    </div>
                  )}
                  {storage.indexerUrl && (
                    <a href={storage.indexerUrl} target="_blank" rel="noopener noreferrer"
                      style={{ ...mono, fontSize: '0.4rem', color: 'var(--text-dim)', textDecoration: 'none', display: 'block', marginTop: '0.05rem' }}
                      onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                    >indexer: {storage.indexerUrl}</a>
                  )}
                </div>
              )}
              {anchor0g?.txHash && (
                <div style={{
                  padding: '0.3rem 0.4rem', borderRadius: '4px',
                  background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.15)',
                }}>
                  <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.15rem' }}>0G Mainnet (Chain 16661)</div>
                  <a
                    href={anchor0g.explorerUrl || `https://chainscan-newton.0g.ai/tx/${anchor0g.txHash}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ ...mono, fontSize: '0.48rem', color: 'var(--green)', wordBreak: 'break-all', textDecoration: 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                  >{anchor0g.txHash}</a>
                  {anchor0g.contractAddress && (
                    <div style={{ ...mono, fontSize: '0.42rem', color: 'var(--text-dim)', marginTop: '0.1rem', wordBreak: 'break-all' }}>
                      contract: {anchor0g.contractAddress}
                    </div>
                  )}
                  {anchor0g.chainRootHash && (
                    <div style={{ ...mono, fontSize: '0.42rem', color: 'var(--text-dim)', marginTop: '0.05rem', wordBreak: 'break-all' }}>
                      chainRoot: {anchor0g.chainRootHash}
                    </div>
                  )}
                  {anchor0g.storageRef && (
                    <div style={{ ...mono, fontSize: '0.42rem', color: 'var(--text-dim)', marginTop: '0.05rem', wordBreak: 'break-all' }}>
                      storageRef: {anchor0g.storageRef}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Gensyn AXL Network */}
          {(axlHandoff || axlReceived || peers.length > 0) && (
            <div style={{ padding: '0.8rem 1.2rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                  Gensyn AXL Network
                </div>
                <span style={{
                  ...mono, fontSize: '0.4rem', padding: '0.1rem 0.3rem', borderRadius: '3px', fontWeight: 600,
                  background: axlHandoff?.mode === 'live' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(217, 119, 6, 0.1)',
                  color: axlHandoff?.mode === 'live' ? 'var(--green)' : 'var(--amber)',
                  border: `1px solid ${axlHandoff?.mode === 'live' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(217, 119, 6, 0.3)'}`,
                }}>
                  {axlHandoff?.mode === 'live' ? 'LIVE' : 'SIMULATED'}
                </span>
              </div>

              {/* Topology */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.5rem', padding: '0.4rem 0' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: 'var(--agent-a)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '0.55rem', fontWeight: 700, margin: '0 auto 0.15rem',
                    boxShadow: axlHandoff ? '0 0 6px var(--agent-a)' : 'none',
                  }}>A</div>
                  <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--text-dim)' }}>researcher</div>
                </div>
                <div style={{ flex: 1, position: 'relative', height: '2px', margin: '0 0.2rem' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'var(--border)' }} />
                  {axlHandoff && (
                    <div style={{
                      position: 'absolute', top: '-3px',
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: axlReceived?.verified ? 'var(--green)' : 'var(--amber)',
                      left: axlReceived ? '100%' : '0%',
                      transform: 'translateX(-50%)',
                      transition: 'left 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      animation: !axlReceived ? 'axl-packet-pulse 1.5s ease-in-out infinite' : 'none',
                    }} />
                  )}
                  <div style={{
                    position: 'absolute', top: '5px', left: '50%', transform: 'translateX(-50%)',
                    ...mono, fontSize: '0.4rem', color: 'var(--text-dim)', whiteSpace: 'nowrap',
                  }}>
                    {axlHandoff?.broadcastMode === 'all-peers' ? 'A2A Broadcast' : 'A2A Protocol'}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: axlReceived ? 'var(--agent-b)' : 'var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '0.55rem', fontWeight: 700, margin: '0 auto 0.15rem',
                    boxShadow: axlReceived?.verified ? '0 0 6px var(--agent-b)' : 'none',
                  }}>B</div>
                  <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--text-dim)' }}>builder</div>
                </div>
              </div>

              {/* Broadcast indicator */}
              {axlHandoff?.broadcastMode === 'all-peers' && (
                <div style={{
                  ...mono, fontSize: '0.48rem', color: 'var(--amber)', fontWeight: 600,
                  textAlign: 'center', marginBottom: '0.3rem',
                  padding: '0.15rem 0.3rem', background: 'rgba(217,119,6,0.08)', borderRadius: '3px',
                }}>
                  BROADCAST to all peers
                </div>
              )}

              {/* Transport details */}
              <div style={{
                background: 'rgba(0,0,0,0.04)', borderRadius: '4px', padding: '0.3rem 0.4rem',
                marginBottom: '0.4rem', border: '1px solid var(--border)', ...mono, fontSize: '0.45rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-dim)' }}>
                  <span>Transport</span>
                  <span style={{ color: 'var(--text-muted)' }}>Gensyn AXL</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-dim)' }}>
                  <span>Method</span>
                  <span style={{ color: 'var(--text-muted)' }}>POST /send → GET /recv</span>
                </div>
                {axlHandoff?.receiptCount && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-dim)' }}>
                    <span>Receipts</span>
                    <span style={{ color: 'var(--text-muted)' }}>{axlHandoff.receiptCount}</span>
                  </div>
                )}
              </div>

              {/* Agent Card Discovery */}
              {agentCard && (
                <div style={{
                  padding: '0.3rem 0.4rem', borderRadius: '4px',
                  background: 'rgba(37, 99, 235, 0.06)', border: '1px solid rgba(37, 99, 235, 0.2)',
                  marginBottom: '0.4rem',
                }}>
                  <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--agent-a)', fontWeight: 600, marginBottom: '0.15rem' }}>
                    A2A Agent Card
                  </div>
                  <div style={{ ...mono, fontSize: '0.42rem', color: 'var(--text-muted)' }}>{agentCard.card?.name}</div>
                  <div style={{ ...mono, fontSize: '0.4rem', color: 'var(--text-dim)', marginTop: '0.1rem' }}>
                    {agentCard.card?.capabilities?.join(', ')}
                  </div>
                  <div style={{ ...mono, fontSize: '0.4rem', color: 'var(--text-dim)' }}>
                    Protocols: {agentCard.card?.supportedProtocols?.join(', ')}
                  </div>
                </div>
              )}

              {/* MCP Tool Calls */}
              {mcpToolCalls.length > 0 && (
                <div style={{ marginBottom: '0.4rem' }}>
                  <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                    MCP Tool Calls via AXL
                  </div>
                  {mcpToolCalls.map((call, i) => (
                    <div key={i} style={{
                      padding: '0.25rem 0.35rem', borderRadius: '3px',
                      background: 'rgba(124, 58, 237, 0.06)', border: '1px solid rgba(124, 58, 237, 0.15)',
                      marginBottom: '0.15rem',
                    }}>
                      <div style={{ ...mono, fontSize: '0.42rem', color: 'var(--agent-b)', fontWeight: 600 }}>
                        {call.caller.split('.')[0]} → .{call.tool}()
                      </div>
                      <div style={{ ...mono, fontSize: '0.38rem', color: 'var(--text-dim)' }}>
                        {call.tool === 'verify_chain' ? `Result: ${(call.output as any)?.valid ? 'verified' : 'failed'}` :
                         call.tool === 'get_capabilities' ? `${((call.output as any)?.capabilities || []).length} capabilities` :
                         call.tool === 'get_chain_stats' ? `${(call.output as any)?.receiptCount} receipts, TEE: ${(call.output as any)?.teeAttested}` :
                         JSON.stringify(call.output).slice(0, 50)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Peer Discovery */}
              {peers.length > 0 && (
                <div style={{ marginBottom: '0.4rem' }}>
                  <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                    Discovered Peers
                  </div>
                  {peers.map((peer, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                      ...mono, fontSize: '0.45rem', marginBottom: '0.1rem',
                    }}>
                      <div style={{
                        width: '5px', height: '5px', borderRadius: '50%',
                        background: peer.status === 'online' ? 'var(--green)' : 'var(--text-dim)',
                      }} />
                      <span style={{ color: 'var(--text-muted)' }}>{peer.name}</span>
                      <span style={{ color: 'var(--text-dim)', marginLeft: 'auto' }}>{peer.pubkey}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Verification checklist */}
              {axlReceived?.verified && (
                <div style={{
                  padding: '0.3rem 0.4rem', borderRadius: '4px',
                  background: 'rgba(0,0,0,0.04)', border: '1px solid var(--border)',
                }}>
                  <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                    Verification
                  </div>
                  {['Chain root hash match', 'ed25519 signatures', 'Timestamps monotonic', 'Chain links valid'].map(step => (
                    <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', ...mono, fontSize: '0.45rem' }}>
                      <span style={{ color: 'var(--green)' }}>✓</span>
                      <span style={{ color: 'var(--green)' }}>{step}</span>
                    </div>
                  ))}
                </div>
              )}
              {axlReceived && !axlReceived.verified && (
                <div style={{
                  padding: '0.3rem 0.4rem', borderRadius: '4px',
                  background: 'rgba(0,0,0,0.04)', border: '1px solid var(--red)',
                }}>
                  <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                    Verification
                  </div>
                  {([
                    { step: 'Chain root hash match', pass: false },
                    { step: 'ed25519 signatures', pass: false },
                    { step: 'Timestamps monotonic', pass: true },
                    { step: 'Chain links valid', pass: false },
                  ] as const).map(({ step, pass }) => (
                    <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', ...mono, fontSize: '0.45rem' }}>
                      <span style={{ color: pass ? 'var(--green)' : 'var(--red)' }}>{pass ? '✓' : '✗'}</span>
                      <span style={{ color: pass ? 'var(--green)' : 'var(--red)' }}>{step}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Broadcast + Adopt */}
              {axlRebroadcast && (
                <div style={{
                  padding: '0.3rem 0.4rem', borderRadius: '4px',
                  background: 'rgba(217, 119, 6, 0.06)', border: '1px solid rgba(217, 119, 6, 0.2)',
                  marginBottom: '0.4rem',
                }}>
                  <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--amber)', fontWeight: 600, marginBottom: '0.1rem' }}>
                    REBROADCAST
                  </div>
                  <div style={{ ...mono, fontSize: '0.42rem', color: 'var(--text-muted)' }}>
                    Agent B extended chain ({axlRebroadcast.receiptCount || axlRebroadcast.chainLength || '?'} receipts) broadcast back to peers
                  </div>
                  {axlRebroadcast.newReceipts && (
                    <div style={{ ...mono, fontSize: '0.4rem', color: 'var(--text-dim)', marginTop: '0.05rem' }}>
                      +{axlRebroadcast.newReceipts} new receipts appended
                    </div>
                  )}
                </div>
              )}
              {axlAdopt && (
                <div style={{
                  padding: '0.3rem 0.4rem', borderRadius: '4px',
                  background: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.2)',
                  marginBottom: '0.4rem',
                }}>
                  <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--green)', fontWeight: 600, marginBottom: '0.1rem' }}>
                    CHAIN ADOPTED
                  </div>
                  <div style={{ ...mono, fontSize: '0.42rem', color: 'var(--text-muted)' }}>
                    Agent A adopted extended chain from Agent B
                  </div>
                  {axlAdopt.finalLength && (
                    <div style={{ ...mono, fontSize: '0.4rem', color: 'var(--text-dim)', marginTop: '0.05rem' }}>
                      Final chain: {axlAdopt.finalLength} receipts
                    </div>
                  )}
                </div>
              )}

              {/* A2A Envelope */}
              {axlHandoff?.envelope && (
                <details style={{ marginTop: '0.4rem' }}>
                  <summary style={{
                    fontSize: '0.45rem', color: 'var(--text-dim)', cursor: 'pointer',
                    textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600,
                    listStyle: 'none', display: 'flex', alignItems: 'center', gap: '0.2rem',
                    userSelect: 'none', ...mono,
                  }}>
                    <span style={{ fontSize: '0.45rem' }}>▶</span> A2A Envelope
                  </summary>
                  <pre style={{
                    ...mono, fontSize: '0.42rem', lineHeight: 1.5,
                    color: 'var(--text-muted)', background: 'rgba(0,0,0,0.04)',
                    borderRadius: '4px', padding: '0.4rem',
                    marginTop: '0.2rem', overflow: 'auto', maxHeight: '10rem',
                    border: '1px solid var(--border)',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}>
                    {JSON.stringify(axlHandoff.envelope, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}

          {/* ERC-7857 Agentic ID */}
          {agenticId && (
            <div style={{ padding: '0.8rem 1.2rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.5rem' }}>
                ERC-7857 Agent Identity
              </div>

              {/* Lifecycle steps */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', marginBottom: '0.4rem' }}>
                {[
                  { label: 'mint', done: agenticId.status === 'minted' },
                  { label: 'transfer', done: !!agenticId.transferTx },
                  { label: 'clone', done: !!agenticId.cloneTx },
                  { label: 'authorize', done: !!agenticId.authorizeTx },
                ].map((step, i, arr) => (
                  <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                    <div style={{
                      ...mono, fontSize: '0.4rem', padding: '0.12rem 0.3rem', borderRadius: '3px',
                      background: step.done ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg)',
                      color: step.done ? 'var(--green)' : 'var(--text-dim)',
                      border: `1px solid ${step.done ? 'rgba(34, 197, 94, 0.3)' : 'var(--border)'}`,
                      fontWeight: step.done ? 600 : 400,
                    }}>
                      {step.done ? '✓ ' : ''}{step.label}
                    </div>
                    {i < arr.length - 1 && (
                      <span style={{ ...mono, fontSize: '0.38rem', color: 'var(--text-dim)' }}>→</span>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ ...mono, fontSize: '0.48rem', color: 'var(--text-muted)', wordBreak: 'break-all', marginBottom: '0.2rem' }}>
                {agenticId.metadataHash}
              </div>
              <div style={{
                fontSize: '0.6rem', fontWeight: 600,
                color: agenticId.status === 'minted' ? 'var(--green)' : 'var(--amber)',
              }}>
                {agenticId.status === 'minted' ? `Token #${agenticId.tokenId}` : 'Identity Computed'}
              </div>
              {agenticId.txHash && (
                <div style={{ ...mono, fontSize: '0.42rem', color: 'var(--text-dim)', marginTop: '0.1rem', wordBreak: 'break-all' }}>
                  tx: <a
                    href={`https://chainscan-newton.0g.ai/tx/${agenticId.txHash}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--text-dim)', textDecoration: 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                  >{agenticId.txHash}</a>
                </div>
              )}
              {agenticId.contractAddress && (
                <div style={{ ...mono, fontSize: '0.42rem', color: 'var(--text-dim)', marginTop: '0.05rem', wordBreak: 'break-all' }}>
                  contract: <a
                    href={`https://chainscan-newton.0g.ai/address/${agenticId.contractAddress}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--text-dim)', textDecoration: 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                  >{agenticId.contractAddress}</a>
                </div>
              )}
              {agenticId.capabilities && (
                <div style={{ display: 'flex', gap: '0.15rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                  {agenticId.capabilities.map((cap: string) => (
                    <span key={cap} style={{
                      ...mono, fontSize: '0.38rem', padding: '0.08rem 0.25rem', borderRadius: '2px',
                      background: 'var(--bg)', color: 'var(--text-dim)', border: '1px solid var(--border)',
                    }}>{cap}</span>
                  ))}
                </div>
              )}
              {agenticId.iDatas && (
                <details style={{ marginTop: '0.3rem' }}>
                  <summary style={{ ...mono, fontSize: '0.42rem', color: 'var(--text-dim)', cursor: 'pointer', fontWeight: 600, userSelect: 'none' }}>
                    iNFT Data ({agenticId.iDatas.length} entries)
                  </summary>
                  <pre style={{
                    ...mono, fontSize: '0.38rem', color: 'var(--text-muted)', background: 'var(--bg)',
                    padding: '0.3rem', borderRadius: '3px', marginTop: '0.15rem',
                    overflow: 'auto', maxHeight: '6rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}>{JSON.stringify(agenticId.iDatas, null, 2)}</pre>
                </details>
              )}
            </div>
          )}

          {/* Status Log */}
          {statusLog.length > 0 && (
            <div style={{ padding: '0.8rem 1.2rem', flex: 1 }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.5rem' }}>
                Activity Log
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.12rem' }}>
                {statusLog.slice(-8).map((msg, i, arr) => {
                  const isLatest = i === arr.length - 1;
                  return (
                    <div key={i} style={{
                      fontSize: '0.55rem', color: isLatest ? 'var(--text-muted)' : 'var(--text-dim)',
                      ...mono, display: 'flex', alignItems: 'center', gap: '0.2rem',
                    }}>
                      {isLatest && running && (
                        <span style={{
                          display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%',
                          background: 'var(--green)', flexShrink: 0,
                          animation: 'pulse 1.2s ease-in-out infinite',
                        }} />
                      )}
                      <span>{msg}</span>
                    </div>
                  );
                })}
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
                const isMounted = mountedReceiptIds.has(receipt.id);

                return (
                  <div key={receipt.id} style={{
                    display: 'flex', gap: '0',
                    opacity: isMounted ? 1 : 0,
                    transform: isMounted ? 'translateY(0)' : 'translateY(8px)',
                    transition: 'opacity 0.4s ease, transform 0.4s ease',
                  }}>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)' }}>
                          {ACTION_LABELS[receipt.action.type] ?? receipt.action.type}
                        </span>
                        {receipt.action.type === 'llm_call' && meta?.teeAttested && (
                          <span style={{
                            ...mono, fontSize: '0.55rem', fontWeight: 700, padding: '0.1rem 0.35rem',
                            borderRadius: '3px', background: '#f0fdf4', color: 'var(--green)',
                            border: '1px solid #bbf7d0',
                          }}>TEE VERIFIED</span>
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
                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', ...mono, fontSize: '0.58rem', color: 'var(--text-dim)' }}>
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
                          {meta?.teeMetadata && (
                            <div style={{ marginTop: '0.4rem', padding: '0.4rem', background: '#f0fdf4', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                              <div style={{ fontWeight: 600, color: 'var(--green)', marginBottom: '0.2rem' }}>TEE Attestation</div>
                              <div><span style={{ color: 'var(--text-dim)', display: 'inline-block', width: '80px' }}>provider</span>{meta.teeMetadata.provider}</div>
                              <div><span style={{ color: 'var(--text-dim)', display: 'inline-block', width: '80px' }}>address</span>
                                {meta.teeMetadata.providerAddress && (
                                  <a href={`https://chainscan-newton.0g.ai/address/${meta.teeMetadata.providerAddress}`}
                                    target="_blank" rel="noopener noreferrer"
                                    style={{ color: 'inherit', textDecoration: 'none' }}
                                    onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                                    onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                                    onClick={e => e.stopPropagation()}
                                  >{meta.teeMetadata.providerAddress}</a>
                                )}
                              </div>
                              <div><span style={{ color: 'var(--text-dim)', display: 'inline-block', width: '80px' }}>teeType</span>{meta.teeMetadata.teeType}</div>
                              <div><span style={{ color: 'var(--text-dim)', display: 'inline-block', width: '80px' }}>chatId</span>{meta.teeMetadata.chatId}</div>
                              {meta.teeError && (
                                <div style={{ marginTop: '0.2rem', color: 'var(--amber)', fontSize: '0.52rem' }}>
                                  processResponse: {meta.teeError}
                                </div>
                              )}
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
              <div style={{ textAlign: 'center', maxWidth: '420px', width: '100%' }}>
                <div style={{ marginBottom: '0.8rem', fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>
                  Pipeline Running
                </div>
                <div style={{ ...mono, fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  {statusLog[statusLog.length - 1] || 'Initializing pipeline...'}
                </div>

                {/* Progress bar */}
                <div style={{
                  width: '100%', height: '4px', background: 'var(--border)', borderRadius: '2px',
                  overflow: 'hidden', marginBottom: '1.2rem',
                }}>
                  <div style={{
                    height: '100%', borderRadius: '2px', background: 'var(--green)',
                    width: `${Math.max((pipelineStep / PIPELINE_STEPS.length) * 100, 5)}%`,
                    transition: 'width 0.6s ease',
                  }} />
                </div>

                {/* Step list with skeletons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', textAlign: 'left' }}>
                  {PIPELINE_STEPS.map((step, i) => {
                    const stepNum = i + 1;
                    const isActive = stepNum === pipelineStep;
                    const isDone = stepNum < pipelineStep;
                    return (
                      <div key={step.key} style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.35rem 0.5rem', borderRadius: '4px',
                        background: isActive ? 'var(--surface)' : 'transparent',
                        border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                      }}>
                        <div style={{
                          width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.55rem', fontWeight: 700,
                          background: isDone ? 'var(--green)' : isActive ? 'var(--text)' : 'var(--border)',
                          color: isDone || isActive ? '#fff' : 'var(--text-dim)',
                          ...(isActive ? { animation: 'pulse 1.2s ease-in-out infinite' } : {}),
                        }}>
                          {isDone ? '✓' : stepNum}
                        </div>
                        <span style={{
                          ...mono, fontSize: '0.65rem',
                          color: isDone ? 'var(--green)' : isActive ? 'var(--text)' : 'var(--text-dim)',
                          fontWeight: isActive ? 600 : 400,
                          ...(isDone ? { textDecoration: 'line-through', textDecorationColor: 'var(--border)' } : {}),
                        }}>
                          {step.label}
                        </span>
                        {isActive && (
                          <span style={{
                            marginLeft: 'auto',
                            display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%',
                            background: 'var(--green)', animation: 'pulse 1.2s ease-in-out infinite',
                          }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {/* Training Data Panel — full width in main area */}
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
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.8rem', ...mono, fontSize: '0.62rem', color: 'var(--text-muted)' }}>
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

          {/* 0G Integration Summary Card */}
          {hasData && !running && (storage || anchor0g || agenticId || teeVerified || trainingData) && (
            <div style={{
              marginTop: '1.5rem', padding: '1.2rem 1.4rem',
              background: 'var(--surface)', border: '2px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '10px', boxShadow: '0 2px 12px rgba(34, 197, 94, 0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>0G Integration Summary</div>
                  <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
                    {[
                      receipts.some(r => receiptMeta[r.id]?.llmSource === '0g-compute') && 'Compute',
                      storage?.rootHash && 'Storage',
                      anchor0g?.txHash && 'Chain',
                      trainingData && 'Fine-Tuning',
                      agenticId?.status === 'minted' && 'ERC-7857',
                    ].filter(Boolean).length} / 5 pillars active
                  </div>
                </div>
                <div style={{
                  ...mono, fontSize: '0.55rem', padding: '0.25rem 0.6rem', borderRadius: '5px',
                  background: 'rgba(34, 197, 94, 0.1)', color: 'var(--green)',
                  border: '1px solid rgba(34, 197, 94, 0.3)', fontWeight: 600,
                }}>
                  0G Mainnet · Chain 16661
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.6rem' }}>
                {/* Compute Pillar */}
                {(() => {
                  const computeReceipt = receipts.find(r => receiptMeta[r.id]?.llmSource === '0g-compute');
                  const computeMeta = computeReceipt ? receiptMeta[computeReceipt.id] : null;
                  const active = !!computeReceipt;
                  return (
                    <div style={{
                      padding: '0.6rem', borderRadius: '6px',
                      background: active ? 'rgba(34, 197, 94, 0.04)' : 'var(--bg)',
                      border: `1px solid ${active ? 'rgba(34, 197, 94, 0.2)' : 'var(--border)'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.3rem' }}>
                        <span style={{ color: active ? 'var(--green)' : 'var(--text-dim)', fontWeight: 700, fontSize: '0.7rem' }}>
                          {active ? '✓' : '○'}
                        </span>
                        <span style={{ ...mono, fontSize: '0.6rem', fontWeight: 600, color: active ? 'var(--text)' : 'var(--text-dim)' }}>Compute</span>
                      </div>
                      {active && computeMeta?.teeMetadata && (
                        <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                          <div>Provider: {computeMeta.teeMetadata.provider}</div>
                          <div style={{ wordBreak: 'break-all' }}>Address: {computeMeta.teeMetadata.providerAddress}</div>
                          <div>TEE: {computeMeta.teeMetadata.teeType || 'Intel TDX'}</div>
                          {teeVerified?.signatureEndpoint && (
                            <div style={{ wordBreak: 'break-all' }}>
                              Sig: <a href={teeVerified.signatureEndpoint} target="_blank" rel="noopener noreferrer"
                                style={{ color: 'var(--green)', textDecoration: 'none' }}
                                onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                                onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                              >{teeVerified.signatureEndpoint}</a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Storage Pillar */}
                <div style={{
                  padding: '0.6rem', borderRadius: '6px',
                  background: storage?.rootHash ? 'rgba(34, 197, 94, 0.04)' : 'var(--bg)',
                  border: `1px solid ${storage?.rootHash ? 'rgba(34, 197, 94, 0.2)' : 'var(--border)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.3rem' }}>
                    <span style={{ color: storage?.rootHash ? 'var(--green)' : 'var(--text-dim)', fontWeight: 700, fontSize: '0.7rem' }}>
                      {storage?.rootHash ? '✓' : '○'}
                    </span>
                    <span style={{ ...mono, fontSize: '0.6rem', fontWeight: 600, color: storage?.rootHash ? 'var(--text)' : 'var(--text-dim)' }}>Storage</span>
                  </div>
                  {storage?.rootHash && (
                    <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      <div style={{ wordBreak: 'break-all' }}>Merkle: {storage.rootHash}</div>
                      {storage.dataSize && <div>Size: {(storage.dataSize / 1024).toFixed(1)} KB</div>}
                      {storage.uploadTxHash && <div style={{ wordBreak: 'break-all' }}>Tx: {storage.uploadTxHash}</div>}
                    </div>
                  )}
                </div>

                {/* Chain Pillar */}
                <div style={{
                  padding: '0.6rem', borderRadius: '6px',
                  background: anchor0g?.txHash ? 'rgba(34, 197, 94, 0.04)' : 'var(--bg)',
                  border: `1px solid ${anchor0g?.txHash ? 'rgba(34, 197, 94, 0.2)' : 'var(--border)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.3rem' }}>
                    <span style={{ color: anchor0g?.txHash ? 'var(--green)' : 'var(--text-dim)', fontWeight: 700, fontSize: '0.7rem' }}>
                      {anchor0g?.txHash ? '✓' : '○'}
                    </span>
                    <span style={{ ...mono, fontSize: '0.6rem', fontWeight: 600, color: anchor0g?.txHash ? 'var(--text)' : 'var(--text-dim)' }}>Chain</span>
                  </div>
                  {anchor0g?.txHash && (
                    <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      <div style={{ wordBreak: 'break-all' }}>
                        Tx: <a href={anchor0g.explorerUrl || `https://chainscan-newton.0g.ai/tx/${anchor0g.txHash}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--green)', textDecoration: 'none' }}
                          onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                          onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                        >{anchor0g.txHash}</a>
                      </div>
                      {anchor0g.contractAddress && <div style={{ wordBreak: 'break-all' }}>Contract: {anchor0g.contractAddress}</div>}
                      {anchor0g.chainRootHash && <div style={{ wordBreak: 'break-all' }}>Root: {anchor0g.chainRootHash}</div>}
                    </div>
                  )}
                </div>

                {/* Fine-Tuning Pillar */}
                {(() => {
                  const ftActive = !!fineTuning?.task?.taskId || !!fineTuning?.dataset || !!trainingData;
                  return (
                    <div style={{
                      padding: '0.6rem', borderRadius: '6px',
                      background: ftActive ? 'rgba(34, 197, 94, 0.04)' : 'var(--bg)',
                      border: `1px solid ${ftActive ? 'rgba(34, 197, 94, 0.2)' : 'var(--border)'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.3rem' }}>
                        <span style={{ color: ftActive ? 'var(--green)' : 'var(--text-dim)', fontWeight: 700, fontSize: '0.7rem' }}>
                          {ftActive ? '✓' : '○'}
                        </span>
                        <span style={{ ...mono, fontSize: '0.6rem', fontWeight: 600, color: ftActive ? 'var(--text)' : 'var(--text-dim)' }}>Fine-Tuning</span>
                      </div>
                      {fineTuning?.task && (
                        <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                          <div>Task: {fineTuning.task.taskId}</div>
                          <div>Model: {fineTuning.task.model}</div>
                          <div>Status: {fineTuning.task.status}</div>
                        </div>
                      )}
                      {!fineTuning?.task && fineTuning?.dataset && (
                        <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                          <div>{fineTuning.dataset.examples} examples generated</div>
                          <div>{((fineTuning.dataset.sizeBytes || 0) / 1024).toFixed(1)} KB</div>
                          {fineTuning.upload && <div>TEE upload: {fineTuning.upload.datasetHash?.slice(0, 20)}...</div>}
                          {fineTuning.uploadError && <div style={{ color: 'var(--amber)' }}>Upload: {fineTuning.uploadError.slice(0, 40)}</div>}
                          {fineTuning.taskError && <div style={{ color: 'var(--amber)' }}>Task: {fineTuning.taskError.slice(0, 40)}</div>}
                        </div>
                      )}
                      {!fineTuning?.dataset && trainingData && (
                        <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                          <div>{trainingData.stats.total} training examples</div>
                          <div>Format: chat-messages JSONL</div>
                        </div>
                      )}
                      {!ftActive && hasData && (
                        <button onClick={exportTraining} disabled={loadingTraining} style={{
                          ...mono, fontSize: '0.45rem', padding: '0.2rem 0.4rem', borderRadius: '3px',
                          border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-muted)',
                          cursor: loadingTraining ? 'not-allowed' : 'pointer',
                        }}>{loadingTraining ? 'Generating...' : 'Generate'}</button>
                      )}
                    </div>
                  );
                })()}

                {/* ERC-7857 Pillar */}
                <div style={{
                  padding: '0.6rem', borderRadius: '6px',
                  background: agenticId?.status === 'minted' ? 'rgba(34, 197, 94, 0.04)' : 'var(--bg)',
                  border: `1px solid ${agenticId?.status === 'minted' ? 'rgba(34, 197, 94, 0.2)' : 'var(--border)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.3rem' }}>
                    <span style={{ color: agenticId?.status === 'minted' ? 'var(--green)' : 'var(--text-dim)', fontWeight: 700, fontSize: '0.7rem' }}>
                      {agenticId?.status === 'minted' ? '✓' : '○'}
                    </span>
                    <span style={{ ...mono, fontSize: '0.6rem', fontWeight: 600, color: agenticId?.status === 'minted' ? 'var(--text)' : 'var(--text-dim)' }}>ERC-7857</span>
                  </div>
                  {agenticId && (
                    <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      <div>Token #{agenticId.tokenId}</div>
                      {agenticId.txHash && (
                        <div style={{ wordBreak: 'break-all' }}>
                          Tx: <a href={`https://chainscan-newton.0g.ai/tx/${agenticId.txHash}`}
                            target="_blank" rel="noopener noreferrer"
                            style={{ color: 'var(--green)', textDecoration: 'none' }}
                            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                          >{agenticId.txHash}</a>
                        </div>
                      )}
                      {agenticId.capabilities && <div>Caps: {agenticId.capabilities.join(', ')}</div>}
                    </div>
                  )}
                </div>
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
        flexShrink: 0, flexWrap: 'wrap', gap: '0.3rem',
      }}>
        <div className="bottom-tags" style={{ display: 'flex', gap: '0.8rem' }}>
          {['0G Compute', '0G Storage', '0G Chain', '0G Fine-Tuning', 'ERC-7857', 'Gensyn AXL'].map(tag => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <span style={mono}>ed25519 + SHA-256</span>
      </div>
    </div>
  );
}
