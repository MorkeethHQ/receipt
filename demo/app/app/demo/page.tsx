'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

type Phase = 'idle' | 'running' | 'done';

type StoryStage =
  | 'agent-a-working'
  | 'axl-handoff'
  | 'agent-b-verifying'
  | 'agent-b-working'
  | 'agent-b-rejected'
  | 'anchoring'
  | 'complete'
  | 'rebroadcast'
  | 'adopt';

interface TimingEntry {
  label: string;
  ms: number;
  eventIndex: number;
}

interface CenterLogEntry {
  id: string;
  text: string;
  type: 'info' | 'pass' | 'fail' | 'handoff' | 'mcp' | 'anchor' | 'tee' | 'rebroadcast' | 'adopt' | 'agent-card';
  timestamp: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const mono = { fontFamily: "'IBM Plex Mono', 'Courier New', monospace" } as const;

const ACTION_LABELS: Record<string, string> = {
  file_read: 'File Read',
  api_call: 'API Call',
  llm_call: 'LLM Inference',
  decision: 'Decision',
  output: 'Output',
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  file_read: 'Reading project manifest and hashing contents with SHA-256',
  api_call: 'Fetching live data from GitHub API',
  llm_call: 'Running inference via 0G Compute (TEE-attested)',
  decision: 'Analyzing gathered data and making a judgment',
  output: 'Producing final summary with cryptographic proof',
};

/* ------------------------------------------------------------------ */
/*  Narrative helper                                                   */
/* ------------------------------------------------------------------ */

function getNarrative(event: string, data: any): string {
  if (event === 'receipt') {
    const type = data.receipt.action.type;
    const agent = data.agent;
    switch (type) {
      case 'file_read':
        return `This receipt proves Agent ${agent} actually read the file -- the input hash is the SHA-256 of the file path, the output hash covers the file contents. If anyone modifies the file later, the hash won't match and the receipt becomes invalid.`;
      case 'api_call':
        return `Agent ${agent} called an external API. Both the request and response are hashed -- the receipt proves exactly what data was returned, even if the API changes later.`;
      case 'llm_call':
        return data.teeAttested
          ? `The TEE attestation means 0G's trusted execution environment (Intel TDX) verified this inference was real, not simulated. The signature endpoint can be independently checked.`
          : `Agent ${agent} ran LLM inference. The prompt and response are hashed into the receipt. With TEE attestation, even the model execution is verified.`;
      case 'decision':
        return `Notice the previousHash field -- it chains back to the last receipt, creating a tamper-evident linked list. Agent ${agent}'s reasoning is captured and signed, so you can audit exactly why this path was chosen.`;
      case 'output':
        return `Agent ${agent} produced its final output. Every single step that led here is cryptographically linked in the chain. Nothing was skipped.`;
      default:
        return `Agent ${agent}: ${data.receipt.action.description}`;
    }
  }
  if (event === 'status') {
    if (data.message?.includes('Verifying') || data.message?.includes('verifying'))
      return 'Agent B received Agent A\'s full receipt chain. Before doing any work, it independently verifies every single receipt -- checking signatures, hash links, and timestamps.';
    if (data.message?.includes('Fabricating'))
      return 'Agent A is about to lie. It will modify the API response data after signing the receipt. The ed25519 signature was computed on the original data -- the modified hash won\'t match.';
    if (data.message?.includes('Broadcasting'))
      return 'Agent A broadcasts its receipt chain over AXL peer-to-peer. The bundle includes the chain root hash and the sender\'s ed25519 public key.';
    if (data.message?.includes('0G Storage'))
      return 'The verified receipt chain is being stored on 0G decentralized storage. This creates a permanent, tamper-proof record.';
    return '';
  }
  if (event === 'verified') {
    return data.result.valid
      ? `Receipt verified: ed25519 signature matches the data, hash links to the previous receipt, timestamp is valid. This action is authentic.`
      : `VERIFICATION FAILED. The ed25519 signature does not match the receipt data. Someone modified this receipt after it was signed.`;
  }
  if (event === 'fabrication_detected') {
    const expected = data.expectedHash ? data.expectedHash.slice(0, 16) + '...' : '(original)';
    const got = data.actualHash ? data.actualHash.slice(0, 16) + '...' : '(tampered)';
    return `CAUGHT. The output hash doesn't match the ed25519 signature. The SHA-256 hash of the actual API response differs from what Agent A claimed. Expected: ${expected}. Got: ${got}. Agent B rejects the entire handoff.`;
  }
  if (event === 'axl_handoff') {
    return 'Agent A is sending its full receipt chain to Agent B via AXL peer-to-peer protocol. The handoff includes the chain root hash, receipt count, and sender public key.';
  }
  if (event === 'axl_received') {
    return 'Agent B has received the receipt bundle via AXL. It will now independently verify every receipt in the chain before accepting the handoff.';
  }
  if (event === 'axl_rebroadcast') {
    return 'Agent B re-broadcasts the extended receipt chain to the AXL network. Other peers can now see the combined work of both agents.';
  }
  if (event === 'axl_adopt') {
    return 'Agent A adopts the extended chain from Agent B. The receipt chain now includes both agents\' work as a single verifiable history.';
  }
  if (event === 'agent_card') {
    return `Agent card discovered: ${data.name || data.agentName || 'peer'}. Capabilities and public key exchanged via A2A protocol.`;
  }
  if (event === 'tee_verified') {
    return `TEE attestation independently verified via ${data.verificationMethod || 'Intel TDX'}. The inference response is cryptographically proven to have executed inside a secure enclave.`;
  }
  if (event === 'mcp_tool_call') {
    return `Agent B invoked verify_chain via MCP tool protocol. This is how agents programmatically verify each other's work.`;
  }
  if (event === 'done') {
    return data.fabricated
      ? 'Pipeline complete. The fabrication was caught and the handoff was rejected. No tampered data reaches the next agent.'
      : 'Pipeline complete. All receipts verified. The entire chain is cryptographically sound -- every action is proven.';
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
    case 'axl_handoff': return 1400;
    case 'axl_received': return 1200;
    case 'mcp_tool_call': return 900;
    case 'peer_discovery': return 600;
    case 'agent_card': return 800;
    case 'axl_rebroadcast': return 1000;
    case 'axl_adopt': return 1000;
    case 'tee_verified': return 1200;
    default: return 500;
  }
}

/* ------------------------------------------------------------------ */
/*  AnimatedCounter — animates a number from 0 to target              */
/* ------------------------------------------------------------------ */

function AnimatedCounter({ target, duration = 1200, color }: { target: number; duration?: number; color: string }) {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return (
    <span style={{ ...mono, fontSize: '1.6rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
      {value}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function Demo() {
  const [phase, setPhase] = useState<Phase>('idle');
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
  const [storyStage, setStoryStage] = useState<StoryStage>('agent-a-working');
  const [timings, setTimings] = useState<TimingEntry[]>([]);
  const [centerLog, setCenterLog] = useState<CenterLogEntry[]>([]);
  const [showHandoffAnimation, setShowHandoffAnimation] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [showShake, setShowShake] = useState(false);
  const [displayedTrustScore, setDisplayedTrustScore] = useState<number | null>(null);
  const [peers, setPeers] = useState<string[]>([]);
  const [totalReceiptsGenerated, setTotalReceiptsGenerated] = useState(0);
  const [verificationsPassedCount, setVerificationsPassedCount] = useState(0);

  const agentARef = useRef<HTMLDivElement>(null);
  const agentBRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const eventIndexRef = useRef(0);
  const lastEventTimeRef = useRef(0);

  useEffect(() => {
    agentARef.current?.scrollTo({ top: agentARef.current.scrollHeight, behavior: 'smooth' });
  }, [receipts, agentACount]);

  useEffect(() => {
    agentBRef.current?.scrollTo({ top: agentBRef.current.scrollHeight, behavior: 'smooth' });
  }, [receipts, verifications]);

  useEffect(() => {
    centerRef.current?.scrollTo({ top: centerRef.current.scrollHeight, behavior: 'smooth' });
  }, [centerLog, verifications]);

  const agentAReceipts = receipts.slice(0, agentACount || receipts.length);
  const agentBReceipts = agentACount > 0 ? receipts.slice(agentACount) : [];

  const addCenterLog = useCallback((text: string, type: CenterLogEntry['type']) => {
    setCenterLog(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      type,
      timestamp: Date.now(),
    }]);
  }, []);

  const addTiming = useCallback((label: string, ms: number) => {
    setTimings(prev => [...prev, {
      label,
      ms,
      eventIndex: eventIndexRef.current,
    }]);
  }, []);

  const handleEvent = useCallback((event: string, data: any) => {
    const now = performance.now();
    const elapsed = lastEventTimeRef.current > 0 ? now - lastEventTimeRef.current : 0;
    lastEventTimeRef.current = now;
    eventIndexRef.current += 1;

    switch (event) {
      case 'receipt': {
        setReceipts(prev => [...prev, data.receipt]);
        setReceiptMeta(prev => ({
          ...prev,
          [data.receipt.id]: {
            llmSource: data.llmSource, teeAttested: data.teeAttested,
            agent: data.agent, rawInput: data.rawInput, rawOutput: data.rawOutput,
          },
        }));
        setTotalReceiptsGenerated(prev => prev + 1);
        const actionType = data.receipt.action.type;
        const actionLabel = ACTION_LABELS[actionType] || actionType;
        if (data.agent === 'A') {
          setStoryStage('agent-a-working');
          if (actionType === 'llm_call') {
            addTiming(`0G Inference`, Math.round(elapsed));
          } else {
            addTiming(`${actionLabel}`, Math.round(elapsed));
          }
        } else {
          setStoryStage('agent-b-working');
          addTiming(`B: ${actionLabel}`, Math.round(elapsed));
        }
        break;
      }
      case 'tampered':
        setTamperedIds(prev => {
          const next = new Set(prev);
          setReceipts(receipts => {
            if (receipts[data.index]) next.add(receipts[data.index].id);
            return receipts;
          });
          return next;
        });
        addCenterLog('Receipt tampered by Agent A', 'fail');
        break;
      case 'verified': {
        setVerifications(prev => [...prev, data.result]);
        setStoryStage('agent-b-verifying');
        if (data.result.valid) {
          setVerificationsPassedCount(prev => prev + 1);
          addCenterLog(`Receipt #${data.result.receiptId.slice(0, 8)} -- PASS`, 'pass');
        } else {
          addCenterLog(`Receipt #${data.result.receiptId.slice(0, 8)} -- FAIL`, 'fail');
          setTamperedIds(prev => { const next = new Set(prev); next.add(data.result.receiptId); return next; });
        }
        addTiming('Verify receipt', Math.round(elapsed));
        break;
      }
      case 'fabrication_detected':
        setFabricationDetected(true);
        setStoryStage('agent-b-rejected');
        setShowFlash(true);
        setShowShake(true);
        setTimeout(() => setShowFlash(false), 2000);
        setTimeout(() => setShowShake(false), 800);
        addCenterLog('FABRICATION DETECTED', 'fail');
        addTiming('Detection', Math.round(elapsed));
        break;
      case 'verification_complete':
        if (data.valid) {
          addCenterLog('All receipts verified', 'pass');
        }
        break;
      case 'axl_handoff':
        setStoryStage('axl-handoff');
        setShowHandoffAnimation(true);
        setTimeout(() => setShowHandoffAnimation(false), 2000);
        addCenterLog(`AXL handoff: ${data.receiptCount} receipts`, 'handoff');
        addTiming('AXL handoff', Math.round(elapsed));
        break;
      case 'axl_received':
        addCenterLog(`AXL received by Agent B`, 'handoff');
        addTiming('AXL received', Math.round(elapsed));
        break;
      case 'mcp_tool_call':
        addCenterLog(`Agent B -> verify_chain via MCP`, 'mcp');
        addTiming('MCP call', Math.round(elapsed));
        break;
      case 'peer_discovery':
        if (data.peers) {
          setPeers(data.peers);
          addCenterLog(`Discovered ${data.peers.length} peers`, 'info');
        }
        break;
      case 'agent_card':
        addCenterLog(`Agent card: ${data.name || data.agentName || 'peer'} discovered`, 'agent-card');
        break;
      case 'axl_rebroadcast':
        addCenterLog(`Re-broadcast: ${data.receiptCount || '?'} receipts`, 'rebroadcast');
        addTiming('AXL rebroadcast', Math.round(elapsed));
        break;
      case 'axl_adopt':
        addCenterLog(`Agent A adopted extended chain`, 'adopt');
        addTiming('AXL adopt', Math.round(elapsed));
        break;
      case 'tee_verified': {
        const provider = data.provider || 'TeeML';
        const method = data.verificationMethod || 'Intel TDX';
        addCenterLog(`TEE verified: ${provider} (${method})`, 'tee');
        addTiming('TEE verify', Math.round(elapsed));
        break;
      }
      case 'done':
        setAgentACount(data.agentACount);
        if (data.rootHash) setChainRootHash(data.rootHash);
        if (data.fabricated) {
          setFabricationDetected(true);
          setStoryStage('agent-b-rejected');
        } else {
          setStoryStage('complete');
        }
        break;
      case 'trust_score':
        setTrustScore(data.score);
        setDisplayedTrustScore(data.score);
        addTiming('Trust score', Math.round(elapsed));
        break;
      case 'storage':
        setStoryStage('anchoring');
        addCenterLog('Stored on 0G Storage', 'anchor');
        addTiming('0G Anchor', Math.round(elapsed));
        break;
    }
  }, [addCenterLog, addTiming]);

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
    setDisplayedTrustScore(null);
    setStoryStage('agent-a-working');
    setTimings([]);
    setCenterLog([]);
    setShowHandoffAnimation(false);
    setShowFlash(false);
    setShowShake(false);
    setPeers([]);
    setTotalReceiptsGenerated(0);
    setVerificationsPassedCount(0);
    eventIndexRef.current = 0;
    lastEventTimeRef.current = 0;
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
    } catch { /* SSE fetch failed */ }

    // Replay events with delays for demo effect
    lastEventTimeRef.current = performance.now();
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

  /* ---------------------------------------------------------------- */
  /*  Render: Receipt Card                                             */
  /* ---------------------------------------------------------------- */

  const renderReceipt = (receipt: Receipt, index: number) => {
    const meta = receiptMeta[receipt.id];
    const isTampered = tamperedIds.has(receipt.id);
    const timing = timings.find(t => t.eventIndex === index + 1);

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
          <div style={{ padding: '0.35rem 0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ textAlign: 'center', ...mono, fontSize: '0.6rem', fontWeight: 700, flex: 1 }}>
              {isTampered ? (
                <span className="stamp" style={{ color: 'var(--red)', letterSpacing: '0.1em' }}>TAMPERED</span>
              ) : (
                <span style={{ color: 'var(--text-dim)', letterSpacing: '0.05em' }}>SIGNED</span>
              )}
            </div>
            {timing && (
              <span style={{
                ...mono, fontSize: '0.5rem', color: 'var(--text-dim)',
                background: 'var(--bg)', padding: '0.1rem 0.3rem', borderRadius: '3px',
                border: '1px solid var(--border)',
              }}>
                {(timing.ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Render: Story Step (for Agent A panel)                           */
  /* ---------------------------------------------------------------- */

  const renderStoryStep = (receipt: Receipt, index: number) => {
    const meta = receiptMeta[receipt.id];
    const actionType = receipt.action.type;
    const stepNum = index + 1;
    const stepDescription = STEP_DESCRIPTIONS[actionType] || receipt.action.description;
    const isAgent = meta?.agent || 'A';

    return (
      <div key={receipt.id} className="slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: isAgent === 'A' ? 'flex-start' : 'flex-end' }}>
        {/* Step label */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          marginBottom: '0.1rem',
        }}>
          <div style={{
            ...mono, fontSize: '0.55rem', fontWeight: 700,
            color: '#fff',
            background: isAgent === 'A' ? 'var(--agent-a)' : 'var(--agent-b)',
            padding: '0.1rem 0.4rem', borderRadius: '10px',
            lineHeight: 1.4,
          }}>
            Step {stepNum}
          </div>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            {stepDescription}
          </span>
        </div>
        <div className={`chat-bubble ${isAgent === 'A' ? 'left' : 'right'}`} style={{ fontSize: '0.72rem' }}>
          <span style={{ fontWeight: 500 }}>{receipt.action.description}</span>
        </div>
        {renderReceipt(receipt, index)}
      </div>
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Render: Idle State                                               */
  /* ---------------------------------------------------------------- */

  const renderIdleState = () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: '600px' }}>
        <div style={{ ...mono, fontSize: '2rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
          R.E.C.E.I.P.T.
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginBottom: '1.5rem', ...mono }}>
          Recorded Execution Chains & Integrity Proofs for Trustworthy agents
        </p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '2rem' }}>
          Watch two AI agents work together with cryptographic proof. Every action produces a
          signed receipt. Agent B independently verifies Agent A's chain before accepting the handoff.
        </p>

        {/* Prominent adversarial toggle */}
        <div style={{
          background: adversarial ? '#fef2f2' : 'var(--surface)',
          border: `2px solid ${adversarial ? 'var(--red)' : 'var(--border)'}`,
          borderRadius: '12px', padding: '1.5rem 2rem',
          marginBottom: '2rem',
          transition: 'all 0.3s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '0.8rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: !adversarial ? 'var(--green)' : 'var(--text-dim)' }}>
              Honest
            </span>
            {/* Toggle switch */}
            <button
              onClick={() => setAdversarial(!adversarial)}
              style={{
                position: 'relative', width: '60px', height: '32px',
                borderRadius: '16px', border: 'none', cursor: 'pointer',
                background: adversarial ? 'var(--red)' : 'var(--green)',
                transition: 'background 0.3s ease',
                flexShrink: 0,
              }}
              aria-label={adversarial ? 'Switch to honest mode' : 'Switch to adversarial mode'}
            >
              <div style={{
                position: 'absolute', top: '3px',
                left: adversarial ? '31px' : '3px',
                width: '26px', height: '26px',
                borderRadius: '50%', background: '#fff',
                transition: 'left 0.3s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: adversarial ? 'var(--red)' : 'var(--text-dim)' }}>
              Adversarial
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: adversarial ? '#991b1b' : 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
            {adversarial
              ? 'Agent A will lie. It will modify the API response after signing. Watch Agent B catch it.'
              : 'Both agents work truthfully. Every receipt verifies cleanly.'}
          </p>
        </div>

        {/* Story flow preview */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
          flexWrap: 'wrap', marginBottom: '2rem',
        }}>
          {['Agent A works', 'AXL handoff', 'Agent B verifies', adversarial ? 'Rejected' : 'Agent B works', '0G anchor'].map((step, i) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <div style={{
                ...mono, fontSize: '0.62rem', padding: '0.3rem 0.6rem',
                borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', fontWeight: 500,
              }}>
                {step}
              </div>
              {i < 4 && <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>&#8594;</span>}
            </div>
          ))}
        </div>

        <button onClick={run} style={{
          padding: '0.8rem 2.5rem', borderRadius: '8px', border: 'none',
          background: adversarial ? 'var(--red)' : 'var(--text)',
          color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
          fontSize: '1rem', fontWeight: 600, transition: 'all 0.2s ease',
        }}>
          {adversarial ? 'Start Adversarial Demo' : 'Start Demo'}
        </button>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Center Panel                                             */
  /* ---------------------------------------------------------------- */

  const renderCenterPanel = () => (
    <div style={{
      width: '240px', display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
      flexShrink: 0, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.6rem 0.8rem', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}>
        <div style={{ ...mono, fontSize: '0.62rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.04em', textAlign: 'center' }}>
          CHAIN STATUS
        </div>
      </div>

      {/* Handoff indicator */}
      {showHandoffAnimation && (
        <div style={{
          padding: '0.6rem', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          background: '#f0f4ff',
        }}>
          <div style={{
            width: '24px', height: '24px', borderRadius: '50%',
            background: 'var(--agent-a)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#fff', fontSize: '0.55rem', fontWeight: 700,
          }}>A</div>
          <div style={{
            flex: 1, height: '2px', background: 'var(--border)', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: '-3px', width: '8px', height: '8px',
              borderRadius: '50%', background: 'var(--agent-a)',
              animation: 'axl-packet-traverse 1.5s ease-in-out infinite',
            }} />
          </div>
          <div style={{
            width: '24px', height: '24px', borderRadius: '50%',
            background: 'var(--agent-b)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#fff', fontSize: '0.55rem', fontWeight: 700,
          }}>B</div>
        </div>
      )}

      {/* Scrollable log */}
      <div ref={centerRef} style={{
        flex: 1, overflowY: 'auto', padding: '0.5rem',
        display: 'flex', flexDirection: 'column', gap: '0.25rem',
      }}>
        {/* Verification checklist */}
        {verifications.length > 0 && (
          <div style={{ marginBottom: '0.3rem' }}>
            <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--agent-b)', fontWeight: 700, marginBottom: '0.3rem', letterSpacing: '0.04em' }}>
              VERIFICATION
            </div>
            {verifications.map((v, i) => (
              <div key={i} className="slide-up" style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.2rem 0.35rem', borderRadius: '4px',
                background: v.valid ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${v.valid ? '#bbf7d0' : '#fecaca'}`,
                fontSize: '0.58rem', marginBottom: '0.15rem',
              }}>
                <span style={{
                  ...mono, fontWeight: 700, fontSize: '0.55rem',
                  color: v.valid ? 'var(--green)' : 'var(--red)',
                  minWidth: '28px',
                }}>
                  {v.valid ? 'PASS' : 'FAIL'}
                </span>
                <span style={{ color: 'var(--text-muted)', ...mono, fontSize: '0.5rem' }}>
                  {v.receiptId.slice(0, 8)}...
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.15rem' }}>
                  <span title="Signature" style={{ fontSize: '0.5rem', color: v.checks.signatureValid ? 'var(--green)' : 'var(--red)' }}>sig</span>
                  <span title="Chain link" style={{ fontSize: '0.5rem', color: v.checks.chainLinkValid ? 'var(--green)' : 'var(--red)' }}>lnk</span>
                  <span title="Timestamp" style={{ fontSize: '0.5rem', color: v.checks.timestampValid ? 'var(--green)' : 'var(--red)' }}>ts</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Center log entries */}
        {centerLog.map(entry => (
          <div key={entry.id} className="slide-up" style={{
            ...mono, fontSize: '0.52rem', padding: '0.2rem 0.3rem',
            borderRadius: '3px', lineHeight: 1.4,
            color: entry.type === 'fail' ? 'var(--red)'
              : entry.type === 'pass' ? 'var(--green)'
              : entry.type === 'handoff' ? 'var(--agent-b)'
              : entry.type === 'mcp' ? 'var(--agent-b)'
              : entry.type === 'anchor' ? 'var(--amber)'
              : entry.type === 'tee' ? 'var(--green)'
              : entry.type === 'rebroadcast' ? 'var(--agent-b)'
              : entry.type === 'adopt' ? 'var(--agent-a)'
              : entry.type === 'agent-card' ? 'var(--agent-a)'
              : 'var(--text-muted)',
            background: entry.type === 'fail' ? '#fef2f2'
              : entry.type === 'handoff' ? '#f5f3ff'
              : entry.type === 'tee' ? '#f0fdf4'
              : entry.type === 'rebroadcast' ? '#f5f3ff'
              : entry.type === 'adopt' ? '#eff6ff'
              : entry.type === 'agent-card' ? '#eff6ff'
              : 'transparent',
          }}>
            {entry.text}
          </div>
        ))}

        {/* Peers */}
        {peers.length > 0 && (
          <div style={{ marginTop: '0.3rem' }}>
            <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '0.2rem' }}>
              PEERS
            </div>
            {peers.map((p, i) => (
              <div key={i} style={{ ...mono, fontSize: '0.48rem', color: 'var(--text-muted)' }}>
                {p}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom status area */}
      <div style={{ padding: '0.5rem 0.8rem', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
        {/* Fabrication rejection */}
        {fabricationDetected && (
          <div className="slide-up" style={{
            padding: '0.5rem', borderRadius: '6px',
            background: '#fef2f2', border: '2px solid var(--red)',
            textAlign: 'center', marginBottom: '0.4rem',
          }}>
            <div style={{ ...mono, fontSize: '0.8rem', color: 'var(--red)', fontWeight: 800, letterSpacing: '0.08em' }}>
              REJECTED
            </div>
            <div style={{ fontSize: '0.58rem', color: '#991b1b', marginTop: '0.15rem' }}>
              Chain integrity broken
            </div>
          </div>
        )}

        {/* Chain verified */}
        {phase === 'done' && !fabricationDetected && (
          <div className="slide-up" style={{ textAlign: 'center', marginBottom: '0.4rem' }}>
            <div style={{ ...mono, fontSize: '0.72rem', color: 'var(--green)', fontWeight: 700 }}>
              CHAIN VERIFIED
            </div>
          </div>
        )}

        {/* Root hash */}
        {chainRootHash && (
          <div style={{
            ...mono, fontSize: '0.48rem', color: 'var(--text-dim)',
            textAlign: 'center', wordBreak: 'break-all',
            padding: '0.3rem', background: 'var(--surface)',
            borderRadius: '4px', border: '1px solid var(--border)',
            marginBottom: '0.4rem',
          }}>
            <div style={{ fontSize: '0.45rem', fontWeight: 600, marginBottom: '0.15rem', color: 'var(--text-muted)' }}>
              ROOT HASH
            </div>
            {chainRootHash.slice(0, 32)}...
          </div>
        )}

        {/* Trust score */}
        {displayedTrustScore !== null && (
          <div style={{
            padding: '0.5rem', borderRadius: '6px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            textAlign: 'center',
          }}>
            <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.15rem' }}>
              Trust Score
            </div>
            <AnimatedCounter
              target={displayedTrustScore}
              color={displayedTrustScore >= 80 ? 'var(--green)' : displayedTrustScore >= 50 ? 'var(--amber)' : 'var(--red)'}
            />
          </div>
        )}
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Agent A Panel                                            */
  /* ---------------------------------------------------------------- */

  const agentAActive = phase === 'running' && (storyStage === 'agent-a-working');
  const agentABorderStyle = agentAActive
    ? '3px solid var(--agent-a)'
    : '1px solid var(--border)';

  const renderAgentAPanel = () => (
    <div style={{
      display: 'flex', flexDirection: 'column',
      borderRight: agentABorderStyle,
      transition: 'border 0.3s ease',
      boxShadow: agentAActive ? 'inset 3px 0 12px -4px rgba(37, 99, 235, 0.15)' : 'none',
    }}>
      <div style={{
        padding: '0.6rem 1rem', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0,
      }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%', background: 'var(--agent-a)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: '0.65rem',
          boxShadow: agentAActive ? '0 0 0 3px rgba(37, 99, 235, 0.25)' : 'none',
          transition: 'box-shadow 0.3s ease',
        }}>A</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Agent A <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', fontWeight: 400 }}>Researcher</span></div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>
            {agentAReceipts.length > 0 && agentACount > 0 ? (
              <span style={{ color: 'var(--green)' }}>finished -- {agentAReceipts.length} receipts</span>
            ) : agentAReceipts.length > 0 ? (
              <span className="typing-indicator" style={{ color: 'var(--agent-a)' }}>working</span>
            ) : 'waiting'}
          </div>
        </div>
        {adversarial && phase === 'running' && (
          <div style={{
            ...mono, fontSize: '0.5rem', padding: '0.15rem 0.4rem',
            borderRadius: '4px', background: '#fef2f2', color: 'var(--red)',
            fontWeight: 600, border: '1px solid #fecaca',
          }}>
            ADVERSARIAL
          </div>
        )}
      </div>
      <div ref={agentARef} style={{
        flex: 1, overflowY: 'auto', padding: '0.8rem',
        display: 'flex', flexDirection: 'column', gap: '0.8rem',
        alignItems: 'flex-start', background: 'var(--bg)',
      }}>
        {agentAReceipts.map((r, i) => renderStoryStep(r, i))}
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Agent B Panel                                            */
  /* ---------------------------------------------------------------- */

  const agentBActive = phase === 'running' && (storyStage === 'agent-b-working' || storyStage === 'agent-b-verifying');

  const renderAgentBPanel = () => (
    <div style={{
      display: 'flex', flexDirection: 'column',
      borderLeft: agentBActive ? '3px solid var(--agent-b)' : '1px solid transparent',
      transition: 'border 0.3s ease',
      boxShadow: agentBActive ? 'inset -3px 0 12px -4px rgba(124, 58, 237, 0.15)' : 'none',
    }}>
      <div style={{
        padding: '0.6rem 1rem', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0,
      }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%', background: 'var(--agent-b)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: '0.65rem',
          boxShadow: agentBActive ? '0 0 0 3px rgba(124, 58, 237, 0.25)' : 'none',
          transition: 'box-shadow 0.3s ease',
        }}>B</div>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Agent B <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', fontWeight: 400 }}>Builder</span></div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>
            {fabricationDetected ? (
              <span style={{ color: 'var(--red)', fontWeight: 600 }}>rejected handoff</span>
            ) : agentBReceipts.length > 0 ? (
              phase === 'done' ? (
                <span style={{ color: 'var(--green)' }}>finished -- {agentBReceipts.length} receipts</span>
              ) : (
                <span className="typing-indicator" style={{ color: 'var(--agent-b)' }}>working</span>
              )
            ) : verifications.length > 0 ? (
              <span className="typing-indicator" style={{ color: 'var(--agent-b)' }}>verifying chain...</span>
            ) : 'waiting for handoff'}
          </div>
        </div>
      </div>
      <div ref={agentBRef} style={{
        flex: 1, overflowY: 'auto', padding: '0.8rem',
        display: 'flex', flexDirection: 'column', gap: '0.8rem',
        alignItems: 'flex-end', background: 'var(--bg)',
      }}>
        {fabricationDetected && agentBReceipts.length === 0 && (
          <div className="slide-up" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: '0.8rem', textAlign: 'center',
            width: '100%',
          }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: '#fef2f2', border: '3px solid var(--red)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '2rem', color: 'var(--red)', fontWeight: 800, lineHeight: 1 }}>X</span>
            </div>
            <div style={{ color: 'var(--red)', fontSize: '1rem', fontWeight: 700 }}>Handoff Rejected</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', maxWidth: '260px', lineHeight: 1.6 }}>
              Agent A's receipt chain contains fabricated data.
              The ed25519 signature does not match the tampered output hash.
              Agent B refuses to continue.
            </div>
            <div style={{
              ...mono, fontSize: '0.6rem', color: '#991b1b',
              padding: '0.4rem 0.8rem', borderRadius: '6px',
              background: '#fef2f2', border: '1px solid #fecaca',
              marginTop: '0.3rem',
            }}>
              Zero trust = zero damage
            </div>
          </div>
        )}
        {agentBReceipts.map((r, i) => renderStoryStep(r, agentACount + i))}
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Bottom Summary Bar                                       */
  /* ---------------------------------------------------------------- */

  const renderBottomSummary = () => {
    if (phase !== 'done') {
      return (
        <div style={{
          padding: '0.3rem 1.5rem', borderTop: '1px solid var(--border)',
          background: 'var(--surface)', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-dim)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: '0.8rem' }}>
            {['ed25519 signatures', 'SHA-256 hash chains', 'TEE attestation', '0G integration'].map(tag => (
              <span key={tag} style={{ ...mono, fontSize: '0.55rem' }}>{tag}</span>
            ))}
          </div>
          <a href="/" style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textDecoration: 'none', borderBottom: '1px dashed var(--border-dashed)' }}>
            Dashboard
          </a>
        </div>
      );
    }

    const passedCount = verificationsPassedCount;
    const totalVerifications = verifications.length;

    return (
      <div style={{
        padding: '0.6rem 1.5rem', borderTop: '2px solid var(--border)',
        background: fabricationDetected ? '#fef2f2' : 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, transition: 'background 0.3s ease',
      }}>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          {/* Receipts count */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ ...mono, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
              {totalReceiptsGenerated}
            </div>
            <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Receipts
            </div>
          </div>

          <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />

          {/* Trust score */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              ...mono, fontSize: '1.1rem', fontWeight: 700,
              color: trustScore !== null
                ? (trustScore >= 80 ? 'var(--green)' : trustScore >= 50 ? 'var(--amber)' : 'var(--red)')
                : 'var(--text-dim)',
            }}>
              {trustScore !== null ? trustScore : '--'}
            </div>
            <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Trust
            </div>
          </div>

          <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />

          {/* Verifications */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              ...mono, fontSize: '1.1rem', fontWeight: 700,
              color: passedCount === totalVerifications ? 'var(--green)' : 'var(--red)',
            }}>
              {passedCount}/{totalVerifications}
            </div>
            <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Verified
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)', textAlign: 'right', lineHeight: 1.5 }}>
            Powered by <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>0G Compute</span> + <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Gensyn AXL</span>
          </div>
          <button onClick={run} style={{
            padding: '0.35rem 0.8rem', borderRadius: '6px', border: 'none',
            background: adversarial ? 'var(--red)' : 'var(--text)',
            color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.72rem', fontWeight: 600,
          }}>
            Run Again
          </button>
        </div>
      </div>
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Main Render                                                      */
  /* ---------------------------------------------------------------- */

  return (
    <div
      className={showShake ? 'screen-shake' : ''}
      style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        background: adversarial && phase === 'running' ? '#faf5f5' : 'var(--bg)',
        transition: 'background 0.5s ease',
        position: 'relative',
      }}
    >
      {/* Flash overlay for fabrication detection */}
      {showFlash && (
        <div className="flash-overlay" style={{
          position: 'fixed', inset: 0,
          background: 'rgba(220, 38, 38, 0.3)',
          pointerEvents: 'none', zIndex: 100,
        }} />
      )}

      {/* Header */}
      <header style={{
        padding: '0.7rem 1.5rem', borderBottom: '1px solid var(--border)',
        background: adversarial && phase === 'running' ? '#fef8f8' : 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, transition: 'background 0.3s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <a href="/" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textDecoration: 'none' }}>
            Dashboard
          </a>
          <a href="/demo/axl" style={{ fontSize: '0.72rem', color: 'var(--agent-a)', textDecoration: 'none', fontWeight: 500 }}>
            AXL Network Demo
          </a>
          <div>
            <h1 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>Live Demo</h1>
            <p style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>
              {phase === 'idle' ? 'Choose a mode and start the demo' :
                phase === 'running' ? `Running ${adversarial ? '(adversarial)' : '(honest)'} -- watching agents generate receipts` :
                  fabricationDetected ? 'Complete -- fabrication detected and rejected' :
                    'Complete -- all receipts verified'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          {/* Inline adversarial toggle for header (during run) */}
          {phase !== 'idle' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.3rem 0.6rem', borderRadius: '6px',
              background: adversarial ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${adversarial ? '#fecaca' : '#bbf7d0'}`,
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: adversarial ? 'var(--red)' : 'var(--green)',
              }} />
              <span style={{
                ...mono, fontSize: '0.6rem', fontWeight: 600,
                color: adversarial ? 'var(--red)' : 'var(--green)',
              }}>
                {adversarial ? 'ADVERSARIAL' : 'HONEST'}
              </span>
            </div>
          )}
          {phase !== 'idle' && phase !== 'done' && (
            <button disabled style={{
              padding: '0.4rem 0.9rem', borderRadius: '6px', border: 'none',
              background: 'var(--border)', color: '#fff',
              cursor: 'not-allowed', fontFamily: 'inherit',
              fontSize: '0.78rem', fontWeight: 600,
            }}>
              Running...
            </button>
          )}
        </div>
      </header>

      {/* Narrator Bar */}
      {narrative && phase !== 'idle' && (
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
            maxWidth: '900px',
          }}>
            {narrative}
          </div>
          {/* Story stage indicator */}
          {phase === 'running' && (
            <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem' }}>
              {(['agent-a-working', 'axl-handoff', 'agent-b-verifying', adversarial ? 'agent-b-rejected' : 'agent-b-working', 'anchoring'] as StoryStage[]).map((stage, i) => {
                const labels = ['A works', 'Handoff', 'B verifies', adversarial ? 'Rejected' : 'B works', 'Anchor'];
                const stageOrder: StoryStage[] = ['agent-a-working', 'axl-handoff', 'agent-b-verifying', adversarial ? 'agent-b-rejected' : 'agent-b-working', 'anchoring'];
                const currentIdx = stageOrder.indexOf(storyStage);
                const isActive = stage === storyStage;
                const isPast = i < currentIdx;
                return (
                  <div key={stage} style={{
                    ...mono, fontSize: '0.52rem', padding: '0.15rem 0.4rem',
                    borderRadius: '4px',
                    background: isActive ? (stage === 'agent-b-rejected' ? '#fef2f2' : '#f0f4ff') :
                      isPast ? 'var(--surface)' : 'transparent',
                    border: isActive ? `1px solid ${stage === 'agent-b-rejected' ? 'var(--red)' : 'var(--agent-a)'}` :
                      isPast ? '1px solid var(--border)' : '1px solid transparent',
                    color: isActive ? (stage === 'agent-b-rejected' ? 'var(--red)' : 'var(--agent-a)') :
                      isPast ? 'var(--green)' : 'var(--text-dim)',
                    fontWeight: isActive ? 700 : 400,
                    transition: 'all 0.3s ease',
                  }}>
                    {isPast ? '✓ ' : ''}{labels[i]}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Idle State */}
      {phase === 'idle' && renderIdleState()}

      {/* Running / Done -- Dual Panels */}
      {phase !== 'idle' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', flex: 1, overflow: 'hidden' }}>
          {renderAgentAPanel()}
          {renderCenterPanel()}
          {renderAgentBPanel()}
        </div>
      )}

      {/* Bottom bar */}
      {renderBottomSummary()}
    </div>
  );
}
