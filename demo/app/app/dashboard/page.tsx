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
  usefulness_review: 'Usefulness Review',
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
  reviewScores: { alignment: number; substance: number; quality: number; composite: number; reasoning: string } | null;
  qualityRejected: boolean;
  receiptWeights: number[];
  scoreDelta: number | null;
  timestamp: number;
}

/* ─── Nav ─── */
function Nav() {
  return (
    <nav style={{
      padding: '0.6rem 1.5rem',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <a href="/" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', textDecoration: 'none', letterSpacing: '0.03em' }}>
        R.E.C.E.I.P.T.
      </a>
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
        <a href="/" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Home</a>
        <a href="/demo" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Demo</a>
        <a href="/verify" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Verify</a>
        <a href="/dashboard" style={{ fontSize: '0.75rem', color: 'var(--text)', textDecoration: 'none', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>Dashboard</a>
        <a href="/trial" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Replay</a>
      </div>
    </nav>
  );
}

export default function Dashboard() {
  /* ─── State ─── */
  const [running, setRunning] = useState(false);
  const [adversarial, setAdversarial] = useState(false);
  const [lowQuality, setLowQuality] = useState(false);
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

  const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null);
  const [chainExpanded, setChainExpanded] = useState(false);
  const [onchainExpanded, setOnchainExpanded] = useState(false);
  const [identityExpanded, setIdentityExpanded] = useState(false);
  const [qualityExpanded, setQualityExpanded] = useState(false);

  const [anchor0g, setAnchor0g] = useState<{ txHash: string; chain: string; contractAddress?: string; chainRootHash?: string; storageRef?: string; explorerUrl?: string; usefulnessScore?: number } | null>(null);
  const [storage, setStorage] = useState<{ rootHash?: string; uploaded?: boolean; dataSize?: number; indexerUrl?: string; uploadTxHash?: string } | null>(null);
  const [anchoring, setAnchoring] = useState(false);
  const [trainingData, setTrainingData] = useState<{ jsonl: string; stats: any } | null>(null);
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
  const [reviewScores, setReviewScores] = useState<{ alignment: number; substance: number; quality: number; composite: number; reasoning: string } | null>(null);
  const [qualityRejected, setQualityRejected] = useState(false);
  const [receiptWeights, setReceiptWeights] = useState<number[]>([]);
  const [scoreDelta, setScoreDelta] = useState<number | null>(null);
  const [buttonDots, setButtonDots] = useState('');
  const [mountedReceiptIds, setMountedReceiptIds] = useState<Set<string>>(new Set());
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [isCachedData, setIsCachedData] = useState(false);
  const [lastRunTimestamp, setLastRunTimestamp] = useState<Date | null>(null);
  const [pipelineTotalMs, setPipelineTotalMs] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [inferenceCount, setInferenceCount] = useState(0);
  const [modelsUsed, setModelsUsed] = useState<Set<string>>(new Set());

  const timelineRef = useRef<HTMLDivElement>(null);

  /* ─── Effects ─── */

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

  // Load persisted state from localStorage on mount
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
          if (s.reviewScores) setReviewScores(s.reviewScores);
          if (s.qualityRejected) setQualityRejected(s.qualityRejected);
          if (s.receiptWeights) setReceiptWeights(s.receiptWeights);
          if (s.scoreDelta !== undefined) setScoreDelta(s.scoreDelta);
          setIsCachedData(true);
          setMountedReceiptIds(new Set(s.receipts.map(r => r.id)));
          if (s.timestamp) setLastRunTimestamp(new Date(s.timestamp));
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
          tamperedIds: [...tamperedIds], tamperDetails, reviewScores,
          qualityRejected, receiptWeights, scoreDelta, timestamp: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        localStorage.setItem('receipt_last_chain', JSON.stringify(receipts));
      } catch {}
    }
  }, [receipts, receiptMeta, verifications, agentACount, chainRootHash,
    trustScore, anchor0g, storage, agenticId, axlHandoff,
    axlReceived, mcpToolCalls, peers, teeVerified, agentCard,
    axlRebroadcast, axlAdopt, fineTuning, trainingData, fabricationDetected,
    tamperedIds, tamperDetails, reviewScores, qualityRejected, receiptWeights, scoreDelta, running]);

  // Fetch provider health on mount (kept internally, not rendered)
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

  /* ─── Derived ─── */
  const hasData = receipts.length > 0;
  const allVerified = verifications.length > 0 && verifications.every(v => v.valid);
  const failedCount = verifications.filter(v => !v.valid).length;

  /* ─── Run pipeline ─── */
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
    setReviewScores(null);
    setQualityRejected(false);
    setReceiptWeights([]);
    setScoreDelta(null);
    setPipelineError(null);
    setLastRunTimestamp(null);
    setPipelineTotalMs(0);
    setTotalTokens(0);
    setInferenceCount(0);
    setModelsUsed(new Set());

    const readSSE = async (url: string, body: any) => {
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const events: Array<{ event: string; data: any }> = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n'); buffer = lines.pop() || '';
          let event = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7);
            else if (line.startsWith('data: ') && event) { events.push({ event, data: JSON.parse(line.slice(6)) }); event = ''; }
          }
        }
        return events;
      } catch { return []; }
    };

    // Phase 1: Researcher
    const researcherEvents = await readSSE('/api/researcher', { adversarial });
    for (const { event, data } of researcherEvents) handleEvent(event, data);
    const rDone = researcherEvents.find(e => e.event === 'researcher_done');

    // Phase 2: Builder
    if (rDone?.data?.receipts) {
      const builderEvents = await readSSE('/api/builder', { lowQuality, receipts: rDone.data.receipts, publicKey: rDone.data.publicKey });
      for (const { event, data } of builderEvents) handleEvent(event, data);
    }

    setRunning(false);
    setLastRunTimestamp(new Date());
  }, [adversarial, lowQuality]);

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
        if (data.tokensUsed) {
          setTotalTokens(prev => prev + data.tokensUsed);
          setInferenceCount(prev => prev + 1);
        }
        if (data.teeMetadata?.provider) {
          setModelsUsed(prev => { const next = new Set(prev); next.add(data.teeMetadata.provider); return next; });
        }
        break;
      case 'pipeline_timing':
        setPipelineTotalMs(data.totalMs);
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
        try {
          const allReceipts = data.receipts;
          if (allReceipts) localStorage.setItem('receipt_last_chain', JSON.stringify(allReceipts));
        } catch {}
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
      case 'review_scores':
        setReviewScores({ alignment: data.alignment, substance: data.substance, quality: data.quality, composite: data.composite, reasoning: data.reasoning || '' });
        if (data.weights) setReceiptWeights(data.weights);
        if (data.delta !== undefined) setScoreDelta(data.delta);
        break;
      case 'quality_gate':
        setQualityRejected(!data.passed);
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

  // Keep storeAndAnchor internally (called by pipeline, not rendered as a button)
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

  /* ─── Helpers ─── */
  const getStatusBadge = (): { label: string; color: string; bg: string } => {
    if (fabricationDetected) return { label: 'FABRICATION DETECTED', color: 'var(--red)', bg: 'rgba(220, 38, 38, 0.08)' };
    if (qualityRejected) return { label: 'NOT ANCHORED', color: 'var(--amber)', bg: 'rgba(217, 119, 6, 0.08)' };
    if (allVerified) return { label: 'CHAIN VERIFIED', color: 'var(--green)', bg: 'rgba(22, 163, 74, 0.08)' };
    if (verifications.length > 0) return { label: 'VERIFICATION FAILED', color: 'var(--red)', bg: 'rgba(220, 38, 38, 0.08)' };
    return { label: 'PENDING', color: 'var(--text-dim)', bg: 'var(--surface)' };
  };

  const getReceiptSummary = (): string => {
    const total = receipts.length;
    if (failedCount > 0) return `${total} receipts, ${failedCount} failed`;
    if (verifications.length > 0) return `${total} receipts, all verified`;
    return `${total} receipts`;
  };

  const isResearcher = (index: number): boolean => {
    if (agentACount === 0) return true;
    return index < agentACount;
  };

  const usefulnessScore = reviewScores?.composite ?? (typeof anchor0g?.usefulnessScore === 'number' ? anchor0g.usefulnessScore : null);

  /* ─── Mode selector ─── */
  type RunMode = 'honest' | 'adversarial' | 'lowQuality';
  const currentMode: RunMode = adversarial ? 'adversarial' : lowQuality ? 'lowQuality' : 'honest';
  const setMode = (mode: RunMode) => {
    setAdversarial(mode === 'adversarial');
    setLowQuality(mode === 'lowQuality');
  };

  /* ─── Run controls ─── */
  const RunControls = () => (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      {([
        { key: 'honest' as RunMode, label: 'Honest', color: 'var(--green)' },
        { key: 'adversarial' as RunMode, label: 'Adversarial', color: 'var(--red)' },
        { key: 'lowQuality' as RunMode, label: 'Low Quality', color: 'var(--amber)' },
      ]).map(m => (
        <button
          key={m.key}
          onClick={() => setMode(m.key)}
          disabled={running}
          style={{
            ...mono,
            fontSize: '0.7rem',
            padding: '0.3rem 0.7rem',
            borderRadius: '4px',
            border: `1px solid ${currentMode === m.key ? m.color : 'var(--border)'}`,
            background: currentMode === m.key ? m.color + '15' : 'transparent',
            color: currentMode === m.key ? m.color : 'var(--text-dim)',
            cursor: running ? 'not-allowed' : 'pointer',
            fontWeight: currentMode === m.key ? 600 : 400,
            transition: 'all 0.15s',
          }}
        >
          {m.label}
        </button>
      ))}
      <button
        onClick={run}
        disabled={running}
        style={{
          padding: '0.4rem 1.2rem',
          borderRadius: '6px',
          border: 'none',
          background: running ? 'var(--border)' : adversarial ? 'var(--red)' : lowQuality ? 'var(--amber)' : 'var(--text)',
          color: '#fff',
          cursor: running ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          fontSize: '0.85rem',
          fontWeight: 600,
          minWidth: '130px',
        }}
      >
        {running ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{
              display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
              border: '2px solid transparent', borderTop: '2px solid #fff',
              animation: 'spin 0.8s linear infinite',
            }} />
            Running{buttonDots}
          </span>
        ) : 'Run Pipeline'}
      </button>
    </div>
  );

  /* ─────────────────────────────────────────── */
  /* ─── EMPTY STATE ─── */
  /* ─────────────────────────────────────────── */
  if (!hasData && !running) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <style>{`
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
        <Nav />
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: 'calc(100vh - 60px)', gap: '2rem', padding: '2rem',
        }}>
          <div style={{ textAlign: 'center', maxWidth: '520px' }}>
            <div style={{ ...mono, fontSize: '2.2rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: '1rem' }}>
              R.E.C.E.I.P.T.
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '2rem' }}>
              Run the pipeline to see agent work. Every action produces a signed, hash-linked receipt. When agents collaborate, they verify each other's chain before continuing.
            </p>
            <RunControls />
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────── */
  /* ─── RUNNING STATE (no receipts yet) ─── */
  /* ─────────────────────────────────────────── */
  if (running && receipts.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <style>{`
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
        <Nav />
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: 'calc(100vh - 60px)', gap: '1rem', padding: '2rem',
        }}>
          <div style={{
            width: '12px', height: '12px', borderRadius: '50%',
            background: 'var(--green)', animation: 'pulse 1.2s ease-in-out infinite',
          }} />
          <div style={{ ...mono, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {statusLog[statusLog.length - 1] || 'Initializing pipeline...'}
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────── */
  /* ─── DASHBOARD (has data or running w/ receipts) ─── */
  /* ─────────────────────────────────────────── */
  const badge = getStatusBadge();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @media (max-width: 700px) {
          .receipt-content { max-width: 100% !important; padding: 0 1rem !important; }
        }
      `}</style>
      <Nav />

      {/* Content — single column, centered */}
      <div
        ref={timelineRef}
        className="receipt-content"
        style={{
          flex: 1, overflowY: 'auto',
          maxWidth: '700px', width: '100%', margin: '0 auto',
          padding: '2rem 1.5rem 4rem',
        }}
      >
        {/* Run controls */}
        <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.8rem' }}>
          <RunControls />
          {running && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', animation: 'pulse 1.2s ease-in-out infinite' }} />
              <span style={{ ...mono, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {statusLog[statusLog.length - 1] || 'Running...'}
              </span>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════ */}
        {/* SECTION 1: Last Run                */}
        {/* ═══════════════════════════════════ */}
        {hasData && !running && (
          <section style={{
            padding: '1.5rem', borderRadius: '10px', marginBottom: '2rem',
            background: 'var(--surface)', border: `1px solid var(--border)`,
          }}>
            {/* Score — the ONE number */}
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <span style={{
                ...mono, fontSize: '4rem', fontWeight: 700, lineHeight: 1,
                color: usefulnessScore === null ? 'var(--text-dim)'
                  : usefulnessScore >= 70 ? 'var(--green)'
                  : usefulnessScore >= 40 ? 'var(--amber)'
                  : 'var(--red)',
              }}>
                {usefulnessScore !== null ? usefulnessScore : '—'}
              </span>
              <div style={{ ...mono, fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.3rem' }}>
                {usefulnessScore !== null ? '/ 100 usefulness' : 'no score yet'}
                {scoreDelta !== null && (
                  <span style={{
                    marginLeft: '0.8rem', fontWeight: 600,
                    color: scoreDelta >= 0 ? 'var(--green)' : 'var(--red)',
                  }}>
                    {scoreDelta >= 0 ? '+' : ''}{scoreDelta} vs avg
                  </span>
                )}
              </div>
            </div>

            {/* Badge + verdict */}
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{
                display: 'inline-block', padding: '0.3rem 0.8rem', borderRadius: '4px',
                background: badge.bg, border: `1px solid ${badge.color}30`,
                ...mono, fontSize: '0.75rem', fontWeight: 700, color: badge.color,
                marginBottom: '0.5rem',
              }}>
                {badge.label}
              </div>
              {usefulnessScore !== null && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', lineHeight: 1.6 }}>
                  {usefulnessScore >= 70
                    ? 'High-quality work. This chain earns on-chain reputation and becomes fine-tuning data.'
                    : usefulnessScore >= 40
                    ? 'Acceptable quality. Recorded on-chain but flagged for improvement.'
                    : 'Low quality. Tokens were spent but the output wasn\'t useful enough to earn reputation.'}
                </div>
              )}
            </div>

            {/* Breakdown — compact */}
            {reviewScores && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '1.2rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
                {([
                  { label: 'Alignment', value: reviewScores.alignment, desc: 'Did it follow the task?' },
                  { label: 'Substance', value: reviewScores.substance, desc: 'Real data or stubs?' },
                  { label: 'Quality', value: reviewScores.quality, desc: 'Is the output good?' },
                ] as const).map(s => (
                  <div key={s.label} title={s.desc} style={{ textAlign: 'center' }}>
                    <div style={{
                      ...mono, fontSize: '1.2rem', fontWeight: 700,
                      color: s.value >= 70 ? 'var(--green)' : s.value >= 40 ? 'var(--amber)' : 'var(--red)',
                    }}>
                      {s.value}
                    </div>
                    <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Meta line */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap', ...mono, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              {lastRunTimestamp && (
                <span>{lastRunTimestamp.toLocaleString()}</span>
              )}
              {isCachedData && !lastRunTimestamp && (
                <span>cached run</span>
              )}
              <span>{getReceiptSummary()}</span>
              {pipelineTotalMs > 0 && (
                <span>{(pipelineTotalMs / 1000).toFixed(1)}s · {totalTokens.toLocaleString()} tokens</span>
              )}
            </div>

            {/* Error */}
            {pipelineError && (
              <div style={{
                marginTop: '0.8rem', padding: '0.5rem 0.7rem', borderRadius: '4px',
                background: 'rgba(220, 38, 38, 0.06)', border: '1px solid rgba(220, 38, 38, 0.2)',
                ...mono, fontSize: '0.65rem', color: 'var(--red)', wordBreak: 'break-all',
              }}>
                {pipelineError}
              </div>
            )}
          </section>
        )}

        {/* ═══════════════════════════════════ */}
        {/* SECTION 2: The Chain (collapsible)  */}
        {/* ═══════════════════════════════════ */}
        {receipts.length > 0 && (
          <section style={{ marginBottom: '2rem' }}>
            <div
              onClick={() => setChainExpanded(!chainExpanded)}
              style={{
                ...mono, fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-dim)',
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.8rem',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.5rem 0.7rem', borderRadius: '6px',
                background: 'var(--surface)', border: '1px solid var(--border)',
              }}
            >
              <div>
                The Chain
                <span style={{ fontSize: '0.55rem', fontWeight: 400, marginLeft: '0.6rem', color: 'var(--text-muted)' }}>
                  {getReceiptSummary()}
                </span>
              </div>
              <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', display: 'inline-block', transform: chainExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                ▾
              </span>
            </div>

            {chainExpanded && (
            <div>
            {/* Legend */}
            <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '0.5rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', ...mono, fontSize: '0.55rem', color: 'var(--text-dim)' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--researcher)' }} /> Researcher
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', ...mono, fontSize: '0.55rem', color: 'var(--text-dim)' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--builder)' }} /> Builder
              </span>
            </div>

            {/* Fabrication alert */}
            {fabricationDetected && (
              <div style={{
                marginBottom: '1rem', padding: '0.8rem 1rem',
                background: 'rgba(220, 38, 38, 0.06)', border: '2px solid var(--red)', borderRadius: '8px',
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--red)', marginBottom: '0.3rem' }}>
                  FABRICATION DETECTED
                </div>
                <div style={{ fontSize: '0.75rem', color: '#991b1b', lineHeight: 1.5 }}>
                  The Researcher fabricated data after signing. The output hash no longer matches the ed25519 signature. Builder refused the handoff.
                </div>
                {Object.values(tamperDetails).map(td => (
                  <div key={td.index} style={{ marginTop: '0.3rem', ...mono, fontSize: '0.65rem', color: '#b91c1c' }}>
                    Receipt #{td.index}: {td.detail}
                  </div>
                ))}
              </div>
            )}

            {/* Receipt timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {receipts.map((receipt, i) => {
                const meta = receiptMeta[receipt.id];
                const isTampered = tamperedIds.has(receipt.id);
                const verification = verifications.find(v => v.receiptId === receipt.id);
                const expanded = expandedReceipt === receipt.id;
                const isMounted = mountedReceiptIds.has(receipt.id);
                const researcher = isResearcher(i);
                const agentColor = researcher ? 'var(--researcher)' : 'var(--builder)';
                const passed = verification ? verification.valid : !isTampered;
                const weight = receiptWeights[i];

                return (
                  <div
                    key={receipt.id}
                    style={{
                      opacity: isMounted ? 1 : 0,
                      transform: isMounted ? 'translateY(0)' : 'translateY(6px)',
                      transition: 'opacity 0.3s ease, transform 0.3s ease',
                    }}
                  >
                    {/* One-line receipt */}
                    <div
                      onClick={() => setExpandedReceipt(expanded ? null : receipt.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.5rem 0.7rem',
                        borderLeft: `3px solid ${agentColor}`,
                        background: expanded ? 'var(--surface)' : 'transparent',
                        cursor: 'pointer',
                        borderRadius: '0 4px 4px 0',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = 'var(--surface)'; }}
                      onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = 'transparent'; }}
                    >
                      {/* Action label */}
                      <span style={{
                        ...mono, fontSize: '0.72rem', fontWeight: 600, color: 'var(--text)',
                        minWidth: '120px', flexShrink: 0,
                      }}>
                        {ACTION_LABELS[receipt.action.type] ?? receipt.action.type}
                      </span>

                      {/* Description */}
                      <span style={{
                        fontSize: '0.72rem', color: 'var(--text-muted)',
                        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {receipt.action.description}
                      </span>

                      {/* Pass / fail */}
                      <span style={{
                        ...mono, fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
                        color: isTampered ? 'var(--red)' : passed ? 'var(--green)' : 'var(--red)',
                      }}>
                        {isTampered ? 'X' : passed ? '✓' : 'X'}
                      </span>
                    </div>

                    {/* Expanded details */}
                    {expanded && (
                      <div style={{
                        padding: '0.7rem 0.7rem 0.7rem 1.5rem',
                        borderLeft: `3px solid ${agentColor}`,
                        background: 'var(--surface)',
                        borderRadius: '0 0 4px 0',
                        ...mono, fontSize: '0.62rem', lineHeight: 1.8, color: 'var(--text-muted)',
                      }}>
                        <div><span style={{ color: 'var(--text-dim)', display: 'inline-block', width: '100px' }}>input hash</span>{receipt.inputHash}</div>
                        <div style={{ color: isTampered ? 'var(--red)' : undefined }}>
                          <span style={{ color: 'var(--text-dim)', display: 'inline-block', width: '100px' }}>output hash</span>{receipt.outputHash}
                        </div>
                        <div><span style={{ color: 'var(--text-dim)', display: 'inline-block', width: '100px' }}>signature</span>{receipt.signature.slice(0, 20)}...</div>
                        <div><span style={{ color: 'var(--text-dim)', display: 'inline-block', width: '100px' }}>timestamp</span>{new Date(receipt.timestamp).toLocaleString()}</div>
                        <div>
                          <span style={{ color: 'var(--text-dim)', display: 'inline-block', width: '100px' }}>TEE attested</span>
                          <span style={{ color: meta?.teeAttested ? 'var(--green)' : 'var(--text-dim)', fontWeight: 600 }}>
                            {meta?.teeAttested ? 'yes' : 'no'}
                          </span>
                        </div>
                        {weight !== undefined && receipt.action.type !== 'usefulness_review' && (
                          <div>
                            <span style={{ color: 'var(--text-dim)', display: 'inline-block', width: '100px' }}>usefulness</span>
                            <span style={{
                              fontWeight: 600,
                              color: weight >= 0.7 ? 'var(--green)' : weight >= 0.4 ? 'var(--amber)' : 'var(--red)',
                            }}>
                              {(weight * 100).toFixed(0)}%
                            </span>
                          </div>
                        )}
                        <div><span style={{ color: 'var(--text-dim)', display: 'inline-block', width: '100px' }}>agent</span>{researcher ? 'Researcher' : 'Builder'}</div>
                        {isTampered && tamperDetails[receipt.id] && (
                          <div style={{ marginTop: '0.3rem', padding: '0.3rem 0.5rem', background: 'rgba(220,38,38,0.06)', borderRadius: '4px', color: 'var(--red)' }}>
                            {tamperDetails[receipt.id].detail}
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
          </section>
        )}

        {/* ═══════════════════════════════════ */}
        {/* SECTION 3: On-Chain Record (collapsible) */}
        {/* ═══════════════════════════════════ */}
        {hasData && !running && (
          <section style={{
            borderRadius: '8px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            <div
              onClick={() => setOnchainExpanded(!onchainExpanded)}
              style={{
                ...mono, fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-dim)',
                textTransform: 'uppercase', letterSpacing: '0.08em',
                padding: '0.7rem 1rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                On-Chain Record
                <span style={{
                  fontSize: '0.55rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: '3px',
                  background: anchor0g?.txHash ? 'rgba(22,163,74,0.1)' : fabricationDetected ? 'rgba(220,38,38,0.08)' : 'transparent',
                  color: anchor0g?.txHash ? 'var(--green)' : fabricationDetected ? 'var(--red)' : 'var(--text-dim)',
                }}>
                  {anchor0g?.txHash ? 'Anchored' : qualityRejected ? 'Rejected' : fabricationDetected ? 'Blocked' : 'Pending'}
                </span>
              </div>
              <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', display: 'inline-block', transform: onchainExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
            </div>
            {onchainExpanded && (
              <div style={{ padding: '0 1rem 0.8rem' }}>
                {anchor0g?.txHash ? (
                  <div style={{ ...mono, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
                    <div>
                      <span style={{ color: 'var(--green)', fontWeight: 600 }}>Anchored on 0G Mainnet</span>
                    </div>
                    <div>
                      tx{' '}
                      <a
                        href={anchor0g.explorerUrl || `https://chainscan-newton.0g.ai/tx/${anchor0g.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--green)', textDecoration: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                      >
                        {anchor0g.txHash}
                      </a>
                    </div>
                    {storage?.rootHash && (
                      <div style={{ color: 'var(--text-dim)' }}>
                        Stored on 0G decentralized storage
                      </div>
                    )}
                  </div>
                ) : qualityRejected ? (
                  <div style={{ ...mono, fontSize: '0.72rem', color: 'var(--amber)' }}>
                    Not anchored — quality below threshold. Tokens were spent but the work wasn{"'"}t good enough to record.
                  </div>
                ) : fabricationDetected ? (
                  <div style={{ ...mono, fontSize: '0.72rem', color: 'var(--red)' }}>
                    Not anchored — fabrication detected. Tampered data never touches the blockchain.
                  </div>
                ) : (
                  <div style={{ ...mono, fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                    Not anchored
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ═══════════════════════════════════ */}
        {/* SECTION 4: Quality Pipeline (compact expandable) */}
        {/* ═══════════════════════════════════ */}
        {reviewScores && (
          <section style={{
            marginTop: '1.5rem', borderRadius: '8px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            <div
              onClick={() => setQualityExpanded(!qualityExpanded)}
              style={{
                ...mono, fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-dim)',
                textTransform: 'uppercase', letterSpacing: '0.08em',
                padding: '0.7rem 1rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                Quality Pipeline
                <span style={{ fontSize: '0.55rem', fontWeight: 400, color: 'var(--text-muted)' }}>
                  Score {reviewScores.composite} &rarr; {reviewScores.composite >= 60 ? 'Gate passed' : 'Gate failed'} &rarr; {anchor0g ? 'Anchored' : 'Not anchored'} &rarr; {reviewScores.composite >= 60 ? 'Training data' : 'Excluded'}
                </span>
              </div>
              <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', display: 'inline-block', transform: qualityExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
            </div>
            {qualityExpanded && (
              <div style={{ padding: '0 1rem 0.8rem' }}>
                {reviewScores.reasoning && (
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', lineHeight: 1.6, marginBottom: '0.5rem' }}>
                    {reviewScores.reasoning}
                  </div>
                )}
                <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif' }}>
                  High-quality chains earn on-chain reputation and become fine-tuning data. Low-quality chains are excluded — the system only trains on work that mattered.
                </div>
              </div>
            )}
          </section>
        )}

        {/* ═══════════════════════════════════ */}
        {/* SECTION 5: Agent Identity (collapsible) */}
        {/* ═══════════════════════════════════ */}
        {agenticId && (
          <section style={{
            marginTop: '1.5rem', borderRadius: '8px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            <div
              onClick={() => setIdentityExpanded(!identityExpanded)}
              style={{
                ...mono, fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-dim)',
                textTransform: 'uppercase', letterSpacing: '0.08em',
                padding: '0.7rem 1rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Agent Identity
                <span style={{ padding: '0.1rem 0.4rem', background: 'rgba(96,165,250,0.1)', color: '#60a5fa', borderRadius: '4px', fontSize: '0.5rem', fontWeight: 600, ...mono }}>ERC-7857</span>
              </div>
              <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', display: 'inline-block', transform: identityExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
            </div>
            {identityExpanded && (
              <div style={{ padding: '0 1rem 0.8rem', ...mono, fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
                {agenticId.tokenId && <div>Token #{agenticId.tokenId}</div>}
                <div>Contract: {(agenticId.contractAddress || '0xf964d45c3Ea5368918B1FDD49551E373028108c9').slice(0, 10)}...</div>
                {agenticId.chainRootHash && <div>Chain root: {agenticId.chainRootHash.slice(0, 16)}...</div>}
                {trustScore != null && <div>Trust score: {trustScore}/100</div>}
                <a
                  href={`https://chainscan-newton.0g.ai/address/${agenticId.contractAddress || '0xf964d45c3Ea5368918B1FDD49551E373028108c9'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#60a5fa', textDecoration: 'none', fontSize: '0.55rem' }}
                >
                  View on 0G Explorer &rarr;
                </a>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
